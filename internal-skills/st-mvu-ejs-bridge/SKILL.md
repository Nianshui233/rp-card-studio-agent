---
name: st-mvu-ejs-bridge
description: "Private integration module used only when both MagVarUpdate and ST-Prompt-Template EJS are already enabled and EJS must consume MVU data. Defines explicit ownership, direction, snapshot selection, and failure behavior."
---

# MVU → EJS Bridge

只接受主 Agent 调度。仅当 `st-mvu-authoring` 与 `st-ejs-authoring` 已分别完成，并且项目确实需要交换数据时启用。

读取 `references/bridge.md`。

## 默认合同

默认只允许：

```text
MVU 持有权威状态
→ bridge 选择最近完整 MvuData
→ 深拷贝注入 EJS context.mvu
→ EJS 只读 mvu.stat_data
```

没有 bridge 时，EJS 不得直接引用 `stat_data`。不默认允许 EJS 写回 MVU，也不允许 EJS 与 MVU 同时成为同一字段的写者。

## 输出

- 数据拥有者；
- 单向或双向方向；
- 快照选择规则与消息楼层；
- 注入名称和只读形状；
- 生命周期、卸载与失败回退；
- 与锁定 MVU/STPT/TH 版本对应的实机证据。

双向桥只在不可替代且用户需求明确时使用；必须逐字段规定唯一写者、冲突处理、保存顺序和重放行为。
