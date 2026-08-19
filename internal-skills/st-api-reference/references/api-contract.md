# API 核对合同

本模块优先使用项目提供的类型声明、目标运行时源码和已记录版本；不要把某次参考资料中的函数存在性直接当作所有版本都可用。

## 高频接口族

```text
消息：getChatMessages / setChatMessages / createChatMessages / deleteChatMessages / rotateChatMessages
显示：retrieveDisplayedMessage / formatAsDisplayedMessage / refreshOneMessage
变量：getVariables / replaceVariables / updateVariablesWith / registerVariableSchema / waitGlobalInitialized
事件：eventOn / eventOnce / eventMakeFirst / eventMakeLast / eventEmit / eventRemoveListener / eventClearAll
世界书：getwi / activewi（EJS）与 getWorldbook / rebindCharWorldbooks / rebindChatWorldbook / getOrCreateChatWorldbook（Tavern Helper）
正则：getTavernRegexes / replaceTavernRegexes / isCharacterTavernRegexesEnabled
提示词：injectPrompts / uninjectPrompts / triggerSlash
生成：generate / generateRaw / stopGenerationById / stopAllGeneration
前端：getCurrentMessageId / getMessageId / reloadIframe / refreshOneMessage / parent-window bridge / input event dispatch
```

## 核对结果

每项 API 记录：名称、来源文件或版本、输入、输出、失败表现、当前项目消费者、回退方式和证据等级。项目不需要的 API 不进入运行合同。

## 两类现场接口的优先级

卡内 UI 默认先调用 Tavern Helper 已注入的高层接口，再尝试 `window.TavernHelper`，然后才读取 `window.SillyTavern.getContext()`。父页面 DOM 和本体私有接口仍可作为个人项目的增强路线，但要做能力探测、结果反馈和卸载清理。

`window.SillyTavern.getContext()` 是当前现场快照：可提供 `eventSource`、`eventTypes`、`generate`、`generateRaw`、`generateQuietPrompt`、`setExtensionPrompt`、`updateMessageBlock`、`callGenericPopup`、`isMobile`、`loadWorldInfo`、`saveWorldInfo`、`getWorldInfoPrompt`、`getWorldInfoNames` 等能力。只登记项目实际使用的字段，不保存整份上下文对象。

`formatAsTavernRegexedString()` 可作为真实宿主正则重放入口；`getTavernVersion()` 与 `getTavernHelperVersion()` 用于记录现场证据。`registerVariableSchema()` 只对应变量管理器 UI 校验，不能替代 `registerMvuSchema()` 或 MVU 运行时读写。
