# 跨阶段交接合同

交接表示当前 Skill 无法在不修改其他阶段事实的情况下完成真实需求。

```yaml
- id: status_ui_missing_health_path
  source_stage: status_ui
  target_stage: mvu_ejs
  severity: blocking
  reason: 状态栏已锁定显示体力，但当前状态合同不存在可读取路径
  suggested_change:
    - 新增 `角色.沈槐.体力`
    - 或把组件改为现有 `角色.沈槐.状态.生命`
  status: open
```

`severity` 使用 `advisory` 或 `blocking`；`status` 使用 `open`、`accepted`、`resolved` 或 `rejected`。

支援 Skill 静默返回交接。主 Agent 解释影响，根据现有授权选择是否返工，并记录处理结果。阻断性交接只阻止锁定受影响实现，不删除仍可保留的草稿。

普通未来灵感不使用交接，写入项目待办即可。
