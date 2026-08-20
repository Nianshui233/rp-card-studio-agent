---
name: st-host-capabilities
description: "Private supporting module for checking real SillyTavern and Tavern Helper capabilities when a runtime feature requires it."
---

# SillyTavern Host Capabilities

这是纯支援 Skill，没有独立用户阶段，也不维护能力账本。只有当前实现需要真实宿主接口时，读取对应宿主参考。

## 处理方式

1. 识别当前实现需要的 capability；
2. 读取目标宿主版本、实际类型声明或模板行为；
3. 设计能力探测、成功路径、失败路径和回退；
4. 只有实际运行成功才报告为已验证；否则写 `runtime: not_run`；
5. 将 API 使用交回 Runtime、Frontend 或 QA Skill。

## 边界

“可以调用”不等于“已经成功”。卡内脚本、消息 iframe、父页面组件和全局插件是不同部署面，不能互相冒充。不要为了普通角色卡修改宿主本体或创建完整插件工程。
