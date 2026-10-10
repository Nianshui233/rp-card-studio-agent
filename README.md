# SillyTavern 制卡工坊

> **从一个想法、一张旧卡或一堆零散材料开始，逐步做出可游玩、可导入、可验证的 SillyTavern RP 项目。**

SillyTavern 制卡工坊不是一段只会生成角色卡的提示词，而是一套围绕 RP 创作、运行组件、真实宿主和最终交付组织起来的 Agent 工作台。它可以陪你梳理世界与人物、设计玩法与开场，按需要制作世界书、MVU、EJS、Regex、Tavern Helper 脚本和消息内界面；也可以审查旧卡、排查运行问题，并在结束时整理真正需要导入的成品。

它面向角色卡作者和 RP 创作者。你不必先准备完整设定，也不需要先学会变量、正则或脚本：告诉 Agent 你想做什么、已有材料是什么，重要取舍会被拆开说明，再一起推进真实内容。

---

## 快速开始

将本仓库作为 Codex Skill 安装后，在对话中显式调用：

```text
$rp-card-studio
```

然后直接描述目标、素材或问题：

```text
$rp-card-studio
我想做一张关于【题材、角色或玩法】的 SillyTavern 角色卡。
先帮我整理出一个有趣、能继续发展的方向，再一步步做。
```

已有旧卡时，可以这样开始：

```text
$rp-card-studio
我有一张旧卡和一些配套文件。请先保留原始输入，帮我看懂现有内容，
指出需要保留和需要修复的部分，再一起决定怎么改。
```

也可以只处理一个范围：

```text
$rp-card-studio
我只想改这张卡的开场页（或状态栏、世界书、角色设定），
请沿用其他已经确定的内容。
```

本 Agent 使用**显式调用**，不会自动接管普通对话。

### 在 DeepSeek Harness 中安装

仓库自带 `dsh` 适配层（`.dsh/`），它把本 Agent 注册成一套 profile bundle，创作合同仍是根目录的 `AGENT.md`、`orchestrator/` 与 `internal-skills/`。安装只需一条命令：

```bash
node .dsh/install.mjs            # 默认 profile 取 $DSH_PROFILE，否则 web
```

脚本会构建 bundle（输出到 `.dsh/build/`，不入库）、在目标 profile 的 `package.json` 里登记 `link:` 依赖，并把 `@local/dsh-rp-card-studio` 追加进该 profile 的 `dsh.profile.bundles`；重复执行结果不变。生成物里所有路径都写成 `!!js dshHomePath(...)`，由 `dsh` 在加载时按 `$DSH_HOME` 解析，所以换机器、换用户名、换盘符都不需要改文件。

安装后重启 `dsh web`，新会话即按本 Agent 的合同工作（已运行的会话沿用它启动时注册的 persona）。适配层不影响 Codex、Claude Code 等其它 harness：它们继续读 `AGENT.md`、`agent.yaml`、`internal-skills/`，不读 `.dsh/`。

改动适配层或更新仓库后：

```bash
npm run dsh:build     # 重新构建 bundle
npm run test:dsh      # 适配合同用例
npm run dsh:verify    # 结构检查 + 真实加载检查
```

`dsh:verify` 的结论区分 `verified`（已确认 dsh 真实展开本 bundle）、`structural-only`（本机没有 dsh，真实加载未验证）与 `failed`。细节见 [`.dsh/README.md`](.dsh/README.md)。

## 它负责什么

| 能力 | 说明 |
|---|---|
| 创作母纲 | 将零散灵感、冲突想法或旧材料整理为可继续创作、可实际游玩的方向 |
| RP 内容 | 创作世界、角色、NPC、关系、场景、事件、玩法、叙事和开场 |
| SillyTavern 组件 | 按真实需求制作世界书、Regex、MVU、MVU_ZOD、EJS、Tavern Helper 和消息内 UI |
| 开场体验 | 制作开场、备用开场、玩家创角、开局路线和独立的创角/介绍页面 |
| 游玩体验 | 制作状态栏、任务、地图、背包、行动按钮和消息生命周期交互 |
| 旧卡处理 | 保留原始输入，盘点关联组件，分析兼容性，再进行定向修改或重构 |
| 运行排障 | 针对真实宿主、变量、模板、正则、脚本和消息链定位问题 |
| 最终 QA | 检查格式、绑定关系、数据路径、自包含性、导入链路和实机验证状态 |

不需要的能力不会被强行加入。轻型 RP 不会因为“完整”而自动生成 MVU、EJS、前端、复杂正则或脚本。

## 工作方式

完整项目通常沿着下面的路径推进；不相关的阶段会跳过，定向任务可以直接进入对应阶段：

```text
预检
→ 项目续接与进度画板
→ 原始资料整理 / 主动外部研究（有任何资料或外部事实依赖时）
→ 灵感脑暴（可选）
→ 项目定位
→ 世界观
→ 角色
→ 系统（可选）
→ 场景（可选）
→ MVU 持久状态（可选）
→ EJS 动态模板（可选）
→ MVU→EJS bridge（需要时）
→ 叙事与开场
→ 开场 / 创角前端（可选）
→ 持续消息前端（可选）
→ QA 与交付
```

创作阶段的访谈不是由 Agent 自己判断“信息够不够”。脑暴、定位、世界观、角色、系统、场景、叙事与开场分别有自己的固定节点路线，定义在 `internal-skills/rp-interview-orchestration/references/interview-routes.json`；原始材料已明确的节点直接预填，用户明确跳过或声明不适用的节点明确记录，其他节点按顺序主访谈并进行一次补全检查。固定路线规定最低语义覆盖，不要求用户逐字段填表，也不允许模型用自动补全、粗稿或单独的“继续”提前结束阶段。MVU、EJS、桥接和前端路线暂不纳入这份创作路线合同。

路线进度会写入当前阶段的 `authority.md`，显示已访问节点和当前节点；阶段交接前由确定性路线检查确认所有节点已结算。路线进度不等于用户接受，`delegated` 仍只表示用户放权后的 Agent 代定。

长期项目会在项目目录维护 `制作文件/项目记录/`：

```text
制作文件/项目记录/
├─ authority.md       # 全阶段账本、授权依据、决定来源、运行能力和当前范围
├─ NEXT.md            # 当前从哪里继续、下一道门是什么
├─ materials.json     # 任意规模原始资料的整理结果、来源、冲突和研究状态
└─ acceptance.json    # 静态、浏览器、真实 ST 和人工验收证据
```

每次真实推进后，当前对话都会刷新一份进度画板，显示：已完成、进行中、待决定、暂缓、阻断/待实测和下一道门。`制作文件/项目记录/NEXT.md` 用于跨会话恢复，当前对话画板是它的实时投影。项目状态文件不进入最终 SillyTavern 导入包，也不保存完整聊天记录。

阶段账本将制作进度、用户审阅、阶段执行许可和代定授权分开。用户确认必须有原话与定位；“本阶段放权”只在该阶段范围内产生 `delegated` 决定，不改写成用户逐项确认。NEXT 和 routing.next 只指示建议下一步，不能自动授权。

续接状态升级为 authority/v2 和 next/v2，仍只有原来的四个项目文件。旧 v1 会返回 `migrationRequired`：保留原文件，对照真实用户依据迁移；无依据的完成/确认只作草稿，不自动提升。

`node scripts/continuation/continuation.mjs validate --root <项目目录>` 检查缺失引用、跨阶段授权、交接后仍生效的授权、伪关闭与状态冲突。校验是结构合同，不能独立验证用户原话或强制停止任意宿主；无工具时须如实注明未运行。

每个阶段都遵循：

1. 找出当前最有价值的缺口；
2. 用“问题＋建议＋为什么这样建议＋影响”提出取舍；
3. 用户确认、修正，或授权 Agent 决定；
4. 立即写出或修改真实内容；
5. 用具体场景、行为、压力或失败情境校准承重事实；
6. 在内容足够支持下一阶段后，报告实际成果和差异，转为待交接，授权到期并结束本轮，等待用户新消息。

Agent 不会把整套空白问卷丢给用户，也不会保存完整聊天过程或无意义的过程碎片；但会维护影响后续创作、运行、交付和验收的最小项目状态。

## 创作自由与边界

默认先制作玩家中立、可独立运行的世界核心：`<user>` 是外部主控接入口，不是被写死的唯一主角。固定主角关系只进入明确标记的可选主控预设；多个主控应能分别使用，不互相污染世界、NPC 基础档案或其他主控。

你可以根据项目需要决定：

- 是否启用 NSFW、系统、场景、MVU 持久状态、EJS 动态模板、可选 MVU→EJS bridge、开场页或持续消息 UI；
- 页面采用什么氛围、信息层级、布局和交互方式；
- 世界书、变量、脚本和正则分别承担什么职责；
- 是从零开始、继续旧项目、转换格式、定向修改，还是只做审查与 QA。

实现细节由 Agent 负责解释和落地，不要求用户先回答 CSS、SVG、API 或脚本内部问题。兼容责任放在角色卡和交付文件中，不修改 SillyTavern 或插件本体。

## 技术原则

- MVU 只在确实需要跨消息持久状态或精确状态读写时启用。
- EJS 只在确实需要动态 Prompt、世界书模板或渲染时启用；需要读取 MVU 时建立明确的只读桥接。
- Regex 必须对应真实生产者，并区分 display 与 prompt 通道的实际用途。
- 动态消息 UI 使用真实的 Tavern Helper、EJS iframe 或其他实际载体，不用预览数据冒充正式运行状态。
- 开场提交要核对目标 Greeting Swipe、canonical `<user>`、真实 user 楼、真实 AI 楼和变量初始化；`generate()` 不能冒充正常消息链。
- 关键写入不能只以“内存接受”为完成依据；需要时等待宿主保存、重载后再读回确认。
- 静态检查通过不等于已经在 SillyTavern 中导入和运行。没有目标环境时明确标记 `runtime: not_run`，不把模拟测试说成实机通过。
- 不按条目数、角色数、变量数、HTML 长度或项目复杂度限制创作；只在真实需求出现时增加复杂度。

## 最终交付与验证

默认交付一个只包含实际使用文件的项目包，例如：

- 角色卡 JSON；
- 独立世界书 JSON；
- 实际使用的 Regex；
- Tavern Helper Script / ScriptFolder，可选附带 `.js` 源码；
- 完整、自包含的 HTML；
- 实际使用的 MVU 文件、EJS 文件和可选 bridge 文件；
- 简短导入说明和 QA 结果。

最终检查沿着：

```text
世界 → 角色 → 系统 → 场景 → 开场 → 变量初态 → 玩家反馈
```

核对承重事实与因果，再检查：

- 文件语法与格式；
- 角色卡、世界书和 Regex 的绑定关系；
- 变量、脚本、正则和 UI 的实际路径；
- HTML 是否自包含、是否依赖绝对路径或维护目录；
- 组件是否确实被项目使用；
- 是否在目标 SillyTavern 环境中完成导入、生成、Swipe、保存和重载验证。

真实导入和运行测试可能改变聊天、角色或配置数据，执行范围必须明确；默认不修改 SillyTavern 本体或用户数据。

## 仓库结构

```text
AGENT.md                 Agent 的主规则与创作合同
agent.yaml               Agent 元数据、入口和路由配置
orchestrator/            阶段循环、路由和访谈规则
internal-skills/         按需加载的创作、续接和 SillyTavern 技术能力
assets/                  经过静态合同核对的原创示例、资源和续接模板
shared/                  共享的校验、模板或运行辅助内容
scripts/                 开发、续接和检查脚本
.dsh/                    DeepSeek Harness 适配层（构建、安装、校验），其它 harness 不读取
```

这些目录是实现参考，不是用户项目的默认交付结构。制作过程只应落盘真实 RP 内容、实际运行代码/配置、原始输入保真副本、可导入制品和最终确实需要的导入说明。

## 开发者资料

如果你是维护者，需要查看实现和检查方式，可以从这里开始：

- [`AGENT.md`](AGENT.md)：创作、路由、阶段和交付的主规则；
- [`agent.yaml`](agent.yaml)：Agent 元数据与入口配置；
- [`orchestrator/`](orchestrator/)：阶段循环与访谈协作规则；
- [`internal-skills/rp-project-continuation/`](internal-skills/rp-project-continuation/)：项目权威、续接和当前对话进度画板规则；
- [`internal-skills/rp-materials-research/`](internal-skills/rp-materials-research/)：任意规模原始资料整理和主动外部研究规则；
- [`assets/examples/`](assets/examples/)：经过当前静态合同核对的原创示例；
- [`.dsh/`](.dsh/)：DeepSeek Harness 适配层（`build.mjs` / `install.mjs` / `verify.mjs` / 适配合同用例）；
- [`package.json`](package.json)：项目元数据与检查入口。

---

> **好的交付不是“文件生成成功”，而是用户知道它是什么、为什么这样设计、如何导入，以及它到底有没有在真实环境里跑通。**

## MVU_ZOD 工程校验

先按 `internal-skills/st-mvu-authoring/references/mvu-source-build.md` 建立实际项目合同。工具包根运行 `npm ci` 后，使用 `npm run mvu:build -- --root "作品目录"` 和 `npm run mvu:check -- --root "作品目录"`。离线构建/Schema 校验、真实酒馆运行和用户验收分开，不能相互替代。

## 作品目录

作品项目从制作开始只保留“导入包”和“制作文件”两个顶层文件夹。实际导入成品默认平铺在导入包；原稿、源码、配置、项目记录和检查材料统一留在制作文件。目录合同见 `orchestrator/project-layout.md`。最终整理用 `node scripts/delivery/deliverable-check.mjs layout --root "作品目录" --final` 检查；该布局不重排 Agent 工具包仓库。

## 工程验证工具

运行组件的完整规则与配置结构见 `orchestrator/production-verification.md`。`npm run project:verify -- --root <项目>` 执行项目自己的构建检查计划，失败立即停止；`npm run production:check -- --root <项目> --final` 复核所有已启用组件的实际装配和当前证据。`npm run frontend:check -- --root <项目> --fixtures 制作文件/检查/前端用例.json --browser <浏览器程序>` 用最终导入内容运行受控页面与操作用例。缺浏览器时明确失败/not_run，不自动下载安装或声称实机通过。

仓库自测：`npm test`、`npm run test:dsh`、`npm run check`；浏览器行为测试 `npm run test:frontend`，可用 `RP_BROWSER_EXECUTABLE` 指定已有 Chrome/Edge。浏览器夹具测试不等于 SillyTavern 实机验收。

## 世界书调度检查

`npm run worldbook:check -- --root <项目> --contract 制作文件/项目记录/worldbook-routing.json` 将实际条目与职责、激活、位置、深度和角色逐项核对，并回放预期分区。最终 production --final 自动检查全部实际世界书；真实请求未捕获时仍为 not_run。规则与合同结构见 internal-skills/st-worldbook-regex/references/worldbook-routing.md。

## 前端简易预览

### 设计材料与现场打磨

两阶段各自带来源、适用问题、采用方法和边界，并有独立离线挑选页。开场侧有世界呈现、指南、创角、排版与素材；持续消息侧有阅读、导航、地图、情报、物品、任务、反馈与窄屏使用。8 个可交互合成演示只说明方法，不是默认皮肤、样品路线或作品数据。

```text
npm run frontend:library -- --stage opening_frontend --root <作品目录> --out 制作文件/检查/界面参考/开场.html
npm run frontend:library -- --stage message_frontend --root <作品目录> --out 制作文件/检查/界面参考/持续消息.html
npm run frontend:workbench -- --root <作品目录> --fixtures 制作文件/检查/前端用例.json --case <实际用例id> --browser <现有浏览器程序>
```

挑选页可直接打开；workbench 在受控浏览器中运行实际导入内容，支持声明的样式参数、原样对照、项目预设、字段观察，以及确认后才注入的夹具快照。它不是重画的替身，也不接入真实账户。参数先保存当前候选，用 `frontend:tune` 查看差异，再在授权范围内落回维护源码；重建、装配和移除临时覆盖后才生成正式证据。不能用打磨截图通过设计复核。

操作合同与完整例子见 `shared/frontend/design-tools.md`；视觉复核分别见 opening-review.md、message-review.md，不建立共用审美模板。

### 安装后核验

`npm run install:check -- --target <实际安装Agent根目录绝对路径> --host codex` 逐文件对照当前源与指定安装目录，列出缺失、改动和过时资源；`--check-dependencies` 另查实际工具依赖。它只读、不安装、不改全局规则，也不把源码树当安装目标。文件匹配不等于宿主已加载，更不等于酒馆制品通过。未专门适配的宿主使用 generic，目标扫描位置须另行核对。

### 结构与正式渲染预览

开场前端与状态栏现在分别使用独立设计流程和资料索引：开场围绕世界介绍、游玩指南与页面内创角，持续消息围绕真实游玩任务、信息表达和长期舒适度。不建立统管两者的共用 UI 规则，也不默认使用同一套皮肤。两边都要求针对作品高度定制。

`npm run frontend:design -- --stage opening_frontend --query "创角 步骤"` 或 `--stage message_frontend --query "人物 关系"` 可检索本阶段资料。这里吸收的是 ui-ux-pro-max 的定向检索、设计分析与可观察检查方法，不依赖另装该技能，也不把本地资料当成当前外部研究。新设计/方向重做会主动看实际公开参考，明确不联网或工具不可用时如实说明。

第一印象不等于整套设计确定，持续不满意时先判断是否需改变表达或方向，不只添加装饰。授权范围内完整实现、预览、自查和修正后再交接，不用最小骨架让用户先导入试错。具体设计保存在原有 interviews.<stage>.design，当前设计复核保存在 frontends.<stage>.designReview；不新建需求账本或保存失败历史。

续接旧项目时，缺新设计记录或视觉证据就按当前真实材料、既有决定和本次授权补齐，不伪造确认，也不默认重问整轮访谈或重做无关内容。旧图、旧代码与旧检查不能自动证明新方案已完成；正式成品仅保留当前路线。

前端讨论还会主动提供简易结构草图：直接看到内容位置、标签/折叠、点开详情和操作结果，修改后同步更新；有实际 HTML 时显示当前内容的渲染预览。无需用户自己画，也不把草图当成成品或新增一轮审批。工具入口为 `npm run frontend:preview`；浏览器用例可加 `--preview <用例id>` 生成实际渲染图。详细边界见 `shared/frontend/layout-preview.md`。

完整视觉预览允许 case.resources 重放已取得并核对字节的字体、图片、CSS 和脚本，不要求成品零外链；未声明网络仍不实际外联。资源失败场景另标 resource_failure，不拿缺素材截图代表完成。implemented/交付检查当前方案摘要、精确导入文本、图片字节和实际宽窄屏证据；检查通过不等于好看、真实酒馆通过或用户接受。

## 可选开场与自动收尾

- 叙事规则与开场可选，分别确定新增、沿用或不制作；未回答不等于拒绝，也不强迫重写已有开场。开场前端与消息前端独立选择，初始化和已有内容检查仍保留。
- 当前授权范围内的 QA、构建、整理两目录交付默认执行，不需要再问是否检查或打包；不越权改创作内容、不把技术完成写成用户接受。
- 新项目启动主动只读发现酒馆安装和运行实例；续接复核、实机 QA 前刷新。结果只保存当前记录，找不到不等于不存在，环境发现不等于卡已运行。
- 多实例仅在明确指定目标能唯一匹配时自动选择，否则问一次；不自动启动宿主、覆盖用户数据或发送未授权测试消息。

详细规则：orchestrator/automatic-work.md。执行入口为 npm run host:discover -- --project-root <项目目录> 与 npm run qa:auto -- --root <项目目录> --scope current_stage|selected_project；它们不是宿主 hook，也不替代实际工具权限和真实验收。
