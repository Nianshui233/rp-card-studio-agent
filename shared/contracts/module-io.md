# 私有 Skill 输入输出合同

## 输入

```yaml
dispatch:
  project_root: D:/path/to/project
  operation: create
  active_stage: status_ui
  round: 2
  role: primary
  authorization:
    mode: user_choice
    scope: []
  writable_stage: status_ui
  readable_stages: [preflight, positioning, worldbuilding, character, mvu_ejs, status_ui]
  locked_decisions: []
  target_handoffs: []
  source_files: []
```

`role` 为 `primary` 或 `supporting`。主 Skill 可以参与当前阶段对话；支援 Skill 不得提出自身名义阶段的问题。

## 输出

```yaml
result:
  stage: status_ui
  questions: []
  directions: []
  recommendation: ""
  fragments: []
  writes: []
  decisions: []
  handoffs: []
  gaps: []
  sufficient: false
  evidence: []
```

只有主 Skill 可以返回问题，而且问题必须属于当前阶段。`writes` 指向维护源码，不指向临时或生成的 `dist/` 文件。决定在主 Agent 记录并锁定前都只是提案。Skill 不自行改变当前阶段。
