# DSH Plugin Best Practices Skill

[![Validate](https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill/actions/workflows/validate.yml/badge.svg)](https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill/actions/workflows/validate.yml)

一套供 **AI Coding Agent** 构建、验证和交付外部 DeepSeek Harness（DSH）插件的工程规范与可执行工具箱。任何能读取 Markdown、运行 Node.js 与 Shell 的 Agent 都可以使用；Codex 还可自动发现该 Skill。

当前基线：DSH `0.1.0-rc.8`、Cordis `4.0.1`、Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`。本项目不是 DeepSeek 官方项目。

## 为什么需要

DSH 插件目前有两个常见问题：

1. **交付可信度不足**：源码能运行，不等于 npm 包能被未修改的 stock DSH 安装；mock 能演示，也不等于真实链路兼容。
2. **安装前缺少感知**：很多插件只有名称和文字说明，用户安装前不知道界面、交互和实际价值，试错成本很高。

这个 Skill 把插件交付统一成：独立项目、目标版本、可安装 tarball、stock DSH 验证、可追溯证据，以及面向用户的预览素材。

## 安装前先看到插件

对于有用户可见界面或交互价值的插件，Skill 要求 GitHub 交付同步一段**展示 GIF/短动画**。它不是装饰，而是让用户在安装前快速回答：

- 插件解决什么问题？
- 装好后大体是什么样？
- 最典型的操作路径是什么？
- 这段表现来自真实插件还是 mock？

展示动画应来自目标代码树，标明 commit/dirty 状态与 real/mock 范围，不暴露凭证。它可以与验收 GIF 复用，但只有覆盖既定用例和标准时才同时承担验收职责。Host-only 或无视觉价值的改动不强制制作 GIF。

```text
插件代码
   │
   ▼
test → build → verify → pack
   │
   ├─ stock DSH rc.8 smoke ──> 兼容性证据
   ├─ localhost 现场预览 ────> 用户亲手体验
   └─ GitHub 展示 GIF ───────> 安装前理解价值
                                      │
                                      ▼
                              DSH Market 插件详情
                         预览表现 → 查看能力/兼容性 → 决定安装
```

与 DSH Market 结合时，GitHub 中标准化的展示动画、功能说明、版本与验证信息可以成为市场详情页素材，形成接近 App Store 的体验：用户先看表现和能力，再决定是否安装，而不是安装后才发现不符合预期。

现场预览、自动 smoke 和展示 GIF 各自解决不同问题：现场预览用于自由探索，smoke 用断言和 provenance 证明结论，GIF 用于 GitHub 与市场中的异步预览。

## 整体开发与交付流程

```text
stock DSH rc.8（目标运行时，不直接改核心）
                         ▲
                         │ 安装并验证目标 tarball
                         │
独立插件项目 ── main 稳定基线
      │
      ├─ 干净的专用工作区：任务分支
      └─ 并行/脏工作区/PR：branch + worktree
                         │
                         ▼
契约与用例 → 实现 → 测试 → build/verify/pack
                         │
                         ▼
stock smoke / 用户现场预览 / 展示 GIF
                         │
                         ▼
敏感扫描 → GitHub PR/CI → 按 owner/runId 清理
```

插件必须拥有自己的依赖、测试、版本和发布边界。直接修改 DSH 源码，会让核心改动与插件改动混在一起，也无法证明插件能被未修改的 stock DSH 安装。`main` 保留稳定基线；worktree 按并行度、工作区状态和 PR 需求使用，不是一刀切要求。

## 关键门禁

- 固定 DSH rc.8 与 Cordis 4.0.1，区分插件 peer 声明和真实 runtime provenance。
- 校验 npm 入口、exports、files、DSH patch、Host/Browser 声明和实际 tarball。
- `real` stock smoke 校验官方发行物摘要，不能由 fake DSH 或 wrapper 自报。
- Host 持有凭证和特权 I/O；Browser、日志、GIF 与证据只包含最小脱敏数据。
- 先定义用例和标准，再构建验收证据；展示 GIF 负责表达价值，是否复用由 Agent 判断。
- GitHub 交付核对远程 commit、CI 与媒体实际渲染；未经授权不合并、不发 npm、不创建 Release。

## 可执行工具箱

- `init-plugin.mjs`：初始化 Host-only 或 Host + Browser 独立插件。
- `verify-package.mjs`：检查包入口、exports/files、patch 和 Browser 声明。
- `smoke-stock-dsh.mjs`：在隔离 profile 中完成 install、dump、start 和 probe。
- `scan-sensitive.mjs`：扫描准备提交的代码、证据和媒体。
- `cleanup-test-resources.mjs`：按 owner marker 与 runId 安全清理资源。

证据统一为 `result.json`、`provenance.json` 和按需生成的 GIF review。具体命令见 [可执行工具箱](references/tooling.md)，版本与扩展点见 [兼容性矩阵](references/compatibility-matrix.md)。

## 给任意 Agent 使用

克隆仓库后，把下面的要求交给 Agent：

```text
完整读取 <repo>/SKILL.md。
使用该 Skill 完成当前 DSH 插件任务，并只按路由读取相关 references。
执行适用脚本；准确报告版本、commit、real/mock 和未验证范围。
```

`SKILL.md`、`references/`、`scripts/` 和 `assets/` 不依赖 Codex。其他 Agent 平台可以将仓库接入自己的 Skill/Rule 自动发现机制。

### Codex 安装

```sh
git clone https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/dsh-plugin-best-practices"
```

重启 Codex 或开始新任务后生效。`agents/openai.yaml` 只是 Codex 适配层，不限制其他 Agent 使用。

## 快速开始

```sh
DSH_SKILL=/path/to/dsh-plugin-best-practices-skill

node "$DSH_SKILL/scripts/init-plugin.mjs" \
  --target ./dsh-example \
  --name dsh-example \
  --plugin-id example \
  --browser

cd ./dsh-example
pnpm install
pnpm test
pnpm run build
pnpm run verify:package
```

完整工作流从 [SKILL.md](SKILL.md) 开始。仓库 CI 会验证 Skill 结构、脚本语法、rc.8 发行完整性，并生成 Browser 插件 fixture 完成 test、build、package verification 和 pack。

## 许可证

[MIT](LICENSE)。由模板生成的插件默认是 `UNLICENSED`，插件作者需要主动选择自己的许可证。
