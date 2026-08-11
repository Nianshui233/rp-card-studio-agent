# 系统阶段

本阶段定义需要持续追踪的玩法状态及其业务语义，例如信任、怀疑、资源、伤势、时间压力或阵营声望。它回答“何时变化、变化多少、到达区间后发生什么”，不负责 MVU 字段实现或状态栏排版。

系统可以是仅供叙事判定、由模型尽力维护的语义规则，也可以由 MVU 或明确的等价状态源提供确定性运行时支持。前者不得声称能稳定持久化或精确审计；后者必须在后续实现阶段建立路径、生命周期和读写契约。本阶段只锁定业务语义，不提前选择 MVU/EJS 的内部实现组合。

## 目录

- [何时启用](#何时启用)
- [本阶段产物](#本阶段产物)
- [允许问题](#允许问题)
- [禁止问题](#禁止问题)
- [结构写入门](#结构写入门)
- [建议轮次](#建议轮次)
- [充分性门槛](#充分性门槛)
- [轮次输出格式](#轮次输出格式)
- [示例片段](#示例片段)
- [阶段总汇](#阶段总汇)
- [下一阶段建议](#下一阶段建议)

## 何时启用

满足任一条件时推荐启用：

- 某种状态希望跨多轮保留，并能接受模型管理或后续运行时实现的取舍。
- 状态变化会解锁、禁止或改变角色行为。
- 多个状态会相互影响，单靠自然语言容易漂移。
- 用户需要可重复、可审计的进度或风险反馈。

只有装饰性数值、不会影响任何行为的计数器不值得建立系统。没有真实追踪需求时，将本阶段标为 `skipped`。

## 本阶段产物

- 系统目标和使用范围。
- 每个变量轴的稳定语义 ID、类型、主体和可见性。
- 取值范围、初值、变化触发、变化量或计算方法。
- 阈值区间及其实际行为后果。
- 边界、衰减、恢复、联动与冲突裁决。
- 防重复刷取、防单轮爆变和异常输入规则。
- 业务状态机的稳定 ID、初始状态、状态含义、可达转换、guard 语义、进入/离开后果与重置条件。
- 若项目启用相应可选能力，需要送往 MVU/EJS 或状态栏/UI 阶段的绑定待办。

## 允许问题

可以询问：

- 哪些状态值得跨轮追踪，它们各自解决什么 RP 判定问题。
- 状态属于全局、用户、某角色、某段关系、某场景还是某资源实例。
- 使用整数、枚举、布尔、集合、计时器或其他语义类型。
- 数值范围、初始值和初始化依据。
- 哪些可观察事件增加、减少或重置状态。
- 固定变化量、条件变化量或计算公式。
- 阈值区间及其对行为、权限、事件或叙事的具体影响。
- 状态在时间推进、场景切换或长期无触发时如何衰减或恢复。
- 多轴联动、互斥、优先级和同时触发时的结算顺序。
- 最小值、最大值、溢出、非法输入与舍入方式。
- 如何防止重复刷取、同一事件多次结算或单轮极端跳变。
- 玩家看到精确值、等级描述、变化提示还是完全隐藏。
- 哪些离散业务状态真实存在，什么可观察事实触发转换，转换允许从哪里到哪里，以及成功、拒绝和重置分别造成什么后果。

## 禁止问题

不得询问：

- 为解释变量而新增世界历史、力量来源或社会制度。
- 为适配阈值而重写角色动机、童年或关系背景。
- 某个地点的地图、门禁、线索或局部事件。
- storage scope、最终字段路径、运行时 Schema、版本化协议、更新命令、宏、EJS、初始化 profile、adapter 或脚本代码。
- 状态栏使用进度条、卡片、颜色还是动画。
- 回复文风、开场白或叙事排版。
- NSFW 的额外偏好或边界问题。

变量与状态机的稳定 ID 可以在本阶段确定，但它们只是语义标识；项目选择运行时状态实现时，具体 storage、路径、协议和初始化映射才在 MVU/EJS 阶段或已锁定的等价状态源中决定。

## 结构写入门

首次生成系统 YAML 前，完整读取：

- `assets/templates/system.yaml`：当前系统源的根结构和字段名；
- `assets/schemas/system.schema.json`：轴、阈值、规则、`state_machines` 和失败模式的可接受形态。

语义讨论可以使用自然语言，但凡称为“可合并片段”或“完整合并稿”，都必须是 `system.schema.json` 可验证的单个系统源。不要使用 `range`、`delta`、`label`、`coupling`、`settlement` 或 `anti_repeat` 等便利别名替代 Schema 字段；把这些语义分别写入 `minimum`/`maximum`、`operation`/`value`、`display_name`、`rules`、`settlement_order`、`invariants` 与 `failure_modes`。

## 建议轮次

### 第一轮：系统必要性与轴划分

询问 3 到 6 项：

1. 哪些状态会改变实际选择或后果。
2. 每个状态追踪谁或什么。
3. 相似概念应合并为一轴还是拆分为多轴。
4. 玩家应知道多少。
5. 系统希望偏透明、偏叙事还是混合。

不要因为“关系系统”就默认只有好感度。信任、亲近、恐惧、怀疑可能语义不同，只有确实独立影响行为时才拆轴。

### 第二轮：每轴生命周期

逐轴收集：类型、范围、初值、增加触发、减少触发、变化量、阈值、边界和恢复。多轴必须分别回答，不能用一套模糊公式套所有变量。

### 第三轮：状态机语义（按需）

对确实存在离散阶段的系统，确定 `state_axis_id`、`initial_state`、`states`、`transitions`、`guards`、进入/离开 effects 与 resets。只写业务事实与后果，不选择运行时路径、协议或 adapter；连续数值轴能够直接表达时，不为形式额外创建状态机。

### 第四轮：联动与裁决

确定：

- 同一事件改变多轴时的结算顺序。
- 一个轴如何修正另一个轴的增减或阈值效果。
- 阈值跨越与回落时是否触发一次性事件。
- 同一事实重复陈述是否重复结算。
- 非法值、缺失值和冲突更新的处理。

### 第五轮：压力测试（仅按需）

使用刷取、背叛后立刻补偿、连续跨阈值、场景切换、时间快进等高概率情况检查系统。只修补系统语义，不提前写实现代码。

## 充分性门槛

系统整体及每个轴都应满足：

- 有清晰用途和至少一个实际消费者，不是孤立数字。
- 主体范围明确，避免把不同角色或关系误用同一值。
- 类型、范围、初值和初始化依据明确。
- 增加、减少、重置或切换条件可观察、可判定。
- 变化量或公式绑定到具体轴，且有结算频率。
- 阈值完整覆盖有效范围，每个关键区间有实际后果。
- 最小值、最大值、溢出、舍入和非法输入有裁决。
- 多轴联动与同时触发顺序明确。
- 有防重复结算和防刷取规则。
- 玩家可见性明确，但没有越界决定 UI 表现。
- 每个业务状态机都有初始状态、可达路径、转换触发、guard、后果和重置；不存在无法解释的孤立状态或同条件歧义转换。
- 若后续选择 MVU/EJS、等价状态源或状态栏/UI，相应的初始化、更新、读取与消费需求已登记为待办；只采用模型管理时不把运行时实现待办当作完成门，并明确不保证确定性持久化。

## 轮次输出格式

````markdown
## 本轮已锁定
- [系统或变量决定]

## 本轮生成片段
<!-- validate: system.schema.json -->
```yaml
schema_version: 1.0.0
id: system_id
display_name: "[中文显示名]"
status: draft
purpose: "[系统用途]"
axes: []
rules: []
state_machines: []
settlement_order: []
invariants: []
failure_modes: []
source_refs: []
```

## 本阶段检查
- 已满足：[轴 + 条件]
- 生命周期缺口：[仅列系统问题]
- 联动风险：[有则说明]
- 跨阶段待办：[仅列已选择或待选择的 MVU/EJS、状态栏/UI 需求；没有则写“无”]

## 下一批问题
[只问系统；充分时改为阶段总汇]
````

## 示例片段

<!-- validate: system.schema.json -->
```yaml
schema_version: 1.0.0
id: relationship_dynamics
display_name: 关系动态
status: draft
purpose: 分别追踪列车长对用户可靠性的判断与身份风险判断，避免二者被单一好感值混淆。
axes:
  - id: trust
    display_name: 信任
    subject: character:conductor
    type: integer
    initial: 20
    constraints:
      minimum: 0
      maximum: 100
    visibility: descriptive_band
    updates:
      - id: verified_honesty
        when: 用户提供的信息被独立证据验证
        operation: add
        value: 6
        frequency: 每项独立事实仅结算一次
        maximum_change: 6
      - id: betray_confidence
        when: 用户主动泄露角色明确托付的秘密
        operation: subtract
        value: 18
        frequency: 每个泄密事件一次
        maximum_change: 18
    thresholds:
      - id: trust_guarded
        minimum: 0
        maximum: 24
        effect: 不提供超出公开职责的信息。
      - id: trust_limited
        minimum: 25
        maximum: 59
        effect: 允许有限合作，但关键事实仍需验证。
      - id: trust_shared_risk
        minimum: 60
        maximum: 84
        effect: 可以分享会使自身承担风险的线索。
      - id: trust_committed
        minimum: 85
        maximum: 100
        effect: 愿意共同制定违反常规流程的行动方案。
    boundary: 所有更新后截断到 0 至 100。
  - id: suspicion
    display_name: 怀疑
    subject: character:conductor
    type: integer
    initial: 45
    constraints:
      minimum: 0
      maximum: 100
    visibility: change_cues
    updates:
      - id: record_mismatch
        when: 用户陈述与可核验记录出现实质矛盾
        operation: add
        value: 12
        frequency: 同一矛盾仅结算一次
        maximum_change: 12
      - id: credible_explanation
        when: 用户解释同时得到记录和第三方证词支持
        operation: subtract
        value: 10
        frequency: 每条独立证据链一次
        maximum_change: 10
    thresholds:
      - id: suspicion_low
        minimum: 0
        maximum: 39
        effect: 不主动核查用户身份。
      - id: suspicion_watch
        minimum: 40
        maximum: 69
        effect: 保持例行核验并限制敏感区域权限。
      - id: suspicion_investigation
        minimum: 70
        maximum: 100
        effect: 启动正式调查，但仍服从世界观中的乘客保护规则。
    boundary: 所有更新后截断到 0 至 100。
rules:
  - id: high_suspicion_slows_trust
    kind: coupling
    trigger: 同一批次的怀疑候选值达到 70 且信任增加
    conditions:
      - suspicion 候选值大于等于 70
      - trust 原始变化为正数
    effects:
      - axis_id: trust
        operation: derive
        value: 将本次正向变化减半并向下取整
    frequency: 每个结算批次一次
    anti_farming: 同一因果事实去重后才进入结算。
  - id: no_automatic_conversion
    kind: invariant
    trigger: 任一轴发生变化
    conditions:
      - 没有另一条已锁定的显式联动规则
    effects:
      - axis_id: trust
        operation: derive
        value: 不因 suspicion 变化自动改写 trust
      - axis_id: suspicion
        operation: derive
        value: 不因 trust 变化自动改写 suspicion
    frequency: 每个结算批次一次
    anti_farming: null
settlement_order:
  - 按独立因果事实去重。
  - 计算各轴原始变化并应用单规则上限。
  - 应用联动修正。
  - 截断边界并检查最终阈值档位。
  - 原子提交数值、档位和去重记录。
invariants:
  - trust 与 suspicion 独立记录，不互为简单反值。
  - 同一因果事实无论复述、转述或重载都只结算一次。
failure_modes:
  - id: repeated_trigger
    condition: 同一因果事实再次触发同一更新规则。
    fallback: 保留首次结算结果，本次变化为零并记录 duplicate_suppressed。
  - id: unidentified_fact
    condition: 无法判断描述是否对应新的独立事实。
    fallback: 不结算数值，只保留叙事反馈，等待可核验证据。
source_refs: []
```

该示例分别定义两条轴的触发、范围和阈值，没有把 `trust` 与 `suspicion` 当成简单互补值，也没有决定它们在状态栏中怎样画出来。

## 阶段总汇

总汇应包含：

- 所有系统和轴的完整合并稿。
- 每个轴的生命周期矩阵：初始化、更新、读取、行为后果、后续展示需求。
- 阈值覆盖、边界、联动与结算顺序检查。
- 状态机可达性、转换歧义、进入/离开后果与重置检查。
- 孤立变量、重复语义、不可观察触发和刷取风险。
- 若进入 MVU/EJS，列出送往该阶段的实现待办；若跳过，记录采用模型管理、已有等价状态源，或本项目没有运行时实现消费者。
- 送往状态栏/UI 的可见性与消费待办。

## 下一阶段建议

- 项目需要具体地点、探索、权限或局部事件：推荐进入“场景”。
- 不需要独立场景：跳过场景，并根据已锁定系统是否需要确定性运行时支持或条件化渲染，只给出“进入 `mvu_ejs`”或“跳过并进入 `narrative_opening`”两种路线方向和推荐，不在系统阶段询问具体能力组合。选择跳过时按可选阶段规则记录 `skipped`；非新建项目同时保留既有实现。
- 系统无跨轮状态需求：可以回退并把本阶段标为 `skipped`，不要为了形式保留无消费者变量。
- 发现变量依赖尚未定义的角色行为或世界规则：返回对应阶段做最小补丁，再恢复系统阶段。

正常模式下由用户确认下一阶段。放权覆盖时，AI 报告是否启用场景及理由，然后锁定路线。
