# 叙事与开场阶段

本阶段确定模型如何叙述，以及每条开场如何把已经自行运转的世界交给实际游玩。同一条开场可以提供 `prose`、`chat`、`galgame` 或 `custom` 呈现变体，但事实、初始状态、即时变化和钩子只在父 opening 定义一次。世界、NPC 与普通场景不能依赖某个用户角色才成立；但开场本身可以提供预制视角、自由创角或两者并存，并明确用户接手行动的位置。

本阶段同时标记内容归属，但不做宿主调度：默认开场最终进入 `data.first_mes`，备选开场按锁定顺序进入 `data.alternate_greetings`；全局叙事合同和跨场景对话示例成为独立 CharacterBook 内容模块。新卡不把这些内容写入 `data.mes_example`、`data.system_prompt` 或 `data.post_history_instructions`。

## 进入条件

- 世界、角色资产清单和必要场景已经锁定；角色资产清单可以为空，开场不得为此补造固定角色。
- `stages.mvu_ejs.status` 为 `complete` 或 `skipped`。只要 `features.mvu: true` 或实际交付物保留既有 MVU 实现，就必须读取并验证已锁定的初始化映射，但不在本阶段改变字段结构；只有新建且无既有实现的纯跳过才不要求初始化映射，也永远不要求生成禁用产物。

## 本阶段边界

### 允许询问

- 叙述视角、时态、语言密度、节奏、感官重点和对白比例。
- 已创作角色的行动尺度、信息揭示节奏和失败呈现。
- 默认开场及备选开场的切入时刻、冲突、钩子、长度、局势开放度，以及采用预制视角、自由创角还是两者并存。
- 开场所需的已锁定事实、初始场景、在场角色与初始状态引用。`player_agency` 只约束叙事不替用户决定什么，`player_handoff` 说明开场在哪个问题、动作或选择点把控制权交回。
- 同一开场需要哪些呈现模式、各模式的文本组织方式、能力需求、媒体叙事槽位和纯文本回退。
- 示例对话应展示哪些声音特征与行为规则。
- 动态人物如何从已锁定的居民类型与生成事实中获得可辨认但不越界的外观、语言、欲望和反应，以及再次出现时如何保持连续。

### 禁止询问

- 不新增世界历史、能力规则、角色核心动机或关系数值轴。
- 不修改 MVU 类型、更新公式、EJS 方言或 writer。
- 不询问状态栏布局、颜色、组件、DOM、挂载点、资源 URL、实际媒体文件、构建入口或打包方式。
- 不询问叙事条目的常驻/关键词选择、插入位置、深度、顺序、概率、扫描深度或递归；这些由整合交付阶段逐条决定。
- 本阶段只决定叙事与开场语义，不提前决定高级定义的最终宿主分摊；如发现某段适合 `mes_example`、`system_prompt` 等槽位，登记整合待办。

发现缺口时把它路由回原阶段；可以写“暂缺事实导致开场 2 阻塞”，不能在开场阶段替用户补造底层设定。

动态人物的叙事合同只能决定“已经生成的人怎样被写出来”：差异化程度、信息边界、行为一致性、再次出场时必须保持的事实，以及不应擅自升级为固定主角的条件。居民类别属于世界观，生成/去重/身份/生命周期属于系统；本阶段不得重新定义它们。

## 多轮工作循环

```markdown
### 本轮目标：叙事合同
| 问题 | 方向 | 影响 | 推荐 |
|---|---|---|---|
| 采用何种视角？ | 第三人称限知 / 已创作角色第一人称 / 灵活镜头 | 决定沉浸感与信息边界 | 推荐灵活镜头，因为项目强调群像与世界自主推进 |
| 每轮结尾如何收束？ | 未解事实 / 环境变化 / 角色行动 / 突发事件 | 决定局势张力 | 推荐环境变化，让世界继续推进而不预写不存在主体的反应 |
```

用户选择后立即生成可合并片段。开场的 `visible_text` 是不依赖脚本、媒体或自定义组件的纯文本基线；每个呈现变体只能改变表达形式，不能改变父 opening 的共享语义。例如：

<!-- validate: opening.schema.json; merge: assets/templates/opening.yaml -->
```yaml
schema_version: 1.0.0
status: locked
narrative:
  point_of_view: flexible_camera
  tense: present
  pacing: gradual_tension
  prose_density: concise
  dialogue_ratio: balanced
  sensory_focus: [sound, temperature]
  player_agency:
    never_decide: [用户对白, 用户心理, 用户行动结果]
    npc_permissions: [主动行动, 继续既有计划, 对用户输入作出反应]
    handoff: 每轮在需要用户表达、选择或行动的位置收束。
  information_policy:
    reveal:
      - 当前镜头中已经显露的事实
    withhold:
      - 尚未通过线索揭示的 GM 真相
openings:
  - id: platform_blackout
    display_name: "断电站台"
    is_default: true
    scene_ref: scene:abandoned_platform
    present_character_refs:
      - character:night_dispatcher
    visible_text: "站台灯从入口方向依次熄灭。夜间调度员放下记录板，盯着轨道间逐渐逼近的黑暗。"
    presentations:
      default_variant_id: galgame_enhanced
      variants:
        - id: prose_plain
          display_name: "纯文本"
          mode: prose
          visible_text: "站台灯从入口方向依次熄灭。夜间调度员放下记录板，盯着轨道间逐渐逼近的黑暗。"
          requirements: []
          media_refs: []
          fallback_variant_ref: null
          delivery: builtin
        - id: galgame_enhanced
          display_name: "Galgame 呈现"
          mode: galgame
          visible_text: "【调度员】又提前了三分钟……\n【旁白】入口方向的站台灯一盏盏熄灭。"
          requirements:
            - galgame_presenter
          media_refs:
            - media:abandoned_platform_night
          fallback_variant_ref: presentation:prose_plain
          delivery: embedded
    immediate_change: "站台照明从入口方向开始连续熄灭。"
    hook: "调度员知道断电的规律，却拒绝立刻解释。"
    player_handoff: "镜头停在站台边缘，让用户决定如何回应这次异常。"
    initial_state_ref: null
    established_facts:
      - "站台正在发生有规律的断电。"
      - "调度员在场并察觉到危险。"
dialogue_examples: []
source_refs:
  - scene:abandoned_platform
  - character:night_dispatcher
```

随后输出本轮已锁定、片段、与既有设定的一致性检查，以及下一批仍属于本阶段的问题。全局叙事规则和跨场景示例各自使用稳定英文机器 ID 与中文显示名登记为 CharacterBook 内容候选，但本阶段不填写任何激活或插入参数。

## 建议的问题批次

1. 叙事合同：视角、时态、密度、节奏和信息边界。
2. 表现规则：对白、动作、感官、内心信息与段落结构。
3. 默认开场：切入时刻、场景、冲突、即时变化和钩子。
4. 备选开场：差异价值、状态覆盖和是否值得保留。
5. 呈现变体：`prose`、`chat`、`galgame` 或 `custom` 的文本结构、能力需求、媒体叙事槽位和纯文本回退。
6. 用户交接：哪些行为绝不代写、自由创角需要哪些叙事字段、开场以什么问题或行动点收束。
7. 示例对话：角色声音、行为后果和不应出现的 OOC 模式。

## 开场片段规则

- 开场展示正在发生的处境。对预制视角，只使用已经锁定的人物事实；对自由创角入口，可以询问身份、地点、当时正在做什么、如何察觉异常，但不能替用户填写或替其作出行动。
- 第一轮就呈现已创作角色的行动、可调查事实或迫近变化。
- 开场中的事实必须来自已锁定源文件。
- 启用 MVU 时，每条开场引用一个合法初始化配置；文本描述与初始值一致。
- 备选开场只有在切入点、关系状态或玩法明显不同的情况下保留。
- GM 秘密不得直接写入开场表层文本；可以通过现象和线索间接表现。
- 父 opening 的 `visible_text` 始终是纯文本基线；`presentations.default_variant_id` 必须指向本 opening 内存在的变体。
- `prose`、`chat`、`galgame` 与 `custom` 变体共享父 opening 的 `established_facts`、`initial_state_ref`、`immediate_change` 和 `hook`，不得各自发明不同剧情状态。
- 任何依赖脚本、媒体或宿主能力的增强变体都必须通过 `fallback_variant_ref` 指向同 opening 内可独立工作的纯文本 `prose` 变体；回退链不能成环。
- 本阶段只登记能力需求与 `media:*` 叙事引用。媒体文件、URL、完整性、预加载、实际交付与适配器由整合阶段决定。
- 开场源码保持纯文本，不手写状态栏 HTML。项目启用状态栏时，Forge 在最终角色卡的默认与备选开场末尾幂等追加消息占位符；状态栏阶段与整合阶段负责对应角色正则。
- 默认 opening 只能投影到 `data.first_mes`；其余 opening 只能按锁定顺序投影到 `data.alternate_greetings`。不要为方便而把开场复制进 `scenario` 或 `description`。
- 叙事合同、跨角色/跨场景对话示例和回复风格规则优先拆成可独立理解的 CharacterBook 内容模块。只属于某个具体角色的口吻校准示例仍归该角色完整定义，不重复复制；没有固定角色时不要求人物口吻示例。

## 完成门槛

- 叙事合同可执行，不只有“细腻”“沉浸”等无边界形容词。
- 已创作角色的行动权限、知识视角和输出收束规则明确。
- 默认开场具有地点、在场者、即时变化、未解决压力、钩子与清晰的用户交接点。
- 所有备选开场都有独立价值，并与各自初始化状态一致。
- 每条开场的父级共享语义只有一份；所有呈现变体与它一致，默认变体和回退引用均可解析。
- 每个增强呈现都有纯文本回退，且在依赖或媒体缺失时仍保留相同的事实、压力与钩子。
- 存在固定角色时，示例对话覆盖主要声音特征且不与角色行为规则冲突；零固定角色项目只校验其叙事者、主持或世界声音合同。
- 无未解析 ID、变量路径、模板占位符或 GM 信息直泄。
- 已明确唯一默认 opening、备选 opening 的锁定顺序，以及各自到 `first_mes`/`alternate_greetings` 的投影关系。
- 全局叙事合同与跨场景对话示例已有独立中文显示名和稳定英文机器 ID；没有写入新卡高级定义字段，也没有提前决定世界书调度参数。

## 阶段总汇

总汇包含：叙事合同、世界/NPC 自主运转检查、预制视角与自由创角路线、用户交接合同、开场索引、`data.first_mes` 与 `data.alternate_greetings` 投影表、每条开场的共享事实与初始状态、钩子对比、呈现变体矩阵、默认/回退关系、媒体叙事引用、叙事/示例 CharacterBook 内容候选及缺漏。总汇还要列出可能进入高级定义字段的候选片段，但不在本阶段锁定宿主分摊；世界书 activation、keys、position、depth、order、probability、scan depth 与 recursion 也尚未在本阶段决定。用户确认后锁定文本；后续若更改开场状态，必须重新检查 MVU 初始化，若更改呈现能力则重新检查状态栏/UI 和整合装配。

## 下一阶段方向

- 路线包含 `status_ui`：进入该阶段，只把已锁定变量做成展示模型。
- 路线跳过 `status_ui`：保持预检记录的 `skipped` 状态并进入 `integration`，不得重新询问。
- 若开场与初始化冲突，返回 `mvu_ejs`；若角色声音冲突，返回 `character`。
