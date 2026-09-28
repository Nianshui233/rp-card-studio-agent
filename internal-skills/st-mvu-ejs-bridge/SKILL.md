---
name: st-mvu-ejs-bridge
description: "Private integration module used only when both MagVarUpdate and ST-Prompt-Template EJS are already enabled and EJS must consume MVU data. Defines explicit ownership, direction, snapshot selection, and failure behavior."
---

# MVU → EJS Bridge

只接受主 Agent 调度。仅当 `st-mvu-authoring` 与 `st-ejs-authoring` 已分别完成，并且项目确实需要交换数据时启用。

读取 `references/bridge.md`。

## 默认合同

MVU→EJS 有两种合法的只读桥，必须在配置中明确选择，不能把二者混称：

### `shared_message_variables`

```text
MVU 将完整快照保存到当前消息 variables.stat_data
→ STPT getvar 从 message/cache 变量作用域读取 stat_data
→ EJS 只读 stat_data
```

这是许多稳定卡（包括世界书中用 `getvar('stat_data...')` 的动态控制器）实际采用的路线。它不是“EJS 自动拥有 MVU”，而是两者通过 SillyTavern 消息变量存储面连接。必须明确当前消息/Swipe 的选择规则，并禁止用 `'latest'` 代替关键写入楼层。

### `explicit_context`

```text
Tavern Helper/宿主桥选择最近完整 MvuData
→ 深拷贝注入 EJS context.mvu
→ EJS 只读 mvu.stat_data
```

两种路线都必须满足：

- MVU 是唯一状态权威；
- EJS 不调用 `Mvu.replaceMvuData`；
- 不把 EJS 变量保存回同一状态树；
- 找不到完整快照时传 `null`/明确空态，不伪造默认状态；
- 记录实际消息选择策略、Swipe 隔离和失败回退；
- 没有真实宿主证据时保持 `runtime: not_run`。

没有 bridge 时，EJS 不得直接引用 `stat_data`。不默认允许 EJS 写回 MVU，也不允许 EJS 与 MVU 同时成为同一字段的写者。

## 输出

- 数据拥有者；
- 单向或双向方向；
- 快照选择规则与消息楼层；
- 注入名称和只读形状；
- 生命周期、卸载与失败回退；
- 与锁定 MVU/STPT/TH 版本对应的实机证据。

双向桥只在不可替代且用户需求明确时使用；必须逐字段规定唯一写者、冲突处理、保存顺序和重放行为。
