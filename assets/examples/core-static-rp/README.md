# 纯 SillyTavern 静态消息卡片

这是**受限纯文本**静态路线，不依赖 Tavern Helper，也不声称能在消息中运行 JavaScript。

导入 `静态通知世界书.json` 并绑定后，模型在发生值得单独提示的事实时输出：

```text
<静态通知 标题="潮位变化">东堤水位上涨半尺。</静态通知>
```

`regex.json`：

- display 规则把合法载荷变成静态 HTML；
- prompt 规则保留紧凑语义；
- 流式半块在闭合前隐藏；
- `runOnEdit:false`，不会把 HTML 写回原消息。

## 安全边界

Tavern Regex 的 `replaceString` 不能调用通用 HTML escape。本样本因此采用同一份 producer/regex 字符合同：

- 标题 1-40 字，不允许双引号、换行、`<`、`>`、`&`；
- 正文 1-500 字，不允许 `<`、`>`、`&`；
- 只输出纯文本，不输出内部标签、HTML 实体或事件属性；
- 超出合同的载荷由后置降级规则替换成固定错误提示；非法字段不会进入 HTML，也不会作为下一轮可信状态保留。

这不是任意模型文本的通用 escape 方案。需要自由文本、列表、复杂字段或交互时，改用 Tavern Helper/STPT iframe，通过消息 API读取原文并用 `textContent` 渲染。

- provider：SillyTavern Core 1.18.0；
- producer：`静态通知世界书.json`；
- runtime：`not_run`。
