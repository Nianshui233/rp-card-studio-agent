---
name: st-message-frontend-authoring
description: "Private module for ongoing SillyTavern in-message frontends: status, inventory, relationships, tasks, maps, clues, actions, message-floor data, Swipe/edit refresh, lifecycle cleanup, and prompt/display carriers."
---

# SillyTavern Message Frontend Authoring

只接受主 Agent 调度。先读取当前消息表面需要的主参考，出现非 MVU 消息快照时再加载支援参考：

- 持续状态、交互与消息生命周期：`references/message-ui.md`
- 非 MVU 消息快照与正则载体：`references/non-variable-regex-ui.md`
- 字体、图标和资源策略需要时读取：`shared/frontend/ui-assets.md`

不要读取开场/创角前端参考，不处理玩家首次建档、路线选择或进入 greeting 的一次性流程。

## 接口

输入来自已经完成的内容和运行合同：

- 系统、场景和角色阶段提供玩家需要观察和操作的事实；
- `st-runtime-authoring` 提供唯一状态根、路径、作用域、读写权和更新方式；
- `st-worldbook-regex` / `st-render-regex` 提供 marker、载荷、prompt/display 和完整/流式路由；
- 宿主支援 Skill 提供当前楼层、事件、iframe 和父页能力事实。

本 Skill 输出：

- 一个或多个最终完整、自包含的消息 HTML 表面；
- 每个表面的真实 provider、marker、数据源和正则/EJS 配对；
- 当前数值楼层与 Swipe 对应的数据读取；
- 编辑、Swipe、消息更新、重载、切聊和重复挂载行为；
- 玩家动作、真实写入、同存储面读回、反馈和失败回退；
- 加载、空态、损坏、宿主不可用和 `pagehide` 清理。

## 持续生命周期

```text
消息 iframe 建立
→ 取得当前数值楼层与 Swipe
→ 读取真实状态或消息载荷
→ 渲染
→ 监听相关消息/变量事件
→ 玩家执行动作
→ 写入并从同一存储面读回
→ 刷新当前表面
→ 编辑/Swipe/重载时重新读取
→ iframe 销毁时清理
```

## 访谈方式

遵循 `orchestrator/interview-playbook.md`。围绕玩家每轮最常查看什么、看完后要做什么、哪些信息必须随 Swipe 更新、哪些按钮可以改变状态、手机上什么不能丢，以及失败时怎样反馈，采用“问题＋建议＋为什么这样建议＋影响”。用户不需要选择 iframe、API、变量路径或正则字段。

每次回答后立即修改真实 HTML，并用加载、空态、错误楼层、保存失败、窄屏、长文本、编辑或 Swipe 中至少一个情境校准。

## 边界

- 不制作项目介绍、完整创角、开局路线选择或 greeting 跳转。
- 不初始化第二套玩家档案或状态树；开场前端存在时只消费它已提交到真实运行合同的数据。
- 可以提供经授权的维护动作，但不能把持续面板变成隐藏的第二创角流程。
- 不把多文件工程、manifest、mock 或构建器作为默认交付。

## 交付

每个页面含完整 body、CSS 和 JavaScript，并明确 Tavern Helper fenced HTML、ST-Prompt-Template `@@iframe`、纯静态 SillyTavern 或其他已验证载体。正则配置与 HTML 可以分件维护，但运行规则必须已经包含同一页面的真实载体。没有真实宿主证据时写 `runtime: not_run`。
