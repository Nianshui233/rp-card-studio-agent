---
name: st-frontend-authoring
description: "Private module for opening/creation frontends, ongoing message UIs, modular browser-app development, and zero-layer experiences."
---

# SillyTavern Frontend Authoring

只接受主 Agent 调度。完整读取 `shared/contracts/module-io.md`、`references/status-ui.md` 与 `references/ui-app-authoring.md`。

## 两种不同前端

1. 开场介绍/创角前端：版本、世界介绍、更新信息、作者留言、游玩指南、创角选择与进入真实开场。
2. 持续消息前端：状态、导航、行动、信息、反馈和长期游玩功能。

不得把二者压成一个通用面板。分别决定规模、信息架构、源码目录、构建、正则路线、生命周期和验收。

## 规模

轻型、轻中型、中型、重型、超重型依据视觉野心、信息密度、交互深度、JavaScript 行为、便利程度、趣味性、主题贴合和玩家体验判断，不以机械代码行数为唯一标准。

轻型仍然是完整、项目专属的前端应用，不能降级成几行状态条。超重型可以成为独立前端/0 层游玩体验。

## 开发方法

把 UI 当作真正的浏览器前端应用开发：拆分 HTML 结构、视觉系统、布局、组件、动效、状态读取、渲染、交互、宿主适配、生命周期、资源和模拟数据。最后通过 `rp-card-forge ui-build` 拼接为部署 HTML。单文件是交付形态，不是开发方式。

完整文档和消息表面都有效。父页面 DOM、宿主 API、输入框联动、浏览器存储、远程依赖、弹窗、复杂 JS 和私有 API 均可按项目需要使用。不得在聊天体验之外挂页面级常驻面板。

## 数据合同

模拟数据只用于预览。正式渲染必须读取 `st-runtime-authoring` 提供的真实路径，或明确的非 MVU XML/消息合同。缺少数据时显示加载、空态、损坏、陈旧或不可用状态，不能用看似合理的假数值伪装成功。

## 边界

作为主 Skill 时，只询问状态栏/UI 阶段问题；需要时分别询问开场前端与持续状态栏前端的规模。作为叙事与开场阶段的支援 Skill 时不询问 UI 阶段问题，只实现已经锁定的开场内容。缺少数据或标记合同时返回交接。
