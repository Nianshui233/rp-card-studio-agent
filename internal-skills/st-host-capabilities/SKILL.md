---
name: st-host-capabilities
description: "Private supporting module for negotiating real SillyTavern and Tavern Helper capabilities: messages, variables, worldbook binding, regex/scripts, events, generation, streaming, iframe/parent bridges, and optional frontend build stacks."
---

# SillyTavern Host Capabilities

这是纯支援 Skill，没有独立用户阶段，也不向用户提问。它不替代 MVU、前端或正则创作，而是把“宿主到底能做什么、如何探测、怎样回退、如何记录证据”提供给这些 Skill。

完整读取：

- `references/host-capability-matrix.md`
- `shared/contracts/module-io.md`
- `orchestrator/capabilities.yaml`

## 处理方式

1. 从项目需求中识别所需 capability ID；
2. 读取目标宿主版本和实际类型声明/模板行为；
3. 设计能力探测，而不是默认某个全局对象一定存在；
4. 记录成功路径、失败路径、可用回退和真实证据；
5. 将启用能力写入项目账本，未验证能力保持 `not_run`；
6. 对消息 UI 优先复用 `assets/templates/ui-app/scripts/host-adapter.js` 的能力解析顺序，除非项目有明确的特殊宿主需求；
7. 把最终 API 使用交回真正拥有语义的 Skill。

## 重要边界

- “可以调用”不等于“已经成功”；写入变量、挂载世界书、修改聊天、绑定正则和启动生成都要读回或得到宿主确认。
- `window.SillyTavern.getContext()` 是现场快照；只选实际需要的函数，不把完整对象写入交付物。
- `getwi`/`activewi` 属于 EJS/ST-Prompt-Template 运行时，`getWorldbook`/`rebindCharWorldbooks` 属于 Tavern Helper 世界书管理，原生 `loadWorldInfo`/`getWorldInfoPrompt` 属于本体扫描链，三者不能混成一个 API。
- 卡内脚本、消息 iframe、父页面补充组件、全局酒馆插件是四种不同部署面，不能互相冒充。
- 父页面 DOM 和私有 API 允许在个人项目中使用，但要做 capability detection、卸载清理和手动回退。
- 远程 Loader、提示词模板、MVU bundle 和 UI 依赖要记录 URL、版本、顺序、回退与证据，不能无名地塞进脚本。
- 流式楼层是独立能力；默认消息正则只在文本完成后渲染，只有明确启用 streaming surface 才使用替换或挂载方案。
