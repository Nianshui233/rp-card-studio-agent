# MVU / EJS 阶段（可选）

涉及真实宿主接口、消息楼层、iframe 生命周期或 MVU 全局对象时，同时读取
[MVU 运行时参考](host/mvu-runtime.md) 与
[酒馆助手运行时参考](host/tavern-helper-runtime.md)；涉及 EJS 执行阶段、变量作用域、装饰器或模板诊断时，再读取
[EJS 运行时参考](host/ejs-runtime.md)。它们是本地行为摘要，不是外部依赖或源码副本。

本阶段把已经锁定的 RP 状态需求接到目标 SillyTavern 环境。只向用户询问可感知的游玩效果；由技能自行选择 Schema、更新方言、正则 placement、事件与 API，并报告选择理由。

## 先判断是否真的需要

可选路线是：无变量、MVU 原生 Schema、MVU_ZOD、原生 + Zod 混合、沿用已有实现；EJS 与 MVU 分开决定。不要因为卡里有状态栏就机械启用 MVU，也不要把 MVU_ZOD 当成 MVU 的默认必备层。

用户只需决定额外模型调用、跨楼层/Swipe 状态体验、按钮效果、速度/稳定/调用成本等体验目标。技术细节由技能根据本机版本和真实源码决定。

## 框架与项目 Schema 是两件事

MVU 框架加载器负责初始化、读取 `[initvar]`、监听消息、更新变量并提供 `window.Mvu`。变量结构脚本只负责项目的字段与约束。卡内自带 MVU 时，加载器必须作为真实 Tavern Helper 脚本进入依赖闭环；若依赖宿主预装，则明确记录而不伪装成自包含。

加载器的实际内容由项目自己维护或明确声明宿主预装。Agent 不要求用户额外寻找外部资料；用户已经提供或授权的远程 bundle、仓库和教程可以直接用于实现。若项目选择远程 bundle，记录准确 URL、版本、加载顺序和回退方式，并在真实宿主中验证。

## 原生 Schema 与 MVU_ZOD

MVU 原生路线从 `[initvar]` 的 `$meta` 生成内部 Schema，支持可扩展、递归可扩展、模板、严格模板、数组拼接和严格赋值等能力。MVU_ZOD 是可选的项目结构注册层。混合路线只有在两层各自有明确职责时使用。

`[initvar]` 可以来自关闭的世界书条目；同一世界书的多个初始化条目会合并，数组按整体替换。所有新建 MVU 路线都需要真实初始值，并最终装入名称含 `[initvar]` 的 CharacterBook 条目。维护源可以是文件、内联内容、登记源或既有导入；文件形式便于维护，但不是运行时唯一合法形式。MVU_ZOD 只注册结构，不能代替初始值。

开场消息中的 `<initvar>` 是角色主世界书初始值的覆盖层，因此每条备选开场/Swipe 可以拥有不同初态；它不是脱离世界书的独立启动器。目标世界书尚未导入并挂载时，MVU 可能在读取开场覆盖层之前就因没有可初始化的世界书而返回。YAML、JSON、代码块、宏等支持范围必须按目标 bundle 实测。

## 更新路线

更新可以随正文同轮发生，也可以由额外模型解析；额外模型还可能使用普通聊天、Tool Calling、JSON Schema、JSON Object 等响应方式。操作方言可以是 lodash 命令、MVU JSON Patch 或既有实现。技能根据目标 API、可靠性、成本和现成卡结构选路，不把这些问题抛给用户。

额外模型模式下，条目名中的 `[mvu_plot]` 与 `[mvu_update]` 用于剧情模型/更新模型分流；没有标记或同时有两种标记时会进入两边。只有目标 MVU 版本实证支持时才依赖此行为。

`[config_override]` 是可选的角色级配置覆盖条目，可控制更新方式、自动额外请求、世界书过滤和部分兼容行为。它不是每张卡都必须注入的固定组件。

### 制作期清理不等于运行时年龄门禁

若旧材料含有涉及未成年人的成人性内容，迁移时删除相关内容，不把它转成状态字段、更新规则或提示词合同。尤其不要新增 `age_gate`、`adult_only`、成年证明、年龄确认、`adult_intimacy_without_adult_gate`、年龄关系禁路、EJS 拒绝分支或 Tavern Helper 拦截。Runtime 只承载项目实际需要的变量与功能；交付后的玩法不由 MVU/EJS 继续监管。

## EJS

EJS 是 ST-Prompt-Template 或既有宿主执行的真实 `.ejs` 模板，不是存储层。每份模板记录：真实文件、执行宿主、读取变量、输出对象、失败回退。使用 Tavern Helper 的 `EjsTemplate.getSyntaxErrorInfo / prepareContext / evalTemplate / getFeatures` 可做目标环境诊断；离线构建不能冒充宿主执行成功。

## 开场创角与 MVU 初值不是一回事

`[initvar]` 只提供默认状态；开场表单收集到的姓名、身份、地点、关系、资源等是一次“创角提交”，必须通过 `opening.yaml#/creation_bridge` 映射到真实状态路径。对每个绑定记录：输入字段、目标路径、类型/转换、缺省值、提交路线和回读结果。

不要把以下行为当成状态写入：

- 只在页面 JavaScript 中修改一个本地 `state` 对象；
- 只把 `data` 放进 `createChatMessages`；
- 只把创角结果写进一段普通叙事文本；
- 只更新 `<user>` 世界书条目，却没有同步 MVU 当前状态。

这些都可以是创角资料的一部分，但除非读回实际运行时状态成功，否则不能声称状态已经改变。推荐由实测可用的 MVU/Tavern Helper API 直接写入并读回；没有直写 API 时，再使用会真正经过 MVU 更新管线的消息更新块。非 MVU 项目则生成明确的 `<user>`/XML/文本设定块，并让正则或世界书消费它，不要凭空制造 MVU 路径。

创角桥失败时必须显示失败、保留表单并提供手动回退；不能继续自动生成一轮，让模型在默认变量上开始剧情。

## UI 数据交接

新 MVU UI 优先等待 `Mvu` 初始化，再按当前楼层读取：

```js
await waitGlobalInitialized('Mvu');
const state = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });
const stat = state.stat_data;
```

`display_data` 与 `delta_data` 仍可能存在，但当前源码已标记为 deprecated，不能作为所有新卡唯一数据源。刷新时结合真实 MVU 事件、编辑、Swipe、重载和聊天切换验证。

## 正则不是固定套装

MVU 自身会在部分模式下清理历史 `<UpdateVariable>` 与 `<StatusPlaceHolderImpl/>`。卡内可能采用一条规则同时处理 display/prompt、分开的规则、显示正则 + MVU 内部清理，或自定义协议。根据实际原始块和目标链路设计，不生成固定“十三件套”。

在 `mvu.update_strategy.display_cleanup` 中记录玩家显示层由谁清理技术更新块：新建项目默认使用 `card_regex`；成熟实现也可以选择 `framework`、`host_regex` 或 `existing`，但后三者必须附带已经核实的证据。选择 `card_regex` 时，Forge 会用本卡真实标签重放完整块和流式未闭合块；任一测试仍残留技术正文都属于阻断问题。测试卡可以简化内容和美术，不能省略这条被测运行链。

## 完成门槛

- 框架加载器、`[initvar]` CharacterBook 条目、变量结构、初始化、更新、模型上下文和 UI 读取形成真实闭环；
- `data.character_book.entries` 非空，`data.extensions.world` 与书名一致，并在真实 SillyTavern 中确认该书已导入世界书库且成为角色主世界书；
- 原生 Schema、MVU_ZOD、混合或既有路线有明确理由；
- EJS 有真实宿主与失败回退；
- Tavern Helper 保留 Script/ScriptFolder 真实结构；
- 不在实际实现之外追加第二套合成校验层；没有虚构 API、重复 writer 或无人读取的变量；
- 静态、制品与真实宿主证据分开记录。

## EJS 按名调用与脚本依赖

每份 EJS 模板记录 `phase`、`reads`、`invokes_entries`、`output_target` 和 `cache`。凡是通过 `getwi()` 或 API 按名调用的世界书条目，都在清单中登记并检查名称真实存在。只供按名调用的资料使用 `manual` / `ejs_only`：条目默认关闭、无关键词，不参与普通扫描。

Tavern Helper 维护源可以记录 `role`、`phase`、`required`、`depends_on`、`provides`、`expected_global`，用来表达 Loader → Schema → 状态同步 → 0层生命周期的先后关系。它是开发和校验元信息，不要求宿主扩展认识这些字段。
