# MagVarUpdate 运行时参考

基线以目标 bundle 与现场能力为准（本文核对自 `variable_def.ts`、`function/global/index.ts`、`function/initvar/variable_init.ts`、`function/update_variables.ts` 等源码）。交付时记录实际 URL、commit/tag 或现场构建信息。

## 数据形状

`MvuData` 必需字段：

```text
initialized_lorebooks: Record<string, any[]>   # 已初始化的世界书记录
stat_data: StatData                            # 玩家状态根
schema: ObjectSchemaNode                       # 内部结构约束
```

可选：`display_data`、`delta_data`（当前源码已标注 @deprecated，仅作变化展示，不作为新 UI 真值）。`stat_data.$internal` 是更新过程中的临时引用，更新结束被清除。

有效性判定要求 `stat_data` 与 `schema` 同时存在。桥接脚本寻找"最近有效 MVU 快照"时按这两个键判定，不能只查 `stat_data`。

`stat_data` 值支持 `ValueWithDescription`：`[值, "原因"]` 二元组，更新写第一个元素、保留第二个；display/delta 记录 `"旧->新 (原因)"`。

`$meta` 旋钮：对象/数组元素可带 `extensible`、`recursiveExtensible`、`required[]`、`template`；`stat_data` 根级支持 `strictTemplate`、`strictSet`、`concatTemplateArray`。Schema 生成时读取后清除，不残留在数据里。

## 全局接口

`Mvu` 挂在父页 `window.parent.Mvu`，就绪时经事件总线发 `global_Mvu_initialized`：

```text
Mvu.getMvuData(option)            # 读
Mvu.replaceMvuData(data, option)  # 整表替换
Mvu.parseMessage(text, oldData)   # 解析更新命令
Mvu.events.*                      # 见事件节
Mvu.isDuringExtraAnalysis()       # 当前轮次是否额外模型解析
```

- `option.type` 支持 `chat / character / global / message`，**默认 `'chat'`**：漏写 type 会读到聊天级表而不是楼层快照；读楼层必须显式 `{type:'message', message_id}`。
- `message_id` 可为数值（负数=从末尾起的索引）或 `'latest'`（默认，且跳过 system 消息）。
- `parseMessage` 当前实现无条件返回深拷贝副本（JSDoc 声称"无更新返回 undefined"已过时）。判断是否真的产生变更用 `_.isEqual` 对比新旧 `stat_data`，不要依赖返回值 falsy。
- 已废弃接口不要用于新项目：`getCurrentMvuData`、`replaceCurrentMvuData`、`reloadInitVar`、`setMvuVariable`、`getMvuVariable`、`getRecordFromMvuData`。

`waitGlobalInitialized('Mvu')`（Tavern Helper 提供）：全局已存在立即返回，否则监听一次性事件，**没有内建超时**。项目自设超时、错误态与重试。

## 初始化

`GENERATION_STARTED` 每次触发生成都运行初始化检查；聊天切换销毁并重建。

1. 取最近有效消息变量或空数据；
2. 扫描全局启用书 + 角色主书 + 附加书中条目名（comment）包含 `[initvar]`（不区分大小写）的条目——**不检查条目启用状态，禁用条目同样被扫描**；
3. 条目正文可外层包 `<initvar>...</initvar>` 或代码围栏（自动剥离），宏替换后按 YAML（兼容 JSON）解析并逐书合入；已存在的 `stat_data` 键优先于新载入数据；
4. 生成/调和内部 Schema 并清除 `$meta`；
5. 最后一楼为 0 楼时，对第 0 楼每个 Swipe 分别建立消息变量；
6. 开场 `<initvar>`（大小写不敏感；多块合并；可 fence 包裹；过宏）存在时：整体替换 `stat_data`，把 `initialized_lorebooks` 重置为仅角色主书，再重新加载其他启用书的 `[initvar]`；
7. 继续解析该 Swipe 正文中的更新命令；每个 Swipe 触发 `VARIABLE_INITIALIZED`。

`[initvar]` 正文直接写 `stat_data` 内部结构，不得再包一层 `stat_data:`。

副作用：初始化完成时 MVU 会把玩家全局世界书扫描设置覆写为推荐值（`scan_depth: 2`、`context_percentage: 100`、`recursive: true`、`insertion_strategy: 'character_first'` 等，经 `getLorebookSettings/setLorebookSettings` 即 ST 本体全局世界书设置）。交付说明应提示这一改动。

## 更新命令

提取器只认七种命令且**必须以 `;` 结尾**；命令后 `// 注释` 成为该命令的 reason（进入 display/delta 记录）：

```text
_.set(path, newValue);
_.set(path, expectedOldValue, newValue);
_.assign(path, value)                        # 对象深合并
_.assign(path, keyOrIndex, value)
_.insert(path, value)                        # 数组尾插
_.insert(path, indexOrKey, value)
_.remove(path) / _.remove(path, keyOrIndex) / _.remove(path, valueOrIndex)
_.unset(path) / _.delete(path) / _.unset(path, key)
_.add(path, delta)                           # 仅双参数
```

- `_.add` 数值路径按 12 位有效数字防浮点误差；日期值按 ±毫秒更新并存为 ISO 字符串。
- 不存在 `_.move` 命令语法；move 操作只来自 JSON Patch 转换。
- `<UpdateVariable>` 外层块剥离后解析；`<JSONPatch>`/`<json_patch>` 内容按 JSON Patch 应用。
- 自定义外层标签只负责组织与显示清理，内层必须是上述可解析内容。

## 消息处理与显示

生成后处理消息时：

- 以 `[0, message_id)` 区间最近有效变量为基线应用命令；
- 对 assistant 消息**持久追加** `<StatusPlaceHolderImpl/>` 占位符，并剥离 `<status_current_variable>` 块后写回消息原文；
- 兼容模式开启时同步镜像到聊天级变量。

**MVU 不自动隐藏 `_.set` / `<UpdateVariable>` 命令**。display 隐藏与 prompt 清理必须由卡内正则负责，并分别验证两条通道。

## 事件 payload

```text
VARIABLE_INITIALIZED(variables, swipe_id)
VARIABLE_UPDATE_STARTED(variables, out_is_updated)
COMMAND_PARSED(variables, commands, message_content)      # commands 可变：修复路径/追加命令
VARIABLE_UPDATE_ENDED(variables, variables_before_update) # variables 可变：夹取/限幅
BEFORE_MESSAGE_UPDATE({variables, message_content})       # 可修改 message_content
```

另有 `VARIABLE_UPDATE_ENDED + '_for_zod'` 二次触发供 Zod 路线挂钩。事件回调适合幂等校正（范围限制、日期同步），遵守单写者规则，不和状态栏按钮、额外模型争写同一字段。

## 额外模型解析

- 条目路由按名称含 `[mvu_plot]` / `[mvu_update]` 判定（见 mvu-ejs.md 路由矩阵）。
- 世界书条目白/黑名单正则按 comment 过滤；`[mvu_update]` 条目绕过黑白名单。
- 请求失败策略可配置（依次重试 / 并行重试）；角色卡覆盖可禁用自动触发但保留手动"重试额外模型解析"按钮（重试前把当前楼变量回退到上一楼快照）。
