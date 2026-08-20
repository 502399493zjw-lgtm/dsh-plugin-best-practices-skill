# {{PACKAGE_NAME}}

External DeepSeek Harness plugin with Cordis id `{{PLUGIN_ID}}`.

## Compatibility

- DSH: `{{DSH_VERSION}}` (the unified Skill baseline; change only as part of an explicit baseline migration)
- Cordis: `{{CORDIS_VERSION}}`
- Node.js: `^22.19.0 || >=24.0.0`

## Development

```sh
pnpm install
pnpm test
pnpm run build
pnpm run verify:package
pnpm pack --pack-destination artifacts/package
```

`package.json` declares `dsh.bundle.patch`, so a successful install adds this bundle's configuration layer to the selected DSH profile. Without that declaration a package is only a dependency and is not activated.

## Contract

Document the user-visible capability, configuration, lifecycle, failure/degradation behavior, sensitive-data boundary, and verified DSH versions before implementation grows.

## Validation

Record exact commands and distinguish package validation from isolated stock DSH install/start/probe evidence.

## Distribution

After this package has been built, smoked in stock DSH, and publicly released:

```sh
dsh plugin --profile web add {{PACKAGE_NAME}}
dsh --profile web --dump-config
dsh --profile web
dsh plugin --profile web remove {{PACKAGE_NAME}}
```

For a GitHub source install, pin a full commit SHA. This template includes `prepare` so a git install can build TypeScript sources, but pnpm 10+ requires the user to approve that install-time build in the profile's `pnpm-workspace.yaml`:

```sh
dsh plugin --profile web add github:owner/repository#full-commit-sha
```

Prefer a prebuilt npm package or tarball when users should not need to grant install-time build permission.

## Release

Before public distribution, add the actual license text as `LICENSE` and initialize with `--public --repository owner/repo --license <SPDX>`, or add the equivalent package metadata manually. Publish the exact tarball that passed stock DSH smoke; do not rebuild a different artifact during publication.

```sh
pnpm run release:preflight -- \
  --tarball artifacts/package/{{TARBALL_BASENAME}}-0.1.0.tgz \
  --tag next

# Run only after explicit publication authorization:
npm publish artifacts/package/{{TARBALL_BASENAME}}-0.1.0.tgz \
  --access public --tag next

pnpm run release:verify -- \
  --package {{PACKAGE_NAME}}@0.1.0 \
  --expected-tarball artifacts/package/{{TARBALL_BASENAME}}-0.1.0.tgz \
  --expect-tag next
```

Use `next` for prereleases and reserve `latest` for a stable release that has passed the same gates. Re-run a stock DSH install using the registry package coordinate before announcing the release.

## License

The generated package starts as `UNLICENSED` unless `--license` is supplied. Choosing an SPDX identifier does not create a license grant by itself; add the corresponding `LICENSE` text before public distribution.
