---
name: rp-experience-authoring
description: "Private module for gameplay systems, scenes, events, narrative voice, openings, alternate greetings, and creation-flow content."
---

# RP Experience Authoring

只接受主 Agent 调度。完整读取 `shared/contracts/module-io.md`，并按当前阶段读取：

- `references/systems.md`
- `references/quantitative-systems.md`（只有系统被判定为数值型或混合型时读取）
- `references/scenes.md`
- `references/narrative-opening.md`

## 职责

- 设计由 RP 内容真实实现的规则、循环、后果、成长、资源和事件。
- 先判断系统属于叙事型、数值型还是混合型；只把真正需要精确追踪和计算的部分数字化。
- 创作可复用的场景与情境引擎，而不是静态布景。
- 对潜入、调查、战术、经营、密室或长期据点场景，补足空间拓扑、权限、安保、线索、时间表和可破坏结构。
- 确定叙事视角、语气、节奏、信息披露和输出体验。
- 写出真实开场白和有实质差异的备用开场。
- 设计介绍页、游玩指南与创角流程要传达的内容和玩家旅程。

## 开场与前端分工

本 Skill 负责“开场说什么、有哪些选择、每个选择进入哪个真实开局”。`st-frontend-authoring` 负责 HTML/CSS/JavaScript；`st-runtime-authoring` 负责变量写入；`st-worldbook-regex` 负责标记和替换。

这些 Skill 在叙事与开场阶段作为支援模块时，只执行已经锁定的开场合同，不得询问状态栏/UI 阶段问题。

## 边界

只询问当前系统、场景或叙事与开场问题。不得无交接重开世界观和角色决定。不得用变量路径或前端实现替代真正的体验设计。
