# 运行技术样本矩阵

这些样本是经过源码合同核对的原创**运行技术参考**。最小样本用于隔离单条技术路线；`full-mvu-rp` 是完整技术组合制品样例。它们不作为世界观/角色/系统/场景的篇幅或创作密度上限；正式项目应先保留完整 canonical YAML，再无损切入世界书。源码核对与离线测试不等于 SillyTavern 实际导入通过。

| 样本 | 纯静态正则 | TH fenced iframe | MVU | STPT EJS | 一次性开场前端 | 持续消息前端 | 包含角色/世界书制品 | 主要用途 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `core-static-rp` | ✓ | — | — | — | — | — | 世界书 producer | 受限纯文本通知；失败关闭的静态捕获边界 |
| `tavern-helper-iframe-rp` | — | ✓ | — | — | — | 版本化非 MVU 快照 | 世界书 + Script | producer → v1 JSON → 当前楼/Swipe → DOM 文本渲染 → 输入桥 |
| `mvu-ejs-bridge-rp` | 清理规则 | — | ✓ | ✓ | — | — | 世界书 + ScriptFolder | MVU→EJS 只读桥最小路线 |
| `mvu-zod-rp` | ✓ MVU清理 | ✓ 状态栏 | ✓ ZOD | — | — | ✓ 当前楼快照 | 角色卡 + 世界书 + ScriptFolder | **复杂 MVU_ZOD 完整制品主参考：Schema、全 Greeting initvar、详细规则、路径索引、输出格式与硬验证** |
| `full-mvu-rp` | ✓ 通知 | ✓ 两个独立前端 | ✓ | ✓ | ✓ 固定/动态 | ✓ 每楼快照 | ✓ 完整包 | **完整技术组合合同参考；创作内容仍以 canonical YAML 无损打包规则为准** |

`mvu-zod-rp` 是复杂 typed state 的主参考；缺 ZOD、全 Greeting 初态、逐字段规则、路径索引或输出格式会被校验器阻断。`full-mvu-rp` 明确是 `native_schema` 技术组合样本，不得被用来删减 MVU_ZOD 制品。

`full-mvu-rp` 选择一套一致的权威状态与 provider，不把互斥替代方案同时装进一个聊天：

- 开场前端和持续消息前端是两个独立 HTML、两个窄接口、两个生命周期；
- MVU 是唯一动态状态树；EJS 只读，不复制变量；
- 静态通知只承载可读事件，不维护第二套状态；
- 卡内 Scoped Regex 与独立 `regex.json` 是同一份规则的两种导入方式，必须二选一。

所有样本都可以做静态合同核对；真实导入、网络、Markdown/DOMPurify、iframe 与浏览器生命周期仍需单独报告 `runtime_pass` 或 `runtime: not_run`。
