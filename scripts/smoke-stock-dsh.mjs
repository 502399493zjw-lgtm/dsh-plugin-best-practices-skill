#!/usr/bin/env node

import { accessSync, appendFileSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, delimiter, join, resolve } from 'node:path'
import { tmpdir, platform, release } from 'node:os'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { parseArgs } from 'node:util'
import { OWNER, createRunId, gitSource, printChecks, readJson, runProcess, sha256, summarizeStatus, writeJson } from './_shared.mjs'

const DSH_BASELINE = '0.1.0-rc.8'

const HELP = `Usage: smoke-stock-dsh.mjs --tarball <file.tgz> [options]

Options:
  --project <dir>       Plugin project (default: .)
  --dsh <executable>    Stock DSH executable (default: dsh)
  --dsh-entry <file>    Stable package entry; invoke through Node instead of a generated shim
  --execution <mode>    Required: real, mock, or hybrid
  --dsh-source <ref>    Required for real; trusted npm/release/artifact descriptor
  --expected-dsh-sha256 <digest>
                        Required for real; trusted sha256:<64 hex> digest
  --expected-dsh-version <version>
                        Exact DSH version (default baseline: 0.1.0-rc.8)
  --probe <path>        Extra same-origin HTTP path; repeatable
  --artifacts <dir>     Evidence directory
  --no-web              Stop after install and dump-config
  --keep-home           Retain isolated DSH_HOME for diagnosis
  --help                Show this help
`

const { values } = parseArgs({
  options: {
    project: { type: 'string', default: '.' },
    tarball: { type: 'string' },
    dsh: { type: 'string', default: 'dsh' },
    'dsh-entry': { type: 'string' },
    execution: { type: 'string' },
    'dsh-source': { type: 'string' },
    'expected-dsh-sha256': { type: 'string' },
    'expected-dsh-version': { type: 'string', default: DSH_BASELINE },
    probe: { type: 'string', multiple: true, default: [] },
    artifacts: { type: 'string' },
    'no-web': { type: 'boolean', default: false },
    'keep-home': { type: 'boolean', default: false },
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
if (!values.execution) fail('--execution is required; choose real only for the intended stock DSH package entry or executable')
if (!['real', 'mock', 'hybrid'].includes(values.execution)) fail('--execution must be real, mock, or hybrid')
if (values['dsh-source'] !== undefined && !/^(?:npm|release|artifact):[A-Za-z0-9@._/+:-]{1,180}$/.test(values['dsh-source'])) {
  fail('--dsh-source must be a public npm:, release:, or artifact: descriptor, not a machine path')
}
const expectedDshChecksum = normalizeSha256(values['expected-dsh-sha256'])
if (values['expected-dsh-sha256'] !== undefined && expectedDshChecksum === null) {
  fail('--expected-dsh-sha256 must be sha256:<64 hex> or 64 hex characters')
}
if (values.execution === 'real' && (!values['dsh-source'] || expectedDshChecksum === null)) {
  fail('real execution requires --dsh-source and --expected-dsh-sha256 from a trusted release or artifact')
}
if (!isExactSemver(values['expected-dsh-version'])) fail('--expected-dsh-version must be an exact semver')
for (const probe of values.probe) if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*$/.test(probe)) fail(`invalid same-origin probe path: ${probe}`)

const project = resolve(values.project)
const tarball = resolve(project, values.tarball)
if (!existsSync(tarball)) fail(`tarball does not exist: ${tarball}`)
const manifest = readJson(join(project, 'package.json'))
const usingDshEntry = values['dsh-entry'] !== undefined
const displayDsh = usingDshEntry
  ? `node <dsh-entry:${basename(values['dsh-entry'])}>`
  : values.dsh.includes('/') || values.dsh.includes('\\') ? `<dsh:${basename(values.dsh)}>` : values.dsh
const displayCommand = usingDshEntry ? ['node', `<dsh-entry:${basename(values['dsh-entry'])}>`] : [displayDsh]
const resolvedDsh = usingDshEntry ? resolveReadableFile(values['dsh-entry'], project) : resolveExecutable(values.dsh, project)
const dshRunner = usingDshEntry ? process.execPath : resolvedDsh
const runtimeArgs = args => usingDshEntry ? [resolvedDsh, ...args] : args
const resolvedDshChecksum = resolvedDsh === null ? null : sha256(resolvedDsh)
const runtimeLabel = values.execution === 'real' ? 'Stock DSH' : `${values.execution} DSH adapter`
const runId = createRunId()
const startedAt = new Date().toISOString()
const artifacts = values.artifacts ? resolve(project, values.artifacts) : join(project, 'artifacts', 'smoke', runId)
mkdirSync(artifacts, { recursive: true })

const home = mkdtempSync(join(tmpdir(), `dsh-plugin-smoke-${runId}-`))
const markerPath = join(home, '.dsh-plugin-resource.json')
writeJson(markerPath, { schemaVersion: '1.0', owner: OWNER, runId })
const resourcesPath = join(artifacts, 'resources.json')
const resources = {
  schemaVersion: '1.0',
  owner: OWNER,
  runId,
  resources: [{ type: 'directory', path: home, marker: '.dsh-plugin-resource.json' }],
}
writeJson(resourcesPath, resources)

const env = minimalEnvironment(home, runId)
const checks = []
const add = (id, status, summary, required = true, extra = {}) => checks.push({ id, required, status, summary, ...extra })
if (values.execution !== 'real') {
  add('stock-execution', 'skip', `${values.execution} execution can test this smoke adapter but does not prove stock DSH compatibility.`, true, { evidence: [] })
}
let server = null
let dshVersion = null
let cleanupStatus = 'pending'
let pageText = null
let stdoutSink = null
let stderrSink = null
let interruptedSignal = null
const interruptController = new AbortController()
const interrupt = (signal) => {
  if (interruptedSignal !== null) return
  interruptedSignal = signal
  interruptController.abort(new Error(`interrupted by ${signal}`))
  if (server !== null && server.exitCode === null) server.kill('SIGTERM')
}
const onSigint = () => interrupt('SIGINT')
const onSigterm = () => interrupt('SIGTERM')
process.once('SIGINT', onSigint)
process.once('SIGTERM', onSigterm)

try {
  const executableOk = resolvedDsh !== null
  add('dsh-executable', executableOk ? 'pass' : 'fail', executableOk
    ? `${runtimeLabel} ${usingDshEntry ? 'package entry' : 'executable'} resolved as ${basename(resolvedDsh)} with a recorded checksum.`
    : `Could not resolve ${usingDshEntry ? 'readable package entry' : 'executable'} ${displayDsh}.`)
  if (!executableOk) throw new Error('DSH executable could not be resolved')

  const checksumVerified = expectedDshChecksum !== null && resolvedDshChecksum === expectedDshChecksum
  if (values.execution === 'real') {
    add('dsh-authenticity', checksumVerified ? 'pass' : 'fail', checksumVerified
      ? `DSH ${usingDshEntry ? 'package entry' : 'executable'} matches the trusted checksum for ${values['dsh-source']}.`
      : `DSH ${usingDshEntry ? 'package entry' : 'executable'} does not match the trusted checksum for ${values['dsh-source']}.`)
    if (!checksumVerified) throw new Error('DSH release target checksum mismatch')
  } else {
    add('dsh-authenticity', 'skip', `${values.execution} execution does not make a stock authenticity claim.`, false, { evidence: [] })
  }

  const versionArgs = ['--version']
  const version = await runProcess(dshRunner, runtimeArgs(versionArgs), { cwd: project, env, timeoutMs: 30_000, signal: interruptController.signal })
  const reportedVersions = extractVersions(`${version.stdout}\n${version.stderr}`)
  dshVersion = reportedVersions.length === 1 ? reportedVersions[0] : null
  const versionOk = version.code === 0 && dshVersion === values['expected-dsh-version']
  add('dsh-version', versionOk ? 'pass' : 'fail', versionOk
    ? `${runtimeLabel} reports ${values['expected-dsh-version']}.`
    : `Expected exact DSH ${values['expected-dsh-version']}; version output was missing, ambiguous, or different.`, true,
  { command: [...displayCommand, ...versionArgs], exitCode: version.code, evidence: [] })
  if (!versionOk) throw new Error('stock DSH version mismatch')

  const installArgs = ['plugin', '--profile', 'web', 'add', tarball]
  const installed = await runProcess(dshRunner, runtimeArgs(installArgs), { cwd: project, env, timeoutMs: 180_000, signal: interruptController.signal })
  add('install-tarball', installed.code === 0 ? 'pass' : 'fail', installed.code === 0
    ? `Tarball installed into an isolated ${runtimeLabel} web profile.`
    : `Plugin installation failed: ${lastPublicLine(installed.stderr)}`, true,
  { command: [...displayCommand, 'plugin', '--profile', 'web', 'add', `<tarball:${basename(tarball)}>`], exitCode: installed.code, evidence: [] })
  if (installed.code !== 0) throw new Error('tarball installation failed')

  const dumpArgs = ['--profile', 'web', '--dump-config']
  const dumped = await runProcess(dshRunner, runtimeArgs(dumpArgs), { cwd: project, env, timeoutMs: 60_000, signal: interruptController.signal })
  const dumpOk = dumped.code === 0 && dumped.stdout.includes(manifest.name)
  add('dump-config', dumpOk ? 'pass' : 'fail', dumpOk
    ? 'Composed config includes the installed plugin bundle.'
    : 'Composed config failed or does not include the plugin package.', true,
  { command: [...displayCommand, ...dumpArgs], exitCode: dumped.code, evidence: [] })
  if (!dumpOk) throw new Error('plugin is absent from composed config')

  if (values['no-web']) {
    add('web-start', 'skip', 'Web start was disabled by --no-web.', false, { evidence: [] })
  } else {
    const port = await freePort()
    const startArgs = ['--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)]
    server = spawn(dshRunner, runtimeArgs(startArgs), { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] })
    await once(server, 'spawn')
    resources.resources.push({ type: 'process', pid: server.pid, commandIncludes: runId })
    writeJson(resourcesPath, resources)
    stdoutSink = createRedactedLogSink(join(artifacts, 'dsh.stdout.log'))
    stderrSink = createRedactedLogSink(join(artifacts, 'dsh.stderr.log'))
    server.stdout.on('data', chunk => stdoutSink.write(chunk))
    server.stderr.on('data', chunk => stderrSink.write(chunk))
    pageText = await waitForPage(`http://127.0.0.1:${port}/`, server, 45_000, interruptController.signal)
    await new Promise(resolveWait => setTimeout(resolveWait, 750))
    if (server.exitCode !== null) throw new Error(`DSH Web exited after becoming reachable with code ${server.exitCode}`)
    add('web-start', 'pass', `${runtimeLabel} Web started and served its root page.`, true,
      { command: [...displayCommand, ...startArgs], exitCode: null, evidence: ['dsh.stdout.log', 'dsh.stderr.log'] })

    if (manifest.dsh?.client !== undefined) {
      const routes = [...new Set(pageText.match(/\/plugins\/[^"'<>\\\s]+\/client\.js\?rev=[^"'<>\\\s]+/g) ?? [])]
      let foundClient = false
      for (const route of routes) {
        const response = await fetchWithTimeout(`http://127.0.0.1:${port}${route}`, 5_000, interruptController.signal)
        if (!response.ok) continue
        const body = await response.text()
        if (body.includes(manifest.name)) {
          foundClient = true
          break
        }
      }
      add('browser-bundle', pageText.includes(manifest.name) && foundClient ? 'pass' : 'fail', pageText.includes(manifest.name) && foundClient
        ? 'Boot manifest includes the plugin and its client bundle is fetchable.'
        : 'Browser plugin is missing from the boot manifest or its bundle route is not fetchable.')
      if (!pageText.includes(manifest.name) || !foundClient) throw new Error('browser bundle validation failed')
    } else {
      add('browser-bundle', 'skip', 'Host-only package has no Browser bundle.', false, { evidence: [] })
    }

    for (const probe of values.probe) {
      const response = await fetchWithTimeout(`http://127.0.0.1:${port}${probe}`, 5_000, interruptController.signal)
      add(`probe:${probe}`, response.ok ? 'pass' : 'fail', response.ok
        ? `${probe} returned HTTP ${response.status}.`
        : `${probe} returned HTTP ${response.status}.`)
      if (!response.ok) throw new Error(`probe failed: ${probe}`)
    }

    await new Promise(resolveWait => setTimeout(resolveWait, 1_500))
    const stayedRunning = server.exitCode === null
    add('web-stable', stayedRunning ? 'pass' : 'fail', stayedRunning
      ? `${runtimeLabel} Web remained alive after Browser and route probes.`
      : `${runtimeLabel} Web exited after initial readiness with code ${server.exitCode}.`)
    if (!stayedRunning) throw new Error('DSH Web did not remain stable after probes')
  }
} catch (error) {
  if (!checks.some(check => check.required && check.status === 'fail')) {
    add('smoke-runtime', 'fail', sanitizePublicText(error instanceof Error ? error.message : String(error)))
  }
} finally {
  await terminateChild(server, 5_000)
  stdoutSink?.flush()
  stderrSink?.flush()
  if (values['keep-home']) {
    cleanupStatus = 'retained'
  } else {
    try {
      rmSync(home, { recursive: true, force: false })
      cleanupStatus = 'cleaned'
    } catch (error) {
      cleanupStatus = 'failed'
      add('cleanup-home', 'fail', `Failed to clean isolated DSH_HOME: ${error.message}`)
    }
  }
}
process.removeListener('SIGINT', onSigint)
process.removeListener('SIGTERM', onSigterm)

const source = await gitSource(project)
const result = {
  schemaVersion: '1.0',
  kind: 'stock-dsh-smoke',
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  status: summarizeStatus(checks),
  subject: { plugin: manifest.name ?? null, project: basename(project), commit: source.commit },
  checks,
  cleanup: {
    status: cleanupStatus,
    resourcesManifest: 'resources.json',
    notes: values['keep-home'] ? ['Isolated DSH_HOME was retained by explicit request.'] : [],
  },
  risks: [
    'HTTP smoke does not prove a real browser interaction or Provider/model request.',
    ...(values.execution === 'real' ? [] : [`Execution was ${values.execution}; stock DSH compatibility remains unproven.`]),
    ...(values['no-web'] ? ['Web start and Browser bundle checks were skipped.'] : []),
    ...(!values['no-web'] ? ['Persisted DSH logs were redacted while streaming but still require a sensitive-data scan before sharing.'] : []),
  ],
}
const checkPassed = id => checks.some(check => check.id === id && check.status === 'pass')
const provenScope = [
  'smoke harness invocation and evidence capture',
  ...(values.execution === 'real' && checkPassed('dsh-authenticity')
    ? [`DSH ${usingDshEntry ? 'package entry' : 'executable'} authenticity verified against an independently supplied source and checksum`]
    : []),
  ...(values.execution !== 'real' && checkPassed('dsh-version')
    ? ['non-stock adapter command protocol through the exact-version check']
    : []),
  ...(checkPassed('install-tarball') ? ['tarball installation into an isolated profile'] : []),
  ...(checkPassed('dump-config') ? ['config composition'] : []),
  ...(checkPassed('web-start') ? ['Web start and HTTP probes'] : []),
]
const provenance = {
  schemaVersion: '1.0',
  runId,
  generatedAt: new Date().toISOString(),
  source: { commit: source.commit, dirty: source.dirty, packageChecksum: sha256(tarball) },
  runtime: {
    dsh: dshVersion,
    cordis: null,
    pluginCordisPeer: manifest.peerDependencies?.['@deepseek-ai/cordis'] ?? null,
    dshExecutable: resolvedDsh === null ? null : {
      requested: displayDsh,
      resolvedBasename: basename(resolvedDsh),
      checksum: resolvedDshChecksum,
      expectedChecksum: expectedDshChecksum,
      checksumVerified: expectedDshChecksum !== null && resolvedDshChecksum === expectedDshChecksum,
      source: values['dsh-source'] ?? null,
    },
    node: process.version,
    os: `${platform()} ${release()}`,
  },
  claim: {
    execution: values.execution,
    scope: provenScope,
    notProven: [
      ...(values.execution === 'real' && result.status === 'pass' ? [] : ['stock DSH compatibility']),
      ...(values['no-web'] ? ['stock DSH Web start and Browser bundle'] : []),
      'real browser interaction',
      'real Provider/model request',
      'external credential flow',
    ],
  },
  media: null,
  exceptions: [
    'Stock DSH runtime Cordis version was not independently queried; pluginCordisPeer is recorded separately.',
    ...(values['keep-home'] ? ['Isolated DSH_HOME retained for diagnosis.'] : []),
    ...(interruptedSignal === null ? [] : [`Run was interrupted by ${interruptedSignal}.`]),
  ],
  sensitiveReview: { status: 'not-run', scannerResult: null },
}
writeJson(join(artifacts, 'result.json'), result)
writeJson(join(artifacts, 'provenance.json'), provenance)
printChecks(checks)
process.stdout.write(`smoke-stock-dsh: ${result.status}; evidence ${artifacts}\n`)
process.exit(interruptedSignal === 'SIGINT' ? 130 : interruptedSignal === 'SIGTERM' ? 143 : result.status === 'pass' ? 0 : 1)

async function freePort() {
  const listener = createServer()
  listener.unref()
  await new Promise((resolveListen, reject) => listener.listen(0, '127.0.0.1', resolveListen).once('error', reject))
  const address = listener.address()
  const port = typeof address === 'object' && address !== null ? address.port : null
  await new Promise(resolveClose => listener.close(resolveClose))
  if (port === null) throw new Error('failed to allocate a loopback port')
  return port
}

async function waitForPage(url, child, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`DSH Web exited early with code ${child.exitCode}`)
    try {
      const response = await fetchWithTimeout(url, 2_000, signal)
      if (response.ok) return await response.text()
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error
      // The server is still starting.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  }
  throw new Error(`DSH Web did not become ready within ${timeoutMs}ms`)
}

function lastPublicLine(text) {
  return sanitizePublicText(text.trim().split(/\r?\n/).at(-1) ?? 'no error output')
}

function isExactSemver(value) {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)
}

function normalizeSha256(value) {
  if (value === undefined) return null
  const match = String(value).toLowerCase().match(/^(?:sha256:)?([a-f0-9]{64})$/)
  return match === null ? null : `sha256:${match[1]}`
}

function extractVersions(text) {
  const versions = []
  const pattern = /(?:^|[^0-9A-Za-z])v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?=$|[^0-9A-Za-z])/g
  for (const match of text.matchAll(pattern)) if (!versions.includes(match[1])) versions.push(match[1])
  return versions
}

function resolveExecutable(command, cwd) {
  const hasSeparator = command.includes('/') || command.includes('\\')
  const candidates = []
  if (hasSeparator) {
    candidates.push(resolve(cwd, command))
  } else {
    const extensions = process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
      : ['']
    for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
      for (const extension of extensions) candidates.push(join(directory, `${command}${extension}`))
    }
  }
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Try the next PATH candidate.
    }
  }
  return null
}

function resolveReadableFile(path, cwd) {
  const candidate = resolve(cwd, path)
  try {
    accessSync(candidate, constants.R_OK)
    const stat = lstatSync(candidate)
    return stat.isFile() && !stat.isSymbolicLink() ? candidate : null
  } catch {
    return null
  }
}

function minimalEnvironment(isolatedHome, id) {
  const inherited = {}
  for (const name of ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'NO_COLOR', 'FORCE_COLOR', 'SystemRoot', 'ComSpec', 'PATHEXT']) {
    if (process.env[name] !== undefined) inherited[name] = process.env[name]
  }
  return {
    ...inherited,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    XDG_CONFIG_HOME: join(isolatedHome, '.config'),
    XDG_CACHE_HOME: join(isolatedHome, '.cache'),
    npm_config_cache: join(isolatedHome, '.npm-cache'),
    npm_config_userconfig: join(isolatedHome, '.npmrc'),
    DSH_HOME: isolatedHome,
    DSH_AGENTS_HOME: join(isolatedHome, 'agents'),
    DSH_PLUGIN_RUN_ID: id,
  }
}

function sanitizePublicText(value) {
  return String(value)
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*$/gi, '<redacted-private-key>')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '<redacted-github-token>')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{30,}\b/g, '<redacted-github-token>')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '<redacted-api-key>')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '<redacted-aws-key>')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer <redacted>')
    .replace(/((?:token|secret|password|passwd|api[_-]?key|_authToken)\s*[:=]\s*)[^\s,;]+/gi, '$1<redacted>')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1<redacted>@')
    .replace(/\/Users\/[^/\s"']+\//g, '<home>/')
    .replace(/\/home\/[^/\s"']+\//g, '<home>/')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+\\/g, '<home>\\')
    .slice(0, 500)
}

function createRedactedLogSink(path) {
  const maxBytes = 2 * 1024 * 1024
  appendFileSync(path, '', { mode: 0o600 })
  let buffer = ''
  let written = 0
  let truncated = false
  const appendLine = (line) => {
    if (truncated) return
    const output = `${sanitizePublicText(line)}\n`
    const size = Buffer.byteLength(output)
    if (written + size > maxBytes) {
      appendFileSync(path, '[log truncated at 2 MiB after redaction]\n', { mode: 0o600 })
      truncated = true
      return
    }
    appendFileSync(path, output, { mode: 0o600 })
    written += size
  }
  return {
    write(chunk) {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) appendLine(line)
      if (buffer.length > maxBytes) {
        appendLine(buffer)
        buffer = ''
      }
    },
    flush() {
      if (buffer !== '') appendLine(buffer)
      buffer = ''
    },
  }
}

function fetchWithTimeout(url, timeoutMs, signal) {
  return fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) })
}

async function terminateChild(child, timeoutMs) {
  if (child === null || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    once(child, 'close').catch(() => undefined),
    new Promise(resolveWait => setTimeout(resolveWait, timeoutMs)),
  ])
  if (child.exitCode !== null) return
  child.kill('SIGKILL')
  await Promise.race([
    once(child, 'close').catch(() => undefined),
    new Promise(resolveWait => setTimeout(resolveWait, 2_000)),
  ])
}

function fail(message) {
  process.stderr.write(`smoke-stock-dsh: ${message}\n${HELP}`)
  process.exit(1)
}
