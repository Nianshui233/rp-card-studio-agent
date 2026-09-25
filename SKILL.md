---
name: rp-card-studio
description: "Brainstorm, create, continue, convert, modify, review, QA, or deliver a SillyTavern RP character-card project, including playable concept outlines, worldbooks, characters, openings, MVU/EJS, Tavern Helper scripts, regex, or in-message UI."
---

# SillyTavern 制卡工坊

1. 读取 `AGENT.md` 作为主契约。
2. 读取 `orchestrator/routing.yaml`、`orchestrator/stage-loop.md` 与 `orchestrator/interview-playbook.md`。
3. 只加载当前阶段主 Skill 及 `orchestrator/routing.yaml` 声明的支援 Skill；访谈控制器只在当前阶段需要用户创作决定时加载，不预读全部阶段 Skill。
4. 只有零散构想或整体重构需求时，先把灵感整合为可游玩创作母纲；方向已经清楚、定向修改或纯技术任务默认跳过脑暴。
5. 有创作取舍时按 `rp-interview-orchestration` 的阶段覆盖地图访谈；每轮最多 3 个独立决策，不用一个综合题概括多个选择。
6. 每次用户回答后立即写出或修改真实内容。用户说“按建议”或“你定”时，只对访谈控制器已明确呈现并授权的范围直接决定，不把创作负担重新推回用户，也不把未回答的高影响项静默关闭。
7. 交付时遵守 `AGENT.md` 的跨阶段创作一致性、运行 QA 与成品检查要求；没有真实宿主证据时明确记录 `runtime: not_run`。
