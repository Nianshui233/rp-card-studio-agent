# Tavern Helper fenced HTML 非变量消息前端

这是非 MVU 消息快照的完整参考：每条 assistant 消息携带自己的 v1 JSON 快照，页面读取当前数值楼层与 Swipe，不维护跨楼层状态树。

## 文件

| 文件 | 作用 | 导入 |
|---|---|---|
| `航站终端世界书.json` | 可导入 producer 输出合同；定义 v1 JSON、字段、转义和单块规则 | 是 |
| `regex.json` | display iframe、流式半块、闭合待 marker、prompt marker 清理 | 是，或嵌入角色卡 |
| `input-bridge.script.json` | 可导入 TH Script；安全写入输入框，不自动发送 | 可选 |
| `terminal.html` | 完整、自包含的 iframe 维护源码 | 否 |
| `input-bridge.js` | Script 可读源码 | 否 |
| `regex.fixtures.json` | display/prompt/stream/版本/相似 marker 夹具 | 否 |
| `payload.contract.test.mjs` | JSON 解析、版本、缺失、多块、特殊字符和行动校验 | 否 |
| `_build.mjs` | 从 HTML/Script 源码重建可导入文件并断言关键合同 | 否 |

## 运行链

```text
世界书 producer
→ assistant 正文末尾输出 <航站状态 v="1"> JSON </航站状态> + <航站终端/>
→ display Regex 替换为完整 fenced HTML
→ SillyTavern 生成 <pre><code>
→ Tavern Helper 4.9.3 建立消息 iframe
→ getCurrentMessageId() + getChatMessages(..., {include_swipes:true})
→ 读取当前 Swipe 原文
→ 取最后一个完整 v1 块
→ JSON.parse + 字段规范化
→ textContent / DOM API 渲染
```

prompt 通道只删除 `<航站终端/>`，保留版本化状态语义供下一轮使用。`runOnEdit:false`，不会把 iframe 源码永久写回消息。

## 载荷边界

- `区域/天气/任务` 是必填字符串；`提示` 可选；`行动` 为 0-8 项 `{label,text}`；
- JSON 中的 `<`、`>`、`&` 使用 `\u003C`、`\u003E`、`\u0026`；
- 多个完整块取最后一个；错误版本和 malformed JSON 显示错误，不沿用旧楼；
- 原生 `JSON.parse` 的重复键采用后值覆盖前值，producer 禁止主动重复；
- 未知字段忽略，非法行动项丢弃并报告数量；
- 页面不使用 `innerHTML` 渲染模型字段；
- 行动按钮只写入输入框，反馈明确“尚未发送”；slash 管线字符和换行由输入桥转义。

## 导入

1. 安装并启用 Tavern Helper；
2. 导入并绑定 `航站终端世界书.json`；
3. 导入 `regex.json` 为角色 Scoped Regex，并允许该角色运行；
4. 如需行动按钮，导入 `input-bridge.script.json` 并主动启用；
5. 新建聊天测试完整、编辑和 Swipe 路线。

- provider：SillyTavern 1.18.0 + Tavern Helper 4.9.3；
- runtime：`not_run`。
