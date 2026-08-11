# 叙事与开场阶段

本阶段确定模型如何叙述、如何保护玩家代理权，以及每条开场如何把用户带入已经锁定的世界状态。同一条开场可以提供 `prose`、`chat`、`galgame` 或 `custom` 呈现变体，但事实、初始状态、即时变化、钩子和玩家交接点只在父 opening 定义一次。

## 进入条件

- 世界、角色和必要场景已经锁定。
- `stages.mvu_ejs.status` 为 `complete` 或 `skipped`。只要 `features.mvu: true` 或实际交付物保留既有 MVU 实现，就必须读取并验证已锁定的初始化映射，但不在本阶段改变字段结构；只有新建且无既有实现的纯跳过才不要求初始化映射，也永远不要求生成禁用产物。

## 本阶段边界

### 允许询问

- 叙述视角、时态、语言密度、节奏、感官重点和对白比例。
- 玩家代理权边界、NPC 行动尺度、信息揭示节奏和失败呈现。
- 默认开场及备选开场的切入时刻、冲突、钩子、长度和互动余地。
- 开场所需的已锁定事实、初始场景、在场角色与初始状态引用。
- 同一开场需要哪些呈现模式、各模式的文本组织方式、能力需求、媒体叙事槽位和纯文本回退。
- 示例对话应展示哪些声音特征与行为规则。

### 禁止询问

- 不新增世界历史、能力规则、角色核心动机或关系数值轴。
- 不修改 MVU 类型、更新公式、EJS 方言或 writer。
- 不询问状态栏布局、颜色、组件、DOM、挂载点、资源 URL、实际媒体文件、构建入口或打包方式。

发现缺口时把它路由回原阶段；可以写“暂缺事实导致开场 2 阻塞”，不能在开场阶段替用户补造底层设定。

## 多轮工作循环

```markdown
### 本轮目标：叙事合同
| 问题 | 方向 | 影响 | 推荐 |
|---|---|---|---|
| 采用何种视角？ | 第二人称近距 / 第三人称限知 / 灵活镜头 | 决定沉浸感与信息边界 | 推荐第二人称近距，因为项目强调玩家临场判断 |
| 每轮结尾如何留白？ | 明确问题 / 可行动环境 / 突发事件 | 决定用户接管空间 | 推荐可行动环境，避免替用户作决定 |
```

用户选择后立即生成可合并片段。开场的 `visible_text` 是不依赖脚本、媒体或自定义组件的纯文本基线；每个呈现变体只能改变表达形式，不能改变父 opening 的共享语义。例如：

<!-- validate: opening.schema.json; merge: assets/templates/opening.yaml -->
```yaml
schema_version: 1.0.0
status: locked
narrative:
  point_of_view: second_person_limited
  tense: present
  pacing: gradual_tension
  prose_density: concise
  dialogue_ratio: balanced
  sensory_focus: [sound, temperature]
  player_agency:
    never_decide:
      - 玩家的内心结论
      - 玩家未表达的行动
    npc_permissions:
      - NPC 可以制造压力并回应玩家已经表达的行动
    handoff: 每轮以可感知变化和至少一个开放行动点收束
  information_policy:
    reveal:
      - 玩家当下能够感知的事实
    withhold:
      - 尚未通过线索揭示的 GM 真相
openings:
  - id: platform_blackout
    display_name: "断电站台"
    is_default: true
    scene_ref: scene:abandoned_platform
    present_character_refs:
      - character:night_dispatcher
    visible_text: "站台灯在你身后依次熄灭。调度员抬起手，示意你先别靠近轨道。"
    presentations:
      default_variant_id: galgame_enhanced
      variants:
        - id: prose_plain
          display_name: "纯文本"
          mode: prose
          visible_text: "站台灯在你身后依次熄灭。调度员抬起手，示意你先别靠近轨道。"
          requirements: []
          media_refs: []
          fallback_variant_ref: null
          delivery: builtin
        - id: galgame_enhanced
          display_name: "Galgame 呈现"
          mode: galgame
          visible_text: "【调度员】先别靠近轨道。你身后的站台灯正一盏盏熄灭。"
          requirements:
            - galgame_presenter
          media_refs:
            - media:abandoned_platform_night
          fallback_variant_ref: presentation:prose_plain
          delivery: embedded
    immediate_change: "站台照明从入口方向开始连续熄灭。"
    hook: "调度员知道断电的规律，却拒绝立刻解释。"
    player_handoff: "玩家可追问调度员、检查灯轨或退回入口。"
    initial_state_ref: null
    established_facts:
      - "站台正在发生有规律的断电。"
      - "调度员在场并察觉到危险。"
dialogue_examples: []
source_refs:
  - scene:abandoned_platform
  - character:night_dispatcher
```

随后输出本轮已锁定、片段、与既有设定的一致性检查，以及下一批仍属于本阶段的问题。

## 建议的问题批次

1. 叙事合同：视角、时态、密度、节奏、代理权。
2. 表现规则：对白、动作、感官、内心信息与段落结构。
3. 默认开场：切入时刻、场景、冲突、钩子和交接点。
4. 备选开场：差异价值、状态覆盖和是否值得保留。
5. 呈现变体：`prose`、`chat`、`galgame` 或 `custom` 的文本结构、能力需求、媒体叙事槽位和纯文本回退。
6. 示例对话：角色声音、行为后果和不应出现的 OOC 模式。

## 开场片段规则

- 开场展示处境，不代替玩家作出关键选择、说话或形成感受。
- 第一轮就提供可回应对象、可行动线索或迫近变化。
- 开场中的事实必须来自已锁定源文件。
- 启用 MVU 时，每条开场引用一个合法初始化配置；文本描述与初始值一致。
- 备选开场只有在切入点、关系状态或玩法明显不同的情况下保留。
- GM 秘密不得直接写入玩家可见开场；可以通过现象和线索间接表现。
- 父 opening 的 `visible_text` 始终是纯文本基线；`presentations.default_variant_id` 必须指向本 opening 内存在的变体。
- `prose`、`chat`、`galgame` 与 `custom` 变体共享父 opening 的 `established_facts`、`initial_state_ref`、`immediate_change`、`hook` 和 `player_handoff`，不得各自发明不同剧情状态。
- 任何依赖脚本、媒体或宿主能力的增强变体都必须通过 `fallback_variant_ref` 指向同 opening 内可独立工作的纯文本 `prose` 变体；回退链不能成环。
- 本阶段只登记能力需求与 `media:*` 叙事引用。媒体文件、URL、完整性、预加载、实际交付与适配器由整合阶段决定。
- 开场源码保持纯文本，不手写状态栏 HTML。项目启用状态栏时，Forge 在最终角色卡的默认与备选开场末尾幂等追加消息占位符；状态栏阶段与整合阶段负责对应角色正则。

## 完成门槛

- 叙事合同可执行，不只有“细腻”“沉浸”等无边界形容词。
- 玩家代理权、NPC 权限、知识视角和输出收束规则明确。
- 默认开场具有地点、在场者、即时变化、互动钩子和玩家接管空间。
- 所有备选开场都有独立价值，并与各自初始化状态一致。
- 每条开场的父级共享语义只有一份；所有呈现变体与它一致，默认变体和回退引用均可解析。
- 每个增强呈现都有纯文本回退，且在依赖或媒体缺失时仍保留相同的玩家接管空间。
- 示例对话覆盖主要声音特征，且不与角色行为规则冲突。
- 无未解析 ID、变量路径、模板占位符或 GM 信息直泄。

## 阶段总汇

总汇包含：叙事合同、禁止替玩家决定的事项、开场索引、每条开场的共享事实与初始状态、钩子对比、呈现变体矩阵、默认/回退关系、媒体叙事引用、示例对话覆盖与缺漏。用户确认后锁定文本；后续若更改开场状态，必须重新检查 MVU 初始化，若更改呈现能力则重新检查状态栏/UI 和整合装配。

## 下一阶段方向

- 项目启用状态栏/UI 时，推荐进入 `status_ui`，只把已锁定变量做成展示模型。
- 项目不需要状态栏/UI 时，推荐跳过并记录理由，进入 `integration`。
- 若开场与初始化冲突，返回 `mvu_ejs`；若角色声音冲突，返回 `character`。
