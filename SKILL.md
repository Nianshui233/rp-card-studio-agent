---
name: rp-card-studio
description: "Brainstorm, create, continue, convert, modify, review, QA, or deliver a SillyTavern RP character-card project, including playable concept outlines, worldbooks, characters, openings, MVU state, EJS templates, explicit MVU-to-EJS bridges, Tavern Helper scripts, regex, or in-message UI."
---

# SillyTavern 制卡工坊

1. 读取 `AGENT.md` 作为主契约。
2. 读取 `orchestrator/routing.yaml`、`orchestrator/stage-loop.md`、`orchestrator/interview-playbook.md`、`orchestrator/stage-authorization.md` 、`orchestrator/artifact-purity.md` 与 `orchestrator/automatic-work.md`。
3. 新项目或长期项目先加载 `rp-project-continuation`，初始化或读取 `制作文件/项目记录/authority.md`、`制作文件/项目记录/NEXT.md`、`制作文件/项目记录/materials.json`、`制作文件/项目记录/acceptance.json`，并在当前对话展示全阶段账本、当前授权和进度画板；确认/放权回到真实用户依据，不以旧勾选解锁阶段。
4. 只加载当前阶段主 Skill 及 `orchestrator/routing.yaml` 声明的支援 Skill；访谈控制器只在当前阶段需要用户创作决定时加载，不预读全部阶段 Skill。
5. 只有零散构想或整体重构需求时，先把灵感整合为可游玩创作母纲；方向已经清楚、定向修改或纯技术任务默认跳过脑暴。
6. 首次展示可选阶段/运行能力时，必须把“跨消息持久状态（MVU）”“变量结构校验（MVU_ZOD）”“动态 Prompt/世界书模板/条件渲染（EJS）”与“界面交互/酒馆助手”作为独立、可多选的选项同时展示；选择 MVU 不代表拒绝 EJS，未回答 EJS 也不等于关闭 EJS，选择 MVU_ZOD 也不等于自动完成 EJS。先用功能语言说明，再附技术名称；用户明确选择的能力不得被执行 Agent 静默关闭或降级。只有材料已明确解决或明确不适用时才能省略对应问题，并说明判断。
7. 有创作取舍时按 `rp-interview-orchestration` 的阶段覆盖地图访谈；每轮最多 3 个独立决策，不用一个综合题概括多个选择。
   前端布局讨论按 `shared/frontend/layout-preview.md` 主动展示结构草图与关键交互状态，不等用户自己画；有实际 HTML 时显示真实渲染预览，不把它当成用户接受或酒馆实机通过。
   开场与持续消息前端分别必读自身 opening-design/message-design 流程和独立资料索引，主动查真实外部参考。情绪答案不闭合整套设计，授权范围内完整实现并自查；方向反馈先重新判断，不只追加装饰，不以最小骨架或让用户导入试错交接。
8. 每次用户回答后立即写出或修改真实内容。用户说“按建议”或“你定”时，只对访谈控制器已明确呈现并授权的范围直接决定，不把创作负担重新推回用户，也不把未回答的高影响项静默关闭。
9. 选择 MVU_ZOD 后按完整路线交付，不得因缺 ZOD、详细更新规则、变量路径索引或输出格式而降级为 native/轻量子路线。交付时按 `制作文件/创作源/`、`制作文件/配置/`、`导入包/` 的职责结构或用户已有等价结构整理；先保留完整 canonical 世界/角色/系统/场景 YAML，再无损切片为世界书，不得为了条目简短而摘要、改写或删减已确认 RP 内容。遵守 `AGENT.md` 与 `orchestrator/artifact-purity.md` 的来源、分层、参考样本、状态来源和前端回归合同；没有真实宿主证据时明确记录 `runtime: not_run`。

10. 叙事与开场可选，分别选择叙事规则与开场的新增/沿用/不制作，未回答不等于关闭；开场前端与消息前端独立选择，保留既有内容和初始化检查。
11. 创作阶段提交后待审阅、授权到期，不自行进入下一创作阶段；阶段内 QA 和本次范围的技术收尾、整理交付默认执行，不单独报备。使用 `scripts/production/automatic-qa.mjs`，自动执行依据只继承制作范围，不制造用户接受。单独“继续”不接受交接或授权下一创作阶段。
12. 新项目启动只读发现酒馆安装和运行实例，续接复核、实机 QA 前刷新，读取并执行 `orchestrator/automatic-work.md` 的宿主发现合同。只保存当前环境，不将扫描结果写入 RP 内容；环境可见不等于运行验收通过。

## 作品保存位置

读取 `orchestrator/project-layout.md`：作品最外层只有导入包与制作文件。成品平铺在导入包；源码、配置、完整原稿、检查材料和项目记录都在制作文件，账本固定在制作文件/项目记录。不能只在交付时套一层新目录，也不能在旧项目旁边另建一套记录。此约定不改变 Agent 仓库自身结构。
