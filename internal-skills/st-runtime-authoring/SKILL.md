---
name: st-runtime-authoring
description: "Private module for MVU, MVU_ZOD, EJS, Tavern Helper scripts, message-floor state, initialization, updates, and creation bridges."
---

# SillyTavern Runtime Authoring

只接受主 Agent 调度。完整读取 `shared/contracts/module-io.md`、`references/mvu-ejs.md`，以及 `references/host/` 下与当前路线有关的宿主参考。

## 职责

- 独立判断 MVU、MVU_ZOD、EJS 或组合路线是否适合项目。
- 创作真实 `[initvar]` 初始值、Schema、变量更新规则、回复输出格式和 `.ejs` 源码，不只写占位清单。
- 建立唯一规范状态合同：状态根、精确路径、类型、默认值、作用域、读取者、写入者、派生值、只读值、更新守卫和生命周期。
- 创作项目专属酒馆助手脚本并明确依赖顺序。
- 将创角结果写入默认禁用的 `<user>` 条目、当前消息 MVU 状态或二者，并在正式开局前读回验证。
- 验证当前消息 ID/楼层语义，以及编辑、Swipe、重载和切换聊天生命周期。

## 运行闭环

每个 UI 字段必须解析到唯一状态合同。每种变量更新协议必须具备：真实初值、生产者、解析/应用路径、持久化结果和玩家端隐藏清理。只看到 Loader 或 `window.Mvu` 不算初始化成功。

EJS 必须是实际 EJS 文件，并进入按稳定名称指定的 CharacterBook 条目；需要时使用 `manual` 或 `ejs_only`，不能让它参与普通关键词扫描。

涉及 global/character/chat/message/script/extension 作用域、EJS cache/preparation/render 阶段、远程 Loader、生成注入、消息编辑/Swipe 或自动世界书挂载时，先加载 `st-host-capabilities`，以能力记录和回退路径为准，不把类型声明中的可用函数误报成已验证运行。

## 边界

作为主 Skill 时只询问 MVU/EJS 阶段问题。作为支援 Skill 时不询问用户，直接实现锁定需求或返回交接。不得设计 UI 视觉层级、重写 RP 内容，也不得为了一个组件另造第二套状态树。

制作阶段需要删除的内容必须在上游维护源码中删除，不得转化为运行时监管。尤其不得为了处理涉及未成年人的成人性内容而新增年龄门禁、`adult_only`/`age_gate` 状态、成年证明字段、Schema 年龄守卫、关系更新禁路、EJS 年龄判断、脚本拒绝、正则拦截或 UI 年龄确认。Runtime 只实现本项目已锁定的 RP 状态与功能，不负责控制成品交付后的玩法。
