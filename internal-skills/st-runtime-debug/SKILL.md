---
name: st-runtime-debug
description: "Private supporting module for real SillyTavern runtime reproduction, browser evidence, console/DOM checks, imports, lifecycle, interaction, and failure ownership."
---

# SillyTavern Runtime Debug

这是整合验收的支援模块，不负责设计 UI 或重写 RP。它需要宿主浏览器/自动化能力；没有能力时明确返回 `runtime: not_run`，不模拟成功。

## 验收顺序

1. 按项目包中的 `00_导入说明.md` 依次导入角色卡、世界书、正则和 Tavern Helper 脚本；
2. 确认 CharacterBook、主世界书、角色正则和 Tavern Helper 脚本；
3. 打开新聊天并记录首条消息；
4. 检查 Console、DOM/iframe、Blob URL、父页面桥和真实状态路径；
5. 点击按钮、提交表单、写入变量并读回；
6. 检查编辑、Swipe、重载、聊天切换、重复挂载和监听清理；
7. 检查窄屏、长中文、空态、错误态和失败回退。

## 故障归因

按第一因果错误返回 `handoff`：导入/绑定 → integration，API/版本 → st-api-reference 或 st-host-capabilities，状态/变量 → mvu_ejs，正则/标记 → st-render-regex，开场/创角页面与提交 → st-opening-frontend-authoring，持续消息 UI 源码与生命周期 → st-message-frontend-authoring。

浏览器超时只表示观察动作超时，不代表副作用没有发生；重新读取聊天身份、消息数量、挂载数量和变量值后再下结论。
