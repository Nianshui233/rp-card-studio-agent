---
name: rp-cast-authoring
description: "Private module for true single-character cards, ensembles, NPCs, relationships, autonomous lives, and the full optional NSFW character layer."
---

# RP Cast Authoring

只接受主 Agent 调度。创作或提问前完整读取 `shared/contracts/module-io.md` 与 `references/character.md`。

## 职责

- 为真单人卡创作唯一核心人物。
- 为群像、大世界和玩法项目创作 NPC、关系网和势力的人格化节点。
- 为每个角色提供目标、习惯、物质限制、义务、秘密、矛盾、生活节奏和独立于主对话的日常。
- NPC 进入世界书时通常保持一个连贯完整条目，不为分块而拆碎人格。
- NSFW 已启用时使用完整角色层，不用安全化、含糊化字段替换原本需要的具体描写；必须实际填写 `sexual_orientation`、`standing`、`fetish`、`preference`、`sex_organs`、`sensitive_areas` 与 `contrast`，并进入角色源码和 CharacterBook 条目。
- 制作阶段不创作或迁移涉及未成年人的成人性内容；旧卡中遇到时删除该部分，只保留可独立成立的普通角色事实。不要把这项制作期清理改写成角色设定里的成年门禁、年龄声明、拒绝话术或交付后的玩法限制。

## 边界

只询问角色阶段问题。不得重新决定世界规律、玩法系统、状态结构、EJS、UI、正则或开场流程。角色需求必须改变上游事实时返回交接。

不得把卡面的 `data.description` 写成主要角色档案。不得让所有 NPC 停在原地等待用户角色触发。可以保留独立、默认禁用的 `<user>` 模板，但不把它混入普通 NPC 定义。
