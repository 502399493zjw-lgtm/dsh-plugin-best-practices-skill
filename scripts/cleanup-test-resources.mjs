#!/usr/bin/env node

import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import { parse, relative, resolve } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { parseArgs } from 'node:util'
import { runProcess, OWNER, readJson } from './_shared.mjs'

const HELP = `Usage: cleanup-test-resources.mjs --manifest <resources.json> [--allow-root <dir> ...] [--execute]\n
Default is dry-run. Directories require an owner/runId marker. Processes require a command marker containing runId.\n`
const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    'allow-root': { type: 'string', multiple: true, default: [] },
    execute: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})
if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}
if (!values.manifest) fail('--manifest is required')

const manifestPath = resolve(values.manifest)
const manifest = readJson(manifestPath)
if (manifest.owner !== OWNER) fail(`owner must be ${OWNER}`)
if (typeof manifest.runId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(manifest.runId)) fail('runId is invalid')
if (!Array.isArray(manifest.resources)) fail('resources must be an array')

const repoRootResult = await runProcess('git', ['rev-parse', '--show-toplevel'], { timeoutMs: 10_000 }).catch(() => null)
const repoRoot = repoRootResult?.code === 0 ? safeRealpath(repoRootResult.stdout.trim()) : null
const currentRoot = safeRealpath(process.cwd())
const userHome = safeRealpath(homedir())
const allowedRoots = [resolve(tmpdir()), ...values['allow-root'].map(item => resolve(item))].map(root => {
  const realRoot = safeRealpath(root)
  assertAllowedRoot(realRoot)
  return realRoot
})
const actions = []
for (const resource of manifest.resources) {
  if (resource?.type === 'directory') actions.push(validateDirectory(resource))
  else if (resource?.type === 'process') actions.push(await validateProcess(resource))
  else fail(`unsupported resource type: ${resource?.type}`)
}

for (const action of actions) {
  process.stdout.write(`${values.execute ? 'EXECUTE' : 'DRY-RUN'} ${action.description}\n`)
  if (values.execute) await action.execute()
}
process.stdout.write(`cleanup-test-resources: ${values.execute ? 'completed' : 'validated; rerun with --execute'}\n`)

function validateDirectory(resource) {
  if (typeof resource.path !== 'string' || typeof resource.marker !== 'string') fail('directory resource requires path and marker')
  const target = resolve(resource.path)
  if (!existsSync(target)) return { description: `directory already absent ${target}`, execute: async () => {} }
  const stat = lstatSync(target)
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`directory target must be a real directory: ${target}`)
  const realTarget = realpathSync(target)
  assertTargetNotProtected(realTarget)
  if (!insideAnyRoot(realTarget)) fail(`directory resolves outside allowed roots: ${realTarget}`)
  const markerPath = resolve(realTarget, resource.marker)
  if (!inside(realTarget, markerPath) || !existsSync(markerPath)) fail(`resource marker is missing: ${markerPath}`)
  const markerStat = lstatSync(markerPath)
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) fail(`resource marker must be a regular file: ${markerPath}`)
  const marker = readJson(markerPath)
  if (marker.owner !== OWNER || marker.runId !== manifest.runId) fail(`resource marker owner/runId mismatch: ${markerPath}`)
  return {
    description: `remove owned directory ${realTarget}`,
    execute: async () => {
      const current = lstatSync(realTarget)
      if (!current.isDirectory() || current.isSymbolicLink()) fail(`directory target changed after validation: ${realTarget}`)
      const currentMarkerStat = lstatSync(markerPath)
      if (!currentMarkerStat.isFile() || currentMarkerStat.isSymbolicLink()) fail(`resource marker changed type after validation: ${markerPath}`)
      const currentMarker = readJson(markerPath)
      if (currentMarker.owner !== OWNER || currentMarker.runId !== manifest.runId) fail(`resource marker changed after validation: ${markerPath}`)
      rmSync(realTarget, { recursive: true, force: false })
    },
  }
}

async function validateProcess(resource) {
  if (!Number.isInteger(resource.pid) || resource.pid <= 1) fail('process resource requires pid > 1')
  if (typeof resource.commandIncludes !== 'string' || !resource.commandIncludes.includes(manifest.runId)) {
    fail('process commandIncludes must contain runId')
  }
  const inspected = await runProcess('ps', ['eww', '-p', String(resource.pid), '-o', 'command='], { timeoutMs: 10_000 })
  if (inspected.code !== 0 || inspected.stdout.trim() === '') {
    return { description: `process already absent ${resource.pid}`, execute: async () => {} }
  }
  if (!inspected.stdout.includes(resource.commandIncludes)) fail(`process ${resource.pid} does not match its unique command marker`)
  return {
    description: `terminate owned process ${resource.pid}`,
    execute: async () => {
      const current = await runProcess('ps', ['eww', '-p', String(resource.pid), '-o', 'command='], { timeoutMs: 10_000 })
      if (current.code !== 0 || current.stdout.trim() === '') return
      if (!current.stdout.includes(resource.commandIncludes)) fail(`process ${resource.pid} changed after validation`)
      process.kill(resource.pid, 'SIGTERM')
      const deadline = Date.now() + 3_000
      while (Date.now() < deadline) {
        if (!processExists(resource.pid)) return
        await new Promise(resolveWait => setTimeout(resolveWait, 100))
      }
      fail(`process ${resource.pid} did not stop after SIGTERM`)
    },
  }
}

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

function insideAnyRoot(path) {
  return allowedRoots.some(root => inside(root, path))
}

function assertAllowedRoot(root) {
  if (root === parse(root).root) fail(`refusing broad filesystem root: ${root}`)
  if (root === userHome || inside(root, userHome)) fail(`refusing user home or its ancestor as an allowed root: ${root}`)
  if (root === currentRoot) fail(`refusing current workspace root as an allowed root: ${root}`)
  if (repoRoot !== null && root === repoRoot) fail(`refusing Git repository root as an allowed root: ${root}`)
}

function assertTargetNotProtected(target) {
  const isAllowedRoot = allowedRoots.includes(target)
  const containsCurrentWorkspace = target === currentRoot || inside(target, currentRoot)
  const containsRepository = repoRoot !== null && (target === repoRoot || inside(target, repoRoot))
  if (target === parse(target).root || target === userHome || isAllowedRoot || containsCurrentWorkspace || containsRepository) {
    fail(`refusing protected directory target: ${target}`)
  }
}

function safeRealpath(path) {
  try {
    return realpathSync(path)
  } catch (error) {
    fail(`allowed/protected root cannot be resolved: ${path}: ${error.message}`)
  }
}

function inside(root, path) {
  const rel = relative(root, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function fail(message) {
  process.stderr.write(`cleanup-test-resources: ${message}\n${HELP}`)
  process.exit(1)
}
