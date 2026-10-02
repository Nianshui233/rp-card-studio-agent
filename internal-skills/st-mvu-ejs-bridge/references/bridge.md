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

稳定实现有两种，必须在运行合同中明确 `bridge_mode`：

### `shared_message_variables`

```text
MVU 将完整状态保存到当前消息 variables.stat_data
→ STPT getvar 从当前 message/cache 作用域读取 stat_data
→ EJS 只读 stat_data
```

这是世界书动态控制器常用的路线。它依赖 SillyTavern 的消息变量存储面，不是 EJS 自动拥有 MVU。模板必须说明当前消息与 Swipe 的选择、缺少快照时的空态，以及不能用 `'latest'` 作为关键写入目标。

### `explicit_context`

```text
Tavern Helper/宿主桥监听 prompt_template_prepare(context)
→ 从明确聊天范围寻找最近的完整 MvuData
→ cloneDeep
→ 写入 context.mvu
→ EJS 只读 context.mvu.stat_data
```

两种只读桥都必须满足：

- MVU 是唯一状态权威；
- EJS 不调用 `Mvu.replaceMvuData`；
- 不把 EJS 变量保存回同一状态树；
- 找不到完整快照时传 `null`/明确空态，不伪造默认状态； `schema` 在 native_schema 中通常是对象，当前 MVU_ZOD bundle 也可能使用字符串标记 `没有用别管这个`，不能因其不是对象就误判快照缺失；
- 显式桥监听器在脚本卸载时 stop/remove；
- 记录实际消息选择策略、Swipe 隔离、编辑/重载行为和失败回退。

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

`explicit_context` 中只读取显式注入对象：

```ejs
<%_ const state = mvu && mvu.stat_data ? mvu.stat_data : null; _%>
```

`shared_message_variables` 中才允许按合同读取：

```ejs
<%_ const time = getvar('stat_data.世界.时间', { scope: 'message', defaults: null }); _%>
```

没有 bridge 合同时，不得假定 STPT 自动提供 `mvu` 或顶层 `stat_data`。模板必须处理快照缺失。

## 验收

分别证明：

- MVU 独立运行通过；
- EJS 独立运行通过；
- bridge 加载后注入完整快照；
- 缺少快照、切 Swipe、编辑、切聊天和重载时不会串状态；
- EJS 失败不破坏 MVU；
- 没有真实宿主证据时只标 `runtime: not_run`。
