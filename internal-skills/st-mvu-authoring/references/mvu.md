# MVU 制作规则

MVU 在本项目中专指 MagVarUpdate 状态路线。它负责状态、Schema、更新和消息快照，不负责 EJS 模板。

## 路线选择

- `none`：没有跨消息持久状态，不启用 MVU；
- `native_schema`：只适用于状态结构较简单、内部 Schema 足以约束且不需要复杂 Record/Array/enum/coerce/transform 的项目；
- `mvu_zod`：复杂状态的正式路线，必须完整交付 `references/mvu-zod.md` 列出的全部组件；

选择 `none` 时，不生成 Loader、`[initvar]`、Schema、更新块或 MVU 正则。EJS 是否启用由独立阶段决定。 选择 `mvu_zod` 后不得因实现困难改名为“轻量版”或退回 native；应修复缺失制品。 旧卡也不使用含糊的 `existing` 模式：先根据真实制品识别为 `native_schema` 或 `mvu_zod`，再按该路线补齐和验证。

## 状态合同

每个字段至少定义：

```text
语义与玩家理解
路径和类型
初值/未知值
允许范围
作用域（消息/聊天/角色等）
唯一写者
变化事件
模型可见性与玩家可见性
保存/读回
旧聊天兼容
```

确定性派生值优先计算，不重复持久化。语义事件可由模型更新；公式、批量同步和严格派生交给脚本。一个字段不能同时由模型、UI 和 EJS 各自写入。

## 初始化

### 世界书 `[initvar]`

正文直接写 `stat_data` 内部结构，不再包 `stat_data:`：

```yaml
世界:
  当前区域: 港口
角色:
  体力: 80
```

世界书必须实际位于当前启用的全局书、角色主书或附加书中。条目自身可以禁用，MVU 仍按名称/comment 扫描；禁用可避免初始化数据作为普通世界书文本进入 Prompt。

### Greeting `<initvar>`

每个 Greeting/Swipe 可携带自己的 `<initvar>...</initvar>`。它建立该 Swipe 的初态；普通 `<UpdateVariable>` 命令属于后续更新，不能与 `<initvar>` 混为一种语义。

初始化事件只是内存阶段。不要在 `VARIABLE_INITIALIZED` 中立即重读消息并声称已经保存。

## Loader 与 Schema

- 卡内只允许一个真实 MagVarUpdate Loader；
- 锁定 URL 的 tag/commit，并记录最低 Tavern Helper 版本与断网表现；
- `mvu_zod` 在宿主 Ready 后调用 `registerMvuSchema`；
- 复用目标环境的 `window.z`，不再引第三套 Zod；
- `registerVariableSchema()`、MVU 内部 Schema 与 `registerMvuSchema()` 是不同接口，不得互相代替。

## 更新协议

只声明目标版本真实支持的命令。常见形式：

```text
_.set(path, newValue);
_.set(path, expectedOldValue, newValue);
_.assign / _.insert
_.remove / _.unset / _.delete
_.add / _.replace
_.push / _.push_front
_.pop / _.shift
_.inc / _.dec / _.toggle
```

命令以分号结束，后接 `// reason`。自定义外层标签只负责生产/清理路由，内层仍必须是 MVU 能解析的真实方言或 JSON Patch。

## 世界书路由

- `[mvu_plot]`：剧情模型侧；
- `[mvu_update]`：变量更新侧；
- 无标记：按锁定 bundle 的真实行为核对。

这些标记不替代世界书本身的激活、关键词、depth、排序和概率规则。

## UI 读写

TH 消息 iframe 通常读取：

```text
getCurrentMessageId()
→ Mvu.getMvuData({type:'message', message_id: 数值ID})
→ stat_data
```

关键写入必须使用明确数值楼层：

```text
读取同楼完整 MvuData
→ Mvu.parseMessage 或修改完整副本
→ Mvu.replaceMvuData(完整数据, 同楼)
→ await saveChat()
→ 同楼读回
→ 关键事务按需重载后再次读回
```

`'latest'` 只作容错只读；不能用于关键写入。`ChatMessage.data` 只有同时含有效 `stat_data` 与 `schema` 才算完整 MVU 快照。

## 事件时序

`VARIABLE_UPDATE_ENDED` 发生在最终消息变量写入之前，不能在该事件里立即 `getMvuData()` 并把旧快照当作完成结果。按钮写入在保存和读回后直接刷新；assistant 更新通常依赖消息重渲染；user 路线需要项目自己的 post-write 信号或显式刷新。

## 与 EJS 的关系

MVU 可以完全独立运行。只有项目明确需要“EJS 根据 MVU 状态生成动态 Prompt/模板”时，才进入 `st-mvu-ejs-bridge`。MVU 阶段本身不创建 EJS 文件，也不定义 STPT 变量。
