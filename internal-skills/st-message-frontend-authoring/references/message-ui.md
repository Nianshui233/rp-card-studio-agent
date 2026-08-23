# 持续消息 UI

持续消息 UI 用于状态、物品、关系、任务、地图、线索和行动，只在正式 RP 的消息生命周期中运行。项目介绍、路线选择、空白创角、首次初始化和 Greeting 交接属于 `st-opening-frontend-authoring`，不得混入本页面。

## 访谈与实现

围绕玩家最常看或操作的信息、当前楼层变化、设备、视觉方向和交互强度，先给推荐信息层级与主要动作，解释理由和影响；每次回答后立即修改真实 HTML。用户放权时直接选择。

最终维护完整、自包含 `.html`，并声明真实宿主：

```text
Tavern Helper fenced HTML
ST-Prompt-Template @@iframe
纯 SillyTavern 静态 HTML
其他已验证载体
```

完整 HTML 文件本身不保证消息中的 JavaScript 会执行。新建持续消息表面时直接维护最终 HTML 和实际正则/EJS/脚本配对，不生成 UI 需求表、实现清单、状态账本或中间 YAML。

## Provider 专用适配

### Tavern Helper fenced iframe

```text
getCurrentMessageId()
→ getChatMessages/Mvu.getMvuData
→ 裸 eventOn
→ pagehide 时 TH 自动 eventClearAll + 项目主动 stop
```

只在 TH 消息 iframe 使用 `getCurrentMessageId()`。

### ST-Prompt-Template `@@iframe`

```text
EJS render context.message_id/swipe_id
→ 序列化到 data-* 或初始化 JSON
→ child 读取显式数值 ID
→ 需要宿主动作时探测 window.parent.TavernHelper / SillyTavern
→ pagehide 主动 stop namespace 事件
```

`@@iframe` 只在消息渲染有 `msgId` 时建立；它不注入 TH 裸绑定函数。当前 iframe 无 sandbox，是同源高权限页面，既可访问父页也必须按高权限页面审计。

### 纯 SillyTavern

只承诺静态 Markdown/净化 HTML；任何按钮、脚本和变量写入均判定为不可用，提供文本回退。

## 数据闭环

先确定：

```text
真实数据源
→ provider 专用数值楼层与 Swipe
→ 读取 API
→ 持久化后刷新事件
→ 玩家动作写入点
→ 保存能力
→ 同楼读回
→ 空态/错误/卸载
```

MVU UI：等待 Mvu（带项目超时），读取明确数值楼层的完整 MvuData。不能使用 `'current'`；`'latest'` 只作只读容错，关键写入不用它。

非 MVU UI：使用真实消息载荷合同。复杂载荷优先通过消息 API读取原消息，避免把任意捕获值拼入脚本源码。

正式模式不读取 `window.__MOCK__` 一类预览对象。预览数据只能由显式 preview 开关启用。

## MVU 事件时序

```text
VARIABLE_UPDATE_ENDED
→ Schema/Zod 后处理
→ 消息变量写入
→ assistant 正文 setChatMessages(..., {refresh:'affected'})
→ refreshOneMessage / CHARACTER_MESSAGE_RENDERED
→ 消息 iframe 通常重建
```

所以：

- 不在 `VARIABLE_UPDATE_ENDED` 回调中立即 `getMvuData()`；
- assistant 更新依靠后续消息重渲染与 iframe 重建；新实例启动时读取最终值；
- 按钮写入由按钮自己的 await/save/readback 链直接 render；
- `MESSAGE_UPDATED/MESSAGE_SWIPED` 用于宿主编辑与切页，不当作 MVU 完成保证；
- user 消息只写变量时需要项目自有 post-write 事件（含 message ID/最终快照）或显式刷新；
- 若使用 MVU 事件，只消费 payload、设置 dirty 或展示瞬时变化，不把它称作保存完成。

## 写入与保存

变量写入必须区分：

```text
write_accepted：同一数值楼层即时读回成功
persisted：显式保存完成；必要时重载后再次读回
```

`Mvu.replaceMvuData/replaceVariables` 当前可能同步返回并防抖保存。`await` 它们不等于等待磁盘。关键按钮或不可丢失信息在写入后调用目标 provider 的已验证保存能力；普通低风险交互可以接受防抖保存，但反馈文案只说“已写入当前聊天”，不虚构已经刷新耐久验证。

## 生命周期

- 每次挂载重新取得当前楼层/Swipe；
- 当前楼消息更新或 Swipe 后重新读取；
- 聊天切换通常由宿主销毁旧实例，但仍不跨实例保存旧 DOM；
- `pagehide` 清理 timer、Observer、音频、AbortController 和外部订阅；
- TH 裸 `eventOn()` 自动随实例清理；通过 parent namespace 注册的事件必须主动 stop；
- 不扫描并无差别 reload 父页全部 iframe。

普通 fenced iframe 在消息完整后建立。确需流式应用时，单独选择并验证 TH 流式渲染或脚本接管路线。

## 玩家动作

按优先级：

```text
已验证高层 API
→ SillyTavern context
→ 父页 DOM + 原生 input/change/click 事件
→ 复制文本
```

所有动作防重复点击，等待宿主结果，并给自然中文成功/失败反馈。输入框写入只代表准备发送，不代表消息已发送或状态已改变。`generate/generateRaw` 返回文本，不会自动建立聊天楼层。

## 体验

- 窄屏、长中文、触控和滚动可用；
- 空态、加载、损坏和宿主不可用有明确文案；
- 静态设定与实时状态视觉上可区分；
- 不创建聊天外层页面级常驻面板。

## Provider 专用隔离与尺寸

隔离规则按载体决定，不把 inline HTML 与 iframe 混为一谈：

- **纯 ST 静态 HTML**：没有独立文档，避免全局 `id`、全局样式和可能影响消息外节点的选择器；优先内联样式或项目唯一前缀，不能依赖脚本补救。
- **TH/STPT iframe**：`body`、`:root`、`*` 和普通标签选择器只作用于当前 iframe，可以正常使用；仍需避免无理由访问父页 DOM、全局注册不清理的 namespace 事件或跨实例保存父页节点。
- **页面级扩展**：只有用户明确要求时进入，使用完整命名空间、宿主样式审计和独立卸载合同。

iframe 尺寸根据真实 provider 验证。不要机械禁用或强制 `vh`、`min-height`、`overflow:auto`；检查的是是否导致父消息异常高、双重滚动、横向溢出、内容被裁切或手机软键盘不可用。优先正常文档流、宽度自适应和明确的内部滚动区域；超长内容提供折叠、分页或加载更多。

## 信息与组件选择

先用玩家任务决定组件，不为“像应用”堆控件：

- 当前最紧迫的 2-4 项事实放首屏；
- 稳定设定与当楼状态视觉分开；
- 次要详情、历史和长列表进入折叠、Tab 或次级区；
- 主要动作靠近其影响的数据，并写明动作结果；
- 数值只有确实影响选择时使用进度条、区间或变化提示；
- 同一信息不在多个卡片重复展示。

字段语义与组件匹配时优先考虑：

| 信息 | 推荐组件 | 必要合同 |
|---|---|---|
| 血量、进度、信任、倒计时 | 数值＋进度/区间 | 可见数字；`role=progressbar` 时提供 min/max/now |
| 状态、库存、警报 | 徽章/短标签 | 文字或符号，不只靠颜色 |
| 多值标签、能力、条件 | chip 列表 | 空数组有“无/未记录” |
| 多项数值对比 | 条形图＋文字数值 | 负值、零值和最大值规则明确 |
| 事件、日程、历史 | 时间线/列表 | 时间缺失和排序规则明确 |
| 人物关系 | 关系卡/邻接列表 | 不把关系数值等同服从或恋爱 |
| 大量物品、任务、线索 | 搜索/筛选/分页列表 | 结果数、空结果和恢复入口 |
| 动作建议 | `button type=button` | 说明写入输入框、发送消息或修改状态中的哪一种 |

组件只有在降低理解或操作成本时才使用；一旦使用，就必须满足数据兜底、键盘、触控、文本含义和失败降级。普通三项信息不需要为了模板完整加入十二种组件。

## 无障碍与交互

所有玩家动作和复合组件按实际使用检查：

- 原生按钮优先，图标按钮有中文可见文字或 `aria-label`；
- 可交互元素有可见 `:focus-visible`，不使用无替代的 `outline:none`；
- Tab 使用 `tablist/tab/tabpanel`、`aria-selected` 和 roving tabindex；左右键移动，Enter/Space 激活；
- 折叠触发器使用 button、`aria-expanded` 和 `aria-controls`；
- 弹层/详情如存在，Esc 关闭、焦点进入合理位置，关闭后返回原触发元素；
- 状态、保存、结果数量和错误提示使用合适的 `aria-live=polite`，紧急错误才使用 assertive；
- 进度、星级、图表和状态不只靠颜色表达，始终保留数字、文字或符号；
- hover 信息必须同时可点按或聚焦取得；
- 触控命中区域按实际手机检查，关键按钮通常不小于约 40px 高；
- 动效尊重 `prefers-reduced-motion`，关闭动画后功能仍完整；
- 重复点击、处理中、成功、冲突和失败状态可区分；
- 输入框写入、消息发送和状态持久化使用不同反馈文案。

## 响应式与长内容

- 移动优先；窄屏不隐藏关键状态和主要动作；
- 中文长词、数字、英文 ID、路径和 URL 可换行或有受控滚动；
- 非刻意设计不产生整页横向滚动；
- 软键盘打开时输入和确认按钮仍可操作；
- 列表为空、搜索无结果、字段损坏和整页无数据都有自然中文状态；
- 复杂布局至少检查窄屏、常规宽度、超长文本和最大合理列表。

长列表超过项目阈值时使用分页或加载更多，不静默截断。搜索/筛选通常使用 150-250ms debounce；筛选、翻页和折叠优先局部更新，不为一次输入重建整个页面和所有宿主监听。大批量节点使用 DocumentFragment、一次性 DOM 构建或等价方式，避免循环中频繁回流。

阈值由真实数据规模决定，不把“30 条”变成所有项目的绝对规则。性能降级不能删除承重信息；无法展示全部时说明总数、当前范围和继续查看方法。

## 主题、资产与降级

颜色、间距、圆角、阴影和语义色使用页面内 CSS variables 统一管理。主题切换只在用户需要时加入：

- 只修改当前 iframe/作用域属性；
- 两套主题分别检查文字、边框、图标和状态对比度；
- localStorage 使用项目唯一 key 和 try/catch；
- 存储不可用时退回当前会话主题，不阻断页面。

远程字体、图标、图片或脚本遵守 `shared/frontend/ui-assets.md`。远程失败时保留系统字体、文字按钮、内联 SVG/CSS 或可读空态；不能让装饰资源成为核心操作的单点故障。

## 调试与可观测性

复杂动态页面保留低噪声诊断信息，默认不向玩家暴露完整载荷：

- 日志前缀含项目/页面标识；
- 可选 `DEBUG=false`，关闭时只输出关键 warning/error；
- 记录 provider、message ID、swipe ID、协议版本、读取/解析/渲染阶段和清理；
- 解析失败指出阶段、字段或版本，不把完整私密消息内容写进 console；
- UI 错误态显示玩家能执行的下一步，例如重试、切回当前 Swipe、启用依赖或复制动作文本；
- 开发预览和正式宿主模式明确区分，正式模式不因读取失败自动使用 fixture/mock。

## 交付检查

确认：完整 HTML、真实载体、provider adapter、正则 fence 或 `@@iframe` 路由、数据源、数值楼层、保存/读回、空错态、按钮、生命周期和宿主依赖。没有真实宿主证据时写 `runtime: not_run`。

## 建议式 UI 访谈

不要先问颜色、框架或组件清单。先提出信息优先级和主要动作的推荐：玩家一眼要知道哪三件事、看完后最常做什么、哪些内容适合折叠、手机上什么不能丢。解释为何减少认知负担，并说明它会怎样影响布局、数据读取、交互与运行依赖。

至少用加载中、无数据、保存失败、窄屏、长文本、Swipe 变化中的两个情境校准真实 HTML。
