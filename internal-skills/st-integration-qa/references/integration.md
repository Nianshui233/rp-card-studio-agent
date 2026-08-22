# 最终交付与真实宿主验收

主 Agent 直接整理已经完成的组件，不使用通用装配器。

## 文件整理

按项目实际需要交付：角色卡 JSON、独立世界书 JSON、Tavern Regex JSON、Tavern Helper Script/ScriptFolder JSON、可选 `.js` 源码、完整 HTML、实际使用的 EJS/MVU 内容和简短导入说明。

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
6. MVU 项目确认唯一 Loader，再启用项目 Schema/bridge；
7. 启用 EJS 条目与所需 feature，并检查 raw-message/sandbox/autosave；
8. 新建聊天执行实际验收。

不要要求用户把裸 HTML 粘入正则后期待脚本执行。若另交 `.html` 便于维护，导入说明指出对应正则已经内含同一 HTML 的 fenced 版本。

## 真实 SillyTavern 验收

按项目实际功能检查：

- 默认/备用 Greeting 与每个 0 楼 Swipe；
- 开场草稿隔离、空白输入、主动路线、预览、上下文冻结、切聊天/切 Swipe 对抗；
- canonical `<user>` 精确唯一更新，目标 Greeting Swipe 动态初态写入；
- `write_accepted` 与 `persisted` 分开记录，关键写入保存并重载后读回；
- 动态自定义开局正常主链：真实 user 楼 → 真实 AI 楼 → 变量初始化；固定 Greeting 只需确认目标 Swipe/初态后交还输入权；
- 输入框已有文本与自动发送失败回退；
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
- 开场写入的初态被持续前端沿同一路径读取，且没有重复初始化；
- 编辑、Swipe、删除、加载更多、重载、切聊和重复挂载；
- 窄屏、长中文、软键盘；
- Loader、远程 Schema、Zod 实例和断网失败态；
- 控制台首个因果错误。

输入框里出现文本不等于消息已发送；同楼立即读回不等于磁盘已保存；`generate()` 返回文本不等于聊天产生新楼层。

## round-trip

旧卡或 V3/PNG/JSON 转换按实际格式比较：spec/spec_version、顶层未知字段、`data.extensions`、`data.character_book`、alternate greetings、PNG 与 JSON 导出差异。

正则单独导入可能重生成 ID，不以原 ID 不变作为成功条件；以内容、启用位置和实际运行结果验收。

## 最终报告

简短列出：项目包绝对路径、组件与导入顺序、正则/HTML/载体配对、`write_accepted/persisted` 证据、真实消息链、通过项、`runtime: not_run`、远程依赖和已知限制。
