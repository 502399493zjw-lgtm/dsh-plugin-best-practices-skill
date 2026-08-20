---
name: dsh-plugin-best-practices
description: Use when designing, implementing, testing, packaging, installing, publishing, discovering, reviewing, retiring, or delivering an external DeepSeek Harness (DSH) plugin, especially work spanning Cordis Host code, Browser UI, bundle patches, stock-DSH smoke validation, npm/GitHub distribution, GitHub PRs, and visual evidence.
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

用户要求发布/上架？ ──否──> 不写 npm、Release、Topic 或社区目录
          │是
          └────────> 先判定 DSH Bundle / Agent Skill；读取发布参考
                    → exact tarball 只读门禁 → 报告坐标/摘要/主张并取得发布授权
                    → 发布后 registry 字节/tag + 包名 stock smoke；Topic/目录分别授权

用户要亲自查看？ ──否──> 按任务所需交付自动证据/媒体
       │是
       └────────> 目标代码树 tarball + 隔离 stock rc.8 → loopback 预览地址；看完再按 runId 清理
```

统一以 DSH `0.1.0-rc.8`、Cordis `4.0.1` 为当前活动基线，并查阅 [兼容性矩阵](references/compatibility-matrix.md)。初始化、实现、测试、证据和 PR 兼容声明都使用这组精确版本；real smoke 使用工具箱内置的 rc.8 发行完整性清单校验稳定包入口。除非用户明确要求执行“基线迁移”，不要为单个插件另选 DSH 版本或扩大版本范围。

## 核心工作流

1. **定边界**：确认新建/迭代、本地/GitHub、Host/Browser，并按 rc.8/Cordis 4.0.1 基线核对公开扩展点。
2. **定验收**：先写能力契约、失败/降级语义、测试用例和完成标准；行为修改先获得能失败的测试。
3. **建包**：使用独立包、`dsh.bundle.patch`、稳定 Cordis plugin id、精确 exports/files/peerDependencies；初始化和工具用法见 [可执行工具箱](references/tooling.md)。
4. **实现**：Host 持有凭证、文件系统、进程和内部异常；Browser 只消费 JSON-safe 的最小脱敏投影。
5. **分层验证**：按改动和主张依次选择单元/组合测试、构建、`verify-package`、敏感信息扫描、`pnpm pack`、固定版本 stock DSH tarball 安装和 smoke；不把发布级流程强加给纯文档或无关小改动。证据规则见 [测试与证据](references/test-evidence.md)。
6. **UI 与 GIF**：前端验收以 DOM/接口自动断言覆盖关键状态；需要 GIF 证据时，先定义用例和标准，再设计验收 GIF。展示 GIF 以帮助用户在安装前理解功能价值为目标；GitHub 中作为“安装后预览”的展示 GIF，默认从目标 tarball 安装到隔离 stock rc.8 后的页面录制，外部 Provider/数据若 mock 必须标注。Agent 判断两类 GIF 是否复用，验收 GIF 由独立审查者判定。详见 [Browser 与 GIF](references/browser-gif-integration.md)。
7. **发布与发现（仅被要求时）**：先区分真正声明 `dsh.bundle` 的可安装 Bundle 与 Agent Skill；完成 exact tarball 的发布前只读门禁，明确包名、版本、registry、dist-tag、commit 和摘要后再取得 `npm publish` 授权。发布后从 registry 下载复核字节/tag，并用包名重跑 stock smoke。GitHub SHA 分发、Release、`dsh-plugin` Topic、社区目录 PR、deprecate 与 archive 各自授权。详见 [发布、发现与退役](references/publish-and-discovery.md)。
8. **预览、交付与清理**：用户要求亲自查看时，用目标代码树的 tarball 在隔离 stock rc.8 profile 启动仅监听 loopback 的现场预览，交付 URL、版本、commit/dirty 状态和 real/mock 范围；GitHub 交付的预览必须对应目标 commit，本地预览不得为获得 commit 而擅自提交。用户看完或到达约定超时后再清理。本地交付保留可审查 diff；GitHub 交付完成 PR 和 CI 检查，用户可见 GUI/交互再加入展示媒体。详见 [项目与 PR](references/project-and-pr.md)。

## 核心不变量

- 不修改 DSH 核心或生成目录来迁就外部插件，除非用户明确要求改核心。
- Host 独占 token、认证文件、账号路径、子进程和特权 I/O；Browser、日志、Settings、replay metadata 与证据文件不得泄露它们。
- 所有路由、注册项、定时器、监听器、子进程和临时目录都有明确所有者与 dispose/cleanup 路径。
- 可选服务、外部命令或凭证缺失时，优先安全降级，不让无关 DSH 能力永久 pending。
- `package check`、源码 checkout、mock UI、stock DSH 安装和真实外部链路是不同强度的主张；报告必须逐项区分。
- npm 发布必须使用已通过 smoke 的同一 tarball；发布、dist-tag、Release、Topic、目录 PR、deprecate 与 archive 不互相授权。
- 只清理带本次 `runId` 和 owner marker 的资源；不执行宽泛目录删除，不覆盖或重置用户改动。
- 每份结果都能追溯到代码 commit、DSH/Cordis/Node 版本、real/mock、命令、退出状态和未验证范围。格式见 [证据契约](references/evidence-schema.md)。

## 按需读取

- 新项目、已有项目、分支/worktree、GitHub 授权和 PR： [project-and-pr.md](references/project-and-pr.md)
- 版本、Cordis、Browser loader、Settings API、manifest： [compatibility-matrix.md](references/compatibility-matrix.md)
- 初始化、包校验、stock smoke、扫描和清理脚本： [tooling.md](references/tooling.md)
- npm/GitHub 分发、Bundle/Skill 分类、Topic、社区目录、deprecate/归档： [publish-and-discovery.md](references/publish-and-discovery.md)
- 测试层级、真实与 mock、结果判定： [test-evidence.md](references/test-evidence.md)
- 验收 GIF、展示 GIF、复用判断、录制与审查： [browser-gif-integration.md](references/browser-gif-integration.md)
- `result.json`、`provenance.json`、GIF review 和审查提示： [evidence-schema.md](references/evidence-schema.md)

## 完成标准

- **所有任务**：契约和验收用例明确；验证强度与改动及对外主张相称；实际修改与未验证风险已报告。
- **代码或包改动**：聚焦测试、构建、包校验和敏感扫描通过；影响安装或发布面时再执行 `pnpm pack` 与 stock DSH smoke。
- **发布相关改动**：tarball 内容正确，并在固定版本、隔离 `DSH_HOME` 的 stock DSH 中完成与主张相符的 install/dump/start/probe；否则明确标为未做。
- **公开发布**：只读 preflight 通过且发布 exact tarball 已获明确授权；发布后 registry 下载字节、显式 dist-tag 和 registry 包名 stock smoke 均已复核。只完成开发/PR、`npm publish --dry-run` 或 tarball smoke 时不得声称 npm 发布完成。
- **用户现场预览**：被要求时，预览运行目标代码树的 tarball 与 stock rc.8 隔离 profile，只监听 loopback；交付可访问地址、commit/dirty 状态与来源信息，并在确认结束或约定超时后清理。Host-only 插件交付状态/API/CLI 观察面，不虚构 UI。
- **Browser 行为改动**：自动断言覆盖关键状态；需要或使用 GIF 时，最终编码文件可读且无敏感信息，验收 GIF 有独立 review 结论。纯文案、内部重构和非前端任务不强制 GIF。
- **GitHub 交付**：远程 head 与报告 commit 一致，required checks 状态已读取；涉及用户可见 GUI/交互时，PR 展示 GIF 能表达功能价值，并默认展示目标 tarball 在隔离 stock rc.8 中的安装后效果；外部 Provider/数据 mock 明确标注，媒体已在 GitHub 实际渲染。Host-only 或纯内部改动不强制媒体。
- **收尾**：证据符合 schema，临时资源已按 owner/runId 清理，Git 状态准确；未经授权不创建远程、不合并、不发布 npm、不创建 Release。
