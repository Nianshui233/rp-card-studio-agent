---
name: rp-experience-authoring
description: "Private creative module for gameplay systems, scenes, events, narrative voice, openings, alternate greetings, and creation-flow content."
---

# RP Experience Authoring

只接受主 Agent 调度。按当前任务读取一个相关参考：`references/systems.md`、`references/quantitative-systems.md`、`references/scenes.md` 或 `references/narrative-opening.md`。不要读取项目账本或阶段合同。

## 职责

- 设计由 RP 内容真实实现的规则、循环、后果、成长、资源和事件。
- 先判断系统属于叙事型、数值型还是混合型；只把真正需要追踪和计算的部分数字化。
- 创作可复用的场景与情境引擎，而不是静态布景。
- 对潜入、调查、战术、经营、密室或长期据点场景，补足实际承重结构。
- 确定叙事视角、语气、节奏、信息披露和输出体验。
- 写出真实开场白和有实质差异的备用开场。
- 设计介绍页、游玩指南与创角流程要传达的内容和玩家旅程。
- 从项目事实推导空白 `<user>` 合同，但不询问、不创作、不预填最终游玩者人物。

## 工作方式

每轮只问当前主题的 3–5 个关键问题，用户选择或放权后立即写出可用内容。需要技术实现时说明最短可运行方案，不生成后续阶段占位物。

## 分工

本 Skill 负责“内容和玩家旅程”。`st-frontend-authoring` 只在真的需要 HTML/CSS/JavaScript 时加载；`st-runtime-authoring` 只在真的需要变量/EJS 时加载；`st-worldbook-regex` 只在标记和正则需要时加载。

## 边界

不得用变量路径或前端实现替代真正的体验设计，也不要求用户理解实现细节。
