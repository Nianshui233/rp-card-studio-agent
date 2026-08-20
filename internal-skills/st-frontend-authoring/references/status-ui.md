# 持续消息 UI

持续消息 UI 用于状态、物品、关系、任务、地图、线索和行动。开场/创角页面与持续楼层页面分别设计。

## 访谈与实现

围绕玩家最常看或操作的信息、设备、视觉方向和交互强度多轮询问；每次回答后立即修改真实 HTML。用户放权时直接选择。

最终维护完整、自包含 `.html`，但还必须说明它由哪种宿主载入：

```text
Tavern Helper fenced HTML
ST-Prompt-Template @@iframe
纯 SillyTavern 静态 HTML
其他已验证载体
```

完整 HTML 文件本身不保证消息中的 JavaScript 会执行。

## 数据闭环

先确定：

```text
真实数据源
→ 当前数值楼层与 Swipe
→ 读取 API
→ 刷新事件
→ 玩家动作写入点
→ 同楼读回
→ 空态/错误/卸载
```

MVU UI：等待 Mvu（带项目超时），在消息 iframe 取得数值 `getCurrentMessageId()`，读取 `MvuData.stat_data`。无法取得楼层时显示不可用；不使用 `'current'`。

非 MVU UI：使用真实消息载荷合同。复杂载荷优先通过 Tavern Helper 消息 API读取原消息，避免把任意捕获值拼入脚本源码。

正式模式不读取 `window.__MOCK__` 一类预览对象。预览数据只能由显式 preview 开关启用。

## 生命周期

消息 iframe：

- 每次挂载重新取得当前楼层；
- 当前楼消息更新/Swipe 后重新读取；
- 聊天切换通常由宿主销毁旧实例；
- `pagehide` 清理 timer、Observer、音频和外部订阅；
- Tavern Helper `eventOn()` 的监听会自动随实例清理，但仍保存返回的 `stop` 便于主动停止；
- 不扫描并无差别 reload 父页全部 iframe。

普通 fenced iframe 在消息完整后建立。若确实需要流式应用，单独选择并验证酒馆助手流式渲染或脚本接管路线。

## 玩家动作

按钮按优先级：

```text
已验证高层 API
→ SillyTavern context
→ 父页 DOM + input/change 事件
→ 复制文本
```

所有动作防重复点击，等待宿主结果，并给自然中文成功/失败反馈。变量写入必须读回；输入框写入只代表准备发送，不代表状态已改变。

## 体验

- 窄屏、长中文、触控和滚动可用；
- 空态、加载、损坏和宿主不可用有明确文案；
- 静态设定与实时状态视觉上可区分；
- 不创建聊天外层页面级常驻面板。

## 交付检查

确认：完整 HTML、真实载体、正则 fence 或 `@@iframe` 路由、数据源、数值楼层、空错态、按钮、生命周期和宿主依赖。没有真实宿主证据时写 `runtime: not_run`。
