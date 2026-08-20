# Tavern Helper 4.9.3 运行时参考

酒馆助手为角色卡提供两类 iframe：消息前端与后台脚本。它不是 SillyTavern 本体；任何依赖都要在导入说明中明确。

## 消息前端载体

SillyTavern 本体先执行 display 正则、Markdown 和 DOMPurify。酒馆助手随后扫描消息 DOM 中的 `<pre>`；代码块文本含 `<html>`、`<head>` 或 `<body>` 时，才建立 `srcdoc`/Blob iframe。

因此动态前端的正则替换必须产出 fenced HTML 代码块：

````text
```html
<!doctype html>
<html>...</html>
```
````

裸 `<!doctype html>...<script>...` 只会进入本体消息格式化，不是酒馆助手 iframe 合同。

酒馆助手会给 iframe 注入：

- 当前 window 的 Tavern Helper 裸绑定函数；
- `window.TavernHelper`；
- 动态 `window.SillyTavern` 代理；
- 可选 `EjsTemplate`、`Mvu` 等共享接口。

消息重渲染、编辑、Swipe、加载更多、聊天切换会销毁或重建实例。初始化保持幂等。

## 身份与消息

`getCurrentMessageId()` 仅消息 iframe 可用。后台脚本 iframe调用会抛错。不要长期持有 `frameElement`；Firefox teardown 时它可能消失，酒馆助手内部使用缓存 ID和 `window.name` 回退。

消息 ID 是真实楼层号；负数是深度索引。消息变量接口只接受数值或 `'latest'`，不接受 `'current'`。

`getChatMessages()` 返回的：

```text
message   当前 Swipe 正文
data      当前 Swipe 的消息变量
extra     当前 Swipe 的附加信息
swipes / swipes_data / swipes_info（include_swipes 时）
```

修改正文和消息变量应使用 `setChatMessages()`，并考虑当前 Swipe。只改 `retrieveDisplayedMessage()` 得到的 DOM不会保存。

`createChatMessages()` 首参是数组，每项至少有 `role` 和 `message`：

```js
await createChatMessages([
  { role: 'assistant', message: '正文', data: completeMessageVariables },
]);
```

## 变量

作用域：

```text
global / preset / character / chat / message / script / extension
```

消息 `data` 就是消息变量，不是普通附件；但不完整对象不能冒充 MVU 快照。

## 事件与清理

`eventOn()` 等绑定函数返回 `{stop}`，并在当前前端/脚本关闭时自动清理。准确清理函数是：

```text
eventClearEvent
eventClearListener
eventClearAll
```

定时器、MutationObserver、父页 DOM 监听、音频、自建 Promise 和外部库订阅仍由项目在 `pagehide` 清理。

Tavern Helper `iframe_events` 和 SillyTavern `tavern_events` 是不同事件族，按实际 payload 写回调。

## 生成与注入

主动生成给每个请求唯一 `generation_id`，监听器按 ID 过滤，按钮锁防止重复请求。单请求停止用 `stopGenerationById`；`stopAllGeneration` 只在明确要中断全部请求时使用。

`injectPrompts()` 只对当前聊天有效，返回 `{uninject}`；`once` 会在相应生成结束/停止时撤销，iframe 销毁也会清理。跨聊天需要重新注入。

## 正则

角色卡存储对象是 camelCase：

```text
scriptName/findRegex/replaceString/placement/markdownOnly/promptOnly/runOnEdit
```

Tavern Helper 高层 API对象是 snake_case：

```text
script_name/find_regex/replace_string/source/destination/run_on_edit
```

`replaceTavernRegexes()` 是重操作，会保存并重载聊天。不要在按钮点击中频繁重写整套规则。

## Script / ScriptFolder 交付

酒馆助手导入器只读取 JSON 并用 `ScriptTree` 校验。`.js` 可以作为可读源码，但不能代替运行时导入文件。

Script JSON 结构：

```json
{
  "type": "script",
  "enabled": false,
  "name": "脚本名",
  "id": "uuid",
  "content": "完整 JavaScript",
  "info": "",
  "button": { "enabled": true, "buttons": [] },
  "data": {},
  "export_with": { "data": true, "button": true }
}
```

Folder 使用 `type:"folder"` 和 `scripts` 数组，不是 `children`。

## 重载与父页面

`reloadIframe()` 只重载当前 iframe，等价于当前实例的 location reload；共享接口、监听和局部状态要重新建立。它不是 `refreshOneMessage()`。

个人自用项目可以访问父页 DOM，但优先高层接口，探测失败后给复制/手动回退。不要跨实例保存旧 DOM引用。
