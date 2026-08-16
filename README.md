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
10. 这是个人自用工作流：创作自由、视觉效果和实际可玩性优先。父页面 DOM、私有 API、远程资源和复杂 JS 可以按项目需要使用，只需如实记录依赖和实测结果。

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
- 用户角色模板可保留为独立中文条目，默认禁用或交给开局 UI 收集；
- MVU 更新规则、输出格式和 EJS 上下文按实际运行路线进入指定条目。

每个条目明确记录：中文名称、启用、主/次关键词、选择逻辑、插入位置、深度、顺序、概率、扫描深度、递归和预算行为。Forge 会验证这些宿主字段，但不会替作者猜一套固定策略。

## MVU 与 EJS 的正确做法

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
- 使用 EJS 时，直接写真实 `.ejs`，并明确它进入哪个 CharacterBook 条目、生成阶段还是渲染阶段。
- 已有成熟实现时优先保真迁移，不重新翻译成自创配置。
- 没有实机证据时可以完成候选构建，但运行结论必须是 `not_run`，不能假装已在宿主中成功。

## 正则与消息渲染

正则从本卡真实协议反推。常见但不是强制的职责包括：

- display 规则：把短标记或状态块替换成完整 HTML；
- prompt 规则：避免把整页 HTML 送给模型，保留简短可理解的叙事说明；
- 完整变量块隐藏：隐藏已闭合的技术块；
- 流式变量块隐藏：处理正在生成、尚未闭合的技术块；
- 编辑/Swipe/重载：需要时启用 `runOnEdit` 并验证消息生命周期。

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

- 轻型：主题完整、排版成熟、关键状态清楚，交互较少。
- 轻中型：在轻型基础上增加更完整的信息架构、切页、筛选和反馈。
- 中型：多个主要功能区形成一体化消息应用，数据和交互链完整。
- 重型：复杂信息结构、丰富交互、主题动画和宿主联动，仍服务于聊天 RP。
- 超重型 / 独立前端 / 0层游玩：消息 HTML 成为主要游玩界面，聊天层更多承担叙事、存储和宿主通道。

同一个功能面应尽量保持在一份完整 HTML 中，通过页签、抽屉、弹窗等组织。不要为了“组件化”拆成几十条互不连贯的小正则。

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
- CharacterBook 调度字段完整；
- 引用、ID、媒体和扩展结构闭合；
- HTML/JS/EJS 未在装配中截断或改写；
- JSON/PNG 可重新读取并保持语义。

只有真实 SillyTavern 能确认：

- 卡与内嵌世界书导入行为；
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