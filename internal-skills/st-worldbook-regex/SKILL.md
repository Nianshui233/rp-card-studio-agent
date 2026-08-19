---
name: st-worldbook-regex
description: "Private supporting specialist for CharacterBook scheduling, model-visible output contracts, XML/marker production, and paired SillyTavern regex routes."
---

# SillyTavern Worldbook and Regex

这是没有独立用户阶段的支援 Skill。只接受主 Agent 提供的锁定语义需求，不询问用户。完整读取 `shared/contracts/module-io.md` 与 `references/regex-and-rendering.md`。

## CharacterBook

- 世界按主题切片；NPC 通常保持完整；系统、场景、叙事规则、运行提示词、EJS、输出合同和默认禁用的 `<user>` 模板进入职责清晰的条目。
- 一个项目只能有一个 canonical `<user>` 条目。它只保存稳定人物档案；当前位置、物品、任务、伤势和关系变化不得长期写回该静态条目。
- 一个项目只能有一个 canonical `<user>` 条目。它只保存稳定人物档案；当前位置、物品、任务、伤势和关系变化不得长期写回该静态条目。
- 条目正文使用可读 YAML 或自然文本。
- 根据真实运行需要设置激活方式、关键词、插入位置、深度、顺序、概率、递归和选择逻辑。
- 世界书名、条目名和正则名尽量使用中文。
- EJS 专用目标从普通扫描中禁用，通过稳定名称调用。

当需求涉及 `getwi`、`activewi`、预处理世界书、条件 `@@if`、角色/聊天世界书绑定或自动启用局部正则时，先把对应 capability 交给 `st-host-capabilities` 做探测和证据记录；本 Skill 负责条目语义与正则配对，不自行假设宿主对象一定存在。

## 生产者与消费者闭环

每个正则消费者都必须有真实生产者：开场消息标记、常驻的模型可见输出合同条目、MVU 回复格式/更新协议、酒馆助手或框架脚本、明确用户操作。

非 MVU 状态栏必须有专门世界书条目，要求游玩模型按确切 XML 结构和频率输出。只有 HTML 和消费正则不构成运行闭环。

根据实际用途成对设计 display 与 prompt 行为。变量更新块必须同时处理完整块和仍在流式生成的块。使用真实原始消息和完整替换 HTML 测试，不用脱离宿主的玩具字符串证明正确。

## 交接

所需标记、XML 结构、变量路径、生产者或目标条目不存在时，返回阻断性交接，不得静默发明另一套协议。
