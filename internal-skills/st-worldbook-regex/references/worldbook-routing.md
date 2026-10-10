# 世界书位置、激活与请求分区

只规定世界书调度，不替代世界、角色、场景或系统创作。完整 canonical 内容保持原文；调度合同保存在制作文件/项目记录，不进入 RP 正文。不要保留失败会话、旧路线或事故故事。分类依据当前源内容的职责，不从样品名称、条目标题或某次项目的数量倒推。

## 三件事分开

- 激活：constant、关键词、向量、主动激活、禁用或 getwi 按名读取，决定这一轮是否参与。
- 插入位置 position：0 角色定义前、1 角色定义后、2/3 作者注释前后、4 聊天内按深度插入、5/6 示例消息前后、7 outlet。
- 只有 position=4 的 depth/role 决定聊天内位置与 system(0)/user(1)/assistant(2) 身份。系统身份不等于记录之外；depth 改到 3、4、10 也仍是 Chat History。其它位置保存一个 depth 字段不表示它生效。

这是目标 SillyTavern 源码中实际枚举与转换规则；目标版本改变时核对 st-api-reference，不凭 UI 名字或旧教程猜值。Before/After 在当前预设中的实际槽位及其是否启用仍须实机看组装结果。

## 按职责选择默认位置

| purpose | 用途 | 常规默认 |
|---|---|---|
| world_background | 世界基础、固定事实、历史、常识 | 角色定义前 |
| character_profile | 人物、势力及生活资料 | 角色定义后，通常按需激活 |
| scene_reference | 地点、权限、场景资料 | 角色定义后，通常按需激活 |
| stable_rules | 长期玩法、叙事和裁决规则 | 角色定义前或后；不当作本轮状态 |
| user_profile | 用户维护的静态资料 | 角色定义前或后；未接入可禁用 |
| current_state | 已定义的当前状态投影 | 聊天内 D0/D1 |
| turn_instruction | 本轮更新、输出、提醒合同 | 合适的背景槽或经核对的聊天深度 |
| immediate_event | 短期事件和即时提醒 | 依据触发边界选择位置，不永久无条件常驻 |
| initialization | 初始化数据 | 按 MVU 初始化策略处理，禁用不等于初始化失败 |
| template_source | 只供模板按名读取的资料 | 普通扫描禁用，明确调用者，不以静态槽位冒充动态调用 |

默认不是硬塞另一种版式。稳定资料可以在 0/1 之间按项目安排；只含变量/更新合同的世界书可以全部在聊天内。确需将稳定资料放入聊天、示例、作者注释或 outlet 时，声明具体用途和例外依据。不能把世界史/角色档案改标“当前状态”或“本轮提醒”躲检查。

技术位置通常由 Agent 核对后决定，不把 API、枚举和深度设计推给用户。用户需要决定的是实际体验与内容职责；改变高影响用途才回相应阶段。只有用户确实明确指定了特殊位置，才记录为 user_decision，整阶段放权不自动等于逐项确认。

## 生成器必须接收策略

共用 `scripts/worldbook/routing.mjs` 提供 `placementForPurpose` 和 `createRoutedEntry`。每条或每组由真实职责输入 policy；不得在公共 entry() 函数里对所有条目写死 position=4，只让调用者改 depth。

无损 YAML 工具支持 `--routing <按切片键名定义的策略.json>`，有明确 mapping 时漏掉某一切片会失败；关键词可由策略提供，不能自动用通用标题替代实际触发词。不传策略的输出只是保守的切片草稿，仍需补齐职责/激活合同才可最终交付。修改位置不改 content；修源码与策略，再重建实际导入文件，不只手修一个会被覆盖的导出件。

## 唯一调度合同

`production.worldbook.routingContract` 指向制作文件/项目记录中的一份合同。模板位于 assets/templates/production/worldbook-routing.json。每个实际世界书必须被覆盖，包括明确兼容旧卡时的 CharacterBook；不是另建授权账本。

```json
{
  "schema": "rp-card-studio/worldbook-routing/v1",
  "versionPin": "已核对的 SillyTavern 目标版本或源码定位",
  "fixtures": "制作文件/检查/worldbook-routing.fixtures.json",
  "books": [{
    "id": "main", "artifact": "作品.世界书.json",
    "policies": {
      "world": {"purpose":"world_background", "activation":"constant", "placement":{"position":0}},
      "npc": {"purpose":"character_profile", "activation":"keyword", "placement":{"position":1}},
      "state": {"purpose":"current_state", "activation":"constant", "placement":{"position":4,"depth":0,"role":0}}
    },
    "assignments": [
      {"entryId":0,"policy":"world"}, {"entryId":1,"policy":"npc"}, {"entryId":2,"policy":"state"}
    ],
    "runtime": {"status":"not_run"}
  }]
}
```

例子的 ID、字段、数量和文件名仅演示结构。artifact 路径相对导入包，并须属于当前单一路线；独立世界书默认 entriesPointer:/entries，旧卡内嵌可明确 /data/character_book/entries。内嵌条目的 extensions.position/depth/role 优先按宿主转换读取，不能被 before_char/after_char 的兼容标签误导。

每个实际 uid 恰好分配一次；不能漏条目、引用不存在条目或只验代表项。strategy 与最终文件的 position、有效 depth/role、activation 逐项核对；关键词策略必须有实际关键词，不能被 constant:true 偷偷改成常驻。pull/external 还要 consumer；getwi 资料不得同时由原生扫描重复注入。

稳定资料的非常规位置声明 exception：

- kind:user_decision，引用 authority 当前明确确认的决定 id/textSha256；撤回、更正或代定不能冒充确认；
- kind:host_contract，reason 加 evidence:{path,sha256}，引用真实可读的宿主合同或捕获；文件变化使依据失效，不接受只有 approved:true。

依据摘要只证明文件一致，不证明其真实来源或技术理由正确；须回读资料与当前宿主。正文默认 rendering:literal；若有宏/EJS/WORLD_INFO 正则变换，使用 rendering:host_transform 和 renderContract:{path,sha256}，不能用一个变换标签掩盖普通正文根本没进入请求。

## 分区回放不是实机验收

fixtures 使用 schema:rp-card-studio/worldbook-routing-fixtures/v1，每项有 id、bookId、activatedEntryIds 与 expected 数组。例如：

```json
{
  "id":"world-npc-state", "bookId":"main", "activatedEntryIds":[0,1,2],
  "expected":[
    {"entryId":"0","area":"worldInfoBefore"},
    {"entryId":"1","area":"worldInfoAfter"},
    {"entryId":"2","area":"chatHistory","depth":0,"role":0}
  ]
}
```

完整夹具文件要有 fixtures 数组。每个参与原生插入的启用条目都有回放覆盖，按名资料/禁用初态不虚构成激活。area 还支持 authorNoteBefore/authorNoteAfter/exampleBefore/exampleAfter/outlet，outlet 附 outletName。

该工具只验证给定激活结果走哪一区，不模拟关键词扫描、递归、概率、EJS/宏执行、预设槽位启用、同区排序或 token 预算。输出明确 runtime:not_run。报告的启用数量、常驻数量和分区统计不是“所有条目每轮都注入”，字符数也不是 token 数。

```text
node scripts/worldbook/worldbook-check.mjs --root <项目> --contract 制作文件/项目记录/worldbook-routing.json
```

输出完整 JSON，失败非零退出，可接入统一 check-plan。最终 production --final 始终核对实际导入包中的所有世界书，不因当前阶段已离开世界/MVU 而省略。本体制品检查可附 --worldbook-routing；需要 JSON 供检查器读取时加 --json。

## 真实提示词验收

有运行机会时，在实际激活、当前预设与目标版本下检查：

1. 稳定背景和条件角色是否到了预期 Before/After，槽位是否被禁用或预算截掉；
2. 当前变量与本轮合同是否处于正确的聊天深度、消息角色，最新状态是否真的呈现；
3. 即时事件、按名资料是否符合触发/调用范围，有无重复注入；
4. 真正发送或组装的文本包含什么，不把 Chat History token 全算作历史对话，不把挪位置说成减少 token。

不得静默改用户预设、全球扫描设置或 ignoreBudget，亦不得改宿主本体来掩盖交付问题。无法看到实际请求时保持 not_run，静态路由符合预期不等于实机通过。

worldbook runtime:passed 指向项目记录中的 evidenceFile，schema 为 rp-card-studio/worldbook-prompt-capture/v1；它带 level:real-sillytavern、bookId、当前 artifactSha256、相同 versionPin 和 cases。每例保存实际 Prompt Manager/待发送 messages JSON 的 promptFile/promptSha256、实际 activatedEntryIds 与 fragments。片段带 entryId、area、messageIndex、start/end、完整 renderedContent、源条目 sourceContentSha256；聊天插入还带 depth/role，outlet 带 outletName。多模态文本可带 contentIndex。

片段必须确实存在于 messages 内容中；普通原文完整匹配，源条目或请求文件变化使记录失效。每个参与原生插入的策略有实际捕获；这是位置路线的覆盖，不声称测试完所有关键词、叙事分支和预算情况。capture 来源仍须真实工具/用户证据核对，不能由 Agent 用离线夹具生成“实机通过”；provider 进一步改写消息角色的情况另行核对，不能冒充本工具已验证最终 API 网络载荷。
