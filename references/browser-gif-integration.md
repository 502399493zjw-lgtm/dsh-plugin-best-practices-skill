# Browser GIF 与 DSH 原生 Skill 的协作

仅在插件包含用户可见的 Browser/Web UI、需要提交 GUI PR，或用户明确要求 GIF 时读取本参考。这里定义外部插件如何接入 DSH 仓库自带的 `record-browser-gif`，不复制它的编码脚本和 assets branch 操作手册。

## 先区分两类 GIF

| 类型 | 目的 | 重点 | 默认去向 |
| --- | --- | --- |
| 验收 GIF | 证明验收标准是否满足 | 状态覆盖、可复现、机器断言和 provenance | 本地 artifacts 或 CI；必要时附到 PR |
| 展示 GIF | 让读者快速理解功能价值 | 核心场景、用户收益、叙事节奏和可读性 | README、PR 或用户指定的演示位置 |

Agent 根据验收覆盖和展示效果判断是否复用：核心路径既能证明关键标准、又能简洁表达价值时优先使用同一个 GIF；完整验收会让演示冗长，或展示节奏会省略关键证据时分别生成。不要为了强行复用而削弱任何一方。

录制前先完成验收用例：前置条件、动作、机器断言、人工可见标准、real/mock 要求、清理和 provenance。验收 GIF 从这些用例生成；展示 GIF 从“读者应在几秒内理解什么价值”生成。

## 按验证主张选择 real/mock

- 日常本地迭代、布局、交互、加载、空数据和受控错误状态可以使用 mock，必须在产物和审查报告中标注。
- PR GIF 必须来自目标 PR 的真实代码树。作为 README、PR 或 DSH Market“安装后预览”的展示 GIF，默认使用目标 tarball 安装到隔离 stock DSH rc.8 后的实际页面；DSH 安装链路不能用 mock 或源码 dev server 冒充。外部 Provider 或演示数据可以按场景 mock，但必须显式标注。
- 只有结论涉及真实 Provider、账号、模型调用或外部服务时，才必须运行对应真实链路。纯 UI 改动不为了形式调用真实模型。
- 没有 API key、真实模型或可运行 server 时，记录为未验证；可以提供明确标注的 mock 展示，但不能声称真实流程已经通过。

判断原则是：GIF 所证明或展示的能力不能超过它实际运行的范围。

## GitHub 中的素材落位

| 用途 | 推荐落位 | 引用方式 |
| --- | --- | --- |
| README 与 PR 使用的展示 GIF | 专用 assets branch 或项目认可的 GitHub 媒体位置 | 使用稳定链接，标明演示场景和 real/mock |
| 与展示 GIF 分开的验收 GIF | CI artifacts、PR 附件或项目认可的证据位置 | 标明验收编号、claim 和来源 commit |
| 需要随文档版本化的小型 GIF | 项目约定的 `docs/assets/` 或 `.github/assets/` | 使用相对路径，确保 fork、分支和 npm 页面尽量可读 |
| 原始录制、源帧、trace、失败日志 | 本地 gitignored artifacts 或 CI artifacts | 不嵌入 README，不提交到功能分支 |

README 和 PR 默认引用一个最能说明插件价值、可供安装前决策的短展示 GIF。它可以与验收 GIF 复用；如果分开，完整验收证据留在 artifacts/CI，PR 说明两者的用途和范围。不要额外要求截图，也不要用大段媒体掩盖缺少的自动断言。

Markdown 示例：

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/OWNER/REPO/assets/demo/shared-pool-flow.gif" alt="从选择账号到启动会话的演示" />
</p>
```

替换占位符并遵守项目现有路径。只有 assets branch 的文件已经推送且 URL 稳定时才使用远程链接；不要留下本机绝对路径、临时 server URL 或未推送分支路径。GIF 应脱敏、裁掉无关窗口、保持文字可读，并在 GitHub 页面上实际确认最终渲染。

## PR GIF 的最低溯源

准备附在 PR 的展示或验收 GIF 时，复用 DSH 原生 `record-browser-gif` 的规则：

1. 在干净、专用的任务代码树中记录 `git rev-parse HEAD`，从这个代码树构建并启动服务；项目需要隔离或并行开发时使用 worktree，不要混用另一份工作树的构建产物。
2. 使用一个全新的临时 `DSH_HOME`、`DSH_AGENTS_HOME`、workspace、session state 和浏览器上下文；一个 storyboard 的所有帧必须来自同一批状态根目录。
3. 记录 GIF 类型、验证或展示主张、server origin、构建/开发模式、transport、DSH 版本、真实或 mock API、浏览器状态例外和是否实际运行模型轮次；不记录凭证值。
4. 每帧等待明确的 DOM 条件和唯一 locator，使用语义状态而不是固定 sleep 作为完成证明；涉及工具调用、错误或恢复时要包含能证明原因的详情帧。
5. 保持相同 viewport/crop，使用稳定的帧名和可重复编码；编码后检查帧数、尺寸、时长、大小，并实际查看编码后的 GIF。视觉评审可以暂停或临时抽帧，但不要求保留截图交付物。

如果 `record-browser-gif` Skill 可用，直接调用它完成浏览器控制、编码和发布前校验；不要在本 Skill 中重新实现它的 `encode_gif.py` 或浏览器操作细节。如果它不可用，至少保留以上溯源、单次运行和产物校验要求，并使用项目已有的 Playwright/ffmpeg 能力，不自行安装新的浏览器驱动。

最终验收 GIF 使用 [证据契约](evidence-schema.md) 中的 schema、review 模板和独立 reviewer 提示。审查对象必须是最终编码文件；允许临时抽帧定位问题，但截图不是交付要求。

## 发布、GitHub 校验和清理

- 录制只写入本地 gitignored 目录（例如 `.playwright-mcp/` 或当前任务的 `artifacts/ui/<run-id>/`），成功或失败都清理进程、端口、临时 profile 和重复媒体。
- 只有任务选择 GitHub 交付或用户明确要求把 GIF 附到 PR 时，才把已验证的展示 GIF 发布到专用、media-only 的 assets branch；README 明确需要长期版本化的小型素材除外。分开的验收 GIF 优先留在 artifacts/CI，不默认发布为长期展示素材。
- 发布前后重新确认 PR head 与记录的 commit 一致，并在本地 provenance 中保留产物路径、checksum、transport 和独立审查结果；公开文案不要泄露机器绝对路径。
- push 后打开或读取 GitHub 的 README/PR 实际渲染结果，确认 GIF 可见、尺寸合适、alt text 准确、链接不会因合并后分支变化而失效；只检查本地 Markdown 不算完成。
- 任何凭证不可进入 GIF、源帧、中间录制、日志、trace、PR 描述或 assets branch。
