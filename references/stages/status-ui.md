# 状态栏/UI 阶段

本阶段把已经存在的状态投影成玩家可读界面。它分别锁定 `status_ui.mode` 所代表的呈现设计，以及 `status_ui.delivery` 所代表的运行时交付契约；不拥有原始业务状态，也不创造剧情规则。适配器文件的实际生成、装配和打包仍由整合阶段完成。

## 进入条件

- 项目已经决定是否需要状态栏/UI。
- 需要 UI 时，MVU 字段账本或等价状态源已经锁定。
- 叙事与开场阶段已经明确首屏需要支持的玩家动作。

## 本阶段边界

### 允许询问

- 文字状态栏、嵌入式 UI 或两者并存。
- 玩家最常查看的信息、折叠层级、刷新时机和交互命令。
- 字段绑定、显示格式、缺失值、加载态、错误态与无脚本降级。
- 视觉方向、信息密度、响应式布局、键盘操作和可访问性。
- 宿主能力、依赖交付、UI 是否只读，以及嵌入式 UI 的 adapter、entrypoint、artifact、mount anchor 与生命周期契约。
- 完整消息、流式未完成消息、状态解析失败和消息生成中断时分别显示什么，以及恢复后如何重新同步。

### 禁止询问

- 不询问新剧情、角色动机、世界秘密或场景结构。
- 不新增数值公式、阈值含义或变量 writer。
- 不改变开场白文本，只检查首屏是否可承接。
- 不把玩家不可见或 GM 专用字段直接绑定到界面。

## 多轮工作循环

```markdown
### 本轮目标：信息架构
| 问题 | 方向 | 影响 | 推荐 |
|---|---|---|---|
| 首层显示多少信息？ | 关键 3 项 / 分组摘要 / 全量面板 | 影响扫读速度与移动端高度 | 推荐关键 3 项，次要信息折叠 |
| UI 是否能改变量？ | 只读 / 有限命令 / 直接编辑 | 影响 writer 所有权和误操作风险 | 推荐只读；需要操作时发送明确命令 |
```

用户选择后给出投影片段。`mode` 决定玩家看到的形态；`delivery` 只描述如何把该形态接入宿主。`mode` 为 `embedded` 或 `both` 时，`delivery` 不能为空且必须完整。例如：

<!-- validate: status-ui.schema.json -->
```yaml
schema_version: 1.1.0
status: locked
status_ui:
  enabled: true
  mode: both
  read_only: true
  refresh: on_state_change
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
  states:
    loading: "正在读取状态"
    empty: "暂无可显示状态"
    error: "状态暂时不可用"
    degraded: "嵌入式视图不可用，继续显示最近一次有效的文字状态；未完成字段标记为更新中"
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
      delivery: "由宿主启用对应运行时能力"
      fallback: "退回 text_template，不阻塞消息阅读"
  delivery:
    level: embedded
    adapter: tavern_helper
    entrypoint: src/ui/status-ui.entry.js
    artifact: dist/ui/status-ui.bundle.js
    mount_anchor: rp-card-status-root
    lifecycle:
      wait_for:
        - message_rendered
        - runtime_state_available
      cleanup:
        - events
        - observers
        - timers
        - dom
        - styles
        - stores
      idempotent: true
```

片段之后输出绑定检查、玩家/GM 可见性检查、当前设备覆盖和下一批本阶段问题。

## 建议的问题批次

1. 模式与用途：文字、嵌入式、并存；只读或有限操作。
2. 信息架构：首层字段、分组、优先级、折叠和历史信息。
3. 绑定与格式：来源路径、单位、枚举文案、空值与过期状态。
4. 消息与错误状态：完整、流式部分、解析失败、生成中断、恢复和最近有效值。
5. 视觉与适配：密度、颜色角色、桌面/移动布局、键盘和可访问性。
6. 交付与生命周期：adapter、entrypoint、artifact、mount anchor，挂载/更新/卸载以及清理范围。

## 设计与交付的分界

- `status_ui.mode`、sections、responsive、visual 和 accessibility 是展示设计；它们描述玩家看到什么、怎样扫读和怎样操作。
- `status_ui.delivery` 是运行时实现契约。`mode: text` 可以使用 `delivery: null`；`mode: embedded` 或 `mode: both` 必须提供完整 delivery。`level: specification` 只代表已完成规格，不能冒充已有可运行 UI。
- `adapter` 是稳定英文 ID；`entrypoint` 是维护源码入口；`artifact` 是候选交付路径；`mount_anchor` 在同一卡的所有 UI/呈现适配器中必须唯一。
- lifecycle 必须覆盖等待条件、幂等挂载和清理资源。重复执行挂载不得产生重复 DOM、监听器、观察器、计时器、样式或 store。
- 本阶段产出适配器契约与界面规格，不手工伪造构建产物。整合阶段根据契约生成文件、检查路径和 ID 碰撞并登记构建证据。

## 消息生命周期与降级

- 完整消息：读取完成状态，校验后一次更新所有绑定字段。
- 流式部分：仅显示已完整解析的字段；未闭合或未到达字段保持最近一次有效值并标记“更新中”，不能用空值覆盖。
- 解析失败：停止本次写入，保留最近一次有效视图，显示 `states.error` 或 `states.degraded`，并记录可定位的错误证据。
- 消息生成中断：结束流式等待、撤销本轮临时状态并退回最近一次有效文字状态；恢复生成或下一条完整消息后重新同步。
- 消息编辑或重新生成：先卸载旧消息对应实例，再按新内容幂等挂载。
- 消息删除：清理该消息注册的 events、observers、timers、DOM、styles 和 stores。
- 切换聊天或关闭视图：卸载当前聊天的全部实例和订阅；返回时从当前聊天状态重新初始化，不复用其他聊天的 store。

## NSFW 投影规则

- 项目首轮已经启用 NSFW 时，自动把前序阶段已锁定、允许玩家查看的相关字段纳入角色与状态栏模板；不再询问偏好、限制或单独开关。
- 项目未启用时，相关字段、分组、文案、条件和占位空间全部省略。
- 不因为“默认纳入”而暴露 GM 字段，也不突破平台硬约束。
- 没有上游字段时不凭空创建 UI 字段；记录缺口并返回字段所属阶段。

启用时把 `assets/templates/nsfw/status-ui.mixin.yaml` 的 `sections` 合并到 `status_ui.sections`，再仅绑定上游已存在且允许玩家查看的字段；关闭时不要读取或复制该 mix-in。

## 完成门槛

- 每个显示字段都能解析到已登记来源路径，格式与源类型兼容。
- UI 只读取展示模型；任何交互写入都通过已登记 writer 或命令通道。
- 玩家界面不含 GM 专用字段，NSFW 开关投影符合项目锁定值。
- 文本模式可在无前端依赖时工作；嵌入式 UI 有加载、空、错误和降级状态。
- 流式部分、解析失败和消息中断不会清空最近一次有效状态，也不会留下半挂载实例。
- 嵌入式或并存模式具有完整 delivery；挂载、更新、编辑/重新生成、删除、切聊和卸载均有幂等清理规则。
- 关键布局在窄屏和桌面均不溢出，文本不会遮挡控件。
- 键盘焦点、标签、对比度与动态更新提示有明确要求。
- 所有宿主依赖均已登记，未实测能力标记为假设。
- Schema 通过、源码生成或浏览器外静态预览只能算 `offline`/`artifact` 证据；没有在目标宿主执行生命周期与降级用例时，不得写成 `runtime: pass`。

## 阶段总汇

总汇包含：展示模式、信息层级图、字段绑定表、可见性审计、交互命令、响应式规则、delivery 契约、挂载/更新/卸载流程、完整/流式/解析失败/中断状态矩阵、依赖与降级、尚未完成的真实运行测试。确认后冻结展示模型与交付契约；上游字段或宿主能力变更必须重新打开本阶段。

## 下一阶段方向

- 推荐进入 `integration`，构建产物并核对绑定、依赖和往返一致性。
- 若绑定字段不存在或类型冲突，返回 `mvu_ejs` 或 `systems`。
- 若用户认为信息层级不合适，留在本阶段继续迭代，不借机修改变量语义。
