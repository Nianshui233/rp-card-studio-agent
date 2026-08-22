---
name: st-runtime-authoring
description: "Private module for MVU, MVU_ZOD, EJS, Tavern Helper scripts, message-floor state, initialization, updates, persistence, and creation bridges. Load only when the project actually needs runtime behavior."
---

# SillyTavern Runtime Authoring

只接受主 Agent 调度。只读取当前路线需要的 `references/mvu-ejs.md` 或一个宿主参考。不要读取项目账本、Forge、构建器或完整能力注册表。

## 职责

- 判断项目是否真的需要 MVU、MVU_ZOD、EJS 或组合路线。
- 创作真实 `[initvar]` 初始值、Schema、变量更新规则、回复输出格式、`.ejs` 和可导入 Tavern Helper Script JSON。
- 建立唯一状态合同：状态根、路径、类型、作用域、读写者、派生值、只读值、保存能力和必要生命周期；`[initvar]` 不包 `stat_data:` 外壳。
- 为开场提供 canonical `<user>` 条目更新、目标 Greeting Swipe 动态初态、明确数值楼层、保存与读回能力；具体事务由开场 Skill 实现。
- 验证当前消息 ID/Swipe，以及编辑、重载、切换聊天和事件持久化时序。

## 访谈方式

遵循 `orchestrator/interview-playbook.md`。用户只回答能观察到的行为：哪些变化必须记住、保存多久、谁能看见、何时反馈、失败时怎样表现。每个问题给推荐路线、理由和对玩家体验/交付组件的影响；MVU、EJS、Schema、楼层、API 与脚本结构由本 Skill 自行判断。

## 最短路线

- 无变量就不启用 MVU。
- 只启用 EJS 时，不生成 MVU Loader、Schema、`[initvar]` 或变量更新块。
- MVU 可选择 `native_schema`、`mvu_zod`、`hybrid` 或沿用已有实现。
- 卡内 MagVarUpdate 只能有一个 Loader。
- `mvu_zod/hybrid` 的 `registerMvuSchema` 在宿主 Ready 后注册并复用目标环境的 `window.z`。
- `[initvar]`、更新规则、回复输出格式、prompt/display 清理是独立组件。
- EJS 与 MVU 默认没有自动 bridge；联动时提供真实桥接实现，明确数值楼层、读写方向、作用域和路径。
- STPT 默认会处理原始消息 EJS且不开 sandbox；不需要时关闭 raw-message evaluation。

## 运行闭环

每个状态字段都必须能从真实初值到生产者、解析/应用路径、内存写入、耐久保存和玩家显示清理闭合。只看到 Loader、`window.Mvu` 或一段模板不算完成。

- `'latest'` 只用于容错只读，关键写入使用明确数值楼层；
- `replaceVariables/replaceMvuData` 即时读回不等于磁盘保存；
- `VARIABLE_INITIALIZED/VARIABLE_UPDATE_ENDED` 不等于持久化完成；
- 关键状态用已验证保存能力并按需要重载后读回。

涉及全局对象、消息楼层、远程 Loader、生成注入、iframe 或生命周期时，只加载对应宿主参考并记录成功路径、失败回退和是否实际运行。没有实机证据时写 `runtime: not_run`。

## 边界

不设计 UI 视觉层级，不重写 RP 内容，不另造第二套状态树。不得为了制作期清理增加年龄门禁或交付后玩法限制。
