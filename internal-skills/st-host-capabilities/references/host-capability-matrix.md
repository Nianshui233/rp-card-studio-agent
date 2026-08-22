# 宿主能力矩阵

本文按提供者和调用表面路由当前项目需要的能力，不把接口汇总成一个虚构的统一宿主。

## 静态基线

- SillyTavern Core `1.18.0`；
- Tavern Helper `4.9.3`；
- ST-Prompt-Template `1.17.8.1`；
- MagVarUpdate 以目标 bundle commit/tag 或现场构建为准。

静态源码核对记为 `source_checked`；真实页面中的导入、挂载、读写和耐久持久化通过才记为 `runtime_pass`。

## 解析顺序

Tavern Helper iframe 中：

```text
当前 window 裸绑定函数 / window.TavernHelper
→ 当前 window.SillyTavern 代理
→ 必要时 window.parent.Mvu、父页 DOM 或本体私有导出
→ 玩家可见手动回退
```

裸绑定函数与 `window.TavernHelper` 来自同一 provider，但裸函数可能是带当前 iframe 身份的 `_bind` 包装。例如脚本变量自动补 `script_id`、`waitGlobalInitialized('Mvu')` 还会绑定 getter 并等待第 0 楼状态；不能把两种表面当作完全可互换的同一函数。

## 消息与变量

| 能力 | Provider | 表面 | 关键限制 |
|---|---|---|---|
| `getCurrentMessageId` | Tavern Helper | TH 消息 iframe | 后台脚本与 STPT iframe 不可直接使用 |
| `getChatMessages/setChatMessages` | Tavern Helper | iframe/script | `data` 是当前 Swipe 消息变量；`extra` 是附加信息 |
| `retrieveDisplayedMessage` | Tavern Helper | 页面显示 | 临时 DOM，不持久化 |
| `getVariables/replaceVariables` | Tavern Helper | iframe/script | scope 含 preset；`latest` 读写不对称 |
| `Mvu.getMvuData/replaceMvuData` | MVU | Mvu 全局 | 写完整 MvuData；关键写入使用数值楼层 |
| `getvar/setvar` | ST-Prompt-Template | EJS | EJS 自己的 global/local/message/cache/initial scope |

消息变量关键规则：

- `getVariables({type:'message', message_id:'latest'})` 读取最后一个非 system 消息；
- `replaceVariables(..., {message_id:'latest'})` 当前写物理 `-1`，可能是 system 消息；
- 因此 `'latest'` 只作容错只读，关键写入先解析明确数值 ID；
- `replaceVariables` 当前返回 `void` 并防抖保存；同楼立即读回是 `write_accepted`，不是耐久 `persisted`；
- 关键事务显式等待 `SillyTavern.getContext().saveChat()` 或等价已验证保存能力。

`registerVariableSchema` 只影响 Tavern Helper 变量管理器 UI；`registerMvuSchema` 是外部 Zod 路线；MVU 内部 `schema` 来自 `[initvar]` 与 `$meta`。三者不能互换。

## 世界书

### SillyTavern Core

- `data.character_book`：角色卡携带的嵌入书；
- `data.extensions.world`：角色当前主世界书绑定名；
- additional books：本体角色世界书设置；
- chat book：聊天 metadata。

嵌入书存在、独立书已导入、角色已绑定是三项不同证据。MVU 的角色卡配置覆盖存于主世界书禁用条目 `[config_override]`（见 host/mvu-runtime.md）。

### Tavern Helper

- 管理文件与绑定：`getWorldbookNames`、`getGlobalWorldbookNames`、`rebindGlobalWorldbooks`、`getWorldbook`、`createWorldbook`、`createOrReplaceWorldbook`、`replaceWorldbook`、`getCharWorldbookNames`、`rebindCharWorldbooks`、`getChatWorldbookName`、`getOrCreateChatWorldbook`、`rebindChatWorldbook`；
- 当前条目更新：`updateWorldbookWith`、`createWorldbookEntries`、`deleteWorldbookEntries`；
- 旧 `getLorebookEntries/replaceLorebookEntries/...` 已 deprecated；旧 filter 对字符串使用包含匹配，不可用于 canonical 名称的精确唯一判定；
- 当前版本重绑角色/聊天仅支持 `'current'`；完成后重新读取绑定结果。

写 canonical `<user>` 条目时按新 Worldbook API 精确比较 `entry.name === '<user>'`，以 UID 更新或创建；0 个创建、1 个更新、多于 1 个停止并报告冲突。

### ST-Prompt-Template

- `getwi`：绕过普通关键词入口，执行正则、宏和递归 EJS 后返回文本；无书名形态使用当前扫描上下文的世界书，不是多级查找；
- `activewi`：把条目加入原生激活流程；当前轮应在 generate-before 调用；`force` 覆盖冷却/延迟/组/向量化/预算/触发器并强制 constant，但不清理 sticky 与递归限制；
- `@@preprocessing`：原生扫描前改内容/关键词，存在二次处理与顺序风险。

## 正则

SillyTavern 本体当前顺序：

```text
GLOBAL → SCOPED → PRESET
```

来源：`SCRIPT_TYPES` 数值为 `{ GLOBAL: 0, PRESET: 2, SCOPED: 1 }`，`getRegexScripts()` 按整数键升序遍历；字面量声明顺序不是执行顺序。

角色 scoped 和 preset regex 还受 allowlist 控制。检查：

- Regex 扩展总开关；
- 角色/预设 allow 状态；
- placement 类型和来源；
- display/prompt；
- display、prompt、edit、Swipe 各自 depth；
- `runOnEdit` 是否永久污染原消息；
- 动态前端是否真正形成 fenced HTML 代码块并被 Tavern Helper 转成 iframe。

## 生命周期

| 事件族 | Provider | 清理与时序 |
|---|---|---|
| `eventSource/eventTypes` | SillyTavern Core | 保存 listener，`removeListener` |
| TH 裸 `eventOn/eventOnce/...` | Tavern Helper TH iframe/script | iframe/script 关闭自动清理；仍保存返回的 `stop` |
| `parent.TavernHelper.eventOn/...` | Tavern Helper namespace | 非 TH iframe 不假定自动按实例清理，必须主动 `stop` |
| `Mvu.events.*` | MVU，经 TH 事件总线 | 变换阶段事件，不等于消息变量持久化完成 |
| `prompt_template_prepare` | ST-Prompt-Template 自定义事件 | bridge 脚本负责注册和卸载 |

编辑、Swipe、消息删除、聊天切换、加载更多和页面卸载都可能改变消息实例。消息 UI 每次重建后重新读取当前数值楼层。开场页在切换第 0 楼 Swipe 时可能销毁自身 iframe，提交事务的后半段不能依赖旧实例继续运行。

## 生成

| 能力 | Provider | 关键规则 |
|---|---|---|
| `generate/generateRaw` | Tavern Helper | 独立请求；设置 `generation_id`；不创建聊天楼层 |
| `iframe_events` 流式事件 | Tavern Helper | payload 含 generation_id |
| `tavern_events` 生成事件 | SillyTavern | payload 与 iframe_events 不同 |
| `injectPrompts` | Tavern Helper | 当前聊天有效，保存 uninject |
| `setExtensionPrompt` | SillyTavern | 运行时内存注入，不自动持久化 |

开场提交必须走正常 ST 发送链并验证真实 user 楼与真实 AI 楼；`generate()` 返回文本、`createChatMessages()` 插入 user 楼都不能单独冒充完整正常消息链。

## 前端载体

- 纯 SillyTavern：静态 Markdown/净化后 HTML；不执行消息内脚本；
- Tavern Helper：fenced HTML 代码块（代码文本含 `html>` / `<head>` / `<body` 子串）→ `<pre>` → `srcdoc` 或 Blob URL iframe；
- ST-Prompt-Template `@@iframe`：只在有 `msgId` 的消息渲染路径建立；不注入 TH 裸函数；当前 iframe 无 `sandbox`，可通过显式 `window.parent` 能力探测访问同源父页；
- 后台 Tavern Helper Script：隐藏脚本 iframe，适合开场提交协调、事件和桥接；
- 每个 TH iframe 注入 `_`、`z`、`YAML`、`showdown`、`toastr`、`EjsTemplate`、`TavernHelper` 与裸绑定函数；
- 页面级全局扩展：只有用户明确要求时单独开发。

不同载体必须有不同 adapter：TH 用 `getCurrentMessageId`；STPT 由 EJS render context 把 `message_id` 写进 HTML，事件句柄主动停止；纯 ST 不承诺动态行为。

## ST-Prompt-Template 默认安全态

目标版本 `1.17.8.1` 默认：

```text
raw_message_evaluation_enabled = true
sandbox = false
autosave_enabled = false
```

模型输出中的 EJS 默认可能执行；除非项目明确需要，关闭 raw-message evaluation。生成/渲染结束只调用 `checkAndSave()`，默认不实际落盘。

## 远程依赖

记录直接 URL、锁定版本/commit、传递依赖、加载顺序、网络失败表现和手动回退。`registerMvuSchema` 在 `$(() => ...)` 或等价宿主 Ready 后注册，复用目标环境的 `window.z`；未锁 URL 不得声称可复现，未联网实测时保持 `not_run`。
