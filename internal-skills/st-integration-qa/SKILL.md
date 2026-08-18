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
- 默认且唯一构建多文件 RP 项目包；角色卡、世界书、正则、酒馆助手脚本和完整单文件 HTML 前端分别落盘。
- 校验源码、前端构建新鲜度、制品语法、引用、生产者-消费者闭环、状态路径、重复 ID 和重复构建幂等性。
- 只设置可运行和可交付的最低线，不设置内容规模上限。条目、角色、场景、变量、组件、正则、脚本、HTML/JS 和制品体量增加时继续装配和验证，不因数量或大小要求删除创作内容；若存在性能成本，只作为报告与可选优化方向。
- 旧卡改造必须先验证材料盘点、`original.json`、`preserved.json`、用户条目替换记录和逐阶段账本；承重证据缺失时停止整合，不把部分完成包装成最终卡。
- 最终项目包必须自包含：每个可导入 JSON 不得保留源码路径、`source_refs`、`replace_file`、`content_file` 或绝对文件路径；每个前端交付为完整 HTML，正则配置与对应 HTML 分开落盘并在项目清单中配对；EJS 与 Tavern Helper 脚本按真实宿主导入边界提供。
- 远程依赖可以使用，但必须在交付报告中单列宿主/网络依赖；本地相对引用、工作区文件名和维护源码路径不能用“运行时会自己找到”来替代真实交付组件。
- 只要项目存在变量、MVU 或状态根，必须在最终制品中核对实际 Tavern Helper 脚本节点和代码内容；仅有变量说明、loader 占位或维护源路径不算完成。
- 在不修改宿主本体的前提下执行或记录真实 SillyTavern 验收。

制作期内容边界在整合时按“双向清洁”验收：新的维护源码与项目包不得包含涉及未成年人的成人性内容；同时，交付物也不得包含为此追加的运行时年龄/成年门禁。不得在 CharacterBook、系统规则、MVU/Schema、EJS、Tavern Helper、正则、开场或 HTML/JS 中加入 18+ 声明、年龄确认、模型拒绝指令、成年证明字段、关系更新禁路或隐藏拦截。旧卡 `original.json` / `preserved.json` 的保真副本不属于可运行交付组件，可以保留原始输入，但不能被项目清单列为需要导入的内容。

旧卡改造额外检查：清理旧用户档案后，`src/user-character.yaml` 与项目包中的独立世界书都必须存在独立的中文、默认禁用 `<user>` 空白模板；缺失时即使其他内容完整也必须阻断交付。

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
