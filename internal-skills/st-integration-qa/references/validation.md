# 最终文件检验

只检查用户工作目录中的实际成品。目标是阻止无法导入、无法运行、数据丢失或确定断链；不检查项目管理状态。

## 证据状态

- `pass`：实际执行并通过；
- `fail`：实际执行并失败；
- `warning`：可继续但有代价；
- `not_run`：未执行；
- `blocked`：缺环境或依赖。

离线解析通过不等于宿主运行通过。

## 通用阻断项

- JSON/YAML/JS/EJS/HTML/正则语法错误；
- 角色卡、世界书、正则或 ScriptTree 必需字段损坏；
- 未经授权丢失旧卡未知扩展；
- 世界书为空、绑定名不一致；
- 声称启用的 MVU/EJS/UI 没有真实实现；
- marker 没有生产者或消费者；
- 动态 JavaScript 前端只有裸 HTML，没有可执行宿主载体；
- UI 写入错误楼层、使用非法 `message_id:'current'` 或写后不读回；
- 交付文件残留绝对路径、`src/...`、`source_refs` 等维护引用；
- 方案必须修改 SillyTavern/插件本体才能运行。

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

世界书检查条目启用、constant/关键词、position、depth、order、概率、递归和 EJS 特殊路由。普通 `getwi` 目标与特殊 `[GENERATE]/@@generate` 条目分开检查；后者考虑 `invert_enabled`。

## MVU

- `[initvar]` 正文直接是状态内部结构，不能再包 `stat_data:`；
- 开场 `<initvar>` 与更新命令语义分开；
- 初值、Schema、更新规则、输出格式和 UI 路径一致；
- 卡内只有一个可导入 MagVarUpdate Script/Loader；
- 自定义更新外层标签内含当前 MVU 可解析方言；
- `waitGlobalInitialized` 有超时/错误态；
- 当前楼使用数值 ID；关键写入不猜 `'latest'`；
- `ChatMessage.data` 若作为快照，包含完整 MvuData 并能由 MVU读回；
- 完整/流式更新块和占位符按 prompt/display 分开处理。

## EJS

- 真实世界书条目或导入位置存在；
- `getwi` 使用 `await`，关键调用显式书名；
- 公共 `prepareContext` 使用 `context, end` 参数顺序；
- 缓存区分编译缓存和变量缓存；
- 错误回退由项目实现，不虚构宿主中文空态；
- MVU bridge 有真实 Tavern Helper Script 或模板内真实 API，不只是一条声明；
- 模板执行阶段、变量 scope、写入权和副作用明确；
- 特殊条目的 enable 语义按现场 `invert_enabled` 验证。

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
- Tavern Helper 高层 snake_case 对象没有与原始 camelCase 混用。

## 开场/创角前端

- 正式玩家字段默认空白，快速预设默认不选且可编辑；
- 路线选择映射到真实 greeting/开场和一致初态；
- 稳定档案与动态初态分别写入各自权威源并读回；
- 空输入、非默认值、重复点击、写入失败和成功交接都有证据；
- 失败时保留输入，不把页面本地对象或聊天正文冒充写入成功；
- 成功进入开场后不继续承担持续消息状态栏职责。

## 持续消息前端

- 纯 SillyTavern 动态脚本路线判定为失败；本体仅承诺静态净化 HTML；
- Tavern Helper 路线的 `replaceString` 是完整 fenced HTML 代码块；
- ST-Prompt-Template 路线有真实 `@@iframe` 条目；
- iframe 实际建立后才算运行通过；
- 捕获载荷有防 fence/textarea/script 终止的编码或改用消息 API；
- 正式运行不回退 mock；
- 当前数值楼层、编辑、Swipe、重载、切聊和 `pagehide` 生命周期明确；
- 不重新初始化玩家档案，也不另造一套状态树。

## 前端交接

两种前端同时存在时，核对开场前端写入的稳定档案和动态初态能被持续消息前端从同一权威来源读取；同一字段只有一个写入权威，重复挂载不会再次执行首次初始化。

## Tavern Helper Script

运行交付必须是可导入 Script/ScriptFolder JSON。检查：

```text
type
id
name
enabled
content
info
button.enabled/button.buttons
data
export_with.data/export_with.button
```

Folder 使用 `scripts` 数组。`.js` 可以伴随交付为源码，但不能冒充导入文件。导入器会重置 ID和默认禁用，运行验收按导入后的实际对象。

## 远程依赖

检查 URL、锁定 tag/commit、传递依赖、加载顺序、网络失败表现。未锁依赖是 warning；未联网验证是 `not_run`，不能报 pass。
