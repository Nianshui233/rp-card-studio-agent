---
name: st-ejs-authoring
description: "Private module for ST-Prompt-Template EJS authoring: template execution stages, scopes, worldbook directives, getwi, dynamic prompts, iframe carriers, safety settings, and EJS-owned variables. Does not create MVU state."
---

# SillyTavern EJS Authoring

只接受主 Agent 调度。EJS 指 **ST-Prompt-Template 的模板执行路线**，不是 MVU，不是持久状态的通用代称。

按需读取：

- 制作规则：`references/ejs.md`
- 精确宿主行为：`references/ejs-runtime.md`

## 何时启用

只有项目需要以下至少一项时启用：

- 按生成阶段动态拼接 Prompt；
- 条件化世界书内容；
- `getwi`/模板递归；
- STPT `@@iframe`；
- 明确的 EJS 变量作用域或模板副作用；
- 明确要求 ST-Prompt-Template/EJS。

仅需要跨消息状态、数值、任务进度或状态栏数据时，不启用本 Skill；那属于 `st-mvu-authoring`。

## 输出

- `.ejs` 或世界书内 EJS 模板；
- 执行阶段、输入上下文、输出去向和错误行为；
- `global/local/message/cache/initial` 的作用域与所有权；
- `raw_message_evaluation_enabled`、`sandbox`、`autosave_enabled` 的项目要求；
- `getwi`、特殊条目和 `@@iframe` 的真实载体合同；
- 模板失败时的静态回退。

## 硬边界

- 不生成 MagVarUpdate Loader、`[initvar]`、MVU Schema、`<UpdateVariable>` 或 `Mvu.*` 写入。
- 不把 EJS 变量称为 MVU 状态，不把 EJS `message` 作用域等同消息楼层 MvuData。
- 不因为模板需要一个临时值就创建 MVU 字段。
- 不直接引用不存在的顶层 `stat_data`。
- 如果模板确实需要 MVU 数据，转入 `st-mvu-ejs-bridge`，不在 EJS 阶段暗中建立耦合。

## 完成判定

每个模板必须说明：

```text
由什么阶段触发
能读取哪些输入
输出进入 prompt、render 还是 iframe
是否有副作用
失败时保留什么
是否需要保存 EJS 自己的变量
```

语法可编译不等于宿主运行通过。没有真实 STPT 证据时记录 `runtime: not_run`。
