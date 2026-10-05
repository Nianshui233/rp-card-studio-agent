---
name: rp-project-continuation
description: "Maintain and resume a SillyTavern RP project across conversations using project authority, NEXT handoff, material provenance, acceptance evidence, and a current-dialogue progress board."
---

# RP 项目长期续接与进度画板

本 Skill 是 `rp-card-studio` 的强制续接模块。它把会影响后续创作、运行和交付的项目事实保存到项目目录，同时把当前状态以进度画板展示在当前对话中。

## 文件职责

长期项目默认维护：

```text
项目名/
└─ .rp-card/
   ├─ authority.md       # 项目权威：确定项、待决定、范围、能力和当前状态
   ├─ NEXT.md            # 当前续接指针：从哪里继续、下一道门是什么
   ├─ materials.json     # 材料与创作条目的来源关系
   └─ acceptance.json    # 静态、浏览器、真实宿主和人工验收证据
```

`.rp-card/` 是项目状态的一部分，不进入最终 SillyTavern 导入包。它不能替代 `创作源/`、`配置/` 或 `导入：项目名/` 中的真实内容和制品。

## 什么时候初始化或读取

- 新建项目：预检确定工作目录后初始化最小权威文件，并在本轮形成真实内容后补齐状态。
- 继续、转换、修改、审查旧卡：先读取 `.rp-card/`，再读取当前源文件、制品和 Git/worktree。
- 定向任务：只更新受影响阶段、当前范围和下一道门，不重开无关阶段。
- 单轮轻量问答：可以不初始化项目文件；一旦产生真实 RP 内容、运行组件、阶段决定或交付制品，就应建立或更新 `.rp-card/`。

## 续接协议

用户说“继续”“续接”或返回中断项目时，必须按顺序：

1. 读取项目规则、`.rp-card/authority.md`、`.rp-card/NEXT.md`、材料索引和验收记录；
2. 读取实际创作源、配置、导入制品和当前 Git/worktree；
3. 检查权威文件、实际文件、制品哈希和验收证据是否一致；
4. 在当前对话先展示进度画板；
5. 说明已确认、已完成、尚未完成、待决定、暂缓、阻断和下一道门；
6. 只询问真正开放或发生冲突的决定，不重新询问已确认内容；
7. 完成当前步骤后立即更新真实内容、`authority.md` 和 `NEXT.md`，再刷新画板；
8. 如果权威与实际实现冲突，暂停继续打包或提升状态，记录冲突并请用户确认权威来源。

不得把聊天摘要、旧报告、自动测试或文件名当成当前权威；必须回读当前文件。

## authority.md 合同

必须包含 YAML front matter：

```yaml
schema: rp-card-studio/authority/v1
project_id: stable-project-id
title: 项目标题
status: candidate | driver-approved-design | implementation-candidate | automated-evidence | real-host-evidence | driver-accepted
current_stage: preflight | brainstorm | positioning | materials | worldbuilding | character | systems | scenes | mvu | ejs | runtime_bridge | narrative_opening | opening_frontend | message_frontend | qa_delivery
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

`materials.json` 维护：材料片段 → 设定声明 → 目标条目/组件 → 证据的关系。抽取不等于确认；推断必须标明来源和状态。

`acceptance.json` 的证据门分开记录：`source`、`automated`、`offline-artifact`、`browser`、`real-sillytavern`、`human`、`release`。自动化不能填写 `driver-accepted`。证据绑定当前制品、环境、步骤、预期、限制和文件哈希。

## 当前对话进度画板

每轮产生真实内容、修改、决定、测试结果或阻断变化后，必须在对话中刷新画板。使用简体中文，内容短而具体：

```text
┌─ RP 项目进度画板 ─────────────────────┐
│ 项目：<title>   阶段：<current_stage>  │
│ 范围：<当前版本/本轮范围>              │
├─ 已完成 ──────────────────────────────┤
│ ✓ <事项>（证据/文件）                 │
├─ 进行中 ──────────────────────────────┤
│ → <事项>                              │
├─ 待决定 ──────────────────────────────┤
│ ? <事项>（影响）                       │
├─ 暂缓 ────────────────────────────────┤
│ · <事项>（不计入当前范围）             │
├─ 阻断/待实测 ─────────────────────────┤
│ ! <事项>（解除条件）                   │
├─ 下一道门 ────────────────────────────┤
│ ⇒ <可观察的下一步>                    │
└───────────────────────────────────────┘
```

- “已完成”必须有实际内容或证据；
- “进行中”只能有当前真正推进的相邻事项；
- “待决定”不能被沉默自动关闭；
- “暂缓”不进入当前范围，不伪装成完成；
- “阻断/待实测”必须写解除条件；
- 没有确认范围时不显示虚假的百分比；有百分比时必须同时显示分母、证据和未验收门；
- 画板是当前对话的实时投影，`.rp-card/NEXT.md` 是跨会话的持久指针；两者不应互相矛盾。

## 不保存什么

保存项目事实、决定状态、材料来源、制品映射、验收证据和当前交接；不保存完整聊天记录、每轮问答原文、无意义的过程碎片或重复的创作正文。过程文件不进入导入包。
