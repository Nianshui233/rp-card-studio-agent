---
name: rp-project-foundation
description: "Private module for positioning, materials, and autonomous worldbuilding. It is loaded only by the rp-card-studio Agent route."
---

# RP Project Foundation

只接受 SillyTavern制卡工坊主 Agent 的调度。完整读取 `shared/contracts/module-io.md`，并按当前阶段读取：

- `references/positioning.md`
- `references/materials.md`
- `references/worldbuilding.md`

## 职责

- 明确项目类型、核心循环和反复提供的 RP 体验。
- 大世界、玩法和群像项目使用概括世界与玩法的标题；只有真单人卡才使用唯一人物名。
- 为 `data.description` 创作项目入口和核心合同，不写人物档案。
- 整理用户材料；用户明确提供或授权的开源样本可以吸收其结构和方法，但最终源码应落在项目自身，不让运行时依赖参考目录。
- 对概念词、长叙事、旧世界转换、方向推翻、历史/IP 原型和多世界输入采用对应的整理路线，不把特殊输入压成普通问卷。
- 创作具有独立因果、制度、势力、地区、历史、压力、日常和未决运动的世界。
- 形成可被世界书按主题切割的连贯世界模块。

## 边界

只在对应阶段询问项目定位、材料或世界观问题。不得询问角色细节、玩法系统、MVU 字段、正则、开场文风或 UI 偏好。未来阶段信息写入待办或交接。

RP 本体使用可读 YAML 或自然文本，不把世界写成计算机配置。世界本体不定义用户角色，也不依赖用户角色介入才会运转。

与 `st-worldbook-regex` 协作时，只提供语义模块边界和激活意图，由它处理宿主调度字段。
