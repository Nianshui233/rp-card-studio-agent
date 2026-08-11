# SillyTavern制卡工坊

`rp-card-studio` 是一个面向 Codex 的 SillyTavern 角色卡创作技能。

它不会收到一句设定后立刻吐出一张难以维护的大卡，而是把制卡拆成多个清楚的阶段：先问当前阶段真正需要决定的问题，给出方向和推荐，等你选择后再生成可合并片段。项目进行到最后，技能还会构建制品、检查引用、检查制品一致性，并告诉你哪些结果已经证实、哪些仍需在 SillyTavern 中实测。

> 这个技能只会被显式调用。请使用技能选择器，或在请求中明确写出 `$rp-card-studio`。普通的“创建角色”“写世界观”等自然语言不会自动触发它。

## 它是什么，不是什么

- 它是安装给 **Codex** 的工作流程和本地工具，不是安装到 SillyTavern 里的插件。
- 它能设计、维护、构建和检查角色卡，但不会替你安装 SillyTavern、Tavern Helper，或所选 MVU/EJS 实现需要的宿主扩展。具体依赖以项目整合清单为准。
- 它可以把已有图片作为 PNG 底图打包，但不会凭空生成头像、立绘或背景图。
- 它会生成结构化源码和制品，不是只能使用一次的一大段提示词。
- README 是给人看的入门手册；技能运行时以 `SKILL.md`、阶段规则、模板和 Schema 为准，不依赖 README 才能工作。

## 一分钟理解

你可以把它理解成一位会做项目管理、编辑、制卡和质量检查的搭档。

| 你负责 | 技能负责 |
| --- | --- |
| 指定项目放在哪里 | 创建并维护项目工作区 |
| 选择是否启用 NSFW | 记录开关，并在后续阶段一致执行 |
| 回答问题、选择方向，或明确放权 | 给出有差异的选项、影响和推荐 |
| 检查阶段总汇是否符合想法 | 生成结构化片段并锁定已经确认的决定 |
| 在最终的 SillyTavern 环境中体验 | 构建角色卡、检查引用、生成验证报告 |

整个工作方式可以概括为：

```text
多项问题 + 信息采集 + 推荐方向
                ↓
            你作出选择
                ↓
        生成本轮可用片段并锁定
                ↓
      检查缺口，继续本阶段下一轮
                ↓
       阶段总汇、查缺补漏、再前进
```

## 它适合做什么

- 从零创建一张结构完整的 SillyTavern 角色卡。
- 把零散设定、旧文档或已有素材整理成可维护项目。
- 继续上次没有做完的制卡项目，而不是重新盘问一遍。
- 修改、审查或转换已有角色卡 JSON、PNG、世界书。
- 设计复杂世界观、角色行为、数值系统、状态机、场景和开场。
- 按需加入 MVU、EJS、状态栏/UI、媒体资源和 Tavern Helper 适配器。
- 生成角色卡 JSON，或在有 PNG 基底时打包角色卡 PNG。
- 检查源文件、引用关系、制品编码往返，以及显式解包重建是否一致。

它不适合替代真实的 SillyTavern 运行环境。离线检查全部通过，也不等于扩展、脚本、状态栏和移动端显示已经在你的 SillyTavern 中实测通过。

## 使用前准备

### 必需

1. 一个支持 Skills 的 Codex 环境。
2. Node.js 20 或更高版本。
3. 一个由你指定的角色卡项目目录。它是每张卡自己的工作区，不是技能安装目录，也不是原材料目录。
4. 首次从这个私有仓库安装时，需要 Git 和 GitHub CLI（`gh`）。已经安装好的技能在日常使用时不依赖 `gh`。

检查 Node.js：

```powershell
node --version
```

看到 `v20`、`v22`、`v24` 或更高版本即可。

检查 Git 和 GitHub CLI：

```powershell
git --version
gh --version
```

若命令不存在，请先安装 [Git](https://git-scm.com/downloads) 和 [GitHub CLI](https://cli.github.com/)。

### 最终验收时需要

- 可用的 SillyTavern 环境。
- 项目整合清单中实际登记的扩展或宿主能力，例如 Tavern Helper 或所选 MVU/EJS 实现需要的宿主扩展。

这些不是开始创作的前提。你可以先完成离线设计和构建，再做真实运行验收。

## 安装

这个仓库是私有仓库。安装设备上的 GitHub 账号必须有访问权限，并已通过 GitHub CLI 登录。

尚未登录时先执行：

```powershell
gh auth login
```

检查登录状态：

```powershell
gh auth status
```

### Windows PowerShell

在目标目录尚不存在时执行：

```powershell
$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$skillDir = Join-Path $codexRoot "skills\rp-card-studio"
New-Item -ItemType Directory -Force (Split-Path $skillDir) | Out-Null
gh repo clone Nianshui233/rp-card-studio "$skillDir"
Test-Path (Join-Path $skillDir "SKILL.md")
node "$skillDir\scripts\rp-card-forge.bundle.mjs" doctor
```

最后两行应分别返回 `True` 和通过的环境检查。`SKILL.md` 必须直接位于 `rp-card-studio` 目录内，不要意外安装成 `rp-card-studio\rp-card-studio\SKILL.md`。

### macOS 或 Linux

```bash
codex_root="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$codex_root/skills"
gh repo clone Nianshui233/rp-card-studio "$codex_root/skills/rp-card-studio"
test -f "$codex_root/skills/rp-card-studio/SKILL.md"
node "$codex_root/skills/rp-card-studio/scripts/rp-card-forge.bundle.mjs" doctor
```

安装后新建一个 Codex 任务，让 Codex 重新扫描技能目录。技能列表中应出现：

```text
SillyTavern制卡工坊
```

如果目标目录已经存在，不要直接覆盖。先确认里面是否有未同步修改，再决定更新、备份或重新安装。

通过 Git 克隆安装的副本可以这样更新：

```powershell
$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$skillDir = Join-Path $codexRoot "skills\rp-card-studio"
git -C "$skillDir" pull --ff-only
```

## 第一次使用：五分钟上手

### 第一步：显式调用技能

在 Codex 中输入：

```text
使用 $rp-card-studio，从零创建一张 SillyTavern 角色卡。
```

也可以通过技能选择器选择“SillyTavern制卡工坊”。

仅仅输入下面这种请求不会自动触发：

```text
帮我创建一个角色。
```

这是故意设计的，目的是避免日常写作中出现“创建”“角色”“世界观”等词时误启动完整制卡流程。

### 第二步：回答项目预检

新项目的首轮只会确认项目环境，不会立刻追问题材、角色性格、剧情或 UI，也不会在预检尚未锁定时创建项目文件。

你需要提供：

1. **项目工作区**：项目文件要放在哪个目录。这个位置必须由你指定，技能不会替你猜。
2. **NSFW 开关**：明确回答“启用”或“不启用”。
3. **任务类型**：新建、续作、材料转换、修改或审查。
4. **已有材料**：有就给路径，没有就回答“无”。
5. **目标交付物**：例如维护源码、角色卡 JSON、PNG、世界书或 UI 工程。

一个可以直接照着改的回答：

```text
工作区：D:\AI\RP创作\项目\夜班列车
NSFW：不启用
任务类型：新建
已有材料：无
交付物：维护源码 + 角色卡 JSON
```

工作区可以是尚未创建的目录，但必须写清楚。不要只回答“你随便找个地方”。

### 第三步：开始阶段式共创

预检完成后，技能进入“项目定位”。正常创作阶段每轮通常会提出 3 至 6 项问题；收尾只剩一个主缺口时，也会从选择、边界、例外或验收影响中提取至少两项真实信息，不会用无关问题凑数。

每轮会：

1. 先总结已经确定的内容。
2. 一次提出多项当前阶段问题。
3. 为每个问题给出不同方向、影响和推荐。
4. 等你选择，不替未授权的决定拍板。
5. 根据回答生成本轮片段，并列出新锁定内容。
6. 继续补齐当前阶段，直到可以给出阶段总汇。

你不需要会写 YAML 或 JSON。正常情况下，只要用自然语言回答选项、补充自己的想法即可。例如：

```text
1B；2按推荐；3选择 A+C；4自定义：希望开场更克制，不直接揭示真相。
```

### 第四步：检查阶段总汇

每个阶段结束时，你会看到：

- 已锁定决定；
- 可进入最终项目的合并片段；
- 完整度检查；
- 缺漏和风险；
- 跨阶段待办；
- 下一个阶段的方向与推荐。

确认无误后再进入下一阶段。已经锁定的内容不会在后续被悄悄改写。

## 默认阶段路线

下表是**从零创建完整角色卡**的默认路线。续作、修改、转换和审查任务完成预检与依赖检查后，可以恢复原进度，或直接路由到真正相关的阶段，不需要把所有阶段从头重做。

```text
项目预检
-> 项目定位
-> 材料整理（可选）
-> 世界观
-> 角色
-> 系统（可选）
-> 场景（可选）
-> MVU/EJS（可选）
-> 叙事与开场
-> 状态栏/UI（可选）
-> 整合交付
```

| 阶段 | 用通俗的话说 | 是否可跳过 |
| --- | --- | --- |
| 项目预检 | 确认工作区、NSFW、任务类型、材料和交付物，不讨论创作内容 | 否 |
| 项目定位 | 决定这张卡要提供什么体验、面向谁、做到什么程度 | 否 |
| 材料整理 | 盘点旧卡、笔记、图片或参考材料，确定哪些可信、哪些只作参考 | 是 |
| 世界观 | 建立世界规则、社会结构、历史、势力和信息分层 | 否 |
| 角色 | 建立身份、动机、行为逻辑、关系、知识边界和说话方式 | 否 |
| 系统 | 设计关系值、资源、状态轴、状态机和业务判定 | 是 |
| 场景 | 设计地点、区域、出入口、线索、事件和可交互内容 | 是 |
| MVU/EJS | 把已有状态和规则映射成运行时变量、更新协议与条件内容 | 是 |
| 叙事与开场 | 决定叙事合同、开场事实、钩子、玩家交接点和呈现变体 | 否 |
| 状态栏/UI | 决定玩家看到哪些状态、怎样排版，并区分设计文案与真正可交付的刷新/失败行为 | 是 |
| 整合交付 | 装配世界书、媒体、适配器和最终制品，并完成验证 | 否 |

### 为什么每次只聊一个阶段

这是为了避免决定互相污染。

例如：

- 世界观阶段可以讨论世界规则，但不会提前问某个角色的口癖。
- 系统阶段可以讨论“好感如何变化”，但不会提前问状态存到哪个运行时路径。
- 场景阶段可以登记“这里需要背景图”，但实际图片来源和预加载方式留到整合阶段。
- 叙事阶段决定开场发生什么，UI 阶段只决定怎样显示，不反过来改写开场事实。

如果你主动说出了其他阶段的信息，技能会先放进“跨阶段待办”，到正确阶段再处理。

## 普通选择与 AI 放权

默认情况下，决定权在你手里。技能会推荐，但会等你选择。

当你不想逐项决定时，可以明确放权：

```text
当前世界观阶段剩下的内容全部由你决定。
```

或者：

```text
从现在开始，剩余整个项目全部交给你决定。
```

两句话的授权范围不同：

- “当前阶段”只覆盖当前阶段，进入下一阶段后恢复正常提问。
- “剩余整个项目”覆盖后续路线，技能会继续代为决定。

获得明确授权后，技能会直接：

1. 完成授权范围内的剩余决定；
2. 报告它决定了什么以及为什么；
3. 把决定写入锁定记录；
4. 后续不再反复询问同一件事。

模糊的“你看着办”不会自动扩大成整个项目授权。

## NSFW 开关怎么工作

NSFW 只在项目预检时确认一次。

### 不启用

- 后续问题、模板、运行字段和玩家制品中不生成相关内容。
- 不会在每个阶段重复提醒或创建额外限制卡。

### 启用

- 技能自身不再追问额外偏好或边界设置。
- 相关结构自动合入角色和状态栏/UI 模板。
- 不会额外创建一个“NSFW 阶段”。

无论如何选择，都仍然服从当前平台不可取消的安全规则。

## MVU、EJS 和 Tavern Helper 是什么

这三个词经常让新手困惑，而且它们都不是每张卡必需的。

### MVU

在这个技能里，MVU 负责运行时状态契约，例如：

- 好感、信任、资源或阶段值存在哪里；
- 字段是什么类型、默认值是多少；
- 谁可以写、谁可以读；
- 更新失败时怎样回退；
- 新开场怎样初始化状态。

如果你的卡没有需要稳定维护的运行时状态，可以跳过。

当前 Forge 真正实现的是 `same_generation`：角色在一次回复中同时给出叙事和变量更新块，MVU 从这条原始消息解析并提交。它不会自动再请求一次“更新模型”。配置里的 `writer.kind: update_model` 只是说明字段由哪个逻辑角色负责，不等于已经存在第二次 API 请求。

`extra_pass` 和 `both` 只有在项目确实实现了独立请求触发、提示词/接收者路由、响应解析、协议校验、原子提交、失败回退和真实宿主测试整条链时才成立。当前技能没有这条独立请求链，因此新项目默认并只允许 `same_generation`；旧项目声明另外两种模式会被阻断，而不会因为存在一个可手工调用的解析/提交函数就假装可用。

### EJS

EJS 负责根据已有状态选择内容，例如：

- 信任低于 30 时使用警惕版本的对话；
- 已发现线索时显示新的世界书段落；
- 不同阶段加载不同内容。

EJS 读取已经登记的字段，不负责凭空发明新的世界规则或数值系统。

在本技能里，EJS 的执行引擎是 SillyTavern 的 `ST-Prompt-Template 1.17.6.8`，不是 Tavern Helper 自带的状态 API。你在 `mvu.yaml` 中写的是结构化条件，而不是一整段自由格式的脚本：

```yaml
ejs:
  enabled: true
  entries:
    - id: trust_gate
      source_ref: character:guide
      complexity: section_branch
      engine: st_prompt_template
      placement: after
      insertion_order: 120
      condition:
        runtime_path: stat_data.relationship.trust
        operator: gte
        value: 50
      reads: [stat_data.relationship.trust]
      target: both
      branches:
        when_true: "使用已写好的信任版本段落。"
        when_false: "使用已写好的谨慎版本段落。"
        fallback: "状态不可用时使用中性段落。"
      missing_dependency: omit_dynamic
```

Forge 会把 `target: both` 拆成一条 generate 条目和一条 render 条目，写入角色卡的 `data.character_book.entries[]`。它不会把 EJS 塞进 Tavern Helper scripts，也不会替你创造分支正文。旧项目如果仍使用 `condition: "..."` 和顶层 `fallback`，请先在 MVU/EJS 阶段迁移；工具会报结构错误，不会猜测改写。

纯 EJS 模式会使用 `getvar(runtime_path, { defaults })` 精确读取变量。MVU + EJS 模式则把 MVU 快照当作唯一事实源：当前已验证的组合固定为 `message` scope、`stat_data` namespace 和 current/latest message snapshot；条目会在有界超时内等待 `Mvu`，再调用 `Mvu.getMvuData(target)`。`latest_message` 始终读取最新楼层；`current_message` 在 render 上下文读取 ST-Prompt-Template 提供的数字 `message_id`，在 generate 上下文因宿主不提供楼层号而明确降级到 latest。快照、namespace 或字段路径缺失时直接输出 `branches.fallback`，不会用默认值悄悄落入真假分支。其它 storage 组合会在构建前被阻断，直到技能具备对应的宿主映射。

EJS 还需要在 `runtime_contract.dependencies` 登记宿主依赖，并把 `globalThis.EjsTemplate` 作为 readiness probe。依赖未安装时，`omit_dynamic` 会保留静态内容并省略动态条目，`block` 则阻止交付；两种行为都要在项目报告里明确写出。

### Tavern Helper 适配器

它是可选的 MVU 宿主桥接层。只有项目明确选择内嵌交付并满足契约时，Forge 才会生成 Runtime Guard；它会有界等待 `Mvu`、先订阅公开的 `Mvu.events.*`，再用现有快照补做初始化。MVU Runtime Guard 不会读取 `globalThis.stat_data`、调用 `getVariables()` 或猜测 `globalThis.MVU`。消息状态栏 iframe 是另一条只读链路，会使用 Tavern Helper 的 `getVariables()` 读取自己的消息快照；EJS 条目本身仍留在 CharacterBook 中。

消息状态栏只有两条交付路径：普通文字或 HTML 使用 SillyTavern 角色正则，复杂交互使用 Tavern Helper 消息级 JS/iframe。两者都把状态栏留在产生它的 AI 消息中。

生成的适配器随角色卡或项目交付，不会临时引入未登记的 CDN 或远程脚本。兼容逻辑全部位于技能产物中，不会修改 SillyTavern 本体或已安装扩展。宿主依赖是否真的可用，仍需在你的 SillyTavern 中验证。

### 简单选择建议

| 需求 | 建议 |
| --- | --- |
| 纯文字角色卡，没有持久数值 | 跳过 MVU/EJS |
| 需要稳定维护关系值、资源或阶段 | 使用 MVU |
| 需要根据状态切换条目或文本 | 使用 EJS |
| 两种需求都有 | MVU + EJS |
| 需要消息内文字或简单静态 HTML 状态栏 | 使用 SillyTavern 角色正则直接投影 |
| 状态栏需要动态逻辑、复杂交互或可靠逐楼快照 | 使用 Tavern Helper 消息 iframe |
| MVU 需要宿主事件桥接 | 再评估 Tavern Helper Runtime Guard |

你不需要在项目首轮决定这些。到达 MVU/EJS 阶段前，只需要选择“进入”还是“跳过”。

## 项目工作区里有什么

一个较完整的项目大致如下。可选目录会按实际启用的阶段逐步出现，刚执行 `init` 时不一定已经拥有全部目录：

```text
你的项目目录/
├─ project.yaml
├─ .rp-card-state.json
├─ src/
│  ├─ positioning.yaml
│  ├─ world/
│  ├─ characters/
│  ├─ systems/
│  ├─ scenes/
│  ├─ mvu/
│  ├─ prompts/
│  ├─ ui/
│  └─ integration/
├─ dist/
└─ reports/
```

### `project.yaml`

这是项目的“语义决定账本”，保存用户确认的内容、阶段规划、功能开关、决定和源码清单。

### `.rp-card-state.json`

这是项目的“技术进度账本”，保存当前阶段、轮次、决定锁、AI 授权、待办和验证记录。它主要由 Forge 维护，不应随意手改。

### `src/`

这是内容事实源，也是应该维护和修改的源码目录。世界、角色、系统、开场、UI 和装配内容都从这里进入构建。

### `dist/`

这是构建生成的制品目录。不要把它当作主要编辑入口，也不要手工修改后假装构建成功。

### `reports/`

这里保存验证、构建清单、运行时状态 Schema 和交接报告等证据。运行时状态 Schema 只会在项目启用或保留相应运行时状态时生成。

最终交付时优先看 `reports/handoff.md` 了解已完成、未验证和需要宿主设置的内容；遇到错误时再查看 `reports/validation.json` 的具体检查结果。

<details>
<summary><strong>进阶：手动使用内置 Forge（普通用户可以先跳过）</strong></summary>

## 内置 Forge

仓库自带 `scripts/rp-card-forge.bundle.mjs`。它是离线、事务式的制卡工具，不要求普通用户另外安装 npm 依赖。

这个 bundle 不是不可维护的黑盒：它由仓库内的 `scripts/rp-card-forge.mjs` 与 `scripts/forge/` 构建，并在运行时加载同目录的 `scripts/rp-card-runtime.mjs`。源码、固定版本依赖和重建命令都随仓库保存；日常使用只运行 bundle，只有维护者修改 Forge 时才需要安装构建依赖。不要直接修改 bundle，因为下一次重建会覆盖手工修改。

通常由技能代你调用。新手不必手动操作，但可以用它检查项目。

先设置脚本路径：

```powershell
$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$forge = Join-Path $codexRoot "skills\rp-card-studio\scripts\rp-card-forge.bundle.mjs"
```

查看帮助：

```powershell
node $forge --help
```

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `init` | 创建项目骨架 |
| `inspect` | 判断输入是项目、角色卡 JSON、PNG 还是世界书 |
| `unpack` | 把已有制品拆成可维护源码，并保留未知字段 |
| `validate` | 检查 Schema、引用、状态生命周期和交付契约 |
| `build` | 从源码构建 JSON 制品 |
| `pack` | 构建 JSON，或把角色卡数据写入 PNG |
| `diff` | 比较两个制品的语义差异 |
| `roundtrip` | 检查 JSON 重编码语义，或 PNG 负载提取/回写与非角色卡图像数据是否一致 |
| `state` | 查看、锁定、解锁或切换阶段状态 |
| `doctor` | 检查 Node.js、UTF-8 和项目健康状态 |

### 检查项目健康

```powershell
node $forge doctor "D:\AI\RP创作\项目\夜班列车"
```

### 验证项目

```powershell
node $forge validate "D:\AI\RP创作\项目\夜班列车" --dry-run
```

这里先用 `--dry-run` 只查看结果。去掉 `--dry-run` 后，项目验证会正式写入 `reports/validation.json`，并更新 `.rp-card-state.json` 中的修订号和验证记录。

### 先预演构建，不写文件

```powershell
node $forge build "D:\AI\RP创作\项目\夜班列车" --dry-run
```

### 正式构建

```powershell
node $forge build "D:\AI\RP创作\项目\夜班列车"
```

### 验证制品往返一致性

```powershell
node $forge roundtrip "D:\AI\RP创作\项目\夜班列车"
```

`roundtrip` 不会自动执行完整的 `unpack -> build -> unpack` 工作流。需要验证旧卡拆包后能否无损重建时，应把输入解包到独立工作区、执行 `build`，再比较新旧制品；仓库集成测试也单独覆盖了这一流程。

### 使用 Forge 时牢记

- 写入前优先使用 `--dry-run`。
- 不要随便加 `--force`；它表示你明确允许覆盖不同内容。
- 不要拿输入原件当输出目标。
- 构建失败时先看真实错误，不要手改 `dist/` 绕过检查。
- 修改旧卡时先 `unpack` 到工作区，再改 `src/`，最后重新构建。

### 常见退出码

命令失败时，退出码可以帮助判断问题在哪一层：

| 退出码 | 含义 |
| --- | --- |
| `2` | 命令或参数用法错误 |
| `3` | 输入不存在、不可读或格式不对 |
| `4` | Schema、引用或项目校验失败 |
| `5` | 输出覆盖、路径碰撞或事务冲突 |
| `6` | 当前格式或操作不受支持 |
| `7` | 哈希、PNG 或往返完整性失败 |
| `8` | 未预期的内部错误 |

</details>

## 世界书、媒体和 UI 如何交付

这些内容不会在前序创作阶段随意混在一起，而是在“整合交付”阶段统一装配。

### 世界书

`assembly.yaml` 会登记：

- 条目内容来自哪里；
- 关键词或常驻激活方式；
- 插入位置、顺序、插入深度和每条扫描深度；
- 概率与递归；
- 失败时怎样回退。

当前 SillyTavern 原生条目固定使用共享接收和模型可见；技能不会把宿主不支持的“剧情接收者”或“仅 GM 可见”伪装成有效选项。书级扫描深度、预算和递归开关由 SillyTavern 全局设置控制；需要限制某一条目时，技能会生成条目级扫描深度。

同一份基础装配信息既可以用于角色卡内嵌世界书，也可以用于独立世界书制品，但两种宿主格式并不相同。独立世界书可以按角色过滤：角色名实际填写头像文件名去掉扩展名后的部分，并区分大小写；标签必须填写目标 SillyTavern 实例内部的标签 ID，不是界面上看到的标签名称，换一个实例通常不能直接沿用。内嵌 CharacterBook 不支持可靠往返这类角色过滤，技能会明确阻断。单独导出的 CharacterBook 也不能冒充独立世界书导入。

### 媒体

媒体清单会登记资源 ID、类型、来源、交付方式、消费者、槽位、预加载策略、完整性和回退。

本地资源如果选择内嵌交付，会生成自包含数据和完整性证据。远程媒体必须登记，并提供可用回退；纯文本语义不能因为图片加载失败而消失。

### 开场呈现

同一个开场只定义一次共享事实、初始状态、钩子和玩家交接点。

`prose`、`chat`、`galgame` 等只是呈现变体，不能悄悄改写故事事实。增强版本必须能够回退到纯文本版本。

### 状态栏/UI

状态栏固定显示在 AI 聊天消息内部。简单静态状态栏采用下面这条链路：

```text
AI 原始消息末尾的 <StatusPlaceHolderImpl/>
        ↓ SillyTavern 角色正则（AI_OUTPUT + Markdown）
消息内文字或简单静态 HTML 状态栏
        ↓ Tavern Helper 消息变量宏
显示宿主当前可解析的 stat_data
```

Forge 会为默认开场和每个备选开场各追加一次占位符，并给后续助手回复加入“末尾恰好一次”的合同。状态栏正则写入角色卡的 `data.extensions.regex_scripts`，不会修改聊天原文；消息重新渲染时，SillyTavern 会重新执行它。

这里要区分“显示位置”和“变量快照”：角色正则能保证状态栏位于各条 AI 消息中，但当前验证的 Tavern Helper 4.9.1 在普通 DOM 宏重绘时没有传入该楼层的 `message_id`，会回退到最近一条带变量的消息。因此默认正则方案不承诺重载历史后仍显示各楼层旧快照，也不适合复杂运行时逻辑。

纯角色正则的能力边界是固定的：`refresh: on_message`、`read_only: true`、`commands: []`，响应式布局不能使用 tabs。它可以生成消息内文字/HTML、原生折叠、静态响应式布局和无障碍标记；`percent` 只是在上游值必有且已经是 0..100 时追加 `%`。`missing_value`、`loading/empty/error/degraded` 在这条路径中只是设计文案，正则无法在 Tavern Helper 展开宏之后判断并切换这些状态，也不能保证历史逐楼层快照。

只要项目需要动态刷新、命令、tabs、条件缺失值、运行时错误/加载态、精确数值格式化或可靠逐楼层历史，就必须选择 `adapter: tavern_helper_message` 与 `level: host_required`。这条路径仍由角色正则消费占位符，但替换结果是完整、自包含的 fenced HTML；Tavern Helper 把它变成该消息自己的 iframe。HTML、CSS、脚本和错误文案都随卡交付，不访问父页面、不创建页面常驻面板，也不加载远程 UI。

消息 iframe 必须调用 `getCurrentMessageId()`，并且只有 `Number.isInteger(message_id)` 为真时才调用 `getVariables({ type: "message", message_id })`。新楼第一次读到的合法 `stat_data` 可能仍是继承自上一楼的旧快照，因此不能在首次成功后停止；Forge 会先快速获取，再默认每 2 秒低频复查同一个整数楼层，只在可见值变化时重绘，并在 `pagehide`/`unload` 清理计时器。拿不到整数 ID 时会在当前消息内显示明确错误并停止；初次读取持续失败时有界重试后显示错误。已经显示合法状态后遇到暂时读取失败，则保留最近合法值并继续低频复查。所有路径都不会改读 `"latest"`，因为 latest 会让旧楼层在重载后串到新状态。没有生成并在真实宿主验收前，这项能力只能记录为规格或 `not_run`，不能写成 `embedded` 或 `runtime: pass`。

启用 MVU 时还会生成五条配套规则。两条分别从送模副本和玩家显示副本中隐藏完整 `<initvar>...</initvar>`；一条只从送模历史副本移除完整或未闭合的变量更新块；两条只处理玩家看到的 Markdown，把流式和完整更新折叠起来。初始化隐藏规则只接受成对闭合的完整块，不能吞掉未闭合正文。原始初始化块和更新块都留在聊天记录中供 MVU 使用。

角色内嵌正则第一次运行时，SillyTavern 会弹出授权确认。这是正常的安全机制，技能不会绕过。未授权时卡片正文仍可阅读，但消息状态栏和更新折叠不会生效。

UI 的**交付形态**由 `delivery.level` 表示：

| 交付形态 | 含义 |
| --- | --- |
| `specification` | 只有设计规格，还没有可运行交付物 |
| `embedded` | 生成并内嵌随卡交付的消息角色正则 |
| `host_required` | 需要消息级 Tavern Helper JS/iframe 与目标宿主验证；未验收能力不能标记通过 |

`delivery.surface` 固定为 `message`。即使已经生成 `embedded` 制品，也只能证明正则和占位符存在；只有在目标 SillyTavern 中完成正则授权，并实际检查默认/备选开场、连续两条消息、历史重载后的变量取值、流式更新、重新生成、切聊和移动端显示，才能形成 `runtime` 证据。消息 iframe 还必须证明子文档确实导航、脚本哨兵出现、当前楼 ID 是整数且读取了各自快照。若 iframe 元素和 Blob 内容存在，但当前内置浏览器没有执行 Blob URL 导航，结果应记为 `runtime: not_run`、原因 `host_incompatible`，不能算通过。报告必须区分“状态栏仍在各消息内”“静态标记已经生成”和“动态状态或各自历史快照已经实测”。

## 三类验证证据

| 证据 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| `offline` 离线证据 | 文件能解析、Schema 合法、引用闭合、状态契约一致 | 宿主扩展真的可用 |
| `artifact` 制品证据 | JSON/PNG 可生成、可读取，制品往返或显式拆包重建检查通过 | 在你的 SillyTavern 中显示正常 |
| `runtime` 运行时证据 | 已在目标宿主完成实际加载、更新、卸载和降级测试 | 其他版本或其他设备也一定相同 |

最终报告会明确区分三者。看到 `runtime: not_run` 通常不是构建失败，而是提醒你还没有完成真实宿主验收。

验证问题还会区分严重程度：

- **blocker**：会破坏结构、引用或产物，必须修复，不能用“接受风险”绕过。
- **warning**：可以在说明原因和影响后继续交付，但应记录处理决定。

## 修改已有角色卡

显式调用技能，并在首轮给出旧卡路径和新的工作区：

```text
使用 $rp-card-studio 修改已有角色卡。

工作区：D:\AI\RP创作\项目\旧卡改造
NSFW：不启用
任务类型：修改
已有材料：D:\Downloads\old-card.json
交付物：维护源码 + 新角色卡 JSON
```

技能会先识别并解包输入，再从维护源码修改。未知字段和原始输入会按保留规则处理，不会因为工具暂时不理解某个扩展字段就直接丢掉。

## 继续上次的项目

```text
使用 $rp-card-studio 继续这个项目。

工作区：D:\AI\RP创作\项目\夜班列车
任务类型：续作
请核验现有预检记录并恢复当前阶段。
```

如果工作区里已有完整的 `project.yaml` 和 `.rp-card-state.json`，技能会读取已锁定的 NSFW、材料和交付记录，核验后恢复当前阶段，不会从头重新盘问。某项记录确实缺失时，技能才会要求你补充明确值。

## 更多调用示例

### 从材料开始整理

```text
使用 $rp-card-studio，把 D:\Notes\角色设定 里的材料整理成一张角色卡项目。
```

### 审查现有项目

```text
使用 $rp-card-studio 审查 D:\AI\RP创作\项目\夜班列车，重点检查跨文件引用、开场初始化和状态栏交付。
```

### 让 AI 接管当前阶段

```text
当前角色阶段剩余决定全部交给你。请报告你的选择和理由，锁定后直接完成本阶段。
```

### 明确跳过 MVU/EJS

```text
这个新项目不需要运行时变量和条件内容，跳过 MVU/EJS，继续叙事与开场。
```

## 常见问题

### 为什么我说“创建角色卡”却没有触发？

因为技能关闭了自然语言自动调用。请使用技能选择器，或明确写 `$rp-card-studio`。

### 为什么第一轮不问角色名字和题材？

第一轮是项目预检，只确认工作区、NSFW、任务类型、材料和交付物。这样可以先确定文件放在哪里、是否有旧项目以及最终要交什么，避免内容已经聊了很多却没有可恢复的项目状态。

新建项目要等“项目定位”总汇由你确认锁定，或由 AI 在明确放权范围内报告并锁定后，才会初始化工作区。

### 为什么技能不替我选择工作区？

工作区决定真实文件写入位置，必须由用户明确指定。技能不会猜一个目录后直接写文件。

### 私有仓库克隆时出现 404 或认证失败怎么办？

先运行 `gh auth status`，确认当前账号已经登录并有权访问 `Nianshui233/rp-card-studio`。私有仓库在无权限时也可能表现为 404。

### 每轮必须回答所有问题吗？

最好一次回答同一轮的所有问题。你也可以补充自己的第四种方案。已经回答的内容不会在下一轮重复询问。

### 我完全不会 YAML/JSON，能用吗？

可以。你只需要用自然语言做选择。结构化片段主要用于保存、校验和构建，技能会负责沿用模板和 Schema。

### 系统和 MVU 有什么区别？

“系统”决定业务语义，例如好感为什么变化、有哪些状态、什么条件触发转换；“MVU/EJS”决定这些已经存在的语义怎样映射到运行时存储、路径、更新协议和条件读取。

### 可以完全跳过 MVU/EJS 和 UI 吗？

可以。它们都是可选阶段。纯文字角色卡不需要为了显得复杂而强行加入运行时系统。

对新项目来说，跳过表示不生成这层实现；对续作、转换、修改或审查项目来说，“本轮跳过”只表示这次不改，已有实现仍会保留。要关闭或移除旧实现，必须进入对应阶段完成迁移和验证。

### 开启 NSFW 后还会一直问边界吗？

不会。技能只在预检确认一次开关，启用后不再建立额外边界问卷，相关结构按阶段自动合入。

### 为什么验证通过后仍显示 `runtime: not_run`？

因为离线工具不能代替真实 SillyTavern。你还需要在目标环境中检查导入、新聊天、变量更新、开场分支、状态栏刷新、消息级清理、依赖不可用时的实际行为和移动端显示；纯 Regex 没有实现的动态状态不能列为已通过。

消息 iframe 也不能只看“页面里出现了 iframe 元素”。验收会确认子文档真的导航并执行脚本；如果 Blob URL 在当前内置浏览器中不导航，即使 Blob 内容可以读取，也会准确记录为 `runtime: not_run`、`host_incompatible`，而不是把没有运行的 UI 判为成功。

### 技能为什么不会被自然语言误触？

Codex 的实际调用策略写在 `agents/openai.yaml` 中：`policy.allow_implicit_invocation: false`。这会阻止 Codex 根据普通自然语言自动注入技能，但仍允许你通过技能选择器或 `$rp-card-studio` 显式调用。`SKILL.md` 的入口门还会再检查一次显式调用证据，形成产品策略与工作流规则两层保护。

如果使用 `quick_validate.py` 校验中文文件，Windows 下建议加上 UTF-8 模式：`python -X utf8 quick_validate.py <技能目录>`。

### Forge 报告输出路径冲突怎么办？

不要直接加 `--force`。先检查输出路径是否撞到了 `project.yaml`、`.rp-card-state.json`、已登记源码、保留导入或固定报告文件，然后选择新的输出位置。

### 能不能使用远程图片？

可以，但必须登记在媒体清单中并提供回退。未登记的远程运行脚本不允许作为临时依赖。

### 能不能直接生成角色卡 PNG？

只有在项目已有并登记了 PNG 底图时才能打包。技能不会凭空生成头像或立绘，也不会为了得到 PNG 而改动原图像素。

## 仓库结构

```text
rp-card-studio/
├─ SKILL.md                  # 技能入口、总流程和硬规则
├─ agents/
│  └─ openai.yaml           # Codex 中的中文显示名与默认提示
├─ references/              # 预检、阶段边界、产物和验证细则
│  └─ stages/               # 每个创作阶段各自的提问与完成门
├─ assets/
│  ├─ templates/            # 项目和各阶段模板
│  └─ schemas/              # YAML/JSON 结构契约
├─ scripts/
│  ├─ forge/                 # Forge 的参数、格式、项目、事务等模块化源码
│  ├─ build-forge.mjs       # 确定性构建与 bundle 一致性检查
│  ├─ rp-card-forge.mjs     # Forge CLI 源码入口
│  ├─ rp-card-forge.bundle.mjs # 普通使用者直接运行的免安装依赖制品
│  └─ rp-card-runtime.mjs   # SillyTavern 运行时适配源码
├─ package.json             # 仅供维护者使用的构建命令与固定依赖
├─ package-lock.json        # 可重复安装所需的精确依赖锁
└─ tests/                   # 运行时契约与 CLI 集成测试
```

<details>
<summary><strong>维护者：开发与自检</strong></summary>

## 开发与自检

普通使用者不需要执行本节命令。维护者第一次检出仓库或依赖锁变化后，先安装精确锁定的构建依赖：

```powershell
npm ci
```

Forge 的维护源是 `scripts/rp-card-forge.mjs` 与 `scripts/forge/`，`scripts/rp-card-forge.bundle.mjs` 是生成物。修改维护源后按顺序重建并验证：

```powershell
npm run build:forge
npm run check:forge
npm run verify
```

`npm run check:forge` 会在内存中重新构建并逐字节比较已提交 bundle；若有人只改源码却忘了重建，它会直接失败。构建过程会把通用的 JSON Schema 与 YAML 库打进 bundle，但始终把同目录的 `rp-card-runtime.mjs` 保持为外部模块，因此更新运行时源码后不会偷偷继续使用 bundle 内的旧副本。

当前测试覆盖源码重建一致性、外部运行时边界、技能入口与阶段规则、世界书装配、运行时状态 Schema、初始化 profile、跨文件引用、状态机、媒体、开场变体、EJS、真实宿主接口契约、UI 生命周期、适配器、自包含交付、输出保护、CLI 生命周期和未知字段拆包重建保留。

</details>

## 新手词汇表

| 词语 | 含义 |
| --- | --- |
| Skill / 技能 | 一组让 Codex 按固定流程工作的本地说明和工具 |
| 工作区 | 某一张卡的独立项目目录，不是技能安装目录或材料目录 |
| 语义决定账本 | 已确认的规划和决定，以 `project.yaml` 为核心 |
| 技术进度账本 | 当前做到哪一步、哪些决定已锁定、验证跑过什么 |
| Schema | 用来检查 YAML/JSON 字段、类型和结构是否合法的规则 |
| 世界书 | 按条件向模型注入设定或内容的条目集合 |
| MVU | 本项目中的运行时状态、存储和更新契约 |
| EJS | 根据已登记状态选择条件内容的机制 |
| Adapter / 适配器 | 把项目契约桥接到 Tavern Helper 等宿主能力的代码 |
| `assembly.yaml` | 统一登记世界书激活、媒体来源、预加载、回退和适配器装配的清单 |
| 锁定 | 后续不再重复询问或静默改写；用户仍可主动要求修改 |
| 跨阶段待办 | 提前说出的其他阶段信息，先记录，到正确阶段再处理 |
| 制品 | 从源码构建出的角色卡 JSON、PNG 或世界书等交付文件 |
| 制品往返验证 | 检查 JSON 重编码，或 PNG 负载提取/回写后语义与图像数据是否一致 |
| 拆包重建验证 | 明确执行 `unpack -> build` 并比较制品，检查语义和未知字段是否丢失 |
| 降级 | 已实现的适配器在依赖不可用时明确执行的替代行为；纯 Regex 的设计文案本身不会自动切换视图或恢复上一个状态 |

## 最短上手清单

1. 确认 Node.js 20+。
2. 把仓库安装到 `.codex/skills/rp-card-studio`。
3. 新建 Codex 任务。
4. 显式输入 `$rp-card-studio`。
5. 指定独立项目工作区。
6. 明确 NSFW 开关、任务类型、材料和交付物。
7. 按当前阶段回答多项问题并检查生成片段。
8. 在每个阶段总汇时查缺补漏。
9. 最终运行 `validate`、`build` 和 `roundtrip`。
10. 在真实 SillyTavern 中完成运行验收。
