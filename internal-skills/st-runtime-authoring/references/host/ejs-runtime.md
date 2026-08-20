# ST-Prompt-Template / EJS 运行时参考

当前静态基线为 ST-Prompt-Template `1.17.8.1`（核对自 `src/modules/exports.ts`、`src/function/ejs.ts`、`src/function/variables.ts`、`src/function/worldinfo.ts`、`src/modules/handler.ts`、`src/utils/evaluate.ts`、`src/utils/iframe.ts`）。EJS 是高权限模板执行环境，不是变量存储层，也不是安全的模型代码沙盒。

## 三条处理路径

1. **生成提示词**：生成前路由挂在 `GENERATION_AFTER_COMMANDS`；生成后对每条待发消息依次执行专用条目→正则→EJS→消息级 AFTER→全局 AFTER，再把结果写回待发 chat 内容，最后 `checkAndSave`。
2. **原始消息永久处理**：对 `message.mes` 执行正则与 EJS 后写回聊天原文——**仅在非 dry-run 且设置 `raw_message_evaluation_enabled` 开启时**；处理失败返回 null 不写回。
3. **显示渲染**：读取 `.mes_text` 当前显示容器的 HTML（已过本体正则、Markdown 与净化），实体解码后执行渲染 EJS，只更新当前 DOM。

渲染阶段 `<%=` 走 escaped 路径、escaper 即本体 `messageFormatting`；`<%-` 直出 HTML。

## 变量作用域

```text
global    extension_settings.variables.global
local     chat_metadata.variables（当前聊天）
message   当前消息 Swipe 变量（无 withMsg 时实际读合并视图）
cache     当前合并视图
initial   STATE.initialVariables
```

合并视图按 `global → initial → local(chat) → 当前消息变量 → _trace_id/_modify_id` 顺序覆盖合成。**不会自动包含 MVU 顶层 `stat_data`**。

- `getvar` 选项：`{index, scope, defaults, withMsg:{role,id,swipe_id}, noCache, clone}`；`noCache:true` 重建合并视图，与模板编译缓存无关。
- `setvar` 选项：`{index, scope, flags:'nx'|'xx'|'n'|'nxs'|'xxs', results:'old'|'new'|'fullcache', withMsg, merge, dryRun, noCache}`；默认写 `message` scope。
- 准备阶段 dry-run 时不显式 `dryRun:true` 的写入直接跳过。
- 落盘由 `checkAndSave` 控制：`autosave_enabled` 开启或 `force` 时才写盘；生成处理与渲染结束各自动保存一次。

## 公开 API（`globalThis.EjsTemplate`）

```text
EjsTemplate.prepareContext(context = {}, end = -1)      # 注意公开层参数顺序是 context, end
EjsTemplate.evalTemplate(code, context = null, options = {})
EjsTemplate.compileTemplate(content, options = {}, thisData = {})  # 返回编译后函数
EjsTemplate.getSyntaxErrorInfo(code, count = 4)
EjsTemplate.getFeatures()          # settings 浅拷贝
EjsTemplate.setFeatures(...) / resetFeatures()
EjsTemplate.saveVariables(force?)  # 即 checkAndSave；受 autosave 门控
EjsTemplate.refreshWorldInfo()     # async，重跑预加载
EjsTemplate.initialVariables       # getter
EjsTemplate.defines                # getter
EjsTemplate.allVariables           # 即 precacheVariables
EjsTemplate.parseJSON / jsonPatch / finalization
```

- 扩展内部 `prepareContext(msg_id?, env = {})` 参数顺序相反，卡内脚本只按公开签名调用。
- `evalTemplate` 的 `context` 默认 `null`：null 时自动先 `prepareContext()`；失败表现为 rejected Promise（内部 catch 后重新抛出）。输入不是字符串或没有 EJS 分隔符时原样返回输入。
- 先准备上下文后需补字段时，原地修改同一对象再 `evalTemplate`。

## 初始变量

`[InitialVariables]` / `@@initial_variables` 是 EJS 自己的 initial scope 来源，不是 MVU `[initvar]`；预加载时把 JSON/YAML 对象合入 initial variables。同时启用两者时明确状态所有权，不让两套同名树并存。

## 特殊条目与设置

已登记 decorator 完整清单：

```text
@@activate / @@dont_activate
@@message_formatting
@@generate_before / @@generate_after
@@render_before / @@render_after
@@preload / @@only_preload / @@dont_preload
@@initial_variables
@@always_enabled
@@iframe
@@preprocessing / [Preprocessing]
@@if
@@private                       # 创建私有作用域
```

另有 `@@dont_deactivate` 在代码中被检查但未登记进 KNOWN_DECORATORS，解析可靠性存疑，不要依赖。`[GENERATE:*]`、`[RENDER:*]`、`@INJECT` 是 comment 路由约定，不是 decorator。

普通激活筛选顺序：概率 → constant 直接通过 → `@@activate` 直接通过 → `@@dont_activate` 抑制 → `@@only_preload` 从普通选择排除 → 主关键词 → secondary key/selectiveLogic。组、冷却、延迟、向量化属其他扫描逻辑，不是每条路径的统一筛选器。

特殊条目的启用/禁用语义受 `invert_enabled` 控制（当前默认 `true`，只影响特殊条目：invert 开启时特殊条目用 `disable` 值反转判断）。`@@always_enabled` 直接让 `isEnabled` 返回 true。项目不能假定玩家现场未改设置；关键条目结合 `@@always_enabled` 明确处理。

## `getwi`

`getwi` 与 `getWorldInfo` 同一实现，async，两种调用形态：

```ejs
<%- await getwi('书名', '条目名或正则或uid', data?) %>
<%- await getwi('条目名', data) %>
```

处理管线：条目内容 → DataOverride → WORLD_INFO 正则 → SillyTavern 宏 → 递归 EJS → 返回字符串。

无书名形态使用**当前扫描上下文的世界书**（`world_info.world`），不是多级查找；关键调用显式写书名。被调用条目的 EJS 副作用可能重复执行，不把 `getwi` 当无副作用原文读取。

## `activewi`

```text
activewi(书名, 条目, force?)
activewi(条目, force?)
```

`force=true` 时对条目施加：`disable:false`、`constant:true`、`cooldown:0`、`delay:0`、`vectorized:false`、`delayUntilRecursion:false`、`triggers:[]`、`ignoreBudget:true`、`group:''`、重算 hash、移除内容中 `@@dont_activate`。**不清理** `sticky`、`preventRecursion`、`excludeRecursion` 等递归限制。

要影响当前生成，在 `@@generate_before` / `[GENERATE:BEFORE]` 中调用；世界书扫描之后调用通常只能影响下一轮。激活结果写入 `activatedWorldEntries` 参与后续扫描。

## 模板缓存与变量缓存

- 模板缓存：filename 附加内容 hash 构造缓存键，缓存编译函数而非最终输出；
- 变量缓存：`prepareContext/precacheVariables` 建立合并视图，`getvar(...,{noCache:true})` 负责重读。

两套缓存相互独立。调试分别记录 `cache_enabled`、模板 filename/hash、消息 ID/Swipe 和变量重读方式。

## MVU bridge

ST-Prompt-Template 不自动读取 Mvu。事件走 SillyTavern `eventSource`：

```text
eventSource.emit('prompt_template_prepare', context)   # 单参数即 context
```

监听器对 context 的修改（如注入 `context.mvu`）会被后续模板执行看到——emit 后直接复用同一对象。Tavern Helper 脚本 `eventOn('prompt_template_prepare', ...)` 可监听同一总线。真实 bridge：

```text
prompt_template_prepare(context)
→ getChatMessages() 找最近 stat_data 与 schema 同时存在的消息快照（完整 MvuData）
→ 深拷贝写入 context.mvu
→ EJS 只读 mvu.stat_data
```

没有该脚本时不得在 EJS 中直接引用顶层 `stat_data`。

## `@@iframe`

世界书内容经 `WORLD_INFO 正则 → 宏 → EJS →（可选 messageFormatting）→ iframe 包装`（仅渲染阶段有 msgId 时触发）。iframe 用 `DOMParser` 解析 HTML 后写入 `srcdoc`，注入的唯一脚本是尺寸监听（postMessage 上报 scrollHeight）；**不注入** Tavern Helper 函数、`window.TavernHelper` 或 SillyTavern context。带 title 时外包 `<details>` 折叠。

## 安全与回退

EJS 上下文可包含 `$`、Slash 执行、世界书、正则、提示词注入和 SillyTavern context。默认不执行模型可控 EJS；若启用生成后代码，按高权限副作用路线验收。

错误行为：公开 `evalTemplate` 失败 reject/throw；通用 handler 多数 toast/console 后返回 null；生成前与生成提示词主处理会继续向上抛；消息渲染路径吞掉错误并保持原显示。语法检查通过只证明可编译，实际输出仍需真实宿主检查。
