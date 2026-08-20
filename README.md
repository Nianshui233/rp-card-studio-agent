# SillyTavern制卡工坊

一个低成本、按需路由的 SillyTavern RP 创作工作台。

它负责三件事：

1. 创作世界、角色、系统、场景、开场、CharacterBook、MVU、EJS、正则、Tavern Helper 脚本和消息内前端；
2. 对当前实际内容做必要 QA，修复会导致无法导入、无法运行、数据丢失或断链的问题；
3. 在结束时检查可导入成品，整理实际使用的组件并交付。

它不是项目管理器、构建系统、静态分析平台或通用装配器。不会要求 `project.yaml`、`.rp-card-state.json`、Forge、构建事务、组件注册表、阶段决定锁或固定源码/制品双轨。

## 工作方式

主入口是 [AGENT.md](AGENT.md)。Agent 根据当前请求直接路由到一个创作或技术 Skill，不强制完整阶段顺序，也不为每个主题生成阶段总汇和交接表。

常用模块：

| 模块 | 负责内容 |
|---|---|
| `rp-project-foundation` | 定位、材料盘点、旧卡输入保留、世界观 |
| `rp-cast-authoring` | 角色、NPC、群像、关系和 NSFW 角色层 |
| `rp-experience-authoring` | 系统、场景、事件、叙事、开场和创角内容 |
| `st-runtime-authoring` | MVU、MVU_ZOD、EJS、变量、脚本和状态读写 |
| `st-frontend-authoring` | 开场前端、持续消息 UI 和完整 HTML |
| `st-worldbook-regex` | 世界书条目、输出标记和正则配对 |
| `st-host-capabilities` | 需要时核对真实宿主 API、iframe 和生命周期 |
| `st-api-reference` | 需要时核对具体 API 和版本事实 |
| `st-render-regex` | 需要时回放完整、流式和 prompt/display 正则 |
| `st-runtime-debug` | 需要时做真实 SillyTavern 运行排障 |
| `st-integration-qa` | 最终 QA、成品检验和交付 |

## 交互规则

每轮只处理当前目标：读取已知内容，询问少量必要问题，给出推荐，立即写出实际内容或代码，然后检查本次改动。用户完全放权时直接完成，不停下来维护一套项目管理记录。

轻型 RP 不需要 MVU、EJS、持续 UI、复杂正则或脚本时，不加载对应 Skill，也不创建相关文件。只有用户实际需要复杂前端时，才考虑拆分开发文件；最终页面始终直接交付为完整、自包含 HTML。

旧卡修改或审查时，先保留原始输入副本并盘点附属组件，再开始重写。保真副本不属于运行导入组件。

## 技术底线

- MVU 只有在确实需要跨楼层变量或精确状态时启用；卡内 MagVarUpdate 只能有一个 Loader。
- 只有 `mvu_zod` 或明确需要 Zod 的 `hybrid` 才要求 `registerMvuSchema`。
- EJS 只在确实需要提示词/渲染模板时启用；不把 EJS 当变量存储。
- 正则必须有真实生产者；display 和 prompt 通道按实际用途分开。
- UI 正式运行必须读取真实状态或真实消息载荷，不能用预览数据冒充当前状态。
- 真实宿主没有测试时记录 `runtime: not_run`。
- 不因条目数、角色数、变量数、HTML 长度或项目复杂度限制创作。

## 最终交付

默认交付一个项目包目录，只包含项目实际使用的文件，例如：

- 角色卡 JSON；
- 独立世界书 JSON；
- 实际使用的正则 JSON；
- Tavern Helper 脚本 JSON/JS；
- 完整单文件 HTML；
- 实际使用的 MVU/EJS 文件；
- 简短导入说明和 QA 结果。

最终检查确认文件语法、角色卡与世界书绑定、变量/脚本/正则/UI 路径、正则与 HTML 配对、自包含性、绝对路径和维护引用泄漏。未使用的组件不进入交付包。

## 运行参考

宿主、MVU/EJS、前端和正则的详细参考位于对应 `internal-skills/*/references/`，只在当前任务需要时读取。`assets/examples/` 只存可直接参考的原创运行样本，不是强制模板。
