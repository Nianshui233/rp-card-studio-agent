---
name: st-runtime-debug
description: "Private supporting module for real SillyTavern runtime reproduction, browser evidence, console/DOM checks, imports, lifecycle, interaction, and failure ownership."
---

# SillyTavern Runtime Debug

这是整合验收的支援模块，不负责设计 UI 或重写 RP。它需要宿主浏览器/自动化能力；没有能力时明确返回 `runtime: not_run`，不模拟成功。此模块的目标是对**精确制品**取得真实 SillyTavern 证据，不是再写一份静态检查说明。

## 验收门

按以下顺序推进；较低一层的通过不能继承成较高一层的通过：

```text
source_checked → static_pass → browser_pass → runtime_pass → human_accepted
```

- `source_checked`：只核对源码/类型签名；
- `static_pass`：只核对语法、制品结构、静态合同和包内绑定；
- `browser_pass`：在浏览器观察到页面/DOM/交互，但不代表 ST 导入或持久化；
- `runtime_pass`：精确制品已在命名版本的真实 SillyTavern 环境中导入并通过选定矩阵；
- `human_accepted`：用户确认体验符合目标，Agent 不得代替用户发出此状态。

任一层都使用 `passed/failed/blocked/not_run`。某条被用户要求的路径若为 `blocked` 或 `not_run`，不能把整个制品总结为“可直接导入”或“稳定运行”。

## 实机执行顺序

1. **先确认浏览器驱动能力**：能否打开/附着目标 ST、检查顶层和 iframe、查看带 frame 的 Console、读取 DOM/样式、交互及切换视口。缺失能力时列出具体缺口，不用截图推断 Console 或跨 frame 状态。
2. **明确目标与副作用**：记录 ST/相关扩展版本、浏览器、目标角色/聊天、测试制品身份、当前 Swipe/消息数，以及哪些步骤会写聊天、世界书、变量或设置。优先使用用户授权的隔离测试实例/测试配置；不要默认向活动用户数据目录覆盖文件。若没有隔离环境且导入/测试会改动用户数据，先说明具体改动并取得授权。
3. **锁定制品身份**：对参与导入的角色卡、世界书、Regex、ScriptFolder 和 HTML/JS 源码记录 SHA-256；导入后核对角色名/版本/载荷与预期一致，重新盘点实际绑定、启用状态和 scoped allowlist，防止测到同名旧卡或过期导入。
4. **建立基线后再复现**：记录初始 Console/聊天身份；一次执行一个动作；每步检查真实结果、DOM/frame 与数据变化。新制品或绑定通常用新聊天验证。
5. **按本文件的验收矩阵执行所需行**：覆盖导入、依赖加载就绪信号、首条消息、worldbook/prompt、Regex、MVU、EJS、可选 bridge、开场、消息前端、Swipe/编辑、保存与重载、错误回退和窄屏。
6. **修复后重建并重测**：更新源码后要重建；以新哈希核对生成制品；需要时重新导入/新建聊天，再对同一失败路径复测。不能沿用旧制品的绿色证据。

真实路径：

1. 按项目包中的导入说明依次导入角色卡、世界书、正则和 Tavern Helper 脚本；
2. 确认 CharacterBook、主世界书、角色正则和 Tavern Helper 脚本；
3. 打开新聊天并检查首条消息；
4. 检查 Console、DOM/iframe、Blob URL、父页面桥和真实状态路径；
5. 点击按钮、提交表单、写入变量并读回；
6. 检查编辑、Swipe、重载、聊天切换、重复挂载和监听清理；
7. 检查窄屏、长中文、空态、错误态和失败回退。

## 故障归因

按第一因果错误返回 `handoff`：导入/绑定 → integration，API/版本 → st-api-reference 或 st-host-capabilities，状态/变量 → mvu；动态模板 → ejs；MVU 与 EJS 数据交换 → runtime_bridge；正则/标记 → st-render-regex，开场/创角页面与提交 → st-opening-frontend-authoring，持续消息 UI 源码与生命周期 → st-message-frontend-authoring。

浏览器超时只表示观察动作超时，不代表副作用没有发生；重新读取聊天身份、消息数量、挂载数量和变量值后再下结论。最终 QA 报告只需给出精确制品哈希、环境版本、所跑矩阵的 `passed/failed/blocked/not_run`、关键直接证据与限制；继续遵守本 Agent 的轻量规则，不另存逐步运行日志、会话转录、矩阵副本或调试账本。
