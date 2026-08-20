# DSH 项目初始化、Worktree 与 GitHub 交付

仅在新建插件、已有插件迭代、分支/worktree 管理或用户要求进入 GitHub/PR 交付流程时读取本参考。

## 先确定交付模式

- **本地交付**：实现、测试、构建和验证完成后，保留可审查 diff 和准确 Git 状态，不自动 commit、push 或建 PR。
- **GitHub 交付**：用户明确要求提交到 GitHub、push、开 PR 或端到端交付时，继续完成 commit、push、PR 和 CI 状态确认；仅在涉及用户可见 GUI/交互时执行展示媒体及其渲染检查。
- “交付到 GitHub”不自动授权合并 PR、发布 npm、创建 Release 或改写历史。
- 没有 remote 时，创建仓库前必须得到 owner、仓库名和 public/private；已有 remote 时先读取 URL、默认分支和当前认证状态，不替换用户 remote。

## 新插件 0→1 初始化

先确认：插件名称、稳定 plugin id、npm scope、目标 DSH 版本、是否需要 Host、Browser、LLM、HTTP、Settings 和 UI。

优先使用 [tooling.md](tooling.md) 的 `init-plugin.mjs` 生成以下基线，脚本拒绝覆盖非空目录：

```text
package.json
cordis.patch.yml
src/index.ts
src/client/index.ts        # 需要 Browser 时
src/status.ts 或共享契约    # 需要跨端数据时
tests/
scripts/verify-package.mjs
README.md
```

初始化完成后先建立最小可验证切片：

1. Host 入口能被 TypeScript 和打包器处理；
2. `cordis.patch.yml` 能表达插件挂载；
3. 需要 Browser 时，Browser 入口能被 DSH Client loader 加载；
4. 至少一个行为测试在实现前按预期失败、实现后转绿，并且至少一个 Cordis 组合测试通过；
5. `build`、`verify:package` 和最小 tarball 检查通过。

本地初始化不等于远程发布。远程 Git 仓库、npm 包、凭证、CI secret、push 和 release 都要等用户明确授权。

## 已有插件的任务隔离

当仓库已有未提交改动、存在并行任务、项目约定要求隔离，或当前任务将进入 PR 交付时，优先一个任务一个 worktree，建议命名为 `codex/<task-slug>`。如果用户已经给出干净、专用的工作树，简单且局部的任务不必再套一层 worktree。无论采用哪种方式，开始前：

- 执行 `git status --short --branch`；
- 查看与任务相关的 diff 和项目指令；
- 确认基础分支和目标 DSH 版本；
- 记录用户已有改动，不覆盖、不重置、不混入。

开发中：

- 只在本任务的专用工作区修改；采用 worktree 时，不跨 worktree 混用未审查产物；
- 可观察行为或契约发生变化时，先获得能证明差异的失败测试；纯重构、文案和已有测试已充分覆盖的机械改动不强制制造失败测试；
- 测试、验收/展示 GIF、录制源帧和临时 `DSH_HOME` 归属于当前任务；
- 需要跨 worktree 复用的结果应通过提交、补丁或明确说明传递，不直接复制未审查的状态文件。

## 用户亲自预览 DSH + 插件

当用户要求“我自己打开看看”时，交付的是目标代码在真实 DSH 中运行的临时现场，而不只是源码、测试日志或 GIF。按以下顺序执行：

1. 锁定要预览的代码树，运行适用测试、构建和 `verify-package`，再从该代码树生成 npm tarball。GitHub 交付必须对应目标 commit；本地未提交预览记录基线 commit、dirty 状态和 diff 来源，不为获得 commit 而擅自提交。不要拿另一个 worktree 的旧包或未记录源码目录代替。
2. 使用工具箱信任清单核验过的 stock DSH `0.1.0-rc.8` 稳定包入口；为当前 run 创建隔离 `DSH_HOME`、owner marker 和 runId，并使用最小环境，不能继承无关 token/凭证。
3. 底层安装链路是 `dsh plugin --profile web add <tarball>`；安装后先执行 dump-config 和必要 probe，确认组合配置来自该 tarball。
4. 选择空闲端口，以 `dsh --profile web --no-open --host 127.0.0.1 --port <port>` 启动现场。向用户报告预览 URL、commit/dirty 状态、tarball、DSH/Cordis 版本、real/mock、已通过的用例和未验证范围。
5. 保持进程存活，让用户从同一台机器的浏览器打开 `http://127.0.0.1:<port>/` 自由操作。用户未明确授权时，不监听 `0.0.0.0`，不创建公网隧道或外部部署。
6. 用户说已看完，或到达事先约定的超时后，停止 DSH 与子进程，释放端口，并只清理拥有匹配 owner marker/runId 的临时 profile 和文件。若用户要求暂时保留，报告 runId、端口、profile、截止时间和后续清理方式。

现场预览是人工观察面，不单独证明兼容性。发布或 stock 兼容主张仍需要自动 smoke/probe、`result.json` 与 `provenance.json`；GIF 仍按其验收或展示目的单独判断。Host-only 插件如果没有 Browser 页面，提供 dump-config、状态/API probe、CLI 输出或日志中的脱敏观察面，不为展示而伪造 UI。

## PR 前检查清单

- [ ] `git diff --check` 无问题；
- [ ] 聚焦测试通过；
- [ ] 项目要求且与改动风险相称的完整测试通过；
- [ ] `pnpm run build` 通过；
- [ ] `pnpm run verify:package` 通过；
- [ ] 敏感信息扫描通过，并覆盖准备提交的证据/媒体；
- [ ] 需要时已运行 `pnpm pack` 和临时 `DSH_HOME` stock DSH 冒烟；
- [ ] 需要以 GIF 验收的 UI 任务已有脚本、机器断言、验收 GIF 和子 agent 审查结论；不要求截图；
- [ ] 若 PR 改变用户可见 GUI，已有基于目标 PR 代码树、能说明功能价值的展示 GIF；已说明它是否与验收 GIF 复用；
- [ ] 每个 GIF 都标明用途、验证或展示主张、real/mock、来源 commit 和未验证范围，没有用 mock 冒充真实链路；
- [ ] 没有 token、auth 文件、`.env`、账号数据或机器路径；
- [ ] README、兼容版本和已知限制已更新；
- [ ] diff 只包含本任务内容；
- [ ] 测试进程、临时 profile、端口和冗余证据已清理。
- [ ] `result.json`、`provenance.json` 和 GIF review（如有）符合 [evidence-schema.md](evidence-schema.md)。

## PR 内容最低要求

```text
Summary
- 做了什么、用户可见变化是什么

Design / boundaries
- Host、Browser、共享契约和安全边界

Validation
- 实际运行的命令和结果
- 是否通过 package check
- 是否通过真实 stock DSH smoke
- 展示 GIF（用户可见 GUI/交互改动时）；验收 GIF 或证据位置；两者是否复用
- 每个 GIF 的主张、real/mock 和来源 commit；验收 GIF 另附独立 reviewer 结论

Risks / follow-ups
- 未验证范围、兼容性风险、后续任务
```

## GitHub 交付闭环

1. 确认 remote、目标基础分支、当前任务分支和 GitHub 认证可用；记录 `git status --short --branch`、`git diff --check` 和即将提交的 diff。
2. 完成项目门禁。安装/入口/补丁或重要 Host/Browser 改动按要求包含打包 tarball 的真实 stock DSH 冒烟，不能用 `verify:package` 冒充安装验证。
3. 更新 README 和 PR 文案。用户可见的 UI 改动按 [browser-gif-integration.md](browser-gif-integration.md) 准备能表达功能价值的展示 GIF，由 Agent 判断是否与验收 GIF 复用；生成后脱敏、压缩并在本地实际查看最终媒体，不额外要求截图。
4. 只 stage 本任务文件，复核 staged diff 后创建语义清晰的 commit；不要把用户的未提交改动或临时证据一起提交。
5. push 当前任务分支并创建或更新 PR；若项目没有命名约定可使用 `codex/<task-slug>`。不要 force-push，除非用户明确要求且已评估审查历史影响。
6. 读取远程 PR 状态，确认 head SHA 等于刚推送的 commit；检查 README/PR GIF 的实际 GitHub 渲染、链接目标、alt text 和说明。
7. 检查 required checks/CI。任务内失败就在同一分支修复、重跑相关测试和门禁、再 push；任务外失败只记录证据，不顺手修改无关系统。
8. 交付 PR URL、分支、commit SHA、媒体位置、测试/冒烟结论、CI 状态和未验证风险。没有完成以上远程校验时，不要把结果描述为“已完成 GitHub 交付”。

## 授权边界

- 用户只要求实现：完成代码、测试、构建和本地验证即可，不自动 commit/push/建 PR。
- 用户明确要求 commit：只提交当前任务的干净 diff。
- 用户明确要求提交到 GitHub、push 或 PR：执行对应的远程交付闭环，并在 PR 中报告实际测试、媒体来源和风险。
- 未经授权不创建远程仓库、不合并 PR、不发布 npm、不创建 Release、不改写历史、不使用破坏性 Git 清理。
