---
name: st-api-reference
description: "Private supporting module for exact SillyTavern, Tavern Helper, ST-Prompt-Template, MVU, EJS, event, worldbook, regex, generation, and loader API facts."
---

# SillyTavern API Reference

这是版本和签名核对模块，不向用户提问，不替代运行时实现。默认读取 `references/api-contract.md`；需要 Tavern Helper 运行签名时再读取 `references/tavern-helper-runtime.md`。在项目声明目标版本后再确认具体 API。

## 本机核对快照（2026-09-28）

本次已重新核对本机参考仓库和本机 SillyTavern 源码：

- SillyTavern Core：`1.19.0`，release HEAD `06bde939f`；
- Tavern Helper / JS-Slash-Runner：`4.11.2`，HEAD `519599bc`；
- ST-Prompt-Template：manifest `1.17.9`，HEAD `d6f520d`；
- MagVarUpdate：beta bundle HEAD `b13b43b`；
- TavernWeave：`1.6.0`，HEAD `87e083f`，只作为能力路由和 QA 方法参考，不作为冻结 API 源。

TavernWeave `core-facts.md` 中标记为 2026-07-22 的版本表是导航快照，不是当前接口答案；本模块遇到冲突时以安装目标源码、匹配版本声明和实际运行表面为准。

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

## 世界书调度接入

世界书位置核对还读取 st-worldbook-regex/references/worldbook-routing.md；确认目标版本的 position 枚举、@D 的 depth/role 和 CharacterBook extensions 转换。depth 不改变 Before/After 归属，系统身份不等于聊天记录之外。
