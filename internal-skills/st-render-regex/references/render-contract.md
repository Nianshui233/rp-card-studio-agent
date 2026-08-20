# 正则 Trace 合同

```yaml
fixture:
  input: ""
  source: assistant_output
  placement: [2]
  depth: 0
  channel: display | prompt
  expected: ""
```

离线 Trace 只证明声明的 JavaScript 替换语义；SillyTavern 的宏、Markdown、DOMPurify、当前 `GLOBAL → PRESET → SCOPED` 顺序、scoped/preset allowlist、Tavern Helper fenced HTML iframe、Blob URL 和真实生命周期仍由 `st-runtime-debug` 验收。display、prompt、edit 和 Swipe 使用各自真实 depth，不能共用一个模拟值冒充宿主结果。
