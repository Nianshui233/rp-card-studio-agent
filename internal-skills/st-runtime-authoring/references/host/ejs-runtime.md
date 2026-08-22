# ST-Prompt-Template / EJS 运行时参考

当前静态基线为 ST-Prompt-Template `1.17.8.1`（核对自 `src/modules/exports.ts`、`src/function/ejs.ts`、`src/function/variables.ts`、`src/function/worldinfo.ts`、`src/modules/handler.ts`、`src/utils/evaluate.ts`、`src/utils/iframe.ts`）。EJS 是高权限模板执行环境，不是变量存储层，也不是安全的模型代码沙盒。

## 默认设置先决条件

目标版本的关键默认值：

```text
raw_message_evaluation_enabled = true
sandbox = false
autosave_enabled = false
```

因此默认行为不是“模型可控 EJS 不执行”，而是：首次真实消息渲染时，原始 `message.mes` 会经过正则与 EJS，成功结果写回消息原文；Tavern Helper `generate/generateRaw` 的返回文本也有对应 EJS 处理钩子。除非项目明确需要模型/用户消息中的 EJS，关闭 `raw_message_evaluation_enabled`。`sandbox:true` 只能降低部分直接全局访问风险，不能替代“不执行不可信模板代码”。

## 三条处理路径

1. **生成提示词**：生成前路由挂在 `GENERATION_AFTER_COMMANDS`；生成后对每条待发消息依次执行专用条目→正则→EJS→消息级 AFTER→全局 AFTER，再把结果写回待发 chat 内容，最后调用 `checkAndSave()`。
2. **原始消息永久处理**：非 dry-run 且 `raw_message_evaluation_enabled` 开启时，对 `message.mes` 执行正则与 EJS，成功后写回原文并 `updateMessageBlock`；处理失败返回 null 不写回。
3. **显示渲染**：读取 `.mes_text` 当前显示容器的 HTML，实体解码后执行渲染 EJS，只更新当前 DOM。

渲染阶段 `<%=` 走 escaped 路径，escaper 是本体 `messageFormatting`；`<%-` 直出 HTML。

## 变量作用域

```text
global    extension_settings.variables.global
local     chat_metadata.variables（当前聊天）
message   当前消息 Swipe 变量（无 withMsg 时实际读合并视图）
cache     当前合并视图
initial   STATE.initialVariables
```

合并视图按 `global → initial → local(chat) → 当前消息变量 → _trace_id/_modify_id` 覆盖合成。不会自动包含 MVU 顶层 `stat_data`。

- `getvar` 选项：`{index, scope, defaults, withMsg:{role,id,swipe_id}, noCache, clone}`；`noCache:true` 重建合并视图，与模板编译缓存无关；
- `setvar` 选项：`{index, scope, flags:'nx'|'xx'|'n'|'nxs'|'xxs', results:'old'|'new'|'fullcache', withMsg, merge, dryRun, noCache}`；默认写 message scope；
- 准备阶段 dry-run 时，不显式 `dryRun:true` 的写入直接跳过；
- 生成和渲染结束会调用 `checkAndSave()`，但只有 `force:true` 或 `autosave_enabled !== false` 才实际调用 `saveChatConditional()`；默认 autosave 为 false；
- 需要耐久保存时显式启用 autosave，或调用 `EjsTemplate.saveVariables(true)`；随后按关键程度做重载后读回，不把变量缓存中的即时可见值当成磁盘证据。

## 公开 API（`globalThis.EjsTemplate`）

以 `src/modules/exports.ts` 的真实 runtime exports 为准：

```text
EjsTemplate.prepareContext(context = {}, end = -1)
EjsTemplate.evalTemplate(code, context = null, options = {})
EjsTemplate.compileTemplate(content, options = {}, thisData = {})
EjsTemplate.getSyntaxErrorInfo(code, count = 4)
EjsTemplate.getFeatures()
EjsTemplate.setFeatures(...) / resetFeatures()
EjsTemplate.saveVariables(force?)
EjsTemplate.refreshWorldInfo()
EjsTemplate.initialVariables
EjsTemplate.defines
EjsTemplate.allVariables
EjsTemplate.parseJSON / jsonPatch / finalization
```

- 公开 `prepareContext` 参数顺序是 `(context, end)`；扩展内部函数是 `(msg_id, env)`，卡内代码只按公开签名调用；
- `evalTemplate` 的 `context` 默认 null，null 时自动 `prepareContext()`；失败 reject/throw；
- 当前补充 `exported.ejstemplate.d.ts` 已滞后：把 `evalTemplate` 错写为 `evaltemplate`，并漏掉 `saveVariables/refreshWorldInfo/compileTemplate` 等；声明与 runtime source 冲突时以目标版本真实 export 为准并注明 source_checked。

## 特殊条目与设置

已登记 decorator：

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
@@private
```

`@@dont_deactivate` 在代码中被检查但未登记进 KNOWN_DECORATORS，不依赖。`[GENERATE:*]`、`[RENDER:*]`、`@INJECT` 是 comment 路由约定，不是 decorator。

普通激活筛选顺序：概率 → constant → `@@activate` → `@@dont_activate` → 排除 `@@only_preload` → 主关键词 → secondary key/selectiveLogic。组、冷却、延迟、向量化属其他扫描逻辑，不是每条路径统一筛选器。

特殊条目的 enabled/disabled 语义受 `invert_enabled` 控制，当前默认 true，只影响特殊条目。`@@always_enabled` 直接让 `isEnabled` 返回 true。关键条目不能假定玩家现场设置未变。

## `getwi`

`getwi` 与 `getWorldInfo` 同一实现，async：

```ejs
<%- await getwi('书名', '条目名或正则或uid', data?) %>
<%- await getwi('条目名', data) %>
```

处理管线：条目内容 → DataOverride → WORLD_INFO 正则 → SillyTavern 宏 → 递归 EJS → 返回字符串。

无书名形态使用当前扫描上下文的世界书，不是多级查找；关键调用显式写书名。被调用条目的 EJS 副作用可能重复执行，不把 `getwi` 当无副作用原文读取。

## EJS 与 MVU bridge

ST-Prompt-Template 不自动读取 Mvu。事件走 SillyTavern `eventSource`：

```text
eventSource.emit('prompt_template_prepare', context)
```

真实 bridge 示例顺序：

```text
prompt_template_prepare(context)
→ getChatMessages() 找最近 stat_data 与 schema 同时存在的消息快照
→ 深拷贝写入 context.mvu
→ EJS 只读 mvu.stat_data
```

没有该脚本时不得在 EJS 中直接引用顶层 `stat_data`。bridge 监听在脚本卸载时显式 remove/stop。

## `@@iframe`

世界书内容经 `WORLD_INFO 正则 → 宏 → EJS →（可选 messageFormatting）→ iframe 包装`，但只有调用路径传入具体 `msgId` 时才触发；它是 render-stage carrier，不是任意 generate-stage 世界书调用都会建立的 iframe。

当前 iframe 实现：

- `DOMParser` 解析 HTML 后写入 `srcdoc`；
- 额外注入尺寸监听脚本；
- 不自动注入 Tavern Helper 裸函数、`window.TavernHelper` 或 TH 的 `window.SillyTavern` 代理；
- iframe 本身未设置 `sandbox`，是同源高权限 `srcdoc`；可以显式通过 `window.parent` 做能力探测，但也必须按高权限页面审计；
- 带 title 时外包 `<details>`。

STPT 页面需要当前楼层时，由 EJS render context 把 `message_id/swipe_id` 序列化到 HTML 的 `data-*` 或初始化对象中，不调用 `getCurrentMessageId()`。若经 `window.parent.TavernHelper.eventOn` 注册事件，保存句柄并在自身 `pagehide` 主动 `stop`；不享有 TH iframe 裸事件自动清理合同。

## 安全与回退

EJS 上下文可包含 `$`、Slash 执行、世界书、正则、提示词注入和 SillyTavern context。实施与 QA 至少确认：

- `raw_message_evaluation_enabled` 是否确实需要；不需要则关闭；
- `sandbox` 的现场设置与局限；
- 模型/用户是否能控制进入 EJS 的文本；
- 是否存在写变量、执行 Slash、改世界书、注入提示词或访问父页的副作用；
- 失败后保持原消息、静态回退或明确错误，不静默显示伪成功。

错误行为：公开 `evalTemplate` 失败 reject/throw；通用 handler 多数 toast/console 后返回 null；生成前与生成提示词主处理会继续向上抛；消息渲染路径吞掉错误并保持原显示。语法检查只证明可编译，实际输出仍需真实宿主检查。
