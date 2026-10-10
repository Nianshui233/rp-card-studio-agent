---
name: rp-project-continuation
description: "Maintain and resume a SillyTavern RP project across conversations using project authority, NEXT handoff, material provenance, acceptance evidence, and a current-dialogue progress board."
---

# RP 项目长期续接与进度画板

本 Skill 是 `rp-card-studio` 的强制续接模块。它把会影响后续创作、运行和交付的项目事实保存到项目目录，同时把当前状态以进度画板展示在当前对话中。

先读取 `orchestrator/stage-authorization.md`；账本可以记录决定，不能产生用户授权。

## 文件职责

长期项目默认维护：

```text
项目名/
└─ 制作文件/项目记录/
   ├─ authority.md       # 项目权威：确定项、待决定、范围、能力和当前状态
   ├─ NEXT.md            # 当前续接指针：从哪里继续、下一道门是什么
   ├─ materials.json     # 材料与创作条目的来源关系
   └─ acceptance.json    # 静态、浏览器、真实宿主和人工验收证据
```

`制作文件/项目记录/` 是项目状态的一部分，不进入最终 SillyTavern 导入包。它不能替代 `制作文件/创作源/`、`制作文件/配置/` 或 `导入包/` 中的真实内容和制品。

## 什么时候初始化或读取

- 新建项目：预检确定工作目录后初始化最小权威文件，并在本轮形成真实内容后补齐状态。
- 继续、转换、修改、审查旧卡：先读取 `制作文件/项目记录/`，再读取当前源文件、制品和 Git/worktree。
- 定向任务：只更新受影响阶段、当前范围和下一道门，不重开无关阶段。
- 单轮轻量问答：可以不初始化项目文件；一旦产生真实 RP 内容、运行组件、阶段决定或交付制品，就应建立或更新 `制作文件/项目记录/`。

## 续接协议

用户说“继续”“续接”或返回中断项目时，必须按顺序：

1. 读取项目规则、`制作文件/项目记录/authority.md`、`制作文件/项目记录/NEXT.md`、材料索引和验收记录；
2. 读取实际创作源、配置、导入制品和当前 Git/worktree；
3. 检查权威文件、实际文件、制品哈希和验收证据是否一致；
4. 在当前对话先展示进度画板；
5. 说明已确认、已完成、尚未完成、待决定、暂缓、阻断和下一道门；
6. 只询问真正开放或发生冲突的决定，不重新询问已确认内容；
7. 在本轮真实授权范围内完成当前步骤后立即更新真实内容、`authority.md` 和 `NEXT.md`，再刷新画板；创作成果提交时待审阅、放权到期，不自动推进下一创作阶段；本次范围的 QA 与交付按 orchestrator/automatic-work.md 默认执行，承接后来源保持 authored/pending，不制造用户接受；
8. 如果权威与实际实现或用户来源冲突，暂停继续打包或提升状态，记录冲突；无依据的确认保留为 proposed/unresolved，不假造用户原话，不重新询问已有可核对依据的设置。
9. 使用 continuation CLI validate 检查逐条来源/授权/阶段引用；旧 v1 返回 migrationRequired，不自动将旧完成勾选当用户接受。跨宿主拿不到原消息时说明来源真实性未核验，暂停依赖它的提升。

不得把聊天摘要、旧报告、自动测试或文件名当成当前权威；必须回读当前文件。

## 当前环境复核

读取 orchestrator/automatic-work.md：新项目默认只读发现当前可访问的酒馆安装和运行实例，续接复核制作文件/项目记录/host-environment.json，环境变化或实机 QA 前刷新。只保存当前记录，不存扫描历史；不把已有探测当成当前可用，也不因发现环境而自动取得实机操作权限。

## authority.md 合同

必须包含 YAML front matter：

```yaml
schema: rp-card-studio/authority/v2
project_id: stable-project-id
title: 项目标题
status: candidate | driver-approved-design | implementation-candidate | automated-evidence | real-host-evidence | driver-accepted
current_stage: preflight | continuation | brainstorm | positioning | materials | worldbuilding | character | systems | scenes | mvu | ejs | runtime_bridge | narrative_opening | opening_frontend | message_frontend | qa_delivery
creation_mode: open_world | fixed_protagonist | open_world_with_presets
nsfw: enabled | disabled | unresolved
mvu: enabled | disabled | unresolved
mvu_zod: enabled | disabled | unresolved
ejs: enabled | disabled | unresolved
bridge: enabled | disabled | unresolved | not_applicable
updated: YYYY-MM-DD
next_gate: 一道具体可观察的门
```

正文必须使用这些区块：

```text
## 项目目标与范围
## 阶段账本
## 当前授权
## 授权与决定记录
## 已确认创作事实
## 已确认运行能力
## 待决定事项
## 已否决事项
## 玩家中立性合同
## 创作源映射
## 角色卡与组件映射
## 运行依赖
## 已完成阶段
## 当前风险
## 验收摘要
## 下一道门
```

阶段账本区块使用模板中的单个完整 JSON 块，包含 stages、userEvidence、authorizations 和 decisions；所有 routing 阶段都列出。当前授权、已完成阶段、NEXT 与画板仅为该 JSON 的派生视图，不独立登记确认。

决策 ID 只能位于“已确认创作事实”“已确认运行能力”“待决定事项”“已否决事项”中的一个区块。状态变化时移动记录，不复制两份。

## NEXT.md 合同

`NEXT.md` 只记录当前交接，不重复保存完整创作正文：

- 当前阶段；
- 已完成；
- 当前未完成；
- 当前风险；
- 本轮允许修改；
- 本轮不扩大；
- 下一道门；
- 下一次续接指令。

每次实际推进后更新它。它是下一次 Agent 的最短可靠入口。

## 材料和验收

`materials.json` 使用 `rp-card-studio/materials/v2`，维护任意规模原始资料的来源、整理状态、事实、制卡候选、冲突、研究问题和外部研究状态。原始资料只要进入当前创作/制卡任务，`processing.status` 不得保持 `absent`；资料大小只改变 `processing.mode`（`single-pass`、`chunked`、`batched`）。外部作品、现实事实、版本或改编线依赖默认把 `research.status` 设为 `required`，主动研究完成、受阻或用户关闭时分别记录 `complete`、`blocked` 或 `skipped` 及原因。抽取不等于确认；推断必须标明来源和状态。

`acceptance.json` 的证据门分开记录：`source`、`automated`、`offline-artifact`、`browser`、`real-sillytavern`、`human`、`release`。自动化不能填写 `driver-accepted`。证据绑定当前制品、环境、步骤、预期、限制和文件哈希。

## 当前对话进度画板

每轮产生真实内容、修改、决定、测试结果或阻断变化后，必须在对话中刷新画板。画板必须放在 Markdown fenced code block 中，使用短标题和项目符号，不使用依赖固定宽度的 Unicode 外框线；每条事项尽量保持单行简短，避免长句横向堆叠：

```text
【RP 项目进度画板】
项目：<title>
阶段：<current_stage>（进度）
用户审阅：<待审阅/已接受/依据不足>
后续推进：<等待用户或当前阶段范围>

阶段账本
- <阶段>：<进度>；<放权状态>；<用户审阅>

当前授权
- <AUTH ID、允许范围、排除范围、真实来源、阶段交接到期>

范围：<当前版本/本轮范围>

已完成
- ✓ <事项>（证据/文件）

进行中
- → <事项>

待决定
- ? <事项>（影响）

暂缓
- · <事项>（不计入当前范围）

阻断/待实测
- ! <事项>（解除条件）

下一道门
- ⇒ <可观察的下一步>
```

- 画板必须保持在代码围栏内，避免聊天界面把空格、边框和换行重新排版；
- “已完成”必须有实际内容或证据；
- “进行中”只能有当前真正推进的相邻事项；
- “待决定”不能被沉默自动关闭；
- “暂缓”不进入当前范围，不伪装成完成；
- “阻断/待实测”必须写解除条件；
- 没有确认范围时不显示虚假的百分比；有百分比时必须同时显示分母、证据和未验收门；
- 画板是当前对话的实时投影，`制作文件/项目记录/NEXT.md` 是跨会话的持久指针；两者不应互相矛盾。

## 不保存什么

保存项目事实、决定状态、材料来源、制品映射、验收证据和当前交接；不保存完整聊天记录、每轮问答原文、无意义的过程碎片或重复的创作正文。过程文件不进入导入包。

## 校验边界

`validate` 的结构通过不证明用户原话真实或语义授权充分。sourceAuthenticity 始终为 not_verified；同一模型写/审账本不能宣称宿主硬锁。阶段放权只支持 delegated 决定，不能写成用户逐项 user_confirmed。
