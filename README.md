# DSH Plugin Best Practices Skill

[![Validate](https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill/actions/workflows/validate.yml/badge.svg)](https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill/actions/workflows/validate.yml)

一个面向 Codex 的社区 Skill，用于设计、实现、测试、打包和交付外部 DeepSeek Harness（DSH）插件。本项目不是 DeepSeek 官方项目。

当前统一基线：

- DSH `0.1.0-rc.8`
- Cordis `4.0.1`
- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.7.0`

## 能做什么

- 初始化 Host-only 或 Host + Browser 插件项目。
- 校验 npm 包入口、exports、files、DSH patch 和 Browser 声明。
- 对官方 npm 的 DSH rc.8 tarball 与稳定入口做完整性校验。
- 在隔离 profile 中运行 stock DSH install、dump、start 和 Browser probe smoke。
- 生成标准化的 `result.json`、`provenance.json` 与 GIF review 证据。
- 扫描敏感信息，并按 owner/runId 安全清理测试资源。
- 区分验收 GIF 与展示 GIF；只有视觉主张才要求相应媒体。

## 安装

克隆到 Codex skills 目录，并确保最终目录名为 `dsh-plugin-best-practices`：

```sh
git clone https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/dsh-plugin-best-practices"
```

重启 Codex 或开始一个新任务后，该 Skill 会在 DSH 插件相关请求中自动生效。

## 快速开始

```sh
DSH_SKILL="${CODEX_HOME:-$HOME/.codex}/skills/dsh-plugin-best-practices"

node "$DSH_SKILL/scripts/init-plugin.mjs" \
  --target ./dsh-example \
  --name dsh-example \
  --plugin-id example \
  --browser
```

生成后：

```sh
cd ./dsh-example
pnpm install
pnpm test
pnpm run build
pnpm run verify:package
```

完整工作流从 [SKILL.md](SKILL.md) 开始；具体命令见 [可执行工具箱](references/tooling.md)，版本与扩展点见 [兼容性矩阵](references/compatibility-matrix.md)。

## 目录

```text
SKILL.md                 核心决策、工作流、不变量和完成标准
references/              DSH、测试证据、GIF、GitHub 交付细则
scripts/                 初始化、包校验、stock smoke、扫描和清理工具
assets/plugin-template/  最小可构建插件模板
assets/evidence/         证据 schema、模板和独立审查提示
assets/trust/            DSH rc.8 官方 npm 发行完整性记录
agents/openai.yaml       Codex Skill 展示元数据
```

## 信任边界

`real` stock smoke 不能由调用者自行声明：工具会校验官方 npm rc.8 tarball 和包内 `lib/bin.js` 的固定摘要。npm、pnpm 或操作系统生成的命令 shim 只负责定位，不作为信任根。mock/hybrid 结果必须保留其真实执行类别和未验证范围。

## 维护与验证

仓库 CI 会检查 Skill 元数据、JSON、Markdown 相对链接、所有 Node 脚本语法、rc.8 发行完整性，并从模板生成一个 Browser 插件完成 install/test/build/package verification/pack。

本仓库采用 MIT 许可证。由模板生成的插件默认是 `UNLICENSED`，因为插件作者需要为自己的项目主动选择许可证。

## 许可证

[MIT](LICENSE)
