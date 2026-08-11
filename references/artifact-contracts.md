# 产物契约

本文件规定项目中的事实归属、目录职责、引用方式和变更传播。创作对话可以灵活，落盘结构必须稳定，否则无法可靠地继续创作、修改旧卡或验证往返一致性。

## 1. 项目目录

```text
project-workspace/
├── project.yaml
├── .rp-card-state.json
├── src/
│   ├── world/
│   ├── positioning/
│   ├── characters/
│   ├── systems/
│   ├── scenes/
│   ├── mvu/
│   ├── prompts/
│   ├── ui/
│   ├── integration/
│   │   └── assembly.yaml
│   └── import/                 # 仅旧卡导入时存在
├── dist/
│   ├── character-card.json
│   ├── character-card.png
│   └── worldbook.json
└── reports/
    ├── build-manifest.json
    ├── runtime-state.schema.json  # 仅启用运行时状态时生成
    ├── validation.json
    └── handoff.md
```

模板位于技能的 `assets/templates/`；初始化项目时复制到对应目标位置并填入预检阶段已经锁定的值。模板文件名 `state.json` 在项目中必须写为 `.rp-card-state.json`。

## 2. 两种真源

### `project.yaml`：语义真源

它记录用户和 AI 已经作出的创作决定，包括：

- 项目标识、工作区、交付目标和固定阶段顺序。
- NSFW 启用值及其锁定来源。
- 功能开关、启用或跳过的可选阶段。
- 已锁定决定、跨阶段待办和输入材料引用。
- 源文件清单（包括 `source_manifest.assembly`）、目标运行环境与交付约束。

任何会改变“作品是什么”的决定都写入这里，随后传播到 `src/`。构建工具不能从 `.rp-card-state.json` 反向发明语义。

### `.rp-card-state.json`：技术状态真源

它记录流程与工具状态，包括：

- 当前阶段、阶段轮次、等待用户或已完成状态。
- 决定锁的哈希、授权方式和时间。
- 源文件脏标记、最近构建、验证运行和事务状态。
- 跨阶段待办的技术索引，不存放待办正文的唯一副本。

该文件由 Forge 管理。人工编辑后必须运行 `state` 与 `validate` 修复一致性。删除它不应删除创作内容，但会丢失流程进度和证据索引。

### 冲突处理

- 语义值冲突时，以 `project.yaml` 和其锁定决定为准，技术状态标记失效并要求重建。
- 阶段状态冲突时，以存在的阶段总汇、锁定哈希和验证证据共同判断，不静默宣称完成。
- `project.yaml` 已禁用某功能时，`src/` 或 `dist/` 中出现该功能配置属于阻断错误。

## 3. `src`、`dist` 与 `reports`

| 层 | 职责 | 禁止事项 |
|---|---|---|
| `src/` | 人类可维护的设定、角色、系统、场景、MVU、提示词、UI 和装配源 | 不存构建缓存，不依赖 `dist/` 反向补全 |
| `dist/` | 可导入 JSON、PNG、世界书等确定性生成物 | 不直接手改，不作为下一轮创作真源 |
| `reports/` | 构建参数、差异、验证证据、未验证项与交接说明 | 不把报告里的建议当作已锁定决定 |

构建必须从 `project.yaml + src/` 开始，先写候选目录，验证通过后再提交到 `dist/`。同一语义输入和参数应生成语义一致的产物；时间戳、绝对路径等非语义值不参与一致性比较。

## 4. ID、路径与引用

- 机器 ID、文件夹和字段路径使用稳定英文 `snake_case`；中文仅用于显示名和正文。
- ID 一旦进入产物或存档，不因显示名变化而改名。
- 引用使用 `{kind}:{id}` 或约定字段中的明确 ID，不用中文标题做隐式关联。
- 变量的语义路径使用点路径，如 `relationship.trust`；运行时路径单独登记，如 `stat_data.relationship.trust`。
- JSON Pointer 只在补丁协议层出现，不与点路径混用。
- 数组顺序有语义时保留显式 `order`；无语义对象使用稳定键排序生成。

## 5. 玩家层与 GM 层

每份世界、角色和场景源都要能区分：

- `player_visible`：可以直接进入开场、状态栏或玩家可见说明的信息。
- `gm_only`：可供叙事模型使用，但不能直接展示给玩家的真相、隐藏动机和未发现线索。
- `model_only`：运行规则、路由和写作约束，不作为世界内事实展示。

构建时按接收者投影，而不是简单把整个源文件串联。状态栏只能绑定玩家可见字段；EJS 动态显示也不能绕过可见性。若一段内容同时含公开与秘密信息，应在源中拆分，而不是依赖模型自行删减。

## 6. 字段生命周期账本

每个持久状态字段至少登记：

| 项 | 含义 |
|---|---|
| `source_path` | 语义层稳定路径 |
| `runtime_path` | 实际运行时读取路径 |
| `type` | 数据类型和容器形态 |
| `default` | 默认初始化值 |
| `constraints` | 范围、枚举、长度或结构约束 |
| `writer` | 唯一写入者及允许操作 |
| `readers` | 剧情模型、更新模型、EJS、脚本或 UI |
| `renderer` | 展示绑定；不展示时写明理由 |
| `cleanup` | 保留、归档、截断或删除策略 |
| `migration` | 旧版本缺失、改名和类型变化的处理 |
| `visibility` | `player`、`gm` 或 `model` |

字段不能只有 Schema 而无初始值，也不能只有状态栏引用而无来源。派生字段由确定性脚本计算时，模型不得成为第二 writer。

### 变更传播

- 新增：同步默认值、writer、reader、更新规则、展示和迁移。
- 改名：保留迁移别名或迁移函数，并更新初始化、EJS、开场覆盖、UI 和测试。
- 改类型/范围：验证所有默认值、条件比较、格式化和旧存档。
- 删除：先移除 writer 与 readers，再决定旧值清理；不能留下孤立路径。

## 7. 装配、媒体与运行时产物

`src/integration/assembly.yaml` 是整合阶段维护的装配真源，并登记到 `project.yaml.source_manifest.assembly`。它包含两部分：

- `worldbook_manifest`：把已锁定内容引用映射为世界书条目，并在此决定 `activation`、`insertion`、条目级 `scan_depth`、`probability`、`recursion` 与失败策略。当前 SillyTavern 原生世界书固定为 `recipient: shared`、`visibility: model`，其他路由或隔离语义需要另有已验证的外部 router，Forge 默认阻断。书级扫描、预算和递归字段只保留宿主默认值；角色过滤只用于独立世界书，头像使用区分大小写且不带扩展名的 `avatar_stems`，标签使用目标实例内部且不可移植的 `tag_ids`。世界观、角色、系统和场景阶段只提供内容与稳定 ID，不提前决定这些宿主参数。
- `media_manifest`：登记媒体 ID、种类、文件或 HTTPS 地址、交付方式、消费者、可选的 `preload` 策略和失败回退；`preload` 只允许 `none | on_opening | eager | on_demand`。实际文件存在性、远程可用性、摘要与消费者引用在整合阶段验证；远程媒体不能成为无回退的唯一关键路径。

媒体清单不设置许可或来源署名字段。导入项目若已有同类未知字段，按未知字段保留规则往返保存，但技能不主动创建或询问这些字段。

启用 MVU 或等价确定性状态源时，Forge 从 `mvu.yaml` 的 storage、变量账本、初始化 profiles 与 opening bindings 生成 `reports/runtime-state.schema.json`。它是可重复生成的验证产物，不是新的语义真源；跳过 MVU/EJS 且没有既有实现时不得生成。

### MVU/EJS 与消息 UI 宿主投影

- 角色卡构建按 `assembly -> MVU -> EJS -> preserved imports -> CharacterBook binding -> Tavern Helper -> SillyTavern Regex` 的顺序投影。每一步只接收上一步的 payload，并把自己的 issues/warnings 合并到构建报告；不能用后续适配器掩盖前序契约错误。
- Forge 生成或管理的非空内嵌 CharacterBook 必须成为角色主世界书。有显式书名时最终 payload 满足 `data.extensions.world === data.character_book.name`；无名书先固化为 SillyTavern 的 `<角色名>'s Lorebook` 回退名。Forge 在恢复保留字段后建立绑定；若导入旧卡已经指向另一主世界书，则保留原值并报 `character_book.binding_conflict` blocker，等待整合阶段明确解决。SillyTavern 只会从已导入且绑定的角色主世界书或全局世界书扫描 MVU 的 `[initvar]` 条目；仅嵌入 CharacterBook 时，即使消息正则和 iframe 正常运行，开场变量仍可能完全不初始化。
- `data.extensions.world` 相等只证明“指向这个名字”，不证明卡内条目已经导入。干净宿主首次导入要确认 **Import Card Lore**；宿主已有同名书时会跳过提示并直接使用旧文件，所以真实验收还要核对目标世界书包含本制品的受管条目。
- MVU 的内嵌适配器面向 Tavern Helper 的 `Mvu` API：有界等待 `waitGlobalInitialized("Mvu")`，读取 `getMvuData(options)`，并使用宿主的解析、校验和替换能力守护状态。必须先用 `eventOn` 订阅全部 `Mvu.events.*`，再读取当前快照补做 bootstrap，避免初始化事件已经发生后永远无法 ready；清理时把原始 `(event, handler)` 交给 `eventRemoveListener`。MVU 适配器不得退回 `getVariables()`、`globalThis.MVU` 或自造 MVU 事件名；消息状态栏 iframe 使用 `getVariables()` 是另一条只读投影链，不得与这里混用。
- 当前内嵌 MVU 存储契约固定为 message 目标。`latest_message` 使用 `{ type: "message", message_id: "latest" }`；`current_message` 在宿主提供数字楼层上下文时使用该 ID，否则明确降级到 latest。初始化事件只在宿主事件对象内补缺省值，不二次调用 `replaceMvuData`；bootstrap 发现旧快照缺少默认字段时允许一次 `replaceMvuData` 持久化修复。非法更新按整批回滚。
- 当前自动更新模式固定为 `same_generation`：同一条助手原始消息携带叙事与变量更新块，由宿主解析并提交。`extra_pass` 与 `both` 必须有独立请求触发、路由、响应解析、协议校验、原子提交、失败回退和真实宿主证据；缺少完整链路就阻断。单独存在解析或提交入口不构成自动 extra-pass 实现。
- EJS 使用 SillyTavern 的 `ST-Prompt-Template 1.17.6.8` 引擎（探针 `globalThis.EjsTemplate`）。条目只投影到 `data.character_book.entries[]`，不写入 Tavern Helper scripts；宿主条目使用 `enabled: false`、`constant: true`、空 `keys`，内容首行保留连续 `@@always_enabled` 与 generate/render 装饰器。`target: both` 必须拆成 generate 与 render 两条条目。
- EJS 条件必须是结构化 `condition.runtime_path/operator/value`，并提供 `branches.when_true/when_false/fallback`。纯 EJS 使用字段账本中的类型匹配默认值调用 `getvar()`；与 MVU 联动时只接受 `message/stat_data/current|latest message` 契约，有界等待后读取 `Mvu.getMvuData()`。`current_message` 的 render 条目使用 ST-Prompt-Template 提供的数字 `message_id`；generate 条目没有楼层上下文时降级为 latest。快照或路径缺失直接进入 `branches.fallback`，不得用默认值掩盖缺失状态。缺少引擎时按 `missing_dependency` 选择省略动态条目或阻断构建。旧的字符串条件和顶层 `fallback` 不自动迁移，应报告为迁移错误。
- 状态栏只投影到 AI 消息内部，交付路径只有 SillyTavern 角色正则或 Tavern Helper 消息级 JS/iframe。内嵌 Regex 使用 `data.extensions.regex_scripts` 把 `<StatusPlaceHolderImpl/>` 替换为自包含文字或简单静态 HTML，并用 `{{get_message_variable::stat_data.path}}` 读取宿主可解析的消息变量；该契约固定为 `refresh: on_message`、`read_only: true`、`commands: []` 和非 tabs 布局。`field.missing_value` 与 `states.loading/empty/error/degraded` 在 Regex 路径中只保存设计文案，不能据此声明条件判断、最近合法值保留或自动视图切换。消息内位置也不等于历史快照隔离：当前验证的 Tavern Helper 4.9.1 在普通 DOM 宏重绘时会因缺少 `message_id` 回退到最近变量消息。
- 动态刷新、命令、tabs、条件状态或逐楼层快照必须使用 `tavern_helper_message + host_required`。角色正则把占位符替换为自包含 fenced HTML，Tavern Helper 在该条消息内创建 iframe；脚本严格验证 `getCurrentMessageId()` 是整数，然后始终调用 `getVariables({ type: "message", message_id })`。首次合法快照不能被当作本楼提交完成的信号：初次快速获取后转为默认 2 秒低频同步，只在可见值变化时重绘，暂时读取失败时保留最近合法值，并在 `pagehide`/`unload` 清理。无效 ID 进入可见错误态并停止，任何路径都绝不回退 `latest`。iframe 不访问父页面、不创建页面级节点、不加载远程 UI；只有脚本确实运行且历史重载测试通过后，才能声明对应能力通过。
- Forge 会在默认与备选开场末尾幂等追加唯一状态栏占位符，并向助手输出合同加入“每条回复末尾恰好一次”。状态栏禁用时不得残留占位符或对应角色正则。
- 启用 MVU 时，Forge 同时生成两条严格匹配完整 `<initvar>...</initvar>` 的隐藏正则，以及更新块 Prompt 过滤、流式折叠和完整更新折叠正则。初始化隐藏分别只改变送模副本和显示副本；更新 Prompt 过滤只改变送模副本，Markdown 规则只改变显示副本，原始聊天中的初始化块与更新块保持不变。所有自有正则使用稳定 UUID、非贪婪多块匹配和固定顺序，不能覆盖用户规则；未闭合的 `<initvar>` 不得被隐藏规则吞掉。
- SillyTavern 对角色内嵌正则的首次授权属于宿主安全机制。交付报告必须说明需要用户确认，技能和制品不得绕过授权。

## 8. NSFW 投影

`project.yaml` 中的 NSFW 值只在项目预检阶段由用户明确锁定。

- `enabled: false`：角色、系统、开场、MVU、EJS 和 UI 中的相关专用字段、分组、规则与占位必须完全省略。
- `enabled: true`：将前序阶段已经确认的相关内容自动融入角色和状态栏等正常结构，不另建边界问卷，也不重复询问开关。
- 无论开关如何，产物始终受平台硬约束；工具不能用配置绕过平台限制。
- GM 可见性仍独立生效，启用不等于向玩家公开所有字段。

条件结构来自 `assets/templates/nsfw/` 下的两个 mix-in。初始化或进入对应阶段时只在启用状态下合并；禁用状态不得读取、复制或生成这些键。

## 9. 旧卡导入与未知字段

- 原始输入只读，默认输出到本次工作区。
- 已识别字段规范化到 `src/`；无法解释但可保留的字段写入 `src/import/preserved.json`，附原始 JSON 路径。
- 重新构建时把保留字段合回原位置；若与新源冲突，列出差异并要求显式策略。
- 导入顺序、世界书条目 ID、扩展启用状态和未知扩展对象必须往返保留。
- 任何不可逆丢失都属于阻断错误，不能以“当前技能不使用该字段”为理由删除。

## 10. 角色卡与 PNG

- JSON 产物遵守 `character-card.schema.json`，未知扩展字段允许保留。
- JSON 字符串使用 UTF-8，保留多行文本语义，不把换行转成可见转义文本。
- PNG 内只新增或替换声明的角色卡数据块，保留原始图像数据；数据块关键字和编码写入构建清单。
- `pack -> unpack` 后的角色卡对象必须通过语义比较，不能只比较文件字节。
- 遇到损坏、重复或无法判定优先级的数据块时停止并报告，不猜测覆盖。

## 11. 依赖分类

每项依赖只能属于一种主要类别：

- `builtin`：SillyTavern 标准能力。
- `embedded`：随卡或世界书嵌入。
- `host_required`：用户必须在宿主安装并启用。
- `remote`：运行时远程加载，必须记录 URL、版本与失败回退。
- `development_only`：只用于构建或验证，不进入玩家交付说明。

构建成功不代表宿主依赖可用。依赖是否安装只能由真实运行证据确认。运行时代码和适配器默认随项目或宿主交付，不允许用未登记的远程脚本导入绕过装配清单；远程媒体仍按 `media_manifest` 单独管理。
