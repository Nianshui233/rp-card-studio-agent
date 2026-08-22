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

位于**当前启用世界书列表**中的条目，只要名称/comment 包含 `[initvar]` 就可提供基线。条目自身 enabled/disable 不参与 MVU 扫描；因此通常把 `[initvar]` 条目保持禁用，避免初始化 YAML/JSON 作为普通世界书内容进入提示词。

条目正文直接写 `stat_data` 内部数据：

```yaml
世界:
  当前区域: 港口
角色:
  体力: 80
```

不要再包：

```yaml
# 错误：会形成 stat_data.stat_data
stat_data:
  世界: {}
```

世界书必须实际存在于全局启用书、角色主书或附加书中。条目被禁用不妨碍 MVU 扫描，书没有进入启用列表则不会扫描。

### 开场 `<initvar>`

开场或额外问候中的 `<initvar>...</initvar>` 是另一条初始化入口。当前 MVU 会用其内容建立该 Swipe 的 `stat_data`，跳过角色主世界书的 `[initvar]` 基线，再加载其他启用世界书。

开场中的普通 `_.set(...)` / `<UpdateVariable>` 命令在基线建立后继续应用。不要把 `<initvar>` 与 `<UpdateVariable>` 写成同一种语义。

初始化事件时序必须记住：

```text
为某 Swipe 建立基线
→ VARIABLE_INITIALIZED(内存对象, swipe_id)
→ 继续解析该 Swipe 的普通更新命令
→ 所有 Swipe 完成后一次性写入 0 楼 swipes_data
```

因此不要在 `VARIABLE_INITIALIZED` 中立即重读消息变量判断初始化已经持久化。

## Loader 与 Schema

卡内加载 MagVarUpdate 时只保留一个真实 Tavern Helper Script。Loader URL、固定版本或 commit、传递依赖、最低 Tavern Helper 版本和网络失败回退进入交付说明。

外部 Zod 路线：

```ts
import { registerMvuSchema } from '锁定到目标版本或 commit 的 URL';
import { Schema } from '../../schema';

$(() => {
  registerMvuSchema(Schema);
});
```

- 在 `$(() => ...)` 或等价宿主 Ready 后注册；
- Schema 复用 Tavern Helper 注入的 `window.z`，不要再 import 第三套 Zod；
- `mvu_zod.js` 自身可能使用另一 Zod 实例，跨实例 `instanceof ZodObject` 行为必须按锁定 provider 真机验证；
- 远程 URL 不锁版本时只能标记未锁定依赖；
- `registerVariableSchema()`、MVU 内部 Schema 和 `registerMvuSchema()` 是三件不同的事。

## 更新协议

当前 MVU 常用方言包括（命令必须以 `;` 结尾，其后 `// 注释` 成为 reason）：

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

`_.move` 不是文本命令，只来自 JSON Patch 转换。

项目只能声明真实写出的方言。自定义外层标签可用于显示清理，但内层必须含 MVU 能解析的命令或 JSON Patch。

## 单写者

每个变量只有一个写者：模型更新命令或脚本计算二选一。确定性公式、派生变量与批量同步交给脚本；语义事件与剧情判断留给模型。

同轮更新与额外模型解析是两种执行方式。额外模型路线还需按目标版本核对工具调用、格式化输出和自动请求设置。

## 世界书路由

- `[mvu_plot]`：剧情侧；
- `[mvu_update]`：变量更新侧；
- 两者都无：按目标 bundle 的实际模式确认，不凭旧文档推断。

标记不改变条目激活：条目仍先走禁用、关键词、绿灯、depth、排序等正常逻辑，标记只决定已激活内容的模型去向。

## UI 读写

TH 消息 iframe：

```text
getCurrentMessageId()
→ Mvu.getMvuData({type:'message', message_id: 数值ID})
→ stat_data
```

无法取得消息 ID 时可只读回退 `'latest'`。关键写入不使用 `'latest'`：读取时它跳过 system，写入时当前实现写物理末楼，二者可能不是同一消息。`'current'` 不是有效 message_id。

STPT `@@iframe` 不使用 `getCurrentMessageId()`；由 EJS render context 把 `message_id/swipe_id` 显式写入页面数据。

### 写入闭环

```text
读取同一数值楼层的完整 MvuData
→ 产生合法命令并 Mvu.parseMessage，或直接修改完整副本
→ Mvu.replaceMvuData(完整数据, 同一数值楼层)
→ 必要时 await SillyTavern.getContext().saveChat()
→ 重新读取同一数值楼层
→ 关键事务按需重载后再次读回
→ 校验非默认值并反馈
```

`Mvu.replaceMvuData` 当前可同步返回；对它写 `await` 不等于等待磁盘保存。立即同楼读回只证明内存写入已接受。

`ChatMessage.data` 是当前 Swipe 的消息变量存储面。只有写入完整合法 MvuData 且能由 `Mvu.getMvuData()` 读回，才算 MVU 写入；要声称耐久保存还需保存完成证据。普通 `extra`、叙事正文或页面局部对象不算。

### 自动刷新

MVU 变换事件在消息变量写入前触发：

```text
VARIABLE_UPDATE_ENDED
→ Schema/Zod 后处理
→ updateVariablesWith 写消息变量
→ assistant 才 setChatMessages 并触发后续消息更新
```

因此：

- 不写 `VARIABLE_UPDATE_ENDED → 立即 getMvuData()`；
- 自己发起的按钮写入在保存与读回后直接 render；
- assistant 更新随后重渲染消息并通常重建 iframe，新实例启动时读取最终状态；`MESSAGE_UPDATED` 不是 MVU 保证的完成事件；
- user 消息变量更新没有同等自动重渲染保证；需要项目自有 post-write 事件或显式刷新；
- MVU 事件仅用于修改事件 payload、设置 dirty 标记或显示瞬时变化。

## EJS 与 MVU

ST-Prompt-Template 原生作用域只有 `global/local/message/cache/initial`，不会自动提供顶层 `stat_data`。联动必须采用真实 bridge：

```text
TH 后台脚本监听 prompt_template_prepare(context)
→ 读取最近有效完整 MvuData
→ 深拷贝写 context.mvu
→ EJS 只读 mvu.stat_data
```

写回方向另行明确，不默认允许 EJS 和 MVU 同时写同一状态树。

ST-Prompt-Template `1.17.8.1` 默认 `raw_message_evaluation_enabled:true`、`sandbox:false`、`autosave_enabled:false`。如果只把 EJS 用作受控世界书模板，建议关闭 raw-message evaluation，避免模型输出被当 EJS 执行；需要持久化 EJS 变量时显式 `saveVariables(true)`。

## 完成判定

- 真实 Loader、初值、内部 Schema 或外部 Zod 路线一致；
- 每个状态字段有唯一写者和真实读写路径；
- 所有消息写入使用明确数值楼层；
- 区分内存读回与耐久保存；
- 初始化/更新事件不被误当作持久化完成；
- EJS 有真实条目、执行阶段、bridge、安全设置与失败行为；
- UI 能从当前楼层/Swipe 读取同一权威源；
- 未做真实宿主测试时记录 `runtime: not_run`。
