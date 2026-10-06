---
schema: rp-card-studio/authority/v2
project_id: replace-me
title: 待命名项目
status: candidate
current_stage: preflight
creation_mode: open_world
nsfw: unresolved
mvu: unresolved
mvu_zod: unresolved
ejs: unresolved
bridge: unresolved
materials: absent
research: not_required
research_trigger: null
network_policy: public_sources_only
updated: YYYY-MM-DD
next_gate: 完成预检并确定本轮范围
---

## 项目目标与范围

- 当前目标：
- 本轮范围：
- 明确排除：

## 阶段账本

```json
{
  "schema": "rp-card-studio/stage-ledger/v1",
  "stages": [
    {
      "id": "preflight",
      "enabled": "enabled",
      "progress": "in_progress",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "continuation",
      "enabled": "enabled",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "materials",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "brainstorm",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "positioning",
      "enabled": "enabled",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "worldbuilding",
      "enabled": "enabled",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "character",
      "enabled": "enabled",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "systems",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "scenes",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "mvu",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "ejs",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "runtime_bridge",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "narrative_opening",
      "enabled": "enabled",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "opening_frontend",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "message_frontend",
      "enabled": "unresolved",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    },
    {
      "id": "qa_delivery",
      "enabled": "enabled",
      "progress": "not_started",
      "review": "not_reviewed",
      "entryEvidence": null,
      "acceptanceEvidence": null,
      "handoff": null,
      "reason": null
    }
  ],
  "userEvidence": [],
  "authorizations": [],
  "decisions": []
}
```

## 当前授权

派生视图：当前 preflight 仅允许预检与状态初始化；无放权记录。后续阶段未获执行许可。不得在此另写生效授权。

## 授权与决定记录

以阶段账本 JSON 的 userEvidence、authorizations、decisions 为唯一结构化来源。每条用户来源记录包含原话与消息定位；引用真实来源不是来源真实性已验证。

## 已确认创作事实

- 暂无。

## 已确认运行能力

- 暂无。

能力开关 unresolved 不是已确认；决定摘要只能逐字投影 DEC/CAP 记录。

## 待决定事项

- [DEC-101] 待确认创作模式、材料和本轮范围。

## 已否决事项

- 暂无。

## 玩家中立性合同

- 未确认前不固化外部主控姓名、身份和私人关系。
- 开放世界模式下，无 `<user>` 时世界仍应成立。

## 创作源映射

- 世界：
- 角色：
- 系统：
- 场景：

## 角色卡与组件映射

- 角色卡：
- 世界书：
- Regex：
- Tavern Helper：
- MVU、EJS、UI：

## 运行依赖

- SillyTavern：
- Tavern Helper：
- ST-Prompt-Template：
- MagVarUpdate：
- 其他远程或宿主依赖：

## 已完成阶段

仅作为阶段账本的派生视图，不手工勾选。初始暂无已关闭阶段；待交接不是已关闭。

## 当前风险

- 暂无。

## 验收摘要

- 静态检查：未运行。
- 离线制品：未运行。
- 浏览器：未运行。
- 真实 SillyTavern：`runtime: not_run`。
- 人工验收：未确认。

## 下一道门

完成预检并确定本轮范围。
