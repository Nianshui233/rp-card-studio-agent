# MVU 与 EJS 的显式桥接

本文件不负责创建 MVU 或 EJS。它只连接两套已经独立成立的实现。

## 启用前提

同时满足：

1. 项目已经有真实 MVU 状态合同；
2. 项目已经有真实 EJS 模板和执行阶段；
3. EJS 输出确实需要读取 MVU 状态；
4. 静态世界书、普通宏或 EJS 自有变量不能更简单地解决问题。

任何一项不满足都不建立 bridge。

## 推荐：MVU → EJS 只读桥

```text
Tavern Helper 后台脚本监听 prompt_template_prepare(context)
→ 从明确聊天范围寻找最近消息
→ 只接受 stat_data 与 schema 同时存在的完整 MvuData
→ cloneDeep
→ 写入 context.mvu
→ EJS 只读 context.mvu.stat_data
```

约束：

- MVU 是唯一状态权威；
- EJS 不调用 `Mvu.replaceMvuData`；
- 不把 EJS 变量保存回同一状态树；
- 找不到完整快照时传 `null`/明确空态，不伪造默认状态；
- 监听器在脚本卸载时 stop/remove；
- 记录实际消息选择策略，不能含糊使用 `'latest'` 代表关键写入楼层。

## 双向桥

默认禁止。确有必要时逐字段写清：

```text
谁可写
何时写
写入哪个消息楼层
冲突时谁胜出
保存顺序
失败和重试是否幂等
Swipe/编辑/重载后如何重放
```

若无法给出这些答案，退回单向只读桥或取消联动。

## EJS 使用

EJS 中只读取显式注入对象，例如：

```ejs
<%_ const state = mvu && mvu.stat_data ? mvu.stat_data : null; _%>
```

不得假定 STPT 自动提供 `mvu` 或顶层 `stat_data`。模板必须处理 `mvu === null`。

## 验收

分别证明：

- MVU 独立运行通过；
- EJS 独立运行通过；
- bridge 加载后注入完整快照；
- 缺少快照、切 Swipe、编辑、切聊天和重载时不会串状态；
- EJS 失败不破坏 MVU；
- 没有真实宿主证据时只标 `runtime: not_run`。
