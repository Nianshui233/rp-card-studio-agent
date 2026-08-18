---
name: st-frontend-authoring
description: "Private module for opening/creation frontends, ongoing message UIs, modular browser-app development, and zero-layer experiences."
---

# SillyTavern Frontend Authoring

只接受主 Agent 调度。完整读取 `shared/contracts/module-io.md`、`references/ui-requirements-interview.md`、`references/ui-assets.md`、`references/status-ui.md` 与 `references/ui-app-authoring.md`。

## 两种不同前端

1. 开场介绍/创角前端：版本、世界介绍、更新信息、作者留言、游玩指南、创角选择与进入真实开场。
2. 持续消息前端：状态、导航、行动、信息、反馈和长期游玩功能。

不得把二者压成一个通用面板。分别决定规模、信息架构、源码目录、构建、正则路线、生命周期和验收。

## 需求访谈

UI 不是先写代码再补内容。进入对应前端阶段后，先按 `references/ui-requirements-interview.md` 建立 `ui_requirements`：只问缺失信息，每轮最多 3–4 个普通玩家能理解的问题，并在每轮给出方向差异、明确推荐和可直接合并的产品方案/源码片段。

先读取已经锁定的世界观、角色、系统、场景、MVU/EJS 和开场事实，主动整理字段、优先级、空态、数据规模和候选组件，不让用户重复填写，也不要求用户决定触发标记、变量路径、API、正则或输出模式。技术载体由 Agent 根据体验目标选择并解释。

“我不懂，给我推荐”时提供 2–3 个项目专属方向；用户明确完全放权时直接决定、报告理由并锁定，不再反复询问。视觉选项必须来自项目本身，不能只给通用的“蓝色科技仪表盘”。

字体和图标按 `references/ui-assets.md` 作为可选资产能力处理：中文字体可从 ZeoSeven Fonts 等来源进行选型，功能图标可采用 Font Awesome Free 的选定 SVG，但不把整站资源或远程 CDN 变成默认依赖。优先记录字体回退、内嵌 SVG、远程依赖和许可来源；资源加载失败时保留可读文字与可操作回退。

## 规模

轻型、轻中型、中型、重型、超重型依据视觉野心、信息密度、交互深度、JavaScript 行为、便利程度、趣味性、主题贴合和玩家体验判断，不以机械代码行数为唯一标准。

轻型仍然是完整、项目专属的前端应用，不能降级成几行状态条。超重型可以成为独立前端/0 层游玩体验。

## 开发方法

把 UI 当作真正的浏览器前端应用开发：拆分 HTML 结构、视觉系统、布局、组件、动效、状态读取、渲染、交互、宿主适配、生命周期、资源和模拟数据。最后通过 `rp-card-forge ui-build` 拼接为部署 HTML。单文件是交付形态，不是开发方式。

完整文档和消息表面都有效。父页面 DOM、宿主 API、输入框联动、浏览器存储、远程依赖、弹窗、复杂 JS 和私有 API 均可按项目需要使用。不得在聊天体验之外挂页面级常驻面板。

## 数据合同

模拟数据只用于预览。正式渲染必须读取 `st-runtime-authoring` 提供的真实路径，或明确的非 MVU XML/消息合同。缺少数据时显示加载、空态、损坏、陈旧或不可用状态，不能用看似合理的假数值伪装成功。

若需要流式楼层、主动 `generate/generateRaw`、消息替换、Vue/Pinia/Zod/Tailwind/Vite 工程、父页面补充组件或聊天切换自动重载，先由 `st-host-capabilities` 协商能力。普通消息内 UI 默认等文本完成后再渲染；流式表面必须单独记录挂载宿主、消息过滤、增量事件、失效楼层清理和卸载函数。

## 边界

作为主 Skill 时，只询问状态栏/UI 阶段问题；需要时分别询问开场前端与持续状态栏前端的规模。作为叙事与开场阶段的支援 Skill 时不询问 UI 阶段问题，只实现已经锁定的开场内容。缺少数据或标记合同时返回交接。
