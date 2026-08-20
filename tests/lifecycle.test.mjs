import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  normalizeGitHubRepository,
  parseNpmJson,
  parsePackageCoordinate,
  validateDistTag,
  validateSpdxExpression,
} from '../scripts/_release.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('release helpers normalize public package metadata', () => {
  assert.deepEqual(parsePackageCoordinate('@scope/dsh-demo@1.2.3-rc.1'), {
    name: '@scope/dsh-demo',
    version: '1.2.3-rc.1',
  })
  assert.deepEqual(normalizeGitHubRepository('owner/dsh-demo'), {
    repository: { type: 'git', url: 'git+https://github.com/owner/dsh-demo.git' },
    homepage: 'https://github.com/owner/dsh-demo#readme',
    bugs: { url: 'https://github.com/owner/dsh-demo/issues' },
  })
  assert.equal(validateDistTag('next'), 'next')
  assert.equal(validateSpdxExpression('MIT OR Apache-2.0'), 'MIT OR Apache-2.0')
  assert.deepEqual(parseNpmJson('npm notice ignored\n{"name":"dsh-demo","version":"1.0.0"}\n'), {
    name: 'dsh-demo',
    version: '1.0.0',
  })
  assert.throws(() => validateDistTag('1.2.3'), /must not be a semantic version/)
  assert.throws(() => validateSpdxExpression('UNLICENSED'), /public distribution/)
})

test('public initialization requires repository and license metadata', () => {
  withTemp('dsh-init-missing-', temporary => {
    const target = join(temporary, 'plugin')
    const result = runNode('scripts/init-plugin.mjs', [
      '--target', target,
      '--name', '@scope/dsh-demo',
      '--plugin-id', 'demo',
      '--public',
      '--license', 'MIT',
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /--repository is required with --public/)
    assert.equal(existsSync(target), false)
  })
})

test('public initialization emits npm and GitHub distribution metadata', () => {
  withTemp('dsh-init-public-', temporary => {
    const target = join(temporary, 'plugin')
    const result = runNode('scripts/init-plugin.mjs', [
      '--target', target,
      '--name', '@scope/dsh-demo',
      '--plugin-id', 'demo',
      '--browser',
      '--public',
      '--repository', 'owner/dsh-demo',
      '--license', 'MIT',
    ])
    assert.equal(result.status, 0, result.stderr)
    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
    assert.equal(manifest.license, 'MIT')
    assert.deepEqual(manifest.repository, {
      type: 'git',
      url: 'git+https://github.com/owner/dsh-demo.git',
    })
    assert.equal(manifest.homepage, 'https://github.com/owner/dsh-demo#readme')
    assert.equal(manifest.bugs.url, 'https://github.com/owner/dsh-demo/issues')
    assert.deepEqual(manifest.publishConfig, {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    })
    const generatedReadme = readFileSync(join(target, 'README.md'), 'utf8')
    assert.match(generatedReadme, /artifacts\/package\/scope-dsh-demo-0\.1\.0\.tgz/)
    assert.doesNotMatch(generatedReadme, /<exact-package-file>|\{\{TARBALL_BASENAME\}\}/)
  })
})

test('sensitive scan reports a redacted location, never the matched value', () => {
  withTemp('dsh-scan-negative-', temporary => {
    const secret = `ghp_${'A'.repeat(24)}`
    writeFileSync(join(temporary, 'source.txt'), `token=${secret}\n`)
    const result = runNode('scripts/scan-sensitive.mjs', ['--project', temporary])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /matched value is redacted/)
    assert.equal(`${result.stdout}\n${result.stderr}`.includes(secret), false)
  })
})

test('cleanup refuses an unowned directory and leaves it intact', () => {
  withTemp('dsh-cleanup-negative-', temporary => {
    const target = join(temporary, 'target')
    mkdirSync(target)
    const manifest = join(temporary, 'resources.json')
    writeFileSync(manifest, `${JSON.stringify({
      schemaVersion: '1.0',
      owner: 'dsh-plugin-best-practices',
      runId: 'negative-test',
      resources: [{ type: 'directory', path: target, marker: '.dsh-plugin-resource.json' }],
    })}\n`)
    const result = runNode('scripts/cleanup-test-resources.mjs', ['--manifest', manifest, '--execute'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /resource marker is missing/)
    assert.equal(existsSync(target), true)
  })
})

test('release preflight and registry verification use an exact tarball without publishing', () => {
  withTemp('dsh-release-', temporary => {
    const project = join(temporary, 'project')
    const evidence = join(temporary, 'evidence')
    const tarball = join(temporary, 'scope-dsh-demo-1.0.0-rc.1.tgz')
    const fakeNpm = join(temporary, 'fake-npm.mjs')
    mkdirSync(project)
    writeFileSync(join(project, 'package.json'), `${JSON.stringify(publicManifest(), null, 2)}\n`)
    writeFileSync(join(project, 'cordis.patch.yml'), "- insert:\n    - id: demo\n      name: '@scope/dsh-demo'\n")
    writeFileSync(join(project, 'README.md'), '# DSH demo\n')
    writeFileSync(join(project, 'LICENSE'), 'MIT License fixture\n')
    writeFileSync(tarball, 'exact-smoked-tarball-bytes')
    writeFakeNpm(fakeNpm)
    initializeGit(project)

    const preflight = runNode('scripts/release-preflight.mjs', [
      '--project', project,
      '--tarball', tarball,
      '--tag', 'next',
      '--npm', fakeNpm,
      '--result', join(evidence, 'preflight', 'result.json'),
    ], { EXPECTED_TARBALL: tarball })
    assert.equal(preflight.status, 0, preflight.stderr)
    assert.match(preflight.stdout, /release-preflight: pass/)

    const occupied = runNode('scripts/release-preflight.mjs', [
      '--project', project,
      '--tarball', tarball,
      '--tag', 'next',
      '--npm', fakeNpm,
    ], { EXPECTED_TARBALL: tarball, FAKE_NPM_EXISTING: '1' })
    assert.equal(occupied.status, 1)
    assert.match(occupied.stdout, /already exists and cannot be overwritten/)

    const verification = runNode('scripts/verify-registry-release.mjs', [
      '--package', '@scope/dsh-demo@1.0.0-rc.1',
      '--expected-tarball', tarball,
      '--expect-tag', 'next',
      '--attempts', '1',
      '--npm', fakeNpm,
      '--result', join(evidence, 'registry', 'result.json'),
    ], { EXPECTED_TARBALL: tarball })
    assert.equal(verification.status, 0, verification.stderr)
    assert.match(verification.stdout, /verify-registry-release: pass/)

    const preflightResult = JSON.parse(readFileSync(join(evidence, 'preflight', 'result.json'), 'utf8'))
    const registryResult = JSON.parse(readFileSync(join(evidence, 'registry', 'result.json'), 'utf8'))
    assert.equal(preflightResult.kind, 'npm-release-preflight')
    assert.equal(registryResult.kind, 'npm-registry-release-verification')
    assert.equal(existsSync(join(evidence, 'preflight', 'provenance.json')), true)
    assert.equal(existsSync(join(evidence, 'registry', 'provenance.json')), true)
  })
})

function publicManifest() {
  return {
    name: '@scope/dsh-demo',
    version: '1.0.0-rc.1',
    description: 'Public DSH demo plugin.',
    type: 'module',
    main: 'lib/index.js',
    files: ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE'],
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/owner/dsh-demo.git' },
    homepage: 'https://github.com/owner/dsh-demo#readme',
    bugs: { url: 'https://github.com/owner/dsh-demo/issues' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    peerDependencies: { '@deepseek-ai/cordis': '4.0.1' },
  }
}

function writeFakeNpm(path) {
  writeFileSync(path, `#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
if (args[0] === 'whoami') {
  process.stdout.write('test-user\\n')
} else if (args[0] === 'publish' && args.includes('--dry-run')) {
  process.stdout.write(JSON.stringify({ name: '@scope/dsh-demo', version: '1.0.0-rc.1' }) + '\\n')
} else if (args[0] === 'view' && args[2] === 'version') {
  if (process.env.FAKE_NPM_EXISTING === '1') {
    process.stdout.write(JSON.stringify('1.0.0-rc.1') + '\\n')
  } else {
    process.stderr.write('E404 Not Found\\n')
    process.exitCode = 1
  }
} else if (args[0] === 'view' && args[2] === 'dist-tags') {
  process.stdout.write(JSON.stringify({ next: '1.0.0-rc.1' }) + '\\n')
} else if (args[0] === 'view') {
  process.stdout.write(JSON.stringify({
    name: '@scope/dsh-demo',
    version: '1.0.0-rc.1',
    dist: { tarball: 'https://registry.npmjs.org/@scope/dsh-demo/-/dsh-demo-1.0.0-rc.1.tgz' },
  }) + '\\n')
} else if (args[0] === 'pack') {
  const destination = args[args.indexOf('--pack-destination') + 1]
  mkdirSync(destination, { recursive: true })
  copyFileSync(process.env.EXPECTED_TARBALL, join(destination, 'scope-dsh-demo-1.0.0-rc.1.tgz'))
  process.stdout.write(JSON.stringify([{ filename: 'scope-dsh-demo-1.0.0-rc.1.tgz' }]) + '\\n')
} else {
  process.stderr.write('unsupported fake npm invocation: ' + JSON.stringify(args) + '\\n')
  process.exitCode = 2
}
`)
  chmodSync(path, 0o755)
}

function initializeGit(project) {
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Lifecycle Test'],
    ['config', 'user.email', 'lifecycle@example.invalid'],
    ['add', '.'],
    ['commit', '--quiet', '-m', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: project, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
}

function runNode(script, args, env = {}) {
  return spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function withTemp(prefix, callback) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  try {
    callback(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
