# DSH Publish and Discovery Lifecycle Implementation Plan

> **For Codex:** Execute this plan in the current worktree. Keep all changes local unless the user separately authorizes commit, push, npm publication, GitHub Release creation, Topic mutation, or directory submission.

**Goal:** Extend the DSH plugin best-practices Skill from development/package verification through safe npm or GitHub distribution, registry verification, discovery, and retirement.

**Architecture:** Keep `SKILL.md` as a concise router. Put conditional release mechanics in one new reference, add read-only release verification scripts that reuse the existing evidence pair, and make public metadata an explicit opt-in of the generated plugin template. Exercise the scripts and generated fixture in CI, including a real stock DSH rc.8 tarball smoke.

**Tech Stack:** Node.js 24 ESM and built-ins, npm/pnpm CLI, GitHub Actions, Markdown, JSON/YAML manifests.

---

## Global constraints

- Distinguish an installable DSH Bundle (`dsh.bundle`) from an Agent Skill; never present the latter as installable through `dsh plugin add`.
- Treat npm publish, dist-tag changes, GitHub Topic changes, Release creation, and community-directory PRs as separately authorized external mutations.
- Publish the exact tarball that passed package validation and stock DSH smoke; do not silently rebuild from a different source state.
- Keep DSH `0.1.0-rc.8`, Cordis `4.0.1`, Node.js `^22.19.0 || >=24.0.0`, and pnpm `11.7.0` as the active baseline.
- Do not log npm credentials or matched secret values; generated evidence remains gitignored by default.

## Task 1: Add failing behavioral coverage

**Files:**

- Create: `tests/lifecycle.test.mjs`
- Modify: `.github/workflows/validate.yml`

- [x] Add a test that requires public template initialization to reject missing repository/license metadata.
- [x] Add a test that requires public initialization to generate repository, homepage, bugs, license, and npm publish configuration.
- [x] Add negative tests proving the sensitive scanner redacts matched values and cleanup refuses an unowned directory.
- [x] Add pure release-helper tests for package coordinates, dist-tags, and npm JSON parsing.
- [x] Run `node --test tests/*.test.mjs` and confirm the public-init/release-helper expectations pass after implementation.

## Task 2: Implement public template metadata safely

**Files:**

- Modify: `scripts/init-plugin.mjs`
- Modify: `assets/plugin-template/base/README.md`
- Modify: `references/tooling.md`

- [x] Add explicit `--public`, `--repository <owner/repo>`, and `--license <SPDX>` initialization options.
- [x] Require repository and a non-`UNLICENSED` SPDX expression when `--public` is selected.
- [x] Generate normalized GitHub repository/homepage/bugs fields and public npm registry configuration only for the public mode.
- [x] Document the generated install, removal, pack, and release-preflight commands without claiming that initialization publishes anything.
- [x] Re-run the focused tests and generated fixture validation.

## Task 3: Add release preflight and post-publish verification

**Files:**

- Create: `scripts/_release.mjs`
- Create: `scripts/release-preflight.mjs`
- Create: `scripts/verify-registry-release.mjs`
- Modify: `references/tooling.md`
- Modify: `references/evidence-schema.md`

- [x] Implement deterministic helpers for npm package coordinates, repository metadata, tags, and JSON command output.
- [x] Implement a read-only preflight that checks clean source, public metadata, authenticated registry identity, package-version absence, explicit dist-tag, and the exact tarball's npm dry-run metadata/checksum.
- [x] Implement bounded post-publish verification that downloads the registry tarball, compares it byte-for-byte by SHA-256 with the smoked artifact, and verifies explicitly requested dist-tags.
- [x] Emit the existing `result.json`/`provenance.json` evidence pair without exposing credentials.
- [x] Test success and failure paths with isolated fake npm commands; do not contact or mutate the real registry in unit tests.

## Task 4: Add the lifecycle reference and Skill routing

**Files:**

- Create: `references/publish-and-discovery.md`
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `agents/openai.yaml`

- [x] Document Bundle versus Agent Skill classification and the effect of omitting `dsh.bundle`.
- [x] Document the ordered npm path: auth/version checks, tests/build/package gates, exact tarball smoke, exact-artifact publication, registry byte/tag verification, and package-name stock smoke.
- [x] Document GitHub `#commit-sha` installs, `prepare`, pnpm 10+ `allowBuilds`, and the preference for prebuilt npm/tarball delivery.
- [x] Route Topic and community-directory discovery only after classification; record the current `dsh.bundle`, age, commit-count, Topic, entry-file, and accurate-description gates.
- [x] Document deprecation/archive boundaries and recovery-safe stopping conditions.
- [x] Keep the entrypoint concise and point publishing tasks to the new reference.

## Task 5: Strengthen repository CI and validation

**Files:**

- Modify: `.github/scripts/validate.mjs`
- Modify: `.github/workflows/validate.yml`

- [x] Require the lifecycle reference, release scripts, and behavioral tests in repository validation.
- [x] Run Node behavioral tests in CI.
- [x] Install the pinned stock DSH rc.8 runtime and run the generated Browser fixture tarball through `smoke-stock-dsh.mjs` with the trusted entry checksum.
- [x] Keep the workflow read-only with respect to npm and GitHub remotes.

## Task 6: Validate and self-review

**Files:**

- Review all changed files.

- [x] Run `node --test tests/*.test.mjs`.
- [x] Run `node .github/scripts/validate.mjs` and `node --check` for every script.
- [x] Run the Skill Creator `quick_validate.py` against the repository.
- [x] Generate a public Browser fixture, install dependencies, test, build, verify, scan, pack, and run a real stock DSH rc.8 smoke using the exact tarball.
- [x] Run `git diff --check`, inspect the complete diff, and report local status plus any network-only checks not performed.
