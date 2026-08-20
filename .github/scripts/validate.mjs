#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const failures = []
const files = walk(root)

for (const required of [
  'SKILL.md',
  'agents/openai.yaml',
  'assets/evidence/result.schema.json',
  'assets/evidence/provenance.schema.json',
  'assets/trust/dsh-0.1.0-rc.8.json',
  'references/publish-and-discovery.md',
  'scripts/init-plugin.mjs',
  'scripts/release-preflight.mjs',
  'scripts/verify-registry-release.mjs',
  'scripts/verify-package.mjs',
  'scripts/smoke-stock-dsh.mjs',
  'tests/lifecycle.test.mjs',
]) {
  if (!existsSync(join(root, required))) failures.push(`missing required file: ${required}`)
}

validateSkillFrontmatter()

for (const path of files.filter(path => extname(path) === '.json')) {
  try {
    JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    failures.push(`invalid JSON: ${rel(path)} (${error.message})`)
  }
}

for (const path of files.filter(path => extname(path) === '.md')) validateMarkdownLinks(path)

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`)
  process.exit(1)
}

process.stdout.write(`PASS repository validation (${files.length} files)\n`)

function validateSkillFrontmatter() {
  const path = join(root, 'SKILL.md')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) {
    failures.push('SKILL.md has no YAML frontmatter')
    return
  }
  if (!/^name:\s*dsh-plugin-best-practices\s*$/m.test(match[1])) {
    failures.push('SKILL.md frontmatter name must be dsh-plugin-best-practices')
  }
  if (!/^description:\s*\S.+$/m.test(match[1])) {
    failures.push('SKILL.md frontmatter needs a non-empty description')
  }
}

function validateMarkdownLinks(path) {
  const text = readFileSync(path, 'utf8')
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of text.matchAll(pattern)) {
    let target = match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0]
    if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    target = target.split('#')[0].split('?')[0]
    if (!target) continue
    let decoded = target
    try {
      decoded = decodeURIComponent(target)
    } catch {
      failures.push(`invalid URL encoding in ${rel(path)}: ${target}`)
      continue
    }
    const destination = resolve(dirname(path), decoded)
    if (!existsSync(destination)) failures.push(`broken relative link in ${rel(path)}: ${target}`)
  }
}

function walk(directory) {
  const output = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'artifacts') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...walk(path))
    else if (entry.isFile()) output.push(path)
  }
  return output
}

function rel(path) {
  return relative(root, path).replaceAll('\\', '/')
}
