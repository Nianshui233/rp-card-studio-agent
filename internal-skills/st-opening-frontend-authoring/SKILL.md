---
name: st-opening-frontend-authoring
description: "Private module for one-shot SillyTavern opening and character-creation frontends: project introduction, route selection, blank player setup, preview, validated write-back, read-back, and handoff into the selected greeting."
---

# SillyTavern Opening Frontend Authoring

只接受主 Agent 调度。根据当前页面按需读取相关参考：

- 开场介绍、路线与页面载体：`references/opening-ui.md`
- 创角、写入、读回与进入开场：`references/creation-flow.md`
- 同时包含介绍/路线与创角提交时可以读取前两项；只实现其中一种时不要预读另一项。
- 字体、图标和资源策略需要时读取：`shared/frontend/ui-assets.md`

不要读取持续消息前端参考，不处理每楼状态栏、Swipe 刷新或长期消息监听。

## 接口

输入来自已经完成的内容和运行合同：

- `rp-experience-authoring` 提供项目介绍、路线含义、创角字段语义、默认/备用开场和玩家旅程；
- `st-runtime-authoring` 提供唯一状态根、真实写入位置、读回方式和读写权；
- `st-worldbook-regex` / `st-render-regex` 在需要时提供真实 marker、载体和 prompt/display 路由。

本 Skill 输出：

- 一个最终完整、自包含的开场/创角 HTML；
- 真实宿主载体和依赖说明；
- 表单校验、预览、提交、失败回退和防重复提交；
- 稳定 `<user>` 档案与动态初态的真实写入、分别读回和结果反馈；
- 已选择路线到实际 greeting/开场的明确交接。

## 一次性生命周期

```text
建立页面
→ 展示项目与路线
→ 玩家主动选择/填写
→ 预览与校验
→ 写入稳定档案和动态初态
→ 从同一真实存储面分别读回
→ 成功后进入对应开场
→ 页面使命结束
```

用户刷新或提交失败时保留可恢复输入；快速预设默认不选且提交前可编辑。只改变页面本地对象、聊天正文或输入框不算真实写入。

## 访谈方式

遵循 `orchestrator/interview-playbook.md`。围绕玩家进入游戏前必须理解什么、哪些字段会改变开场、哪些内容可留到 RP 中自然形成、确认前需要预览什么，以及失败时怎样回退，采用“问题＋建议＋为什么这样建议＋影响”。用户不需要选择 iframe、API、变量作用域或 Schema。

每次回答后立即修改真实 HTML 或真实创角/交接内容，并用空白输入、一个非默认选择、校验失败、写入失败或成功读回中的至少一个情境校准。

## 边界

- 不编写持续状态栏、背包、地图、任务面板或每消息行动界面。
- 不监听每个消息楼层的编辑、Swipe、重载和聊天切换。
- 可以预览初始状态，但不能把开场页面作为长期状态面板继续运行。
- 不自行发明第二套玩家档案或状态树；内容合同和运行合同不足时返回对应阶段补齐。
- 不把多文件工程、manifest、mock 或构建器作为默认交付。

## 交付

最终 HTML 含完整 body、CSS 和 JavaScript，并声明 Tavern Helper fenced HTML、ST-Prompt-Template `@@iframe`、纯静态 SillyTavern 或其他已验证载体。为模型提供短文本回退，不把完整页面源码送入模型上下文。没有真实宿主证据时写 `runtime: not_run`。
