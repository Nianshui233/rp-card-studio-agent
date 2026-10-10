---
name: st-host-capabilities
description: "Private supporting module for read-only local SillyTavern discovery and checking real SillyTavern and Tavern Helper capabilities when a runtime feature requires it."
---

# SillyTavern Host Capabilities

这是支援 Skill，没有独立用户阶段，不维护第二份能力账本。预检/续接/QA 路由调用时按 orchestrator/automatic-work.md 主动发现当前执行环境中的酒馆安装和运行实例；具体实现需要接口时才读取对应宿主/API 参考，不因启动探测预读全部技术 Skill。

## 默认只读发现

执行 scripts/host/discover-sillytavern.mjs，当前结果覆盖制作文件/项目记录/host-environment.json。优先明确路径、进程和监听端口，再有深度/目录/时间上限的扫描；不读取聊天、密钥或保存原始配置/命令行，不沿链接扫描用户数据。跨 Windows/Linux/macOS 适配不可用时如实标限制，无法覆盖整机不能断言不存在。

有安装、监听候选、页面可访问和账户/扩展就绪分开记录。多个实例只在用户指定目标能唯一匹配时自动选择，否则只问一次；未运行不自动启动，能访问不自动获得导入/覆盖/发消息权限。此发现始终 runtime: not_run，不替代实机导入验收。

## 接口处理

1. 识别当前实现需要的 capability；
2. 读取目标宿主版本、实际类型声明或模板行为；
3. 设计能力探测、成功路径、失败路径和回退；
4. 只有实际运行成功才报告为已验证；否则写 runtime: not_run；
5. 将 API 使用交回 Runtime、Frontend 或 QA Skill。

## 边界

“可以调用”不等于“已经成功”。卡内脚本、消息 iframe、父页面组件和全局插件是不同部署面，不能互相冒充。不要为了普通角色卡修改宿主本体或创建完整插件工程。
