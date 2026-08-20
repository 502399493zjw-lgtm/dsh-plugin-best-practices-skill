import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'

export const OWNER = 'dsh-plugin-best-practices'

export function createRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${stamp}-${createHash('sha256').update(`${process.pid}-${performance.now()}-${Math.random()}`).digest('hex').slice(0, 8)}`
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}

export function sha256(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

export function renderTemplate(text, values) {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    if (!(key in values)) throw new Error(`missing template value ${key}`)
    return String(values[key])
  })
}

export function mergeObjects(base, overlay) {
  if (Array.isArray(base) && Array.isArray(overlay)) return [...base, ...overlay]
  if (isObject(base) && isObject(overlay)) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(overlay)) {
      merged[key] = key in merged ? mergeObjects(merged[key], value) : value
    }
    return merged
  }
  return overlay
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function summarizeStatus(checks) {
  if (checks.some(check => check.required && check.status === 'fail')) return 'fail'
  if (checks.some(check => check.required && check.status === 'skip')) return 'partial'
  return 'pass'
}

export function runProcess(executable, args, options = {}) {
  const { cwd, env, timeoutMs = 120_000, signal } = options
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let terminationError = null
    let forceKillTimer = null
    const limit = 2_000_000
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { if (stdout.length < limit) stdout += chunk })
    child.stderr.on('data', chunk => { if (stderr.length < limit) stderr += chunk })
    const terminate = (error) => {
      if (terminationError !== null) return
      terminationError = error
      if (child.exitCode === null) child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 2_000)
      forceKillTimer.unref()
    }
    const timer = setTimeout(() => terminate(new Error(`${executable} timed out after ${timeoutMs}ms`)), timeoutMs)
    const onAbort = () => terminate(signal?.reason instanceof Error ? signal.reason : new Error(`${executable} aborted`))
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', error => {
      clearTimeout(timer)
      if (forceKillTimer !== null) clearTimeout(forceKillTimer)
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (forceKillTimer !== null) clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', onAbort)
      if (terminationError !== null) reject(terminationError)
      else resolve({ code, signal, stdout, stderr })
    })
  })
}

export async function gitSource(project) {
  try {
    const commit = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: project, timeoutMs: 10_000 })
    const status = await runProcess('git', ['status', '--porcelain'], { cwd: project, timeoutMs: 10_000 })
    if (commit.code !== 0 || status.code !== 0) return { commit: null, dirty: null }
    return { commit: commit.stdout.trim(), dirty: status.stdout.trim() !== '' }
  } catch {
    return { commit: null, dirty: null }
  }
}

export function printChecks(checks) {
  for (const check of checks) process.stdout.write(`${check.status.toUpperCase()} ${check.id}: ${check.summary}\n`)
}
