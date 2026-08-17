---
name: st-integration-qa
description: "Private module for CharacterBook assembly, Forge validation, card JSON delivery, SillyTavern runtime acceptance, and failure routing."
---

# SillyTavern Integration and QA

只接受主 Agent 调度。完整读取 `shared/contracts/module-io.md` 与本模块三个参考：

- `references/integration.md`
- `references/artifact-contracts.md`
- `references/validation.md`

## 职责

- 从真实维护源码装配 CharacterBook、正则、酒馆助手脚本、扩展字段、开场和卡面。
- 保留未知导入字段与已有运行代码，除非当前项目明确接管。
- 要求受管 CharacterBook 非空，并确保世界书绑定名称精确一致。
- 默认构建一个可导入角色卡 JSON；其他格式只按明确需求生成。
- 校验源码、前端构建新鲜度、制品语法、引用、生产者-消费者闭环、状态路径、重复 ID 和重复构建幂等性。
- 在不修改宿主本体的前提下执行或记录真实 SillyTavern 验收。

## 故障归因

按真实所有权返回交接：

- RP 事实或内容缺失 → foundation、cast 或 experience 对应阶段；
- 初值、更新、EJS、变量路径 → `mvu_ejs`；
- 前端渲染、交互、布局、生命周期 → `status_ui`，纯开场表面则返回 `narrative_opening`；
- 条目调度、标记生产或正则 → 语义拥有阶段，并加载 `st-worldbook-regex` 支援；
- 制品装配和宿主导入 → `integration`。

不得手改生成的 `dist/` 伪装修复。必须修维护源码、重新构建、重新验证。

## 证据

分别报告源码/静态、装配制品、真实运行和用户验收。未进行真实宿主测试时正确状态是 `not_run`。
