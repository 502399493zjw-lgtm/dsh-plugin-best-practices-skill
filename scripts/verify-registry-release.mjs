#!/usr/bin/env node

import { existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { platform, release, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createRunId, gitSource, printChecks, readJson, runProcess, sha256, summarizeStatus, writeJson } from './_shared.mjs'
import { evidencePaths, normalizeRegistry, parseNpmJson, parsePackageCoordinate, validateDistTag } from './_release.mjs'

const HELP = `Usage: verify-registry-release.mjs --package <name@version> --expected-tarball <file.tgz> --expect-tag <tag> [options]

Options:
  --project <dir>          Source project for provenance (default: .)
  --expect-tag <tag>       Required dist-tag; repeat to verify multiple tags
  --attempts <1-5>         Bounded registry-consistency attempts (default: 3)
  --registry <url>         npm registry (default: https://registry.npmjs.org/)
  --npm <executable>       npm executable (default: npm)
  --result <file>          Write result.json evidence
  --provenance <file>      Write provenance.json evidence
  --help                   Show this help

The command downloads the registry package with scripts disabled, compares its SHA-256 to the already-smoked tarball, and checks explicit dist-tags.
`

main().catch(error => fail(error.message))

async function main() {
  const { values } = parseArgs({
    options: {
      package: { type: 'string' },
      'expected-tarball': { type: 'string' },
      project: { type: 'string', default: '.' },
      'expect-tag': { type: 'string', multiple: true, default: [] },
      attempts: { type: 'string', default: '3' },
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
  if (!values.package) throw new Error('--package is required')
  if (!values['expected-tarball']) throw new Error('--expected-tarball is required')
  if (values['expect-tag'].length === 0) throw new Error('at least one --expect-tag is required')
  const attempts = Number(values.attempts)
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('--attempts must be an integer from 1 to 5')

  const startedAt = new Date().toISOString()
  const runId = createRunId()
  const coordinate = parsePackageCoordinate(values.package)
  const expectedTarball = resolve(values['expected-tarball'])
  const project = resolve(values.project)
  const registry = normalizeRegistry(values.registry)
  const expectedTags = [...new Set(values['expect-tag'].map(validateDistTag))]
  const { resultPath, provenancePath } = evidencePaths(values.result, values.provenance)
  if (!existsSync(expectedTarball) || !lstatSync(expectedTarball).isFile() || lstatSync(expectedTarball).isSymbolicLink()) {
    throw new Error('--expected-tarball must be a regular non-symlink file')
  }

  const temporary = mkdtempSync(join(tmpdir(), `dsh-registry-${runId}-`))
  let checks = []
  try {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      checks = await verifyAttempt({
        attempt,
        coordinate,
        expectedTarball,
        expectedTags,
        npm: values.npm,
        registry,
        temporary,
      })
      if (summarizeStatus(checks) === 'pass') break
      if (attempt < attempts) await new Promise(resolveWait => setTimeout(resolveWait, attempt * 500))
    }
  } finally {
    rmSync(temporary, { recursive: true, force: false })
  }

  const source = await gitSource(project)
  let manifest = null
  try {
    manifest = readJson(join(project, 'package.json'))
  } catch {
    // Project metadata is optional; the expected tarball remains the byte source of truth.
  }
  const status = summarizeStatus(checks)
  const result = {
    schemaVersion: '1.0',
    kind: 'npm-registry-release-verification',
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    subject: { plugin: coordinate.name, project: basename(project), commit: source.commit },
    checks,
    cleanup: { status: 'cleaned', resourcesManifest: null, notes: ['Owned registry download directory removed.'] },
    risks: status === 'pass'
      ? ['Registry byte/tag verification does not replace package-name installation in stock DSH.']
      : ['Do not announce the release until registry bytes and requested dist-tags match.'],
  }
  const provenance = {
    schemaVersion: '1.0',
    runId,
    generatedAt: new Date().toISOString(),
    source: { commit: source.commit, dirty: source.dirty, packageChecksum: sha256(expectedTarball) },
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
      scope: ['registry metadata resolution, script-disabled package download, exact tarball SHA-256 comparison, and requested dist-tag verification'],
      notProven: ['package-name installation in stock DSH', 'future dist-tag immutability', 'registry signature cryptographic verification'],
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
  process.stdout.write(`verify-registry-release: ${status}\n`)
  if (status !== 'pass') process.exitCode = 1
}

async function verifyAttempt({ attempt, coordinate, expectedTarball, expectedTags, npm, registry, temporary }) {
  const checks = []
  const add = (id, status, summary, required = true, evidence = []) => checks.push({ id, required, status, summary, evidence })
  const spec = `${coordinate.name}@${coordinate.version}`
  const metadata = await runProcess(npm, ['view', spec, '--json', '--registry', registry, '--prefer-online'], {
    timeoutMs: 30_000,
  }).catch(() => ({ code: null, stdout: '', stderr: '' }))
  let metadataValue = null
  if (metadata.code === 0) {
    try {
      metadataValue = parseNpmJson(metadata.stdout)
    } catch {
      metadataValue = null
    }
  }
  const metadataMatches = metadataValue?.name === coordinate.name
    && metadataValue?.version === coordinate.version
    && typeof metadataValue?.dist?.tarball === 'string'
  add(`registry-metadata-attempt-${attempt}`, metadataMatches ? 'pass' : 'fail', metadataMatches
    ? 'Registry metadata resolves the requested package name and exact version.'
    : 'Registry metadata did not resolve the requested package name and exact version.')
  if (!metadataMatches) return checks

  const destination = join(temporary, `attempt-${attempt}`)
  mkdirSync(destination)
  const packed = await runProcess(npm, [
    'pack', spec, '--ignore-scripts', '--json', '--pack-destination', destination, '--registry', registry,
  ], { timeoutMs: 120_000 }).catch(() => ({ code: null, stdout: '', stderr: '' }))
  let downloaded = null
  if (packed.code === 0) {
    try {
      const output = parseNpmJson(packed.stdout)
      const filename = Array.isArray(output) ? output[0]?.filename : output?.filename
      if (typeof filename === 'string') downloaded = resolve(destination, filename)
    } catch {
      downloaded = null
    }
  }
  if (downloaded === null) {
    const candidates = readdirSync(destination).filter(name => name.endsWith('.tgz'))
    if (candidates.length === 1) downloaded = join(destination, candidates[0])
  }
  const downloadedValid = downloaded !== null && existsSync(downloaded) && lstatSync(downloaded).isFile()
  add(`registry-download-attempt-${attempt}`, downloadedValid ? 'pass' : 'fail', downloadedValid
    ? 'Downloaded the exact registry version with lifecycle scripts disabled.'
    : 'Could not download exactly one registry tarball with lifecycle scripts disabled.')
  if (!downloadedValid) return checks

  const expectedChecksum = sha256(expectedTarball)
  const actualChecksum = sha256(downloaded)
  add(`tarball-checksum-attempt-${attempt}`, expectedChecksum === actualChecksum ? 'pass' : 'fail',
    expectedChecksum === actualChecksum
      ? `Registry tarball matches the smoked artifact (${expectedChecksum}).`
      : `Registry tarball checksum ${actualChecksum} differs from the smoked artifact ${expectedChecksum}.`)

  const tags = await runProcess(npm, [
    'view', coordinate.name, 'dist-tags', '--json', '--registry', registry, '--prefer-online',
  ], { timeoutMs: 30_000 }).catch(() => ({ code: null, stdout: '', stderr: '' }))
  let tagValue = null
  if (tags.code === 0) {
    try {
      tagValue = parseNpmJson(tags.stdout)
    } catch {
      tagValue = null
    }
  }
  for (const tag of expectedTags) {
    const matches = tagValue?.[tag] === coordinate.version
    add(`dist-tag-${tag}-attempt-${attempt}`, matches ? 'pass' : 'fail', matches
      ? `Dist-tag ${tag} resolves to ${coordinate.version}.`
      : `Dist-tag ${tag} does not resolve to ${coordinate.version}.`)
  }
  return checks
}

function fail(message) {
  process.stderr.write(`verify-registry-release: ${message}\n${HELP}`)
  process.exitCode = 1
}
