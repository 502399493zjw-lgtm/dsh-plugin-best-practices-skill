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
pnpm pack
```

## Contract

Document the user-visible capability, configuration, lifecycle, failure/degradation behavior, sensitive-data boundary, and verified DSH versions before implementation grows.

## Validation

Record exact commands and distinguish package validation from isolated stock DSH install/start/probe evidence.

## License

The generated package starts as `UNLICENSED`. Choose a license deliberately and add the corresponding `LICENSE` file before public distribution.
