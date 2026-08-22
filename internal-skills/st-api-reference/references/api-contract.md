# SillyTavern 运行 API 合同

只核对当前实现实际调用的接口。调用代码必须明确 `provider`、目标版本、调用表面、精确参数、返回值、内存副作用、耐久持久化、失败表现和回退；不能把第三方接口写成 SillyTavern 本体能力。不要为这些事实创建独立 API 注册表、能力矩阵副本、接口清单或版本账本。

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

当前 Core `getContext()` 可按项目需要读取 `chat`、`characters`、`eventSource`、`eventTypes`、`generate`、`generateQuietPrompt`、`setExtensionPrompt`、`updateMessageBlock`、`callGenericPopup`、`loadWorldInfo`、`saveWorldInfo`、`getWorldInfoPrompt`、`Popup/POPUP_TYPE/POPUP_RESULT`、`substituteParams`、`substituteParamsExtended`、`SlashCommandParser`、`tokenizers`、`chatMetadata`、`reloadCurrentChat`、`saveChat` 等现场字段。只保存需要的函数引用，不序列化整个 context。

以下名称**不属于当前 Core `getContext()` 合同**：

- `generateRaw`：Tavern Helper 高层函数；
- `getWorldInfoNames`：当前 Core context 无此字段；
- `variables.local/global`：属于 ST-Prompt-Template/EJS 或其他变量表面，不是 Core context 字段；
- 独立 `swipe` 字段：当前 context 无此字段；
- `writeExtensionField`：Tavern Helper 在自己的 `window.SillyTavern` 代理中额外加入，不是纯 Core 字段，且不应用它替代角色卡扩展字段的完整更新接口。

本体事件使用 `eventSource.on/once/makeFirst/makeLast/removeListener/emit`。本体没有 Tavern Helper 的 `eventOn()`、`eventClearAll()` 或自动按 iframe 清理合同。

`setExtensionPrompt` 当前签名按目标版本核对：

```text
setExtensionPrompt(key, value, position, depth, scan = false, role = SYSTEM, filter = null)
```

它修改当前运行时注入，不等于写入角色卡或聊天文件。

### `tavern_helper`

Tavern Helper 消息 iframe 和脚本 iframe会把高层函数注入为当前 window 的裸函数，同时提供 `window.TavernHelper`。二者属于同一 provider，但部分裸函数是带 iframe 上下文的 `_bind` 包装，不能假定与 namespace 调用语义完全相同。

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
- 世界书：`getWorldbookNames`、`getGlobalWorldbookNames`、`rebindGlobalWorldbooks`、`getWorldbook`、`createWorldbook`、`createOrReplaceWorldbook`、`replaceWorldbook`、`updateWorldbookWith`、`createWorldbookEntries`、`deleteWorldbookEntries`、`getCharWorldbookNames`、`rebindCharWorldbooks`、`getChatWorldbookName`、`getOrCreateChatWorldbook`、`rebindChatWorldbook`；
- 正则：`formatAsTavernRegexedString`、`getTavernRegexes`、`replaceTavernRegexes`、`updateTavernRegexesWith`；
- 生成：`generate`、`generateRaw`、`stopGenerationById`、`stopAllGeneration`；
- 注入：`injectPrompts`、`uninjectPrompts`；
- 事件：`eventOn`、`eventOnce`、`eventMakeFirst`、`eventMakeLast`、`eventEmit`、`eventRemoveListener`、`eventClearEvent`、`eventClearListener`、`eventClearAll`。

关键限制：

- `getCurrentMessageId()` 只能在 Tavern Helper 消息 iframe 调用；脚本 iframe 中会抛错；
- 消息变量 `message_id` 只接受数值或 `'latest'`，不接受 `'current'`；负数是物理消息数组的末尾索引；
- `'latest'` **读写不对称**：`getVariables` 读取最后一个非 system 消息，而 `replaceVariables` 及其派生写函数会把 `'latest'` 归一化为物理 `-1`，可能写入末尾 system 消息；因此 `'latest'` 只作容错只读，关键写入使用明确数值 ID；
- 所有变量函数 `option` 默认 `{type:'chat'}`——读楼层必须显式 `{type:'message', message_id}`；
- 脚本 iframe 的裸 `getVariables({type:'script'})` 会补当前脚本 ID；直接调用 `TavernHelper.getVariables({type:'script'})` 时需显式传 `script_id`；
- `ChatMessage.data` 映射当前 Swipe 的消息变量（按 `variables[swipe_id]` 存储），`extra` 才是普通附加信息；
- `retrieveDisplayedMessage()` 只改临时 DOM；持久正文使用 `setChatMessages()`；只有显式 `swipe_id` 是确定的 Swipe 选择指令，`swipes/swipes_data/swipes_info` 主要替换对应数组；
- `createChatMessages` 新代码使用 `{insert_before}`，`insert_at` 只是 deprecated 兼容别名；直接插入 user 楼不等于走正常发送与 AI 生成链；
- `replaceVariables` 当前返回 `void` 并触发防抖保存。紧接着同楼读回只证明内存写入已接受，不证明聊天文件已耐久保存；关键事务另行 `await context.saveChat()` 并按需做重载后读回；
- `rebindCharWorldbooks`、聊天书读取/重绑当前版本只操作 `'current'`；旧 `getLorebookEntries` 族已 deprecated，新实现优先 `getWorldbook/updateWorldbookWith/createWorldbookEntries/deleteWorldbookEntries`；
- Tavern Helper 高层正则对象使用 snake_case，角色卡 `data.extensions.regex_scripts` 使用 camelCase，不能直接混传；
- `injectPrompts` 返回 `{uninject}` 并注册 TH iframe 的 `pagehide` 自动清理；
- `generate/generateRaw` 是独立模型请求，只返回文本或工具调用结果，不自动创建真实 user/assistant 楼，也不自动把结果写入 chat。

### `mvu`

先等待目标全局并设置项目自己的超时：

```text
iframe 裸 waitGlobalInitialized('Mvu') + timeout
→ 解析当前消息 ID 或明确数值楼层
→ Mvu.getMvuData({type:'message', message_id})
→ 读取 stat_data
```

`TavernHelper.waitGlobalInitialized` 与 iframe 裸 `waitGlobalInitialized` 属于同一 provider 的不同表面：前者只等全局存在；后者还为 iframe 绑定 getter，并在 `Mvu` 路线上等待第 0 楼 `stat_data`（内部等待错误会被吞掉）。全局尚不存在时的事件等待没有外部超时，因此项目仍需 `Promise.race`、错误态和重试。

注意 `Mvu.getMvuData` 的 `option.type` **默认 `'chat'`**。读楼层必须显式 `type:'message'`；关键写入同样使用明确数值 ID。

常用接口：

```text
Mvu.getMvuData(option)
Mvu.replaceMvuData(data, option)
Mvu.parseMessage(text, oldData)
Mvu.isDuringExtraAnalysis()
Mvu.events.*
```

当前 `Mvu.replaceMvuData` 委托同步 `replaceVariables`；`await` 它不等于等待磁盘保存完成。

MVU 事件是变换阶段事件，不是持久化完成事件：

```text
VARIABLE_INITIALIZED(variables, swipe_id)                 # 开场更新命令和 swipes_data 写入之前
VARIABLE_UPDATE_STARTED(variables)                        # 仅一个参数
COMMAND_PARSED(variables, commands, message_content)
VARIABLE_UPDATE_ENDED(variables, variables_before_update) # Schema 调和与消息变量写入之前
BEFORE_MESSAGE_UPDATE({variables, message_content})
```

UI 不用 `VARIABLE_UPDATE_ENDED → 立即 getMvuData()` 冒充持久化后刷新。自己发起的写入在明确保存后读回；assistant 自动更新随后 `setChatMessages(..., {refresh:'affected'})`，经 `refreshOneMessage` 发 `CHARACTER_MESSAGE_RENDERED` 并通常重建消息 iframe。user 消息只写变量时没有同等重渲染保证，需要项目协调器在真实写入/保存后发带 message ID 的 post-write 信号或显式刷新。`MESSAGE_UPDATED` 可处理其他宿主更新，但不是 MVU 保证的完成事件。

`registerVariableSchema()` 只服务 Tavern Helper 变量管理器 UI；不能替代 MVU 内部 Schema、`registerMvuSchema()` 或 MVU 数据读写。

### `st_prompt_template`

EJS 模板内可用 `getvar/setvar/getwi/activewi/define/activateRegex/injectPrompt` 等函数。公开 API 位于 `globalThis.EjsTemplate`：

```text
EjsTemplate.prepareContext(context = {}, end = -1)
EjsTemplate.evalTemplate(code, context = null, options = {})
EjsTemplate.compileTemplate(content, options = {}, thisData = {})
EjsTemplate.getSyntaxErrorInfo(code, count = 4)
EjsTemplate.getFeatures()
EjsTemplate.saveVariables(force?)
EjsTemplate.refreshWorldInfo()
```

ST-Prompt-Template `1.17.8.1` 的关键默认值：

```text
raw_message_evaluation_enabled = true
sandbox = false
autosave_enabled = false
```

因此模型或用户消息中的 EJS 默认可能在首次真实渲染时执行并改写 `message.mes`；不能声称默认不执行模型可控 EJS。除非项目明确需要该行为，否则关闭 raw-message evaluation；sandbox 只作额外缓解，不是“不执行不可信代码”的替代品。

生成和渲染结束会调用 `checkAndSave()`，但默认 `autosave_enabled:false`，所以默认不会由该调用实际保存变量。关键持久化显式启用 autosave 或调用 `saveVariables(true)`。

`@@iframe` 只在消息渲染路径有 `msgId` 时包装。它不注入 Tavern Helper 裸函数，但当前实现创建的是无 `sandbox` 的同源 `srcdoc` iframe，页面通常仍可通过 `window.parent` 探测父页能力；这既是可用的高权限回退，也是必须明确验收的安全边界。

ST-Prompt-Template 不会自动把 MVU `stat_data` 注入为 EJS 顶层变量。任何 MVU→EJS bridge 都要有真实脚本生产者和读回证据。

当前补充 `.d.ts` 有滞后：`evalTemplate` 被误写为 `evaltemplate`，且漏少量 runtime exports。发生冲突时以目标版本 `src/modules/exports.ts` 的真实 export 为准并在实现附近注明。

## 事件族不能混用

Tavern Helper 自己的生成事件：

```text
iframe_events.GENERATION_STARTED(generation_id)
iframe_events.STREAM_TOKEN_RECEIVED_FULLY(full_text, generation_id)
iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY(delta, generation_id)
iframe_events.GENERATION_ENDED(text, generation_id)
```

SillyTavern 本体 `tavern_events.GENERATION_*` 的 payload 不同；本体 `STREAM_TOKEN_RECEIVED` 通常是当前完整文本。项目必须按实际事件族写回调签名。

主动生成时为每个动作设置唯一 `generation_id`，流式监听按 ID 过滤，单请求停止优先 `stopGenerationById(id)`。主动生成结果若要进入聊天，另行走经过验证的消息创建/正常发送与持久化路径。

## 证据呈现

接口来源、目标版本和运行结果只需在实际实现附近保持可追溯，并在最终 QA 报告中简短说明关键调用属于 `source_checked`、`runtime_pass` 或 `not_run` 以及失败回退。不要生成单独的 API 合同实例、证据 YAML、调用登记表或逐接口核验日志。
