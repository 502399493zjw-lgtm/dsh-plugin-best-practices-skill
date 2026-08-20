# DSH 插件证据契约

证据分成机器结果、来源声明和媒体审查三层。模板与 JSON Schema 位于 `assets/evidence/`。

## 标准文件

```text
artifacts/<kind>/<run-id>/
├── result.json
├── provenance.json
├── resources.json              # 存在临时资源时
├── gif-review.md               # 验收 GIF 时
└── <日志、GIF、trace 或其他证据>
```

### `result.json`

符合 `assets/evidence/result.schema.json`。它回答“运行了什么、哪些检查通过、整体结论是什么”。

- `status` 只从检查结果归纳：任何必要检查失败为 `fail`；必要检查未运行为 `partial`；全部必要检查通过才是 `pass`。
- `checks[].status` 使用 `pass | fail | warn | skip`；`skip` 必须写原因。
- 命令只记录可公开的 argv；凭证和敏感环境变量必须删除或写 `<redacted>`。
- `cleanup.status` 必须表明资源已清理、保留或尚未清理。

### `provenance.json`

符合 `assets/evidence/provenance.schema.json`。它回答“证据来自哪份代码、哪个运行环境、证明的主张是什么”。

- `source.commit` 是录制/测试代码树的 commit；dirty tree 必须列出 `dirty: true`，不能假装来自纯 commit。
- `runtime.dsh` 与 `runtime.cordis` 只记录实际执行环境中核验到的版本；未知值写 `null` 并在 exceptions 解释。插件 manifest 的 Cordis peer 声明单列为 `pluginCordisPeer`，不得冒充 `runtime.cordis`。
- stock smoke 还记录解析后的 DSH 可执行文件或稳定包入口名称、实际 checksum、可信预期 checksum、是否匹配和公开来源描述。rc.8 优先记录 `lib/bin.js`，而非包管理器生成的 shim。real 结论要求 checksum 已匹配；来源与预期 digest 必须来自独立可信的发布元数据，不能由待测未知文件自证。
- `claim.execution` 明确 `real | mock | hybrid`；`scope` 描述能够证明的边界，`notProven` 列出不能证明的内容。
- `media` 是媒体条目数组；GIF 使用 `media[].kind: validation-gif | showcase-gif`。同一文件复用时只保留一个条目，并在 `purposes` 同时列出 `validation` 与 `showcase`；分别生成时各自记录 path、checksum 和 viewport。
- 不记录 token、cookie、认证文件内容、账号路径或未脱敏 server URL。

### `gif-review.md`

复制 `assets/evidence/gif-review.template.md`。独立审查者逐条给出 `PASS | FAIL | NOT_PROVEN`、时间点和观察事实，不以作者说明替代 GIF 中可见证据。

## 验收 GIF 的独立审查

把以下材料交给未参与录制的 reviewer/subagent：

1. 验收用例与标准；
2. 最终编码 GIF，而不是源帧截图；
3. `result.json` 与 `provenance.json`；
4. 必要的自动断言输出；
5. `assets/evidence/subagent-review-prompt.md`。

审查者不应收到“请判定通过”这类预设答案。若 GIF 只能展示布局，但 provenance 声称真实 Provider/模型链路，必须判 `NOT_PROVEN` 或 `FAIL`。展示 GIF 不强制独立验收，但复用为验收 GIF 时必须接受同样审查。

## 最小结果示例

```json
{
  "schemaVersion": "1.0",
  "kind": "stock-dsh-smoke",
  "runId": "20260820T120000Z-a1b2c3",
  "startedAt": "2026-08-20T12:00:00.000Z",
  "finishedAt": "2026-08-20T12:00:12.000Z",
  "status": "pass",
  "subject": { "plugin": "dsh-example", "project": "/redacted", "commit": "abc123" },
  "checks": [
    { "id": "install-tarball", "required": true, "status": "pass", "summary": "Installed into an isolated web profile." }
  ],
  "cleanup": { "status": "cleaned", "resourcesManifest": "resources.json" },
  "risks": []
}
```

## 保存与提交

- 一个验证步骤一旦选择持久化证据，就同时保存同一 `runId` 的 `result.json` 与 `provenance.json`；只在更高层聚合报告中引用二者，不用聚合结论替代原始 pair。
- 本地和 CI 原始证据默认放 gitignored artifacts；只提交稳定 schema、模板和经项目认可的小型展示媒体。
- PR 文案引用结果摘要、commit、real/mock 和证据位置，不粘贴凭证相关日志。
- 分开的验收 GIF 可放 CI artifact；展示 GIF 可放项目约定位置或 media-only assets branch。
- 交付前对证据目录本身运行敏感信息扫描。
