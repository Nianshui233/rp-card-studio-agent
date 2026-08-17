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

离线 Trace 只证明声明的 JavaScript 替换语义；SillyTavern 的宏、Markdown、DOMPurify、全局/Scoped/Preset 顺序、Blob URL 和真实生命周期仍由 `st-runtime-debug` 验收。
