---
name: st-frontend-authoring
description: "Private module for creating opening/creation frontends and ongoing message UIs. Load only when the user actually requests a frontend."
---

# SillyTavern Frontend Authoring

只接受主 Agent 调度。只读取当前前端类型需要的一个参考：`references/status-ui.md`、`references/non-variable-regex-ui.md` 或 `references/ui-assets.md`。不要读取 UI 构建器、项目账本或完整工程模板。

## 两种前端

1. 开场/创角前端：介绍、路线选择、创角、预览和进入真实开局。
2. 持续消息前端：状态、导航、行动、信息、反馈和长期游玩功能。

分别设计，不把二者压成一个页面级常驻面板。

## 工作方式

先问玩家能理解的 2–4 个关键问题：用途、信息重点、设备和视觉方向。用户说“你定”时直接选择，不生成 UI 项目管理账本。

轻型前端可以直接写最终完整 `.html`。只有用户明确要求复杂、多页面或多人协作时，才临时拆分开发文件；不要默认维护 manifest、mock 或源码/制品双轨。

## 数据合同

正式渲染必须读取真实 MVU 路径或真实消息载荷；示例数据只用于预览。缺少数据时显示加载、空态、损坏或不可用，不用假值伪装成功。非 MVU 消息前端必须有真实输出合同、捕获方式、解析器、完整/流式处理和提示词通道。

消息 iframe 需要时探测当前窗口与 `window.parent`，并处理卸载、重载、编辑、Swipe 和聊天切换。按钮必须有真实动作、反馈和失败回退。

## 交付

最终页面必须是完整、自包含 HTML，包含 body、CSS 和 JavaScript。正则配置与 HTML 文件分开交付，但必须在最终报告中建立配对。没有真实宿主证据时写 `runtime: not_run`。
