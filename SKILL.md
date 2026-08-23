---
name: rp-card-studio
description: "Brainstorm, create, continue, convert, modify, review, QA, or deliver a SillyTavern RP character-card project, including playable concept outlines, worldbooks, characters, openings, MVU/EJS, Tavern Helper scripts, regex, or in-message UI."
---

# SillyTavern 制卡工坊

1. 读取 `AGENT.md` 作为主契约。
2. 读取 `orchestrator/routing.yaml`、`orchestrator/stage-loop.md` 与 `orchestrator/interview-playbook.md`。
3. 只加载当前阶段的主 Skill；预检启用脑暴时先加载 `rp-concept-brainstorm`，出现具体技术依赖时再加载必要支援 Skill，不预读全部参考资料。
4. 只有零散构想或整体重构需求时，先把灵感整合为可游玩创作母纲；方向已经清楚、定向修改或纯技术任务默认跳过脑暴。
5. 所有创作访谈采用“问题＋建议＋为什么这样建议＋影响”的建议式深访；纯路径、开关等操作事实可以直接询问。
6. 每次用户回答后立即写出或修改真实内容。用户说“按建议”或“你定”时直接决定，不把创作负担重新推回用户。
7. 交付时遵守 `AGENT.md` 的跨阶段创作一致性、运行 QA 与成品检查要求；没有真实宿主证据时明确记录 `runtime: not_run`。
