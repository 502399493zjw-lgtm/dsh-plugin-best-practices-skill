import type { UserConfig } from 'tsdown'

const host: UserConfig = {
  name: '{{PACKAGE_NAME}}',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  fixedExtension: false,
  platform: 'node',
  target: 'es2024',
  clean: true,
  dts: false,
  deps: { neverBundle: ['@deepseek-ai/cordis'] },
}

export default host
