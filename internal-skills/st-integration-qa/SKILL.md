---
name: st-integration-qa
description: "Private final QA and delivery module for checking actual SillyTavern files, repairing concrete breakage, organizing only the components the project uses, and reporting import order and runtime evidence."
---

# SillyTavern Final QA and Delivery

只接受主 Agent 调度。不要读取项目账本、Forge 文档、Schema、装配清单或构建状态。按实际组件选择性读取：

- 常规最终检查：`references/validation.md`
- SillyTavern 导入与宿主验收：`references/integration.md`

## 职责

- 直接检查用户工作目录中的最终角色卡、独立世界书、正则、Tavern Helper 脚本、MVU/EJS 文件和完整 HTML。
- 修复确定的语法错误、字段错位、路径断链、ID 冲突、标记生产者/消费者不一致和变量路径错误。
- 不重写已确认的 RP 内容，不创建通用中间格式，不生成源码清单或构建事务。
- 将最终文件直接整理到一个交付目录，只包含项目实际使用的组件。
- 为旧卡保留原始输入副本，但不把原始副本列为运行导入组件。
- 未做真实 SillyTavern 测试时在最终报告中明确写 `runtime: not_run`。
- QA 过程不生成独立检查清单、通过项账本、问题日志、修复日志或运行记录；只修改真实制品，并在对话和最终交付说明中汇总结论。

## 验收沟通

需要用户确认取舍时遵循 `orchestrator/interview-playbook.md`：说明发现的问题，给出推荐修复或降级方案，解释原因，并明确会影响的导入步骤、运行功能或已确认内容。不要只问“怎么处理”，也不要把语法、字段或 API 选择推给用户。

优先用真实使用路径提问，例如“我建议把‘导入角色卡 → 启用 scoped regex → 新建聊天 → 点击状态按钮’作为关键验收路径，因为它覆盖本项目唯一写入动作；若不做实机测试，这部分只能标记 `runtime: not_run`。是否按此验收？”低风险且不改变创作意图的确定性修复直接执行并报告。

## 最终检查

按实际存在的组件检查：

- JSON/YAML/JavaScript/EJS/HTML/正则语法；
- 角色卡和独立世界书名称、绑定目标、CharacterBook 内容；
- MVU 初值、路线、唯一 Loader、数值楼层、事件/持久化时序、更新协议、完整/流式隐藏规则和 UI 路径；
- EJS 模板、按名调用条目、执行阶段、raw-message/sandbox/autosave 默认态和 MVU bridge；
- 正则 placement/depth、prompt/display 分工、标记与 HTML 配对；
- Tavern Helper Script/ScriptFolder JSON 结构、内容、ID、依赖、重复注册和必要卸载；`.js` 不能冒充导入文件；
- 开场/创角 HTML 是否完成空白输入、主动选择、上下文冻结、目标 Greeting Swipe、canonical `<user>`、真实写入/保存/读回、失败保留和 user→AI 正常消息链；
- 持续消息 HTML 是否自包含、有真实动态载体、按 provider 取得当前楼层/Swipe、处理持久化后刷新与清理并有空态/失败回退；
- 两种前端同时存在时，是否分别交付独立 HTML、使用同一运行合同，并避免重复初始化和第二套状态树；
- 交付文件是否残留绝对路径、`src/...`、`source_refs` 或需要用户拼接的本地 CSS/JS。

只有确定会造成无法导入、无法运行、数据丢失或明确断链的问题才阻断交付。风格、规模和性能建议只作为非阻断说明。

## 交付

最终报告简短列出：

1. 项目包绝对路径；
2. 实际组件和导入顺序；
3. 每个 marker、正则、完整 HTML 与实际 provider/载体的配对；
4. 已通过的文件检查和真实宿主检查；
5. `runtime: not_run` 项；
6. 远程/宿主依赖与已知限制。
