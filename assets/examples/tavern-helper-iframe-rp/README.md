# Tavern Helper fenced HTML 消息前端

模型在回复末尾输出：

```text
<航站状态>
区域=北栈桥
天气=小雨
任务=核对灯标
</航站状态>
<航站终端/>
```

`regex.json` 将完整 `<航站状态>...</航站状态>` 与其后的 `<航站终端/>` 一起替换为 fenced HTML 代码块；流式半块和闭合但尚未出现 marker 的尾部先隐藏。SillyTavern 先生成 `<pre><code>`，Tavern Helper 4.9.3 再建立 iframe。页面用数值 `getCurrentMessageId()` 和 `getChatMessages()` 读取同楼原文，不把任意捕获载荷拼进脚本；prompt 通道只删除 marker，保留状态快照。

`input-bridge.script.json` 是可直接导入的 Tavern Helper Script JSON；`.js` 是同一内容的可读源码。导入脚本后需由玩家主动启用。

- provider：SillyTavern 1.18.0 + Tavern Helper 4.9.3；
- runtime：`not_run`。
