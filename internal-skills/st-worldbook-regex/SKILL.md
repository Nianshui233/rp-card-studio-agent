---
name: st-worldbook-regex
description: "Private supporting specialist for CharacterBook scheduling, model-visible output contracts, XML/marker production, and paired SillyTavern regex routes."
---

# SillyTavern Worldbook and Regex

这是没有独立用户阶段的支援 Skill。需要世界书调度、标记生产或正则时读取 `references/regex-and-rendering.md`；需要把完整创作 YAML 打包成世界书时读取 `references/lossless-yaml-packaging.md`。不询问用户，不维护项目账本或项目管理清单。

## CharacterBook

- 世界、角色、系统和场景先形成完整 canonical YAML，再按稳定主题、YAML 子树与调用需要切片。世界书 `content` 默认保留源 YAML 原文，不做摘要、改写、删例子或概念合并。
- 大型内容通过 constant/关键词/位置/depth/order/EJS 调度控制激活，不通过永久压缩创作内容节省上下文。
- NPC/角色通常按完整角色 YAML 或自然子树切分；系统、场景、叙事规则、运行提示词、EJS、输出合同和默认禁用的 `<user>` 模板进入职责清晰的条目。
- 若项目交付 canonical `<user>` 条目，只能有一个，并默认作为制作者/用户手工维护的静态模板；开场前端不得运行时创建或改写它。玩家亲手发送的开局登记进入聊天状态/MVU，不长期回写静态条目。
- 根据真实运行需要设置激活方式、关键词、插入位置、深度、顺序、概率、递归和选择逻辑。
- EJS 专用目标从普通扫描中禁用，通过稳定名称调用。

## 生产者与消费者

每个正则消费者都必须有真实生产者：开场消息标记、常驻输出合同、MVU 回复格式、酒馆助手/框架脚本或明确用户操作。

非 MVU 状态栏必须有专门输出合同。display 与 prompt 行为按用途成对设计；变量更新块同时处理完整块和流式半块。使用真实原始消息和完整 HTML 做必要回放。

## 无损打包边界

世界书是 canonical YAML 的运行时切片，不是第二个简化稿。除必要 JSON 转义外，条目正文必须能回溯到源 YAML 的连续原文片段；需要改变事实或措辞时先修改源 YAML，再重新生成世界书。只有用户明确要求压缩派生版时才允许摘要，并继续保留完整源。
