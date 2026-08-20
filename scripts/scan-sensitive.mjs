#!/usr/bin/env node

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { platform, release } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createRunId, gitSource, printChecks, writeJson } from './_shared.mjs'

const HELP = `Usage: scan-sensitive.mjs [--project <dir>] [--result <file>] [--provenance <file>] [--fail-on error|warning]\n
If either evidence path is supplied, the missing sibling defaults to result.json or provenance.json in the same directory.\n`
const { values } = parseArgs({
  options: {
    project: { type: 'string', default: '.' },
    result: { type: 'string' },
    provenance: { type: 'string' },
    'fail-on': { type: 'string', default: 'error' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})
if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}
if (!['error', 'warning'].includes(values['fail-on'])) {
  process.stderr.write('scan-sensitive: --fail-on must be error or warning\n')
  process.exit(1)
}

const startedAt = new Date().toISOString()
const project = resolve(values.project)
const resultPath = values.result
  ? resolve(values.result)
  : values.provenance ? join(dirname(resolve(values.provenance)), 'result.json') : null
const provenancePath = values.provenance
  ? resolve(values.provenance)
  : values.result ? join(dirname(resolve(values.result)), 'provenance.json') : null
if (resultPath !== null && resultPath === provenancePath) {
  process.stderr.write('scan-sensitive: result and provenance paths must be distinct\n')
  process.exit(1)
}
const findings = []
const skipped = []
const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage', '.pnpm-store'])
const contentRules = [
  ['private-key', 'error', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', 'error', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/],
  ['github-fine-grained-token', 'error', /\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ['openai-style-key', 'error', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['aws-access-key', 'error', /\bAKIA[0-9A-Z]{16}\b/],
  ['bearer-token', 'error', /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i],
  ['secret-assignment', 'error', /(?:token|secret|password|passwd|api[_-]?key)\s*[:=]\s*["']?(?!<|example|test|mock|redacted)[A-Za-z0-9._~+/=-]{12,}/i],
  ['mac-home-path', 'warning', /\/Users\/[^/\s"']+\//],
  ['linux-home-path', 'warning', /\/home\/[^/\s"']+\//],
  ['windows-home-path', 'warning', /[A-Za-z]:\\Users\\[^\\\s"']+\\/],
]

walk(project)

const checks = findings.map((finding, index) => ({
  id: `sensitive-${index + 1}`,
  required: true,
  status: finding.severity === 'error' || values['fail-on'] === 'warning' ? 'fail' : 'warn',
  summary: `${finding.rule} at ${finding.file}${finding.line ? `:${finding.line}` : ''}; matched value is redacted.`,
  evidence: [],
}))
if (findings.length === 0) {
  checks.push({ id: 'sensitive-scan', required: true, status: 'pass', summary: 'No configured sensitive-data pattern was found.', evidence: [] })
}
if (skipped.length > 0) {
  checks.push({ id: 'skipped-large-files', required: false, status: 'warn', summary: `${skipped.length} files larger than 2 MiB were not content-scanned.`, evidence: skipped })
}

const failed = checks.some(check => check.required && check.status === 'fail')
const source = await gitSource(project)
const runId = createRunId()
if (checks[0]) {
  checks[0].command = [
    'node',
    'scan-sensitive.mjs',
    '--project',
    '<project>',
    '--fail-on',
    values['fail-on'],
  ]
}
const result = {
  schemaVersion: '1.0',
  kind: 'sensitive-data-scan',
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  status: failed ? 'fail' : 'pass',
  subject: { plugin: null, project: basename(project), commit: source.commit },
  checks,
  cleanup: { status: 'not-needed', resourcesManifest: null, notes: [] },
  risks: skipped.length > 0 ? ['Large files were not content-scanned; inspect binary/media metadata separately.'] : [],
}
let manifest = null
try {
  manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
} catch {
  // A scan target does not need to be an npm package.
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
    scope: ['configured filename and text-pattern scan of eligible files under the target directory'],
    notProven: ['absence of every possible secret', 'binary or files larger than 2 MiB content', 'Git history'],
  },
  media: null,
  exceptions: skipped.length > 0 ? [`${skipped.length} files larger than 2 MiB were not content-scanned.`] : [],
  sensitiveReview: {
    status: failed ? 'fail' : 'pass',
    scannerResult: resultPath === null ? null : basename(resultPath),
  },
}
if (resultPath !== null) {
  writeJson(resultPath, result)
  writeJson(provenancePath, provenance)
}
printChecks(checks)
process.stdout.write(`scan-sensitive: ${result.status}\n`)
process.exit(failed ? 1 : 0)

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(path)
      continue
    }
    if (!entry.isFile()) continue
    scanFile(path)
  }
}

function scanFile(path) {
  const rel = relative(project, path).replaceAll('\\', '/')
  const name = basename(path).toLowerCase()
  if (name === '.env' || /^\.env\.(?!example$|sample$)/.test(name)) addFinding('environment-file', 'error', rel)
  if (/\.(?:pem|key|p12|pfx)$/.test(name)) addFinding('credential-file', 'error', rel)
  if (/^(?:credentials|auth|tokens?)\.json$/.test(name)) addFinding('credential-json', 'error', rel)

  const stat = lstatSync(path)
  if (stat.size > 2 * 1024 * 1024) {
    skipped.push(rel)
    return
  }
  const buffer = readFileSync(path)
  if (buffer.includes(0)) return
  const lines = buffer.toString('utf8').split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const [rule, severity, pattern] of contentRules) {
      pattern.lastIndex = 0
      if (pattern.test(line)) addFinding(rule, severity, rel, index + 1)
    }
  })
}

function addFinding(rule, severity, file, line) {
  if (findings.some(item => item.rule === rule && item.file === file && item.line === line)) return
  findings.push({ rule, severity, file, line })
}
