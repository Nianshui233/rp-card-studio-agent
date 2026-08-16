# 正则与消息渲染

正则是 SillyTavern 的文本变换层，不是数据源、MVU 引擎或 UI 生成器。

## 先定义变换

每条规则先写清：

- 原始文本来自用户输入、AI 输出、世界书、Slash Command 还是推理；
- 只改变显示、只改变送模提示词，还是两者；
- 对最新楼、旧楼、编辑、Swipe、重载和流式生成怎样工作；
- 与前后规则的顺序关系；
- 未匹配、半截匹配和重复执行时怎样退化。

## 卡内正则真实字段

维护 `data.extensions.regex_scripts` 所需的实际字段：`id`、`scriptName`、`findRegex`、`replaceString`、`trimStrings`、`placement`、`disabled`、`markdownOnly`、`promptOnly`、`runOnEdit`、`substituteRegex`、`minDepth`、`maxDepth`。

显示名称尽量中文。`findRegex` 是包含旗标的完整正则字符串。placement 数值和三态行为必须按目标 SillyTavern 版本核实，不凭印象翻译。

## HTML 替换

完整消息 UI 常见形式：

```text
模型或 first_mes 输出短标记
→ display 正则命中
→ replaceString 为 ```html 包裹的完整 HTML 文档
→ Tavern Helper 将其渲染为消息 iframe
```

HTML 可以很长。不要因为代码量大就拆碎；只要一个功能面应共同加载、共享状态和导航，就保持一份完整源码。

显示和送模必须分开验证。玩家看到完整 HTML，不代表模型没有收到它；需要 prompt-only 规则把标记或 HTML 替换为短而有意义的叙事/状态说明。

## 变量隐藏规则

若模型输出原始初始化或更新块，至少检查：

- 完整块在显示层隐藏；
- 流式未闭合块不会泄露半截代码；
- 提示词侧按 MVU/更新模型真实需求保留或移除；
- 旧楼深度策略不会让上下文无限膨胀；
- 状态 HTML 使用真实变量 API 读取数据，不靠正则捕获示例值冒充实时状态。

具体标签、大小写和闭合形式必须来自本卡实际协议，不自动生成固定 `<update>`/`<initvar>` 套件。

## 夹具

至少准备：

- 原始完整块；
- 流式半截块；
- 同一回复中正文 + 更新块 + UI 标记；
- 多行、中文、尖括号、美元符号和捕获组；
- 最新楼与旧楼深度；
- 编辑后再次运行；
- 不应命中的相似文本。

离线测试只能证明 JavaScript 替换语义和声明条件。宏求值、DOMPurify、Markdown、Scoped/Global/Preset 顺序、iframe、Blob URL 和宿主生命周期需要真实 SillyTavern 验证。
