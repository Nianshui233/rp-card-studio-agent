# EJS 制作规则

EJS 在本项目中专指 ST-Prompt-Template 模板。它负责动态文本与模板执行，不负责 MVU 状态。

## 路线选择

- `none`：静态 Prompt/世界书已足够，不启用 EJS；
- `prompt_template`：生成前按上下文拼接 Prompt；
- `worldbook_template`：条件化世界书条目或按名 `getwi`；
- `render_template`：消息渲染或 `@@iframe`；
- `existing`：沿用旧项目已经验证的 STPT 实现。

选择 `none` 时，不生成 `.ejs`、STPT 特殊指令或 EJS 变量。MVU 是否启用由独立阶段决定。

## 模板合同

每个模板至少定义：

```text
执行阶段
输入上下文
输出通道（prompt/render/iframe）
作用域与变量所有者
副作用
失败行为
安全设置
```

不要把 EJS 仅仅当成“能运行 JavaScript 的地方”。优先纯模板与只读计算；写变量、执行 Slash、改世界书或访问父页都必须是明确需求并单独验收。

## 变量作用域

STPT 原生作用域包括：

```text
global
local
message
cache
initial
```

这些是 EJS/STPT 变量，不是 MVU 的 `stat_data/schema/display_data/delta_data`。需要持久化 EJS 自有变量时明确调用相应保存能力，并说明保存范围；不要把它包装成 MVU 快照。

## 世界书与 `getwi`

- 特殊条目按真实 `@@generate_before`、`@@generate_after`、`@@always_enabled` 等阶段设计；
- 普通世界书扫描与特殊条目执行分开验证；
- `getwi` 是 async，关键调用显式写书名和目标条目；
- 被调用条目的 EJS 可能有副作用，不把 `getwi` 当无副作用的原文读取；
- 递归模板必须有清楚的输入和停止边界。

## `@@iframe`

`@@iframe` 是 STPT 的 render-stage 载体，不是任意 generate-stage 调用都会建立的页面。需要消息楼层/Swipe 时，由 EJS render context 把值明确序列化进 HTML；不要假设存在 Tavern Helper fenced iframe 的裸 API。

iframe 可能是同源高权限页面。访问 `window.parent`、注册事件或执行宿主操作时必须能力探测，并在 `pagehide` 清理监听。

## 安全设置

逐项确认：

- `raw_message_evaluation_enabled` 是否真的需要；
- `sandbox` 的现场值和限制；
- `autosave_enabled` 是否与变量保存合同一致；
- 模型或玩家文本能否进入 EJS；
- 模板错误是抛出、toast、保持原消息还是静态回退。

不需要处理原始 user/assistant 消息 EJS 时，关闭 raw-message evaluation。

## 与 MVU 的关系

EJS 可以完全独立运行。EJS 不能自动读取 MVU，也不自动获得顶层 `stat_data`。只有明确需要 MVU 数据时才进入 `st-mvu-ejs-bridge`。
