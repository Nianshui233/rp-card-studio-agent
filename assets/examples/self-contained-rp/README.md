# 潮痕档案馆：自包含技术样本

这是 `rp-card-studio` Agent 自带的原创技术样本，不依赖外部网页、外部仓库或其他卡片源码。

它只演示一条完整的 SillyTavern RP 包运行链：

```text
可读 YAML 世界资料
  → CharacterBook 条目调度
  → 模型输出 XML 标记
  → SillyTavern 正则替换为完整 HTML
  → HTML 读取消息内状态并执行宿主动作
```

样本中的世界、人物、文案、HTML、正则和脚本均由本 Agent 独立创作，只用于说明结构和回归测试，不代表任何用户项目，也不复刻外部样本。

## 文件

- `src/world/世界书.yaml`：常驻规则、关键词条目和状态输出契约。
- `src/runtime/ui/潮痕状态栏.html`：完整消息内 HTML，包含概览、档案、日志三个视图。
- `src/runtime/regex/状态栏.json`：把 `<潮痕状态栏/>` 替换为完整 HTML。
- `src/runtime/regex/变量隐藏-完整.json`：隐藏闭合的 `<潮痕变量>...</潮痕变量>`。
- `src/runtime/regex/变量隐藏-流式.json`：隐藏尚未闭合的变量块。
- `src/runtime/scripts/宿主动作.js`：无外部依赖的宿主动作示例，支持失败回退。
- `src/runtime/opening/创角变量桥.yaml`：非 MVU 创角字段到 `<user>`/XML 主控设定块的绑定契约。
- `assembly.yaml`：把上述内容装配到 CharacterBook 和卡内运行扩展。

## 运行假设

- 状态栏由模型在回复末尾输出 `<潮痕状态栏/>`。
- 变量更新块使用 `<潮痕变量>...</潮痕变量>`，显示层隐藏、提示词层按项目策略处理。
- HTML 优先读取当前消息中的 `stat_data`，读取失败时显示“等待状态数据”，不伪造数值。
- 按钮动作优先使用当前宿主提供的输入框 API；不可用时显示可复制文本，不让点击无反馈。
- 非 MVU 创角确认只生成可消费的主控设定块，不声称修改了 MVU 状态。
