---
name: rp-interview-orchestration
description: "Private cross-stage interview controller for RP creation. Use whenever an authoring stage needs user decisions: split independent decisions, prevent omnibus questions and silent high-impact assumptions, adapt follow-ups to partial answers, and confirm stage coverage without creating project ledgers. Does not own RP content or technical implementation."
---

# RP Interview Orchestration

只负责访谈控制，不替代当前阶段的创作 Skill。先读取 `references/stage-coverage.json` 中当前阶段的覆盖地图，再结合用户材料、历史回答和阶段 Skill 的内容形成**已解决 / 待确认 / 可默认 / 明确跳过**的决策集合。这个集合只保留在当前对话，不另存项目状态文件。

## 决策闭环

每个触发的承重决策只能以下列状态之一关闭：

- `source_resolved`：用户材料或既有回答已明确决定；能指出具体依据，不靠猜测；
- `confirmed`：用户针对该项明确选择或校准；
- `delegated`：用户明确授权 Agent 对该项作决定；立即采用一致方案，不重复追问；
- `explicit_skip`：用户明确不做此能力/内容，或覆盖地图的 skip 条件成立；
- `tentative`：为了先产出草稿而采用的可逆临时假设。它不是确认，不能关闭承重项。

高影响创作决定（核心体验、人物自主性/底线、玩家控制权、重要后果、开场路线/写入行为等）不得静默记为 `delegated`。用户没答、含糊答或只答了复合问题中的一部分时，保留为待确认。

低风险、可逆、不会改变已确认体验的文案润色和实现细节可由 Agent 默认处理；在有可能影响体验时简短标明默认及可改处。不要把技术字段/API 选择推给用户。

## 提问批次

1. 每轮最多提出 **3 个独立决策点**；多于 3 个时按依赖和影响排序分轮。
2. 每项单独编号，使用玩家语言描述一个可回答的取舍；不要用一个“综合性问题”包住多个独立决定。
3. 对每项给出明确首选、为何符合已知材料、选择会改变什么。相邻问题可以共享背景说明，但用户应能分别回答每一项。
4. 不重复询问已由材料明确、已确认、已授权代定或明确跳过的内容。材料只暗示而未承诺时，按未知处理。
5. 用户回答后，逐项映射回答；只写入确定内容。若答案有歧义，只追问会导致不同作品结果的那一处，然后立即推进已确定部分。
6. 不为了填满覆盖地图而提问。`trigger` 不成立或 `skip_when` 已满足时标记跳过/不适用，并继续创作。

## 阶段结束门

阶段 Skill 完成实际内容后，检查当前阶段所有**已触发且承重**的决策：必须是 `source_resolved`、`confirmed`、`delegated` 或 `explicit_skip`。仍有 `tentative` 的承重项时：

- 继续就最重要的 1–3 项提问；或
- 若用户明确要先看草稿/暂不回答，则交付为可逆草稿，并简短指出它尚未定案的具体影响。

不得仅因为“已经问过一个大问题”“已经写了很多内容”或“Agent 能猜出合理答案”就宣布阶段完整。阶段摘要只报告已确定事项、Agent 受权代定事项、明确跳过项和尚未关闭的承重选择，不生成访谈记录文件。

## 边界

- 当前阶段主 Skill 负责创作事实、内容质量和技术/体验具体实现；本模块不生成角色、世界书、规则、页面或代码。
- 简单定向修改、事实明确的修复、用户明确授权“你直接决定”时，不强行启动访谈。
- 脑暴不是长问卷：先给可用的首选脊柱，再追问真正改变核心体验的决策。
- 访谈不是心理画像；不从沉默、简短回答或措辞推断偏好/授权。
