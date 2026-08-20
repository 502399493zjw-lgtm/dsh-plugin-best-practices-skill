#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { platform, release } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createRunId, gitSource, printChecks, readJson, runProcess, sha256, summarizeStatus, writeJson } from './_shared.mjs'
import {
  evidencePaths,
  normalizeRegistry,
  parseNpmJson,
  parsePackageCoordinate,
  validateDistTag,
  validateSpdxExpression,
} from './_release.mjs'

const HELP = `Usage: release-preflight.mjs --tarball <file.tgz> --tag <dist-tag> [options]

Options:
  --project <dir>       Plugin project (default: .)
  --registry <url>      npm registry (default: https://registry.npmjs.org/)
  --npm <executable>    npm executable (default: npm)
  --result <file>       Write result.json evidence
  --provenance <file>   Write provenance.json evidence
  --help                Show this help

This command is read-only: it authenticates, checks version absence, and runs npm publish --dry-run against the exact tarball. It never publishes.
`

main().catch(error => fail(error.message))

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string', default: '.' },
      tarball: { type: 'string' },
      tag: { type: 'string' },
      registry: { type: 'string', default: 'https://registry.npmjs.org/' },
      npm: { type: 'string', default: 'npm' },
      result: { type: 'string' },
      provenance: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
  if (values.help) {
    process.stdout.write(HELP)
    return
  }
  if (!values.tarball) throw new Error('--tarball is required')
  if (!values.tag) throw new Error('--tag is required')

  const startedAt = new Date().toISOString()
  const runId = createRunId()
  const project = resolve(values.project)
  const tarball = resolve(values.tarball)
  const registry = normalizeRegistry(values.registry)
  const tag = validateDistTag(values.tag)
  const { resultPath, provenancePath } = evidencePaths(values.result, values.provenance)
  const checks = []
  const add = (id, status, summary, required = true, evidence = []) => checks.push({ id, required, status, summary, evidence })

  let manifest = null
  try {
    manifest = readJson(join(project, 'package.json'))
    const coordinate = parsePackageCoordinate(`${manifest.name}@${manifest.version}`)
    add('package-coordinate', 'pass', `Release coordinate is ${coordinate.name}@${coordinate.version}.`)
  } catch (error) {
    add('package-coordinate', 'fail', `Cannot resolve an exact package coordinate: ${error.message}`)
  }

  const tarballValid = existsSync(tarball) && lstatSync(tarball).isFile() && !lstatSync(tarball).isSymbolicLink()
  add('exact-tarball', tarballValid ? 'pass' : 'fail', tarballValid
    ? `Exact release tarball is a regular file with checksum ${sha256(tarball)}.`
    : 'Release tarball must exist as a regular non-symlink file.')

  if (manifest !== null) {
    const metadataProblems = publicMetadataProblems(project, manifest, registry)
    add('public-metadata', metadataProblems.length === 0 ? 'pass' : 'fail', metadataProblems.length === 0
      ? 'License, repository, support, bundle, and public registry metadata are present.'
      : `Public metadata is incomplete: ${metadataProblems.join('; ')}`)
    const prereleaseToLatest = String(manifest.version).includes('-') && tag === 'latest'
    add('dist-tag-policy', prereleaseToLatest ? 'fail' : 'pass', prereleaseToLatest
      ? 'A prerelease version must not be published under latest.'
      : `Explicit dist-tag ${tag} is compatible with the package version.`)
  }

  const source = await gitSource(project)
  add('clean-committed-source', source.commit !== null && source.dirty === false ? 'pass' : 'fail',
    source.commit === null
      ? 'Project must be a Git worktree with a resolvable commit.'
      : source.dirty ? 'Project worktree is dirty; the tarball cannot be tied to a clean source commit.' : `Source is clean at commit ${source.commit}.`)

  if (manifest !== null && tarballValid) {
    const whoami = await runProcess(values.npm, ['whoami', '--registry', registry], { cwd: project, timeoutMs: 30_000 })
      .catch(() => ({ code: null, stdout: '', stderr: '' }))
    add('registry-auth', whoami.code === 0 && whoami.stdout.trim() !== '' ? 'pass' : 'fail',
      whoami.code === 0 && whoami.stdout.trim() !== ''
        ? 'npm registry authentication is available.'
        : 'npm whoami failed; authenticate to the selected registry before publication.')

    const dryRun = await runProcess(values.npm, [
      'publish', tarball, '--dry-run', '--ignore-scripts', '--json', '--tag', tag, '--registry', registry,
    ], { cwd: project, timeoutMs: 120_000 }).catch(() => ({ code: null, stdout: '', stderr: '' }))
    let dryRunMatches = false
    if (dryRun.code === 0) {
      try {
        const output = parseNpmJson(dryRun.stdout)
        dryRunMatches = output?.name === manifest.name && output?.version === manifest.version
      } catch {
        dryRunMatches = false
      }
    }
    add('tarball-publish-dry-run', dryRunMatches ? 'pass' : 'fail', dryRunMatches
      ? 'npm publish --dry-run resolved the exact tarball to the manifest name and version.'
      : 'npm publish --dry-run failed or resolved a different package coordinate.')

    const versionLookup = await runProcess(values.npm, [
      'view', `${manifest.name}@${manifest.version}`, 'version', '--json', '--registry', registry, '--prefer-online',
    ], { cwd: project, timeoutMs: 30_000 }).catch(() => ({ code: null, stdout: '', stderr: '' }))
    const absent = versionLookup.code !== 0 && /(?:E404|404\s+Not\s+Found|is not in this registry)/i.test(versionLookup.stderr)
    add('version-absent', absent ? 'pass' : 'fail', absent
      ? 'The exact package version is absent from the selected registry.'
      : versionLookup.code === 0
        ? 'The exact package version already exists and cannot be overwritten.'
        : 'Could not prove package-version absence; resolve registry/network errors before publication.')
  }

  const status = summarizeStatus(checks)
  const result = {
    schemaVersion: '1.0',
    kind: 'npm-release-preflight',
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    subject: { plugin: manifest?.name ?? null, project: basename(project), commit: source.commit },
    checks,
    cleanup: { status: 'not-needed', resourcesManifest: null, notes: [] },
    risks: status === 'pass'
      ? ['Preflight does not publish, change dist-tags, or prove the registry bytes after publication.']
      : ['Publication must stop until every required preflight check passes.'],
  }
  const provenance = {
    schemaVersion: '1.0',
    runId,
    generatedAt: new Date().toISOString(),
    source: { commit: source.commit, dirty: source.dirty, packageChecksum: tarballValid ? sha256(tarball) : null },
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
      scope: ['read-only npm authentication, exact-version absence, package metadata, and exact-tarball publish dry-run checks'],
      notProven: ['npm publication', 'post-publication registry bytes or dist-tags', 'package-name stock DSH installation'],
    },
    media: null,
    exceptions: [],
    sensitiveReview: { status: 'not-run', scannerResult: null },
  }
  if (resultPath !== null) {
    writeJson(resultPath, result)
    writeJson(provenancePath, provenance)
  }
  printChecks(checks)
  process.stdout.write(`release-preflight: ${status}\n`)
  if (status !== 'pass') process.exitCode = 1
}

function publicMetadataProblems(project, manifest, registry) {
  const problems = []
  try {
    validateSpdxExpression(manifest.license)
  } catch {
    problems.push('valid SPDX license')
  }
  const licenseFile = readdirSync(project).some(name => /^licen[cs]e(?:\.[A-Za-z0-9._-]+)?$/i.test(name))
  if (!licenseFile) problems.push('LICENSE file')
  if (manifest.private === true) problems.push('private must not be true')
  if (typeof manifest.description !== 'string' || manifest.description.trim() === '') problems.push('description')
  if (!(typeof manifest.repository === 'string' || typeof manifest.repository?.url === 'string')) problems.push('repository')
  if (typeof manifest.homepage !== 'string') problems.push('homepage')
  if (!(typeof manifest.bugs === 'string' || typeof manifest.bugs?.url === 'string')) problems.push('bugs')
  if (manifest.publishConfig?.access !== 'public') problems.push('publishConfig.access=public')
  let configuredRegistry = null
  try {
    configuredRegistry = normalizeRegistry(manifest.publishConfig?.registry)
  } catch {
    problems.push('publishConfig.registry')
  }
  if (configuredRegistry !== null && configuredRegistry !== registry) problems.push('publishConfig.registry must match --registry')
  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string' || !existsSync(resolve(project, patch))) problems.push('dsh.bundle.patch')
  return problems
}

function fail(message) {
  process.stderr.write(`release-preflight: ${message}\n${HELP}`)
  process.exitCode = 1
}
