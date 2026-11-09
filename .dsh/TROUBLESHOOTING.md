# DSH 适配层故障排查

本文件写给两种读者：**人**（想知道现在哪里坏了、怎么修）和 **AI 代理**（想用最少步骤定位并修复）。
所有结论都来自只读检查，格式稳定，可直接解析。

## 30 秒拿到结论

```bash
node .dsh/doctor.mjs            # 人看：七段检查 + 每段修复提示
node .dsh/doctor.mjs --json     # 机器看：结构化 checks[]
node .dsh/doctor.mjs --offline  # 不连运行中的实例（CI、没有 dsh web 时）
node .dsh/compat.mjs            # 只看 dsh 兼容性（包 / 子路径 / config 键 / standard 差异）
```

`doctor` 退出码：`0` = 没有 error（可能有 warn）；`1` = 至少一段是 error。
**先看 `status: "error"` 的段，按它的 `hint` 处理；`warn` 是提醒，不阻塞。**

| 检查段 | 回答的问题 |
|---|---|
| `repo` | 仓库关键文件是否齐全（`AGENT.md`、模板、`routing.yaml`） |
| `dsh` | 本机装的 dsh 在哪、版本多少 |
| `build` | `.dsh/build/` 是否与模板/`AGENT.md` 一致 |
| `build-version` | 生成物是不是用当前这个 dsh 版本构建的 |
| `profile` | profile 依赖与 `dsh.profile.bundles` 是否登记了本 bundle |
| `profile-link` | profile 的 `node_modules` 软链是否指向本仓库生成目录 |
| `compat` | 每个插件行的包/子路径能否解析、config 键是否还存在 |
| `dump` | `dsh --dump-config` 能否真实加载出本预设 |
| `runtime-freshness` | 生成物是否在运行实例启动之后才重建（此时实例加载的仍是旧内容） |
| `runtime` | 运行中的 dsh web 里，本预设是否被标成 `broken`（会被选择器隐藏） |

## 症状速查

### 1. 新任务选择器里看不到「SillyTavern制卡工坊」

原因：预设注册失败被标成 `broken`。dsh 的预设选择器只显示健康的预设：

```js
// dsh-client-ui-agent-preset/lib/client.js
presets.filter((preset) => preset.broken === void 0)
```

`broken` 是**实例启动时**一次性挂载的结果，修复文件后**必须重启 `dsh web`**，旧实例不会自己刷新。

```bash
node .dsh/doctor.mjs        # 看 runtime 段的 broken 文本
node .dsh/compat.mjs        # 看是哪一行、哪个包/子路径/配置键坏了
```

典型 `broken` 文本形如：

```text
tool-subagent-list-agents (@deepseek-ai/dsh-tool-subagent-control/list-agents): never started
```

`compat` 会给出同类结论（`specifier-not-exported`）和该包当前真正导出的路径列表。

### 2. 改了 `preset.template.yml` 但 DSH 里没变化

三层原因，逐层排查：

1. **没重建**：dsh 加载的是 `.dsh/build/cordis.patch.yml`，不是模板。
   `node .dsh/doctor.mjs` 的 `build` 段会报"与模板/AGENT.md 不一致"。
   修：`node .dsh/build.mjs`。
2. **bundle 不在 HMR 监视范围**：profile 层改动需要重启 `dsh web`（`install.mjs` 与 `verify.mjs` 都会提示）。
3. **加载的是拷贝而不是软链**：`profile-link` 段会说明。若是拷贝，重建后还要
   `cd "$DSH_HOME" && npm install --install-links`（或 `node .dsh/install.mjs`）。

### 3. 升级 dsh 之后预设又坏了

dsh 的插件清单是**静态引用**，升级会删包、改导出、改配置键名。升级后的固定动作：

```bash
node .dsh/doctor.mjs        # build-version 会提示生成物构建于旧版本
node .dsh/compat.mjs        # 逐行对照内置 standard，列出改名/缺失/新键
node .dsh/build.mjs         # 按新版本重建
node .dsh/verify.mjs        # 真实 --dump-config 加载
node .dsh/doctor.mjs        # 重启 dsh web 后再跑，确认 runtime 健康
```

历史案例（0.2.2）：

- `@deepseek-ai/dsh-tool-subagent-control/list-agents` 子路径被删除，`list_agents` 并入主插件 →
  整行必须删除；`compat` 会报 `specifier-not-exported`。
- `tool-subagent` 的 `modelSelectionSettings` 改名为 `modelSelection`，新增 `modelDiscovery`；
  宿主对未知键**静默忽略**，所以模型选择会悄悄失效，`compat` 报 `config-key-unknown` 并给出改名猜测。
- `tool-subagent` 的 `backgroundMode` 被移除。

### 4. `doctor` 说 runtime 解密失败

`dsh-launch.instance.json` 里的 `protectedUrl` 是 Windows DPAPI 密文，**只有启动 dsh web 的同一个 Windows 用户**能解密。
用同一用户运行，或加 `--offline` 只做静态检查。实例文件对应的进程退出后，`runtime` 段会显示"文件已过期"，重启 dsh web 即可。

### 5. `compat` 找不到 dsh / 跳过 specifier 检查

`dsh` 未安装、`DSH_HOME` 未设置，或不在安装 dsh 的 Node 环境里运行。
静态结构仍会检查；要完整检查，设置 `DSH_HOME`（默认 `~/.dsh`）或修正 `--profile`。

### 6. profile 名字不是 `web`

```bash
node .dsh/doctor.mjs --profile <名字>
node .dsh/compat.mjs --profile <名字>
```

profile 目录解析顺序：`$DSH_PROFILE_DIR` > `$DSH_HOME/profiles/<profile>`；`$DSH_HOME` 缺省为 `~/.dsh`。

## 机制备忘（为什么这些检查这样写）

- **挂载是一次性的**：`@deepseek-ai/dsh-agent-preset-registry` 在注册时运行一次 preset 行；
  失败后 `record.broken = error.message` 被记住，`diagnostic()` 不再重试。所以 `broken` 只能靠重启实例消除。
- **未知 config 键不报错**：插件把不认识的键当默认值用，行为悄悄变了但没有日志——
  这就是 `compat` 必须去源码里查键存在性的原因。
- **子路径最脆**：`@scope/pkg/subpath` 依赖包 `exports` 字段；升级删一个子路径，整行 `never started`。
  `compat` 对子路径单独告警（`subpath-specifier`），并优先建议改用包根名。
- **生成物带溯源**：`.dsh/build/package.json` 的 `generated.dshVersion` 记录构建时的 dsh 版本，
  `build-version` 段据此判断是否需要重建。
- **路径不写死**：生成物里一律 `!!js dshHomePath(...)`，换机器/换用户名/换盘符不用改文件。

## 文件地图

| 文件 | 角色 | 谁改 |
|---|---|---|
| `.dsh/preset.template.yml` | 预设源码（persona 占位符 + 插件行） | 人 / AI |
| `AGENT.md`、`orchestrator/routing.yaml` | 创作合同与阶段表，构建时读取 | 人 / AI |
| `.dsh/build/*` | 生成物，dsh 实际加载的东西 | **只由 `build.mjs` 生成，不要手改** |
| `$DSH_HOME/profiles/<p>/package.json` | 依赖与 `dsh.profile.bundles` 登记 | 只由 `install.mjs` 改 |
| `$DSH_HOME/profiles/<p>/node_modules/@local/dsh-rp-card-studio` | 指向生成目录的软链/拷贝 | `npm install --install-links` |
| `.dsh/compat.mjs` | 只读兼容性探针（包 / 子路径 / 配置键 / standard diff） | 适配层维护者 |
| `.dsh/doctor.mjs` | 只读全链路诊断（含运行中实例的 `broken`） | 适配层维护者 |
| `.dsh/verify.mjs` | 结构 + 真实 `--dump-config` 校验 | 适配层维护者 |

## 给 AI 代理的操作约定

1. 先跑 `node .dsh/doctor.mjs --json`，读 `checks` 中 `status === "error"` 的项，逐个按 `hint` 处理。
2. 改预设只改 `.dsh/preset.template.yml`，改完必须 `node .dsh/build.mjs`；
   **不要手改 `.dsh/build/`**（下次构建会被覆盖，且 `doctor` 会报不一致）。
3. profile 登记只走 `node .dsh/install.mjs`，不要手写 `profiles/<p>/package.json`。
4. **重启 `dsh web` 会中断用户当前会话**：把重启命令交给用户执行，或在用户明确同意后执行；
   重启前先完成 `compat` / `build` / `verify` 的修复，避免反复重启。
5. 修完复验顺序：`node .dsh/compat.mjs` → `node .dsh/build.mjs` → `node .dsh/verify.mjs`
   → `npm run test:dsh` → 用户重启后 `node .dsh/doctor.mjs`。

## 与仓库测试的关系

- `node --test ".dsh/*.test.mjs"`（`npm run test:dsh`）锁定生成物结构、宏转义、幂等安装，
  以及 `compat.mjs` 的子路径/配置键/占位符解析行为。
- `.dsh/verify.mjs` 额外接入 `compat`：只要有 error，`verify` 就不算 `verified`。
- `scripts/run-tests.mjs` 只跑 `tests/` 与 `scripts/`，不含 `.dsh`；适配层测试单独跑。
