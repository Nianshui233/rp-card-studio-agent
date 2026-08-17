# 砂钟议事厅：原创 MVU_ZOD 闭环样本

闭环顺序是：真实 YAML 初始值 → 名称含 [initvar] 的 CharacterBook 条目 → Zod Schema 注册 → 模型更新规则与输出格式 → 完整/流式隐藏正则 → EJS 读取当前状态并按名调用世界书条目。

Schema 的 prefault 只负责结构补全，不再被误写成初始变量来源。
