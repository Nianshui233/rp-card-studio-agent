---
name: st-tavern-helper-engineering
description: "Private module for Tavern Helper source projects: message/front-end iframe, script iframe, Vue/Pinia mounting, lifecycle cleanup, streaming message surfaces, build/import boundaries, and helper API usage."
---
# Tavern Helper 工程实现

这是 Tavern Helper 的工程层支援模块，不替代 MVU、EJS、世界书或正则语义合同。需要制作、审查或修复 Tavern Helper 前端/脚本源项目时启用。

## 用户可见的能力选择合同

是否需要酒馆助手前端/交互也是可以明确选择的能力，不得因为实现复杂而默默退回纯静态 HTML。先用功能语言询问：

```text
是否需要玩家点击界面查看详情、选择行动、修改允许的状态或使用商城/任务/地图等功能（Tavern Helper 交互）？
```

用户选择“需要”后，必须明确 producer、宿主表面、写入权限、保存/读回和失败回退；若只能提供静态显示，必须报告具体缺失能力，不能把静态页面冒充为可交互前端。交互权限不等于玩家身份授权：Tavern Helper 不得因此创建默认主控、覆盖 `<user>` 模板或固定 NPC 对外部主控的关系。

## 先确定运行表面

Tavern Helper 至少有三种不同表面，不能混写：

```text
消息前端：消息楼层中的无沙盒 iframe
后台脚本：脚本 iframe，jQuery 默认作用于父页面
流式楼层前端：脚本接管消息楼层，在 token 到达时自行挂载/更新
```

- 消息前端只在真实消息楼层中运行，读取当前数值楼层必须使用 `getCurrentMessageId()`；
- 后台脚本不能调用 `getCurrentMessageId()`，应使用脚本接口或明确的消息 ID；
- `@@iframe` 是 ST-Prompt-Template 的另一条 provider 路线，不能冒充 Tavern Helper iframe；
- 纯 SillyTavern 静态 HTML 不提供 Tavern Helper 的脚本生命周期。

## 前端源项目边界

如果项目由 `index.html + index.ts` 构成：

- `index.html` 只写静态 body 内容或 `#app` 挂载点；
- 不在 HTML 内手写本地 `<script>` 或 `<link>`；
- 不使用空的 `src=""` 图片占位；
- Vue 组件、样式和脚本由 TypeScript/webpack 导入；
- 页面宽度必须适应消息 iframe，避免无依据的 `vh`、脱离文档流的主体绝对定位和整页横向溢出；
- 长文本、空数据、损坏数据、宿主不可用都要有可读状态。

最终交付的单文件 HTML 可以内联完整 CSS/JS，但不能把“可导入 HTML”反推成“源工程不需要构建和生命周期”。

## 后台脚本挂载

脚本需要挂载 Vue 或 DOM 时先判断是否需要酒馆页面样式：

- 需要融入父页面：`createScriptIdDiv()`，样式用 `teleportStyle()` 注入父页面，并在 `pagehide` 调用 `destroy()`；禁止把 Tailwind 类直接当成父页面全局样式；
- 需要隔离：`createScriptIdIframe()`，等待 iframe `load` 后在其 document 内挂载，并把样式传到该 iframe 的 head；
- Vue 实例、DOM 节点、MutationObserver、定时器、AbortController、外部事件和音频都必须在 `pagehide` 清理；
- 加载时使用 `$(() => {})` 或等价的 Tavern Helper 加载时机，不使用 `DOMContentLoaded` 作为远程注入脚本的唯一入口。

脚本按钮和设置使用 Tavern Helper 高层接口：

```ts
appendInexistentScriptButtons([{ name: '按钮名', visible: true }]);
eventOn(getButtonEvent('按钮名'), handler);
getVariables({ type: 'script', script_id: getScriptId() });
```

设置用 Zod 解析并提供默认值；写回前去掉 Vue proxy（例如 `klona`），成功/失败反馈不能混同为“已经发送”或“已经持久化”。

## MVU 前端

MVU 状态栏必须声明：

```text
provider → 数值 message_id → Swipe → MvuData/stat_data → 保存后刷新 → pagehide 清理
```

- 读取当前状态优先使用 `defineMvuDataStore` 或等价的 Pinia/响应式适配器；
- 不在 `VARIABLE_UPDATE_ENDED` 中立即读取变量冒充持久化完成；
- assistant 更新可等待消息重渲染，脚本/按钮写入必须明确保存并同楼读回；
- `latest` 只作明确允许的只读容错，关键写入使用数值楼层；
- 状态栏只能读 canonical 状态，不能创建影子状态树。

## 流式楼层

“隐藏未闭合标签”不是流式前端。需要真实流式 UI 时使用 `util/streaming.ts` 的 `mountStreamingMessages` 路线或等价实现，并验证：

- 增量 token、完整消息、编辑、删除、Swipe、切聊；
- 当前楼层 host 的创建、替换和销毁；
- MutationObserver、事件句柄和父页样式清理；
- 流式失败时恢复原始 `.mes_text`；
- `prefers-reduced-motion`、窄屏和长文本。

## 完成门槛

静态检查必须能说明源工程、导入 JSON、HTML、脚本和 Regex 的对应关系；真实宿主未验证时记录 `runtime: not_run`。仅有一个 HTML/Regex 文件而没有 producer、provider、message_id、生命周期和失败回退，不算完整 Tavern Helper 前端交付。
