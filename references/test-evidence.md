# DSH 测试证据与资源管理

仅在任务涉及 Browser UI、交互验收、视觉验收或真实 stock DSH 冒烟时读取本参考。

## 测试用例字段

每个功能迭代至少记录：

```text
id                 稳定的验收编号，例如 AC-ACCOUNT-001
preconditions      profile、配置、账号或 mock 状态
actions            可重复执行的操作步骤
assertions         自动断言和人工验收标准
claim              本用例要证明的结论，以及是否依赖真实 Provider、账号、模型或外部服务
evidence           验收 GIF、trace、日志或 JSON 结果
cleanup            本用例创建的进程、端口、临时目录和文件
resource_budget    是否允许启动 DSH Web、浏览器和真实外部请求
provenance         commit、DSH 版本、server/transport、real/mock、浏览器状态和证据产物来源
```

先定义用例和 `claim`，再决定 real/mock、自动化步骤和录制 storyboard。mock 可以证明受控输入下的布局、状态和交互，但不能证明真实 Provider、账号、模型或外部服务可用。证据结论不得超过实际运行范围。

## UI 证据选择

- 仅当任务要求媒体验收，或视觉主张需要人类可读证据时：脚本实际驱动界面并保留可机器判断的断言，再把验收证据编码成一个短验收 GIF。纯逻辑、文案、内部重构或无需视觉主张的改动不强制录制。
- 验收 GIF 从用例和断言推导，按稳定定位器进入目标状态，依次覆盖所需视觉状态和关键交互，并为需要阅读的画面保留足够停留时间。不要先录制再倒推它证明了什么。
- 展示 GIF 用于 README/PR 中传达功能价值，不承担完整测试覆盖。核心路径同时满足验收覆盖和展示节奏时，Agent 可复用验收 GIF；否则分别生成，并标明各自用途、claim 和 real/mock。
- 失败用例优先保存完整 trace 和日志；自动化工具生成的临时失败帧可用于诊断，但不是必交付证据，问题定位后清理。
- GUI PR 的任何 GIF 都不替代交互脚本的机器断言，且必须能追溯到目标 PR 的代码树。录制和发布规则见 [browser-gif-integration.md](browser-gif-integration.md)。

建议的产物布局：

```text
artifacts/ui/<run-id>/
  validation.gif
  showcase.gif             # 仅在不与验收 GIF 复用时生成
  trace.zip
  result.json
  provenance.json
  gif-review.md
  resources.json
```

文件字段和审查格式见 [evidence-schema.md](evidence-schema.md)，不要为每个项目重新发明互不兼容的结果格式。

## 验收 GIF 的子 agent 审查

提供以下最小完整材料：

1. 需求和验收标准；
2. 测试脚本或执行命令；
3. 脚本结果和自动断言；
4. 验收 GIF，以及是否同时作为展示 GIF；
5. 运行环境和已知限制。

使用 `assets/evidence/subagent-review-prompt.md` 发起独立审查，并按 `assets/evidence/gif-review.template.md` 输出。每个用例只能判 `PASS`、`FAIL` 或 `NOT_PROVEN`，必须给出时间点和实际观察；不得把作者说明当作画面证据。

subagent 依据验收标准判断画面是否准确，不能仅凭 GIF 推断真实后端已经运行；涉及真实链路的结论还要核对 provenance、机器断言和日志。单独生成的展示 GIF 不要求重复完整验收，但发布前必须确认内容准确、脱敏、可读且不夸大能力。

## Stock DSH 冒烟最小范围

只使用已构建的 tarball，在临时 `DSH_HOME` 中安装。优先运行 [tooling.md](tooling.md) 的 `smoke-stock-dsh.mjs`；业务主张超出脚本 probe 时再扩展测试。至少检查：

- stock DSH 能启动 Web profile；
- Host 和 Browser 入口都被加载；
- 插件状态和安全 HTTP 路由可访问；
- Settings 或 Sidebar 在适用时出现；
- Provider/模型在适用时注册；
- 关键配置能在重启后生效；
- 退出时没有残留进程、端口或锁文件。

不要把这个冒烟流程当成完整回归测试，也不要默认调用真实账号或真实模型 API。真实外部请求应是明确的、低频的、可退出的验证项。

## 清理与保留

- 测试脚本必须在成功、失败和中断路径执行清理。
- 临时 `DSH_HOME`、浏览器 profile、启动进程、端口、锁文件和中间媒体属于本次运行的 owned resources，测试后及时清理。
- 每个资源用 owner/runId marker 和 `resources.json` 归属；异常中断后用 [tooling.md](tooling.md) 的清理脚本先 dry-run 再执行。
- 保留当前失败证据和已经交付给子 agent 审查的最终证据。
- 删除源帧、未使用中间录制、重复 GIF、过期 trace 和历史日志；保留期限或最近运行数量应可配置。
- 不使用宽泛的递归删除，不触碰工作区源码、用户目录、真实认证文件或共享包管理器缓存。
