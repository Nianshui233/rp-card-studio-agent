# MVU/EJS 阶段（可选）

本阶段把已经确定的变量和业务状态机映射成可验证的运行时契约，并决定 EJS 是否以及如何按状态选择已存在的内容。MVU 管 storage、状态生命周期与版本化更新协议，EJS 管条件化读取与路由；两者互不冒充，也不创作呈现正文。

## 进入条件

- 用户已选择进入本阶段，或 AI 在覆盖该路线的明确授权内决定进入并已报告理由；也可以因为既有 MVU/EJS 实现需要修改、审查、禁用或迁移而进入。
- 世界观与角色盘点阶段已经完成；角色盘点可以明确得到零固定角色，不能因此阻塞本阶段。
- 系统或场景若启用，其稳定 ID、变量含义和事件已经锁定。
- 已知目标运行环境；未知时可在本阶段询问版本与可用能力，但不得假定扩展已安装。

路线选择只表达“本项目是否需要本阶段工作”，无需预先把任一 feature 锁定为 `true`。新建项目可在进入时暂时保持模板默认的两个 `false`，然后在本阶段首轮选择并锁定 MVU、EJS 或两者。

若前一阶段已经选择跳过，不要激活或读取本阶段来补问能力组合：

- 新建且没有既有实现：保持两个 feature 为 `false`，把 `stages.mvu_ejs.status` 记为 `skipped` 并记录简短理由，直接进入 `narrative_opening`；不要生成禁用片段、依赖说明或本阶段总汇。
- 续作、转换、修改或审查已有项目：本轮跳过只表示不改该层，必须保留既有 feature、源码与依赖，并继续验证实际交付物；既有阶段已 `complete` 时保持原状态，否则以 `skipped` 摘要说明保留情况。
- 用户要求关闭或移除既有能力：这不是跳过。进入本阶段，制定迁移与清理方案，更新引用和依赖，验证无残留后再完成。

若已进入后用户撤回运行时需求，且项目没有任何既有实现需要清理，按新建跳过分支结束，不生成本阶段产物。AI 完全放权时也遵守同一分支，只是不再逐项询问，而是报告决定和理由后锁定。

## 本阶段边界

### 允许询问

- 在已确认进入本阶段的前提下，启用 MVU、EJS 或两者中的哪种组合。
- 目标运行时、`storage.scope`、snapshot 选择、merge policy、变量更新模式与宿主依赖。
- 已有语义字段映射到哪些稳定运行时路径。
- 版本化 `protocol` 的 envelope、path syntax、operations、atomicity、precondition、revision guard 与 error policy。
- 默认初始化、具名 profiles、opening bindings、writer、reader、renderer、清理和迁移。
- EJS 条目显隐、段落分支、动态文本、默认值与失败回退。
- plot/update 模型分别接收哪些条目，以及共享内容的成本。
- 是否需要 Tavern Helper 等宿主适配器；需要时只定义 adapter ID、版本、交付类别、entrypoint、readiness probe、超时和回退契约。

### 禁止询问

- 不在此阶段发明新的好感轴、经济规则或剧情判定公式。
- 不询问角色动机、说话方式、世界历史或场景美术。
- 不询问状态栏配色、组件布局或开场白文风。
- 不创作 `prose`、`chat`、`galgame` 等呈现正文，也不决定媒体文件或世界书激活参数。
- 不把自定义叙事推理提示词当作 MVU 更新规则。

缺少语义字段时返回 `systems` 或原字段所属阶段；缺少运行时事实时标记为待验证，不用猜测填满。

## 多轮工作循环

每轮集中一个技术层面，并提供推荐：

```markdown
### 本轮目标：storage、协议与字段所有权
| 问题 | 方向 | 影响 | 推荐 |
|---|---|---|---|
| 状态快照属于哪里？ | message / chat / character | 影响存档隔离、覆盖顺序和迁移 | 默认 message；确有跨消息合并需求再扩大 scope |
| 变量由谁写入？ | 剧情模型 / 独立更新模型 / 确定性脚本 | 影响提示词路由与竞争写入风险 | 公式派生值推荐脚本独占 |
| 开场如何初始化？ | 共用 profile / 具名差异 profile | 影响开场一致性与迁移 | 逐开场核对地点、时间、在途状态和既定事实；只有完整状态确实相同才共用 profile |
| 更新在哪次请求完成？ | 同轮生成 / 独立更新请求 | 影响调用链、失败处理和可验证性 | 当前 Forge 只实现 `same_generation`；没有完整独立请求链时不得选择后者 |
```

收到选择后给出本轮片段：

<!-- validate: mvu.schema.json -->
```yaml
schema_version: 1.1.0
status: locked
mvu:
  enabled: true
  implementation: "内嵌同轮状态更新契约"
  update_mode: same_generation
  output_dialect: mvu_json_patch
  storage:
    scope: message
    namespace: stat_data
    snapshot_selector: current_message
    merge_policy: message_over_chat
  protocol:
    id: mvu_json_patch
    version: 1.0.0
    envelope: UpdateVariable
    path_syntax: json_pointer
    operations: [replace, delta, insert, remove, move]
    atomicity: batch
    precondition: validate_before_commit
    revision_guard: if_present
    error_policy: reject_batch
  variables:
    - source_path: relationship.trust
      runtime_path: stat_data.relationship.trust
      type: integer
      default: 10
      constraints:
        minimum: 0
        maximum: 100
      writer:
        kind: update_model
        id: relationship_update
        operations: [set, add, subtract]
      readers: [plot_model, update_model, ejs, status_ui]
      renderer: status_ui.relationship_trust
      cleanup: retain
      migration: clamp_to_current_range
      visibility: player
  initialization:
    defaults:
      relationship:
        trust: 10
    opening_overrides: []
    profiles:
      - id: default
        extends: null
        strategy: complete_replace
        values:
          relationship:
            trust: 10
    opening_bindings:
      - opening_ref: opening:default
        profile_ref: mvu_init:default
        strategy: complete_replace
  update_rules:
    - id: trust_after_kept_promise
      trigger: "用户兑现对列车长作出的明确承诺。"
      writer_id: relationship_update
      reads: [relationship.trust]
      writes:
        - source_path: relationship.trust
          operation: add
          value: 5
      failure: "保留原值并记录本次更新未执行。"
  routing:
    entries:
      - id: relationship_state_route
        source_ref: "relationship.trust"
        recipient: shared
        reason: "剧情模型需要读取，更新模型拥有写入权。"
ejs:
  enabled: true
  entries:
    - id: low_trust_dialogue
      source_ref: "character:conductor"
      complexity: section_branch
      engine: st_prompt_template
      placement: after
      insertion_order: 120
      condition:
        runtime_path: stat_data.relationship.trust
        operator: lt
        value: 30
      reads: [stat_data.relationship.trust]
      target: both
      branches:
        when_true: "使用低信任版本的既有对话段。"
        when_false: "使用普通版本的既有对话段。"
        fallback: "使用不依赖信任值的中性对话段。"
      missing_dependency: omit_dynamic
runtime_contract:
  adapter:
    id: tavern_helper
    version: 1.0.0
    delivery: embedded
    entrypoint: rp_card_studio_runtime_guard
    load_order: 20
    readiness_probe: globalThis.Mvu
    timeout_ms: 10000
    fallback: "MVU 不可用时保留上一份合法状态，明确报告运行时未就绪。"
  dependencies:
    - id: tavern_helper
      class: host_required
      delivery: "SillyTavern Tavern Helper 4.9.1"
      version: 4.9.1
      load_order: 10
      readiness_probe: globalThis.waitGlobalInitialized
      timeout_ms: 10000
      fallback: "依赖缺失时不启动 MVU，保留纯文本叙事。"
    - id: st_prompt_template
      class: host_required
      delivery: "SillyTavern ST-Prompt-Template 1.17.6.8"
      version: 1.17.6.8
      readiness_probe: globalThis.EjsTemplate
      timeout_ms: 10000
      fallback: "EJS 不可用时省略动态条目，保留静态正文。"
  assumptions:
    - "每轮最多只有一个 writer 提交 relationship.trust 的更新。"
  fallbacks:
    - "状态更新不可用时保留上一轮合法值，并继续生成叙事。"
```

MVU 引擎与变量结构注册器不要求创作代理手写进 `dependencies`。Forge 会从内建白名单生成固定版本脚本；项目只需登记 Tavern Helper 等宿主依赖和实际启用的 EJS 依赖。这样可避免把 MVU 错标为 `embedded` 却漏掉引擎，或让项目自行选择漂移 URL。

片段后报告已锁定决定、字段生命周期缺口、运行时假设和下一批本阶段问题。用户完全放权时，先一次性列出选择与理由，再锁定授权范围内的全部决定，之后不重复询问。

当前 Forge 生成并验证的 MVU 更新链只有 `same_generation`：同一次助手生成同时输出叙事、合法变量更新块与适用的状态栏占位符，宿主从这条原始消息解析并提交更新。`writer.kind: update_model` 只是字段所有权名称，不代表已经发起第二次模型请求。

`extra_pass` 与 `both` 只作为既有项目的待迁移值识别。项目只有在实际交付了独立请求触发、提示词/接收者路由、响应解析、协议校验、原子提交、失败回退和真实宿主测试整条链时，才能启用这两个值；当前实现缺少这条链，构建必须阻断，不能把一个可被手工调用的解析或提交辅助函数当成自动 extra pass。

## 建议的问题批次

1. 能力与开关：MVU/EJS 组合、运行时实现、版本和依赖。
2. Storage：scope、namespace、snapshot selector 与明确的 merge policy。
3. 字段账本：路径、类型、默认值、唯一 writer、reader、renderer、清理与迁移。
4. 初始化：共享默认、具名 profiles、opening bindings、继承、旧存档升级和失败策略。
5. 更新协议：协议 ID/版本、envelope、路径语法、操作、原子性、前置条件、修订保护与错误策略。
6. 状态机映射：把 `system.yaml.state_machines` 映射为运行时字段、guard、effects 与失败回退，不改变业务语义。
7. EJS 设计：条目显隐、段落控制、动态文本、默认值和完整分支。
8. Adapter 与降级：宿主适配器契约、plot/update/shared 接收表、依赖缺失和脚本失败时的行为。

## 实现约束

- 一个变量只有一个 writer；脚本派生值不得同时交给模型修改。
- 启用 MVU 后，Forge 必须随卡生成并按稳定 ID 排序三条 Tavern Helper 角色脚本：固定版本 MVU 引擎、由变量账本生成的 Zod 结构注册、运行守卫。仅有守卫或仅有离线 `runtime-state.schema.json` 都是不完整实现。
- 运行时结构脚本必须调用 `registerMvuSchema(Schema)`，覆盖每条声明变量路径并保留类型、枚举、范围、正则和集合上限等可表达约束。必须在守卫前执行，并使用固定版本 URL；禁止 `main`、`latest` 或未登记地址。
- 模型提示词必须同时包含 D1/D0 的“变量列表（当前状态）”、变量更新规则和回复输出格式。变量列表使用 `{{format_message_variable::stat_data}}` 发送最新快照；离线 Schema 不能代替这三项中的任何一项。
- `source_path` 是语义路径，`runtime_path` 是运行时路径，两者通过显式映射连接。
- `storage` 必须声明单一可信 scope；跨 scope 读取只有在 `merge_policy` 明确时允许，不能依赖宿主的隐式覆盖顺序。
- `protocol.id + protocol.version` 构成稳定协议身份。新项目使用结构化、可校验的协议；`output_dialect` 仅作为兼容摘要，不能替代 `protocol`。
- 当前实现的 `update_mode` 必须是 `same_generation`；同一条原始助手消息中的更新块由 MVU 自动解析。发现 `extra_pass` 或 `both` 时先检查是否存在并通过独立请求全链路证据，没有就阻断，不能静默降级或虚构一次额外调用。
- 纯 EJS 读取必须有与类型一致的默认值；MVU 联动读取必须有可证明的初始化先序和明确 `branches.fallback`，不得用默认值掩盖缺失快照或路径。
- 每个 profile 有稳定 ID；`opening_bindings` 只引用已存在 opening 与 profile，继承不得成环。开场 `<initvar>` 是对世界书 `[initvar]` 的完整替代，不执行 merge；每个 `strategy` 固定为 `complete_replace`，替代后的完整状态必须通过运行时 Schema。
- 每条开场必须解析为一份完整合法状态。跨场景共用 profile 前逐项核对地点、时间、在途状态和 `established_facts`；不一致时拆分 profile 或使用 opening override。非空变量默认对象/数组不得被初始化中的空容器无意覆盖。
- EJS 的 `truthy`/`falsy` 对集合使用内容语义：空数组和空对象为假，非空集合为真；其他值才使用普通 JavaScript truthiness。
- EJS 条件只读取已登记字段并覆盖所有分支。纯 EJS 通过 `getvar(runtime_path, { defaults })` 读取；MVU 联动当前只允许 `message/stat_data/current|latest message`，有界等待 `Mvu` 后读取快照。`current_message` 的 render 条目使用 ST-Prompt-Template 提供的数字 `message_id`；generate 上下文没有楼层号时明确降级到 latest。宿主、namespace 或路径缺失时进入 `branches.fallback`。
- 条目路由与条目激活是两个维度；路由不能替代关键词、深度、顺序等激活规则。
- 未确认的宿主能力进入 `runtime_contract.assumptions`，不得写成已经验证。
- Tavern Helper 是 MVU 角色脚本的宿主依赖；adapter 契约仍在本阶段锁定，实际入口装配和碰撞扫描留到 `integration`。Forge 只允许其内建白名单中的固定版本 MVU 与 Schema 注册器 URL，项目源码不得临时追加未登记远程运行脚本。
- 真实验收分别记录角色主世界书、局部正则授权、Tavern Helper 角色脚本、酒馆助手宏和 MVU 启动观察。Blob URL 渲染不是通用前置条件；仅当宿主观察到 MVU 未启动且该选项开启时，推荐关闭、刷新并重新观察。
- EJS 使用 ST-Prompt-Template 时确认插件已启用；`getwi` 会绕过 SillyTavern 原生世界书激活与预算，`activewi` 进入原生激活，`@@preprocessing` 仅在满足宿主版本要求时使用。不得把三者当作等价入口。
- 每条实际开场的完整 `<initvar>...</initvar>` 块保留在原始消息供 MVU 初始化；整合时必须生成分别作用于送模副本和玩家显示副本的隐藏正则。两条规则都不得吞掉未闭合块或改写原始记录。
- NSFW 已启用时，只映射前序阶段已锁定的相关字段，不再询问偏好或边界；关闭时不得生成相关字段、条件或依赖。始终服从平台硬约束。

## 完成门槛

- MVU 与 EJS 开关有明确值，禁用项不残留配置。
- 每个变量完成默认值、writer、reader、renderer/无渲染理由、清理和迁移登记。
- 默认初始化与每个开场覆盖都符合字段类型和约束。
- 每个开场的初始化与其场景、地点、时间、在途状态和既定事实一致；没有用空容器覆盖非空变量默认值。
- profiles、opening bindings 和继承图可解析，且每个开场合并后的状态合法。
- 所有更新操作属于锁定的协议版本，更新边界、原子性、修订保护和失败行为已定义。
- `update_mode` 与真实请求链一致；当前项目使用 `same_generation`，或对尚无独立请求链的 `extra_pass`/`both` 给出 blocker。
- 已启用的变量账本能确定性生成 `reports/runtime-state.schema.json`；跳过本阶段且没有既有实现时不生成该报告。
- 构建产物包含顺序正确的 MVU 引擎、变量结构和守卫脚本，以及变量列表、更新规则和输出格式三类 CharacterBook 条目。
- 每个业务状态机映射保持原状态、转换与后果，不新增或改写系统语义。
- 所有 EJS 读取路径存在；纯 EJS 条件具备类型匹配的默认值，MVU 联动条件具备安全 fallback，且两者都有完整分支。
- plot、update、shared 三类接收者有清单，无模糊双写。
- 依赖被分类为内置、随卡嵌入、宿主必需或远程加载，并写明交付方式。
- 需要 adapter 时其 ID、版本、entrypoint、readiness probe、timeout 和 fallback 完整；实际文件仍标记为待整合，不能提前声称可运行。
- 静态检查通过；真实运行时尚未执行时明确标记 `not_run`。

## 阶段总汇

除通用阶段总汇外，必须包含：能力矩阵、storage 契约、字段生命周期账本、profiles 与 opening bindings、协议版本、状态机映射、更新路由表、EJS 条件清单、adapter/依赖与降级表、`runtime-state.schema.json` 生成状态和尚未获得的运行时证据。

## 下一阶段方向

- 推荐进入 `narrative_opening`，用已锁定初始化状态检查每条开场白的一致性。
- 若字段缺少语义来源，推荐返回 `systems`；若条件内容缺少场景事实，推荐返回 `scenes`。
- 不在下一阶段继续改变变量结构；结构变更必须重新打开本阶段并传播修改。
