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

遵循 `orchestrator/interview-playbook.md`。每个创作取舍采用“问题＋建议＋为什么这样建议＋影响”，优先把抽象定位转成典型一轮体验，把世界概念转成日常、权力、压力和无人介入时的变化。问题可以多，但不能把空白构思或无解释的选项清单交给用户。

每次用户回答后立即写入或修改实际内容，并用一个短场景、日常片段、因果链或对比边界校准承重设定。用户完全放权时按建议直接完成。若上游已经完成脑暴，定位直接消费创作母纲并只补真实缺口，不重复从零访谈。阶段结束时由主 Agent 在对话中总结；本 Skill 不生成账本、决定锁、交接表或总结文件。

不得询问或代写最终玩家的具体身份、背景、能力和立场。只在需要时留下一个与题材兼容的空白 `<user>` 模板需求。
