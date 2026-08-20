---
name: st-api-reference
description: "Private supporting module for exact SillyTavern, Tavern Helper, ST-Prompt-Template, MVU, EJS, event, worldbook, regex, generation, and loader API facts."
---

# SillyTavern API Reference

这是版本和签名核对模块，不向用户提问，不替代运行时实现。读取 `references/api-contract.md`，并在项目声明目标版本后再确认具体 API。

## 负责核对

- 函数签名、事件 payload 和变量作用域；
- 消息楼层、Swipe、编辑和显示刷新；
- 世界书读取、主动激活、角色/聊天/全局绑定；
- Tavern Regex、prompt injection、Slash Command；
- MVU、EJS 处理阶段、缓存和 `getwi/activewi`；
- `generate/generateRaw`、停止生成、Loader 和远程依赖；
- iframe/父页面全局对象和流式界面接口。

## 证据规则

类型声明、文档和源码检查只能证明接口来源已核对。真正写入、挂载、渲染和持久化仍要通过实际文件或真实运行证据确认。找不到精确签名时直接报告缺口，由拥有实现的阶段补充，不凭印象编造参数。
