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

这条路线不要求 Tavern Helper，但只能承诺静态显示。SillyTavern 会在正则后执行 Markdown 与 DOMPurify；消息中的 `<script>` 不会作为独立应用运行。

适合：标题、卡片、表格、简单字段展示。捕获组可直接组成静态 HTML，但所有值仍按不可信文本转义。

### 2. Tavern Helper 动态 iframe

```text
模型输出标记/载荷
→ display 正则替换为 fenced HTML 代码块
→ SillyTavern Markdown 生成 <pre><code>
→ Tavern Helper 识别代码块
→ 建立消息 iframe
```

正则替换内容必须类似：

````text
```html
<!doctype html>
<html lang="zh-CN">
<head>...</head>
<body>...</body>
</html>
```
````

完整 `.html` 文件是可维护源码；真正放入正则的运行内容还要包含外层 fence。导入说明必须声明 Tavern Helper 版本和渲染器依赖。

### 3. ST-Prompt-Template `@@iframe`

EJS 世界书条目可使用 `@@iframe` 让 ST-Prompt-Template 建立 srcdoc iframe。该 iframe 不自动等同 Tavern Helper 消息 iframe，也不自动获得 Tavern Helper 裸绑定函数；需要宿主动作时仍做能力探测。

## 数据传输

### 消息 API读取（优先用于复杂载荷）

Tavern Helper 消息 iframe 中使用数值 `getCurrentMessageId()`，再用 `getChatMessages(id)` 读取原始消息并解析外层标签。这样不需要把任意文本拼进 HTML 源码。

### 捕获组注入

仅在载荷可安全编码时使用。未经编码的 `$1` 可能包含：

- `</textarea>`；
- Markdown fence；
- 引号、反斜线、美元符号；
- HTML 或脚本终止序列。

推荐让模型输出 Base64 不现实；更常见的做法是由正则捕获有限字符集字段，或把结构化载荷做项目级转义后放入 `<textarea>`，并在解析器中还原。生产合同、fixture、正则和解析器必须共享同一协议。

不要把任意模型文本直接插入 JavaScript 字符串、模板字符串、属性或 `<script>`。

## message contract

每个表面明确：

```yaml
data_route: message_capture
carrier: tavern_helper_fenced_html   # core_static_html / tavern_helper_fenced_html / ejs_iframe
outer_tag: 雾港状态
payload: structured_xml
source: 常驻世界书输出规则
current_message: numeric_iframe_id
partial_stream: hide_until_closed
prompt_channel: compact_summary
empty_policy: 显示加载/空态/错误态
```

动态前端正式运行不读取 mock。普通浏览器预览可以显式设置 preview 数据，但宿主模式读取失败时只能显示不可用。

## 生命周期

Tavern Helper 消息 iframe：

- `getCurrentMessageId()` 只在消息 iframe 调用；
- 监听编辑、Swipe 或消息更新时，只处理当前数值楼层；
- 页面重建后重新读取；
- `pagehide` 停止 timer、Observer 和外部监听；
- 不长期持有父页 DOM；
- 按钮动作等待结果并给成功/失败/复制回退。

本体流式静态重绘、完整消息后建立 iframe、专门脚本接管流式表面是三条不同路线。普通 fenced iframe 不自动承诺增量稳定运行。

## 正则套件

按项目需要分别设计：

1. display：静态替换或 fenced HTML；
2. prompt：删除、压缩为语义摘要或保留历史；
3. 流式半块：闭合前隐藏或静态容忍；
4. 旧楼深度；
5. 编辑与 `runOnEdit`。

`runOnEdit:true` 会在编辑保存时将正则结果写回原始消息，动态 UI 规则通常不应机械开启。

## 完成判定

- 载体 provider 和版本明确；
- 动态前端实际形成 iframe，而不是只有裸 HTML；
- marker、载荷、解析器和 prompt/display 规则闭合；
- 模型载荷不会破坏 fence 或 HTML；
- 无 mock 冒充运行状态；
- 编辑、Swipe、重载和失败态可解释；
- 未实测时记录 `runtime: not_run`。
