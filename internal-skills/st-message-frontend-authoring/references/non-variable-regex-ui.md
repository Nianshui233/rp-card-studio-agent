# 非 MVU 消息快照与正文前端

这条路线让每条 assistant 消息携带自己的结构化快照，或把一段普通正文变成消息内排版。先选真实载体，再设计生产者、载荷、解析器和显示/提示词通道；不能把裸 HTML 正则替换误当成可执行 iframe。

## 先选路线

### 1. 纯 SillyTavern 静态替换

```text
模型输出受约束标记
→ display Tavern Regex
→ 静态 Markdown 或净化后 HTML
→ .mes_text
```

不要求 Tavern Helper，但只承诺静态显示。消息中的 `<script>` 不会作为独立应用运行，也没有自己的消息楼层 API、事件或卸载生命周期。

静态替换无法在 `replaceString` 中调用通用 HTML escape。捕获值直接进入 HTML 时，必须满足以下之一：

- 生产合同把字段限制为明确的纯文本字符集、长度和单/多行规则，正则使用同一限制并在越界时失败关闭；
- 明确允许经过 Showdown/DOMPurify 的有限 Markdown/HTML，并把这项能力和风险写进交付说明；
- 不把捕获值插入 HTML，改用纯文本前后缀；
- 改用动态 iframe，通过消息 API读取原文并用 `textContent` / DOM API 渲染。

不能一边允许任意模型文本，一边声称 `$1/$2` 直接插入 HTML 已被安全转义。DOMPurify 能净化危险标记，不等于能保证模型值只作为纯文本显示。

### 2. Tavern Helper 动态 iframe

```text
模型输出标记/载荷
→ display 正则替换为 fenced HTML
→ SillyTavern Markdown 生成 <pre><code>
→ Tavern Helper 识别
→ 建立 TH 消息 iframe
```

运行替换必须形成完整 fenced HTML：

````text
```html
<!doctype html>
<html lang="zh-CN">
<head>...</head>
<body>...</body>
</html>
```
````

完整 `.html` 文件是维护源码；实际正则 `replaceString` 内必须包含同一页面的 fence 和完整 HTML。导入说明声明 Tavern Helper 版本、所需后台 Script 和 `runtime` 证据。

TH 消息 iframe 使用数值 `getCurrentMessageId()`，通过 `getChatMessages(id, {include_swipes:true})` 取得当前 Swipe 原文和 `swipe_id`。复杂或自由文本载荷优先走此路线，不用捕获组把载荷拼进脚本源码。

### 3. ST-Prompt-Template `@@iframe`

EJS 世界书条目可使用 `@@iframe` 建立 srcdoc iframe，但只有消息渲染路径传入具体 `msgId` 时生效；generate-stage `getwi` 或普通世界书 EJS 不会因此自动建立 iframe。

该 iframe：

- 不自动等同 TH 消息 iframe；
- 不注入 TH 裸绑定函数；
- 由 EJS render context 显式提供 `message_id/swipe_id`；
- 当前实现无 sandbox，是同源高权限页面；
- 需要父页动作时显式探测 `window.parent` 能力；
- 通过 parent namespace 注册的监听必须在 `pagehide` 主动 stop。

### 4. 正文排版美化

适合小说段落、对话气泡、信件、日记、公告、论坛帖子和报告正文。它不把正文伪装成状态 Schema：

```text
正常正文外包唯一标记
→ display 路由读取完整正文
→ 按段落、对白、署名或项目明确的轻量结构排版
→ prompt 通道保留原始语义正文
```

纯 ST 只能做静态排版；需要折叠、搜索、复制、目录、注释或按钮时使用 TH/STPT iframe。正文必须作为文本渲染，不能因为某行看起来像 HTML 就执行其中标签、样式或事件。段落识别采用项目明确规则，例如空行分段、特定引号开头视为对白、固定分隔线视为署名；不要用脆弱的“猜测所有文体”解析器。

## 实际交付组件

不强制机械生成固定四文件，但一条结构化非变量路线必须能找到以下真实组件：

1. **生产者输出合同**：通常是世界书条目、角色提示词或其他实际 prompt，定义何时输出、外层标记和完整字段；
2. **载荷 fixture**：覆盖完整、缺失、非法、特殊字符和流式输入；
3. **消费者页面**：完整自包含 HTML 或静态替换；
4. **正则套件**：display、prompt、流式半块、深度和 edit 策略；
5. **运行载体**：动态页面需要真实 fenced HTML、`@@iframe` 或其他已验证 provider。

缺少生产者时，HTML 中写过 marker 不算输出合同；缺少运行载体时，裸 HTML 不算动态前端。组件可以合并进实际角色卡/世界书/正则 JSON，但不能只存在于说明文档。

## 生产者与载荷 Schema

生产者必须定义：

- `protocol_version`；
- 唯一 `outer_tag` 与可选技术 marker；
- 触发条件和每条消息最多输出几个载荷；
- 字段名、类型、必填/可选和最大合理长度；
- 列表项结构与最大合理数量；
- 缺失、空值、未知字段、重复字段和多块载荷策略；
- 字符转义、外层闭合和禁止附加内容规则；
- prompt 历史保留完整快照、紧凑摘要或只保留最新快照的策略；
- 当前消息与旧楼/旧 Swipe 的语义。

用户不需要填写 Schema。Agent 根据实际页面和模型可靠性选择最简单、可验证的协议，并把规则写进真实 producer 与 parser。

### 推荐：版本化 JSON 载荷

动态 iframe 通过消息 API读取原文时，优先考虑版本化 JSON：

```text
<航站状态 v="1">
{"区域":"北栈桥","天气":"小雨","任务":"核对灯标","提示":"外栈桥踏板松动","行动":[{"label":"核对灯标","text":"前往北栈桥核对灯标。"}]}
</航站状态>
<航站终端/>
```

合同至少声明：

- 标签体内只有一个合法 JSON object，不放 Markdown fence、注释或尾逗号；
- JSON 字符串中的引号、反斜线和换行遵守标准 JSON 转义；
- 字符串中的 `<`、`>`、`&` 使用 `\u003C`、`\u003E`、`\u0026`，避免值意外形成外层闭合或 HTML；
- parser 先核对协议版本，再 `JSON.parse`，然后逐字段规范化；
- 未知字段默认忽略；缺少可选字段使用空态；缺少承重必填字段显示“数据不完整”而非沿用上一楼；
- JSON 重复键按项目明确策略处理。若直接使用原生 `JSON.parse`，应写明“后值覆盖前值”或额外拒绝重复键，不能把偶然行为当未定义状态；
- 一条消息存在多个完整同版本载荷时，明确取第一个、最后一个或判定错误。状态快照通常取最后一个完整块；
- 列表项非法时丢弃该项并报告计数，不让一个坏项使整页空白；
- 所有文本最终使用 `textContent`、属性 API 或显式 escape 后的 HTML，不执行载荷中的标记、样式或事件。

JSON 不是强制格式。项目可以使用 XML、键值行或方括号协议，但必须提供同等级的版本、转义、缺失、重复、多块和 fixture 合同。

## 捕获组注入

仅在载荷已经由生产者可靠编码、消费者能安全解码，并有终止序列 fixture 时使用。未经编码的 `$1` 可能包含：

- `</textarea>`；
- Markdown fence；
- `</script>`；
- 引号、反斜线、美元符号；
- HTML、样式或事件属性；
- 与外层标签相同的闭合文本。

禁止把任意捕获内容直接插入 JavaScript 字符串、模板字符串、属性或 `<script>`。隐藏 textarea 也不是任意文本的安全边界：载荷中的 `</textarea>` 会提前结束元素。

如果不能证明编码闭环，使用 TH 消息 API读取原文，或把路线降级为受限静态文本。

## 消息身份与解析策略

每个动态表面明确：

```yaml
data_route: message_api
carrier: tavern_helper_fenced_html   # core_static / tavern_helper_fenced_html / ejs_iframe
outer_tag: 航站状态
protocol_version: 1
payload: json_object
source: 常驻世界书输出合同
message_identity: provider_numeric_message_id
swipe_identity: provider_current_swipe_id
multiple_payloads: last_complete
unknown_fields: ignore
missing_required: render_incomplete
partial_stream: hide_until_closed
prompt_channel: preserve_snapshot
empty_policy: 显示加载/空态/错误态
```

TH parser：

- 把 `getCurrentMessageId()` 转成 Number 并验证非负整数；
- 使用 `include_swipes:true` 取得当前 `swipe_id`，用于状态文案和 Swipe QA；
- 从当前消息原文提取符合版本的完整块；
- 不沿用其他楼或旧 Swipe 数据填补当前缺失；
- 对字段做类型、长度、数量和枚举规范化；
- 用 DOM 文本 API 渲染不可信字段；
- 解析失败时显示阶段、楼层和 Swipe，但不把完整隐私载荷写进错误 DOM 或普通日志。

STPT parser 使用 render context 提供的数值 ID，不调用 `getCurrentMessageId()`。

## 生命周期

TH 消息 iframe：

- 只在 TH 消息 iframe 调用 `getCurrentMessageId()`；
- 当前消息编辑、Swipe 或更新时重新读取；
- 页面重建后不沿用旧 DOM、旧 message ID 或旧 payload；
- `pagehide` 停止 timer、Observer、AbortController、音频和外部监听；
- TH 裸事件虽会自动清理，仍保存 `{stop}` 便于显式释放；
- 玩家动作防重复，等待结果，并给成功、冲突、失败或复制回退；
- 写入输入框只表示准备发送，不表示已经产生 user 楼或 AI 回复。

STPT iframe：

- 楼层/Swipe 来自 render context；
- 不依赖 TH 自动清理；
- parent 能力变化或页面卸载时主动停止监听；
- 明确无 sandbox 的同源权限边界。

本体流式静态重绘、完整消息后建立 iframe、TH Streaming 前端和后台脚本接管是不同路线。普通 fenced/STPT iframe 不自动承诺增量稳定运行。

## 正则套件

按项目实际需要分别设计：

1. display：受限静态替换或完整动态载体；
2. prompt：删除纯技术 marker，保留完整快照、摘要或最新有效状态；
3. 流式半块：闭合前隐藏或静态容忍；
4. 闭合载荷但技术 marker 尚未完成时的显示策略；
5. 当前楼和旧楼 depth；
6. edit 与 `runOnEdit`；
7. 相似但不应命中的标签；
8. 旧协议版本或非法载荷的失败方式。

`runOnEdit:true` 会在编辑保存时将正则结果写回原始消息。动态 UI display 规则默认关闭，除非项目明确需要并验证不会把 fenced HTML 永久写入消息。

## fixture 最低矩阵

结构化载荷至少覆盖：

- 完整有效块；
- 流式半块；
- 完整载荷但 marker 尚未输出；
- 缺少必填字段；
- 空列表与非法列表项；
- 引号、反斜线、换行、中文长文本、美元符号；
- `\u003C` / `\u003E` / `\u0026` 解码后的尖括号与连接符；
- Markdown fence 和 textarea/script 终止文本以编码形式出现；
- 多个完整载荷；
- 错误协议版本；
- 当前楼、旧楼、编辑和 Swipe；
- 相似但不应命中的 marker；
- allowlist 关闭时的真实宿主检查。

静态路线还要覆盖越界字符不匹配或安全降级。离线 fixture 只证明声明的正则替换和解析语义；Markdown、DOMPurify、allowlist、真实 iframe、Blob/srcdoc 和生命周期必须在 SillyTavern 验证。

## 完成判定

- provider、触发阶段和版本明确；
- producer、载荷 Schema、parser、fixture 与 display/prompt 规则使用同一标记和字段；
- 动态前端实际形成 iframe，不是裸 HTML；
- 静态捕获值的字符安全边界真实可证明，没有虚构 escape；
- 楼层/Swipe 由对应 provider 提供，不跨 surface 猜测；
- 模型载荷不会破坏 fence、textarea、script 或外层标签；
- 所有不可信文本通过 DOM 文本 API或真实转义渲染；
- 无 mock 冒充运行状态；
- 编辑、Swipe、重载、清理和失败态可解释；
- 正文美化保留原始语义，不把排版标签污染 prompt；
- 未实测时记录 `runtime: not_run`。
