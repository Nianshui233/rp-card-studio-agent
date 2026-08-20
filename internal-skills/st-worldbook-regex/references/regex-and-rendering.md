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

当前 placement（`engine.js` 数值；`0 MD_DISPLAY` 已废弃不使用）：

```text
1 USER_INPUT
2 AI_OUTPUT
3 SLASH_COMMAND
5 WORLD_INFO
6 REASONING
```

`first_mes` 和 alternate greetings 属于 AI_OUTPUT（加载时即过 AI_OUTPUT 正则）；旁白消息（`extra.type === narrator`）按 SLASH_COMMAND 处理。世界书条目位置枚举：`before:0 / after:1 / ANTop:2 / ANBottom:3 / atDepth:4 / EMTop:5 / EMBottom:6 / outlet:7`。

Tavern Helper 高层 `getTavernRegexes()` 返回 snake_case 和 `source/destination` 对象，不能把它与上述存储结构混传。

## 执行通道

SillyTavern Core 当前正则顺序：

```text
GLOBAL → SCOPED → PRESET
```

来源：`engine.js` 中 `SCRIPT_TYPES = { GLOBAL: 0, PRESET: 2, SCOPED: 1 }`，`getRegexScripts()` 按 `Object.values(SCRIPT_TYPES)` 遍历；三个键均为整数键，JS 按数值升序迭代为 0→1→2。对象字面量里 PRESET 写在 SCOPED 之前的声明顺序不参与执行。

角色 scoped regex 和 preset regex 还受 allowlist 控制（scoped 按 avatar 白名单、preset 按 `preset_allowed_regex[apiId]` 的预设名白名单）。

`getRegexedString` 内部判定顺序（`engine.js`）：

```text
1 通道门：markdownOnly&&isMarkdown 或 promptOnly&&isPrompt 或（双 false 且非 markdown 非 prompt）
  —— markdownOnly 与 promptOnly 同为 true 的规则三个条件都不满足，永远不执行
2 isEdit 且无 runOnEdit → 跳过
3 depth 在 min/max 区间内（depth 为数值时才检查）
4 placement.includes(当前placement) → 执行
```

替换细节（`runRegexScript`）：

- `substituteRegex`：`0` 不替换、`1` RAW 宏替换、`2` ESCAPED 宏替换（替换值按正则转义）；
- `replaceString` 中 `{{match}}` 等价 `$0`；支持 `$1`、`$<命名组>`；
- **`trimStrings` 作用于每个捕获组的匹配值**（`filterString` 逐组移除子串），不是作用于整体结果；
- 替换完成后 `replaceString` 再过一次本体宏（`substituteParams`）。

depth 语义：显示通道按**非 system 消息**从末尾计数（最后一条为 0）；编辑保存路径不传 depth，min/max 不生效；提示词通道同样按过滤后的非 system 消息从末尾计数，续写时整体右移。世界书条目只在提示词组装时应用 `WORLD_INFO` 正则（`isPrompt:true`，仅 atDepth 位置条目带 `entry.depth`），正则后为空的条目整条跳过。

## 渲染管线顺序（messageFormatting）

```text
0楼assistant消息宏替换（结果写回 chat[0].mes 永久固化；且每轮生成前都会重新替换）
→ display 正则（isMarkdown:true）
→ fixMarkdown / encode_tags
→ 引号与代码围栏保护
→ Showdown Markdown → HTML
→ DOMPurify 净化
```

提示词通道为：每轮对 `chat[0].mes` 重新宏替换 → 逐消息正则（`isPrompt:true`）→ reasoning 内容单独走 `REASONING` placement 正则。

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
