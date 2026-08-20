# MVU / EJS 技术配方

只在项目确实需要变量、跨楼层快照或动态模板时读取。先选最短真实路线，不为状态栏自动引入 MVU。

## 路线选择

- 无变量：不启用 MVU；
- `native_schema`：MagVarUpdate 根据 `[initvar]` 数据和 `$meta` 生成内部 Schema；
- `mvu_zod`：另有真实 `registerMvuSchema()` 脚本负责外部 Zod 约束；
- `hybrid`：仅在内部 Schema 与 Zod 各有明确职责时使用；
- `existing`：沿用旧卡中已验证的实现；
- EJS 单独决定，不是 MVU 存储层。

只启用 EJS 时，不生成 MagVarUpdate Loader、`[initvar]`、MVU Schema 或更新块。

## MVU 初始化

### 世界书 `[initvar]`

名称包含 `[initvar]` 的已启用世界书条目可提供基线。条目正文直接写 `stat_data` 内部的数据：

```yaml
世界:
  当前区域: 港口
角色:
  体力: 80
```

不要再包一层：

```yaml
# 错误：会形成 stat_data.stat_data
stat_data:
  世界: {}
```

关闭的 `[initvar]` 条目仍可被当前 MVU 扫描。世界书必须实际存在于角色主书、附加书或全局启用书中。

### 开场 `<initvar>`

开场或额外问候中的 `<initvar>...</initvar>` 是另一条初始化入口。当前 MVU 会用其内容直接建立该 Swipe 的 `stat_data`，跳过角色主世界书的 `[initvar]` 基线，再加载其他启用世界书。它可以用于无有效角色主世界书的基础路线，但额外模型解析等功能仍可能要求角色主书。

开场中的普通 `_.set(...)` / `<UpdateVariable>` 命令会在基线建立后继续应用。不要把 `<initvar>` 与 `<UpdateVariable>` 写成同一种语义。

## Loader 与 Schema

卡内加载 MagVarUpdate 时只保留一个真实 Tavern Helper Script。Loader URL、固定版本或 commit、传递依赖、最低 Tavern Helper 版本和网络失败回退进入交付说明。

外部 Zod 路线使用经过目标环境验证的 `registerMvuSchema()` 提供者；远程 URL不锁版本时只能标记为未锁定依赖，不能声称可复现。

`registerVariableSchema()`、MVU 内部 Schema 和 `registerMvuSchema()` 是三件不同的事。

## 更新协议

当前 MVU 可解析的常用方言包括（**命令必须以 `;` 结尾**；其后 `// 注释` 成为该命令的 reason）：

```text
_.set(path, newValue);
_.set(path, expectedOldValue, newValue);
_.assign / _.insert
_.remove / _.delete / _.unset
_.add(path, delta)
<JSONPatch>[...]</JSONPatch>
```

精确参数形态、`_.add` 的数值/日期语义与事件挂钩见 host/mvu-runtime.md。

项目只能声明真实写出的方言。自定义外层标签可以用于显示清理，但内层必须含 MVU 能解析的命令或 JSON Patch，不能只写含糊的 `<Patch>...</Patch>`。

以下组件分别存在：

1. 初值；
2. MVU 内部或外部结构约束；
3. 更新规则；
4. 回复输出格式；
5. prompt 通道清理；
6. display 通道清理；
7. UI 读取和必要写入。

每个变量只有一个写者：要么由模型更新命令写入，要么由脚本计算写入，不允许两者竞争更新同一字段。确定性公式、派生变量与批量同步交给脚本；语义事件与剧情判断留给模型。

同轮更新与额外模型解析是两种执行方式。额外模型路线还需按目标版本核对工具调用、格式化输出和自动请求设置。

### `[mvu_plot]` / `[mvu_update]` 条目路由（额外模型解析模式）

MVU 以条目名称匹配标记：`/\[mvu_update\]/i` 与 `/\[mvu_plot\]/i`，大小写不敏感，标记可在名称任意位置。额外模型解析轮次中：

| 条目名称 | 发送目标 |
| --- | --- |
| 含 `[mvu_plot]` | 仅剧情 AI |
| 含 `[mvu_update]` | 仅变量更新 AI |
| 两者都无 | 两个 AI 都发 |

- 路由不改变激活：条目仍先走正常的禁用、关键词、绿灯、置顶、depth 与排序逻辑，标记只决定发给哪个模型。
- 同轮更新模式下 `[mvu_plot]` 条目正常发送；非更新轮次会过滤掉 `[mvu_update]` 条目。
- `[mvu_update]` 条目绕过世界书条目白名单/黑名单（含更新轮黑名单正则）。
- 未打任何标记的世界书会被视为仅剧情侧，界面会提示「未适配额外模型解析」；适配方式是给格式类条目加 `[mvu_plot]`、给更新规则类条目加 `[mvu_update]`，或补一个空 `[mvu_update]` 条目。
- 新建双兼容卡：变量更新规则与变量输出格式标 `[mvu_update]`，剧情专属 CoT/文风/演出格式标 `[mvu_plot]`；不打标记的条目必须解释为何要同时进入两个模型上下文（预算与信息暴露成本）。

## UI 读写

消息 iframe 中：

```text
getCurrentMessageId()（仅消息 iframe）
→ Mvu.getMvuData({type:'message', message_id: 数值ID})
→ stat_data
```

无法取得消息 ID 时可只读回退 `'latest'`，关键写入不猜测楼层。`'current'` 不是有效 message_id。

写入流程：

```text
读取完整 MvuData
→ 产生合法命令并 Mvu.parseMessage，或直接修改完整副本
→ Mvu.replaceMvuData
→ 重新读取同一数值楼层
→ 校验非默认值并反馈
```

`ChatMessage.data` 是当前 Swipe 的消息变量存储面；只有写入完整合法 MvuData 且能由 `Mvu.getMvuData()` 读回，才算 MVU 成功。普通 `extra`、叙事正文或页面局部对象不算。

## EJS 与 MVU

ST-Prompt-Template 原生作用域只有 `global/local/message/cache/initial`。它不会自动提供顶层 `stat_data`。联动必须采用真实桥：

- Tavern Helper 脚本监听 `prompt_template_prepare`，从消息变量中找到最近有效 MVU 快照（`stat_data` 与 `schema` 同时存在才算有效）并显式写入 `context.mvu`；或
- 模板通过已验证的宿主 API主动读取。

EJS 模板随后读取：

```ejs
<%_ const state = typeof mvu === 'object' && mvu ? mvu.stat_data : null; _%>
```

没有桥时不得声明 EJS 已能读取 MVU。

`getwi()` 是异步模板化导入，使用 `await`；关键条目显式给世界书名。EJS、MVU、正则和脚本不要竞争同一字段的写入权。

## 完成条件

- 初值最终落在 `MvuData.stat_data` 正确路径；
- 更新协议能被当前 MVU 解析；
- Loader/Schema/更新/清理/UI 形成闭环；
- EJS 有真实条目、执行阶段、桥接脚本和失败行为；
- Tavern Helper 脚本交付为可导入 Script/ScriptFolder JSON，`.js` 仅作可读源码；
- 未实测部分记录 `runtime: not_run`。
