# 宿主能力矩阵

本文把酒馆助手类型声明、MVU/EJS 行为摘要和前端模板经验压缩成“能力—证据—回退”合同。它不是插件源码副本，也不要求所有项目启用所有能力。

## 消息与楼层

可用能力通常包括 `getChatMessages`、`setChatMessages`、`createChatMessages`、`deleteChatMessages`、`rotateChatMessages`、`retrieveDisplayedMessage` 和 `refreshOneMessage`。

设计时要明确：

- 消息 ID 是实际楼层号，负数是从末尾取深度；深度不等于 ID；
- `include_swipes` 是否包含未被 AI 使用的消息页；
- 创建/修改消息的 `data`、`extra` 是聊天附加元数据，不等于 MVU 状态；
- 编辑、Swipe、重载、切换聊天会让前端实例重新创建；
- 修改角色卡或整套正则是重操作，不能当作普通 UI 刷新。

## 变量与 MVU

酒馆助手变量能力至少区分 global、character、chat、message、script、extension；MVU 还要区分 message scope 和当前楼层读回。写入应有：

```text
读取当前值
→ 应用变更
→ 等待宿主完成
→ 重新读取
→ 把成功/失败反馈给玩家
```

EJS 的 `global/local/message/cache/initial` 是另一套模板处理作用域，不能直接和 Tavern Helper 的变量 scope 混名。需要立即读取刚写入的数据时，明确关闭 cache 或重新准备上下文。

## 世界书运行与绑定

运行时世界书能力包含：

- `getwi`：按名称读取指定世界书条目，形成 EJS 递归导入；
- `activewi`：主动激活指定条目；
- 预处理世界书激活与条件 `@@if`；
- 角色卡、聊天、全局和用户角色世界书的查询/绑定；
- 创建或绑定聊天世界书；
- 世界书条目读取、替换、创建、删除和自定义排序。

卡片默认只携带 CharacterBook 和绑定声明。若项目要求零手工导入，可增加 `host.worldbook_binding` 能力，由卡内脚本调用已验证的 rebind/create API；必须检查“书存在、角色主书指向它、聊天书是否冲突”，失败时提供手动 Import Card Lore 回退。

## 正则与脚本控制

宿主可查询、替换、启用和局部管理 Tavern Regex，也可查询脚本树、脚本按钮和脚本信息。能力启用后仍要区分：

- 角色卡局部正则；
- 全局正则；
- 预设/作用域正则；
- prompt-only 与 display-only；
- `runOnEdit`、深度、流式半块和旧楼行为。

自动开启角色卡局部正则可以作为项目能力，但不应悄悄替换用户全局配置。

## 事件与生命周期

优先使用宿主事件封装：`eventOn`、`eventOnce`、`eventMakeFirst`、`eventMakeLast`、`eventEmit`、`eventRemoveListener` 和 `eventClear*`。重要事件包括消息接收、消息更新、Swipe、聊天切换、生成开始、流式增量/完整文本、生成结束、前端加载和卸载。

每个监听记录：

- 注册位置和实例 ID；
- 是否一次性；
- `stop`/清理函数；
- `pagehide`、重载、编辑、Swipe 时如何解绑；
- 重复挂载时如何幂等。

## 生成、注入与独立游玩

`generate`/`generateRaw`、停止生成、prompt injection 和 quiet generation 可以把前端变成主动游玩表面，尤其适合超重型/0 层或需要流式 UI 的项目。这不是普通状态栏的默认能力。

启用前记录：生成类型、上下文来源、是否绕开输入框、错误回退、并发/重复点击锁、消息写入位置和停止方式。没有该能力时回退到酒馆原生输入框。

提示词层还可能提供 `injectPrompt`/`uninjectPrompts`、预设提示词顺序控制和 `triggerSlash`。它们适合把项目级短合同、临时事件或调试信息注入生成链，但不应代替世界书本体；记录 key、order、sticky 生命周期、清理时机和当前预设，避免把一次性提示永久留在所有角色卡中。

## 前端部署面

参考工程把项目分为：

- 消息内 iframe 前端：隔离样式，随消息生命周期销毁；
- 无沙盒后台脚本：可通过 jQuery/父页面 DOM 增强酒馆界面；
- 插件级网页组件：拥有 manifest、全局安装和刷新生命周期；
- 流式楼层表面：绕过“文本完成后才渲染”的限制，使用消息替换或独立生成循环。

Vue、Pinia、Zod、Tailwind、Vite、TypeScript 是可选工程能力，不是硬性栈。若使用它们，项目账本记录构建命令、依赖、输出、宿主容器、样式隔离和卸载策略。

iframe 适配至少检查：不依赖 `vh` 撑高、不强制横向滚动、主体保持文档流、窄屏和触控可用；父页面补充组件则要把样式 teleport 到正确文档，并在卸载时移除。

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
