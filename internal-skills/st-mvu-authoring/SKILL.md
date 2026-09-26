---
name: st-mvu-authoring
description: "Private module for MagVarUpdate state authoring: persistent state contracts, initvar, schemas, update commands, message snapshots, save/readback, and MVU-backed UI data. Does not author EJS templates."
---

# SillyTavern MVU Authoring

只接受主 Agent 调度。MVU 指 **MagVarUpdate 的状态系统**，不是 EJS，也不是泛指所有运行脚本。

按需读取：

- 制作规则：`references/mvu.md`
- 精确宿主行为：`references/mvu-runtime.md`
- 选择 `mvu_zod` 时必须读取：`references/mvu-zod.md`
- Tavern Helper API 事实由 `st-api-reference/references/tavern-helper-runtime.md` 提供。

## 何时启用

只有项目需要以下至少一项时启用：

- 跨消息持续变化的状态；
- 每个 Swipe/消息楼层的状态快照；
- 可验证的变量更新协议；
- 状态栏需要读取持久状态；
- 明确要求 MagVarUpdate、MVU_ZOD 或兼容旧 MVU 实现。

仅需要动态 Prompt、条件文本、世界书模板或 `@@iframe` 时，不启用本 Skill；那属于 `st-ejs-authoring`。

## 输出

- 唯一状态合同：根、路径、类型、初值、范围、空态、作用域、读写者、变化事件、保存和旧聊天处理；
- `native_schema` 或 `mvu_zod` 路线选择，并写入实际项目的 `配置/MVU运行合同.yaml`；
- `[initvar]` / Greeting `<initvar>`、更新规则、回复输出格式；
- 必要的 Loader、Schema/注册脚本、Tavern Helper 运行脚本；`mvu_zod` 缺 ZOD 脚本时阻断，不得静默降级为 native；
- 明确数值楼层、完整 MvuData 写入、保存与同面读回；
- 给开场登记和持续消息前端的稳定状态接口。

## 路线不可降级

先根据项目状态复杂度和用户要求明确记录当前对话中的 `mvu_mode`。选择 `mvu_zod` 后，完整 ZOD、初始化、详细更新规则、当前变量路径索引、输出格式、Regex 和消费者都是同一条路线的必需品。发现缺件时修复该路线，不能把错误实现改名为“轻量版”、降级为子路线或删除 ZOD 后声称 native 等价。

## 硬边界

- 不生成 `.ejs`、`<% %>`、`@@generate`、`@@iframe` 或 ST-Prompt-Template 设置。
- 不把 EJS 的 `global/local/message/cache/initial` 当成 MVU `stat_data`。
- 不因为用户需要状态栏就自动加入 EJS。
- 不假定 EJS 能读取 `stat_data`；两者联动必须另行进入 `st-mvu-ejs-bridge`。
- 每个状态字段只有一个权威写者；UI 不创建影子状态树。

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
