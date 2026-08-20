#!/usr/bin/env node

import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { mergeObjects, renderTemplate } from './_shared.mjs'

const HELP = `Usage: init-plugin.mjs --target <dir> --name <npm-name> --plugin-id <id> [options]

Options:
  --dsh-version <version>     Target DSH version (default: 0.1.0-rc.8)
  --cordis-version <version>  Target Cordis version (default: 4.0.1)
  --browser                   Include a Browser client entry
  --help                      Show this help
`

const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    name: { type: 'string' },
    'plugin-id': { type: 'string' },
    'dsh-version': { type: 'string', default: '0.1.0-rc.8' },
    'cordis-version': { type: 'string', default: '4.0.1' },
    browser: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})

if (values.help) {
  process.stdout.write(HELP)
  process.exit(0)
}

for (const required of ['target', 'name', 'plugin-id']) {
  if (typeof values[required] !== 'string' || values[required].trim() === '') fail(`--${required} is required`)
}
if (!/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/.test(values.name)) {
  fail(`invalid npm package name: ${values.name}`)
}
if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(values['plugin-id'])) {
  fail('--plugin-id must contain non-empty lowercase alphanumeric segments separated by single hyphens')
}
const exactSemver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
for (const key of ['dsh-version', 'cordis-version']) {
  if (!exactSemver.test(values[key])) fail(`--${key} must be an exact semver, not a range, tag, URL, or local path`)
}

const target = resolve(values.target)
let reservation = null
let targetCreatedByUs = false
if (existsSync(target)) {
  reservation = readEmptyDirectoryIdentity(target)
}

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templateRoot = join(skillRoot, 'assets', 'plugin-template')
const typeName = values['plugin-id'].split('-').map(part => `${part[0].toUpperCase()}${part.slice(1)}`).join('')
const replacements = {
  PACKAGE_NAME: values.name,
  PLUGIN_ID: values['plugin-id'],
  TYPE_NAME: typeName,
  DSH_VERSION: values['dsh-version'],
  CORDIS_VERSION: values['cordis-version'],
}

mkdirSync(dirname(target), { recursive: true })
if (reservation === null) {
  try {
    mkdirSync(target)
  } catch (error) {
    fail(`target appeared while reserving it; refusing to overwrite: ${target} (${error.message})`)
  }
  targetCreatedByUs = true
  reservation = readEmptyDirectoryIdentity(target)
}
let staging = null
try {
  staging = mkdtempSync(join(dirname(target), `.${basename(target)}.init-`))
  const basePackage = JSON.parse(renderTemplate(readFileSync(join(templateRoot, 'package.base.json'), 'utf8'), replacements))
  const packageJson = values.browser
    ? mergeObjects(basePackage, JSON.parse(renderTemplate(readFileSync(join(templateRoot, 'package.browser.json'), 'utf8'), replacements)))
    : basePackage
  writeFileSync(join(staging, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  copyRenderedTree(join(templateRoot, 'base'), staging, replacements)

  if (values.browser) copyRenderedTree(join(templateRoot, 'browser'), staging, replacements)

  mkdirSync(join(staging, 'scripts'), { recursive: true })
  cpSync(join(skillRoot, 'scripts', '_shared.mjs'), join(staging, 'scripts', '_shared.mjs'))
  cpSync(join(skillRoot, 'scripts', 'verify-package.mjs'), join(staging, 'scripts', 'verify-package.mjs'))

  assertSameEmptyDirectory(target, reservation)
  const emptyBackup = `${staging}.empty-target`
  renameSync(target, emptyBackup)
  let installed = false
  try {
    assertSameEmptyDirectory(emptyBackup, reservation)
    renameSync(staging, target)
    installed = true
    // Never recursively delete the former target. A concurrent write makes
    // rmdir fail, and the original directory is restored intact below.
    rmdirSync(emptyBackup)
  } catch (error) {
    if (installed) renameSync(target, staging)
    if (!existsSync(target) && existsSync(emptyBackup)) renameSync(emptyBackup, target)
    throw error
  }
} catch (error) {
  if (staging !== null && existsSync(staging)) rmSync(staging, { recursive: true, force: false })
  if (targetCreatedByUs && existsSync(target)) {
    try {
      assertSameEmptyDirectory(target, reservation)
      rmdirSync(target)
    } catch {
      // A changed reservation belongs to the concurrent writer; leave it intact.
    }
  }
  fail(`initialization failed without keeping a partial target: ${error.message}`)
}

process.stdout.write(`Initialized ${values.name} in ${target}\n`)
process.stdout.write(`Next: cd ${JSON.stringify(target)} && pnpm install && pnpm test && pnpm run build && pnpm run verify:package\n`)

function copyRenderedTree(source, destination, valuesMap) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true })
      copyRenderedTree(from, to, valuesMap)
      continue
    }
    if (!entry.isFile()) throw new Error(`unsupported template entry: ${from}`)
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, renderTemplate(readFileSync(from, 'utf8'), valuesMap))
  }
}

function readEmptyDirectoryIdentity(path) {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`target must be a real directory: ${path}`)
  if (readdirSync(path).length > 0) fail(`refusing to overwrite non-empty target: ${path}`)
  return { dev: stat.dev, ino: stat.ino }
}

function assertSameEmptyDirectory(path, expected) {
  if (!existsSync(path)) throw new Error(`reserved target disappeared: ${path}`)
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) {
    throw new Error(`reserved target identity changed: ${path}`)
  }
  if (readdirSync(path).length > 0) throw new Error(`reserved target became non-empty: ${path}`)
}

function fail(message) {
  process.stderr.write(`init-plugin: ${message}\n${HELP}`)
  process.exit(1)
}
