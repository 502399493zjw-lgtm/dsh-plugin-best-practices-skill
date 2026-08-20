# DSH Plugin Best Practices Skill

[![Validate](https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill/actions/workflows/validate.yml/badge.svg)](https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill/actions/workflows/validate.yml)

一套供 **AI Coding Agent** 构建、验证和交付外部 DeepSeek Harness（DSH）插件的工程规范与可执行工具箱。任何能够读取 Markdown、运行 Node.js 与 Shell 的 Agent 都可以使用；仓库同时提供 Codex 的原生 Skill 元数据和自动发现方式。

本项目不是 DeepSeek 官方项目。

当前统一基线：DSH `0.1.0-rc.8`、Cordis `4.0.1`、Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`。

## 为什么需要这个 Skill

Agent 通常会写 TypeScript，也会运行测试。真正困难的是避免把一个“看起来完成”的插件误交付成“真的可安装、可兼容、可复验”的插件。

我们在此前的插件交付，以及随后把经验工具化的审查中，反复遇到三种交付错觉：

1. **源码能构建，不代表 npm tarball 的入口、exports、files 和 patch 真能被 DSH 安装。**
2. **mock 或包装脚本能跑，不代表官方 stock DSH 的真实链路兼容。**
3. **GIF 看起来正确，不代表它覆盖了验收用例、来自目标 commit，或没有遮住失败状态。**

这个 Skill 的价值不是再写一份最佳实践文档，而是把踩坑后形成的判断固化成：

- Agent 在关键节点必须做出的决策；
- 可直接执行且默认失败关闭的工具；
- 能追溯版本、commit、real/mock 和未验证范围的证据；
- 与风险相称的完成标准，而不是一刀切流程。

最终目标是减少“开发完成以后才发现不能安装”“mock 被当成真实兼容”“PR 有演示却无法验收”这类返工。

## 我们踩过的坑，以及现在如何兜底

| 真实踩坑 | 没有统一 Skill 会怎样 | 当前兜底 |
|---|---|---|
| fake DSH 或 wrapper 可以由调用者自报 `execution=real`，甚至生成“stock pass” | mock 被误报成官方 DSH 兼容，错误结论进入 PR | `real` 模式必须核对官方 npm rc.8 tarball、固定 SHA-256 和包内稳定入口；mock/hybrid 明确标注未验证范围 |
| DSH 版本曾用字符串包含判断，`rc.8` 可能误接受相似版本；Cordis peer range 还曾被写成运行时版本 | 兼容矩阵和证据看起来精确，实际验证的却不是目标运行时 | rc.8 与 Cordis 4.0.1 精确固定；区分插件 peer 声明和实际 runtime provenance |
| 包校验曾接受目录作为入口、遗漏 conditional exports，并把可选 `dsh.client.inject` 当成必填 | verifier 通过，但发布包无法 import、Browser loader 无法加载或合法插件被误杀 | `verify-package` 校验真实文件、exports/files 覆盖、patch、Host/Browser 成对声明；发布面再叠加 `pnpm pack` 和 stock smoke |
| 初始化模板最早只测试导出名称，没有真正组合、激活和 dispose Cordis Context | 测试是绿的，插件进入 Host 生命周期后仍可能失败或泄漏资源 | 模板包含 Cordis 组合测试；CI 每次真实生成 Browser fixture，完成 test/build/verify/pack |
| smoke 曾继承完整 `process.env`，并持久化原始 stdout/stderr、错误行和机器路径 | GitHub 证据可能泄露 token、账号路径或内部环境 | 被测进程使用最小环境；结果摘要脱敏；提交前执行敏感信息扫描，证据明确记录扫描状态 |
| fetch 没有超时，信号中断不清理子进程；清理器一度能接受 `/` 等宽泛根目录 | 测试卡死、遗留 DSH/profile/端口，甚至可能删除不属于本次任务的文件 | 网络和进程有超时/信号清理；资源必须带 owner marker 与 runId；硬拒绝根目录、home、仓库根等危险目标 |
| `result.json` 与 `provenance.json` 契约曾不一致、路径碰撞会互相覆盖，空 checks 也可能得到 pass | 证据存在但不可审计，或者关键 provenance 被静默覆盖 | 两类证据使用 schema、不同路径和至少一项检查；记录 commit、版本、命令、execution、清理结果与未验证范围 |
| 一开始把验收 GIF 和展示 GIF 混在一起，也曾倾向于所有 Browser/PR 改动都强制 GIF | Agent 可能先录一个好看的 mock，再倒推验收；或给无视觉价值的改动制造媒体负担 | 先写用例和标准，再构建验收 GIF；验收证据独立审查；展示 GIF 只负责表达功能价值，是否复用由 Agent 判断 |
| GitHub 交付容易停在“push 成功”，没有确认远程 head、required checks 和媒体实际渲染 | 本地报告的 commit 与 PR 不一致，CI 失败或 GIF 链接损坏仍被称为完成 | GitHub 闭环要求核对远程 SHA、CI、实际渲染和未验证风险；未经授权不合并、不发 npm、不创建 Release |

这些不是要让每个小改动都跑最重流程。Skill 会根据改动和对外主张选择验证强度：纯文档不强制 stock smoke，Host-only 改动不强制 GIF；一旦声称“可发布”“stock 兼容”或“UI 已验收”，证据必须提升到相应等级。

## 核心价值

### 1. 把经验变成可重复执行的门禁

初始化、包校验、官方发行物校验、stock smoke、敏感扫描和资源清理都有现成脚本。不同 Agent 不需要每次重新猜 manifest、Browser loader 或清理规则。

### 2. 让验证结论和证据强度一致

`package check`、源码运行、mock UI、stock DSH 和真实外部服务是不同级别的主张。Skill 要求 Agent 说清楚实际验证了什么，而不是用一个绿色结果代表所有层级。

### 3. 在 Host、Browser 和证据之间建立安全边界

凭证、文件系统、进程与内部异常留在 Host；Browser 只接收最小、JSON-safe、脱敏投影。日志、Settings、GIF 和 provenance 都纳入敏感信息边界。

### 4. 统一团队和多 Agent 的交付语言

固定的 rc.8 兼容矩阵、`result.json`、`provenance.json`、GIF review 和 PR 结构，让实现 Agent、审查 Agent 与人类维护者看到的是同一套完成标准。

### 5. 同时保证“真的正确”和“别人看得懂价值”

验收证据证明功能是否符合标准；展示媒体说明功能为什么值得合入。二者可以复用，但不能混淆，也不应为了形式主义强制生成。

## 能做什么

- 初始化 Host-only 或 Host + Browser 插件项目。
- 校验 npm 包入口、exports、files、DSH patch 和 Browser 声明。
- 对官方 npm 的 DSH rc.8 tarball 与稳定入口做完整性校验。
- 在隔离 profile 中运行 stock DSH install、dump、start 和 Browser probe smoke。
- 生成标准化的 `result.json`、`provenance.json` 与 GIF review 证据。
- 扫描敏感信息，并按 owner/runId 安全清理测试资源。
- 完成 GitHub commit、PR、CI 和展示媒体的交付闭环。

## 给任意 Agent 使用

将仓库克隆到任意位置，然后给 Agent 以下指令即可：

```text
完整读取 <repo>/SKILL.md。
使用该 Skill 完成当前 DSH 插件任务，并只按 SKILL.md 的路由读取相关 references。
执行适用的 scripts；准确报告 real/mock、版本、commit 和未验证范围。
```

`SKILL.md` 是通用入口，`references/`、`scripts/` 和 `assets/` 不依赖 Codex。不同 Agent 平台如果支持自己的 Skill/Rule 目录，也可以把本仓库接入其自动发现机制。

## Codex 原生安装

克隆到 Codex skills 目录，并确保最终目录名为 `dsh-plugin-best-practices`：

```sh
git clone https://github.com/502399493zjw-lgtm/dsh-plugin-best-practices-skill.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/dsh-plugin-best-practices"
```

重启 Codex 或开始一个新任务后，该 Skill 会在 DSH 插件相关请求中自动生效。`agents/openai.yaml` 只是 Codex 适配层，不限制其他 Agent 使用核心工作流。

## 快速开始

```sh
DSH_SKILL=/path/to/dsh-plugin-best-practices-skill

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
SKILL.md                 所有 Agent 的核心决策、工作流、不变量和完成标准
references/              DSH、测试证据、GIF、GitHub 交付细则
scripts/                 初始化、包校验、stock smoke、扫描和清理工具
assets/plugin-template/  最小可构建插件模板
assets/evidence/         证据 schema、模板和独立审查提示
assets/trust/            DSH rc.8 官方 npm 发行完整性记录
agents/openai.yaml       Codex 的原生发现与展示元数据
```

## 信任边界

`real` stock smoke 不能由调用者自行声明：工具会校验官方 npm rc.8 tarball 和包内 `lib/bin.js` 的固定摘要。npm、pnpm 或操作系统生成的命令 shim 只负责定位，不作为信任根。mock/hybrid 结果必须保留其真实执行类别和未验证范围。

## 维护与验证

仓库 CI 会检查 Skill 元数据、JSON、Markdown 相对链接、所有 Node 脚本语法、rc.8 发行完整性，并从模板生成一个 Browser 插件完成 install/test/build/package verification/pack。

本仓库采用 MIT 许可证。由模板生成的插件默认是 `UNLICENSED`，因为插件作者需要为自己的项目主动选择许可证。

## 许可证

[MIT](LICENSE)
