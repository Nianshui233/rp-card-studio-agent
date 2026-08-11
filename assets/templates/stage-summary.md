# {{stage_display_name}}阶段总汇

## 阶段状态

- 阶段 ID：`{{stage_id}}`
- 完成状态：`awaiting_user`
- 已进行轮次：`{{round_count}}`

## 本阶段目标

{{stage_goal}}

## 已锁定决定

| 决定 ID | 内容 | 决定者 | 理由 | 来源轮次 |
|---|---|---|---|---|
| {{decision_id}} | {{decision}} | `user` / `ai_delegation` | {{reason}} | {{round}} |

## 合并片段

{{merged_fragments}}

## 完整度检查

- [ ] 本阶段必填主题均有结论
- [ ] 所有引用均能解析
- [ ] 与上游锁定决定一致
- [ ] 玩家可见与 GM 信息已分层
- [ ] 没有在本阶段越界决定其他阶段内容

## 缺漏与薄弱点

| 项目 | 影响 | 建议 | 是否阻断 |
|---|---|---|---|
| {{gap}} | {{impact}} | {{recommendation}} | `yes` / `no` |

## 跨阶段待办

| 目标阶段 | 待办 | 原因 | 当前状态 |
|---|---|---|---|
| `{{target_stage}}` | {{task}} | {{reason}} | `open` |

## 下一阶段方向

| 方向 | 适用条件 | 影响 |
|---|---|---|
| {{next_stage}} | {{condition}} | {{impact}} |

推荐：进入 `{{recommended_stage}}`，因为 {{recommendation_reason}}。

## 用户复核

- [ ] 确认本阶段完成并锁定
- [ ] 留在本阶段继续补充
- [ ] 返回指定阶段修订
- [ ] 调整或跳过下一阶段
