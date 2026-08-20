# ST-Prompt-Template / EJS 运行时参考

当前静态基线为 ST-Prompt-Template `1.17.8.1`。EJS 是高权限模板执行环境，不是变量存储层，也不是安全的模型代码沙盒。

## 三条处理路径

1. **生成提示词**：SillyTavern 组装消息后，扩展执行 EJS，再把结果发给模型；
2. **原始消息永久处理**：对 `message.mes` 执行扩展的 message-before 临时正则与 EJS，然后写回聊天原文；
3. **显示渲染**：读取 `.mes_text` 已经过正则、Markdown 和净化的 HTML，再执行渲染 EJS，只改变当前 DOM。

三条路径的输入、正则顺序、持久化和错误行为不同。渲染阶段的 `<%=` 使用消息格式化 escaper，`<%-` 直接输出 HTML。

## 变量作用域

原生作用域：

```text
global
local（当前聊天）
message（消息与 Swipe）
cache（本轮合并视图）
initial
```

`variables` 合并 global、initial、local 和消息变量。它不自动包含 MVU 顶层 `stat_data`。

`getvar` 的 `noCache` 控制变量合并视图重读；与模板编译缓存无关。对象读取需要修改时使用 `clone:true` 或显式 `setvar`，不要悄悄改共享引用。

`setvar` 默认写 message scope；准备阶段通常为 dry run，除非明确允许，不应产生副作用。是否立即落盘受自动保存与显式 `EjsTemplate.saveVariables()` 影响。

## 公开 API

```text
EjsTemplate.prepareContext(context = {}, end = -1)
EjsTemplate.evalTemplate(code, context = {}, options = {})
EjsTemplate.getSyntaxErrorInfo(code, max_lines = 4)
EjsTemplate.getFeatures()
EjsTemplate.saveVariables()
EjsTemplate.refreshWorldInfo()
EjsTemplate.initialVariables
EjsTemplate.compileTemplate()
```

注意公开 `prepareContext` 的参数顺序是 `context, end`；扩展内部函数使用另一套参数顺序，卡内脚本不要照内部签名调用。

先准备上下文后需补字段时，原地修改同一对象：

```js
const context = await EjsTemplate.prepareContext({}, -1);
context.extra = value;
const text = await EjsTemplate.evalTemplate(code, context);
```

公共 `evalTemplate()` 失败会 reject/throw，调用方自己 `try/catch`。宿主内部 handler 多数会 toast/console 后返回 `null`，但生成前和预加载某些错误仍会向上抛出。宿主不会自动生成项目定义的中文空态。

## 初始变量

`[InitialVariables]` / `@@initial_variables` 是 EJS 自己的 initial scope来源，不是 MVU `[initvar]`。当前版本在预加载时处理它们，并把 JSON/YAML 对象合入 initial variables。

若项目同时启用两者，明确谁拥有状态；不要让 EJS initial 和 MVU 快照各自维护一套同名树。

## 特殊条目与设置

常见路由：

```text
@@preload / @@only_preload / @@dont_preload
@@initial_variables
@@generate_before / @@generate_after
@@render_before / @@render_after
@@message_formatting
@@iframe
@@if
@@preprocessing
[GENERATE:*] / [RENDER:*] / @INJECT
```

特殊标记只决定候选路由，条目仍可能受 constant、关键词、概率、组和 `@@activate/@@dont_activate` 筛选。

特殊条目的启用/禁用语义受 `invert_enabled` 控制。当前默认兼容模式为 `true`，但项目不能假定玩家现场未修改；关键条目可结合现场设置或 `@@always_enabled` 明确处理。

## `getwi`

`getwi()` 是异步的模板化导入：

```text
读取条目
→ WORLD_INFO Tavern Regex
→ SillyTavern 宏
→ 递归 EJS
→ 返回字符串
```

使用：

```ejs
<%- await getwi('目标世界书', '目标条目') %>
```

无书名调用的默认查找优先角色主书、Persona 书、聊天书，再在启用书中模糊搜索。关键调用显式写书名，避免同名冲突。被调用条目的 EJS 副作用可能重复执行，不把 `getwi` 当无副作用原文读取。

## `activewi`

要影响当前生成，推荐在 `@@generate_before` / `[GENERATE:BEFORE]` 中调用。世界书扫描之后调用通常只能影响下一轮。

`force=true` 会清除或覆盖冷却、延迟、组、向量化、预算等限制，不等于保留原生关键词语义。

## 模板缓存与变量缓存

- 模板缓存：缓存编译函数，键含 filename 与内容 hash；不缓存最终输出；
- 变量缓存：`prepareContext/precacheVariables` 建立的合并视图；`getvar(...,{noCache:true})` 负责重读。

调试分别记录 `cache_enabled`、模板 filename/hash、消息 ID/Swipe 和变量重读方式。

## MVU bridge

ST-Prompt-Template 不自动读取 Mvu。真实 bridge 可以由 Tavern Helper 脚本监听：

```text
prompt_template_prepare(context)
→ 从 getChatMessages() 找最近含 data.stat_data 的消息快照
→ 深拷贝到 context.mvu
→ EJS 只读 mvu.stat_data
```

没有该脚本时不得在 EJS 中直接引用顶层 `stat_data`。

## 安全与回退

EJS 上下文可包含 `$`、Slash 执行、世界书、正则、提示词注入和 SillyTavern context。默认不执行模型可控 EJS；若启用生成后代码，按高权限副作用路线验收。

语法检查通过只证明可编译。扩展开关、阶段开关、条目激活、变量持久化和实际输出仍需真实宿主检查。
