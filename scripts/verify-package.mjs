#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { platform, release } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createRunId, gitSource, printChecks, readJson, summarizeStatus, writeJson } from './_shared.mjs'

const HELP = `Usage: verify-package.mjs [--project <dir>] [--result <file>] [--provenance <file>] [--allow-unbuilt]\n
If either evidence path is supplied, the missing sibling defaults to result.json or provenance.json in the same directory.\n`
const startedAt = new Date().toISOString()
const { values } = parseArgs({
  options: {
    project: { type: 'string', default: '.' },
    result: { type: 'string' },
    provenance: { type: 'string' },
    'allow-unbuilt': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})
if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}

const project = resolve(values.project)
const resultPath = values.result
  ? resolve(values.result)
  : values.provenance ? join(dirname(resolve(values.provenance)), 'result.json') : null
const provenancePath = values.provenance
  ? resolve(values.provenance)
  : values.result ? join(dirname(resolve(values.result)), 'provenance.json') : null
if (resultPath !== null && resultPath === provenancePath) {
  process.stderr.write('verify-package: result and provenance paths must be distinct\n')
  process.exit(1)
}
const checks = []
let manifest = null
const add = (id, status, summary, required = true, evidence = []) => checks.push({ id, required, status, summary, evidence })

try {
  manifest = readJson(join(project, 'package.json'))
  add('manifest-json', 'pass', 'package.json is valid JSON.')
} catch (error) {
  add('manifest-json', 'fail', `Cannot read package.json: ${error.message}`)
}

if (manifest !== null) {
  add('package-name', typeof manifest.name === 'string' && manifest.name.length > 0 ? 'pass' : 'fail', 'Package has a non-empty name.')
  add('esm-package', manifest.type === 'module' ? 'pass' : 'fail', 'Package type is module.')

  const main = targetOf(manifest.exports?.['.']) ?? manifest.main
  const types = typeTargetOf(manifest.exports?.['.']) ?? manifest.types
  verifyTarget('host-entry', main, values['allow-unbuilt'])
  verifyTarget('host-types', types, values['allow-unbuilt'])

  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string') {
    add('bundle-patch', 'fail', 'dsh.bundle.patch is missing.')
  } else {
    const patchPath = resolve(project, patch)
    if (!inside(project, patchPath) || !existsSync(patchPath)) {
      add('bundle-patch', 'fail', 'Bundle patch is missing or escapes the project.')
    } else {
      const text = readFileSync(patchPath, 'utf8')
      const looksLikeList = /^\s*-\s+(?:insert:|id:)/m.test(text)
      const namesPackage = text.includes(manifest.name)
      add('bundle-patch', looksLikeList && namesPackage ? 'pass' : 'fail', looksLikeList && namesPackage
        ? 'Bundle patch is a list and references this package.'
        : 'Bundle patch must be a YAML list that references this package.')
      verifyFilesCoverage('bundle-patch-files', patch)
    }
  }

  const clientExport = manifest.exports?.['./client']
  const clientDeclaration = manifest.dsh?.client
  if ((clientExport === undefined) !== (clientDeclaration === undefined)) {
    add('client-pair', 'fail', 'exports["./client"] and dsh.client must be declared together.')
  } else if (clientDeclaration !== undefined) {
    const declarationOk = clientDeclaration !== null && typeof clientDeclaration === 'object' && !Array.isArray(clientDeclaration)
    add('client-pair', declarationOk ? 'pass' : 'fail', declarationOk
      ? 'Browser export and dsh.client object are both declared.'
      : 'dsh.client must be an object when exports["./client"] is declared.')
    if (declarationOk) {
      add('client-platform', clientDeclaration.platform === 'web' ? 'pass' : 'fail', 'dsh.client.platform is web.')
      const injectOk = clientDeclaration.inject === undefined
        || (Array.isArray(clientDeclaration.inject) && clientDeclaration.inject.every(item => typeof item === 'string'))
      add('client-inject', injectOk ? 'pass' : 'fail', injectOk
        ? 'dsh.client.inject is absent or a string array.'
        : 'dsh.client.inject must be absent or a string array.')
    }
    const client = targetOf(clientExport)
    verifyTarget('client-entry', client, values['allow-unbuilt'])
  } else {
    add('client-pair', 'pass', 'Host-only package does not declare a Browser half.')
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    add('published-files', 'fail', 'files must explicitly list publishable artifacts.')
  } else {
    add('published-files', 'pass', 'files explicitly limits published artifacts.')
    for (const target of [main, types, targetOf(clientExport)].filter(Boolean)) verifyFilesCoverage(`files:${target}`, target)
  }

  const serialized = JSON.stringify(manifest)
  const machinePath = /(?:\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\Users\\[^\\]+\\)/.test(serialized)
  add('portable-manifest', machinePath ? 'fail' : 'pass', machinePath ? 'package.json contains a machine-specific absolute path.' : 'package.json has no common machine-specific path.')
}

const source = await gitSource(project)
const runId = createRunId()
if (checks[0]) {
  checks[0].command = [
    'node',
    'verify-package.mjs',
    '--project',
    '<project>',
    ...(values['allow-unbuilt'] ? ['--allow-unbuilt'] : []),
  ]
}
const result = {
  schemaVersion: '1.0',
  kind: 'package-verification',
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  status: summarizeStatus(checks),
  subject: { plugin: manifest?.name ?? null, project: basename(project), commit: source.commit },
  checks,
  cleanup: { status: 'not-needed', resourcesManifest: null, notes: [] },
  risks: values['allow-unbuilt'] ? ['Build artifacts were allowed to be absent.'] : [],
}
const provenance = {
  schemaVersion: '1.0',
  runId,
  generatedAt: new Date().toISOString(),
  source: { commit: source.commit, dirty: source.dirty, packageChecksum: null },
  runtime: {
    dsh: null,
    cordis: null,
    pluginCordisPeer: manifest?.peerDependencies?.['@deepseek-ai/cordis'] ?? null,
    dshExecutable: null,
    node: process.version,
    os: `${platform()} ${release()}`,
  },
  claim: {
    execution: 'real',
    scope: ['local static manifest, build-entry, bundle-patch, and published-files inspection'],
    notProven: ['Cordis activation', 'tarball contents', 'stock DSH installation or runtime behavior'],
  },
  media: null,
  exceptions: ['DSH and Cordis runtime versions were not exercised by this static verifier.'],
  sensitiveReview: { status: 'not-run', scannerResult: null },
}
if (resultPath !== null) {
  writeJson(resultPath, result)
  writeJson(provenancePath, provenance)
}
printChecks(checks)
process.stdout.write(`verify-package: ${result.status}\n`)
process.exit(result.status === 'pass' ? 0 : 1)

function verifyTarget(id, target, allowUnbuilt) {
  if (typeof target !== 'string') {
    add(id, 'fail', 'Manifest target is missing.')
    return
  }
  const path = resolve(project, target)
  if (!inside(project, path)) {
    add(id, 'fail', `Target escapes project: ${target}`)
    return
  }
  if (!existsSync(path)) {
    if (allowUnbuilt) add(id, 'skip', `Target is not built yet: ${target}`)
    else add(id, 'fail', `Target does not exist: ${target}`)
    return
  }
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    add(id, 'fail', `Target must be a regular file, not a directory or symlink: ${target}`)
    return
  }
  add(id, 'pass', `Target is a regular file: ${target}`)
}

function verifyFilesCoverage(id, target) {
  const normalized = String(target).replace(/^\.\//, '')
  const covered = Array.isArray(manifest.files) && manifest.files.some(pattern => globMatches(pattern, normalized))
  add(id, covered ? 'pass' : 'fail', covered ? `${target} is covered by files.` : `${target} is not covered by files.`)
}

function targetOf(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    for (const condition of ['import', 'default', 'node']) {
      if (typeof value[condition] === 'string') return value[condition]
    }
  }
  return undefined
}

function typeTargetOf(value) {
  return value && typeof value === 'object' && typeof value.types === 'string' ? value.types : undefined
}

function inside(root, path) {
  const rel = relative(root, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function globMatches(pattern, target) {
  const normalized = String(pattern).replace(/^\.\//, '').replaceAll('\\', '/')
  const literalDirectory = normalized.replace(/\/$/, '')
  if (!literalDirectory.includes('*') && target.startsWith(`${literalDirectory}/`)) return true
  let source = '^'
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index]
    if (character === '*' && normalized[index + 1] === '*' && normalized[index + 2] === '/') {
      source += '(?:.*/)?'
      index += 2
    } else if (character === '*' && normalized[index + 1] === '*') {
      source += '.*'
      index += 1
    } else if (character === '*') {
      source += '[^/]*'
    } else {
      source += /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character
    }
  }
  return new RegExp(`${source}$`).test(target.replaceAll('\\', '/'))
}
