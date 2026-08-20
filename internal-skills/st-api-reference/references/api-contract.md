# SillyTavern 运行 API 合同

只登记项目实际调用的接口。每项调用都写明 `provider`、核对版本、调用表面、精确参数、返回值、持久化效果、失败表现和回退；不能把第三方接口写成 SillyTavern 本体能力。

## 当前静态核对基线

- SillyTavern Core：`1.18.0`；
- Tavern Helper / JS-Slash-Runner：`4.9.3`；
- ST-Prompt-Template：`1.17.8.1`；
- MagVarUpdate：以目标 bundle 与现场能力为准，不能使用其长期不变的 `package.json` 版本号推断功能。

版本源码核对只能证明签名来源。导入、挂载、写入、渲染和持久化仍需真实宿主证据；未运行时记录 `runtime: not_run`。

## Provider 与调用表面

### `sillytavern_core`

常见入口是当前页面或 Tavern Helper 注入的 `window.SillyTavern` 代理：

```js
const context = window.SillyTavern?.getContext?.();
```

`getContext()` 是现场快照（`scripts/st-context.js`，下列字段均已逐一对源码核对），可按项目需要读取 `chat`、`characters`、`eventSource`、`eventTypes`、`generate`、`generateRaw`、`generateQuietPrompt`、`setExtensionPrompt`、`updateMessageBlock`、`callGenericPopup`、`loadWorldInfo`、`saveWorldInfo`、`getWorldInfoPrompt`、`getWorldInfoNames` 等字段，另有 `variables.local/global`、`swipe`、`Popup/POPUP_TYPE/POPUP_RESULT`、`substituteParams(Extended)`、`SlashCommandParser`、`tokenizers`、`writeExtensionField`、`chatMetadata`、`reloadCurrentChat`、`saveChat` 可用。只保存需要的函数引用，不序列化整个 context。

本体事件使用 `eventSource.on/once/makeFirst/makeLast/removeListener/emit`。本体没有 Tavern Helper 的 `eventOn()`、`eventClearAll()` 或自动按 iframe 清理合同。

`setExtensionPrompt` 当前签名按目标版本核对：

```text
setExtensionPrompt(key, value, position, depth, scan = false, role = SYSTEM, filter = null)
```

它修改当前运行时注入，不等于写入角色卡或聊天文件。

### `tavern_helper`

Tavern Helper 消息 iframe 和脚本 iframe 会把高层函数注入为当前 window 的裸函数，同时提供 `window.TavernHelper`。这两个入口属于同一注入面：

```text
当前 window 的裸绑定函数 / window.TavernHelper
→ 当前 window.SillyTavern 代理
→ 必要时 window.parent 或父页 DOM
→ 手动回退
```

常用接口族：

- 消息：`getChatMessages`、`setChatMessages`、`createChatMessages`、`deleteChatMessages`、`rotateChatMessages`；
- 显示：`retrieveDisplayedMessage`、`formatAsDisplayedMessage`、`refreshOneMessage`；
- 变量：`getVariables`、`replaceVariables`、`updateVariablesWith`、`insertOrAssignVariables`、`insertVariables`、`deleteVariable`、`registerVariableSchema`；
- 世界书：`getWorldbook`、`createOrReplaceWorldbook`、`replaceWorldbook`、`getCharWorldbookNames`、`rebindCharWorldbooks`、`getChatWorldbookName`、`rebindChatWorldbook`、`getLorebookEntries`；
- 正则：`formatAsTavernRegexedString`、`getTavernRegexes`、`replaceTavernRegexes`、`updateTavernRegexesWith`；
- 生成：`generate`、`generateRaw`、`stopGenerationById`、`stopAllGeneration`；
- 注入：`injectPrompts`、`uninjectPrompts`；
- 事件：`eventOn`、`eventOnce`、`eventMakeFirst`、`eventMakeLast`、`eventEmit`、`eventRemoveListener`、`eventClearEvent`、`eventClearListener`、`eventClearAll`。

关键限制：

- `getCurrentMessageId()` 只能在 Tavern Helper 消息 iframe 调用；脚本 iframe中会抛错；
- 消息变量 `message_id` 只接受数值或 `'latest'`，不接受 `'current'`；负数是从末尾起的索引，`'latest'` 会跳过 system 消息；
- 所有变量函数 `option` 默认 `{type:'chat'}`——读楼层必须显式 `{type:'message', message_id}`；
- 变量作用域包括 `global`、`preset`、`character`、`chat`、`message`、`script`、`extension`（extension 必填 `extension_id`）；
- 脚本 iframe 的裸 `getVariables({type:'script'})` 会补当前脚本 ID；直接调用 `TavernHelper.getVariables({type:'script'})` 时需显式传 `script_id`；
- `ChatMessage.data` 映射当前 Swipe 的消息变量（按 `variables[swipe_id]` 存储），`extra` 才是普通附加信息；
- `retrieveDisplayedMessage()` 只改临时 DOM；持久正文使用 `setChatMessages()`（它也可传 `swipe_id` 切换当前 Swipe）；
- `rebindCharWorldbooks`、聊天书读取/重绑当前版本只操作 `'current'`；`getLorebookEntries` 返回全部条目不按 disable 过滤；
- Tavern Helper 高层正则对象使用 snake_case，角色卡 `data.extensions.regex_scripts` 使用 camelCase，不能直接混传；
- `injectPrompts` 返回 `{uninject}` 并注册 `pagehide` 自动清理；`generate` 不传 `generation_id` 时自动生成，同 ID 重复请求抛错。

### `mvu`

先等待目标全局并设置项目自己的超时：

```text
waitGlobalInitialized('Mvu') + timeout
→ 解析当前消息 ID 或明确数值楼层
→ Mvu.getMvuData({type:'message', message_id})
→ 读取 stat_data
```

`waitGlobalInitialized` 无内建超时，项目自设超时。注意 `Mvu.getMvuData` 的 `option.type` **默认 `'chat'`**，读楼层必须显式 `type:'message'`。

常用接口：

```text
Mvu.getMvuData(option)
Mvu.replaceMvuData(data, option)
Mvu.parseMessage(text, oldData)
Mvu.isDuringExtraAnalysis()
Mvu.events.*
```

`registerVariableSchema()` 只服务 Tavern Helper 变量管理器 UI；不能替代 MVU 内部 Schema、`registerMvuSchema()` 或 MVU 数据读写。

### `st_prompt_template`

EJS 模板内可用 `getvar/setvar/getwi/activewi/define/activateRegex/injectPrompt` 等函数。公开 API 位于 `globalThis.EjsTemplate`：

```text
EjsTemplate.prepareContext(context = {}, end = -1)
EjsTemplate.evalTemplate(code, context = null, options = {})   # context 为 null 时自动 prepareContext
EjsTemplate.getSyntaxErrorInfo(code, count = 4)
EjsTemplate.getFeatures()
EjsTemplate.saveVariables(force?)    # 受 autosave 设置门控
EjsTemplate.refreshWorldInfo()
```

ST-Prompt-Template 不会自动把 MVU `stat_data` 注入为 EJS 顶层变量。任何 MVU→EJS bridge 都要有真实脚本生产者和读回证据。

## 事件族不能混用

Tavern Helper 自己的生成事件：

```text
iframe_events.GENERATION_STARTED(generation_id)
iframe_events.STREAM_TOKEN_RECEIVED_FULLY(full_text, generation_id)
iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY(delta, generation_id)
iframe_events.GENERATION_ENDED(text, generation_id)
```

SillyTavern 本体 `tavern_events.GENERATION_*` 的 payload 不同；本体 `STREAM_TOKEN_RECEIVED` 通常是当前完整文本。项目必须按实际事件族写回调签名。

主动生成时为每个动作设置唯一 `generation_id`，流式监听按 ID 过滤，单请求停止优先 `stopGenerationById(id)`。

## 证据记录

每个实际接口只需在当前实现或最终报告中简短记录：

```yaml
provider: tavern_helper
verified_version: 4.9.3
surface: message_iframe
api: getCurrentMessageId
result: source_checked | runtime_pass | not_run
fallback: 显示不可用，不猜测楼层
```
