# 宿主能力矩阵

本文把本机核对过的 SillyTavern、Tavern Helper、MVU 和消息 iframe 能力压缩成“能力—证据—回退”合同。它是自包含的运行参考，不复制任何外部仓库源码，也不要求每个项目启用全部能力。

当前核对基线：

- SillyTavern：本机 `1.18.0`；`window.SillyTavern.getContext()` 的具体字段以实际运行版本为准；
- Tavern Helper：本机参考仓库 `4.9.3`；
- 这些版本只是核对证据，不是运行时硬编码的最低门槛。真正交付时记录现场版本，按能力探测结果决定路线。

## 能力解析顺序

消息 iframe 或卡内脚本中，优先按下面顺序取得能力：

```text
当前 iframe 已注入的 Tavern Helper / 全局函数
→ window.TavernHelper
→ window.SillyTavern.getContext()
→ window.parent 的 DOM 或本体导出
→ 复制文本、手动操作或普通叙事回退
```

这不是禁止父页面访问。个人自用卡可以直接使用父页面 DOM、输入框、弹窗、生成和其他本体接口；只是不要一开始就假定某个私有字段一定存在。每次使用都要探测、反馈和清理。

`getContext()` 是现场能力快照，不是应当整包保存的配置文件。只选项目真正使用的函数；不要把聊天、角色、设置、扩展配置和函数对象原样塞进卡内。

## 版本与现场证据

优先读取：

- `getTavernVersion()`；
- `getTavernHelperVersion()`；
- `SillyTavern.getContext().eventTypes`、`eventSource` 和实际存在的函数；
- `TavernHelper` 真实高层接口。

账本记录：

```yaml
runtime_evidence:
  sillytavern_version: "1.18.0"
  tavern_helper_version: "4.9.3"
  checked_at: "现场验收时间"
  capabilities:
    host.api_resolution: runtime_pass
```

未读取版本不等于失败；但不能把静态检查或推测说成已经通过真实宿主。

## 消息与楼层

Tavern Helper 常用接口包括：

- `getChatMessages`、`setChatMessages`、`createChatMessages`、`deleteChatMessages`、`rotateChatMessages`；
- `retrieveDisplayedMessage`、`refreshOneMessage`；
- `getCurrentMessageId`、`getLastMessageId`、`getMessageId`。

设计时要明确：

- 消息 ID 是实际楼层号，负数是从末尾取深度；深度不等于 ID；
- `include_swipes` 是否包含未被 AI 使用的消息页；
- 创建/修改消息的 `data`、`extra` 是聊天附加元数据，不等于 MVU 状态；
- 编辑、Swipe、重载、切换聊天会让消息 iframe 重新创建；
- 修改角色卡或整套正则是重操作，不能当作普通 UI 刷新。

## 变量与 MVU

Tavern Helper 变量作用域至少区分：

- `global`、`character`、`chat`、`message`、`script`、`extension`；
- `message` 读取时可使用真实楼层 ID 或 `'latest'`；
- `waitGlobalInitialized('Mvu')` 负责等待共享的 MVU 全局完成初始化。

MVU 运行时通常采用：

```text
等待 Mvu 初始化
→ 获取当前楼层 ID
→ Mvu.getMvuData({ type: 'message', message_id })
→ 读取 stat_data
→ 失败时回退 TavernHelper.getVariables({ type: 'message', message_id })
→ 仍不可用才显示加载/空态/错误态
```

写入应有：

```text
读取当前值
→ 应用变更
→ 等待宿主完成
→ 重新读取
→ 把成功/失败反馈给玩家
```

必须区分：

- `registerVariableSchema`：主要用于 Tavern Helper 变量管理器 UI 的结构校验；
- `registerMvuSchema`：当前项目选择的 MVU Zod Schema 注册路线；
- `Mvu.getMvuData` / `Mvu.replaceMvuData`：运行时 MVU 数据读写；
- EJS 的 `global/local/message/cache/initial`：另一套模板作用域，不与 Tavern Helper 变量作用域混名。

需要立即读取刚写入的数据时，明确关闭缓存或重新读取宿主数据。不要只因聊天记录里出现新姓名、新地点，就声称 MVU 已经改变。

## MVU 事件

可按项目需要监听：

- `Mvu.events.VARIABLE_INITIALIZED`；
- `Mvu.events.VARIABLE_UPDATE_STARTED`；
- `Mvu.events.VARIABLE_UPDATE_ENDED`；
- `Mvu.events.BEFORE_MESSAGE_UPDATE`；
- `Mvu.events.COMMAND_PARSED`。

状态栏初始渲染后，应优先订阅真实变量更新事件；定时轮询只作为事件不可用时的回退。

## 世界书：三套能力不要混用

### EJS / ST-Prompt-Template 运行时

这一路处理模板与提示词运行，例如：

- `getwi()`；
- `activewi()`；
- `getWorldInfoData()`；
- `getWorldInfoActivatedData()`；
- 条件预处理、缓存和递归导入。

它负责“本轮模板如何读取/激活内容”，不等于修改世界书文件或绑定关系。

### Tavern Helper 世界书管理

优先使用高层接口：

- `getWorldbookNames`、`getWorldbook`、`createWorldbook`；
- `replaceWorldbook`、`updateWorldbookWith`、`createWorldbookEntries`；
- `getCharWorldbookNames`、`rebindCharWorldbooks`；
- `getChatWorldbookName`、`rebindChatWorldbook`、`getOrCreateChatWorldbook`；
- `getGlobalWorldbookNames`、`rebindGlobalWorldbooks`。

旧的 `getLorebook*` / `setCurrentCharLorebooks` 等兼容接口已经标为 deprecated，除非目标现场只有旧接口，否则不要优先生成。

### SillyTavern 本体世界信息

`window.SillyTavern.getContext()` 还提供：

- `loadWorldInfo`；
- `saveWorldInfo`；
- `getWorldInfoPrompt`；
- `getWorldInfoNames`；
- `updateWorldInfoList`；
- `WORLDINFO_SCAN_DONE` 等事件。

这一路负责本体扫描、提示词构造和现场重载。三套能力可以协同，但不能互相冒充。

## 世界书绑定的正确闭环

若项目要求导入后自动挂载：

```text
确认世界书存在
→ 读取当前角色/聊天绑定
→ 执行 rebind/create
→ 重新读取绑定结果
→ 确认主书、附加书和聊天书没有冲突
→ 失败时给出手动导入/绑定回退
```

卡片携带 CharacterBook 不等于 SillyTavern 已把独立世界书挂进角色当前主书。两者必须分别验收。

## 正则与真实重放

宿主可查询、替换、启用和局部管理 Tavern Regex。设计时仍要区分：

- 角色卡局部正则；
- 全局正则；
- 预设/作用域正则；
- prompt-only 与 display-only；
- `runOnEdit`、深度、流式半块和旧楼行为。

酒馆助手提供 `formatAsTavernRegexedString()` 时，可在真实宿主重放：

```text
原始消息
→ 当前实际正则链
→ display/prompt 目标
→ 当前楼、旧楼、编辑、Swipe、流式半截
→ 检查标记、HTML、技术块是否符合预期
```

没有该能力时，退回静态正则测试与手工 SillyTavern 验证。自动开启角色卡局部正则可以作为项目能力，但不应悄悄替换用户全局配置。

## 事件与生命周期

优先使用酒馆助手事件封装：

- `eventOn`、`eventOnce`、`eventMakeFirst`、`eventMakeLast`；
- `eventEmit`、`eventRemoveListener`、`eventClear*`；
- `reloadIframe`；
- 必要时使用本体 `eventSource` 与 `eventTypes`。

重要事件包括：消息接收、消息更新、Swipe、聊天切换、生成开始、流式增量/完整文本、生成结束、世界书扫描、前端加载和卸载。

每个监听记录：

- 注册位置和实例 ID；
- 是否一次性；
- 停止/清理函数；
- `pagehide`、重载、编辑、Swipe 时如何解绑；
- 重复挂载时如何幂等。

酒馆助手 iframe 预置会在 `pagehide` 时清理它登记的事件，但定时器、MutationObserver、父页面 DOM、音频和自建 Promise 仍需要脚本自己清理。

## 生成、注入与独立游玩

`generate`、`generateRaw`、`generateQuietPrompt`、停止生成、提示词注入和 Slash 命令可以把前端变成主动游玩表面，适合超重型/0 层或明确需要主动生成的项目。

启用前记录：

- 生成类型；
- 上下文来源；
- 是否绕开输入框；
- 错误回退；
- 并发/重复点击锁；
- 消息写入位置；
- 停止方式；
- `injectPrompts` / `uninjectPrompts` 的 key、顺序和清理时机。

它们不是普通状态栏默认必需能力。

## 父页面、输入框和弹窗

个人自用项目可以使用：

- 父页面 DOM；
- `send_textarea` 输入框；
- `triggerSlash('/setinput ...')`；
- 直接赋值后派发 `input` / `change` 事件；
- `callGenericPopup` / `Popup`；
- `isMobile` / `shouldSendOnEnter`；
- `messageFormatting`、`updateMessageBlock`。

推荐输入闭环：

```text
按钮动作
→ 生成文本
→ 尝试 Tavern Helper Slash
→ 失败则修改输入框并派发事件
→ 再失败则复制文本
→ 把实际路线反馈给玩家
```

父页面访问不是禁止项；真正需要避免的是无探测、无回退、无清理和把旧 DOM 引用跨消息长期保存。

## 前端部署面

参考工程把项目分为：

- 消息内 iframe 前端：隔离样式，随消息生命周期销毁；
- 卡内 Tavern Helper 后台脚本：事件、变量、世界书、按钮和宿主动作；
- 无沙盒父页面补充组件：按项目需要使用并在卸载时移除；
- 插件级网页组件：需要 manifest、构建入口、全局安装和网页刷新生命周期；
- 流式楼层表面：需要单独验证增量文本、最终文本、编辑、Swipe 和清理时机。

Vue、Pinia、Zod、Tailwind、Vite、TypeScript 是可选工程能力，不是硬性技术栈。

## 音频与沉浸增强

酒馆助手提供 BGM / ambient 播放、暂停、列表和设置接口。它们可作为中型、重型或超重型前端的可选体验增强，但不应成为普通卡的强制依赖。没有音频能力时回退为纯视觉体验。

## 远程依赖

任何远程 import 都记录：

```yaml
id: mvu_loader
url: https://...
version: pinned-or-declared
load_order: 10
fallback: 内嵌源码或禁用相关能力
evidence: not_run | source_checked | runtime_pass
```

个人项目可以选择远程依赖；Agent 不会因为它“不够产品化”而阻止，但没有真实证据时不能把运行状态说成已通过。
