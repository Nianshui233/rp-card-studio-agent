# 纯 SillyTavern 静态消息卡片

模型输出：

```text
<静态通知 标题="潮位变化">东堤水位上涨半尺。</静态通知>
```

`regex.json` 的 display 规则把它变成静态 HTML；没有 `<script>`，不依赖 Tavern Helper。prompt 规则保留紧凑语义。该路线只承诺 Showdown/DOMPurify 后的静态显示。

- provider：SillyTavern Core 1.18.0；
- runtime：`not_run`。
