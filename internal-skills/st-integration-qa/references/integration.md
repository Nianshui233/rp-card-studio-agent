# 最终交付与真实宿主验收

主 Agent 直接整理已经完成的组件，不使用通用装配器。

## 文件整理

默认按下面的职责结构整理，已有项目采用清楚的等价结构时不强制迁移：

```text
项目名/
├─ 创作源/
├─ 配置/
└─ 导入：项目名/
   ├─ 角色卡/
   ├─ 世界书/
   ├─ 正则/
   ├─ 酒馆助手脚本/
   └─ 原始HTML/
```

- `创作源/` 只放完整 canonical YAML、用户材料保真副本和真实 RP 文本源码；
- `配置/` 只放实际依赖、版本、导入顺序和运行/调度配置；
- `导入：项目名/` 只放最终可导入或直接使用的制品；
- 不创建“制作记录”“访谈记录”“阶段进度”“QA 日志”等过程目录；
- 未启用的组件子目录可以省略，不能用空壳文件假装完整。

按项目实际需要交付：完整 canonical 世界/角色/系统/场景 YAML、由其无损切片生成的独立世界书 JSON、角色卡 JSON、Tavern Regex JSON、Tavern Helper Script/ScriptFolder JSON、可选 `.js` 源码、完整 HTML、实际使用的 MVU 内容、EJS 内容和可选 bridge，以及简短导入说明。用户明确只要导入包时可不附 YAML 源文件，但生成和 QA 仍以完整源为准。

## canonical YAML 与世界书

先完成并校验世界观、角色、系统和场景 YAML，再生成世界书。世界书条目的 `content` 只接受源 YAML 的连续原文切片；条目元数据负责调度，不得把正文重新概括。

内容过大时：

```text
完整 YAML
→ 按 mapping/list 子树拆成更多原文块
→ 配置 constant/关键词/position/depth/order/EJS 调用
→ 保留所有已确认字段、解释、例子、边界和失败后果
```

用户明确要求压缩派生版时，完整 YAML 仍作为 canonical source 保留，压缩版必须标注为派生物。

HTML 与正则可以分件维护，但运行规则必须包含真实载体：

- Tavern Helper：`replaceString` 内是 fenced HTML + 完整页面；
- ST-Prompt-Template：世界书条目含 `@@iframe` 与完整页面，且在消息 render `msgId` 路径触发；
- 纯 SillyTavern：只交静态 HTML，不声称 JavaScript 会执行。

## 常见导入顺序

1. 安装并核对项目依赖的 SillyTavern/Tavern Helper/MVU/ST-Prompt-Template 版本；
2. 导入角色卡；
3. 导入独立世界书，核对嵌入书、主书、附加书和聊天书；
4. 导入正则并允许当前角色的 scoped regex；
5. 导入 Tavern Helper Script JSON并启用；
6. MVU 项目先确认 mode 与初始化策略；native 检查唯一 Loader，MVU_ZOD 必须同时导入唯一 Loader 与唯一 ZOD 注册脚本，再启用项目其他协调脚本；
7. 启用 EJS 条目与所需 feature，并检查 raw-message/sandbox/autosave；
8. 新建聊天执行实际验收。

不要要求用户把裸 HTML 粘入正则后期待脚本执行。若另交 `.html` 便于维护，导入说明指出对应正则已经内含同一 HTML 的 fenced 版本。

## 真实 SillyTavern 验收

先区分静态包检查、浏览器预览和真实 ST 验收。优先在隔离测试实例验证；不得默认覆盖活动安装的用户数据。记录目标 ST/扩展版本和每个导入制品的哈希；目标实例或浏览器驱动不可用时，报告 `blocked/not_run`，不以本机源码、截图或合同模拟代替。

按项目实际功能检查：

- 默认/备用 Greeting 与每个 0 楼 Swipe；
- 开场空白输入、主动路线、预览、修改后旧文本失效、Clipboard API 与手动复制回退；
- 页面与协调器不存在世界书写入、自动 Swipe 修改、MVU 初态直写或 `/send` 自动发送；
- 每条路线包含真实静态 Greeting，自定义来意也有自由入口；
- 玩家手动切 Greeting、粘贴并亲手发送后，真实 user 楼 → 真实 AI 楼 → 首轮登记变量；
- 登记结果由持续状态栏读取验证，首轮失败时保留玩家消息并允许重新生成 AI 回复；
- CharacterBook 导入和绑定；
- Regex 扩展、scoped allowlist、display/prompt；
- TH 是否从 fenced code 建立消息 iframe；
- STPT `@@iframe` 是否只在 render 路径建立，message/swipe ID 是否由 context 提供；
- ScriptTree JSON 是否成功导入并默认禁用；
- MVU 初值位于 `stat_data.路径` 而非 `stat_data.stat_data`；
- 每个 Swipe 的快照、更新、保存和读回；
- MVU 结束事件发生时 UI 不会读取旧快照；
- EJS 生成/渲染、`await getwi`、特殊条目、真实 bridge 与默认安全设置；
- 持续消息前端的当前楼层/Swipe、按钮、保存、同面读回与反馈；
- 开场登记消息产生的持久状态被持续前端沿同一路径读取，重复挂载/复制不产生重复初始化；
- 编辑、Swipe、删除、加载更多、重载、切聊和重复挂载；
- 窄屏、长中文、软键盘；
- Loader、远程 Schema、Zod 实例和断网失败态；
- 控制台首个因果错误。

输入框里出现文本不等于消息已发送；同楼立即读回不等于磁盘已保存；`generate()` 返回文本不等于聊天产生新楼层。

## 验收证据摘要

最终 QA 对每个所需维度各报 `passed/failed/blocked/not_run`，并区分：

- **制品**：相对路径、哈希、角色名/版本；
- **环境**：SillyTavern、相关扩展、浏览器/视口；
- **直接证据**：实际导入后的绑定/启用状态、Console/DOM、prompt/数据读回、重载结果；
- **限制**：没测的路径、权限不足、依赖不可用。

只有所有用户要求的真实导入/运行路径都有同一制品的 `runtime_pass` 证据，才可这样称呼；否则准确交付为“静态检查通过，宿主验收未完成”，并列出下一道门。仍只在最终对话总结，不生成常驻验收账本。

## round-trip

旧卡或 V3/PNG/JSON 转换按实际格式比较：spec/spec_version、顶层未知字段、`data.extensions`、`data.character_book`、alternate greetings、PNG 与 JSON 导出差异。

正则单独导入可能重生成 ID，不以原 ID 不变作为成功条件；以内容、启用位置和实际运行结果验收。

## 最终报告

简短列出：项目包绝对路径、组件与导入顺序、正则/HTML/载体配对、`write_accepted/persisted` 证据、真实消息链、通过项、`runtime: not_run`、远程依赖和已知限制。
