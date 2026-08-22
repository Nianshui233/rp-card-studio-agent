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

遵循 `orchestrator/interview-playbook.md`。围绕用途、信息重点、设备、交互和视觉方向采用“问题＋建议＋为什么这样建议＋影响”。先问玩家何时需要信息、看完要做什么、哪个动作必须可靠，再由 Agent 决定 iframe、数据源、API 和生命周期；不要要求用户设计前端架构。

每次回答后立即写出或修改产品方案与真实 HTML，并用加载、空态、失败、窄屏或 Swipe 中至少一个真实情境校准。用户说“按建议”或“你定”时直接选择。不生成 UI 项目管理账本。

轻型前端可以直接写最终完整 `.html`。只有用户明确要求复杂、多页面或多人协作时，才临时拆分开发文件；不要默认维护 manifest、mock 或源码/制品双轨。

## 数据合同

正式渲染必须读取真实 MVU 路径或真实消息载荷；示例数据只用于预览。缺少数据时显示加载、空态、损坏或不可用，不用假值伪装成功。非 MVU 消息前端必须有真实输出合同、捕获方式、解析器、完整/流式处理和提示词通道。

每个动态页面先声明真实载体。Tavern Helper 路线的正则必须产出 fenced HTML 代码块；纯 SillyTavern 只做静态净化 HTML。消息 iframe 需要时探测当前窗口与 `window.parent`，使用数值楼层，并处理卸载、重载、编辑、Swipe 和聊天切换。按钮必须有真实动作、反馈和失败回退。

## 交付

最终页面必须是完整、自包含 HTML，包含 body、CSS 和 JavaScript。正则配置与 HTML 文件可以分开维护，但运行正则必须已包含同一页面的真实 fenced 载体；最终报告同时配对 marker、正则、HTML 和 provider。没有真实宿主证据时写 `runtime: not_run`。
