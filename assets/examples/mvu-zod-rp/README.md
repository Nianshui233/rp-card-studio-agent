# 砂钟议事厅：原创 MVU_ZOD 闭环样本

闭环顺序是：MVU Loader → `registerMvuSchema` 变量结构注册 → 真实 YAML 初始值 → 名称含 [initvar] 的 CharacterBook 条目 → 模型更新规则与输出格式 → 完整/流式隐藏正则；独立的 `src/runtime/ejs.yaml` 只负责 EJS 生成前读取当前状态和模板投影，不拥有 MVU 状态写入权。

Schema 的 prefault 只负责结构补全，不再被误写成初始变量来源。
