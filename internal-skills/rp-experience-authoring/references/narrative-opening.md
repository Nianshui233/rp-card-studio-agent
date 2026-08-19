# 叙事与开场阶段

本阶段写实际叙事规则、示例、可游玩的开场，以及首条消息承载的项目介绍/路线选择/创角前端。开场前端属于开场体验，不属于后续状态栏阶段；它不替用户角色做决定。

启用开场前端时，默认按[模块化浏览器前端应用工作流](../../st-frontend-authoring/references/ui-app-authoring.md)制作：先把它当完整浏览器应用开发和预览，最后才构建为正则或开场载体需要的自包含 HTML。

## 允许讨论

- 叙事人称、镜头距离、节奏、对白与描写比例；
- NPC 与世界如何主动行动、如何呈现场外变化；
- 信息揭露、秘密、推理与结算怎样进入正文；
- 默认开场和真正有区别的备选开场；
- Agent 根据已完成项目事实推导空白创角合同需要哪些字段；不询问用户实际准备填写什么人物，也不在正式前端预填人物值；
- 使用变量时，各开场对应的完整初始状态；
- 是否需要开局 HTML 入口，以及模型可见的短回退文本。
- 开场呈现选择：纯文本、介绍页、介绍+路线选择、介绍+完整创角，或超重型同层入口；其视觉和交互等级与后续状态栏分别决定。

## 叙事规则应写成 RP 指令

```yaml
叙事规则:
  视角: "第三人称有限视角，跟随当前焦点人物，但不读取未获得的信息"
  节奏: "日常允许停留与互动；威胁发生时缩短句段并增加动作反馈"
  NPC主动性:
    - "NPC 有自己的日程、目标和关系，不等待当前视角触发才行动"
    - "场外变化通过传闻、缺席、环境、消息或后续碰面被看见"
  不代写:
    - "不替用户角色决定关键行动、想法、台词或身体反应"
  回复收束: "以正在发生的变化、NPC 行动或可回应情境结束，而不是列出菜单式问题"
```

## 普通开场

默认和备选开场都应具备：地点、正在发生的事、可感知事实、NPC/世界行动、未解决压力和明确交接点。开场必须只使用已锁定事实。

启用 MVU 时，开场携带或绑定真实初始化数据。不同开场若状态不同，不得共用一个虚假初始化。

## 开局 UI 路线

复杂开局可以使用短、稳定的首消息标记，由 display 正则替换为完整 HTML；同时用 prompt-only 规则让模型看到简短、可理解的叙事/状态说明，而不是整页 HTML/CSS/JS。

开局 HTML 可以介绍版本、世界观、更新信息、作者留言、游玩指南、场景切入路线、空白创角和实时预览。为了快速启动，可以提供明确标注的预设/示例人物，但页面加载时不得自动应用，用户必须主动点击，且所有字段在提交前仍可编辑。确认动作提交最终游玩者亲自填写或主动选择后的内容并回到正常对话链。若整个游玩始终由首楼应用代理，则属于超重型同层/0层前端，需在 UI 阶段明确设计。

不要依赖普通消息 HTML 内的 `<script>` 自动执行。需要 JS 时使用 Tavern Helper 支持的 HTML/iframe 路线或由卡内脚本绑定真实 DOM，并在目标环境验证。

开局前端在 `opening.yaml` 的 `opening_ui` 中维护：

```yaml
opening_ui:
  enabled: true
  authoring_mode: multi_file_html
  app_manifest: "src/runtime/apps/opening/ui-app.yaml"
  marker: "<雾港开局页/>"
  file: "src/runtime/ui/开局界面.html"
  opening_id: opening_default
  experience_level: medium
  theme_direction: "潮湿港口档案与夜班登记册"
  device_priority: equal
  journey: "阅读版本/世界/指南 → 选择路线 → 填写角色 → 预览 → 把确认后的开局消息写入输入框"
  fallback: "正则或脚本失效时，默认开场仍提供可直接游玩的中文说明"
  runtime: not_run
```

它可以包含版本、世界观、更新信息、作者留言、游玩指南、预制路线、自定义创角和确认入局，但这些内容只属于首条消息生命周期。开发源码推荐放在 `src/runtime/apps/opening/`，构建结果放在 `src/runtime/ui/开局界面.html`；不要塞进 `status-ui.yaml` 或后续状态应用目录。

重型开场不应从零一次性写成一个巨大 HTML。先确认信息架构和完整用户旅程，再分别创作：

```text
index.html / fragments     页面结构与语义
styles/tokens.css          主题令牌
styles/layout.css          应用布局
styles/components.css      路线、地区、创角、预览等组件
styles/effects.css         主题演出和动效
styles/responsive.css      聊天宽度与移动端
scripts/state.js           表单、草稿和页面状态
scripts/host-adapter.js    MVU/Tavern Helper/SillyTavern 桥接
scripts/render.js          页面渲染
scripts/interactions.js    导航、创角、预览和确认
mock/state.json            浏览器满数据预览
```

先用模拟数据完成普通浏览器验收，再接入真实宿主，最后执行 `rp-card-forge ui-build`。单文件 HTML 是部署制品，不是限制创作规模的开发方式。

## 创角表单必须有“变量桥”

创角前端不自行发明用户角色字段。先读取唯一的 `src/user-character.yaml` 合同，再从 `contract.creation_fields` 选择本项目需要展示的字段：`static_profile` 写入 `<user>` 静态档案，`initial_runtime` 只写入开局运行状态。只要这些字段会影响 MVU、EJS、状态栏或其他运行时数据，就在 `opening.yaml` 中填写 `creation_bridge`，把“合同字段 → 静态档案/动态状态 → 提交 → 回读”写成一条真实链：

```yaml
creation_bridge:
  enabled: true
  profile_contract: src/user-character.yaml
  profile_output: user_entry_yaml_block
  runtime_output: initial_state_patch
  input_fields:
    - id: name
      label: 姓名
      type: text
      required: true
    - id: starting_region
      label: 起始地点
      type: select
      required: true
  bindings:
    - input: name
      contract_path: "profile.name"
      targets:
        user_entry: "profile.name"
        mvu: "stat_data.主控.显示.姓名"
      transform: text
    - input: starting_region
      contract_path: "runtime.location.current"
      targets:
        mvu: "stat_data.主控.位置.当前地点"
      transform: text
  commit:
    route: hybrid
    marker: "<开局设定已写入/>"
    source_file: "src/runtime/opening/创角变量桥.js"
    api_ref: "目标环境实测的 MVU/Tavern Helper 写入 API"
    worldbook_ref: "本卡主世界书"
    entry_name: "用户主控设定（<user>）"
    write_mode: upsert
    worldbook_readback: "重新读取 <user> 条目，确认静态内容一致且条目已启用"
    user_entry_write: update_and_enable
    runtime_write: mvu
    order: [render_outputs, write_user_entry, readback_user_entry, write_runtime, readback_runtime, start_opening]
    readback: "提交后重新读取实际状态，当前位置不得仍为默认值；显示姓名只能是静态档案镜像"
    failure_fallback: "写入失败时保留表单并生成可复制的手动开局消息，不显示成功"
```

静态与动态按项目语义判断，不按固定字段名判断。例如奇幻项目的血脉可能稳定而当前魔力会变化；修仙项目的灵根与道途可能稳定而当前真元、境界进度和劫数会变化。任何静态字段为了 UI 展示都可以镜像进 MVU，但 `<user>` 仍是权威来源，普通更新规则不得改写只读镜像。

提交路线由目标环境实测后选择：

- `mvu_api`：开场页或 Tavern Helper 直接调用实际可用的 MVU 写入接口，然后立即读回状态；
- `update_message`：生成目标 MVU 能解析的真实更新块，并确认该消息会经过更新管线；
- `helper_script`：由卡内 Tavern Helper 脚本完成写入和回读；
- `worldbook_api`：非 MVU 项目直接更新并启用 `<user>` 条目，再读回确认；没有动态状态时不创建用户变量；
- `hybrid`：先更新并启用 `<user>` 静态档案，再写入动态运行状态，两边分别读回；
- `user_message`：只能作为复制/手动回退。它生成与 `<user>` 空白模板一致的 YAML 块供用户粘贴，但不能假称世界书已经修改或条目已经启用；
- `existing`：沿用项目已有且已验证的桥接实现。

`createChatMessages({ data: ... })` 只是给聊天楼附加数据，不能单独证明 MVU 当前状态已被更新。除非目标环境实测读回成功，否则不得把它写成“变量已初始化”。确认按钮的顺序应是：收集并预览 → 执行真实写入 → 读回并显示结果 → 再写入/发送开局消息。写入失败必须保留可恢复的表单和手动回退，不得静默进入默认状态。

开场 `<initvar>` 或默认初始值仍然只是基线；创角桥负责把动态开局值覆盖到正确路径。两者不能互相冒充。`<user>` 是唯一长期静态主控档案，不会自动把同名字段同步进 MVU；MVU 也不得反向成为第二份完整人物档案。

开场前端的等级也是交付下限。重型开场必须在实际 HTML 中形成完整玩家旅程，例如项目导读、规则/版本信息、实质不同的路线或预设、创角、实时预览、确认提交、状态写入/回读和失败回退；不能只把一张表单配色后声明为 `heavy`。Forge 会读取 HTML 做功能面探针，锁定后缺少承重能力会阻断。

MVU 创角页还要安全探测 `window.Mvu` 与 `window.parent.Mvu`。如果项目加载器声明全局对象挂在父窗口，而开场页只检查当前窗口，就会在确认时无法写入变量，页面看起来完整却只能使用默认值或停在失败状态。

## 推荐源码

```yaml
默认开场:
  标记: "<雾港开局页/>"
  模型可见回退: |-
    雾港夜班即将开始。世界处于潮雾将至、港务处临时加检的状态；等待真实用户开局消息确定切入身份和地点。
  直接文本回退: |-
    夜班钟声从港区深处传来，潮雾正在越过防波堤。码头上的人各自加快了手里的动作，没有谁停下来等待陌生人的到来。
  初始状态引用: "夜班开始"

备选开场:
  - 名称: "封锁后的旧码头"
    正文: |-
      ...
    初始状态引用: "旧码头封锁"
```

## 完成门槛

- 叙事规则能直接指导模型；
- 世界和 NPC 不围绕用户角色停止或启动；
- 每条开场可直接游玩且不替用户作决定；
- 制作访谈没有询问用户要扮演谁；正式 `<user>` 与变量初值保持空白；创角 HTML 没有自动预填或自动选中用户人物。可选快速预设必须明确标注、默认不选且可编辑；
- 普通文本、UI 标记、prompt 回退与初始化关系清楚；
- `opening_ui` 的标记、HTML、目标 opening、prompt 回退和确认入局消息形成闭环，且未混入 `status_ui.surfaces`；
- 模块化模式下开发源码、模拟状态、`app_manifest` 与最终 HTML 构建结果一致；
- 备选开场确实不同，而不是换一句欢迎词；
- 不把完整 HTML 直接送入模型上下文；
- 示例对话属于角色或叙事校准，不重复塞进多个高级定义字段。
- 创角字段全部来自唯一用户合同；静态字段能生成与 `<user>` 模板一致的 YAML，动态字段只进入运行状态。
- 非 MVU 项目不伪造用户变量；无法直接修改世界书时明确提供复制粘贴与启用说明。

## Swipe 切换与混合创角提交

介绍/创角前端若通过备用开场白进入剧情，使用 `opening_transition.route: swipe_switch` 记录源消息、目标 opening，以及实际的消息读取/修改路线。

创角资料既需要长期写入 `<user>` 世界书条目、又需要立刻影响 MVU 状态时，使用 `creation_bridge.commit.route: hybrid`：先 upsert 并启用目标条目、读回静态档案，再写入当前消息变量、读回动态状态，最后才触发开局。任一步失败都保留表单和可复制回退文本。
