# SillyTavern制卡工坊

`rp-card-studio` 是一个只在显式调用时工作的个人 SillyTavern RP 项目共创技能。它把“角色卡”视为完整 RP 包的便携载体，而不是默认把所有内容围绕某一个角色堆进卡面。

它适合制作：

- 真正的单人物卡；
- 开放世界、群像、玩法、主持人或混合型 RP 包；
- 带 CharacterBook 调度、MVU/EJS、角色正则、Tavern Helper 脚本和消息内 HTML UI 的完整项目；
- 对已有 JSON/PNG 卡进行保真拆包、修改与重新构建。

## 最重要的几条原则

1. 只响应用户显式选择或输入 `$rp-card-studio`，不会因为“创建”“角色卡”“世界观”等自然语言自动触发。
2. 首轮只确认工作区、NSFW、任务类型、材料、可选阶段计划和附加交付物，不提前询问创作内容。
3. 每个阶段都按“多项当前阶段问题 + 信息采集 + 方向和推荐 → 用户选择或放权 → 实际片段”反复推进。
4. 世界、NPC、系统、场景和叙事优先写成可读 YAML/文本；最终再按运行职责切入 CharacterBook。
5. `data.description` 是项目入口。大世界卡使用项目标题，真正的单人物卡才默认使用唯一人物名。
6. MVU、EJS、HTML、JavaScript 和正则必须是项目实际创作的真实源文件。Forge 只装配、保真和验证，不替作者发明一套通用运行时。
7. UI 位于聊天消息或用户明确选择的卡内载体。唯一长期禁止的是在 SillyTavern 页面外层挂一个与消息脱离的常驻状态面板。
8. 默认最终只交付一个可导入角色卡 `.json`；PNG、独立世界书、源码归档等必须由用户明确需要。
9. 技能只适配 SillyTavern 和插件，不修改 SillyTavern、Tavern Helper 或其他插件本体。
10. 这是个人自用工作流：创作自由、视觉效果和实际可玩性优先。父页面 DOM、私有 API、远程资源和复杂 JS 可以按项目需要使用，只需如实记录依赖和实测结果。技能本身使用自包含原创样本，不把外部卡片、仓库或网页当作用户材料。

## 正确的项目结构

```text
用户需求与阶段决定
        │
        ▼
src/ 中的可读 RP 内容与真实运行源码
        │
        ├─ 世界 / NPC / 系统 / 场景 / 叙事：YAML 或文本
        ├─ MVU：框架加载器、原生/MVU_ZOD/混合 Schema 路线、初始值、更新规则与辅助脚本
        ├─ EJS：实际 .ejs 模板
        ├─ UI：完整项目专属 HTML/CSS/JS
        └─ 正则：实际 SillyTavern regex 字段
        │
        ▼
assembly.yaml 只登记装配位置、CharacterBook 调度和扩展字段
        │
        ▼
Forge 原样读取、装配、校验、往返
        │
        ▼
默认交付 dist/character-card.json
```

Forge 不再包含通用 UI 编译器、自动 MVU/EJS 生成器、额外合成运行层、固定状态标记合同或“所有卡通用”的正则套件。

## 首轮怎么开始

在新任务里显式调用：

```text
$rp-card-studio
```

如果没有现成预检记录，技能第一轮只会集中确认：

1. 本项目工作区的完整路径；
2. NSFW 启用或不启用；
3. 本次是新建、继续、转换、修改、审查还是只处理 UI；
4. 是否存在旧卡、设定、HTML、脚本或其他材料；
5. 材料整理、系统、场景、MVU/EJS、状态栏/UI 这些可选阶段是否计划进入；
6. 除默认单个 JSON 外，是否明确需要其他制品。

信息齐全后立即创建或恢复项目记录，不等定位阶段结束才落盘。首轮阶段计划只是导航，后续可随项目变化调整；实际完成或跳过状态单独记录。

## 阶段顺序

固定顺序为：

1. 项目定位
2. 材料整理（可选）
3. 世界观
4. 角色
5. 系统（可选）
6. 场景（可选）
7. MVU/EJS（可选）
8. 叙事与开场
9. 状态栏/UI（可选）
10. 整合交付

每个阶段只问本阶段问题。用户提前说出的其他阶段信息会进入跨阶段待办，到正确阶段再消费，不会当场追问。

如果用户把某个范围完全交给 AI，AI 会直接决定、说明理由、写入并锁定，不再反复确认同一件事。

## 卡面、世界书和人物如何分工

### 卡名

- 世界、群像、玩法、场景包：使用能概括完整项目的标题，例如“雾港夜班”。
- 真正单人物卡：只有一个预先创作人物且项目核心就是与其互动时，才默认使用人物名。

### `data.description`

这里写项目入口或核心合同：告诉模型“这是什么 RP 包、怎样运行、哪些原则常驻”。不要把任何 NPC 的完整档案塞进这里。

### CharacterBook

能放进世界书并需要按条件注入的内容，优先进入 CharacterBook：

- 世界观按稳定主题切分；
- NPC 通常整块保存，维持身份、动机、关系和行为连续性；
- 系统、场景和叙事规则按完整职责整块放入；
- 每个角色卡项目默认预留一个独立中文 `<user>` 主控设定条目，初始关闭；填写 `src/user-character.yaml` 后可在整合阶段或 SillyTavern 中启用，不影响世界、NPC 和事件自行运转；
- MVU 更新规则、输出格式和 EJS 上下文按实际运行路线进入指定条目。

每个条目明确记录：中文名称、启用、主/次关键词、选择逻辑、插入位置、深度、顺序、概率、扫描深度、递归和预算行为。Forge 会验证这些宿主字段，但不会替作者猜一套固定策略。锁定整合时不允许留下空 CharacterBook；有内容源码却没有任何装配条目会直接阻断构建。

需要区分四件事：卡内确实有非空 `data.character_book`、`data.extensions.world` 写了目标书名、SillyTavern 已把内嵌书导入世界书列表、角色当前主世界书已经指向它。前两项可由 JSON 保证，后两项必须在真实 SillyTavern 中完成“Import Card Lore/导入卡片世界书”并检查。标准 JSON 不会绕过宿主的导入确认；项目明确要求零手工时，才编写并实测项目专属的 Tavern Helper 自动挂载脚本。

## MVU 与 EJS 的正确做法

技术实现阶段可按需读取 `references/host/mvu-runtime.md` 和
`references/host/tavern-helper-runtime.md`。它们是本地自包含的运行时行为摘要，专门说明
MVU 初始化/覆盖/回读、消息楼层、iframe 生命周期、宿主事件、正则重应用和按钮回退；不复制插件源码，也不把插件仓库变成卡片运行依赖。
涉及 EJS 时再读取 `references/host/ejs-runtime.md`，确认执行阶段、变量作用域、装饰器、世界书读取路线、缓存和失败回退。

MVU/EJS 阶段直接维护真实文件，例如：

```text
src/runtime/mvu/初始变量.yaml
src/runtime/mvu/变量结构.js
src/runtime/mvu/变量更新规则.yaml
src/runtime/mvu/回复输出格式.yaml
src/runtime/ejs/当前状态上下文.ejs
src/runtime/scripts/雾港变量脚本.js
```

阶段记录只说明这些文件是什么、由谁读取、依赖什么宿主版本、失败时会怎样。真正语义始终在文件本身。

- 使用 MVU 时，先区分框架加载器与项目 Schema；按项目实际版本选择原生 `$meta`、MVU_ZOD、混合或沿用既有实现，再闭合初始化、更新、上下文和 UI 读取。
- 所有新 MVU 路线都必须有真实初始变量文件，并由名称含 `[initvar]` 的 CharacterBook 文件条目装入；MVU_ZOD 不能代替初始值。
- 开场 `<initvar>` 是已挂载主世界书初始化后的覆盖层，不是没有世界书时的独立启动器。
- 使用 EJS 时，直接写真实 `.ejs`，并明确它进入哪个 CharacterBook 条目、生成阶段还是渲染阶段。
- 已有成熟实现时优先保真迁移，不重新翻译成自创配置。
- 没有实机证据时可以完成候选构建，但运行结论必须是 `not_run`，不能假装已在宿主中成功。

## 正则与消息渲染

正则从本卡真实协议反推。常见但不是强制的职责包括：

- display 规则：把短标记或状态块替换成完整 HTML；
- prompt 规则：避免把整页 HTML 送给模型，保留简短可理解的叙事说明；
- 标记生产者：开场标记来自 opening；每轮状态标记默认由常驻、模型可见的 CharacterBook 输出契约命令模型生成；非 MVU 卡在该条目中定义完整 XML 状态块；
- 完整变量块隐藏：隐藏已闭合的技术块；
- 流式变量块隐藏：处理正在生成、尚未闭合的技术块；
- 编辑/Swipe/重载：需要时启用 `runOnEdit` 并验证消息生命周期。

首条消息的介绍、版本、指南、路线选择和创角前端维护在 `opening.yaml#/opening_ui`，可独立选择轻到超重型；进入RP后的状态、物品、关系、任务等持续界面才维护在 `status-ui.yaml`。两者可以使用相同技术栈，但不是同一个阶段、同一个surface或同一份体验等级决定。

如果开场页提供创角表单，不能只把填写结果拼进开局文案，或只通过 `createChatMessages({ data: ... })` 附加到聊天楼。凡是会影响 MVU/EJS/状态栏的数据，都要在 `opening.yaml#/creation_bridge` 中记录“输入字段 → 状态路径 → 提交方式 → 读回验证”。确认入局的正确顺序是先写入并读回真实状态，再开始生成剧情；写入失败时显示失败并提供手动回退。`<user>` 世界书条目是长期主控资料模板，不会自动同步 MVU 当前值。

聊天消息变量协议默认在 `mvu.update_strategy.display_cleanup` 选择 `card_regex`。Forge 会把本卡真实更新标签分别重放为完整块和流式半块，确认技术正文不会出现在玩家显示层。成熟卡若由 MVU 框架、宿主全局正则或既有机制清理，可改为 `framework`、`host_regex` 或 `existing`，但必须填写已经核实的 `evidence`；“测试卡所以省略”不属于有效豁免。

每个 `status_ui.surfaces[]` 还应记录 `emission.producer / cadence / source_ref / evidence`。Forge 会反查同一标记是否真的存在于开场、常驻世界书输出契约、框架、Tavern Helper脚本或用户动作中。只有 HTML 和 display 正则而没有生产者时，构建链并未闭合。

实际装配字段示例：

```yaml
runtime_manifest:
  mode: authored
  regex_scripts:
    - id: "项目稳定ID"
      script_name: "[界面]雾港状态栏"
      find_regex: "/<雾港状态栏\\s*\\/>/g"
      replace_file: "src/runtime/ui/雾港状态栏.html"
      wrap_as_html_codeblock: true
      placement: [2]
      disabled: false
      markdown_only: true
      prompt_only: false
      run_on_edit: true
      substitute_regex: 0
      min_depth: null
      max_depth: null
  tavern_helper_scripts:
    - id: "雾港变量结构"
      name: "雾港：变量结构"
      content_file: "src/runtime/mvu/变量结构.js"
      enabled: true
  extension_fields: {}
```

Forge 会把完整 HTML 写入 `replaceString`，把完整 JS 写入脚本 `content`，不会再次拆分或重写。

## UI 轻、中、重体现在哪里

UI 阶段第一批必须确认配套 UI 的规模。等级衡量的是玩家端体验和实现深度，不是页面数、正则数或代码行数配额。

- 轻型：以技能内置的 `assets/examples/self-contained-rp/src/runtime/ui/潮痕状态栏.html` 所代表的完整度为下限。它应是一份成熟的多视图状态应用，有清晰导航、多类真实数据、搜索/筛选/折叠/详情等信息操作、至少一种宿主行动、反馈与回退、响应式和项目专属主题；不能只是几项数值与进度条。
- 轻中型：完整保留轻型基线，并明显增加多个便利、反馈、联动、动效或趣味交互。
- 中型：在轻型上形成产品级信息架构、复合搜索/筛选、更多真实操作和 UI 状态保持。
- 重型：进一步加入强主题演出、复杂功能联动、大量游戏行为入口、深度宿主协作和可靠生命周期。
- 超重型 / 独立前端 / 0层游玩：完整继承前述能力，消息 HTML 成为主要游玩界面，并具有应用级路由、状态管理、持久化和复杂宿主协作。

技能内置样本只是体验与成熟规模的参照，不是代码配额。`experience_evidence` 用于复盘导航、数据、交互、反馈、响应式、主题与数据绑定，不按填写数量定级或阻断。正则替换是默认示例，但酒馆助手脚本、EJS、inline HTML、框架和既有路线同样允许，只校验项目实际选择的运行链。不要把外部样本路径写入 `source_refs` 或 `assembly.yaml`。

用户选定的等级是交付下限，不是只写进 YAML 的标签。Forge 会读取实际 HTML 做功能面质量探针，检查导航、数据视图、信息工具、操作入口、反馈、响应式、宿主联动、数据读取和生命周期信号；不按文件字节或代码行数评分。锁定的中型/重型 UI 如果只是小面板、静态展示或无数据空壳，会阻断交付。

MVU/Tavern Helper 消息前端还必须同时考虑当前 iframe 与父窗口的宿主全局。只读取 `window.Mvu`、但加载器实际把对象挂在 `window.parent.Mvu`，会让完整前端退化为加载/空态外壳；质量探针会单独报告这个作用域断链。

不同技术路线的原创自包含夹具见 `assets/examples/README.md`，包括非 MVU XML、原生 MVU、MVU_ZOD、开场/持续 UI 分离、多功能消息表面和超重型独立前端。

同一个功能面应尽量保持在一份完整 HTML 中，通过页签、抽屉、弹窗等组织。不要为了“组件化”拆成几十条互不连贯的小正则。

这里的“一份完整 HTML”指最终运行制品，不是开发时必须把所有内容塞进一个文件。技能现在默认把开场前端和持续状态前端当作真正浏览器应用开发：HTML 结构、CSS 视觉层、JavaScript 状态/渲染/交互、宿主适配和模拟数据分别维护，完成浏览器与真实宿主验收后，再用 `ui-build` 拼成一个自包含 HTML。

```text
src/runtime/apps/status/
├─ ui-app.yaml
├─ index.html
├─ fragments/
├─ styles/
├─ scripts/
└─ mock/state.json

src/runtime/ui/
└─ 状态界面.html          # 构建产物，供正则/装配使用
```

`multi_file_html` 模式下，`app_manifest` 指向开发清单，`file` 指向构建结果。Forge 会检查构建结果是否过期。中型及以上默认使用完整模拟状态先检查满数据、空态、错误态、长中文、多人物和多事件，模拟数据不会在真实运行时冒充当前楼层状态。详细契约见 `references/ui-app-authoring.md`。

可复制的原创工程骨架位于 `assets/templates/ui-app/`。它只提供应用结构和宿主桥接范式；主题、页面、组件和交互必须根据当前 RP 项目重新设计。

玩家端验收重点包括：中文字段映射、CJK 排版、窄屏、触控、软键盘、空数据、长文本、错误反馈、按钮响应、编辑、Swipe、重载和聊天切换。

## 项目目录

```text
项目工作区/
├─ project.yaml
├─ .rp-card-state.json
├─ src/
│  ├─ positioning.yaml
│  ├─ world/
│  ├─ characters/
│  ├─ systems/
│  ├─ scenes/
│  ├─ prompts/
│  ├─ runtime/
│  │  ├─ mvu/
│  │  ├─ ejs/
│  │  ├─ scripts/
│  │  ├─ apps/              # 模块化开场/状态前端源码
│  │  └─ ui/
│  └─ integration/assembly.yaml
├─ dist/
└─ reports/
```

`src/` 是维护源，`dist/` 只是构建结果。不要手工把最终 JSON 当作主要编辑文件。

## Forge 常用命令

以下命令由技能在项目工作中调用。普通用户通常不需要手敲，但了解它们有助于排查：

```powershell
node scripts/rp-card-forge.bundle.mjs init <项目目录> --nsfw enabled --stages '["positioning","worldbuilding","character","narrative_opening","integration"]'
node scripts/rp-card-forge.bundle.mjs inspect <JSON或PNG>
node scripts/rp-card-forge.bundle.mjs unpack <JSON或PNG> --output <项目目录> --nsfw disabled
node scripts/rp-card-forge.bundle.mjs validate <项目目录>
node scripts/rp-card-forge.bundle.mjs ui-build <项目目录>/src/runtime/apps/status/ui-app.yaml
node scripts/rp-card-forge.bundle.mjs build <项目目录>
node scripts/rp-card-forge.bundle.mjs roundtrip <JSON或PNG>
node scripts/rp-card-forge.bundle.mjs state <项目目录> show
node scripts/rp-card-forge.bundle.mjs state <项目目录> plan '<阶段数组>'
```

Forge 的职责：

- 事务式写入，避免半成品；
- 校验项目、世界书调度、正则和制品格式；
- 保留未知导入字段和用户已有扩展；
- 原样装配完整 HTML/JS/EJS；
- 把模块化 HTML/CSS/JS/片段构建为自包含 HTML，并检查源码与制品是否一致；
- 稳定分配 CharacterBook ID；
- 验证 JSON/PNG 往返。

Forge 不负责替作者生成 RP 内容或通用运行时。

## 修改已有卡

`unpack` 会把完整原卡保存在 `src/import/original.json`，未知字段放入保真记录。只要项目尚未明确接管某个表面字段，往返构建应保持原值。

导入旧卡时：

- 旧正则、脚本和未知扩展默认保留；
- 已有 HTML/JS/EJS 直接作为真实源码迁移；
- 不把旧卡的 `data.name` 自动当作人物；
- 不把旧高级定义静默清空；只有迁移策略明确后才移动或清理；
- 兼容旧卡意味着保真，不意味着继续保留本技能过去错误的生成器。

## 验证与真实 SillyTavern

离线验证能确认：

- YAML/JSON 与正则由已执行的解析器检查；JS/EJS/HTML 只报告实际执行过的静态或宿主检查，未运行就保持 `not_run`；
- CharacterBook 非空、调度字段完整，内嵌书名与 `data.extensions.world` 一致；
- 引用、ID、媒体和扩展结构闭合；
- HTML/JS/EJS 未在装配中截断或改写；
- JSON/PNG 可重新读取并保持语义。

只有真实 SillyTavern 能确认：

- 执行内嵌世界书导入，确认世界书列表实际存在该书且角色主世界书已挂载；
- 角色正则实际授权与执行；
- Tavern Helper、MVU、EJS 的版本兼容；
- iframe/Blob URL 模式；
- UI 数据、按钮、编辑、Swipe、重载和聊天切换。

没有实机测试时照样可以交付候选 JSON，但报告必须明确写 `runtime: not_run`。

## NSFW

预检只问一次“启用/不启用”。启用后视为该维度完全放权，不再询问强度、许可或边界，也不向游玩模型塞入 NSFW 开关、拒绝规则或安全卡。

不启用只代表不主动加载专项模板，不会净化已有材料，也不会因为 RP 自然出现成熟内容而阻断构建。

## 安装位置

全局安装目录：

```text
C:\Users\Administrator\.codex\skills\rp-card-studio
```

仓库开发目录与全局安装目录内容应保持一致。修改完成后应同步并核对文件哈希。

## 维护者自检

```powershell
npm ci
npm run build:forge
npm run verify
```

- `build:forge` 重建免安装依赖的 Forge bundle；
- `verify` 检查 bundle 一致性、JS 语法、doctor 和全部测试；
- 测试覆盖 JSON/PNG 往返、CharacterBook 调度、原样 HTML/JS/EJS 装配、阶段计划、显式触发和旧架构清除。
