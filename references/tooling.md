# DSH 插件可执行工具箱

所有脚本使用 Node.js ESM 与内置模块，默认以失败关闭。先在副本/临时目录试跑；不要用 `--execute` 清理来源不明的 manifest。

设 Skill 路径为：

```sh
DSH_SKILL_ROOT=/path/to/codex/skills
DSH_SKILL="$DSH_SKILL_ROOT/dsh-plugin-best-practices"
```

实际运行时替换为当前 Skill 的真实绝对路径；不要把该机器路径写入项目或证据。

## 1. 初始化插件

```sh
node "$DSH_SKILL/scripts/init-plugin.mjs" \
  --target ./dsh-example \
  --name dsh-example \
  --plugin-id example \
  --dsh-version 0.1.0-rc.8 \
  --cordis-version 4.0.1 \
  --browser
```

- `--target` 必须是不存在或为空的目录；脚本拒绝覆盖已有文件。
- 默认生成 Host 包；`--browser` 额外生成 `./client`、`dsh.client` 和 Browser bundle 配置。
- 模板是最小可构建基线，不替代业务契约、失败测试、具体 DSH API 依赖和 README。
- 生成后运行 `pnpm install && pnpm test && pnpm run build && pnpm run verify:package`。

模板位于 `assets/plugin-template/`，当前统一生成 DSH `0.1.0-rc.8`、Cordis `4.0.1`。只有用户明确要求整体迁移基线时，才同时更新兼容性矩阵、模板和工具默认依赖，并用临时 fixture 完整生成一次；不要为单个插件改变默认版本。

## 2. 验证发布包

```sh
node "$DSH_SKILL/scripts/verify-package.mjs" \
  --project . \
  --result artifacts/package/<run-id>/result.json \
  --provenance artifacts/package/<run-id>/provenance.json
```

验证内容包括：package 类型/入口、`exports` 与构建文件、`files` 覆盖、`dsh.bundle.patch`、patch 基本形状，以及 `dsh.client` 与 `./client` 的成对声明。默认要求构建产物存在；只有初始化阶段可临时使用 `--allow-unbuilt`。

提供任一证据路径时，脚本会在同一目录自动补齐缺少的 `result.json` 或 `provenance.json`；两条路径必须不同，建议保留标准文件名。该脚本不证明 Cordis 能激活插件，也不证明 stock DSH 能安装 tarball。

## 3. rc.8 发行完整性

Skill 内置 `assets/trust/dsh-0.1.0-rc.8.json`，记录官方 npm registry 的 rc.8 发行元数据与本地复核值：

| 对象 | 可信值 | 用途 |
|---|---|---|
| npm tarball | `sha256:b8b0db6f3bcf3aed77c25bb901fdb9d0ef0f79bd8ca403b52e34c14a71d1487f` | 校验下载到的完整发行包 |
| npm `dist.integrity` | `sha512-VQU5NlomrKLRgcXuOf+sxWFvqxPA8q9vMhrKPlPPXiOJEhGlGlAdiyxZvZxkCVI+v0zbhe21cY3/luLyxpSzzA==` | 与 registry 元数据做第二种摘要核对 |
| 包内 `lib/bin.js` | `sha256:c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62` | stock smoke 校验并执行稳定 DSH 入口 |

先从官方 npm 来源取得精确版本，再验证下载物和解包入口：

```sh
mkdir -p artifacts/stock-dsh
npm pack @deepseek-ai/dsh@0.1.0-rc.8 --ignore-scripts \
  --pack-destination artifacts/stock-dsh
tar -xzf artifacts/stock-dsh/deepseek-ai-dsh-0.1.0-rc.8.tgz \
  -C artifacts/stock-dsh
node "$DSH_SKILL/scripts/verify-dsh-release.mjs" \
  --tarball artifacts/stock-dsh/deepseek-ai-dsh-0.1.0-rc.8.tgz \
  --entry artifacts/stock-dsh/package/lib/bin.js \
  --result artifacts/stock-dsh/integrity/result.json \
  --provenance artifacts/stock-dsh/integrity/provenance.json
```

这份清单按“发行来源与稳定载荷”区分，而不是伪造每个操作系统一份不同值：npm tarball 与包内入口是平台无关的相同字节。macOS/Linux 的 `.bin/dsh` 通常是包管理器生成的 symlink；Windows 的 `dsh.cmd`/`dsh.ps1` 以及 npm、pnpm、npx 生成的其他 shim 也会因工具和安装路径改变。它们只能负责转发，不能作为官方发布物信任根。所有平台都优先校验、运行精确安装中的 `node_modules/@deepseek-ai/dsh/lib/bin.js`。

内置 registry signature 只是当时 registry 返回的元数据；当前脚本核对 SHA-256、大小和 npm `dist.integrity`，不声称完成了签名密码学验证。升级基线时必须重新从官方来源取数、交叉核对并更新清单，不能把 rc.8 digest 套到新版本。

## 4. stock DSH smoke

先构建并打包，再用 rc.8 发行版的真实 `dsh` 可执行文件：

```sh
mkdir -p artifacts/stock-dsh/install
npm install @deepseek-ai/dsh@0.1.0-rc.8 --ignore-scripts \
  --no-audit --no-fund --prefix artifacts/stock-dsh/install
pnpm pack --pack-destination artifacts/package
node "$DSH_SKILL/scripts/smoke-stock-dsh.mjs" \
  --project . \
  --tarball artifacts/package/dsh-example-0.1.0.tgz \
  --dsh-entry artifacts/stock-dsh/install/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --execution real \
  --dsh-source npm:@deepseek-ai/dsh@0.1.0-rc.8 \
  --expected-dsh-sha256 sha256:c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62 \
  --expected-dsh-version 0.1.0-rc.8 \
  --probe /api/example/status \
  --artifacts artifacts/smoke/<run-id>
```

脚本默认要求并精确校验 `0.1.0-rc.8`；命令中显式写出 `--expected-dsh-version 0.1.0-rc.8` 有利于审查。real 模式还要求公开的发行来源描述和从可信发布元数据独立取得的预期 SHA-256；脚本实际比对目标后才继续，不能临时对同一个未知文件计算 digest 再把它当“可信预期值”。`--dsh-entry` 会通过当前 Node 执行稳定包入口，适用于所有平台，也是 rc.8 推荐路径；`--dsh` 仍可用于直接可执行文件或受控 adapter，但不要把生成的 shim checksum 当官方发行证据。

入口必须来自一份依赖已安装完成的精确 rc.8 安装，而不是只有 `npm pack` 解出的裸包；解包入口可用于完整性校验，但缺少依赖时不能直接完成 smoke。脚本随后创建新的临时 `DSH_HOME`，在 `web` profile 中安装插件 tarball、dump config、启动 Web、探测首页和可选同源路径，并检查 Browser 插件是否进入 boot manifest。子进程只继承 PATH、locale、临时目录等最小环境，不继承 GitHub/npm/Provider token；私有 registry 等特殊凭证必须在隔离环境中显式处理，不能依赖开发 shell 的整包环境泄漏。脚本会写 `result.json`、`provenance.json` 和 `resources.json`，失败、中断和正常退出都会尝试终止子进程并清理；`--keep-home` 只用于诊断并必须在报告中说明。

限制：HTTP probe 不能替代真实浏览器交互，也不能替代 Provider/模型请求。持久化日志会在流式写入时做基础脱敏和大小限制，但分享前仍必须扫描。若主张涉及这些链路，增加对应 UI/业务验收。

`--execution` 没有默认值，调用者必须明确选择。脚本自测若使用 fake/wrapper adapter，只能传 `--execution mock` 或 `--execution hybrid`；结果会标为 `partial`，并把 stock DSH 兼容列入 `notProven`。只有目标发行版的真实 stock `dsh` 才传 `--execution real`，不要靠伪造 `--version` 把 adapter 结果升级为兼容证据。

## 5. 敏感信息扫描

```sh
node "$DSH_SKILL/scripts/scan-sensitive.mjs" \
  --project . \
  --result artifacts/security/<run-id>/result.json \
  --provenance artifacts/security/<run-id>/provenance.json
```

扫描高风险文件名、私钥头、常见 token 形状、带值的 secret/password/token 赋值和机器绝对路径。输出只包含规则、文件和行号，不回显匹配值。默认错误级发现使进程失败；机器路径作为 warning，使用 `--fail-on warning` 可把它升级为门禁。提供任一证据路径时同样自动生成路径不同的标准 pair。

至少在以下对象上运行：准备打包的工作树、解包后的 tarball 内容、GIF/trace/log 所在证据目录、准备提交的媒体目录。扫描是补充门禁，不替代人工审查与 Git 历史检查。

## 6. 所有权资源清理

smoke/录制工具应写 `resources.json`：

```json
{
  "schemaVersion": "1.0",
  "owner": "dsh-plugin-best-practices",
  "runId": "20260820T120000Z-a1b2c3",
  "resources": [
    { "type": "directory", "path": "/tmp/dsh-plugin-smoke-20260820T120000Z-a1b2c3", "marker": ".dsh-plugin-resource.json" },
    { "type": "process", "pid": 12345, "commandIncludes": "20260820T120000Z-a1b2c3" }
  ]
}
```

先 dry-run：

```sh
node "$DSH_SKILL/scripts/cleanup-test-resources.mjs" \
  --manifest artifacts/smoke/<run-id>/resources.json
```

确认目标后再执行：

```sh
node "$DSH_SKILL/scripts/cleanup-test-resources.mjs" \
  --manifest artifacts/smoke/<run-id>/resources.json \
  --execute
```

目录必须位于系统临时目录或显式 `--allow-root` 下，并包含 owner/runId marker；进程命令必须含 manifest 给出的唯一标记。任一校验不满足时拒绝清理。不要为了“收尾干净”扩大允许根目录，更不要把仓库根、用户目录或 `/` 作为清理目标。

## 推荐门禁顺序

```text
test → build → verify-package → scan-sensitive → pack
     → scan unpacked tarball → verify rc.8 release → stock DSH smoke
     → UI/GIF review（仅相关任务）→ cleanup audit
```

把每一步写入标准 `result.json`/`provenance.json`，不要用后一层成功倒推前一层已经执行。
