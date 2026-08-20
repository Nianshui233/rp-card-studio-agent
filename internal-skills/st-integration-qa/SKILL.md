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
- 未做真实 SillyTavern 测试时明确记录 `runtime: not_run`。

## 最终检查

按实际存在的组件检查：

- JSON/YAML/JavaScript/EJS/HTML/正则语法；
- 角色卡和独立世界书名称、绑定目标、CharacterBook 内容；
- MVU 初值、路线、唯一 Loader、更新协议、完整/流式隐藏规则和 UI 路径；
- EJS 模板、按名调用条目、执行阶段和 MVU bridge；
- 正则 placement/depth、prompt/display 分工、标记与 HTML 配对；
- Tavern Helper 脚本内容、ID、依赖、重复注册和必要卸载；
- HTML 是否自包含，是否读取真实数据并有空态/失败回退；
- 交付文件是否残留绝对路径、`src/...`、`source_refs` 或需要用户拼接的本地 CSS/JS。

只有确定会造成无法导入、无法运行、数据丢失或明确断链的问题才阻断交付。风格、规模和性能建议只作为非阻断说明。

## 交付

最终报告简短列出：

1. 项目包绝对路径；
2. 实际组件和导入顺序；
3. 每个正则与完整 HTML 的配对；
4. 已通过的文件检查和真实宿主检查；
5. `runtime: not_run` 项；
6. 远程/宿主依赖与已知限制。
