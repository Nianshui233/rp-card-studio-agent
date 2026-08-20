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

裸 `<!doctype html>...<script>...` 只会进入本体消息格式化，不是酒馆助手 iframe 合同。流式期间有专用 Streaming 路径按同样条件增量识别；未渲染的代码块可显示"折叠前端代码块"按钮。

## iframe 注入面

每个消息/脚本 iframe 都被注入（`predefine.js`）：

- `window._`（lodash）与父页共享；
- 从父页 pick：`EjsTemplate`、`TavernHelper`、`YAML`、`showdown`、`toastr`、`z`（Zod，无需 import）；
- `TavernHelper` 全部方法的裸绑定函数（与 `window.TavernHelper` 同一注入面）；
- `window.SillyTavern` 动态 getter 代理（含 `writeExtensionField`）；
- 父页存在时 `window.Mvu` getter 代理；
- `pagehide` 时自动 `eventClearAll()`——TH 事件监听随 iframe 卸载自动清理。

## 身份与消息

- `getCurrentMessageId()` 仅消息 iframe 可用：按 iframe 名 `TH-message--N--M` 解析，脚本 iframe 调用抛错。
- `getScriptId()` 仅脚本 iframe 可用（`TH-script--` 前缀）。
- 不要长期持有 `frameElement`；Firefox teardown 时会消失。TH 用 `__TH_IFRAME_ID` 缓存与 `window.name` 回退。
- `getLastMessageId()` 即 `{{lastMessageId}}` 宏。

`getChatMessages(range, {role, hide_state, include_swipes})`：

- `range` 接受数值或字符串（`'5'`、`'-3'`、`'2-5'`，支持宏如 `{{lastMessageId}}`，负数从末尾数，越界自动 clamp）；
- `role: 'all'|'system'|'assistant'|'user'`、`hide_state` 过滤；旁白按 `extra.type === narrator` 归入 system；
- 返回 `ChatMessage`：`message_id / name / role / is_hidden / message（当前 Swipe 正文）/ data（当前 Swipe 消息变量）/ extra（当前 Swipe 附加信息）`；
- `include_swipes:true` 返回 `ChatMessageSwiped`，追加 `swipe_id / swipes / swipes_data / swipes_info`。

`setChatMessages(messages, {refresh})`：

- 写 `message` 同时落 `mes` 与 `swipes[当前Swipe]`；写 `data` 落 `variables[当前Swipe]`；写 `extra` 落 `swipe_info[当前Swipe]`；
- 传入 `swipe_id`/`swipes`/`swipes_data` 可**切换当前 Swipe**（mes 随之切换）；
- `retrieveDisplayedMessage()` 只改临时 DOM；持久正文用 `setChatMessages()`。

`createChatMessages(array, {insert_at})`：每项至少 `role` + `message`，可带 `data/extra/name/is_hidden`。

## 变量

`VariableOption`：

```text
{type:'chat'|'character'|'preset'|'global'}
{type:'message', message_id?: number|'latest'}   # 默认 'latest'（跳过 system 消息）；数值可为负索引
{type:'script', script_id?}                       # 裸调用自动补当前脚本 ID；TavernHelper.xxx 不传则抛错
{type:'extension', extension_id}                  # 必填
```

所有变量函数 `option` 默认 `{type:'chat'}`。消息变量按 `variables[swipe_id]` 数组存储；旧式纯对象会被自动迁移为按 Swipe 数组。

- `getVariables` 深拷贝返回；`replaceVariables` 整表替换（message 范围越界抛错；character 范围未开卡抛错）；
- `insertOrAssignVariables`：深合并、新值优先、数组整体替换；
- `insertVariables`：只补缺、旧值优先；
- `updateVariablesWith(updater, option)`：读→改→写，支持异步 updater；
- `deleteVariable(path, option)` 返回 `{variables, delete_occurred}`；
- `registerVariableSchema(zodSchema, {type:'global'|'preset'|'character'|'chat'|'message'})` 只服务变量管理器 UI。

## 事件与清理

`eventOn/eventOnce/eventMakeFirst/eventMakeLast` 都返回 `{stop}`；iframe 关闭时经 `pagehide → eventClearAll()` 自动清理。准确清理函数：`eventClearEvent`、`eventClearListener`、`eventClearAll`。

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

- 未传 `generation_id` 自动生成 uuid；**同 ID 重复请求直接抛错**；
- `bindToStopButton` 默认 true（会点亮本体停止按钮）；
- 监听器按 generation_id 过滤，单请求停止用 `stopGenerationById(id)`，`stopAllGeneration` 只在明确中断全部时使用。

`injectPrompts(prompts, {once})`：

```text
InjectionPrompt = {id, position:'in_chat'|'none', depth, role:'system'|'user'|'assistant',
                   content, filter?, should_scan?}
```

返回 `{uninject}`；`once` 在生成结束/停止时自动撤销；同时注册 `pagehide` 自动清理。跨聊天需重新注入。

## 正则

角色卡存储对象是 camelCase（`scriptName/findRegex/replaceString/placement/markdownOnly/promptOnly/runOnEdit`），Tavern Helper 高层对象是 snake_case（`script_name/find_regex/replace_string/source/destination/run_on_edit`），不能混传。

`formatAsTavernRegexedString(text, source, destination, {depth, character_name})` 可离线预演（source 五选一含 `reasoning`；destination `display`→isMarkdown、`prompt`→isPrompt，之后还应用 TH 宏）；`formatAsDisplayedMessage(text, {message_id:'last'|'last_user'|'last_char'|数值})` 走完整本体 messageFormatting（含 display 正则与净化），可预览最终显示 HTML。`replaceTavernRegexes` 是重操作（保存并重载），不要在按钮点击中频繁重写整套规则；`updateTavernRegexesWith`、`isCharacterTavernRegexesEnabled` 可用。`getTavernRegexes` 选项为 `{type:'global'}` / `{type:'character', name?:'current'}` / `{type:'preset', name?:'in_use'}`。

## 世界书与设置

文件与绑定：`getWorldbook`、`createOrReplaceWorldbook`、`replaceWorldbook`、`getCharWorldbookNames`、`rebindCharWorldbooks`、`getChatWorldbookName`、`rebindChatWorldbook`；当前版本重绑仅支持 `'current'`，完成后重新读取绑定。

条目级：`getLorebookEntries(书名, {filter})` 返回**全部条目**（不按 disable 过滤；`enabled = !disable`）。`getLorebookSettings/setLorebookSettings` 直接读写 SillyTavern **全局世界书扫描设置**——脚本改它会改变玩家全局配置，慎用。

## Script / ScriptFolder 交付

酒馆助手导入器只读取 JSON 并按 zod `ScriptTree` 校验。`.js` 可以作为可读源码，但不能代替运行时导入文件。

Script JSON 结构（与 `type/scripts.ts` 校验一致）：

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

Folder 使用 `type:"folder"`、`icon`、`color` 和 `scripts` 数组（不是 `children`）。

## 重载与父页面

`reloadIframe()` 等价当前实例 `location.reload()`；共享接口、监听和局部状态要重新建立，它不是 `refreshOneMessage()`。

个人自用项目可以访问父页 DOM，但优先高层接口，探测失败后给复制/手动回退。不要跨实例保存旧 DOM 引用。
