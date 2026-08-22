# Tavern Helper 4.9.3 运行时参考

酒馆助手为角色卡提供两类 iframe：消息前端与后台脚本。它不是 SillyTavern 本体；任何依赖都要在导入说明中明确。本文核对自 `src/function/`、`src/iframe/predefine.js`、`src/util/is_frontend.ts`、`src/panel/render/`、`src/type/scripts.ts`。

## 消息前端载体

SillyTavern 本体先执行 display 正则、Markdown 和 DOMPurify。酒馆助手随后扫描消息 DOM 的 `<pre>`；**代码块文本包含子串 `html>`、`<head>` 或 `<body` 任一**（`is_frontend.ts`，注意 `<!doctype html>` 因含 `html>` 也符合；纯 `<div>` 不符合）时，取 `<pre><code>` 的 text 建立 iframe——`srcdoc` 或 Blob URL（用户设置可选，Blob 便于 F12 调试）。

因此动态前端的正则替换必须产出 fenced HTML 代码块：

````text
```html
<!doctype html>
<html>...</html>
```
````

裸 `<!doctype html>...<script>...` 只会进入本体消息格式化，不是酒馆助手 iframe 合同。流式期间有专用 Streaming 路径按同样条件增量识别；未渲染的代码块可显示“折叠前端代码块”按钮。

## iframe 注入面

每个 TH 消息/脚本 iframe 都被注入（`predefine.js`）：

- `window._`（lodash）与父页共享；
- 从父页 pick：`EjsTemplate`、`TavernHelper`、`YAML`、`showdown`、`toastr`、`z`；
- `TavernHelper._bind` 中的方法会以当前 iframe 为 `this` 注入裸函数；
- `window.SillyTavern` 动态 getter 代理，并额外加入 `writeExtensionField`；
- 父页已有 Mvu 时建立 `window.Mvu` getter；较晚初始化时由裸 `waitGlobalInitialized` 建立；
- `pagehide` 时自动 `eventClearAll()`，TH 裸事件监听随 iframe 卸载自动清理。

裸绑定函数与 `window.TavernHelper` 属于同一 provider，但不是所有函数都可无差别互换：

- 脚本 iframe 裸变量函数可自动补当前 `script_id`；namespace 调用必须显式传；
- iframe 裸 `waitGlobalInitialized('Mvu')` 会绑定当前窗口并等待第 0 楼状态；namespace 版本只等待父页全局存在。

## 身份与消息

- `getCurrentMessageId()` 仅 TH 消息 iframe 可用：按 iframe 名 `TH-message--N--M` 解析；脚本 iframe或 STPT iframe调用会失败。
- `getScriptId()` 仅 TH 脚本 iframe 可用（`TH-script--` 前缀）。
- 不要长期持有 `frameElement`；Firefox teardown 时会消失。TH 用 `__TH_IFRAME_ID` 缓存与 `window.name` 回退。
- `getLastMessageId()` 即 `{{lastMessageId}}` 宏。

`getChatMessages(range, {role, hide_state, include_swipes})`：

- `range` 接受数值或字符串（`'5'`、`'-3'`、`'2-5'`，支持宏；负数从物理末尾数，越界会 clamp）；
- `role: 'all'|'system'|'assistant'|'user'`、`hide_state` 过滤；旁白按 `extra.type === narrator` 归入 system；
- 返回 `ChatMessage`：`message_id / name / role / is_hidden / message（当前 Swipe 正文）/ data（当前 Swipe 消息变量）/ extra（当前 Swipe 附加信息）`；
- `include_swipes:true` 返回 `ChatMessageSwiped`，追加 `swipe_id / swipes / swipes_data / swipes_info`。

`setChatMessages(messages, {refresh})`：

- 写 `message` 同时落 `mes` 与 `swipes[当前Swipe]`；写 `data` 落 `variables[当前Swipe]`；写 `extra` 落 `swipe_info[当前Swipe]`；
- 显式 `swipe_id` 负责选择当前 Swipe；`swipes/swipes_data/swipes_info` 负责替换对应数组，数组缩短时可能间接 clamp 当前索引；
- `retrieveDisplayedMessage()` 只改临时 DOM；持久正文用 `setChatMessages()`；
- `refresh:'all'` 会等待保存并重载，`affected/none` 通常只触发防抖保存；需要耐久确认时不要把刷新完成等同磁盘保存。

`createChatMessages(array, {insert_before, refresh})`：每项至少 `role` + `message`，可带 `data/extra/name/is_hidden`。`insert_at` 仅是 deprecated 兼容别名。它直接插入消息并发 MESSAGE_SENT/RECEIVED 类事件，但不自动走正常 AI 生成链。

## 变量

`VariableOption`：

```text
{type:'global'|'preset'|'character'|'chat'}
{type:'message', message_id?: number|'latest'}
{type:'script', script_id?}
{type:'extension', extension_id}
```

所有变量函数 `option` 默认 `{type:'chat'}`。消息变量按 `variables[swipe_id]` 数组存储；旧式纯对象会被自动迁移为按 Swipe 数组。

### `'latest'` 读写不对称

```text
getVariables({type:'message', message_id:'latest'})
→ 过滤 system 后读取最后一个非 system 消息

replaceVariables(..., {type:'message', message_id:'latest'})
→ 把 latest 归一化为物理 -1，直接写 chat.at(-1)
```

因此 `updateVariablesWith/insertOrAssignVariables/insertVariables/deleteVariable` 使用 `'latest'` 时也可能“从最后一个非 system 读取、向物理最后一楼写入”。`'latest'` 只用于容错只读；关键写入先取得明确数值楼层并原样写回。

- `getVariables` 深拷贝返回；`replaceVariables` 整表替换；
- `replaceVariables` 当前返回 `void`，消息/chat/global/extension 等作用域多为防抖保存；紧接着读回只能确认内存值；
- 关键提交在读回前后按 provider 显式等待 `SillyTavern.getContext().saveChat()`、`saveMetadata()` 或对应设置保存能力；
- `insertOrAssignVariables`：深合并、新值优先、数组整体替换；
- `insertVariables`：只补缺、旧值优先；
- `updateVariablesWith(updater, option)`：读→改→写，支持异步 updater，但不提供事务锁，并发写同一表仍需项目串行化；
- `deleteVariable(path, option)` 返回 `{variables, delete_occurred}`；
- `registerVariableSchema(zodSchema, {type:'global'|'preset'|'character'|'chat'|'message'})` 只服务变量管理器 UI。

## 事件与清理

`eventOn/eventOnce/eventMakeFirst/eventMakeLast` 都返回 `{stop}`；TH iframe 关闭时经 `pagehide → eventClearAll()` 自动清理。准确清理函数：`eventClearEvent`、`eventClearListener`、`eventClearAll`。

这项自动清理只适用于 TH 注入的裸绑定事件表面。ST-Prompt-Template `@@iframe` 若通过 `window.parent.TavernHelper.eventOn` 注册，必须保存 `{stop}` 并在自身 `pagehide` 主动停止。

消息类事件（MESSAGE_SWIPED/SENT/RECEIVED/EDITED/UPDATED、USER/CHARACTER_MESSAGE_RENDERED）的 payload 会自动把字符串楼层号转为数值。

TH `iframe_events` 与本体 `tavern_events` 是不同事件族：

```text
iframe_events.GENERATION_STARTED(generation_id)
iframe_events.STREAM_TOKEN_RECEIVED_FULLY(full_text, generation_id)
iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY(delta, generation_id)
iframe_events.GENERATION_ENDED(text, generation_id)
本体 STREAM_TOKEN_RECEIVED(text)   # 当前累计全文
```

定时器、MutationObserver、父页 DOM 监听、音频、自建 Promise 和外部库订阅仍由项目在 `pagehide` 清理。

## 生成与注入

`generate/generateRaw`：

- 未传 `generation_id` 自动生成 uuid；同 ID 重复请求直接抛错；
- `bindToStopButton` 默认 true；
- 监听器按 generation_id 过滤，单请求停止用 `stopGenerationById(id)`；
- **只返回生成结果，不创建 user/assistant 楼层，不自动保存到 chat**。

`injectPrompts(prompts, {once})`：

```text
InjectionPrompt = {id, position:'in_chat'|'none', depth, role:'system'|'user'|'assistant',
                   content, filter?, should_scan?}
```

返回 `{uninject}`；`once` 在生成结束/停止时自动撤销；TH iframe 中同时注册 `pagehide` 自动清理。跨聊天需重新注入。

## 正则

角色卡存储对象是 camelCase（`scriptName/findRegex/replaceString/placement/markdownOnly/promptOnly/runOnEdit`），Tavern Helper 高层对象是 snake_case（`script_name/find_regex/replace_string/source/destination/run_on_edit`），不能混传。

`formatAsTavernRegexedString(text, source, destination, {depth, character_name})` 可离线预演；`formatAsDisplayedMessage` 走完整本体 messageFormatting。`replaceTavernRegexes` 是重操作；按钮点击中优先 `updateTavernRegexesWith` 或固定规则，不频繁整套重载。

## 世界书与设置

当前优先使用新 Worldbook API：

- 名称与绑定：`getWorldbookNames`、`getGlobalWorldbookNames`、`rebindGlobalWorldbooks`、`getCharWorldbookNames`、`rebindCharWorldbooks`、`getChatWorldbookName`、`getOrCreateChatWorldbook`、`rebindChatWorldbook`；
- 文件：`getWorldbook`、`createWorldbook`、`createOrReplaceWorldbook`、`replaceWorldbook`；
- 条目读改写：`updateWorldbookWith`、`createWorldbookEntries`、`deleteWorldbookEntries`。

旧 `getLorebookEntries/replaceLorebookEntries/updateLorebookEntriesWith/setLorebookEntries/createLorebookEntries/deleteLorebookEntries` 已 deprecated。旧 `getLorebookEntries` 的字符串 filter 使用包含匹配，不能拿来判断 `<user>` 等 canonical 名称是否精确唯一。

`getLorebookSettings/setLorebookSettings` 直接读写 SillyTavern **全局世界书扫描设置**，会改变玩家全局配置，慎用。

## Script / ScriptFolder 交付

酒馆助手导入器只读取 JSON 并按 zod `ScriptTree` 校验。`.js` 可以作为可读源码，但不能代替运行时导入文件。

Script JSON 结构：

```json
{
  "type": "script",
  "enabled": false,
  "name": "脚本名",
  "id": "uuid",
  "content": "完整 JavaScript",
  "info": "",
  "button": { "enabled": true, "buttons": [{ "name": "按钮名", "visible": true }] },
  "data": {},
  "export_with": { "data": true, "button": true }
}
```

Folder 使用 `type:"folder"`、`icon`、`color` 和 `scripts` 数组，不是 `children`。

## 重载与父页面

`reloadIframe()` 等价当前实例 `location.reload()`；共享接口、监听和局部状态要重新建立，它不是 `refreshOneMessage()`。

个人自用项目可以访问父页 DOM，但优先高层接口，探测失败后给复制/手动回退。不要跨实例保存旧 DOM 引用。切换当前消息 Swipe 会重新渲染并可能销毁当前 iframe；开场提交的后续事务交给后台脚本、父页协调器或新实例确认，不能假设旧 iframe 会继续执行。
