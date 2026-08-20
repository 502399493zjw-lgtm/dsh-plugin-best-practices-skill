import { dirname, join, resolve } from 'node:path'

const EXACT_SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/

export function parsePackageCoordinate(coordinate) {
  if (typeof coordinate !== 'string') throw new Error('package coordinate is required')
  const separator = coordinate.lastIndexOf('@')
  if (separator <= 0) throw new Error('package coordinate must be <name>@<exact-version>')
  const name = coordinate.slice(0, separator)
  const version = coordinate.slice(separator + 1)
  if (!PACKAGE_NAME.test(name)) throw new Error(`invalid npm package name: ${name}`)
  if (!EXACT_SEMVER.test(version)) throw new Error(`package version must be exact semver: ${version}`)
  return { name, version }
}

export function normalizeGitHubRepository(repository) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('--repository must use the GitHub owner/repo form')
  }
  const [owner, rawRepo] = repository.split('/')
  const repo = rawRepo.replace(/\.git$/i, '')
  if (!owner || !repo) throw new Error('--repository must use the GitHub owner/repo form')
  const web = `https://github.com/${owner}/${repo}`
  return {
    repository: { type: 'git', url: `git+${web}.git` },
    homepage: `${web}#readme`,
    bugs: { url: `${web}/issues` },
  }
}

export function validateDistTag(tag) {
  if (typeof tag !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) {
    throw new Error('dist-tag must contain only letters, digits, dot, underscore, or hyphen')
  }
  if (EXACT_SEMVER.test(tag)) throw new Error('dist-tag must not be a semantic version')
  return tag
}

export function validateSpdxExpression(license) {
  if (typeof license !== 'string' || license.length === 0 || license.length > 200) {
    throw new Error('license must be a non-empty SPDX expression')
  }
  if (/^(?:UNLICENSED|SEE LICENSE IN\b)/i.test(license)) {
    throw new Error('public distribution requires an SPDX license expression')
  }
  if (!/^[A-Za-z0-9.+() -]+$/.test(license)) {
    throw new Error('license must be an SPDX expression without URLs or file paths')
  }
  return license
}

export function parseNpmJson(stdout) {
  const text = String(stdout).trim()
  if (text === '') throw new Error('npm returned no JSON output')
  const lines = text.split(/\r?\n/)
  for (let start = 0; start < lines.length; start++) {
    const candidate = lines.slice(start).join('\n').trim()
    try {
      return JSON.parse(candidate)
    } catch {
      // npm may prefix otherwise valid JSON with informational lines.
    }
  }
  throw new Error('npm returned malformed JSON output')
}

export function evidencePaths(result, provenance) {
  const resultPath = result
    ? resolve(result)
    : provenance ? join(dirname(resolve(provenance)), 'result.json') : null
  const provenancePath = provenance
    ? resolve(provenance)
    : result ? join(dirname(resolve(result)), 'provenance.json') : null
  if (resultPath !== null && resultPath === provenancePath) {
    throw new Error('result and provenance paths must be distinct')
  }
  return { resultPath, provenancePath }
}

export function normalizeRegistry(registry) {
  let url
  try {
    url = new URL(registry)
  } catch {
    throw new Error('registry must be an absolute HTTPS URL')
  }
  if (url.protocol !== 'https:') throw new Error('registry must be an absolute HTTPS URL')
  url.hash = ''
  url.search = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.toString()
}

export function isExactSemver(value) {
  return EXACT_SEMVER.test(value)
}
