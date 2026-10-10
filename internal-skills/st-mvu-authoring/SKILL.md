---
name: st-mvu-authoring
description: "Private module for MagVarUpdate state authoring: persistent state contracts, initvar, schemas, update commands, message snapshots, save/readback, and MVU-backed UI data. Does not author EJS templates."
---

# SillyTavern MVU Authoring

只接受主 Agent 调度。MVU 指 **MagVarUpdate 的状态系统**，不是 EJS，也不是泛指所有运行脚本。

按需读取：

- 制作规则：`references/mvu.md`
- 精确宿主行为：`references/mvu-runtime.md`
- 选择 `mvu_zod` 时必须读取：`references/mvu-zod.md` 和 `references/mvu-source-build.md`
- Tavern Helper API 事实由 `st-api-reference/references/tavern-helper-runtime.md` 提供。

## 何时启用

只有项目需要以下至少一项时启用：

- 跨消息持续变化的状态；
- 每个 Swipe/消息楼层的状态快照；
- 可验证的变量更新协议；
- 状态栏需要读取持久状态；
- 明确要求 MagVarUpdate、MVU_ZOD 或兼容旧 MVU 实现。

仅需要动态 Prompt、条件文本、世界书模板或 `@@iframe` 时，不启用本 Skill；那属于 `st-ejs-authoring`。

## 用户可见的能力选择合同

MVU 是否启用是用户可以明确选择的运行能力，不得因为执行 Agent 觉得复杂、担心出错、想减少文件或想走最短路线而静默关闭。对非技术用户先用功能语言说明，再保留技术名：

```text
跨消息记住时间、地点、物品、任务和关系（MVU）
检查变量结构、类型、范围和缺失字段（MVU_ZOD）
```

用户明确选择 MVU 后，必须按选择制作并在结束时报告 `mvu_mode`；没有明确选择时保持 `unresolved`，不能把沉默当成 disabled。用户明确选择 `MVU_ZOD` 时，`mvu_zod` 是硬合同，不得删去 ZOD、改成 native、改名为轻量版或只保留表面 Schema。

`MVU_ZOD` 是 MVU 的校验/归一化路线，不是 EJS，也不是自动生成玩家身份或主控关系的授权。状态合同仍须保持玩家中立：不得因为启用 MVU 就创建单一默认玩家、固定 `<user>` 身份或 NPC 对外部主控的关系。

对于有嵌套 Record/Array、多角色、物品/关系/任务、状态栏读写或前端交互的项目，若用户尚未决定，应明确推荐 `MVU_ZOD` 并说明不开启的风险，等待用户选择；不能以“安全”为理由替用户关闭。

## 输出

- 唯一状态合同：根、路径、类型、初值、范围、空态、作用域、读写者、变化事件、保存和旧聊天处理；
- `native_schema` 或 `mvu_zod` 路线选择，并写入实际项目的 `制作文件/配置/MVU运行合同.yaml`；
- `[initvar]` / Greeting `<initvar>`、更新规则、回复输出格式；初始化策略必须明确是 worldbook 基线还是 Greeting 初态；
- 必要的 Loader、Schema/注册脚本、Tavern Helper 运行脚本；`mvu_zod` 缺 ZOD 脚本时阻断，不得静默降级为 native；
- 明确数值楼层、完整 MvuData 写入、保存与同面读回；任何 Tavern Helper 直接写入脚本都必须列入运行合同的 `producers.direct_scripts`，不能把 UI 写入藏在消费者里；
- 导入脚本必须先按 ES Module 做语法检查；若宿主 `z` 需要 Ready 后才能取得，可使用 `createSchema(z)` 工厂并在 `waitGlobalInitialized`/等价就绪门后注册，不能为了通过静态检查把工厂改成未定义的 `z` 顶层调用；
- 给开场登记和持续消息前端的稳定状态接口；
- 每个状态写入的事实来源与证据类型。用户原话、材料事实和本轮可指认叙事事实可以写入；Agent 推测、样本默认值和“看起来合理”的主控目标/身份/关系/决定不能直接落库。

## 路线不可降级

先根据项目状态复杂度和用户要求明确记录当前对话中的 `mvu_mode`。选择 `mvu_zod` 后，完整 ZOD、初始化、详细更新规则、当前变量路径索引、输出格式、Regex 和消费者都是同一条路线的必需品。发现缺件时修复该路线，不能把错误实现改名为“轻量版”、降级为子路线或删除 ZOD 后声称 native 等价。

## 硬边界

- 不生成 `.ejs`、`<% %>`、`@@generate`、`@@iframe` 或 ST-Prompt-Template 设置。
- 不把 EJS 的 `global/local/message/cache/initial` 当成 MVU `stat_data`。
- 不因为用户需要状态栏就自动加入 EJS。
- 不自动假定 EJS 能读取 `stat_data`；若通过当前消息变量或显式 context 联动，必须另行进入 `st-mvu-ejs-bridge` 并声明只读桥类型。
- 每个状态字段只有一个权威写者；模型 Patch、按钮脚本和其他自动化写入通道必须分别声明权限；UI 不创建影子状态树。
- `当前目标`、身份、关系、决定、承诺和完成状态只有在用户明确声明、明确放弃，或正文中发生可指认事实时才能更新；不能因为表单有该字段、样本有该字段或剧情“应该有”就补写。
- 数值变化必须能回指具体行为、时间推进或用户资料；没有证据就保持初值/未登记，不用数值填满页面。

## 完成判定

每个字段必须闭合：

```text
真实初值
→ 生产者/更新命令
→ Schema 或类型约束
→ 明确消息楼层的完整快照写入
→ 宿主保存
→ 同一存储面读回
→ UI/Prompt 消费者
```

`replaceMvuData` 的即时读回不等于耐久保存；MVU 初始化/更新事件也不等于消息已经持久化。没有真实宿主证据时记录 `runtime: not_run`。

## 世界书调度接入

世界书调度按 st-worldbook-regex/references/worldbook-routing.md：current_state 的近剧情 D0/D1 与普通世界背景的位置分开，不能把其它作品内容一律随变量放进聊天。默认禁用的 initvar 仍按初始化合同读取，位置字段不代表是否完成初始化。
