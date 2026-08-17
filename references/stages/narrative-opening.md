# 叙事与开场阶段

本阶段写实际叙事规则、示例、可游玩的开场，以及首条消息承载的项目介绍/路线选择/创角前端。开场前端属于开场体验，不属于后续状态栏阶段；它不替用户角色做决定。

启用开场前端时，默认按[模块化浏览器前端应用工作流](../ui-app-authoring.md)制作：先把它当完整浏览器应用开发和预览，最后才构建为正则或开场载体需要的自包含 HTML。

## 允许讨论

- 叙事人称、镜头距离、节奏、对白与描写比例；
- NPC 与世界如何主动行动、如何呈现场外变化；
- 信息揭露、秘密、推理与结算怎样进入正文；
- 默认开场和真正有区别的备选开场；
- 自由创角入口需要收集哪些信息；
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

开局 HTML 可以介绍版本、世界观、更新信息、作者留言、游玩指南、预制开场、自定义创角和实时预览。它的确认动作应形成真实用户开局消息并回到正常对话链；若整个游玩始终由首楼应用代理，则属于超重型同层/0层前端，需在 UI 阶段明确设计。

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

创角前端不只是把姓名、地点、身份等字段拼成一段漂亮的开局文案。只要这些字段会影响 MVU、EJS、状态栏或其他运行时数据，就要在 `opening.yaml` 中填写 `creation_bridge`，把“表单字段 → 运行时路径 → 提交 → 回读”写成一条真实链：

```yaml
creation_bridge:
  enabled: true
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
      targets:
        mvu: "玩家.姓名"
        user_entry: "profile.name"
      transform: text
    - input: starting_region
      targets:
        mvu: "元信息.所在府县"
      transform: text
  commit:
    route: mvu_api
    marker: "<开局设定已写入/>"
    source_file: "src/runtime/opening/创角变量桥.js"
    api_ref: "目标环境实测的 MVU/Tavern Helper 写入 API"
    readback: "提交后重新读取实际状态，姓名和地点均不得仍为默认值"
    failure_fallback: "写入失败时保留表单并生成可复制的手动开局消息，不显示成功"
```

提交路线由目标环境实测后选择：

- `mvu_api`：开场页或 Tavern Helper 直接调用实际可用的 MVU 写入接口，然后立即读回状态；
- `update_message`：生成目标 MVU 能解析的真实更新块，并确认该消息会经过更新管线；
- `helper_script`：由卡内 Tavern Helper 脚本完成写入和回读；
- `user_message`：非 MVU 项目生成 `<user>`/XML/文本设定块，让后续叙事与正则消费，但不能假称它已经修改了世界书或宿主状态；
- `existing`：沿用项目已有且已验证的桥接实现。

`createChatMessages({ data: ... })` 只是给聊天楼附加数据，不能单独证明 MVU 当前状态已被更新。除非目标环境实测读回成功，否则不得把它写成“变量已初始化”。确认按钮的顺序应是：收集并预览 → 执行真实写入 → 读回并显示结果 → 再写入/发送开局消息。写入失败必须保留可恢复的表单和手动回退，不得静默进入默认状态。

开场 `<initvar>` 或默认初始值仍然只是基线；创角桥负责把开场页选择的值覆盖到正确路径。两者不能互相冒充。`<user>` 世界书条目仍可作为长期主控设定模板，但它是上下文资料，不会自动把同名字段同步进 MVU。

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
- 普通文本、UI 标记、prompt 回退与初始化关系清楚；
- `opening_ui` 的标记、HTML、目标 opening、prompt 回退和确认入局消息形成闭环，且未混入 `status_ui.surfaces`；
- 模块化模式下开发源码、模拟状态、`app_manifest` 与最终 HTML 构建结果一致；
- 备选开场确实不同，而不是换一句欢迎词；
- 不把完整 HTML 直接送入模型上下文；
- 示例对话属于角色或叙事校准，不重复塞进多个高级定义字段。
