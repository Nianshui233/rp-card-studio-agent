---
name: st-component-architecture
description: "Private supporting module for reusable rolecard components, registry/recipe contracts, dependency graphs, component-level updates, and source/artifact parity."
---

# SillyTavern Component Architecture

这是大型项目和多卡复用模块的支援 Skill，不替代主 Agent 的项目账本，也不强迫小项目建立组件库。读取 `references/component-contract.md`。

## 组件边界

组件可以是世界模块、角色模块、变量核心、正则模块、Tavern Helper 脚本、开场前端、状态 UI 或宿主适配器。每个组件声明：输入、输出、能力、依赖、维护源、测试夹具和交付类别。

## Recipe

Recipe 只选择组件和输出边界，不复制组件正文或 Forge 逻辑。组合前解析依赖图、冲突、循环、变量路径和输出所有权。组件级更新必须生成可导入测试制品或明确要求重新整卡构建，不能静默覆盖完整卡。

## 边界

小项目仍可直接使用 `src/`；只有用户需要复用、批量维护或大型蓝图时才启用 registry/recipe。
