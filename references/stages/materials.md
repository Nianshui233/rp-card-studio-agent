# 材料整理阶段

本阶段把旧卡、世界书、小说、设定文档和已有工程整理成可追踪的输入。它决定“哪些材料可信、哪些内容要保留、冲突怎样排队处理”，不在这里重新创作世界或人物。

## 本阶段产物

- 材料清单与格式识别结果。
- 每份材料的用途、权威级与可修改策略。
- 已提取事实的索引及目标阶段。
- 冲突、缺损、不可解析内容和未知字段清单。
- 原件保护与后续转换策略。

所有检查默认只读。原始文件不作为直接修改目标。

## 允许问题

可以询问：

- 哪些路径属于本次输入，哪些只是参考。
- 多个版本中哪一份更新、哪一份更权威。
- 哪些名称、专有词、事件或字段必须原样保留。
- 哪些内容允许重写、压缩、拆分或废弃。
- 原文事实、作者备注、旧模型提示和机器配置之间的优先级。
- 遇到冲突时采用“指定来源优先”“较新版本优先”还是“逐项待裁决”。
- 本次需要从材料中提取哪些类型的信息。
- 旧卡未知字段是无损保留、单独归档还是明确丢弃。

## 禁止问题

不得询问：

- 世界规则应该新增什么或哪个创作方向更有趣。
- 角色应当拥有什么新动机、性格或关系发展。
- 系统变量的范围、公式、阈值或联动。
- 场景地图、线索设计或事件内容。
- MVU/EJS 的新实现方案。
- 叙事文风、开场白内容或 UI 视觉。

材料之间出现创作冲突时，本阶段只识别、归类并路由到目标阶段，不替目标阶段做创作裁决。

## 建议轮次

### 第一轮：盘点与识别

1. 只读扫描用户给出的明确路径。
2. 按角色卡、世界书、文本、工程配置、图片和未知格式分类。
3. 报告不可访问、重复、疑似损坏或编码异常的材料。
4. 对仍不清楚用途的材料提出一组问题，并给出保留策略推荐。

### 第二轮：权威与保留

围绕以下事项提供方向：

- 来源权威级。
- 术语和字段保留程度。
- 版本冲突优先级。
- 未知字段处理。
- 是否需要无损往返。

### 第三轮：提取与路由

生成事实索引，把每条内容送往世界观、角色、系统、场景、MVU/EJS、叙事或 UI。只在事实归属无法判断时询问，不对事实本身进行创作扩写。

## 充分性门槛

以下条件全部满足，本阶段才算充分：

- 所有声明为输入的材料都有稳定 ID、绝对路径、识别类型和读取状态。
- 每份材料都已标明权威级与用途。
- 必须原样保留、允许改写和明确忽略的范围可区分。
- 版本或来源冲突已有处理策略；创作性冲突已进入对应阶段待办。
- 重要事实已经提取并标明目标阶段与可见性来源。
- 未知字段、损坏项和编码问题有明确处置结论。
- 原始文件保护策略与输出位置明确。

## 轮次输出格式

````markdown
## 本轮已锁定
- [来源权威或保留决定]

## 本轮生成片段
<!-- validate: project.schema.json; merge: assets/templates/project.yaml -->
```yaml
materials:
  - id: source_old_card
    path: "[绝对路径]"
    kind: character_card_json
    read_only: true
    notes: "主材料；原件只读，未知字段进入保留导入区。"
decisions:
  - id: materials.source_old_card_policy
    stage: materials
    summary: "旧卡是本轮主材料，并执行未知字段保留。"
    value:
      authority: primary
      handling: read_only
      preserve_unknown_fields: true
    decided_by: user
    locked: true
    status: active
    rationale: "保护原件并为无损往返保留未识别扩展。"
    round: 1
    history: []
```

## 本阶段检查
- 已识别：[数量与类型]
- 仍缺少：[仅列材料处理问题]
- 已路由待办：[目标阶段 + 摘要]

## 下一批问题
[只问材料的来源、权威、保留或冲突处理]
````

## 示例片段

以下内容是合并到 `project.yaml` 的片段：文件元数据写入 `materials[]`，来源权威、保留方式和冲突策略写入 `decisions[]`，待目标阶段处理的事实或冲突写入 `cross_stage_backlog[]`。

<!-- validate: project.schema.json; merge: assets/templates/project.yaml -->
```yaml
materials:
  - id: source_card_v2
    path: "D:/RP/input/conductor-v2.json"
    kind: character_card_json
    read_only: true
    notes: "主材料；保留未知字段和扩展对象。"
  - id: source_notes
    path: "D:/RP/input/列车设定.md"
    kind: text
    read_only: true
    notes: "辅助材料；提取事实后按目标阶段重组。"
decisions:
  - id: materials.source_precedence
    stage: materials
    summary: "角色卡版本是主来源，设定笔记是辅助来源。"
    value:
      primary: source_card_v2
      secondary:
        - source_notes
      same_authority_conflicts: route_to_target_stage
    decided_by: user
    locked: true
    status: active
    rationale: "优先保留较完整的角色卡结构，同时让设定笔记补充世界事实。"
    round: 2
    history: []
  - id: materials.preservation_policy
    stage: materials
    summary: "所有输入只读，未知字段与扩展对象必须无损保留。"
    value:
      original_inputs: read_only
      preserve_unknown_fields: true
      preserve_extensions: true
    decided_by: user
    locked: true
    status: active
    rationale: "避免转换过程破坏原件或丢失尚未识别的数据。"
    round: 2
    history: []
cross_stage_backlog:
  - id: train_stop_fact
    source_stage: materials
    target_stage: worldbuilding
    summary: "source_notes：列车不能通过常规制动主动停靠；在世界观阶段确认可见性和例外。"
    status: open
  - id: conductor_oath_fact
    source_stage: materials
    target_stage: character
    summary: "source_card_v2：列车长把维持乘客安全视为首要职责；在角色阶段纳入价值排序。"
    status: open
  - id: conductor_identity_conflict
    source_stage: materials
    target_stage: character
    summary: "source_card_v2 与 source_notes 对列车长是否识破副车长伪造记录表述不一致。"
    status: blocking
source_manifest:
  preserved_imports:
    - src/import/preserved.json
```

这里仅记录“存在冲突”，不在材料阶段追问列车长的判断逻辑。

## 阶段总汇

总汇应包含：

- 完整材料清单与读取状态。
- 权威顺序和保留策略。
- 提取事实按目标阶段分组后的索引。
- 冲突、损坏、未知字段与缺失材料。
- 原件不被修改的确认。
- 下一阶段读取哪些材料、暂不读取哪些材料的建议。

## 下一阶段建议

- 新建或重构项目：推荐进入“世界观”，先消费世界层事实和冲突。
- 仅修改角色且世界规则已完整：可以建议进入“角色”，但要说明跳过世界观复核的依据。
- 材料中存在致命解析问题：留在本阶段解决格式或获取可读版本，不以猜测代替内容。
- 没有材料：本阶段应在定位阶段直接标为 `skipped`，不创建空清单来增加流程负担。

正常模式下由用户确认下一阶段。放权覆盖路线时，报告选择理由并直接锁定。
