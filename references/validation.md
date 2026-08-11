# 校验与证据规则

校验的目标不是用清单替代创作判断，而是防止语法错误、断裂引用、秘密泄露、字段失联和“离线通过等于运行成功”的错误结论。

## 1. 结果等级

每条检查输出以下状态之一：

- `pass`：当前证据足以确认。
- `fail`：已确认违反契约。
- `warning`：可以交付，但用户应知道风险或质量欠缺。
- `not_run`：尚未执行。
- `blocked`：缺少环境、依赖或输入，无法执行。

严重度分为：

- `blocker`：阻止阶段完成或最终交付。
- `warning`：允许继续，但必须进入报告并由用户处置。
- `info`：说明性记录，不影响门槛。

不能用 warning 掩盖确定的数据损失、秘密泄露或不可解析产物。

## 2. 阻断项

以下情况至少阻断最终交付；括号内阶段还应阻断对应阶段完成：

涉及可选能力的阻断项只在对应 feature 已启用、项目需保留既有实现，或交付物实际包含该能力时适用。系统可以仅由模型按语义规则尽力维护，但不得声称具有确定性持久化；只有声明运行时支持时才要求 MVU 或明确的等价状态源。`stages.mvu_ejs.status: skipped` 且产物不含 MVU/EJS 实现时，不得因为缺少 `mvu.yaml`、字段生命周期账本、EJS 分支或相关运行时证据而判定失败；若本轮跳过但保留既有实现，仍对实际产物执行适用检查；若关闭 feature 后仍残留相关实现，则按源文件与项目契约冲突处理。

- YAML/JSON 无法解析，或 Schema 版本不受支持。（所有阶段）
- 稳定 ID 重复、引用目标不存在、引用类型不匹配。（对应内容阶段）
- 已锁定决定互相矛盾，或源文件与 `project.yaml` 冲突。（所有阶段）
- 玩家可见投影包含 `gm_only` 或 `model_only` 内容。（内容、UI、整合）
- 已启用或保留的运行时变量缺少默认值、唯一 writer、合法 reader，或类型与更新操作不符。（MVU/EJS 或等价状态源）
- 项目声称确定性状态持久化，但多轴系统没有绑定 MVU 或等价状态源中的具体路径与生命周期。（系统、运行时实现）
- 开场文字与其初始化状态冲突。（叙事与开场）
- opening 的默认呈现不存在、增强呈现缺少纯文本回退、呈现回退成环，或呈现变体改写父 opening 的事实/初始状态/钩子/玩家交接点。（叙事与开场）
- 已启用或保留的 EJS 读取不存在的字段、无安全默认值、条件分支不完整或语法无效。（MVU/EJS）
- 状态栏字段无来源、类型不兼容或暴露非玩家字段。（状态栏/UI）
- `mode` 为 `embedded`/`both` 但 delivery 不完整，或 adapter ID、entrypoint、artifact、mount anchor 与其他运行时交付发生碰撞。（状态栏/UI、整合）
- 运行时状态 Schema 与 storage、protocol、初始化 profiles、opening bindings 或字段账本不一致。（MVU/EJS、整合）
- `assembly.yaml` 未登记、世界书/媒体 consumer 引用悬空、媒体回退成环，或关键远程媒体没有可用回退。（整合）
- 独立世界书使用数组或非规范 UID 对象键，键与 `uid` 不一致，或把裸 CharacterBook 当作独立世界书导入。（整合）
- 世界书使用宿主不执行的书级扫描/预算/递归值、非 `shared/model` 路由、`include` 回退，或把角色过滤写入内嵌 CharacterBook。（整合）
- 运行时代码通过未登记远程脚本加载；远程媒体不在此禁令内，但必须登记到 `media_manifest` 并提供回退。（整合）
- NSFW 未启用但产物仍含相关专用字段、分组、条件或模板占位。（所有投影）
- 存在未替换的模板标记、空引用或构建时才发现的占位文件。（整合）
- 旧卡未知字段、条目顺序或扩展启用状态在往返中无说明地丢失。（整合）
- PNG 负载损坏、重复且优先级不明、解码失败，或 JSON/PNG 语义不一致。（整合）
- 写入目标将覆盖原始输入，且用户没有明确传入覆盖授权。（整合）
- 内容或操作违反平台硬约束。（任意阶段）

## 3. 警告项

以下通常作为 warning，除非用户把它列入验收硬门槛：

- 角色声音、场景细节或世界规则仍显单薄，但不存在逻辑断裂。
- 备选开场与默认开场差异不足。
- 未被任何 reader 使用的可选字段，且已明确保留目的。
- 世界书或提示词预算偏大，但未超过项目硬预算。
- UI 次要断点、动画或非关键浏览器尚未实测。
- 远程依赖有回退但可用性尚未在目标网络确认。
- 媒体资源已登记且有回退，但远程可用性、`none | on_opening | eager | on_demand` 预加载时序或非关键消费者尚未实测。
- 真实 SillyTavern 验收尚未执行，但用户只要求源码或候选产物。

警告必须包含 `id`、影响、证据、建议和用户处置，不接受“有一些小问题”这类模糊描述。

## 4. 三类证据

### A. 离线/源文件证据 `offline`

可证明：

- 文件可解析并符合 Schema。
- ID、引用、可见性、字段生命周期和占位符符合静态契约。
- EJS/脚本通过可用的语法解析器或规则检查。
- `reports/runtime-state.schema.json` 可解析，且与 storage、protocol、字段账本、初始化 profiles 和 opening bindings 的生成输入一致。
- 跨文件引用图、呈现回退图和媒体回退图通过静态闭环检查。
- 构建在相同语义输入下保持确定性。

不能证明：SillyTavern 实际导入成功、扩展 API 存在、聊天时变量会更新、浏览器 UI 会正确渲染。

### B. 构建产物证据 `artifact`

可证明：

- JSON 可重新解析且符合角色卡结构。
- PNG 可提取声明的数据负载，JSON 与 PNG 语义一致。
- 解包重打包保留条目、扩展、Unicode、多行文本和未知字段。
- 构建清单中的哈希、版本、输入修订与实际文件匹配。
- 生成的 adapter 文件与已锁定契约中的 ID、entrypoint、artifact 和 mount anchor 一致且无碰撞。

不能证明：目标宿主会启用依赖、EJS 会在真实上下文按预期运行、UI 与扩展版本兼容。

### C. 真实运行时证据 `runtime`

必须来自目标 SillyTavern 或用户明确认可的等价环境，并记录版本、依赖、操作步骤和观察结果。它可以证明：

- 角色卡导入、新建聊天和所有开场分支。
- 默认与覆盖初始化、变量更新、保存后重载和旧聊天迁移。
- EJS 条目显隐、分支、回退及 plot/update 路由。
- 状态栏加载、更新、交互、错误降级和移动/桌面布局。
- 状态栏在完整消息、流式部分、解析失败、生成中断、消息编辑/删除和切换聊天时正确更新与清理。
- 控制台错误、网络失败与宿主依赖状态。

浏览器外静态 HTML、截图、Schema 校验或模拟对象不能标记为 `runtime: pass`。

## 5. 阶段门槛

每个阶段结束时至少执行：

1. 本阶段 Schema 与必填项检查。
2. 当前阶段 ID、引用与玩家/GM 可见性检查。
3. 与所有上游锁定决定的一致性检查。
4. 跨阶段待办分类：`blocking`、`deferred`、`resolved`。
5. 阶段总汇完整性检查。

任何 blocker 存在时阶段不能标记 `complete`。用户可以接受 warning，但不能以接受警告绕过 blocker。

## 6. 静态链路检查

### 世界、角色与场景

- 规则有作用域、例外和后果；秘密与公开知识分离。
- 角色行为规则引用的世界事实存在，关系目标可解析。
- 场景入口、出口、线索去向和事件引用均可达。
- 被删除或改名的实体没有遗留引用。

### 系统、MVU 与 EJS

按项目已启用或需保留的能力执行以下检查；跳过且不存在实现的能力不要求虚构对应文件或映射。仅语义、由模型尽力维护的系统检查规则自洽性，不执行运行时生命周期检查；声称确定性持久化的系统必须提供 MVU 或等价状态源。

- 启用 MVU 时，`system.yaml` 的语义路径与 `mvu.yaml` 的映射一一对应；使用等价状态源时，提供同等可审计的显式映射。
- 默认值符合类型、范围和枚举；每个开场覆盖是完整合法状态。
- writer 唯一，允许操作与字段类型相容，派生字段无竞争写入。
- readers、EJS 条件和 UI 绑定只引用已存在路径。
- 更新模式与接收者清单一致；共享条目有明确理由。
- 清理和迁移规则覆盖改名、类型变化和旧存档缺失。
- `mvu.initialization.profiles[]` 的 ID 唯一，默认 profile 可解析；`mvu.initialization.opening_bindings[]` 的每个 opening/profile 引用均存在，且同一 opening 不产生歧义绑定。
- 每条实际开场都能解析到唯一初始化结果；未启用 MVU 时 `initial_state_ref` 为 `null`，也不生成伪造 profile。
- `reports/runtime-state.schema.json` 对默认 profile 与每个 opening 覆盖后的完整状态分别校验，不能只验证空骨架。

### 叙事、开场与 UI

- 叙事合同保护玩家代理权，开场有可接管的行动空间。
- 开场公开文本不泄露 GM 真相，描述与初始状态一致。
- `openings[].presentations.default_variant_id` 指向同 opening 内唯一变体；所有 `fallback_variant_ref` 可解析、无环，并最终到达不依赖脚本或媒体的纯文本 `prose` 变体。
- 呈现变体只改变表达形式，不改变父 opening 的 `established_facts`、`initial_state_ref`、`immediate_change`、`hook` 或 `player_handoff`。
- 每个 `media_refs` 均在 `assembly.yaml.media_manifest` 中有同 ID 资产；该资产以父 opening 的 `opening:*` 作为 consumer ref，并在 slot 中定位呈现变体。没有媒体时回退文本仍保持父 opening 语义。
- UI 展示模型不直接修改原始状态；交互经过登记的命令或 writer。
- 空值、加载、错误和无依赖降级均有可见结果。
- `status_ui.mode` 与 delivery 一致；嵌入式/并存模式的 adapter、entrypoint、artifact、mount anchor 和 lifecycle 完整，纯文本模式允许 delivery 为 `null`。
- 完整消息、流式部分、解析失败和生成中断均有确定降级；消息编辑/删除、重新生成和切聊会清理 events、observers、timers、DOM、styles 与 stores。

### 装配引用图

- 从 `project.yaml.source_manifest` 出发遍历 world、character、system、scene、MVU、opening、UI 与 `assembly.yaml`；所有强引用必须到达唯一目标，删除或改名后不得遗留悬空边。
- 世界书 entry 的 source、呈现/场景/UI 的媒体 consumer、EJS reader、状态栏 source path 和 adapter 契约都进入同一份引用图报告。
- 媒体 `fallback.asset_ref` 构成的图必须无环并到达存在的资产；`skip`/`text`/`block` 为终点。
- adapter ID、entrypoint、artifact 和 mount anchor 分别全局去重；同一文件不得由两个不兼容契约生成。
- 远程运行脚本一律拒绝，除非未来平台契约明确新增并登记相应类别；远程媒体允许 HTTPS，但必须在 media manifest 登记 consumer、证据和失败回退。
- UI 只有设计规格而没有适用运行时交付物时，记录 `ui.runtime_missing`。当项目承诺嵌入式 UI 成品时它是 blocker；仅交付规格时是明确 warning，不能标记 `runtime: pass`。

## 7. 产物与往返检查

- `build` 前源工作区干净或已记录变更；`--dry-run` 不产生文件变化。
- 未提供显式覆盖参数时拒绝覆盖已有产物。
- 中途失败不提交候选目录，也不留下半成品状态。
- JSON、PNG 和世界书中的共享语义相同。
- `assembly.yaml` 与生成世界书、媒体清单和 adapter 文件语义一致；`source_manifest.assembly` 指向实际装配源。
- 独立世界书的对象键、数字 `uid` 和条目身份一致；条目级 `scan_depth` 在独立世界书映射为 `scanDepth`，在内嵌 CharacterBook 映射为 `extensions.scan_depth`，并保持 `0`、`null` 和 `1000` 的含义。
- 独立世界书角色过滤的 `avatar_stems` 不带扩展名且大小写准确；`tag_ids` 有目标实例证据，不使用显示标签名。内嵌 CharacterBook 不携带该过滤器。
- `unpack -> build -> unpack` 后对规范化对象做深比较；忽略项必须列入白名单并说明非语义原因。
- Unicode、换行、条目顺序、启用状态、扩展对象和未知字段均保留。
- PNG 图像数据保持一致；仅角色卡元数据块允许变化。

## 8. 真实运行验收建议

按实际启用和交付的能力裁剪，至少覆盖适用项：

1. 导入 JSON 与 PNG，各自新建聊天。
2. 默认开场和每个备选开场。
3. 一次无变化回合、一次合法更新、一次边界更新和一次错误输入回退。
4. EJS 条件的真、假、缺值和依赖不可用分支。
5. 保存、刷新、继续聊天与旧状态迁移。
6. 每个呈现默认变体、纯文本回退和媒体加载失败分支。
7. 状态栏桌面、窄屏、键盘操作、长文本、完整/流式/解析失败/中断状态。
8. 消息编辑、重新生成、删除和切换聊天后的卸载、清理与重新挂载。
9. 宿主依赖禁用与重新启用后的安全降级和恢复。

无法执行的项目记录为 `not_run` 或 `blocked`，绝不自动改成通过。

## 9. 验证报告

`reports/validation.json` 至少包含：

```json
{
  "schema_version": "1.0.0",
  "project_id": "example_project",
  "source_revision": 1,
  "summary": { "blockers": 0, "warnings": 1 },
  "checks": [
    {
      "id": "artifact.roundtrip",
      "severity": "blocker",
      "status": "pass",
      "evidence_level": "artifact",
      "evidence": ["reports/roundtrip.json"]
    }
  ],
  "runtime": {
    "status": "not_run",
    "reason": "尚未在目标 SillyTavern 中执行"
  }
}
```

交接报告必须分别列出：已确认的离线事实、已确认的产物事实、真实运行事实、未运行/受阻项目、宿主设置、用户接受的警告和下一步。结论的措辞不得高于证据等级。
