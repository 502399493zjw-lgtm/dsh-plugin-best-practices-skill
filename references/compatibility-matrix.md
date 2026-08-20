# DSH 外部插件兼容性矩阵

本矩阵记录当前统一基线的契约和验证，不把代码形似当作运行兼容。当前唯一活动基线是 DSH `0.1.0-rc.8`、Cordis `4.0.1`；所有新建、迭代、测试和交付默认使用这组精确版本。

非 rc.8 版本不属于当前兼容范围。只有用户明确要求“迁移统一基线”时，才核对新版本源码/文档、更新模板和工具默认值，并用打包 tarball 完成等强度 stock DSH 验证；不要在单个插件任务中临时增加第二套基线。

## 当前记录

| DSH | 证据级别 | Node / 包管理器 | Cordis | Host 扩展点 | Browser loader | Settings / slots | bundle manifest |
|---|---|---|---|---|---|---|---|
| `0.1.0-rc.8` (`dsh-v0.1.0-rc.8`, commit `141eb6f`) | 本机核心 tag 与外部 Browser 插件 manifest 已核对；每个具体插件仍需 tarball smoke | `^22.19.0 || >=24.0.0`; pnpm `11.7.0` | `@deepseek-ai/cordis@4.0.1` | ESM 导出 `name`、`inject`、可选 `Config`、`apply(ctx, config)`；注册和释放归入 Cordis 生命周期/`ctx.effect()` | 同包导出 `./client`，声明 `dsh.client.platform: web`；`inject`/`immediately` 为可选；Host 扫描已挂载 Loader entries，注入 `window.__DSH_BOOT__`，按 `/plugins/<id>/client.js?rev=...` 提供 bundle | Browser `apply(ctx: ClientContext)`；插件 Settings 卡片使用 `ctx.settingsScope.bind({ namespace })`，经 `ctx.slots.inject(...ctx.slots.register(...))` 注册；Host 用 `installSettingsSection` 注册同一 namespace | `dsh.bundle.patch: ./cordis.patch.yml`；Host `main`/`.` 指向构建 JS；Browser 同时要求 `exports["./client"]` 与 `dsh.client`；发布 `files` 必须包含 patch 和构建入口 |

## 记录元数据

| DSH | 最后核对日期 | 当前最高证据 | 尚未证明 |
|---|---|---|---|
| `0.1.0-rc.8` | `2026-08-20` | 目标 tag/commit 的静态源码与 manifest 核对；官方 npm tarball与稳定入口已记录可信摘要 | 任一具体插件的可复用 stock tarball smoke 结论 |

## rc.8 的权威核对点

官方 npm 发行物完整性记录位于 `assets/trust/dsh-0.1.0-rc.8.json`：tarball SHA-256 为 `b8b0db6f3bcf3aed77c25bb901fdb9d0ef0f79bd8ca403b52e34c14a71d1487f`，稳定入口 `lib/bin.js` SHA-256 为 `c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62`。它证明字节与已记录发行物一致，不证明某个插件已兼容；具体插件仍须在隔离环境跑 stock smoke。

在目标 DSH checkout/tag 中读取这些文件；不要只复制某个外部插件：

- 运行时与工具链：根 `package.json`、`vendor/cordis/package.json`。
- bundle/profile 安装：`docs/user/develop/basic/publish.md`、`apps/cli/README.md`。
- Browser loader：`docs/subsystems/client-modules.md`、`packages/client/modules/src/client/manifest.ts`。
- Settings：`docs/cookbook/adding-a-settings-card.md`。
- manifest 门禁：`scripts/verify-client-packages.ts`、`scripts/verify-cordis-config.ts`。

## 兼容判定规则

1. **精确 pin**：统一使用 DSH `0.1.0-rc.8` 与 Cordis `4.0.1`；不要为“可能兼容”先写宽范围 peerDependencies。
2. **静态核对**：确认实际导出的服务名、slot、Settings API、`dsh.client` 字段、bundle patch 和 Node engine。
3. **包级核对**：构建后运行 `verify-package`、敏感扫描和 `pnpm pack`，检查 tarball 而不是工作树。
4. **stock smoke**：全新 `DSH_HOME`，用目标版本的 stock `dsh` 安装 tarball；`real` 证据同时记录公开发行来源，并用独立可信的预期 SHA-256 核对实际解析到的稳定 `lib/bin.js` 入口。各平台优先通过 Node 运行该入口，不把 npm/pnpm/npx 或 Windows 生成的 shim 当信任根。至少验证 version、plugin add、dump-config、Web start；Browser 插件还要验证 boot manifest/client bundle，业务主张再加对应 route/UI probe。
5. **迁移基线**：只有用户明确决定整体迁移，且新版本通过同等静态、包级和 stock smoke 验证，才能替换当前基线；迁移必须同步更新主 Skill、矩阵、模板、工具默认值和证据说明。

## 何时必须重跑

- DSH、Cordis、Node 主/次版本或 peerDependencies 改变；
- `package.json` 的 `exports`、`files`、`dsh.*`、入口或构建器改变；
- `cordis.patch.yml`、注入服务、Settings namespace/slot、Browser bundle wrapper 改变；
- 发布方式从 checkout 改为 npm/git/tarball，或反向改变；
- 过去的证据不是来自准备交付的 commit/tarball。

## 迁移矩阵基线

整体迁移时记录：精确 DSH 版本/tag/commit、Node、包管理器、Cordis、Host API、Browser loader、Settings/slot、manifest 字段、证据链接和最后验证日期。无法确认的单元格写“未知/待 smoke”；在迁移证据闭环前，rc.8 仍是唯一可交付基线。
