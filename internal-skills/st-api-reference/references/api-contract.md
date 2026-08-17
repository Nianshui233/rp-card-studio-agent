# API 核对合同

本模块优先使用项目提供的类型声明、目标运行时源码和已记录版本；不要把某次参考资料中的函数存在性直接当作所有版本都可用。

## 高频接口族

```text
消息：getChatMessages / setChatMessages / createChatMessages / deleteChatMessages / rotateChatMessages
显示：retrieveDisplayedMessage / formatAsDisplayedMessage / refreshOneMessage
变量：getVariables / replaceVariables / updateVariablesWith / registerVariableSchema
事件：eventOn / eventOnce / eventMakeFirst / eventMakeLast / eventEmit / eventRemoveListener
世界书：getwi / activewi / getWorldbook / rebindCharWorldbooks / rebindChatWorldbook / getOrCreateChatWorldbook
正则：getTavernRegexes / replaceTavernRegexes / isCharacterTavernRegexesEnabled
提示词：injectPrompt / uninjectPrompts / triggerSlash
生成：generate / generateRaw / stopGenerationById / stopAllGeneration
前端：getCurrentMessageId / reloadIframe / mountStreamingMessages / parent-window bridge
```

## 核对结果

每项 API 记录：名称、来源文件或版本、输入、输出、失败表现、当前项目消费者、回退方式和证据等级。项目不需要的 API 不进入运行合同。
