# 制作、装配与操作验证

这份合同只规定工程正确性，不规定作品题材、字段数量、页面数量、框架或视觉风格。共用技术组件可以复用；作品内容与界面设计仍由当前项目决定。不要保存失败会话、旧实现、备用路线或事故故事。测试只用无作品语义的技术夹具。

## 1. 开始制作前：把页面需求展开

`production.interviews.<stage>.surfaces` 是当前页面取舍的单一投影，不另建访谈日志。每个实际页面有稳定 id：

- `layout`、`visual`：具体布局、信息密度、图形与交互取舍；
- `fields[]`：每项的 id、`source`、`representation`；静态内容来源和只读派生也合法，不强制创建状态；
- `actions[]`：每项的 id、`trigger`、`outcome`、`failure`、`visualState`（是否产生需展示的视觉状态）；只读查看、复制、输入、写入与发送分别说明，权限不混同；
- `emptyState`、`failureState`：空白/未接入与真实失败分别怎么呈现。

前端制作预览遵守 `shared/frontend/layout-preview.md`。当前 surfaces 可加页面/字段/操作 label 与 layout.blocks，actions 必须用 visualState 明确是否产生需展示的视觉状态；草图实时引用现有字段/操作，不另建需求账本。布局遗漏、无具体内容或来源失效会被门禁拒绝。例值只用于显式预览，不进入初值或真实回退。完整视觉复核需要实际字段在截图中可见，关键操作后的状态单独捕获；用例的 fieldId 关联实际可见断言，不以隐藏 DOM 或父页面冒充。实际 HTML 截图复用下文浏览器用例；它不是实机验收。

取舍项带 `decisionRefs:[{id,textSha256}]`，值来自现有 authority 决定。`layout/visual/emptyState/failureState` 以 `{value,decisionRefs}` 记录。确实没有字段或按钮时允许空数组，但以 `fieldsReason/actionsReason` 同形记录理由；不为填清单虚构功能。大类 coverage 的每项也引用真实决定；sourceKind 按当前决定派生，来源混合用 mixed，不能把代定或材料事实改标用户逐项确认。`evidence` 可以省略；如保留，必须逐字投影引用决定的 text，以换行连接，不能另写“用户确认”的解释。

获取当前引用：

```text
node scripts/production/production-check.mjs decision-ref --root <项目> --id <决定ID>
```

这个命令不产生授权，也不验证聊天来源真实性。用户更正后，旧引用摘要失效；先回读原话并改实际内容，再更新引用与检查。禁止仅重算摘要、继续保留旧解释。前端快捷填表默认只是临时界面操作，不自动升级为世界预设路线。纯装饰、图形表达不是新增世界事实；不因“纯净”要求退回文字堆，也不把本项目的行数要求设成其它项目门槛。

## 2. 完整实现与内部载体验证

先按当前前端独立设计流程确定完整授权范围，再连续完成内容、视觉、组件、交互、资源、载体与必要状态链。载体有不确定性时可以在内部用可逆探针定位，但不是默认分阶段交给用户尝试的骨架，也不能替代正式界面的设计与验收。不要求未制作页面先实机通过，不把 activeStage 留在旧阶段绕过检查；宿主未运行仍明确 not_run。

开场必读 `internal-skills/st-opening-frontend-authoring/references/opening-design.md`，持续消息必读 `internal-skills/st-message-frontend-authoring/references/message-design.md`。两套 design schema、资料索引和复核观察独立；技术工具可以复用，不建立统一审美规则。第一印象、布局草图、代码量和技术检查通过均不代表设计完成。

具体设计保存在现有 interviews.<stage>.design；当前反馈覆盖保存而非增加历史。新做/重做主动查看真实设计与实现资料，本地 `frontend:design` 检索仅提供候选，不是外部研究证据。不联网、工具不可用或局部修改不研究时如实说明，不自行声称最新或擅自降级。

前端标记 implemented 或进行最终交付前，需要 frontends.<stage>.designReview：引用当前 designSha256、真实截图 caseIds 和本阶段具体观察。工具核对精确导入目标、PNG 字节、当前索引及每个实际页面的窄屏（<=480px）和宽屏（>=900px）证据；viewport 是 QA 覆盖，不是固定布局尺寸。开场分别观察介绍、指南、创角和视觉执行；持续消息分别观察信息优先级、操作清晰、连续舒适度和视觉执行。未制作开场模块可明确不适用。美感、实际设计兑现仍由 Agent 看图判断，机械全绿不产生用户接受或实机通过。

真正源文件和拼装产物明确分开；修复改源文件，再沿构建依赖重新生成最终文件，不能只修马上会被覆盖的产物。

Tavern Helper 的宿主函数与模板工程工具不是同一件事。`createScriptIdIframe/createScriptIdDiv/teleportStyle` 来自模板 `util/script.ts`，必须导入并打包，不能假设自动成为宿主全局。前两者返回 JQuery 包装对象；需要原生节点时取 `[0]`。后台脚本的 `document` 是自己的 iframe，`$` 默认可能指向父页面；找聊天消息必须明确父页面文档，不能混用。完整内联 HTML/JS、其它框架和等价实现仍可用。

启动分开 waiting_provider、waiting_snapshot、ready、failed、timed_out。只有成功读取并完成显示才能 ready；成功后停止启动重试。超时可重试，不等于“没有游戏状态”；保留最后成功时间，但不能用永久成功标记掩盖后续失败。`shared/frontend/boot-controller.mjs` 是可选技术实现，业务 API 与状态字段由项目适配，适配器须遵守传入 signal 的取消与清理约定；远程工具就绪也可使用经核实的 `waitGlobalInitialized` 或事件，不规定固定的几秒期限。所有监听、等待与定时器随 pagehide 清理。

## 3. 把运行文本绑定到实际导入字段

`production.bindings[]` 每项声明：

```json
{
  "id": "page-main",
  "component": "opening_frontend",
  "route": "entry",
  "source": {"path": "制作文件/构建/入口.html", "format": "text"},
  "target": {"path": "作品.正则.json", "pointer": "/0/replaceString", "kind": "regex"},
  "wrapper": "fenced_html",
  "match": "equals"
}
```

这是结构例子，字段和目标按当前作品填写。source 位于制作文件；target 路径相对导入包，必须属于当前路线。JSON 源使用 `format:json` 加 `pointer`。目标 kind 支持 worldbook_entry、regex、helper_script、card_field、config。脚本必须启用；扫描模板条目必须启用，按名读取条目可明确 `activation:pull`。页面可包 fenced_html；多段组合内容用 contains 绑定完整实际运行块，不能用几个关键词代表完整功能。

EJS 还声明 `runtimeIndex:{path,pointer,idField,contentField}`。它指向由构建器产生的全部运行实例数组；每一实例必须以同一个 JSON 源路径和 `/数组位置/下标/正文键` 绑定到最终导入内容。不能只检查一份代表模板，也不能只留下静态兜底。不同 provider 的可执行装配用明确 `runtimeKind:provider_script`，真实运行仍另验。整包重建必须包含所有已启用组件；世界书重新切片后仍须装入动态块。

## 4. 操作测试用最终内容，不只查有没有代码

`production.frontends` 分别维护 opening_frontend、message_frontend，最终不能只留 planned。每个组件有：

- `status:implemented`、`fallbackContract`；
- `prototype:{level:static|browser-fixture|real-sillytavern,status:passed|not_run}`；
- `browserFixtures` 指向制作文件/检查内的用例；
- `routes[]`：id、role（恰好一个 primary）、dataSource（static/host）、surfaceIds、carrier。carrier 仍按酒馆助手精确版本合同填写。

主路、兜底分别执行，不能互相替代。每条路线验证 load、after_render、reload、pagehide；host 数据路线增加 provider_delayed/snapshot_missing；持续消息页面增加 swipe/edit。每项实际显示字段都有带 fieldId 的结果断言；条件显示字段用相应输入夹具验证，不拿全空数据代表完整展示。每个实际操作都有 initial 与 after_render 用例，检查动作产生的具体结果，而不是文字存在、onclick 不为空或点过 tag。事件委托和重画后重新绑定都合法；不用字符串扫描一刀切禁止 innerHTML，更不能把注释里的错误示意当代码。

浏览器用例的结构：

```json
{
  "schema": "rp-card-studio/frontend-fixtures/v1",
  "cases": [{
    "id": "entry-open-initial", "route": "entry", "binding": "page-main", "surfaceId": "entry-page",
    "surface": "message_iframe", "input": "<项目入口标记>",
    "decodeEntities": "none", "scenario": "initial", "actionId": "open-details",
    "steps": [
      {"op": "click", "selector": "#details-button"},
      {"expect": "visible", "selector": "#details", "value": true}
    ]
  }]
}
```

解码步骤必须根据该版本的真实载体填写 none/once，不能把一次解码当作所有路线的统一规律。脚本主路使用 surface:script_iframe、helper_script 绑定、resultFrame 指向真正产出的消息 iframe，测试环境不附带兜底替换。hostSetup/frameSetup 是检查区的显式夹具；它们提供受控输入，不是实机证据。支持 click/fill/press/call/dispatch/reload_frame，断言 text/value/visible/attribute/count/overflow；scope:host 操作父页面，默认操作结果 iframe。call 的 name 是实际刷新入口，不执行任意断言表达式。需要时分别测窄屏、长数据、主题、弹窗焦点、剪贴板回退和已有输入草稿。

```text
node scripts/frontend/run-browser-fixtures.mjs --root <项目> --fixtures 制作文件/检查/前端用例.json --browser <浏览器程序>
```

Playwright 由仓库固定版本提供，浏览器可用已有 Chrome/Edge 或 Playwright Chromium，不能自动改用户浏览器设置。缺依赖或浏览器时失败退出、明确 not_run，不写 passed。夹具不向真实服务联网，但允许各 case.resources 声明准确 URL、制作文件/检查 内的实际资源 path、sha256 与 contentType，按核对后的字节重放字体、图片、CSS 和库。资源取得与版本/许可核对由制作 Agent 按宿主网络政策执行，不是要求成品零外链。未声明请求与 WebSocket 继续阻断。

`--preview <case-id>` 默认产生 previewKind:visual；有未映射资源时拒绝生成完整视觉声明，资源已变化也立即失败。断网回退用例显式 previewKind:resource_failure，不能借作完整设计复核。图片同时记录实际资源与阻断边界；线上资源可达、SillyTavern 真实重渲染和持久化仍需实机另验。源码无需为了预览删外链、替字体或复制另一套页面。

## 5. 统一构建检查流程

检查计划保存在制作文件/项目记录/check-plan.json。steps 按真实依赖排列，包含 id、kind(build/check)、cwd(project/agent)、args 字符串数组、result(json/exit)，可声明 program、dependsOn、timeoutMs。node 使用当前运行时；参数以数组传递，不拼 shell 命令。可使用 `${projectRoot}`、`${agentRoot}`，不写死安装位置。所有构建先完成，再做最终检查；不可在检查后重建。

build 可以明确用退出码，check 必须输出完整 JSON。统一流程同时检查退出码、ok、失败子项与计数，失败立即停止。检查不可顺手更新基线、修改源码或导入包。需要额外保存检查输出时放在项目记录/检查结果内，不混入机器合同输入。需要更新基线时作为明确制作动作完成，再重新检查。

```text
node scripts/production/check-plan.mjs --root <项目>
node scripts/production/production-check.mjs validate --root <项目> --final
```

`verification` 指向计划和结果文件。结果绑定实际源码、配置、构建、检查、导入文件及项目记录中的机器合同 JSON（不以人工验收或材料记录代替检查输入）；任何变化使旧结果过期。计划不要把最终 production --final 检查写成自己的子步骤：先得到完整结果，再执行最终门禁，避免循环读取尚未完成的结果。

qa_delivery 按权威账本检查所有已启用组件，不仅检查当前阶段。前端每个用例必须有当前精确导入内容的浏览器结果，EJS 每个实例必须已装配。尚未进入的可选阶段不会被要求提前制作。runtime_verified/accepted 额外需要各条路线的真实宿主记录，且覆盖当前内容；浏览器夹具不能升级为实机通过。

导入说明、交付清单和报告从当前选择与验收结果派生，不能写死“全部通过”、过去的数量或过期的未验项目。静态/夹具通过只能按其证据范围报告；实际导入名称、局部/全局组件位置、脚本依赖、变量写入与保存读回仍须实机核对。用户已报告重新操作时，先核对制品、源文件和实际局部配置，不凭全局空列表断言用户没安装。

## 世界书位置验证

按 internal-skills/st-worldbook-regex/references/worldbook-routing.md 维护 production.worldbook.routingContract；最终检查自动发现当前导入包中所有独立/明确兼容的内嵌世界书，逐条核对职责与实际插入 metadata。worldbook-check 可作 check-plan 的 JSON 检查步骤；分区回放通过仍为 runtime:not_run。runtime_verified/accepted 另需真实请求捕获与当前精确文件对应，不用 Chat History token 或位置枚举合法替代正确性。
