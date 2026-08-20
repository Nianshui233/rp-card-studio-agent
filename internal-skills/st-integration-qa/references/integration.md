# 最终交付与真实宿主验收

主 Agent 直接整理已经完成的组件，不使用通用装配器。

## 文件整理

按项目实际需要交付：

- 角色卡 JSON；
- 独立世界书 JSON；
- Tavern Regex JSON；
- Tavern Helper Script/ScriptFolder JSON；
- 可选伴随 `.js` 源码；
- 完整自包含 HTML 源码；
- 实际使用的 EJS/MVU 内容；
- 简短导入说明。

HTML 与正则可以分件维护，但运行规则必须已经包含真实载体：

- Tavern Helper：`replaceString` 内是 fenced HTML + 完整页面；
- ST-Prompt-Template：世界书条目含 `@@iframe` 与完整页面；
- 纯 SillyTavern：只交静态 HTML，不声称 JavaScript 会执行。

## 常见导入顺序

1. 安装并核对项目依赖的 SillyTavern/Tavern Helper/MVU/ST-Prompt-Template 版本；
2. 导入角色卡；
3. 导入独立世界书，并核对嵌入书、主书、附加书和聊天书；
4. 导入正则并允许当前角色的 scoped regex；
5. 导入 Tavern Helper Script JSON，按说明启用；
6. MVU 项目确认唯一 Loader，再启用项目 Schema/桥接脚本；
7. 启用 EJS 条目与所需 feature；
8. 新建聊天执行实际验收。

不要要求用户把裸 HTML 直接粘入正则后期待脚本执行。若另交 `.html` 便于维护，导入说明指出对应正则已经内含同一 HTML 的 fenced 版本。

## 真实 SillyTavern 验收

按项目实际功能检查：

- 默认/备用开场；
- CharacterBook 导入和绑定；
- Regex 扩展、scoped allowlist、display/prompt；
- Tavern Helper 是否从 fenced code 建立消息 iframe；
- ScriptTree JSON 是否成功导入并默认禁用；
- MVU 初值是否位于 `stat_data.路径` 而非 `stat_data.stat_data`；
- 每个 Swipe 的快照、更新和读回；
- EJS 生成/渲染、`await getwi`、特殊条目和真实 bridge；
- 按钮、输入框、变量写入与反馈；
- 编辑、Swipe、删除、加载更多、重载、切聊和重复挂载；
- 窄屏、长中文、软键盘；
- Loader、远程 Schema 和断网失败态；
- 控制台首个因果错误。

创角或 UI 提交至少使用一个非默认值，从同一真实存储面读回。输入框里出现文本不等于变量已改变。

## round-trip

旧卡或 V3/PNG/JSON 转换按实际格式比较：

- spec/spec_version；
- 顶层未知字段；
- `data.extensions`；
- `data.character_book`；
- alternate greetings；
- PNG 与 JSON 导出差异。

正则单独导入可能重生成 ID，不以原 ID不变作为成功条件；以内容、启用位置和实际运行结果验收。

## 最终报告

简短列出：项目包绝对路径、组件与导入顺序、正则/HTML/载体配对、通过项、`runtime: not_run`、远程依赖和已知限制。
