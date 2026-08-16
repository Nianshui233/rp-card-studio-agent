# 砂钟议事厅：MVU_ZOD 样本

覆盖另一条路线：

```text
宿主预装 MVU → 本卡 Schema 注册 → prefault/default 提供启动结构 → EJS 读取上下文
```

该样本故意没有 `[initvar]` 条目，用来验证技能不会把显式初始化误写成 MVU_ZOD 的唯一合法形式。实际项目必须记录真实宿主证据；没有实机时只能标记 `runtime: not_run`。

`src/runtime/opening/创角变量桥.yaml` 演示创角字段覆盖 Schema 的 `prefault/default`。它明确标记为“宿主预装 MVU、未实机运行”，不会把默认值覆盖假设写成已验证事实。
