---
name: st-runtime-authoring
description: "Private module for MVU, MVU_ZOD, EJS, Tavern Helper scripts, message-floor state, initialization, updates, and creation bridges. Load only when the project actually needs runtime behavior."
---

# SillyTavern Runtime Authoring

只接受主 Agent 调度。只读取当前路线需要的 `references/mvu-ejs.md` 或一个宿主参考。不要读取项目账本、Forge、构建器或完整能力注册表。

## 职责

- 判断项目是否真的需要 MVU、MVU_ZOD、EJS 或组合路线。
- 创作真实 `[initvar]` 初始值、Schema、变量更新规则、回复输出格式、`.ejs` 和可导入 Tavern Helper Script JSON。
- 建立唯一状态合同：状态根、路径、类型、作用域、读写者、派生值、只读值和必要生命周期；`[initvar]` 不包 `stat_data:` 外壳。
- 将创角结果写入 `<user>` 条目、当前消息 MVU 状态或二者，并在开局前读回验证。
- 验证当前消息 ID/楼层，以及编辑、Swipe、重载和切换聊天生命周期。

## 访谈方式

遵循 `orchestrator/interview-playbook.md`。用户只需要回答能观察到的行为：哪些变化必须记住、保存多久、谁能看见、何时反馈、失败时怎样表现。每个问题同时给出推荐路线、推荐理由和对玩家体验/交付组件的影响；MVU、EJS、Schema、楼层、API 与脚本结构由本 Skill 自行判断。

例如不要问“变量用什么 scope”，而应说明：“我建议把玩家手记作为聊天长期状态，因为它需要跨楼保留；这样会增加一次真实写入和读回验证，但角色默认看不到。你希望改成只属于当前楼吗？”用户接受建议或放权后直接实现，不继续追问同一技术决定。

## 最短路线

- 无变量就不启用 MVU。
- 只启用 EJS 时，不生成 MVU Loader、Schema、`[initvar]` 或变量更新块。
- MVU 可选择 `native_schema`、`mvu_zod`、`hybrid` 或沿用已有实现。
- 卡内 MagVarUpdate 只能有一个 `mvu_loader`。
- 只有 `mvu_zod` 或明确需要 Zod 的 `hybrid` 才要求 `registerMvuSchema`。
- `[initvar]`、更新规则、回复输出格式、prompt/display 清理是独立组件。
- EJS 与 MVU 默认没有自动 bridge；联动时提供真实桥接实现，明确数值楼层、读写方向、作用域和路径。

## 运行闭环

每个状态字段都必须能从真实初值到生产者、解析/应用路径、持久化结果和玩家显示清理闭合。只看到 Loader、`window.Mvu` 或一段模板不算完成。

涉及全局对象、消息楼层、远程 Loader、生成注入、iframe 或生命周期时，只加载对应宿主参考并记录成功路径、失败回退和是否实际运行。没有实机证据时写 `runtime: not_run`。

## 边界

不设计 UI 视觉层级，不重写 RP 内容，不另造第二套状态树。不得为了制作期清理增加年龄门禁或交付后玩法限制。
