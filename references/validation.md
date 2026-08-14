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
- 新卡的 `positioning.card_entry` 为空、空白或仍是占位符，`data.description` 不是该已锁定成稿，或入口混入任一角色档案及其他应独立调度的模块正文。（项目定位、整合）
- 卡名与 RP 包承载类型不一致：定位为 `single_character_card` 且确实只有一个角色源码的真正单人卡没有使用唯一角色名；或世界/场景/玩法/群像/叙事者/锚点角色/多角色项目没有使用已锁定项目标题，而被误命名为某个角色或单一地点。（项目定位、整合）
- 新卡的 `data.personality`、`data.scenario`、`data.mes_example`、`data.creator_notes`、`data.system_prompt` 或 `data.post_history_instructions` 非空；导入旧卡的既有值不适用本条，但必须按保留/迁移策略处理。（角色、叙事与开场、整合）
- 默认或备选开场没有一一映射到 `data.first_mes` / `data.alternate_greetings`，顺序错误，或开场正文又被重复装入世界书。（叙事与开场、整合）
- `project.yaml.source_manifest` 中除 `positioning.card_entry` 和 openings 外的可装配源码没有被启用的 CharacterBook 条目完整覆盖，包括任一角色（含 `primary_character`）、world、system、scene、叙事规则、对白示例、MVU/EJS 合同或状态栏回复合同；具名角色被无理由混为一条。（整合）
- 注册源码的 selector 分片在制品中丢失模块类型、稳定 ID/显示名、中文条目名或 selector 身份包络，导致分片无法归属到原 RP 模块。（整合）
- 场景的媒体叙事槽位仍只存在于不透明 `extensions`、未进入场景模型投影，或丢失无媒体时的 `text_fallback`；`scene:{id}` 资产 consumer 指向未声明的 slot，或 `required: true` 槽位没有装配资产。（场景、整合）
- 以角色卡制品为部署目标的 RP 项目在角色盘点前根据交付格式或 `data.name` 虚构人物源码；或旧项目中的解包候选在 `status: locked` 时仍保留 `role: pending`。（角色）
- 定位完成后 `positioning.project_title` 缺失、仍为占位标题，或与 `project.project.display_name` 不一致。（定位）
- 动态人物被伪造成固定角色清单，或缺少分别归属世界观、系统和叙事阶段的居民约束、连续性规则与表现合同。（世界观/系统/叙事）
- 状态栏回复合同仍写入新卡高级定义字段，而不是 MVU 回复格式条目或专用中文常驻 CharacterBook 条目。（状态栏/UI、整合）
- 世界书条目缺少任一显式宿主调度决定：中文显示名、激活模式与适用关键词、插入位置与显式深度、顺序、概率、条目级扫描深度、递归三项或失败策略；或存在常驻条目混用关键词、关键词条目无主关键词、selective/二级关键词矛盾、`at_depth` 无整数深度、名称/顺序重复、递归延迟与禁止入站同时启用等策略矛盾。（整合）
- 已启用或保留的运行时变量缺少默认值、唯一 writer、合法 reader，或类型与更新操作不符。（MVU/EJS 或等价状态源）
- 项目声称确定性状态持久化，但多轴系统没有绑定 MVU 或等价状态源中的具体路径与生命周期。（系统、运行时实现）
- 开场文字与其初始化状态冲突。（叙事与开场）
- opening 的默认呈现不存在、增强呈现缺少纯文本回退、呈现回退成环，或呈现变体改写父 opening 的事实/初始状态/钩子/玩家交接点。（叙事与开场）
- 已启用或保留的 EJS 读取不存在的字段、纯 EJS 无安全默认值、MVU 联动无明确失败回退、条件分支不完整或语法无效。（MVU/EJS）
- 状态栏字段无来源、类型不兼容或暴露非玩家字段。（状态栏/UI）
- 状态栏启用但 delivery 不是 `surface: message`，角色正则/占位符/助手输出合同缺失，或 adapter ID、entrypoint、artifact、正则 UUID 与其他运行时交付发生碰撞。（状态栏/UI、整合）
- `embedded + sillytavern_regex` 未固定为 `refresh: on_message`、`read_only: true`、`commands: []`，使用 tabs，或把条件缺失值、动态状态切换、命令、可靠逐楼层快照声明为已实现。（状态栏/UI、整合）
- 项目声称动态刷新、命令、tabs、条件缺失值、运行时状态切换或可靠逐楼层快照已经可用，却没有显式选择 `adapter: tavern_helper_message`、`level: host_required`，也没有消息自身 iframe 的真实宿主运行证据；仅选择适配器或生成 fenced HTML 不能解除此 blocker。（状态栏/UI、整合）
- `tavern_helper_message` 状态/工作区页面不是包含 CSS、主体结构和 JS 的自包含 fenced HTML，未等待 `Mvu`、未通过消息 iframe 的 `getAllVariables()` 读取截至当前楼的合并 `stat_data`，未在卸载时清理自身或宿主监听器/临时节点，或存在 latest 冒充历史快照和失控远程 UI 加载。（状态栏/UI、整合）
- 完整 `light`/`medium`/`heavy` UI 缺少 `ui_experience`、引用的主题/绑定/组件，等级能力门槛不足，以重复空面板凑数，或没有项目专属视觉概念与唯一视觉签名。（状态栏/UI、整合）
- UI 绑定引用不存在的页面或字段，`source_path -> runtime_path` 映射不闭合，读取 `stat_data` 以外的临时/私密数据，或 UI 在系统阶段未定义的情况下发明变量语义。（状态栏/UI、整合）
- 轻/中/重 UI 通过拆分大量同壳独立正则凑等级，而综合工作区缺少 4/8/12 个具有真实绑定的页内模块；或模型 block 正则没有捕获并传入当轮负载，状态页没有等待 `Mvu`/读取 `getAllVariables()`，导致只渲染空壳。（状态栏/UI、整合）
- UI 内联源码创建或恢复页面级常驻状态栏/面板，访问凭据或私密存储，使用动态代码、危险 HTML sink、失控网络/远程 UI，含 `$&`/`$1` 等 SillyTavern 替换令牌，重复绑定交互，或未移除 MVU/宿主事件监听与临时节点。（状态栏/UI、整合）
- MVU 声明 `extra_pass` 或 `both`，但没有可执行且已验证的独立请求触发、路由、响应解析、协议校验、原子提交和失败回退全链路。（MVU/EJS、整合）
- 运行时状态 Schema 与 storage、protocol、初始化 profiles、opening bindings 或字段账本不一致。（MVU/EJS、整合）
- `assembly.yaml` 未登记、世界书/媒体 consumer 引用悬空、媒体回退成环，或关键远程媒体没有可用回退。（整合）
- 独立世界书使用数组或非规范 UID 对象键，键与 `uid` 不一致，或把裸 CharacterBook 当作独立世界书导入。（整合）
- Forge 管理的角色卡投影制品含有非空内嵌 CharacterBook，但没有按显式名称或 SillyTavern 回退名建立 `data.extensions.world` 绑定；或导入旧卡已有不同主世界书却未显式解决冲突。（整合）
- 世界书使用宿主不执行的书级扫描/预算/递归值、非 `shared/model` 路由、`include` 回退，或把角色过滤写入内嵌 CharacterBook。（整合）
- 运行时代码通过未登记远程脚本加载；远程媒体不在此禁令内，但必须登记到 `media_manifest` 并提供回退。（整合）
- NSFW 未启用但产物仍含相关专用字段、分组、条件或模板占位。（所有投影）
- 存在未登记、没有对应角色正则消费的占位符，或存在空引用、构建时才发现的占位文件。（整合）
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
- 生成的数字 CharacterBook 稳定 ID 与导入条目碰撞，但 Forge 已确定性探测到另一个空闲数字 ID、完整保留导入条目且所有 source key 仍唯一。
- 真实 SillyTavern 验收尚未执行，但用户只要求源码或候选产物。

警告必须包含 `id`、影响、证据、建议和用户处置，不接受“有一些小问题”这类模糊描述。

## 4. 三类证据

### A. 离线/源文件证据 `offline`

可证明：

- 文件可解析并符合 Schema。
- ID、引用、可见性、字段生命周期和占位符符合静态契约。
- EJS/脚本通过可用的语法解析器或规则检查。
- `reports/runtime-state.schema.json` 可解析，且与 storage、protocol、字段账本、初始化 profiles 和 opening bindings 的生成输入一致。
- MVU 构建产物缺少固定版本引擎脚本、账本生成的 `registerMvuSchema` 变量结构脚本或运行守卫；三者顺序不正确；或 CharacterBook 缺少变量列表、更新规则、输出格式任一项。（MVU/EJS、整合）
- 不同场景的开场共用初始化却未证明地点、时间、在途状态和既定事实一致；初始化用空数组/对象覆盖非空变量默认值。（MVU/EJS、叙事与开场）
- 开放世界或多场景项目把所有关键词内容条目同时设为禁止入站与禁止出站递归，导致人物、地点、势力、场景和线索无法相互激活。（整合）
- 跨文件引用图、呈现回退图和媒体回退图通过静态闭环检查。
- 构建在相同语义输入下保持确定性。

不能证明：SillyTavern 实际导入成功、扩展 API 存在、聊天时变量会更新、浏览器 UI 会正确渲染。

### B. 构建产物证据 `artifact`

可证明：

- JSON 可重新解析且符合角色卡结构。
- 仅当用户明确把 PNG 加入交付清单时，PNG 可提取声明的数据负载且 JSON 与 PNG 语义一致；默认单 JSON 交付不要求或生成 PNG。
- 解包重打包保留条目、扩展、Unicode、多行文本和未知字段。
- 构建清单中的哈希、版本、输入修订与实际文件匹配。
- 生成的 adapter 与已锁定契约中的 ID、entrypoint、artifact、消息占位符和角色正则 UUID 一致且无碰撞。

不能证明：目标宿主会启用依赖、EJS 会在真实上下文按预期运行、UI 与扩展版本兼容。

### C. 真实运行时证据 `runtime`

必须来自目标 SillyTavern 或用户明确认可的等价环境，并记录版本、依赖、操作步骤和观察结果。它可以证明：

- 角色卡导入、新建聊天和所有开场分支。
- 默认与覆盖初始化、变量更新、保存后重载和旧聊天迁移。
- EJS 条目显隐、分支、回退及 plot/update 路由。
- 角色正则授权后，状态栏在默认/备选开场及后续 AI 消息内部加载。变量取值另行记录：默认宏方案允许宿主回退到最近一条带变量的消息，不得据此宣称历史楼层快照隔离。
- 启用 MVU 的角色卡投影制品在新建聊天的开场楼层立即产生预期 `stat_data`；若消息 iframe 已加载但变量为空，先核对角色主世界书绑定与 Tavern Helper 角色脚本启用状态，不能把空变量误判为状态栏渲染故障。
- 纯 Regex 项目只验证消息内投影、静态布局、原生折叠、ARIA 标记和宿主原值显示；`missing_value`、`states.*`、命令、tabs、动态刷新与逐楼层快照不得顺带标记为通过。
- Tavern Helper 消息级项目按实际实现验证完整/流式、缺失、加载、错误、依赖不可用、消息编辑/重新生成、加载历史和切换聊天；只有 iframe 脚本实际执行、`getAllVariables()` 在不同历史消息 iframe 中分别读出截至各自楼层的合并快照时才记录逐楼层快照通过。必须制造首读合法旧值、随后同楼提交新值的时序，确认新值出现，并重载历史确认旧楼没有被最新楼覆盖；读取失败不得以 latest 数据冒充成功。
- 控制台错误、网络失败与宿主依赖状态。
- iframe 元素或 Blob 内容存在不等于子文档已运行。若子 frame 没有导航、运行哨兵未出现或脚本未执行，记录 `runtime: not_run`。分别记录主世界书绑定、局部正则授权、角色脚本、宏、EJS 插件与 MVU 启动观察；只有 `mvu_started: false` 且 Blob URL 渲染开启时记录 `tavern_helper_blob_url_rendering_observed_failure`，关闭并刷新后仍需重新观察。

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
- 状态栏 UI 只绑定持久 `stat_data`。固定 `mvu_zod v0.3.449` 在更新结束后会清除 `display_data` 与 `delta_data`；依赖这两个字段的状态栏必须迁移为 `stat_data` 中的明确派生字段或变更日志，并通过运行时 Schema。
- EJS 条目使用结构化 `condition` 与完整 `branches`，`placement` 和 `insertion_order` 可确定宿主顺序；旧字符串条件或顶层 `fallback` 必须进入迁移错误，不得静默转换。
- EJS 条目声明 `st_prompt_template` 引擎及 `globalThis.EjsTemplate` 宿主依赖；生成物只出现在 CharacterBook entries，不得伪装成 Tavern Helper script。
- MVU 联动 EJS 只接受已验证的 `message/stat_data/current|latest message` storage；必须有界等待 `Mvu` 后读取匹配 selector 的 target。`current_message` 在 render 中使用宿主提供的数字 `message_id`，generate 无楼层上下文时明确降级为 latest。快照、namespace 或路径缺失时输出 `branches.fallback`，不得回退 `getvar()` 后误入真假分支。纯 EJS 才使用带账本默认值的精确 `getvar(runtime_path, { defaults })`。
- 内嵌 Tavern Helper MVU 适配器只允许已验证的 message current/latest 目标和 `Mvu.events.*` 动态事件；必须先订阅再从当前快照 bootstrap。不得使用 `getVariables()`、`globalThis.MVU` 或硬编码 MVU 事件名。
- 状态栏只有两种消息内投影：默认由 `placement: [2]`、`markdownOnly: true`、`promptOnly: false` 的角色正则替换唯一占位符；复杂交互由同类正则生成自包含 fenced HTML，再由 Tavern Helper 创建消息 iframe。`globalThis.parent`、`parent.document`、`#send_textarea`、`#send_but` 或插件 DOM 联动本身允许；只有使用 `#sheld`、`#form_sheld`、已知旧脚本指纹或等价手段创建/恢复页面级常驻状态栏/面板，或加载失控远程页面/脚本，才是 blocker。
- `embedded + sillytavern_regex` 只接受 `refresh: on_message`、`read_only: true`、空命令和非 tabs 响应式布局。任一动态刷新模式、非只读、命令或 tabs 都必须映射到 `tavern_helper_message + host_required`。
- 纯 Regex 的 `field.missing_value` 与 `states.loading/empty/error/degraded` 只是设计元数据；离线或制品检查只能确认文案存在，不能确认条件判断、最近合法值保留或视图切换。`percent` 也只允许对必有且已归一为 0..100 的上游值追加字面 `%`。
- `basic_status` 的默认角色正则使用 Tavern Helper macro-like 层提供的 `format_message_variable`；宏被宿主解析只证明当前可用值能够显示，不证明它绑定当前 DOM 楼层。当前验证的 Tavern Helper 4.9.1 在普通消息重绘时未向宏传 `message_id`，会回退到最近一条带变量的消息。完整 UI 必须改用消息 iframe，等待 `Mvu` 后通过 `getAllVariables()` 读取该 iframe 截至当前楼的合并快照，并通过“合法旧快照后出现本楼新值”、历史重载和卸载清理测试，才允许报告“逐楼层快照：通过”；严禁 latest 回退。
- 启用 MVU 时必须存在两条完整 `<initvar>...</initvar>` 隐藏规则，分别作用于 Prompt 副本和 Markdown 显示副本，原始消息保持不变；未闭合初始化块不能被吞掉。还必须存在 Prompt-only 更新块过滤规则：默认 `prompt_history.update_visibility: hide_all` / `minDepth: null`；只有明确选择 `keep_recent_updates` 时才使用 `minDepth: 4`，并记录额外 token 与注意力成本。规则需覆盖完整块、大小写变体和流式未闭合块；显示隐藏规则不得吞掉多个更新块之间的正文或末尾状态栏占位符。全部显示侧受管正则必须 `runOnEdit: true`，prompt-only 规则保持 false。状态栏必须另有 `[不发送]界面占位符` 与 `[界面]状态栏` 两条规则。
- 当前更新模式只接受 `same_generation`，并验证叙事与更新块来自同一次助手生成；启用状态栏时，后续占位符由 MVU 运行时自动追加，模型提示词不得要求模型自行输出。`extra_pass`/`both` 只有在独立请求全链路与宿主证据齐全时才允许；解析或提交辅助入口、接收者清单或手工调用记录都不能单独证明该能力。
- 新项目输出协议使用 `replace`、`delta`、`insert`、`remove`、`move`；导入兼容检查接受上游合法 `add` 作为 `insert` 别名，但生成提示词不得推荐 `add`。
- 清理和迁移规则覆盖改名、类型变化和旧存档缺失。
- `mvu.initialization.profiles[]` 的 ID 唯一，默认 profile 可解析；`mvu.initialization.opening_bindings[]` 的每个 opening/profile 引用均存在，且同一 opening 不产生歧义绑定。
- 每条实际开场都能解析到唯一初始化结果；未启用 MVU 时 `initial_state_ref` 为 `null`，也不生成伪造 profile。
- `reports/runtime-state.schema.json` 对默认 profile 与每个 opening 覆盖后的完整状态分别校验，不能只验证空骨架。
- `reports/runtime-state.schema.json` 仅是离线证据；真实卡内还必须存在运行时 Zod 注册脚本，并在日志出现“变量结构注册成功”。

### 叙事、开场与 UI

- 叙事合同保护玩家代理权，开场有可接管的行动空间。
- 开场公开文本不泄露 GM 真相，描述与初始状态一致。
- `openings[].presentations.default_variant_id` 指向同 opening 内唯一变体；所有 `fallback_variant_ref` 可解析、无环，并最终到达不依赖脚本或媒体的纯文本 `prose` 变体。
- 呈现变体只改变表达形式，不改变父 opening 的 `established_facts`、`initial_state_ref`、`immediate_change`、`hook` 或 `player_handoff`。
- 每个 `media_refs` 均在 `assembly.yaml.media_manifest` 中有同 ID 资产；该资产以父 opening 的 `opening:*` 作为 consumer ref，并在 slot 中定位呈现变体。没有媒体时回退文本仍保持父 opening 语义。
- UI 展示模型不直接修改原始状态；需要命令或 writer 的交互只能走 `tavern_helper_message + host_required`。
- 纯 Regex 项目的空值、加载、错误和依赖不可用文案只作为设计元数据检查，不要求伪造可见运行结果，也不能标记 `runtime: pass`；消息级实现承诺这些能力时才逐项验证可见结果。
- `status_ui.mode` 与 delivery 一致；所有启用模式都使用 `surface: message` 并拥有 adapter、entrypoint、artifact 和固定占位符。只有 `mode: none` 允许 `delivery: null`。
- 默认与所有备选开场各含一个占位符。启用 MVU 时，后续占位符由 MVU 自动追加且模型不得输出；未启用 MVU但启用状态栏时，后续回复合同才要求模型输出恰好一个。状态栏角色正则在自有 MVU 显示规则之后执行。
- 纯 Regex 对完整消息和已出现的更新块执行确定的消息重绘，但不声称能探测解析失败、自动选择 `states.*` 或恢复最近合法值；消息级实现只有在这些分支实测后才可声明确定行为。任何路径都不得留下跨消息或跨聊天的实例。
- `basic_status` 与完整 UI 2.0 明确区分；新建完整 UI 的首批等级决定已锁定为 `light`、`medium` 或 `heavy`，且未用源代码行数替代能力验收。
- UI 2.0 的 `experience -> theme/bindings/components` 引用闭合，组件 marker 与稳定正则 UUID 唯一，模型生产者拥有对应中文 CharacterBook 协议；重复构建保持幂等。
- 主题的颜色、字体、形状、纹理、动效和唯一签名来自项目内容而非通用模板；远程资源为空，窄屏、键盘焦点、非颜色语义、减少动画和体积预算均有明确合同。
- 每个组件的数据模式、payload 格式、binding、布局和交互相符；动态值只用安全文本/DOM 节点写入，消息 ID 严格绑定当前楼，静态交互只绑定一次，MVU listener 在卸载时释放。
- 每个完整组件都有加载、空、错误、降级与纯文本 fallback；未进行真实宿主验收时，源码和产物通过也必须保持 `runtime: not_run`。

### 装配引用图

- 从 `project.yaml.source_manifest` 出发遍历 world、character、system、scene、MVU、opening、UI 与 `assembly.yaml`；所有强引用必须到达唯一目标，删除或改名后不得遗留悬空边。
- 世界书 entry 的 source、呈现/场景/UI 的媒体 consumer、EJS reader、状态栏 source path 和 adapter 契约都进入同一份引用图报告。
- 媒体 `fallback.asset_ref` 构成的图必须无环并到达存在的资产；`skip`/`text`/`block` 为终点。
- adapter ID、entrypoint、artifact、角色正则 UUID 和占位符消费者分别去重；同一文件或同一占位符不得由两个不兼容契约生成。
- 未登记远程运行脚本一律拒绝。唯一默认例外是 Forge 内建、固定版本、受测试覆盖的 MVU 引擎与 Schema 注册器白名单；禁止 `main`、`latest` 和创作阶段临时 URL。远程媒体允许 HTTPS，但必须在 media manifest 登记 consumer、证据和失败回退。
- UI 只有设计规格而没有适用运行时交付物时，记录 `ui.runtime_missing`。当项目承诺嵌入式 UI 成品时它是 blocker；仅交付规格时是明确 warning，不能标记 `runtime: pass`。

## 7. 产物与往返检查

- `build` 前源工作区干净或已记录变更；`--dry-run` 不产生文件变化。
- 未提供显式覆盖参数时拒绝覆盖已有产物。
- 中途失败不提交候选目录，也不留下半成品状态。
- 用户明确选择的 JSON、PNG 和独立世界书制品之间共享语义相同；未选择的附加格式不生成也不验收。
- Forge 管理的角色卡投影制品内嵌 CharacterBook 含有条目时，JSON、PNG 负载和 roundtrip 候选中的 `data.extensions.world` 均严格等于固化后的非空 `data.character_book.name`；真实宿主中的同名书还包含本次构建的受管条目。
- `assembly.yaml` 与生成世界书、媒体清单和 adapter 文件语义一致；`source_manifest.assembly` 指向实际装配源。
- 独立世界书的对象键、数字 `uid` 和条目身份一致；条目级 `scan_depth` 在独立世界书映射为 `scanDepth`，在内嵌 CharacterBook 映射为 `extensions.scan_depth`，并保持 `0`、`null` 和 `1000` 的含义。
- 独立世界书角色过滤的 `avatar_stems` 不带扩展名且大小写准确；`tag_ids` 有目标实例证据，不使用显示标签名。内嵌 CharacterBook 不携带该过滤器。
- `unpack -> build -> unpack` 后对规范化对象做深比较；忽略项必须列入白名单并说明非语义原因。
- Unicode、换行、条目顺序、启用状态、扩展对象和未知字段均保留。
- PNG 图像数据保持一致；仅角色卡元数据块允许变化。

## 8. 真实运行验收建议

按实际启用和交付的能力裁剪，至少覆盖适用项：

1. 导入默认 JSON 并新建聊天；仅当用户明确选择 PNG 时再导入 PNG 做同项测试。
2. 默认开场和每个备选开场。
3. 一次无变化回合、一次合法更新、一次边界更新和一次错误输入回退。
4. EJS 条件的真、假、缺值和依赖不可用分支。
5. 保存、刷新、继续聊天与旧状态迁移。
6. 每个呈现默认变体、纯文本回退和媒体加载失败分支。
7. 纯 Regex 状态栏的桌面、窄屏、原生折叠、ARIA 标记、长文本和完整/流式显示；不适用的动态状态记录为 `not_run`。
8. Tavern Helper 消息级状态栏按已承诺能力验证缺失、加载、错误、中断、命令、tabs、消息编辑、重新生成、删除、切聊和逐楼层快照；至少制造两个状态不同楼层，并制造同楼“先合法旧值、后本楼新值”的提交时序，刷新前后核对各 iframe 的整数 ID、各自变量、持续低频复查及卸载清理。
9. 检查 iframe 子文档是否真实导航并执行脚本，而不只看元素或 Blob 是否存在；Blob URL 不导航时记录 `not_run + host_incompatible`。
10. 宿主依赖禁用与重新启用后的实际表现；没有实现的自动降级或恢复不得推定为通过。

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
