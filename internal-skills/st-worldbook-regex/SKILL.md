---
name: st-worldbook-regex
description: "Private supporting specialist for CharacterBook scheduling, model-visible output contracts, XML/marker production, and paired SillyTavern regex routes."
---

# SillyTavern Worldbook and Regex

这是没有独立用户阶段的支援 Skill。只在当前任务需要世界书调度、标记生产或正则时加载 `references/regex-and-rendering.md`。不询问用户，不维护项目账本或装配清单。

## CharacterBook

- 世界按主题切片；NPC 通常保持完整；系统、场景、叙事规则、运行提示词、EJS、输出合同和默认禁用的 `<user>` 模板进入职责清晰的条目。
- 每个项目只能有一个 canonical `<user>` 条目，只保存稳定档案；动态状态不长期写回静态条目。
- 根据真实运行需要设置激活方式、关键词、插入位置、深度、顺序、概率、递归和选择逻辑。
- EJS 专用目标从普通扫描中禁用，通过稳定名称调用。

## 生产者与消费者

每个正则消费者都必须有真实生产者：开场消息标记、常驻输出合同、MVU 回复格式、酒馆助手/框架脚本或明确用户操作。

非 MVU 状态栏必须有专门输出合同。display 与 prompt 行为按用途成对设计；变量更新块同时处理完整块和流式半块。使用真实原始消息和完整 HTML 做必要回放。
