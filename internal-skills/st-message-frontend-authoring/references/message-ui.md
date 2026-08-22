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

## 交付检查

确认：完整 HTML、真实载体、provider adapter、正则 fence 或 `@@iframe` 路由、数据源、数值楼层、保存/读回、空错态、按钮、生命周期和宿主依赖。没有真实宿主证据时写 `runtime: not_run`。

## 建议式 UI 访谈

不要先问颜色、框架或组件清单。先提出信息优先级和主要动作的推荐：玩家一眼要知道哪三件事、看完后最常做什么、哪些内容适合折叠、手机上什么不能丢。解释为何减少认知负担，并说明它会怎样影响布局、数据读取、交互与运行依赖。

至少用加载中、无数据、保存失败、窄屏、长文本、Swipe 变化中的两个情境校准真实 HTML。
