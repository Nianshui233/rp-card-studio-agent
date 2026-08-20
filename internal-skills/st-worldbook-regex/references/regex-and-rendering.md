# 世界书、Tavern Regex 与消息渲染

正则是文本变换层，不是数据源、MVU 引擎或 iframe 创建器。每条规则先明确 provider、输入来源、目标通道和后续载体。

## 角色卡原始字段

`data.extensions.regex_scripts` 使用：

```text
id
scriptName
findRegex
replaceString
trimStrings
placement
disabled
markdownOnly
promptOnly
runOnEdit
substituteRegex
minDepth
maxDepth
```

当前 placement：

```text
1 USER_INPUT
2 AI_OUTPUT
3 SLASH_COMMAND
5 WORLD_INFO
6 REASONING
```

`first_mes` 和 alternate greetings 属于 AI_OUTPUT。

Tavern Helper 高层 `getTavernRegexes()` 返回 snake_case 和 `source/destination` 对象，不能把它与上述存储结构混传。

## 执行通道

SillyTavern Core 当前正则顺序：

```text
GLOBAL → PRESET → SCOPED
```

角色 scoped regex 和 preset regex 还受 allowlist 控制。最终 QA 不只看规则存在，还检查：

- Regex 扩展总开关；
- 当前角色/预设允许执行；
- display 或 prompt；
- placement；
- 当前 depth；
- edit 标记；
- 前序规则变换结果。

Display、prompt、edit、Swipe 和 WORLD_INFO 的 depth/输入链不同，离线夹具不能用一个统一深度冒充全部宿主路径。

## 动态 HTML 载体

### 纯 SillyTavern

正则结果继续经过 Markdown 与 DOMPurify，适合静态 HTML。裸 `<script>` 不会因此执行，也不会获得独立页面生命周期。

### Tavern Helper

动态消息前端的 display 替换必须形成 fenced HTML：

````text
```html
<!doctype html>
<html>...</html>
```
````

SillyTavern 将 fence 变成 `<pre><code>` 后，Tavern Helper 才识别并创建 iframe。完整 `.html` 文件与正则 JSON 可以分件维护，但最终正则的 `replaceString` 必须包含真实 fence 和完整 HTML。

### EJS `@@iframe`

由 ST-Prompt-Template 创建 iframe，是另一条 provider 路线。不要写成“SillyTavern/Tavern Helper 都会自动渲染”。

## 标记与生产者

每条消费者正则必须反向找到生产者：

- first message；
- 常驻世界书输出规则；
- MVU 占位符；
- EJS 模板；
- Tavern Helper 脚本。

HTML 中提到标记不算生产者。

非 MVU 状态快照应由模型输出合同定义字段、顺序、缺省、转义和闭合规则。MVU 状态栏通常消费 `<StatusPlaceHolderImpl/>` 或项目自定义短标记，并从消息变量读取实时状态。

## prompt/display 分离

玩家看到 UI 不表示模型看不到其源文本。按实际需求：

- display：静态卡片或 fenced iframe；
- prompt：保留状态语义摘要、删除纯技术载体，或只保留最新快照；
- 更新块：由 MVU 自己的提示词过滤和项目 display 隐藏分别负责。

不要把 prompt-only 清理当玩家显示隐藏，也不要删除模型下一轮仍依赖的唯一状态。

## `runOnEdit`

SillyTavern 编辑保存时会以 `isEdit:true` 运行允许的正则，再把结果写回 `mes.mes` 和当前 Swipe。若 UI display 规则启用 `runOnEdit`，可能把 fenced HTML 永久写进原消息并在后续再次处理。

动态 UI 规则默认评估是否应关闭 `runOnEdit`。编辑 QA 同时检查原始聊天消息和最终 DOM。

## 捕获值安全

捕获载荷进入静态 HTML前做文本转义；进入动态前端源码前必须采用可逆编码或消息 API读取。`</textarea>`、反引号 fence、`</script>`、美元符号和反斜线都进入 fixture。

## 夹具

至少覆盖：

- 完整块与流式半块；
- 正文 + 更新块 + UI marker；
- 中文长文本、引号、反斜线、尖括号、美元符号、fence 终止序列；
- 当前楼与旧楼；
- edit 与 Swipe；
- allowlist 关闭时的现场检查；
- 不应命中的相似文本。

离线测试只能证明 JavaScript 替换语义。Markdown、DOMPurify、allowlist、真实 iframe 和生命周期必须在 SillyTavern 验证。
