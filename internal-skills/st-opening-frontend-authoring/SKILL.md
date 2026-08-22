---
name: st-opening-frontend-authoring
description: "Private module for one-shot SillyTavern opening and character-creation frontends: project introduction, route selection, blank player setup, preview, transactional write-back, persistence verification, and handoff into the normal user/assistant message chain."
---

# SillyTavern Opening Frontend Authoring

只接受主 Agent 调度。根据当前页面按需读取：

- 开场介绍、路线与页面载体：`references/opening-ui.md`
- 创角、事务写入、持久化与正常消息链：`references/creation-flow.md`
- 字体、图标和资源策略需要时读取：`shared/frontend/ui-assets.md`

不要读取持续消息前端参考，不处理每楼状态栏、背包、任务或长期消息控制中心。

## 接口

输入来自已经完成的内容和运行合同：

- `rp-experience-authoring`：项目介绍、路线含义、创角字段语义、默认/备用开场和 canonical 玩家开局发言；
- `st-runtime-authoring`：唯一状态根、稳定档案目标、动态初态目标、真实保存能力和读写权；
- `st-worldbook-regex` / `st-render-regex`：真实 marker、载体和 prompt/display 路由。

本 Skill 输出：

- 一个最终完整、自包含的开场/创角 HTML；
- 真实宿主载体、必要后台协调器和依赖说明；
- 草稿隔离、表单校验、预览、提交、失败回退和防重复提交；
- 唯一 canonical `<user>` 档案与目标 Greeting Swipe 动态初态的精确写入；
- `write_accepted`、`persisted`、读回和失败状态；
- 动态创角/自定义开局的真实 user 开局消息进入正常发送链，随后验证真实 AI 楼；固定 Greeting 选择可在确认目标 Swipe/初态后直接退出；
- 固定 Greeting 路线与动态创角路线各自的提交协议。

## 一次性生命周期

```text
建立页面并绑定当前 chat + 0楼 revision/Swipe + draft revision
→ 展示项目与路线
→ 玩家主动选择/填写
→ 预览与校验
→ 冻结提交上下文
→ 按路线执行事务写入与保存
→ 重新校验聊天/草稿/输入框/0楼
→ 固定 Greeting：确认目标 Swipe/初态后退出
→ 动态自定义开局：走正常 user 发送链并验证真实 user/AI 楼
→ 写 opening committed 标记
→ 页面使命结束
```

只改变页面局部对象、消息正文、输入框或内存变量不算全部成功。即时读回只证明内存接受；关键提交必须等待已验证的宿主保存，并按风险重载后再次读回。

## 固定 Greeting 与动态开局

- 固定 Greeting 路线：切换第 0 楼 `swipe_id` 后，旧 iframe可能立即销毁。后半段事务由后台 TH Script、父页协调器或新实例确认；目标 Swipe/初态成功后可把输入权交还玩家，不强制自动发送。
- 动态创角路线：最终构建一条 canonical 玩家开局发言，放入 ST 输入并走正常发送；不能用 `generate()`、只改 0 楼正文或直接插入 user 楼冒充正常消息链。
- 动态初态属于选中的目标 Swipe。若需要切 Greeting，先确认目标 Swipe，再向该 Swipe 写状态；不能先写当前 Swipe 后再切换。

## 访谈方式

遵循 `orchestrator/interview-playbook.md`。围绕玩家进入游戏前必须理解什么、哪些字段会改变开场、哪些内容可留到 RP 中自然形成、确认前需要预览什么，以及失败时怎样保留输入，采用“问题＋建议＋为什么这样建议＋影响”。用户不需要选择 iframe、API、变量作用域、消息楼层或 Schema。

每次回答后立即修改真实 HTML 或提交协调代码，并用空白输入、非默认路线、切聊天、切 Swipe、保存失败、输入框冲突、重复点击或正常 user→AI 消息链中的至少一个情境校准。

## 边界

- 不编写持续状态栏、背包、地图、任务面板或每消息行动界面。
- 不长期监听每个消息楼层；但提交期间必须监听或重校验聊天切换、0楼 Swipe/重渲染、页面卸载和草稿 revision，事务结束后清理。
- 可以预览初始状态，但不能把开场页面作为长期状态面板继续运行。
- 不自行发明第二套玩家档案或状态树；内容合同和运行合同不足时返回对应阶段补齐。
- 不生成开场需求表、创角字段清单、提交进度、handoff 文件、中间 YAML 规格、manifest、mock 或构建器；直接维护实际 HTML、协调脚本与真实运行组件。

## 交付

最终 HTML 含完整 body、CSS 和 JavaScript，并声明 Tavern Helper fenced HTML、ST-Prompt-Template `@@iframe`、纯静态 SillyTavern 或其他已验证载体。STPT 页面需要楼层信息时由 EJS context 显式写入，不调用 `getCurrentMessageId()`。为模型提供短文本回退，不把完整页面源码送入模型上下文。没有真实宿主证据时写 `runtime: not_run`。
