# 阶段授权、决定来源与交接合同

本合同由主入口、阶段循环、访谈和续接模块共同执行。它是跨宿主的协作规则，不是宿主 hook，不声称能强制终止任意模型。禁止用账本制造用户授权。

## 一个事实源，四种不同状态

全部路由阶段记录在 authority.md 的“阶段账本”JSON 块中，格式见 assets/templates/continuation/authority.md；不增加新的项目状态文件。stages 记录阶段进度、启用状态和用户审阅；userEvidence 记录真实用户依据；authorizations 记录范围内代定；decisions 记录决定来源。当前授权、已完成阶段、NEXT 和对话画板是派生视图，不得作为第二份授权权威。

- enabled：enabled / unresolved / disabled。“未到”不是关闭，“启用待定”不是拒绝。
- progress：not_started / in_progress / awaiting_handoff / closed / blocked / deferred / skipped。
- review：not_reviewed / pending / accepted / rejected / evidence_missing。
- authorizations.status：active / expired / revoked。进入阶段的执行许可 entryEvidence 与“可代定哪些选择”的放权授权不同。

所有阶段都列出，包括 continuation。preflight 和 continuation 是预检/状态核对，可在任务已有工作目录时进行必要行政工作，不因此获得后续创作权；不要要求用户为每次读账本、语法检查或一个文件操作另行授权。每个实质创作阶段结束必须交接。相关静态 QA 可以在当前阶段做；新增玩法、改变体验载体、重做其他阶段或最终打包不属于顺手技术检查。

## 用户依据不能由模型凭空产生

只保留会影响授权的最小原话片段和定位，不保存完整聊天。消息 ID 不可用时用会话标题/轮次/消息时间与精确原话定位；不能伪造 ID，也不能把 Agent 的总结写成用户原话。跨宿主看不到原消息时标记依据待核对，保留草稿，暂停依赖它的决定/阶段提升；不要为了补齐字段猜一个引用。

每条 userEvidence 包含：id、role=user、locator、quote、stage、action、targets。action 是 start / delegate / confirm / accept / reject / skip；同一用户消息有两种明确含义时可记录两个不同 id，但同样的“继续”不能被多次消费成后续流水线授权。

- start：进入一个已说明的阶段；targets 包含阶段 id。
- delegate：在一个阶段内代定；targets 包含阶段 id 和相应 AUTH id。
- confirm：确认具体决定；targets 包含 DEC/CAP id。
- accept：接受已展示的阶段成果；targets 包含交接 id，并以 responseTo 指向该交接。
- reject：否决内容或撤回授权。同步恢复受影响阶段、决定与验收状态。
- skip：明确不做某阶段；不能以沉默代替。跳过记录 reasonType=user_choice、skipEvidence 指向该用户依据；明确不适用则 reasonType=not_applicable、enabled=disabled 并给出 reason，未回答能力不能填不适用。

一个“继续”在阶段尚未完时，只推进本阶段已确定范围；阶段报告已清楚展示成果和相邻下一阶段时，新的“继续”可以表示接受该交接并开启那个明确阶段，不接受未展示的新方案，不默许未回答承重问题，不授权更后面的阶段。没有完整交接就不解释为接受。用户明确否决/局部修正时，不把同一句中的“继续”反过来记为全盘接受。

## 放权有范围、有到期，不等于逐项确认

每条 authorizations 包含 id、stage、mode（stage_delegation/scoped_delegation）、userEvidence、scope、exclusions、expires=stage_handoff、status。scope 用有实际语义的短项，例如“已确认世界内的角色细化”；不是“全部”“随便”这样能被随意扩张的口号。不要擅自给授权添加用户没说过的范围。

decisions.sourceKind 必须是 user_confirmed / delegated / proposed / material_fact / unresolved / rejected：

- user_confirmed 必须引用该决定的 confirm 用户依据，阶段放权不能代替逐项确认。
- delegated 引用 AUTH id，阶段必须一致，scope 必须属于授权范围；历史合法代定在授权交接到期后仍可保留为代定，不能用过期授权产生新的决定。
- material_fact 有 materialSource 定位；原作事实不是用户确认，也不自动授权改造方案。
- proposed / unresolved 不能进入已确认事实，不能关闭承重项；非阻断增强标 blocking=false 并交接时展示。
- rejected 保留历史但移除生效引用；原依据可留在 previousSource 供审计，不再用于推进。

引用相同 scope 字符串只能证明结构声明一致，不能证明文本语义真的属于范围；必须回读原话、原材料和实际变更。对“本阶段放权”，范围内的创作选择自主完成，不重复追问每个细节；越出阶段、推翻已确认承重事实或改变玩家操作流程时先说明影响并停下。

## 制作完成不等于用户接受

内容足以支持下游 → 展示成果和阶段报告 → progress=awaiting_handoff、review=pending → 本阶段 active 授权改 expired → 更新 NEXT/画板 → 结束本轮。

handoff 记录 id、报告 locator、实际 artifacts。阶段报告在对话展示，不另生成报告文件；交接记录仅保存最小指针，不复制完整访谈。

报告必须显示：成果、原要求对应、用户确认/材料事实/代定/提案分别是什么、重要新增/删除/载体或流程变化、草稿和验证限制、未决问题、拟议下一阶段。不得仅写“文件已生成”“测试全绿”。

只有新的实际用户接受依据才能使 review=accepted、progress=closed。未展示成果、仍有未解决承重决定或用户已否决时不得关闭；“已关闭”也不代表用户逐项确认所有代定选择，更不代表真实宿主验收通过。下一阶段要有新的 entryEvidence；NEXT 的“下一道门”和 routing.next 都只描述建议顺序，不授予执行权。闭合前的技术检查不要求额外停顿；禁止同一轮跨实质创作阶段自行问答并自动交付。

## 否决、冲突与旧账本

用户否决 → 保留旧内容为草稿/历史 → 撤销或重开受影响决定和授权 → 对应 review=rejected/evidence_missing、progress=blocked 或 in_progress → 使依赖旧内容的验收证据失效 → 等待/执行新消息明确的范围。不得删除否决依据或继续把被拒绝制品记为已接受。

authority/v1、next/v1 不静默当作有授权的 v2。校验返回 migrationRequired；只在用户要求继续项目时就地迁移，先保留旧文件副本，再对照现有源和能核对的用户消息填写全部阶段。不复制旧勾选为用户接受；依据不足的完成/确认保留为草稿，并标 blocked/evidence_missing。原材料和制品不因迁移删除，不要求用户重答已有真实依据的设置。

## 校验与边界

每次续接、授权/决定改变、阶段交接和提升前运行：

    node scripts/continuation/continuation.mjs validate --root <项目目录>
    node scripts/continuation/continuation.mjs board --root <项目目录>

没有 Node/终端时按同一字段与引用合同人工检查，并写“结构校验工具未运行”，不得假装执行。校验失败先停下相关制作/提升，不忽略错误继续打包。格式通过只表示结构和引用一致；sourceAuthenticity=not_verified，不能声称用户消息已经独立验证，不能声称模型无法绕过。

防线是：每轮回读真实依据、完整阶段账本、逐条引用校验、阶段报告与实际交回用户。宿主钩子可另作增强，本轮不绑定 Claude Code、Codex、DeepSeek Harness、OpenCode 或 OpenClaw 的私有 API。

已确认事实/能力摘要若展示决定，必须逐字派生为 `- [DEC-001] delegated：决定正文`（来源类型按真实记录替换），不能借一个有效 ID 添加新的确认。`validate.executionAllowed` 只表示当前结构是否允许继续本阶段；不验证来源真实性，不拦截宿主工具。

## 机械门禁：路由、短回复和真实交付状态

本合同不能只靠模型记忆。每个实质阶段开始前，必须从 `orchestrator/routing.yaml` 生成项目 `.rp-card/route-lock.json`，锁定当前阶段的 primary Skill、全部 supporting Skill、路由文件和合同文件哈希：

```text
node scripts/continuation/continuation.mjs route-lock --root <项目目录> --stage <阶段ID>
node scripts/continuation/continuation.mjs route-verify --root <项目目录> --stage <阶段ID>
```

`route-verify` 失败时，不得写入 RP 制品、修改阶段授权、提交交接或声称阶段完成。不能用“我已经读过”“我看过相关 Skill”替代锁定和哈希校验。

阶段账本的状态变更必须通过确定性的转换器完成：`scripts/continuation/ledger-transition.mjs`。它只接受带 `origin=conversation` 的真实用户依据，负责拒绝短回复伪授权、提交交接时使授权到期、接受交接时只关闭当前阶段，不自动启动下一阶段。直接用任意脚本拼接 `authority.md` 不是合法的状态变更路径。
项目文件变更使用同一转换器的 CLI：

```text
node scripts/continuation/continuation.mjs ledger-event --root <项目目录> --event start|handoff|accept --stage <阶段ID> [--evidence-file <JSON> --handoff-file <JSON> --handoff-id <ID>]
```

不再允许 Agent 用临时脚本直接改写 authority/NEXT 的阶段状态。

短回复的确定性边界：

- 单独的“继续”“继续吧”“继续进行”“接着来”只能继续当前未完成范围；不能接受交接、关闭阶段、授权下一阶段或生成新的 userEvidence。
- 接受交接必须包含明确的接受/确认语义，并以 `responseTo` 指向本轮展示的 handoff；仅有“继续”不满足条件。
- “按推荐”“你定”只授权访谈控制器已经明确列出的范围；不能扩大为整阶段或下一阶段放权。
- 没有明确授权时，阶段状态只能保持 `awaiting_handoff`/`pending`，不能由 Agent 自行改为 `accepted`/`closed`。

`authority.md` 的 `driver-accepted` 是最终交付状态，不得只靠阶段关闭或静态测试生成；它必须同时满足 `acceptance.json.summary.real-sillytavern=passed`、`human=passed`、`release=passed`。校验器会拒绝缺少任一项的最终状态。

交付状态必须分开记录：创作内容、静态检查、真实宿主运行、用户验收。`runtime: not_run`、`unknown` 或 `failed` 时，禁止使用“已修复”“可直接导入”“最终完成”等运行交付措辞。

路由锁只证明当前合同文件已按路由读取并且未变化；它不证明用户来源真实性，也不替代真实宿主 QA。
