---
name: rp-project-foundation
description: "Private creative module for project positioning, source-material review, old-card inventory, and autonomous worldbuilding. Use only for the user's current foundation task."
---

# RP Project Foundation

只接受 SillyTavern制卡工坊主 Agent 调度。根据当前请求只读取一个相关参考：

- 项目定位：`references/positioning.md`
- 材料或旧卡盘点：`references/materials.md`
- 世界观：`references/worldbuilding.md`

不要读取其他参考，不维护项目账本、阶段状态、Schema 或装配清单。

## 职责

- 明确项目标题、核心体验、内容范围和反复发生的 RP 循环。
- 整理用户材料；旧卡先保留原始副本并盘点世界书、正则、脚本、MVU/EJS、HTML、用户条目、未知扩展和媒体。
- 创作具有独立因果、制度、势力、地区、历史、压力、日常和未决运动的世界。
- 输出可直接进入世界书的连贯中文 YAML 或自然文本。
- 大世界、玩法和群像项目使用整体标题；真正单人卡才使用唯一人物名。
- `data.description` 写项目入口和核心体验，不放人物档案。

## 工作方式

每轮最多询问 3–5 个当前主题问题，给出明确推荐，然后立即写入实际内容。用户完全放权时直接完成，不生成阶段总汇、决定锁或交接表。

不得询问或代写最终玩家的具体身份、背景、能力和立场。只在需要时留下一个与题材兼容的空白 `<user>` 模板需求。
