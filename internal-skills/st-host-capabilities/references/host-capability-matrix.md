# 宿主能力矩阵

本文按提供者和调用表面路由当前项目需要的能力，不把接口汇总成一个虚构的统一宿主。

## 静态基线

- SillyTavern Core `1.18.0`；
- Tavern Helper `4.9.3`；
- ST-Prompt-Template `1.17.8.1`；
- MagVarUpdate 以目标 bundle commit/tag 或现场构建为准。

静态源码核对记为 `source_checked`；真实页面中的导入、挂载、读写和持久化通过才记为 `runtime_pass`。

## 解析顺序

Tavern Helper iframe 中：

```text
当前 window 裸绑定函数 / window.TavernHelper
→ 当前 window.SillyTavern 代理
→ 必要时 window.parent.Mvu、父页 DOM 或本体私有导出
→ 玩家可见手动回退
```

裸绑定函数与 `window.TavernHelper` 是同一注入面，不是两个独立版本层。

## 消息与变量

| 能力 | Provider | 表面 | 关键限制 |
|---|---|---|---|
| `getCurrentMessageId` | Tavern Helper | 消息 iframe | 后台脚本 iframe不可用 |
| `getChatMessages/setChatMessages` | Tavern Helper | iframe/script | `data` 是当前 Swipe 消息变量；`extra` 是附加信息 |
| `retrieveDisplayedMessage` | Tavern Helper | 页面显示 | 临时 DOM，不持久化 |
| `getVariables/replaceVariables` | Tavern Helper | iframe/script | scope 含 preset；message_id 只接受 number/`latest` |
| `Mvu.getMvuData/replaceMvuData` | MVU | Mvu 全局 | 写入完整 MvuData，同楼读回 |
| `getvar/setvar` | ST-Prompt-Template | EJS | EJS 自己的 global/local/message/cache/initial scope |

`registerVariableSchema` 只影响 Tavern Helper 变量管理器 UI；`registerMvuSchema` 是外部 Zod 路线；MVU 内部 `schema` 来自 `[initvar]` 与 `$meta`。三者不能互换。

## 世界书

### SillyTavern Core

- `data.character_book`：角色卡携带的嵌入书；
- `data.extensions.world`：角色当前主世界书绑定名；
- additional books：本体角色世界书设置；
- chat book：聊天 metadata。

嵌入书存在、独立书已导入、角色已绑定是三项不同证据。MVU 的角色卡配置覆盖存于主世界书禁用条目 `[config_override]`（见 host/mvu-runtime.md）。

### Tavern Helper

- 管理文件与绑定：`getWorldbook`、`createOrReplaceWorldbook`、`replaceWorldbook`、`getCharWorldbookNames`、`rebindCharWorldbooks`、`getChatWorldbookName`、`rebindChatWorldbook`；
- 当前版本重绑角色/聊天仅支持 `'current'`；
- 完成后重新读取绑定结果。

### ST-Prompt-Template

- `getwi`：绕过普通关键词入口，执行正则、宏和递归 EJS后返回文本；无书名形态使用当前扫描上下文的世界书，不是多级查找；
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

| 事件族 | Provider | 清理 |
|---|---|---|
| `eventSource/eventTypes` | SillyTavern Core | 保存 listener，`removeListener` |
| `eventOn/eventOnce/...` | Tavern Helper | iframe/script 关闭自动清理；可用返回的 `stop` |
| `Mvu.events.*` | MVU，经 TH 事件总线 | 按目标 bundle payload |
| `prompt_template_prepare` | ST-Prompt-Template 自定义事件 | bridge 脚本负责注册和卸载 |

编辑、Swipe、消息删除、聊天切换、加载更多和页面卸载都可能改变消息实例。消息 UI 每次重建后重新读取当前数值楼层。

## 生成

| 能力 | Provider | 关键规则 |
|---|---|---|
| `generate/generateRaw` | Tavern Helper | 为并发请求设置 `generation_id` |
| `iframe_events` 流式事件 | Tavern Helper | payload 含 generation_id |
| `tavern_events` 生成事件 | SillyTavern | payload 与 iframe_events 不同 |
| `injectPrompts` | Tavern Helper | 当前聊天有效，保存 uninject |
| `setExtensionPrompt` | SillyTavern | 运行时内存注入，不自动持久化 |

## 前端载体

- 纯 SillyTavern：静态 Markdown/净化后 HTML；不执行消息内脚本；
- Tavern Helper：fenced HTML 代码块（代码文本含 `html>` / `<head>` / `<body` 子串）→ `<pre>` → `srcdoc` 或 Blob URL iframe；
- ST-Prompt-Template `@@iframe`：扩展创建 srcdoc iframe（仅尺寸监听脚本），不注入 Tavern Helper 高层函数；
- 后台 Tavern Helper Script：隐藏脚本 iframe，适合事件和桥接；
- 每个 TH iframe 注入 `_`、`z`（Zod）、`YAML`、`showdown`、`toastr`、`EjsTemplate`、`TavernHelper` 与裸绑定函数；
- 页面级全局扩展：只有用户明确要求时单独开发。

## 远程依赖

记录直接 URL、锁定版本/commit、传递依赖、网络失败表现和手动回退。未锁 URL不得声称可复现；未联网实测时保持 `not_run`。
