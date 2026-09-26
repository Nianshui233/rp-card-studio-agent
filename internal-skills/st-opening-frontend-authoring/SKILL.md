---
name: st-opening-frontend-authoring
description: "Private module for one-shot SillyTavern opening and character-creation frontends: project introduction, route selection, blank player setup, preview, clipboard handoff, manual Greeting selection, and user-controlled first-message startup."
---

# SillyTavern Opening Frontend Authoring

只接受主 Agent 调度。根据当前页面按需读取：

- 开场介绍、路线与页面载体：`references/opening-ui.md`
- 创角、剪贴板交接与手动开场：`references/creation-flow.md`
- 字体、图标和资源策略需要时读取：`shared/frontend/ui-assets.md`

不要读取持续消息前端参考，不处理每楼状态栏、背包、任务或长期消息控制中心。

## 接口

输入来自已经完成的内容和运行合同：

- `rp-experience-authoring`：项目介绍、路线含义、创角字段语义、默认/备用 Greeting 和 canonical 玩家开局发言；
- `st-mvu-authoring`：项目启用 MVU 时，首条玩家登记消息如何进入状态，以及状态栏怎样验证登记结果；EJS 不负责玩家档案持久化；
- `st-worldbook-regex` / `st-render-regex`：真实 marker、载体和 display 路由。

本 Skill 输出：

- 一个最终完整、自包含的开场/创角 HTML；
- 表单校验、预览、返回修改、生成开局文本、复制与手动复制回退；
- 每条路线对应的真实 Greeting/Swipe 人类可读指引；
- 一条由玩家亲手粘贴并发送的 canonical 开局登记文本；
- 发送后如何确认真实 user 楼、AI 回复和玩家状态已经登记；
- 无脚本、剪贴板被拒绝或页面重载时仍能操作的回退说明。

## 硬边界：开场页不写世界书

开场/创角前端是**内容生成器与操作向导**，不是数据迁移器。默认且推荐合同是：

- 不调用 `createWorldbookEntries`、`updateWorldbookWith`、`deleteWorldbookEntries`；
- 不创建、覆盖、启用或禁用 `<user>` 条目；
- 不直接修改第 0 楼、Greeting Swipe、聊天 metadata 或 MVU；
- 不调用 `/send`、`/trigger` 或直接插入 user 楼；
- 不覆盖 SillyTavern 输入框。

创角完成后，页面只生成并复制一段清晰、可审阅的玩家开局登记文本。玩家按指引手动切换到目标 Greeting，把文本粘贴为新聊天的第一条玩家消息并亲手发送。世界书如需静态玩家模板，只能由制作者在交付文件中预先提供，或由用户明确手工维护；开场页不得在运行时改写它。

## 后续新增开局资料与状态归属

如果创角访谈中新要求的字段不在已确认的玩家资料/初态合同里，先区分它是本次页面临时草稿、已有 canonical 状态的另一种展示，还是需要进入长期状态/玩法的新字段。前端不得为了输出更多内容就自行扩展隐藏档案或 MVU 变量。

- 临时且发送后不保留的表单值只进入页面草稿。
- 已有持久字段写进 canonical 开局登记文本，由首轮运行合同读取。
- 新增会长期保留或影响游戏的资料，返回 owning stage 确认语义，再回 `mvu` 定义路径、首次登记、后续更正和旧聊天兼容；然后回到开场页补充输出字段。
- 只重开受影响字段，不重做整张页面；未确定的字段明确标记“未设定”，不得静默补全。

## 一次性生命周期

```text
展示项目与路线
→ 玩家主动选择/填写
→ 页面本地校验与预览
→ 生成 canonical 开局登记文本
→ 玩家点击复制；失败则选中文本并提示 Ctrl+C
→ 告知应手动切换到哪个 Greeting
→ 玩家把文本粘贴为新聊天第一条消息并亲手发送
→ AI 首轮按运行合同登记状态并继续剧情
→ 玩家从状态栏确认称呼/路线不再是“待登记”
→ 页面使命结束
```

页面可以保存本地临时草稿，但不得把“已复制”当作“已发送”，也不得把“AI 已回复”当作“变量已登记”。这三种状态要用不同措辞。

## Greeting 与开局文本

- 每条可选路线都必须存在可手动选择的真实 Greeting/Swipe；自定义来意也应有一个静态的“自由来意” Greeting，不能依赖脚本临时重写第 0 楼。
- 页面用玩家语言说明如何通过左右 Swipe 或 Greeting 菜单切换，不暴露内部数组索引作为唯一指引。
- 生成文本至少包含：项目可识别 marker、玩家公开资料、所选路线/来意、未授权补全边界和“承接当前 Greeting”的明确要求。
- 玩家发送后，首轮运行合同可以把登记内容写入 MVU；登记完成后不再根据叙事猜测修改玩家档案，只有玩家明确更正时才变更指定字段。
- 开局文本必须能直接阅读和手工编辑；不把关键数据藏进不可见编码、HTML 属性或跨 iframe 内存。

## 访谈方式

遵循 `rp-interview-orchestration` 和 `orchestrator/interview-playbook.md`。开场/创角页面的**主题气质、第一印象、页面内容和呈现方式是核心产品决定**。开始视觉实现前，除非用户已给完整要求或明确授权自由设计，至少了解：

- 想给玩家什么第一印象；喜欢/不喜欢什么作品、UI 气质或视觉参考；
- 想展示什么介绍、玩法、路线、角色/世界资料，哪些应留给游玩发现；
- 喜欢简洁向导、沉浸序章、档案/设定集等哪种阅读节奏与版面层次；
- 创角希望一页完成还是分步引导，以及预览、返回修改、复制成功、复制失败和操作指引怎样呈现。

不要问 CSS、框架、DOM、API、iframe 或剪贴板权限实现。用户只需要决定看到什么、感觉如何以及希望怎样完成开场。

## 完成门槛

至少验证：

- 窄屏和宽屏可完成全部表单；
- 未填必填项不会生成旧文本；
- 修改字段后旧预览/旧复制内容失效；
- Clipboard API 成功路径与拒绝后的手动复制回退；
- 页面、协调器和打包产物中不存在世界书写入、自动 `/send`、自动 Swipe 修改；
- 每条路线都有真实静态 Greeting；
- 玩家按指引发送登记文本后，运行合同能在首个 AI 回复中登记状态；
- 没有真实宿主证据时只声明静态或浏览器级通过，不声明 SillyTavern runtime pass。
