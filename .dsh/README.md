# DeepSeek Harness 适配层

这个目录把本仓库的 Agent 装进 [DeepSeek Harness](https://github.com/deepseek-ai)（`dsh`）作为一套 profile bundle。适配层只做"把仓库既有合同搬进 DSH"，不复制、不改写创作合同本身。

- **创作合同仍然是仓库根目录的那一份**：`AGENT.md`、`orchestrator/`、`internal-skills/`、`scripts/`。
- **不影响其它 harness**：Codex、Claude Code 等继续读 `AGENT.md`、`agent.yaml`、`internal-skills/`；本目录不被它们读取，也没有 hooks 或全局副作用。
- **模块解析只发生在加载时**：生成物里所有路径都写成 `!!js dshHomePath(...)`，由 `@deepseek-ai/dsh-home-paths` 在加载时按 `$DSH_HOME` 解析，因此同一份仓库换机器、换用户名、换盘符都不需要改文件。

## 一条命令安装

```bash
node .dsh/install.mjs            # 默认 profile 取 $DSH_PROFILE，否则 web
node .dsh/install.mjs --profile web --dry-run   # 只看会改什么，不落盘
```

安装脚本做三件事：

1. 调用 `build.mjs` 生成 bundle（默认输出 `.dsh/build/`）；
2. 在 `<DSH_HOME>/profiles/<profile>/package.json` 里登记依赖 `"@local/dsh-rp-card-studio": "link:<生成物目录>"`；
3. 把 `@local/dsh-rp-card-studio` 追加进该 profile 的 `dsh.profile.bundles`。

两处补丁都是文本级、键序与缩进保持原样、重复执行结果不变（第二次会报 `already-linked` / `already-registered`）。

安装后**需要重启 `dsh web`**：bundle 内部的 `cordis.patch.yml` 不在 profile 层 HMR 的监视范围内，正在运行的会话沿用它启动时注册的 persona。

## 生成物（不入库）

`node .dsh/build.mjs` 在 `--out`（默认 `.dsh/build/`，已在 `.gitignore` 中忽略）写出三件：

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch: ./cordis.patch.yml`，额外带 `generated` 溯源信息（仓库路径、构建时探测到的 dsh 版本、时间戳），`generated` 不参与加载 |
| `cordis.patch.yml` | 预设本体：一条 `- insert: preset-rp-card-studio`，内含 persona、agent-instructions、skill-filesystem（两个技能根目录）与工具/会话 roster |
| `skills/rp-card-studio-workflow/SKILL.md` | 入口技能 `rp-card-studio-workflow`：契约根目录、作品工作目录、阶段表、阶段脚本、验收口径 |

`cordis.patch.yml` 里的 persona 是「运行环境（DeepSeek Harness）」前言 + `AGENT.md` 全文，逐字内嵌。SillyTavern 宏（`{{user}}`、`{{char}}`、`{{match}}`、`{{random::...}}`、`{{format_message_variable::stat_data}}`）在写入 persona 时用零宽空格拆开花括号对，避免宿主把它们当模板求值；可见文字不变。

## 校验

```bash
node .dsh/build.mjs --check        # 只构建、报告，不写文件
npm run test:dsh                   # 13 条适配合同用例
node .dsh/verify.mjs               # 结构检查 + 真实加载检查
```

`verify.mjs` 的结论只有三种，含义严格区分：

- `verified`：结构检查全过，并且 `dsh --profile <profile> --dump-config` 真的展开了本 bundle（dump 里能看到包名、preset 段与两个技能根目录）。
- `structural-only`：结构检查全过，但本机找不到 `dsh` 可执行文件，真实加载未验证。
- `failed`：任一硬检查失败。

`--offline` 会跳过真实加载检查。`dsh --dump-config` 不求值 `!!js`，它证明的是"bundle 被收录、结构与顺序正确"，不等于运行时行为已验证——运行时结论以 `verify.mjs` 报告的 `runtime` 字段为准。

## 可移植性

- 目录名假定为 `rp-card-studio-agent`；放在别处时，安装前用 `--repo-dir` 或调整 `.dsh/preset.template.yml` 里的 `dshHomePath('workspace', 'rp-card-studio-agent', ...)` 段。
- 预设自带 `skills/` 根目录（`dshHomePath('presets','rp-card-studio','skills')`），与仓库内 `internal-skills/` 一起注册为技能来源；两个目录都存在时，技能以仓库内版本为准。
- 入口技能与阶段技能都在仓库里，因此更新仓库（`git pull`）后只需重跑 `node .dsh/build.mjs` 再重启 `dsh web`。

## 其它 harness

| 文件 | Codex / Claude Code | DeepSeek Harness |
|---|---|---|
| `AGENT.md` | 读 | 由 `.dsh/build.mjs` 内嵌进 persona |
| `agent.yaml`、`SKILL.md` | 读 | 不读（入口技能由 `.dsh/` 生成） |
| `internal-skills/` | 读 | 通过 `customSkillDirs` 读同一批文件 |
| `.dsh/` | 不读 | 适配层本体 |
