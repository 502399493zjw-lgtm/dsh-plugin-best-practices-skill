# DSH 插件发布、发现与退役

仅在用户要求公开发布、npm/GitHub 分发、插件库收录、Topic、版本下架或仓库归档时读取。本参考把外部写操作拆成独立授权点；完成开发或 GitHub PR 不自动授权 npm 发布、dist-tag 修改、Release、Topic、目录 PR、deprecate 或 archive。

## 先判定交付物

| 交付物 | 必要特征 | 安装方式 | 可进入 DSH 插件目录 |
|---|---|---|---|
| DSH Bundle | npm 包声明 `dsh.bundle.patch`，patch 指向随包发布的配置层 | `dsh plugin --profile <name> add <包/路径>` | 满足目录其他门禁后可以 |
| Agent Skill | 以 `SKILL.md` 和相关资源指导 Agent | 对应 Agent/Skill 安装机制 | 仅凭 Skill 不可以 |

官方 DSH 发布文档明确：没有 `dsh.bundle` 的包即使能安装，也只是普通依赖，不会自动加入 profile 的 bundle 配置层。社区目录中的 `skill` 是“插件能力分类”，不是放宽 artifact 类型；纯 Agent Skill 不要为了收录伪造无实际作用的 `dsh.bundle`。一个仓库只有在根包或明确子包本身是真正可安装的 DSH Bundle 时，才进入下面的 DSH 发布/投稿流程。

## npm 发布授权与不可变量

- `npm whoami`、`npm view`、`npm publish --dry-run` 和 registry 下载验证是只读门禁；仍然避免输出凭证或完整 npm 配置。
- `npm publish` 是不可覆盖的外部写入，必须在执行前得到对包名、版本、registry 和 dist-tag 的明确授权。
- `npm dist-tag add/rm`、`npm deprecate`、GitHub Release、Topic 修改、社区目录 PR 和仓库 archive 是不同写操作，不互相授权。
- 发布对象必须是已经通过 package check、敏感扫描和 stock DSH smoke 的同一 `.tgz` 字节；不要在 `pnpm publish` 生命周期里重新构建另一份未验证产物。
- 预发布版本使用显式非 `latest` tag（通常 `next`）；`latest` 只给通过同等门禁的稳定版本。不要靠移动 tag 掩盖错误版本。

## npm 端到端顺序

1. 确认源码位于干净 commit；`name@version` 尚未占用；`description`、`repository`、`homepage`、`bugs`、许可证文本、`publishConfig` 与 README 安装/卸载说明齐全。
2. 在目标代码树运行聚焦/完整测试、build、`verify-package`、源码敏感扫描和 `pnpm pack --pack-destination artifacts/package`。
3. 解包并检查 `files`、入口、types、`cordis.patch.yml`、`dsh.bundle`，再对解包目录运行敏感扫描。
4. 用固定 DSH `0.1.0-rc.8` / Cordis `4.0.1` 的隔离环境安装这份 tarball，完成 add、dump、start、probe；Browser 插件再核对 boot manifest/client bundle。
5. 对同一 tarball运行只读预检：

   ```sh
   node "$DSH_SKILL/scripts/release-preflight.mjs" \
     --project . \
     --tarball artifacts/package/<exact-file>.tgz \
     --tag next \
     --result artifacts/release/<run-id>/result.json \
     --provenance artifacts/release/<run-id>/provenance.json
   ```

6. 报告包名、版本、registry、tag、commit、tarball SHA-256 和 smoke 结论；取得这次发布的明确授权后，发布 exact artifact：

   ```sh
   npm publish artifacts/package/<exact-file>.tgz \
     --access public \
     --tag next \
     --registry https://registry.npmjs.org/
   ```

7. registry 可能短暂最终一致；用有限次数重试下载相同版本，验证字节和预期 tags：

   ```sh
   node "$DSH_SKILL/scripts/verify-registry-release.mjs" \
     --project . \
     --package @scope/dsh-example@0.1.0-rc.1 \
     --expected-tarball artifacts/package/<exact-file>.tgz \
     --expect-tag next \
     --result artifacts/registry/<run-id>/result.json \
     --provenance artifacts/registry/<run-id>/provenance.json
   ```

8. 最后再以用户实际使用的 registry 坐标执行一次隔离安装与 dump/start/probe：

   ```sh
   dsh plugin --profile web add @scope/dsh-example@0.1.0-rc.1
   dsh --profile web --dump-config
   dsh --profile web
   ```

只有 tarball smoke、registry 字节/tag 复核和包名安装都通过，才宣布 npm 发布完成。任一步失败就停止公告；已有版本不能覆盖，修复后使用新版本号。

## GitHub 与 tarball 分发

DSH 官方支持从 Git host 安装；必须固定完整 commit SHA，不能把可移动 branch 当可复验证据：

```sh
dsh plugin --profile web add github:owner/repo#<full-commit-sha>
```

Git 安装取得的是源码，不会自动拥有 `lib/`。TypeScript 包需要作者提供自包含的 `prepare` 构建，且不能依赖 monorepo 邻居或开发机状态。pnpm 10+ 默认不执行 git 依赖的 `prepare`；用户要把 pnpm 报出的精确包 key 加入 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  '@scope/dsh-example': true
```

这相当于允许依赖在安装时执行代码，只应对已审查源码和固定 SHA 授权。更顺滑的默认是预构建 npm 包或经过 smoke 的 `.tgz`。若不发 npm，社区目录还允许把预构建 `.tgz` 放在 GitHub Release，并在条目中使用其 `tarball` URL；创建 Release 和上传资产仍需单独授权。

## 发现与社区目录

1. **GitHub Topic**：DSH 官方 README 推荐真正的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) Topic。修改 Topic 是远程写操作，先确认仓库范围；Agent Skill 仓库若不同时交付 DSH Bundle，应在 README 明确其 artifact 类型，不能让 Topic 暗示可用 `dsh plugin add` 安装。
2. **社区目录**：[`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 是社区维护项目，并非 DeepSeek 官方插件库。提交前重新读取其 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，因为分类和规则会变化。
3. **当前门禁（2026-08-20 核对）**：目标根包或子包声明真实 `dsh.bundle`；仓库至少创建 1 天且至少 10 个 commit；包含实际可用代码并持续维护；带 `dsh-plugin` Topic；功能描述准确、不写无法由源码证明的营销主张。
4. **当前提交形状**：只新增自己的 `data/plugins/<owner>__<repo>.yml`（monorepo 按其命名规则），选择最贴近实际功能的 category，运行目录项目要求的生成与检查。`skill` category 仍要求该条目本身是 DSH Bundle。每次目录 PR、截图或 tarball URL 都要另行授权和验证。

目录合并只证明符合该社区的收录规则，不代表 DeepSeek 官方背书或安全审计。

## 退役与事故处理

- 普通 bug：发布递增的新版本，完成同等门禁，必要时经授权调整 dist-tag；不要覆盖或悄悄替换旧版本。
- 旧版有已知问题但仍需保留：先写清替代版本和影响范围，再经明确授权执行 `npm deprecate <name>@<range> <message>`。deprecate 文案不得泄露事故细节中的凭证。
- 泄密或供应链事故：先停止公告与自动安装入口，轮换凭证并保存审计证据；是否 deprecate、移除 tag、申请 unpublish、撤回 Release 或通知目录维护者，按 registry/GitHub 当前政策逐项确认并逐项授权。
- 仓库归档：先提供迁移/替代说明、安装兼容状态和支持终止日期；同步处理 README、dist-tags/弃用信息与社区目录后再单独授权 archive。已归档或长期不维护的条目可能被社区目录移除。
- 默认不执行 `npm unpublish`。它受时限和依赖政策约束且影响现有用户；除非用户明确要求并在执行前核对当前 registry 规则，不把它当常规回滚方案。

## 权威来源

- DSH 官方：[Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- DSH 官方 README：[社区与 `dsh-plugin` Topic](https://github.com/deepseek-ai/deepseek-harness#community-and-support)
- 社区目录：[投稿与评审规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)

引用社区门禁时记录核对日期；真正提交前再次读取原文，不把本参考的快照当永久政策。
