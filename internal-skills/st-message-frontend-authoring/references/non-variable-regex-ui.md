# 非 MVU 消息快照前端

这条路线让每条 AI 消息携带自己的结构化快照。先选真实载体，再设计数据合同；不能把裸 HTML 正则替换误当成可执行 iframe。

## 三种载体

### 1. 纯 SillyTavern 静态替换

```text
模型输出标记/字段
→ display Tavern Regex
→ 静态 Markdown 或净化后 HTML
→ .mes_text
```

这条路线不要求 Tavern Helper，但只能承诺静态显示。消息中的 `<script>` 不会作为独立应用运行。适合标题、卡片、表格和简单字段；所有捕获值仍按不可信文本转义。

### 2. Tavern Helper 动态 iframe

```text
模型输出标记/载荷
→ display 正则替换为 fenced HTML
→ SillyTavern Markdown 生成 <pre><code>
→ Tavern Helper 识别
→ 建立 TH 消息 iframe
```

正则替换必须类似：

````text
```html
<!doctype html>
<html lang="zh-CN">
<head>...</head>
<body>...</body>
</html>
```
````

完整 `.html` 文件是维护源码；真正放入正则的运行内容还要包含外层 fence。导入说明声明 Tavern Helper 版本和渲染器依赖。

### 3. ST-Prompt-Template `@@iframe`

EJS 世界书条目可使用 `@@iframe` 建立 srcdoc iframe，但只有消息渲染路径传入具体 `msgId` 时生效；generate-stage `getwi` 或普通世界书 EJS 不会因此自动建立 iframe。

该 iframe：

- 不自动等同 TH 消息 iframe；
- 不注入 TH 裸绑定函数；
- 由 EJS render context 显式提供 `message_id/swipe_id`；
- 当前实现无 sandbox，可通过 `window.parent` 探测同源宿主能力；
- 通过 parent namespace 注册的监听必须主动清理。

## 数据传输

### TH 消息 API读取

TH 消息 iframe 使用数值 `getCurrentMessageId()`，再用 `getChatMessages(id)` 读取原始消息并解析外层标签。

### STPT render context

在世界书 EJS 中把当前 `message_id/swipe_id` 和已安全编码的必要数据序列化进页面初始化对象或 `data-*`，child 不猜楼层，也不调用 `getCurrentMessageId()`。

### 捕获组注入

仅在载荷可安全编码时使用。未经编码的 `$1` 可能包含 `</textarea>`、Markdown fence、引号、反斜线、美元符号、HTML 或脚本终止序列。

不要把任意模型文本直接插入 JavaScript 字符串、模板字符串、属性或 `<script>`。优先使用消息 API读取原文；否则限定字符集、JSON 安全转义或项目级载荷协议，并让生产合同、fixture、正则和解析器共享同一规则。

## message contract

每个表面明确：

```yaml
data_route: message_capture
carrier: tavern_helper_fenced_html   # core_static_html / tavern_helper_fenced_html / ejs_iframe
outer_tag: 雾港状态
payload: structured_xml
source: 常驻世界书输出规则
message_identity: provider_numeric_message_id
swipe_identity: provider_current_swipe_id
partial_stream: hide_until_closed
prompt_channel: compact_summary
empty_policy: 显示加载/空态/错误态
```

动态前端正式运行不读取 mock。普通浏览器预览可显式设置 preview 数据，但宿主模式读取失败时只能显示不可用。

## 生命周期

TH 消息 iframe：

- `getCurrentMessageId()` 只在 TH 消息 iframe 调用；
- 监听编辑、Swipe 或消息更新时，只处理当前数值楼层；
- 页面重建后重新读取；
- `pagehide` 停止 timer、Observer 和外部监听；
- 不长期持有父页 DOM；
- 按钮动作等待结果并给成功/失败/复制回退。

STPT iframe：

- 楼层/Swipe 来自 render context；
- 不依赖 TH 自动清理；
- parent 能力变化或页面卸载时主动停止监听；
- 明确无 sandbox 的同源权限边界。

本体流式静态重绘、完整消息后建立 iframe、专门脚本接管流式表面是三条不同路线。普通 fenced/STPT iframe 不自动承诺增量稳定运行。

## 正则套件

按项目需要分别设计：

1. display：静态替换或动态载体；
2. prompt：删除、压缩为语义摘要或保留历史；
3. 流式半块：闭合前隐藏或静态容忍；
4. 旧楼深度；
5. 编辑与 `runOnEdit`。

`runOnEdit:true` 会在编辑保存时将正则结果写回原始消息，动态 UI 规则通常不应机械开启。

## 完成判定

- 载体 provider、触发阶段和版本明确；
- 动态前端实际形成 iframe，而不是只有裸 HTML；
- marker、载荷、解析器和 prompt/display 规则闭合；
- 楼层/Swipe 由对应 provider 提供，不跨 surface 猜测；
- 模型载荷不会破坏 fence 或 HTML；
- 无 mock 冒充运行状态；
- 编辑、Swipe、重载、清理和失败态可解释；
- 未实测时记录 `runtime: not_run`。
