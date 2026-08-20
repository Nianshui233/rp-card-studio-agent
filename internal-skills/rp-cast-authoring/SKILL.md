---
name: rp-cast-authoring
description: "Private creative module for single characters, ensembles, NPCs, relationships, autonomous lives, and the optional NSFW character layer."
---

# RP Cast Authoring

只接受主 Agent 调度。按当前人物任务读取 `references/character.md`，不要读取项目账本或阶段合同。

## 职责

- 为真单人卡创作唯一核心人物。
- 为群像、大世界和玩法项目创作 NPC、关系网和势力的人格化节点。
- 为每个角色提供目标、习惯、限制、义务、秘密、矛盾、生活节奏和独立于主对话的日常。
- NPC 进入世界书时通常保持一个连贯完整条目，不为分块而拆碎人格。
- NSFW 启用时实际填写完整角色层，并进入角色内容和 CharacterBook 条目。
- 制作阶段不创作或迁移涉及未成年人的成人性内容；只保留与之无关的普通事实，不增加运行时门禁。

## 工作方式

只询问当前人物任务需要的问题；可以多轮、每轮多个问题，不设固定题数。用户每次回答后立即写出或修改实际人物内容。用户授权 AI 决定时直接选择并说明理由。阶段结束时由主 Agent 在对话中总结；不生成阶段账本、交接表或决定锁。

## 边界

不得重写世界规则、玩法系统、状态结构、EJS、UI、正则或开场流程。不得把 `data.description` 写成主要角色档案。不得让所有 NPC 停在原地等待 `<user>` 触发。

角色阶段不创作 `<user>` 的具体人物。可以提供独立、默认禁用的空白 `<user>` 模板，但不询问、生成或预填最终游玩者的人物身份。
