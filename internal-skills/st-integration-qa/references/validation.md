# 最终文件检验

只检查用户工作目录中的实际成品。目标是阻止无法导入、无法运行、数据丢失、安全边界错误或确定断链；不检查项目管理状态。

## 证据状态

- `pass`：实际执行并通过；
- `fail`：实际执行并失败；
- `warning`：可继续但有代价；
- `not_run`：未执行；
- `blocked`：缺环境或依赖。

离线解析通过不等于宿主运行通过。即时同楼读回只证明 `write_accepted`；只有等待目标保存完成，且项目要求时重载后仍能读回，才可报告 `persisted`。

## 通用阻断项

- JSON/YAML/JS/EJS/HTML/正则语法错误；
- 角色卡、世界书、正则或 ScriptTree 必需字段损坏；
- 未经授权丢失旧卡未知扩展；
- 世界书为空、绑定名不一致；
- 声称启用的 MVU/EJS/UI 没有真实实现；
- marker 没有生产者或消费者；
- 动态 JavaScript 前端只有裸 HTML，没有可执行宿主载体；
- 把 Tavern Helper/STPT 接口写成 Core `getContext()` 字段；
- UI 写入非法 `message_id:'current'`、关键写入使用 `'latest'`、写后不读回或把即时读回冒充耐久保存；
- 动态自定义开场声称成功但没有真实 user→AI 消息链；
- STPT 项目默认执行模型可控 EJS却未声明安全边界；
- 交付文件残留绝对路径、`src/...`、`source_refs` 等维护引用；
- 方案必须修改 SillyTavern/插件本体才能运行。

## 创作一致性（仅检查实际启用内容）

交付前沿真实使用链检查一次：

```text
世界事实与规则
→ 角色能力、知识、义务与行为
→ 系统触发、裁决、代价与恢复
→ 场景空间、权限、资源、人物日程与事件
→ 默认/备用开场及前三轮承接
→ Greeting/MVU/EJS 初态与更新语义
→ 正文通知、状态栏和玩家可见反馈
```

检查原则：

- 不按 YAML 字段数、角色数、世界书条目数或篇幅判断质量，只检查项目承诺的承重内容；
- 世界规则的能力、禁区、代价和上限能约束实际角色与场景，没有角色或道具无依据越级；
- 世界历史、制度、资源与当前危机形成因果，势力和 NPC 在无人介入时有下一步；
- 承重角色的价值、恐惧、底线、内在冲突、行为、关系态度和语言互相证明；至少覆盖项目相关的合作/索取、冲突/拒绝、压力/失败、价值两难；
- 角色只使用其身份、调查和事件允许知道的信息，误解、秘密和模型专用事实不混写；
- 系统的正常、部分成功、失败/拒绝、信息不足、重复、恢复与冲突优先级可裁决；数值轴的范围、阈值、过渡、公式、合并顺序和可观察后果一致；
- 场景归属、危险、拓扑、入口、权限、人物目标、线索、时间窗口、资源和破坏后果符合上游世界与系统；
- 默认与备用开场的地点、人物行动、未决压力和初态一致；备用开场有实质差异但不改变角色核心人格；
- MVU/EJS/状态栏只实现已经确定的玩法语义，不因 UI 想展示而反向虚构数值；初值、标签、阈值和正文含义一致；
- 确定性事实矛盾直接修复；如果修复会改变用户已确认的核心体验、人物或世界方向，返回对应阶段用“问题＋建议＋为什么＋影响”校准后再继续。

创作一致性检查只修改真实内容或代码，并在最终对话中简要报告；不得生成创作审计文件、检查清单、问题账本或 QA 日志。

## 角色卡与世界书

分别确认：

```text
data.character_book 是否携带嵌入书
独立世界书文件是否已导入
角色 data.extensions.world 是否绑定主书
additional books
chat worldbook
```

文件存在、导入列表存在和当前绑定是不同证据。

世界书检查条目启用、constant/关键词、position、depth、order、概率、递归和 EJS 特殊路由。普通 `getwi` 与特殊 `[GENERATE]/@@generate` 分开检查；后者考虑 `invert_enabled`。

canonical `<user>` 检查：

- 使用 `getWorldbook/updateWorldbookWith/createWorldbookEntries` 等当前 API；
- `entry.name === '<user>'` 精确比较；
- 0 个创建、1 个更新、多于 1 个阻断并报告；
- 按 UID + exact name 读回；
- 不用 deprecated `getLorebookEntries` 的包含型字符串 filter 证明唯一性。

## MVU

- `[initvar]` 正文直接是状态内部结构；
- 启用世界书中的 `[initvar]` 条目即使自身禁用也会被扫描；
- 开场 `<initvar>` 与更新命令语义分开；
- 初值、Schema、更新规则、输出格式和 UI 路径一致；
- 卡内只有一个可导入 MagVarUpdate Script/Loader；
- 自定义更新外层标签内含当前 MVU 可解析方言；
- `waitGlobalInitialized` 有外部超时/错误态；
- 当前楼使用数值 ID；关键写入不猜 `'latest'`；
- `ChatMessage.data` 若作为快照，包含完整 MvuData；
- `replaceMvuData` 后区分内存读回与 `saveChat`/重载持久化证据；
- `VARIABLE_INITIALIZED/VARIABLE_UPDATE_ENDED` 没有被当作消息存储已写入；
- `VARIABLE_UPDATE_STARTED` 回调只按真实单参数 payload；
- 完整/流式更新块和占位符按 prompt/display 分开处理。

## EJS

- 真实世界书条目或导入位置存在；
- `getwi` 使用 `await`，关键调用显式书名；
- 公共 `prepareContext` 使用 `(context, end)`；
- runtime 使用 `evalTemplate` 正确大小写，不被滞后 `.d.ts` 的 `evaltemplate` 误导；
- 缓存区分编译缓存和变量缓存；
- MVU bridge 有真实脚本或模板内 API；
- 模板执行阶段、变量 scope、写入权和副作用明确；
- 检查 `raw_message_evaluation_enabled`、`sandbox`、`autosave_enabled` 的现场值；
- 不需要消息 EJS 时关闭 raw-message evaluation；需要保存变量时显式 autosave 或 `saveVariables(true)`；
- 特殊条目的 enable 语义按现场 `invert_enabled` 验证；
- `@@iframe` 只在消息渲染 `msgId` 路径使用，且按无 sandbox 同源高权限页面验收。

## Tavern Regex

原始角色卡字段逐项检查类型：

```text
id: 非空字符串
scriptName/findRegex/replaceString: 字符串
trimStrings/placement: 数组
disabled/markdownOnly/promptOnly/runOnEdit: boolean
substituteRegex: number
minDepth/maxDepth: number|null
```

再检查：

- `findRegex` 可编译；
- 当前顺序与前后依赖；
- scoped/preset allowlist；
- display/prompt/edit/Swipe depth；
- `runOnEdit` 不把 UI 源码永久写回原消息；
- TH 高层 snake_case 没有与角色卡 camelCase 混用。

## 开场/创角前端

- 正式玩家字段默认空白，快速预设默认不选且可编辑；
- 草稿按稳定聊天身份隔离并有 revision；
- 固定路线映射到真实 0 楼 `swipe_id`；动态初态写入最终目标 Swipe；
- 切 Swipe 可能销毁页面，后半段由协调器或新实例恢复；
- 提交前/发送前重校验 chat、draft、0楼 revision/Swipe、输入框和页面实例；
- 稳定档案与动态初态分别写入、保存和读回；
- 输入框已有文本时不覆盖；发送失败保留 canonical message；
- `generate/generateRaw` 或只插入 user 楼没有被冒充正常发送；
- 固定 Greeting 成功门覆盖目标 Swipe/初态；动态自定义开局成功门覆盖真实 user 楼、真实 AI 楼和变量初始化；
- 重复点击、切聊天、切 Swipe、卸载、保存失败都有证据；
- 成功后不继续承担持续消息状态栏职责。

## 持续消息前端

- 纯 SillyTavern 动态脚本路线判定失败；静态捕获值直接进入 HTML 时，有与 producer 一致的字符/长度限制或明确允许的净化 markup 边界，不虚构通用 escape；
- 非 MVU 结构化页面能找到实际 producer、协议版本、字段 Schema、缺失/重复/未知/多块策略、parser 和 fixture；HTML 中出现 marker 不算 producer；
- TH 路线复杂载荷优先通过消息 API读取原文；捕获组注入必须有可逆编码和 textarea/fence/script/外层闭合 fixture；
- TH 路线的 `replaceString` 是完整 fenced HTML；
- STPT 路线有真实 `@@iframe`，且只在 render `msgId` 路径触发；
- TH 使用 `getCurrentMessageId`；STPT 从 EJS context 获得 message/swipe ID；
- STPT 通过 parent namespace 注册的事件主动 stop，不假定 TH 自动清理；
- iframe 实际建立后才算运行通过；
- producer、正则、parser 和 fixture 对 outer tag、技术 marker、协议版本和字段名完全一致；错误版本、malformed、缺字段、非法列表项和多个载荷有确定行为；
- 所有模型文本通过 `textContent`/DOM API 或真实 escape 渲染，不把载荷当 HTML、样式或事件执行；
- 正式运行不回退 mock；
- MVU UI 不在 `VARIABLE_UPDATE_ENDED` 中立即重读消息存储；
- 当前数值楼层、当前 Swipe、编辑、重载、切聊和 `pagehide` 生命周期明确；
- 按实际组件检查键盘、可见焦点、ARIA/live、触控、空态、长文本、长列表、reduced-motion、对比度、分页/debounce 和错误恢复；
- 动作明确区分写入输入框、发送消息、write_accepted 与 persisted；slash 文本中的管线符、反斜线和换行不会形成额外命令；
- 不重新初始化玩家档案，也不另造一套状态树。

## 前端交接

两种前端同时存在时，核对开场写入的 canonical `<user>` 和目标 Swipe 动态初态能被持续消息前端从同一权威来源读取；同一字段只有一个写入权威，重复挂载不会再次执行首次初始化。

## Tavern Helper Script

运行交付必须是可导入 Script/ScriptFolder JSON。检查：

```text
type / id / name / enabled / content / info
button.enabled / button.buttons
data
export_with.data / export_with.button
```

Folder 使用 `scripts` 数组。`.js` 可伴随交付为源码，但不能冒充导入文件。导入器会重置 ID 和默认禁用，运行验收按导入后的实际对象。

## 远程依赖

检查 URL、锁定 tag/commit、传递依赖、加载顺序、网络失败表现。`registerMvuSchema` 复用宿主 `window.z`，不要再引第三套 Zod。未锁依赖是 warning；未联网验证是 `not_run`，不能报 pass。
