# Tavern Helper 工程参考

## 官方模板中必须保留的接口边界

目标模板 `tavern_helper_template` 的可读源和 `@types` 提供了以下实际工程表面：

```text
消息前端：getCurrentMessageId、getChatMessages、Mvu.getMvuData、refreshOneMessage
模板工具（需导入打包，不是宿主全局）：createScriptIdDiv、createScriptIdIframe、teleportStyle
卸载事件：pagehide
脚本控制：appendInexistentScriptButtons、getButtonEvent、getVariables(type=script)
状态管理：defineMvuDataStore、Pinia、Zod、waitGlobalInitialized、waitUntil
流式接管：mountStreamingMessages、STREAM_TOKEN_RECEIVED、MESSAGE_EDITED、MESSAGE_DELETED
```

这些名称不能直接移植到 STPT `@@iframe` 或纯 SillyTavern HTML。实现时必须在文件附近记录 provider、当前楼层获取方式、保存方式和清理方式。

## 加载与卸载

远程加载的 `dist/**/index.html` 或 `dist/**/index.js` 不保证触发 `DOMContentLoaded`。使用 Tavern Helper 的 `$(() => {})` 或脚本实际提供的加载入口；卸载使用 `pagehide`，并释放组件、监听、观察器、定时器、样式节点和 iframe。

## 源工程与最终制品

- `index.html` 源文件只放静态 body；样式和脚本通过 TypeScript/webpack 导入；
- `dist/**/index.html` 才是可由 Regex fenced HTML 或 `$('body').load(...)` 引入的完整制品；
- ScriptFolder JSON 是导入文件，`.ts/.js` 是可读源，不能互相冒充；
- Regex 的 display 载体必须与 producer、HTML provider 和消息生命周期成对验收。

模板的 util/store.ts、util/streaming.ts 等共用工具同样按源工程导入，不因示例直接调用就成为全局 API。裸 document 指向当前 iframe；父页面选择与原生节点访问必须明确上下文。详见 orchestrator/production-verification.md。
