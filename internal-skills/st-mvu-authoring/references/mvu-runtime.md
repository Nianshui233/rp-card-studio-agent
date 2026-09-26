# MagVarUpdate 运行时参考

基线以目标 bundle 与现场能力为准（本文核对自 `variable_def.ts`、`function/global/index.ts`、`function/initvar/variable_init.ts`、`function/update_variables.ts` 等源码）。交付时记录实际 URL、commit/tag 或现场构建信息。

## 数据形状

`MvuData` 核心字段：

```text
initialized_lorebooks: Record<string, any[]>
stat_data: StatData
schema: ObjectSchemaNode
```

可选：`display_data`、`delta_data`（当前源码已标注 deprecated，只作变化展示，不作为新 UI 真值）。`stat_data.$internal` 是更新过程中的临时引用，更新结束被清除。

有效性判定要求 `stat_data` 与 `schema` 同时存在。桥接脚本寻找“最近有效 MVU 快照”时按这两个键判定，不能只查 `stat_data`。

`stat_data` 值支持 `ValueWithDescription`：`[值, "原因"]` 二元组，更新写第一个元素、保留第二个；display/delta 记录 `"旧->新 (原因)"`。

`$meta` 旋钮：对象/数组元素可带 `extensible`、`recursiveExtensible`、`required[]`、`template`；`stat_data` 根级支持 `strictTemplate`、`strictSet`、`concatTemplateArray`。Schema 生成时读取后清除，不残留在数据里。

## 全局接口

`Mvu` 挂在父页 `window.parent.Mvu`，就绪时经事件总线发 `global_Mvu_initialized`：

```text
Mvu.getMvuData(option)
Mvu.replaceMvuData(data, option)
Mvu.parseMessage(text, oldData)
Mvu.events.*
Mvu.isDuringExtraAnalysis()
```

- `option.type` 支持 `chat / character / global / message`，默认 `'chat'`；漏写 type 会读到聊天级表；
- 消息读写的 `message_id` 接受数值或 `'latest'`，但继承 Tavern Helper 的不对称：读 `'latest'` 跳过 system，写 `'latest'` 当前等价物理 `-1`；关键写入必须使用明确数值楼层；
- `parseMessage` 当前实现无条件返回深拷贝副本；判断是否真的变化用 `_.isEqual` 对比新旧 `stat_data`；
- `replaceMvuData` 当前委托同步 `replaceVariables`，`await` 它不代表等待磁盘保存；同楼立即读回只证明内存写入；
- 已废弃接口不要用于新项目：`getCurrentMvuData`、`replaceCurrentMvuData`、`reloadInitVar`、`setMvuVariable`、`getMvuVariable`、`getRecordFromMvuData`。

## `waitGlobalInitialized`

分清两个表面：

```text
TavernHelper.waitGlobalInitialized('Mvu')
→ 父页已有 Mvu 时立即返回；否则等待 global_Mvu_initialized 事件

TH iframe 裸 waitGlobalInitialized('Mvu')
→ 绑定当前 iframe 的 Mvu getter
→ 还等待第 0 楼消息变量出现 stat_data
```

裸版本内部的第 0 楼 `waitUntil` 超时错误会被吞掉；如果全局尚不存在，前置事件等待仍没有外部超时。项目使用 `Promise.race`、错误态和重试，但超时不会取消底层一次性监听，不把超时后迟到的初始化当作当前事务成功。

## 初始化

`GENERATION_STARTED` 与 `MESSAGE_SENT` 会运行初始化检查；聊天切换销毁并重建相关运行状态。

1. 取最近有效消息变量或空数据；
2. 扫描全局启用书 + 角色主书 + 附加书；**书必须在启用列表中，但条目自身 enabled/disable 不参与筛选**；名称/comment 含 `[initvar]`（不区分大小写）即可被扫描；
3. 条目正文可包 `<initvar>...</initvar>` 或代码围栏，宏替换后按 YAML（兼容 JSON）解析并逐书合入；已存在的 `stat_data` 键优先；
4. 生成/调和内部 Schema 并清除 `$meta`；
5. 最后一楼为 0 楼时，对第 0 楼每个 Swipe 分别计算消息变量；
6. greeting 内 `<initvar>` 存在时：用其内容替换该 Swipe `stat_data`，把 `initialized_lorebooks` 重置为角色主书，再加载其他启用书；
7. 对每个 Swipe 先触发 `VARIABLE_INITIALIZED(current_data, swipe_id)`，再解析该 greeting 正文中的普通更新命令；
8. 所有 Swipe 计算完成后，才一次性通过 `setChatMessages(...swipes_data...)` 写入第 0 楼。

因此 `VARIABLE_INITIALIZED` 是“基线对象已建立”的内存事件，不代表 greeting 更新命令已经应用，也不代表该 Swipe 已写入消息存储。

`[initvar]` 正文直接写 `stat_data` 内部结构，不得再包一层 `stat_data:`。通常保持 `[initvar]` 条目禁用，避免初始化 YAML/JSON 作为普通世界书内容进入提示词；MVU 仍会扫描它。

## 更新命令

命令必须以 `;` 结尾；其后 `// reason` 作为原因。常用方言：

```text
_.set(path, newValue);
_.set(path, expectedOldValue, newValue);
_.assign / _.insert
_.remove / _.unset / _.delete
_.add
_.replace
_.push / _.push_front
_.pop / _.shift
_.inc / _.dec
_.toggle
```

`_.move` 不是文本命令；只可能来自 JSON Patch 转换。

`parseMessage(text, oldData)` 会触发与正常更新相同的变换事件，但它只返回新副本；调用者仍负责把结果写入明确数值楼层、等待必要保存并读回。

## 更新与持久化时序

生成后处理消息时：

```text
取得 [0, message_id) 最近有效快照
→ VARIABLE_UPDATE_STARTED
→ COMMAND_PARSED / Zod 命令阶段
→ 执行命令
→ VARIABLE_UPDATE_ENDED
→ 内部 Schema 调和
→ VARIABLE_UPDATE_ENDED_for_zod
→ BEFORE_MESSAGE_UPDATE（assistant 且有变化）
→ updateVariablesWith 写 chat/message 变量
→ assistant 才 setChatMessages 写回正文与占位符
```

对 assistant 消息会持久追加 `<StatusPlaceHolderImpl/>`，并剥离 `<status_current_variable>` 后写回正文。兼容模式开启时还会镜像聊天级变量。

**MVU 不自动隐藏 `_.set` / `<UpdateVariable>` 命令**。display 隐藏与 prompt 清理必须由卡内正则负责，并分别验证两条通道。

## 事件 payload 与用途

以真实 emitter 和当前 exported 类型为准：

```text
VARIABLE_INITIALIZED(variables, swipe_id)
VARIABLE_UPDATE_STARTED(variables)
COMMAND_PARSED(variables, commands, message_content)
VARIABLE_UPDATE_ENDED(variables, variables_before_update)
BEFORE_MESSAGE_UPDATE({variables, message_content})
```

`variable_def.ts` 中 `VARIABLE_UPDATE_STARTED` 的第二个 `out_is_updated` 类型参数已与真实 emitter 不一致，不用于项目代码。

另有 `COMMAND_PARSED + '_for_zod'`、`COMMAND_PARSED + '_ended_for_zod'`、`VARIABLE_UPDATE_ENDED + '_for_zod'` 内部阶段供 Zod 路线挂钩。

事件使用规则：

- `COMMAND_PARSED`、`VARIABLE_UPDATE_ENDED` 适合在同一变换对象上做幂等修正；
- `VARIABLE_INITIALIZED` 和 `VARIABLE_UPDATE_ENDED` 都不是耐久持久化完成事件；
- 消息 UI 不在这些事件里立即重读 `Mvu.getMvuData()`；
- 自己发起的写入在保存与同楼读回后更新 UI；
- assistant 更新随后调用 `setChatMessages(..., {refresh:'affected'})`，经 `refreshOneMessage` 发 `CHARACTER_MESSAGE_RENDERED` 并通常重建 iframe；新实例启动时读取最终值；`MESSAGE_UPDATED` 不是 MVU 保证的完成事件；
- user 消息只写变量时没有同等重渲染保证；需要项目自有 post-write 事件（含 message ID/最终快照）或显式刷新；
- 同一字段遵守单写者规则，不让事件、状态栏按钮和额外模型争写。

## 角色卡配置覆盖

MVU 的角色卡设置覆盖不存角色卡 extensions 字段，而是存在角色主世界书名为 `[config_override]` 的禁用条目（JSON 内容）。条目必须保持禁用，避免 JSON 被普通注入；玩家在 MVU 面板改配置且卡有主世界书时，MVU 会按需创建并串行保存。角色没有主世界书时覆盖功能 unbound。

## 内置按钮

MVU 在自己的 Tavern Helper 脚本实例上注册：`重新处理变量`、`重新读取初始变量`、`快照楼层`、`重演楼层`、`重试额外模型解析`、`清除旧楼层变量`。重试额外模型解析会先裁掉最后消息已有的 `<UpdateVariable>` 块、把变量回退到上一楼快照，再重新请求解析。

## 额外模型解析

- 以目标 bundle 现场设置为准；
- `[mvu_plot]` / `[mvu_update]` 只路由已激活条目，不替代世界书正常激活；
- 请求失败策略可配置；角色卡覆盖可禁用自动触发但保留手动重试；
- 没有真实角色主世界书时，部分额外解析配置与覆盖能力可能不可用。
