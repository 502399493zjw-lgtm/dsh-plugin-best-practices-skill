---
name: dsh-plugin-best-practices
description: Use when designing, implementing, testing, packaging, installing, reviewing, or delivering an external DeepSeek Harness (DSH) plugin, especially work spanning Cordis Host code, Browser UI, profile patches, stock-DSH smoke validation, GitHub PRs, and visual evidence.
---

# DSH 插件最佳实践

把插件交付成独立、可安装、可复验的 npm bundle。不要把“源码可运行”“包结构正确”或 mock 演示误报成 stock DSH 兼容。

## 入口决策

```text
新插件？ ──是──> 用 scripts/init-plugin.mjs 初始化独立项目
   │否
   └────────> 保护现有改动；按项目约定使用任务分支/worktree

需要 Browser？ ──否──> Host、组合、包与 stock smoke
       │是
       └────────> Host 安全投影 + Browser loader/Settings/slots + UI 验收

用户要求 GitHub？ ──否──> 本地可审查交付，不自动 commit/push/PR
       │是
       └────────> commit/push/PR/CI 闭环；用户可见 GUI/交互再做展示媒体；不自动合并或发布
```

统一以 DSH `0.1.0-rc.8`、Cordis `4.0.1` 为当前活动基线，并查阅 [兼容性矩阵](references/compatibility-matrix.md)。初始化、实现、测试、证据和 PR 兼容声明都使用这组精确版本；real smoke 使用工具箱内置的 rc.8 发行完整性清单校验稳定包入口。除非用户明确要求执行“基线迁移”，不要为单个插件另选 DSH 版本或扩大版本范围。

## 核心工作流

1. **定边界**：确认新建/迭代、本地/GitHub、Host/Browser，并按 rc.8/Cordis 4.0.1 基线核对公开扩展点。
2. **定验收**：先写能力契约、失败/降级语义、测试用例和完成标准；行为修改先获得能失败的测试。
3. **建包**：使用独立包、`dsh.bundle.patch`、稳定 Cordis plugin id、精确 exports/files/peerDependencies；初始化和工具用法见 [可执行工具箱](references/tooling.md)。
4. **实现**：Host 持有凭证、文件系统、进程和内部异常；Browser 只消费 JSON-safe 的最小脱敏投影。
5. **分层验证**：按改动和主张依次选择单元/组合测试、构建、`verify-package`、敏感信息扫描、`pnpm pack`、固定版本 stock DSH tarball 安装和 smoke；不把发布级流程强加给纯文档或无关小改动。证据规则见 [测试与证据](references/test-evidence.md)。
6. **UI 与 GIF**：需要 GIF 证据时，先定义验收用例和标准，再设计验收 GIF；展示 GIF 以说明功能价值为目标。Agent 判断两者是否复用，作为验收证据的 GIF 由独立审查者判定。详见 [Browser 与 GIF](references/browser-gif-integration.md)。
7. **交付与清理**：本地交付保留可审查 diff；GitHub 交付完成 PR 和 CI 检查，涉及用户可见 GUI/交互时再加入展示媒体。最后清理只属于本次 run 的进程、临时 profile、端口和冗余素材。详见 [项目与 PR](references/project-and-pr.md)。

## 核心不变量

- 不修改 DSH 核心或生成目录来迁就外部插件，除非用户明确要求改核心。
- Host 独占 token、认证文件、账号路径、子进程和特权 I/O；Browser、日志、Settings、replay metadata 与证据文件不得泄露它们。
- 所有路由、注册项、定时器、监听器、子进程和临时目录都有明确所有者与 dispose/cleanup 路径。
- 可选服务、外部命令或凭证缺失时，优先安全降级，不让无关 DSH 能力永久 pending。
- `package check`、源码 checkout、mock UI、stock DSH 安装和真实外部链路是不同强度的主张；报告必须逐项区分。
- 只清理带本次 `runId` 和 owner marker 的资源；不执行宽泛目录删除，不覆盖或重置用户改动。
- 每份结果都能追溯到代码 commit、DSH/Cordis/Node 版本、real/mock、命令、退出状态和未验证范围。格式见 [证据契约](references/evidence-schema.md)。

## 按需读取

- 新项目、已有项目、分支/worktree、GitHub 授权和 PR： [project-and-pr.md](references/project-and-pr.md)
- 版本、Cordis、Browser loader、Settings API、manifest： [compatibility-matrix.md](references/compatibility-matrix.md)
- 初始化、包校验、stock smoke、扫描和清理脚本： [tooling.md](references/tooling.md)
- 测试层级、真实与 mock、结果判定： [test-evidence.md](references/test-evidence.md)
- 验收 GIF、展示 GIF、复用判断、录制与审查： [browser-gif-integration.md](references/browser-gif-integration.md)
- `result.json`、`provenance.json`、GIF review 和审查提示： [evidence-schema.md](references/evidence-schema.md)

## 完成标准

- **所有任务**：契约和验收用例明确；验证强度与改动及对外主张相称；实际修改与未验证风险已报告。
- **代码或包改动**：聚焦测试、构建、包校验和敏感扫描通过；影响安装或发布面时再执行 `pnpm pack` 与 stock DSH smoke。
- **发布相关改动**：tarball 内容正确，并在固定版本、隔离 `DSH_HOME` 的 stock DSH 中完成与主张相符的 install/dump/start/probe；否则明确标为未做。
- **Browser 行为改动**：自动断言覆盖关键状态；需要或使用 GIF 时，最终编码文件可读且无敏感信息，验收 GIF 有独立 review 结论。纯文案、内部重构和非前端任务不强制 GIF。
- **GitHub 交付**：远程 head 与报告 commit 一致，required checks 状态已读取；涉及用户可见 GUI/交互时，PR 展示 GIF 能表达功能价值并在 GitHub 实际渲染，Host-only 或纯内部改动不强制媒体。
- **收尾**：证据符合 schema，临时资源已按 owner/runId 清理，Git 状态准确；未经授权不创建远程、不合并、不发布 npm、不创建 Release。
