---
name: st-render-regex
description: "Private supporting module for deterministic Tavern Regex fixtures, stage tracing, prompt/display channels, depth, placement, and streaming cleanup."
---

# SillyTavern Render Regex

这是正则工程和追踪模块，不负责创作 XML 语义，也不直接决定 UI。读取 `references/render-contract.md`，使用 `scripts/regex/` 中的确定性工具。

## 流程

```text
确定目标版本和 dialect
→ validate
→ run fixtures
→ trace input/enabled/placement/depth/pattern/output
→ 交给真实宿主验证 Markdown、宏、iframe 和生命周期
```

每个 fixture 明确输入、来源、placement、深度、目标通道和预期输出。完整块、流式半块、prompt-only、display-only、编辑和 Swipe 都要有测试。
