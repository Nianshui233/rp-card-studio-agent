---
name: st-message-frontend-authoring
description: "Private module for ongoing SillyTavern in-message frontends: status, inventory, relationships, tasks, maps, clues, actions, provider-specific message-floor data, Swipe/edit refresh, persistence verification, lifecycle cleanup, and prompt/display carriers."
---

# SillyTavern Message Frontend Authoring

只接受主 Agent 调度。先读取当前消息表面需要的主参考，出现非 MVU 消息快照时再加载支援参考：

- 持续状态、交互与消息生命周期：`references/message-ui.md`
- 非 MVU 消息快照与正则载体：`references/non-variable-regex-ui.md`
- 字体、图标和资源策略需要时读取：`shared/frontend/ui-assets.md`

不要读取开场/创角前端参考，不处理玩家首次建档、路线选择或进入 Greeting 的一次性流程。

## 接口

输入来自已经完成的内容和运行合同：

- 系统、场景和角色阶段提供玩家需要观察和操作的事实；
- `st-runtime-authoring` 提供唯一状态根、路径、作用域、读写权、保存方式和更新事件时序；
- `st-worldbook-regex` / `st-render-regex` 提供 marker、载荷、prompt/display 和完整/流式路由；
- 宿主支援 Skill 提供当前楼层、Swipe、iframe、父页能力和清理事实。

本 Skill 输出：

- 一个或多个最终完整、自包含的消息 HTML 表面；
- 非 MVU 路线的实际 producer 输出合同、版本化载荷 Schema、fixture 和 parser；
- 每个表面的真实 provider、adapter、marker、数据源和正则/EJS 配对；
- 当前数值楼层与 Swipe 对应的数据读取；
- 编辑、Swipe、消息更新、重载、切聊和重复挂载行为；
- 玩家动作、真实写入、保存、同存储面读回、反馈和失败回退；
- 加载、空态、损坏、宿主不可用和 `pagehide` 清理；
- 键盘、焦点、ARIA、触控、长列表、性能和调试降级。

## 后续新增展示项与状态归属

用户在本阶段新增展示/操作要求时，不把已定 MVU 合同视作永不变化，也不由前端自行加游戏变量。先按 `rp-interview-orchestration` 将每项分为：已有状态直读、由已有状态/已确认规则推导的只读视图、临时 UI 状态、或新的持久化状态/玩法规则。

- 已有字段：沿用原路径和唯一权威来源。
- 可推导项：只有确定性计算且不需保存、不改变模型后续决策时，才在视图层派生；有世界/场景/权限语义时先回对应领域阶段确认规则。
- 临时 UI 项：如折叠、当前标签页、临时筛选，不写进 MVU。
- 新持久状态或新玩法：暂停该项前端实现，回 `systems`/`scenes`/`character` 确认语义，回 `mvu_ejs` 确认状态根、初值、范围、唯一写者、变化事件、玩家可见性、作用域、保存和旧聊天处理，然后才接入 UI。只重开受影响的决定，完成后返回当前前端阶段。

状态栏只能消费 canonical 状态或已确认派生规则；不得为让 UI 显示而创建影子状态、假值或另一套持久化。若语义尚未定，可以先搭可逆视觉占位草稿，但必须标出未接通，不得声称功能可用。

## 持续生命周期

```text
消息表面建立
→ 通过 provider 专用 adapter 取得数值楼层与 Swipe
→ 读取真实状态或消息载荷
→ 渲染
→ 监听宿主编辑/Swipe 与项目自有 post-write 信号
→ 玩家执行动作
→ 写入明确数值楼层
→ 等待必要保存并同楼读回
→ 刷新当前表面
→ 编辑/Swipe/重载时重新读取
→ 页面销毁时清理
```

MVU 的 `VARIABLE_INITIALIZED/VARIABLE_UPDATE_ENDED` 是内存变换事件，不是消息变量持久化完成。不要在事件中立即重读 `Mvu.getMvuData()`。assistant 更新通常随后重渲染并重建 iframe；user 消息变量更新没有同等保证，需要项目自有 post-write 信号或显式刷新。

## Provider adapter

- TH fenced iframe：使用 `getCurrentMessageId()`、裸 TH API 与裸事件清理；
- STPT `@@iframe`：由 EJS render context 把 `message_id/swipe_id` 写入页面，显式探测 `window.parent` 能力，所有 namespace 事件句柄主动 stop；
- 纯 SillyTavern：只做受限静态展示，不承诺按钮、变量或脚本；捕获值直接进入 HTML 时必须有可证明的字符边界或明确允许净化后的有限 markup；
- 其他 provider：先写明如何获得 message ID、如何读写、如何保存、如何清理，再实现页面。

不能把 TH 专用 `getCurrentMessageId/eventOn` 合同泛化到所有 iframe。

## 访谈方式

遵循 `rp-interview-orchestration` 和 `orchestrator/interview-playbook.md`。持续状态栏是玩家反复看见的产品界面，**用户的视觉风格、排版偏好、要展示的信息和交互感受是第一优先级**，不能由 Agent 套通用仪表盘后只让用户检查功能。除非用户已给完整设计简报或明确授权自由设计，开始视觉实现前至少确认：

- 状态栏应融入作品世界的什么气质；用户喜欢/不喜欢的参考作品、界面或风格；
- 玩家实际想看到哪些状态、变化、关系、任务、物品或氛围内容，哪些常驻、折叠或仅变化时提示；
- 更偏紧凑的一眼扫读、叙事卡片、档案/终端、地图/控制台等怎样的信息呈现与排版密度；
- 看完后要执行的主要操作，按钮、确认、反馈和可撤销行为希望如何表现。

“最易读的默认 HUD”只能作为有理由的候选建议，不能替代询问用户自己的定制要求。可给少量明显不同的视觉/交互方向供选择或混搭。不要询问 CSS、框架、DOM、API、iframe 或断点等实现细节；实现后用真实内容与交互状态校准用户想要的效果。

每次回答后立即修改真实 HTML，并用加载、空态、错误楼层、保存失败、窄屏、长文本、编辑或 Swipe 中至少一个情境校准。

## 边界

- 不制作项目介绍、完整创角、开局路线选择或 Greeting 跳转。
- 不初始化第二套玩家档案或状态树；开场前端存在时只消费它已提交到真实运行合同的数据。
- 可以提供经授权的维护动作，但不能把持续面板变成隐藏的第二创角流程。
- 不生成 UI 需求表、数据路径清单、生命周期账本、中间 YAML 规格、manifest、mock 或构建器；直接维护实际 HTML 与真实运行组件。

## 交付

每个页面含完整 body、CSS 和 JavaScript，并明确 Tavern Helper fenced HTML、ST-Prompt-Template `@@iframe`、纯静态 SillyTavern 或其他已验证载体。正则配置与 HTML 可以分件维护，但运行规则必须包含同一页面的真实载体。没有真实宿主证据时写 `runtime: not_run`。
