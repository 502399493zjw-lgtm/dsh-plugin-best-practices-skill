#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { platform, release } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createRunId, gitSource, printChecks, readJson, sha256, summarizeStatus, writeJson } from './_shared.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const defaultTrustManifest = resolve(scriptDirectory, '../assets/trust/dsh-0.1.0-rc.8.json')
const HELP = `Usage: verify-dsh-release.mjs --tarball <file.tgz> [options]

Options:
  --entry <file>         Extracted package entry (normally package/lib/bin.js)
  --project <dir>        Source project for evidence provenance (default: .)
  --result <file>        Write result.json-compatible evidence
  --provenance <file>    Write provenance.json-compatible evidence
  --help                 Show this help

If either evidence path is supplied, the missing sibling defaults to result.json or provenance.json in the same directory.
`

const startedAt = new Date().toISOString()
const { values } = parseArgs({
  options: {
    tarball: { type: 'string' },
    entry: { type: 'string' },
    project: { type: 'string', default: '.' },
    result: { type: 'string' },
    provenance: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})
if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}
if (!values.tarball) fail('--tarball is required')

const project = resolve(values.project)
const tarball = resolve(values.tarball)
const entry = values.entry ? resolve(values.entry) : null
const resultPath = values.result
  ? resolve(values.result)
  : values.provenance ? join(dirname(resolve(values.provenance)), 'result.json') : null
const provenancePath = values.provenance
  ? resolve(values.provenance)
  : values.result ? join(dirname(resolve(values.result)), 'provenance.json') : null
if (resultPath !== null && resultPath === provenancePath) fail('result and provenance paths must be distinct')

const trust = readJson(defaultTrustManifest)
if (trust.schemaVersion !== '1.0' || trust.package !== '@deepseek-ai/dsh' || trust.version !== '0.1.0-rc.8') {
  fail('trust manifest is not the supported @deepseek-ai/dsh 0.1.0-rc.8 record')
}

const runId = createRunId()
const checks = []
const add = (id, status, summary, required = true, extra = {}) => checks.push({ id, required, status, summary, ...extra })
const tarballOk = regularFile(tarball)
add('tarball-file', tarballOk ? 'pass' : 'fail', tarballOk
  ? 'Release tarball is a regular file.'
  : 'Release tarball is missing or is not a regular file.')

let tarballSha256 = null
if (tarballOk) {
  const bytes = readFileSync(tarball)
  tarballSha256 = sha256(tarball)
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  add('tarball-sha256', tarballSha256 === trust.distribution.sha256 ? 'pass' : 'fail',
    tarballSha256 === trust.distribution.sha256
      ? 'Tarball SHA-256 matches the bundled rc.8 trust record.'
      : 'Tarball SHA-256 does not match the bundled rc.8 trust record.')
  add('npm-integrity', integrity === trust.distribution.integrity ? 'pass' : 'fail',
    integrity === trust.distribution.integrity
      ? 'Tarball SHA-512 matches npm dist.integrity.'
      : 'Tarball SHA-512 does not match npm dist.integrity.')
  add('tarball-size', bytes.length === trust.distribution.size ? 'pass' : 'fail',
    bytes.length === trust.distribution.size
      ? 'Tarball size matches the recorded release metadata.'
      : 'Tarball size does not match the recorded release metadata.')
}

let entryChecksum = null
if (entry === null) {
  add('release-entry', 'skip', 'No extracted lib/bin.js was supplied; entry-payload integrity was not checked.', false, { evidence: [] })
} else if (!regularFile(entry)) {
  add('release-entry', 'fail', 'Supplied release entry is missing or is not a regular file.')
} else {
  entryChecksum = sha256(entry)
  const entrySize = lstatSync(entry).size
  const checksumOk = entryChecksum === trust.entry.sha256
  const sizeOk = entrySize === trust.entry.size
  add('release-entry', checksumOk && sizeOk ? 'pass' : 'fail', checksumOk && sizeOk
    ? `${trust.entry.path} SHA-256 and size match the bundled rc.8 trust record.`
    : `${trust.entry.path} SHA-256 or size does not match the bundled rc.8 trust record.`)
}

const source = await gitSource(project)
const status = summarizeStatus(checks)
const result = {
  schemaVersion: '1.0',
  kind: 'dsh-release-integrity',
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  status,
  subject: { plugin: trust.package, project: basename(project), commit: source.commit },
  checks,
  cleanup: { status: 'not-needed', resourcesManifest: null, notes: [] },
  risks: [
    'Hash matching proves byte identity with the recorded npm release artifacts, not stock DSH installation or runtime behavior.',
    'The npm registry signature is recorded as metadata but is not cryptographically verified by this script.',
    ...(entry === null ? ['The stable package entry was not supplied and therefore was not checked.'] : []),
  ],
}
const provenance = {
  schemaVersion: '1.0',
  runId,
  generatedAt: new Date().toISOString(),
  source: { commit: source.commit, dirty: source.dirty, packageChecksum: tarballSha256 },
  runtime: {
    dsh: null,
    cordis: null,
    pluginCordisPeer: null,
    dshExecutable: entryChecksum === null ? null : {
      requested: `<release-entry:${basename(entry)}>`,
      resolvedBasename: basename(entry),
      checksum: entryChecksum,
      expectedChecksum: trust.entry.sha256,
      checksumVerified: entryChecksum === trust.entry.sha256,
      source: `npm:${trust.package}@${trust.version}`,
    },
    node: process.version,
    os: `${platform()} ${release()}`,
  },
  claim: {
    execution: 'real',
    scope: [
      'local release-artifact integrity inspection against the bundled rc.8 npm trust record',
      ...(entryChecksum === trust.entry.sha256 ? ['stable package entry byte identity'] : []),
    ],
    notProven: ['stock DSH installation', 'stock DSH runtime behavior', 'plugin compatibility'],
  },
  media: null,
  exceptions: [
    'DSH was not executed; runtime.dsh and runtime.cordis are intentionally null.',
    'Registry signature validation is outside this verifier; npm dist.integrity and recorded local hashes were compared.',
  ],
  sensitiveReview: { status: 'not-run', scannerResult: null },
}
if (resultPath !== null) {
  writeJson(resultPath, result)
  writeJson(provenancePath, provenance)
}
printChecks(checks)
process.stdout.write(`verify-dsh-release: ${status}\n`)
process.exit(status === 'pass' ? 0 : 1)

function regularFile(path) {
  if (!existsSync(path)) return false
  const stat = lstatSync(path)
  return stat.isFile() && !stat.isSymbolicLink()
}

function fail(message) {
  process.stderr.write(`verify-dsh-release: ${message}\n`)
  process.exit(1)
}
