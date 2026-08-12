# 状态栏/UI 阶段

本阶段把已经锁定的玩家可见状态投影到每条 AI 聊天消息中。它决定展示内容、消息内布局、变量绑定和交付方式，不拥有变量语义。交付路径只有两种：SillyTavern 角色正则生成的消息内投影，或 Tavern Helper 消息级 JS/iframe。要求助手后续每次回复输出状态栏占位符的格式合同属于 CharacterBook，不属于卡面高级定义字段。

## 进入条件

- 项目已经决定进入状态栏/UI 阶段。
- 需要显示的字段已有锁定的语义来源和玩家可见性。
- 使用 MVU 时，字段账本、运行时路径和初始化已经锁定。
- 叙事与开场阶段已经完成；本阶段只为最终制品添加消息占位符，不改写开场正文。

## 本阶段边界

### 允许询问

- 纯文字状态栏、消息内 HTML 状态栏，或带可读文字摘要的消息内 HTML。
- 玩家最常查看的信息、分组、折叠层级、格式和缺失值。
- 视觉方向、信息密度、窄屏布局、键盘操作和可访问性。
- 使用 SillyTavern 角色正则，还是已经有明确需求和可验证实现的 Tavern Helper 消息级 JS/iframe。
- 完整消息、流式未完成消息、变量解析失败和扩展未授权时的设计文案，以及这些文案是否需要真实运行时切换。
- 角色正则 ID、占位符、消息变量宏、依赖与宿主不可用时的行为。

### 禁止询问

- 不询问新剧情、角色动机、世界秘密或场景结构。
- 不新增数值公式、阈值含义、变量或 writer。
- 不改变开场正文，只验证构建后占位符会被幂等追加。
- 不把玩家不可见或 GM 专用字段绑定到界面。
- 不新增角色正则和 Tavern Helper 消息级 JS/iframe 之外的第三种 UI 表面。
- 不复制参考卡、外部仓库或未登记远程页面作为状态栏实现。

## 多轮工作循环

每轮只解决当前阶段的一组问题：

```markdown
### 本轮目标：消息内状态栏形态
| 问题 | 方向 | 影响 | 推荐 |
|---|---|---|---|
| 状态栏怎样进入消息？ | 角色正则直接投影 / 可选的 Tavern Helper fenced-HTML 消息 iframe 候选 | 影响复杂度、逐楼快照和宿主依赖 | 默认直接投影；只有明确需要高级能力、接受 `host_required`/`not_run`，并安排真实宿主验收时才选择 iframe 候选 |
| 首层显示多少信息？ | 关键 3 项 / 分组摘要 / 全量 | 影响扫读速度和移动端高度 | 推荐关键项常显，次要信息折叠 |
| UI 是否写变量？ | 只读 / 发送明确命令 | 影响 writer 所有权与交付方式 | 推荐只读；命令必须改用 Tavern Helper 消息级实现 |
```

用户选择后立即生成可合并片段。新项目的默认交付是 SillyTavern 角色正则：Forge 在角色卡的 `data.extensions.regex_scripts` 中生成消息内状态栏规则，在所有开场末尾追加唯一占位符，并把后续助手回复的输出合同写入 CharacterBook。启用 MVU 时，合同合并到 MVU 回复格式条目；未启用 MVU 时，生成独立中文常驻条目 `状态栏：回复输出约定`。新卡的 `data.post_history_instructions` 保持为空。

<!-- validate: status-ui.schema.json -->
```yaml
schema_version: 1.2.0
status: locked
status_ui:
  enabled: true
  mode: embedded
  read_only: true
  refresh: on_message
  text_template: "信任：{{relationship.trust}}"
  sections:
    - id: relationship
      display_name: "关系"
      priority: 0
      collapsed: false
      fields:
        - id: trust
          source_path: relationship.trust
          label: "信任"
          format: integer
          missing_value: "未知"
          visibility: player
  commands: []
  # 纯 Regex 下以下四项只保存设计文案，不会自动切换状态。
  states:
    loading: "正在读取状态"
    empty: "暂无可显示状态"
    error: "状态暂时不可用"
    degraded: "状态信息不可用"
  responsive:
    narrow: compact_list
    wide: grouped_columns
  visual:
    density: compact
    hierarchy: [relationship]
    motion: restrained
  accessibility:
    keyboard: true
    live_updates: polite
    color_independent: true
  dependencies:
    - id: tavern_helper_runtime
      class: host_required
      delivery: "提供消息变量宏；普通 DOM 重绘可能回退到最近变量消息"
      fallback: "保留消息正文；不承诺 Regex 自动切换状态视图"
  delivery:
    level: embedded
    adapter: sillytavern_regex
    surface: message
    entrypoint: generated
    artifact: inline
    placeholder: "<StatusPlaceHolderImpl/>"
```

片段之后输出字段绑定检查、玩家/GM 可见性检查、消息生命周期覆盖和下一批本阶段问题。

## 建议的问题批次

1. 模式与交付：文字、HTML、并存；角色正则或消息级 Tavern Helper 实现。
2. 信息架构：首层字段、分组、优先级、折叠和历史信息。
3. 绑定与格式：来源路径、运行时路径、单位、枚举文案、空值与过期状态。
4. 消息状态：完整、流式部分、解析失败、生成中断和扩展未授权。
5. 视觉与适配：密度、颜色角色、桌面/移动布局、长文本、键盘和可访问性。
6. 交付核验：中文正则名、占位符、CharacterBook 回复合同、依赖、降级和真实宿主测试。

## 交付能力边界

| 能力 | `sillytavern_regex + embedded` | `tavern_helper_message + host_required` |
|---|---|---|
| 消息内文字/HTML、分组、原生折叠 | 支持；折叠使用原生 `<details>` | 支持 |
| 窄屏单列、紧凑列表、宽屏分组 | 支持静态 CSS 重排 | 支持 |
| `percent` | 仅在上游值必有且已经是 0..100 时追加 `%` | 可实现校验、换算和精度 |
| `missing_value` 与 `states.*` | 只保存设计文案，不能条件判断或自动切换 | 可在消息 iframe 中实现并验收 |
| 历史逐楼层快照 | 不保证；普通宏可能读取最近变量消息 | 只是可验收的候选目标；脚本未在目标 iframe 中实际执行前不算支持 |
| 命令、tabs、动态刷新 | 不支持 | 需要另行实现并实测的高级宿主路径；当前只可记为规格 |

纯 Regex 的固定契约是 `refresh: on_message`、`read_only: true`、`commands: []`，且 `responsive.narrow/wide` 都不能选择 `tabs`。满足这组条件时默认并优先锁定 `adapter: sillytavern_regex` 与 `level: embedded`。项目需要 `on_state_change`、`manual`、`hybrid`、任意命令、tabs、条件缺失值、运行时状态切换或可靠逐楼层快照时，只能把 `adapter: tavern_helper_message` 与 `level: host_required` 作为用户明确选择的高级候选或设计规格；不能因为选择了它就宣称能力已经存在。在消息级实现通过目标宿主验收前，相关能力保持 `not_run`，不能标记为 `embedded`、可靠或 `runtime: pass`。

## 消息内交付契约

- `surface` 固定为 `message`。它约束状态栏出现在哪条消息的 DOM 中，不等于承诺变量读取已绑定该楼层。
- `placeholder` 固定为 `<StatusPlaceHolderImpl/>`。Forge 会移除开场中的重复占位符，再在默认开场和每个备选开场末尾各追加一次。
- Forge 会在 CharacterBook 中加入稳定合同：每条助手回复在变量更新块之后输出且只输出一个占位符，之后不再追加正文。启用 MVU 时合并到中文可见的 MVU 回复格式条目；未启用 MVU 时创建中文常驻条目 `状态栏：回复输出约定`。不得把新合同写入 `post_history_instructions`、`system_prompt` 或其他高级定义字段。
- 该合同必须常驻，因为每次助手生成都要遵守；它不能依赖偶然出现的关键词。合同本身是封闭输出协议，默认禁止传入和传出递归，避免自身文字触发其他条目或被其他条目重复唤起。具体 position、depth、order、probability、scan depth 与 recursion 数值仍由整合阶段逐条锁定。
- `adapter: sillytavern_regex` 会生成 `placement: [2]`、`markdownOnly: true`、`promptOnly: false` 的角色正则，把占位符替换成消息内文字或自包含 HTML；该路径只允许按消息重绘、只读、无命令和无 tabs。
- 默认字段值通过成功参考卡同类的 `{{format_message_variable::stat_data.path}}` 宏读取。路径必须从 MVU 字段账本的 `runtime_path` 编译，不能直接猜。该宏由 Tavern Helper 的 macro-like 渲染层提供，只负责宿主格式化，不能在正则阶段判断缺失、错误或加载状态；当前验证的 Tavern Helper 4.9.1 在普通消息 DOM 重绘时没有向宏传 `message_id`，因此会回退到最近一条带变量的消息。交付清单必须同时要求启用 Tavern Helper 的宏替换能力，不能把它误写成 SillyTavern 原生变量宏。
- `field.missing_value` 与 `states.loading/empty/error/degraded` 在纯 Regex 路径中是设计元数据。它们可供将来升级消息级实现，但不会被宣称为已经显示或已经自动切换。
- `format: percent` 只允许为已保证存在且已经归一为 0..100 的上游数值追加字面 `%`；它独占这个单位后缀，`text_template` 中对应占位符后不得再手写 `%`，否则 Forge 必须阻断 `80%%` 一类重复输出。需要乘算、舍入、范围修正或条件空值时改用消息级实现。
- 角色正则只改变显示副本；原始聊天消息保留占位符和变量更新块，供 MVU 与重新渲染使用。
- SillyTavern 首次载入带角色正则的卡时会请求用户授权。这是宿主安全机制；技能只能在交付清单中说明，不能绕过或伪造授权。
- `adapter: tavern_helper_message` 是复杂消息级交互、动态状态切换或逐楼快照的可选高级候选，不是默认可靠适配器。角色正则可以把占位符替换为完整 fenced HTML，再由 Tavern Helper 尝试在消息位置创建 iframe；HTML、CSS、脚本和可读错误态必须全部自包含，不请求远程 UI，也不读取或修改父页面。当前真实组合 SillyTavern 1.18.0 + Tavern Helper 4.9.1 已证实：开启酒馆助手 `渲染 -> 启用 Blob URL 渲染` 时，消息 iframe 可能为空，同时随卡嵌入的 MVU 角色脚本也无法启动；关闭该选项并刷新 SillyTavern 后，MVU 初始化恢复。验收应先检查这个用户级宿主设置，再诊断卡片脚本；不得修改 SillyTavern 或扩展源码。
- 消息 iframe 必须调用 `getCurrentMessageId()` 并以 `Number.isInteger(message_id)` 验证结果，再调用 `getVariables({ type: "message", message_id })` 读取该楼变量。首次合法 `stat_data` 可能是宿主暂时继承的上一楼快照，不能把“对象存在”当成本楼提交完成；初次快速获取后转为默认 2 秒低频同步，仅在可见值变化时重绘，并在 `pagehide`/`unload` 清理。无法取得整数 ID 时显示明确错误并停止；初次 API/读取失败有界重试后显示错误，已经取得合法值后的暂时失败保留最近合法内容并继续低频复查。不得传入 `"latest"`、调用 latest 快照作为回退，或悄悄显示其他楼层的数据。
- 状态栏只能由上述两种消息内路径交付，不能增加其他页面级实现。

## MVU 角色正则组合

启用 MVU 时，Forge 还会生成并固定排序以下角色正则。用户可见的正则名称使用中文，稳定 UUID 和生成器内部 ID 保留英文：

1. 初始化 Prompt 隐藏：只从送给模型的副本中移除完整 `<initvar>...</initvar>` 块。
2. 更新 Prompt 过滤：从发给模型的历史副本中移除完整或流式未闭合的 `<UpdateVariable>` / `<update>` 块；默认 `minDepth: 2`，保留最近两层供模型理解本轮状态变化。
3. 初始化显示隐藏：只从玩家看到的 Markdown 副本中移除完整 `<initvar>...</initvar>` 块。
4. 流式显示隐藏：生成未完成时隐藏已经出现的更新块，保留更新块之后的状态栏占位符。
5. 完整显示隐藏：生成完成后隐藏完整更新块，不额外展示变量命令。
6. `[不发送]界面占位符`：从送模副本删除 `<StatusPlaceHolderImpl/>`。
7. `[界面]状态栏`：最后把消息显示副本中的占位符替换成直接投影或 fenced HTML。

两条初始化隐藏规则都只匹配成对闭合的完整块；未闭合的 `<initvar>` 不得被宽松吞掉，以免隐藏普通正文或掩盖损坏的开场。正则只改变送模/显示副本，原始聊天记录中的初始化块必须保留给 MVU。

这些规则使用稳定 UUID。重建时，同 ID 且具有技能固定生成器指纹的旧规则会被刷新为当前配置；同 ID 但不符合该指纹的用户内容会原样保留并阻断覆盖。用户自己的其他规则保持原内容和相对顺序。正则必须使用非贪婪多块匹配，不能因为一条消息出现多个更新块而吞掉中间正文。

## 模式语义

- `mode: text`：把 `text_template` 中的语义路径编译为消息变量宏，生成消息内文字状态栏。
- `mode: embedded`：根据 sections 生成自包含消息内 HTML；CSS 必须限定在自己的根类下，不污染其他消息。
- `mode: both`：同一条消息内的 HTML 同时包含可读文字摘要；它不表示依赖失败时会自动切换视图。需要条件切换时使用 Tavern Helper 消息级实现。
- `mode: none`：`enabled` 必须为 `false`，`delivery` 必须为 `null`，角色卡中不得残留占位符或状态栏正则。

## 消息生命周期与降级

- 完整消息：状态栏留在该消息内部；默认宏方案按宿主可解析的消息变量显示，不能宣称历史快照隔离。
- 流式部分：只隐藏已经出现的变量更新内容；占位符出现后再渲染状态栏，不伪造未提交值。
- 解析失败：纯 Regex 无法探测失败或选择 `states.error/degraded`，只能保留原消息正文并把该能力记录为未实现；只有已验收的消息级实现才能显示相应状态并保留最近合法值。
- 消息编辑或重新生成：由 SillyTavern 重新运行角色正则；规则必须幂等，不能重复生成状态栏。
- 消息删除、切聊或加载历史：基础 Regex 只重新生成所在消息的静态投影。高级 iframe 候选若已在目标宿主运行，低频同步才可复查自己的整数楼层 ID，并必须在 `pagehide`/`unload` 清理；脚本未执行时这些都只是未运行的制品合同，不能据此宣称实例隔离或清理通过。
- 若项目要求逐楼层历史快照：加载至少两个状态不同的历史楼层，确认每个消息 iframe 的脚本确实执行，`getCurrentMessageId()` 分别返回自身整数 ID，且 `getVariables({ type: "message", message_id })` 始终返回对应变量；还要制造“首读合法旧值、随后同楼提交新值”的时序，确认 UI 更新而未读取 latest。刷新页面后重复检查。纯角色正则加 DOM 宏不满足这一声明。
- 正则未授权、Tavern Helper/MVU 缺失或宏不可用：不得阻塞消息正文。纯 Regex 不会凭空生成文字降级或最近合法状态；运行报告必须准确记录未显示、未替换或未验证的结果。
- 若宿主插入了 iframe 元素但其子文档没有导航或脚本未执行，状态栏没有运行。先核对局部正则授权、角色脚本、宏、世界书绑定和真实 MVU 启动观察。只有观察到 MVU 未启动且 Blob URL 渲染开启时，才建议关闭该选项、刷新并重试，并记录 blocker `tavern_helper_blob_url_rendering_observed_failure`；不得仅凭开关、iframe 元素、Blob 内容或静态截图判定通过或失败。

## NSFW 投影规则

- 项目首轮已经启用 NSFW 时，本阶段只把前序阶段已锁定且允许玩家查看的相关字段纳入状态栏模板；角色模板已由角色阶段处理，本阶段不得回写或补造角色内容，也不再询问偏好、限制或单独开关。
- 项目未启用时，相关字段、分组、文案、条件和占位空间全部省略。
- 不因为默认纳入而暴露 GM 字段，也不突破平台硬约束。
- 没有上游字段时不凭空创建 UI 字段；记录缺口并返回字段所属阶段。

启用时把 `assets/templates/nsfw/status-ui.mixin.yaml` 的 sections 合并到 `status_ui.sections`，再仅绑定上游已存在且允许玩家查看的字段；关闭时不要读取或复制该 mix-in。

## 完成门槛

- 每个显示字段都能解析到玩家可见来源路径和唯一运行时路径，格式与源类型兼容。
- 默认开场和所有备选开场在制品中各含唯一占位符，后续回复合同明确且无重复。
- 后续回复合同位于启用的 CharacterBook 条目：有 MVU 时已合并到 MVU 回复格式条目，无 MVU 时存在中文常驻条目 `状态栏：回复输出约定`；新卡 `data.post_history_instructions` 为空。
- `data.extensions.regex_scripts` 同时包含 `[不发送]界面占位符` 与 `[界面]状态栏`；启用 MVU 时还包含 `<initvar>` 的 Prompt/显示隐藏、更新块 Prompt 过滤和显示隐藏规则。
- 正则字段、UUID、placement、Markdown/Prompt 作用域、深度和顺序符合 SillyTavern 契约。
- 状态栏只出现在 AI 消息内部；基础能力默认属于角色正则，Tavern Helper 消息级 JS/iframe 只作为显式选择且尚待宿主证明的高级路径。
- 文字、HTML 和已真实实现的运行状态均不泄漏 GM 字段，窄屏与桌面不溢出。
- 纯 Regex 的 `missing_value`、`states.*` 和逐楼层快照在报告中明确为设计元数据或未保证；命令、tabs 与动态刷新不会混入 embedded Regex 契约。
- 不依赖参考文件或未登记远程页面；消息 iframe 的 HTML、CSS 与脚本自包含，不访问父页面或加载远程 UI。
- Schema、制品校验和往返通过；未在真实 SillyTavern 执行时只记录为 `not_run`。

## 阶段总汇

总汇包含：消息内模式、信息层级、字段绑定、可见性审计、中文正则名与稳定机器 ID 对照、正则顺序、占位符与 CharacterBook 助手输出合同、设计元数据与已实现能力的区别、完整/流式/失败状态矩阵、依赖行为、桌面/移动检查，以及尚未完成的真实 SillyTavern 验收。确认后冻结展示模型与交付契约；具体世界书插入位置、深度、顺序、概率、扫描深度和递归由整合阶段锁定，上游字段或宿主能力变化必须重新打开本阶段。

## 下一阶段方向

- 推荐进入 `integration`，构建角色正则、检查碰撞并验证最终制品。
- 若绑定字段不存在或类型冲突，返回 `mvu_ejs` 或 `systems`。
- 若信息层级不合适，留在本阶段继续迭代，不借机修改变量语义。
