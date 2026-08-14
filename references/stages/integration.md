# 整合交付阶段

本阶段把已锁定的完整 RP 包装配为 SillyTavern 可导入产物，维护 `src/integration/assembly.yaml`，并完成静态、产物和真实运行证据的分级报告。它负责卡面字段投影、把内容 ID 映射为世界书宿主参数、把媒体叙事槽位映射为实际资源、按契约生成适配器；不是最后一轮临时创作，也不把项目重新收缩成某个角色的人设卡。

## 进入条件

- 本次路线中进入的阶段均已完成，跳过阶段有理由。非新建项目本轮跳过但保留既有能力时，不要求把历史 `complete` 降级为 `skipped`，但必须验证保留的 feature、源码、依赖与实际交付物仍一致。
- `project.yaml` 与 `.rp-card-state.json` 一致，跨阶段阻塞项为零。
- 输出目标和工作区已在项目预检中锁定。

## 本阶段边界

### 允许询问

- 仅询问预检交付目标尚未覆盖的打包参数；新建角色卡默认最终只生成一个 `.json`。PNG、独立世界书、源码归档或其他附加制品只有在用户明确锁定后才生成。已有项目已锁定的组合直接读取，不重复选择；用户要改变范围时先更新预检锁定。
- 世界书条目的激活、插入位置与顺序、条目级扫描深度、概率、递归和失败策略；独立世界书是否需要按角色头像主干或目标实例标签 ID 过滤。
- 媒体槽位采用本地文件还是 HTTPS 资源、由谁消费、是否预加载、如何校验以及失败时使用何种回退。
- 如何把已锁定 MVU/UI/呈现 adapter 契约实例化为文件、卡内脚本或正则，以及入口和产物路径如何避免碰撞；不重新选择 adapter 能力或 UI 交付语义。
- 预检已锁定 PNG 时使用哪张卡图、输出文件名、是否保留候选构建；卡图可以是标题画面、场景图、群像或角色肖像，不默认要求头像。
- 目标 SillyTavern 环境与可执行的真实验收范围。
- 对警告采用修复、接受或延期哪种处理。
- 最终版本号、发布说明和交付清单。

### 禁止询问

- 不询问新角色、新世界规则、新系统轴、新场景或新 UI 需求。
- 不用宿主激活参数反向改写世界事实，不用已有媒体文件反向改变场景或开场语义。
- 不在 `dist/` 内直接改文案来绕过源文件。
- 不把离线预览、Schema 通过或 PNG 可解析称作真实运行验证。

创作缺口出现时，指出应重开哪个阶段及其传播范围，等待用户选择；用户已对该范围完全放权时，报告处理方案后自动返回、修复、重新锁定并继续整合。

## 多轮工作循环

整合也保持“问题与方向 -> 用户选择 -> 片段”的节奏，但问题仅限交付：

```markdown
### 本轮目标：交付组合
| 问题 | 方向 | 影响 | 推荐 |
|---|---|---|---|
| 世界书条目怎样分层调度？ | 基础常驻 + 人物/场景关键词 / 全部常驻 / 深度触发 | 影响上下文预算、可达性和误触发 | 推荐只让整包基础合同常驻，其余按内容边界精确触发 |
| 警告如何处理？ | 全修 / 接受指定项 / 延期 | 影响报告状态 | 推荐修复玩家可见问题，记录纯风格警告 |
```

选择后生成装配或交付片段。`assembly.yaml` 必须登记到 `project.yaml.source_manifest.assembly`，并使用已经锁定的内容引用和媒体槽位。例如：

<!-- validate: assembly.schema.json; merge: assets/templates/assembly.yaml -->
```yaml
schema_version: 1.0.0
status: locked
worldbook_manifest:
  id: midnight_railway_worldbook
  display_name: "午夜铁路世界书"
  scan_depth: null
  token_budget: null
  recursive_scanning: false
  preserve_imported_entries: true
  duplicate_policy: error
  entries:
    - id: abandoned_platform_rule
      display_name: "废弃站台规则"
      source:
        kind: registered_source
        source_ref: world:abandoned_platform
      enabled: true
      activation:
        mode: keywords
        primary_keys: [废弃站台, 断电]
        secondary_keys: []
        selective: false
        logic: any
        case_sensitive: false
        match_whole_words: false
      insertion:
        position: before_char
        order: 100
        depth: null
        role: system
      probability: 100
      scan_depth: 4
      recursion:
        prevent_incoming: false
        prevent_outgoing: false
        delay_until_recursion: false
      recipient: shared
      visibility: model
      token_budget: null
      fallback: block
media_manifest:
  enabled: true
  assets:
    - id: abandoned_platform_night
      kind: background
      source:
        kind: file
        path: media/abandoned-platform-night.webp
      delivery: embedded
      preload: on_opening
      mime_type: image/webp
      consumers:
        - ref: opening:platform_blackout
          slot: presentation.galgame_enhanced.background
      fallback:
        strategy: text
        text: "站台灯正从入口方向依次熄灭。"
```

然后执行相应构建与检查，报告新增证据，再进入下一批交付问题。

## 建议的问题批次

1. 世界书装配：条目来源、激活、插入、条目级扫描深度、概率、递归、独立世界书角色过滤与失败策略。
2. 媒体装配：实际来源、消费者、预加载、完整性与回退。
3. 适配器生成：契约清单、入口、产物、角色正则、消息占位符、依赖和碰撞处置。
4. 产物组合、命名、候选构建、覆盖策略与版本号。
5. 阻断项、警告处置和真实 SillyTavern 验收范围。
6. 最终交付确认。

## 装配职责

### 卡面投影与源码覆盖

- 新卡只把已锁定的非空 `positioning.card_entry` 投影到 `data.description`。它是完整 RP 包的用途、用户入口与模块路由意图的简短常驻合同，不是任何角色的人设，也不能假装 SillyTavern 会据此执行动态路由。默认开场投影到 `data.first_mes`，备选开场按锁定顺序投影到 `data.alternate_greetings`；开场正文不得重复装入世界书。
- 卡名按已锁定承载类型决定：只有 `single_character_card` 且角色源码确实只有一个时使用该角色中文显示名；世界、场景、玩法、群像、叙事者、锚点角色项目或任何多角色模式都使用 `project.project.display_name` 的项目标题。不得因为存在一个锚点角色就把完整项目误命名为人名，也不得默认用某个单一地区名代替概括世界、玩法、主题或体验的项目标题。
- 新卡高级定义字段默认留空，但可以通过 `assembly.card_fields` 有意写入；传统卡兼容、短常驻合同、作者备注、示例对白、系统提示、插件行为都属于合法用途。导入旧卡继续保留既有值，除非显式字段覆盖或迁移策略授权修改。
- `project.yaml.source_manifest` 登记的所有维护源码都要有明确去向：CharacterBook 优先，但也可以进入卡面高级定义、greeting、regex、script、UI、runtime/build-only 或 deliberate exclusion。具名角色默认一人一条世界书条目只是推荐。CharacterBook 覆盖缺口产生提醒；只有源码没有任何投影去向、会实际丢失时才阻断。
- 无显式 assembly 的新项目可由 Forge 生成保守的中文命名条目；存在显式 assembly 时，任何漏掉的可装配源码都是 blocker，必须补齐来源映射和宿主调度，不能靠高级定义字段兜底。
- 一个条目用 `selector` 拆取注册源码时，Forge 会在选中内容外包裹模块身份：模块类型、源码稳定 ID/显示名（如有）、中文条目名和 selector。这样分片仍能说明自己属于哪个 RP 模块，不需要制造孤立的 `/id` 或 `/display_name` 小条目；任何丢失身份包络的分片都视为投影不完整。

### 世界书

- 读取前序阶段给出的稳定内容 ID 和可见性，不在这里扩写内容语义。
- Forge 生成或管理的内嵌 CharacterBook 只要含有条目，就必须绑定为卡的主世界书。有名书写入同名的 `data.extensions.world`；无名书先按 SillyTavern 基于 `<data.name>` 形成的 `<data.name>'s Lorebook` 规则固化名称，非单人项目中的 `data.name` 就是项目标题。导入旧卡已有不同主世界书时保留原值并阻断，当前阶段必须明确选择，不得静默覆盖。不能把“条目已嵌入”当作“宿主已导入并加载”。
- 在 `worldbook_manifest.entries[]` 中决定 `activation`、`insertion`、条目级 `scan_depth`、`probability`、`recursion` 与 `fallback`。当前 SillyTavern 原生路径固定使用 `recipient: shared` 和 `visibility: model`；其他路由或隔离语义需要另有已验证的外部 router，Forge 默认阻断，不能把它们当作普通选项询问。
- `worldbook_manifest.scan_depth`、`token_budget` 与 `recursive_scanning` 只保留宿主默认值 `null`、`null`、`false`。当前宿主实际读取全局世界书设置；扫描范围需要逐条控制时使用 `entries[].scan_depth`，范围为 `0..1000`，其中 `0` 是真实的零深度，只有 `null` 表示继承全局。
- `fallback` 只允许 `skip` 或 `block`。`skip` 会在来源缺失时跳过并报告警告，`block` 会终止构建；不要写 `include`，因为没有可确定注入的替代内容。
- `character_filter` 只用于独立世界书。`avatar_stems` 是头像文件名去掉末尾扩展名后的值，严格区分大小写；`tag_ids` 是目标 SillyTavern 实例内部的不透明标签 ID，不是显示名称，也不可跨实例照搬。未从目标实例核实时保持 `tag_ids: []` 或登记宿主绑定阻断项，不得猜造。角色卡内嵌 CharacterBook 无法可靠保留该过滤器，Forge 会阻断。
- 检查常驻条目、关键词条目、递归入口和宿主全局 token 预算之间是否形成重复注入、不可达条目或无限触发。
- 把递归当作内容依赖图逐条设计：协议、输出格式等控制条目通常封闭递归；人物、地点、势力、场景和线索条目按真实引用保留必要的入站/出站边。开放世界或多场景项目若所有关键词内容条目都双向封闭，必须至少产生警告并整改，不能以“便于排查”为由整体切断。
- MVU 启用时核对 Tavern Helper 角色脚本恰好包含受管的固定版本引擎、自动生成变量结构和运行守卫，且变量列表、更新规则、输出格式均存在于 CharacterBook。缺任一项即为 blocker。
- 导入旧卡时按 `preserve_imported_entries` 与 `duplicate_policy` 处理碰撞；任何替换都进入差异报告。
- 独立世界书 `entries` 必须是以规范非负整数 UID 为键的对象；键、条目 `uid` 和编辑身份必须一致。裸 CharacterBook 的 `keys/enabled/insertion_order` 数组形状不能作为独立世界书导入。

### 媒体

- 把场景顶层 `media_slots`、开场或 UI 的叙事槽位映射到 `media_manifest.assets[]`；每个 consumer 的 `ref + slot` 必须唯一且可解析。`scene:{id}` consumer 的 `slot` 必须精确匹配该场景的 `media_slots[].id`，所有 `required: true` 槽位必须有资产；可选槽位没有资产时保留 `text_fallback`。旧项目的 `extensions.media_slots` 只作为迁移输入读取，新片段不得继续写入不透明扩展袋。
- 本地资源检查文件存在、MIME、摘要和交付路径；远程资源只允许 HTTPS，并记录可用性证据。
- 需要显式预加载策略时使用可选字段 `preload`，值只允许 `none | on_opening | eager | on_demand`；不得用自由文本或适配器私有参数绕过 media manifest。
- 远程媒体可以使用，但不能成为无回退的唯一关键路径。回退为另一媒体时，目标必须存在且回退图不能成环；无法加载时仍要保留纯文本语义。
- 技能不创建也不询问使用许可或来源署名字段。

### 适配器

- 角色卡 payload 按固定顺序处理：先应用 `assembly.yaml`，再生成 MVU CharacterBook 条目，再生成 EJS CharacterBook 条目，恢复保留字段，随后生成必要的 Tavern Helper 运行时脚本并合并 SillyTavern 角色正则，最后把非空内嵌 CharacterBook 绑定为角色主世界书。后一步不得覆盖或重新解释前一步的语义。
- 从已锁定的 `runtime_contract.adapter`、开场呈现需求和 `status_ui.delivery` 生成实际 adapter 文件，不在整合阶段重设它们的功能语义或视觉设计。
- 生成前建立 adapter ID、entrypoint、artifact、角色正则 UUID、消息占位符和宿主依赖表；任何 ID、路径、正则或占位符碰撞都先阻断并路由到责任契约。
- EJS 依赖已登记的 `ST-Prompt-Template`；`1.17.6.8` 是已验证基线而非唯一允许版本。动态条目通常留在 `data.character_book.entries[]`；MVU 运行时桥接脚本与消息 UI 按所选 adapter 投影。
- 当前 MVU 更新模式只装配 `same_generation`。`extra_pass` 或 `both` 若没有独立请求触发、路由、解析、校验、提交、失败回退与宿主测试全链路，必须阻断；不能把手工解析/提交入口列作自动更新证据。
- 启用 MVU 时必须生成完整 `<initvar>...</initvar>` 的 Prompt/显示双隐藏规则、更新块 Prompt 过滤及完整/流式显示规则；初始化块与更新块都保留在原始消息中。启用状态栏时必须生成 AI_OUTPUT 消息正则、为全部开场追加唯一占位符，并把后续助手回复合同写入 CharacterBook：启用 MVU 时合入 MVU 回复格式条目，否则创建中文命名的专用常驻条目。新卡不得把该合同写入 `post_history_instructions`。
- 状态栏与配套 UI 默认通过角色正则和 Tavern Helper 消息级 JS/iframe 交付，也可以使用项目已登记并能在目标环境运行的其他插件、宿主接口或自定义 adapter。`basic_status` 是简单兼容路线，不是复杂 UI 的上限。完整 UI 可以按项目需要使用父页面 DOM、插件内部对象、浏览器存储、远程资源、模板 HTML、网络接口和版本敏感能力；整合阶段负责把实际依赖、入口和已知后果写清楚，不因 API 名称删减功能。每个 iframe 应处理编辑、重新生成、opening swipe、历史加载和二次执行，避免按钮失效、重复触发、数据错位或监听泄漏。用户源码中的 `$&`、`$1` 等只有在会被 SillyTavern 当作替换令牌并破坏产物时才阻断；可通过转义、拆分构造或 Forge 受控捕获槽解决。页面级常驻状态栏/面板仍按用户明确要求禁止，也不得要求修改 SillyTavern 或插件本体。没有真实宿主证据不妨碍实现和候选交付，只限制 `runtime: pass` 的声明。
- 运行时代码必须随项目、角色卡或明确的宿主依赖交付并登记；禁止通过未登记的远程脚本 URL 临时补能力。
- 生成成功、语法通过和静态预览只形成 `offline` 或 `artifact` 证据；只有目标宿主实际加载、更新、卸载和降级用例通过，才能形成 `runtime` 证据。
- 对随卡嵌入 Tavern Helper MVU 角色脚本的制品，真实验收分别确认主 Character Lore 已导入绑定、局部正则已授权、角色脚本已启用、宏未禁用，并观察 MVU 是否启动。Blob URL 渲染仅在“已观察未启动且开关开启”时成为兼容性排障 blocker；关闭并刷新后仍需重新观察。不要为此修改 SillyTavern 或扩展源码。

## 构建纪律

- 所有内容修改回到 `src/` 或 `project.yaml`，随后重新构建。
- 构建先写候选目录，通过验证后原子提交到 `dist/`。
- 没有显式 `--force` 时拒绝覆盖已有产物。
- 导入旧卡时保留未知字段；不能理解的字段进入隔离区并在报告中列明。
- JSON 与 PNG 的角色卡负载必须语义一致；PNG 操作不得改变原头像像素数据。
- 同一源码和同一构建参数应得到语义一致的结果；时间戳等非语义元数据单独登记。
- `assembly.yaml` 是世界书与媒体装配真源；生成后的世界书、资源表和 adapter 不能反向成为创作真源。
- 构建前检查装配引用图闭环、媒体回退图、初始化 profile/opening binding、呈现默认/回退链、角色正则顺序、开场占位符和消息 UI 契约。

## 完成门槛

- 语法、Schema、ID、引用、字段生命周期、可见性和占位符检查通过。
- 目标 JSON 可重新读取；仅当交付清单明确包含 PNG 时才要求其负载可提取，仅当明确包含独立世界书时才要求其条目顺序稳定。
- Forge 管理的角色卡投影制品含内嵌 CharacterBook 条目时，JSON、PNG 内负载和 roundtrip 候选均满足 `data.extensions.world === data.character_book.name`，且名称非空；首次宿主导入已确认 **Import Card Lore**，目标世界书中能找到本次构建的受管条目。同名旧书必须核对内容，不能只凭名字判通过。
- `unpack -> build` 往返不会丢失已知或未知字段。
- 每个产物记录来源修订、构建参数、哈希和验证结果。
- 阻断项为零；警告都有处置记录。
- 真实运行测试已执行，或明确列为 `not_run`/`blocked` 并说明原因。iframe 元素存在但子文档未导航或脚本未执行仍算 `not_run`；Blob URL 在当前宿主浏览器不导航时记录原因 `host_incompatible`。
- `reports/handoff.md` 能区分已证实、未证实、需宿主设置和用户验收。
- `assembly.yaml` 已登记到 `source_manifest.assembly`；世界书、媒体 consumer、adapter 入口、角色正则和消息占位符均无悬空引用或碰撞。
- 所有适用的本地/远程媒体和运行时代码都已登记；远程媒体有回退。运行代码只允许 Forge 内建白名单中的固定版本 MVU/Schema 注册器以及项目明确登记并通过策略校验的依赖，不允许临时 URL。

## 阶段总汇

最终总汇包含：锁定决定总表、启用/跳过阶段、源文件清单、`assembly.yaml` 摘要、世界书装配表、媒体消费者与回退表、adapter 清单、产物清单、校验结果、接受的警告、依赖交付、真实运行证据、仍需用户完成的步骤和回滚信息。用户最后检查遗漏；确认后将项目状态设为 `complete`。

## 下一阶段方向

- 全部通过：推荐归档本次版本，并从 `src/` 开始后续修改。
- 仅缺真实运行证据：推荐在目标 SillyTavern 执行导入、新聊天、开场分支、变量更新、EJS、状态栏和移动端检查。
- 存在创作或契约缺口：明确返回唯一责任阶段，完成后重新跑受影响验证，不能在整合阶段就地补丁。
