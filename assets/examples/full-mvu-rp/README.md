# full-mvu-rp：雾港航站（完整变量 + 前端综合样本）

一个可实质性导入并游玩的完整样本：MVU 原生 Schema 变量闭环 + Tavern Helper 消息 iframe 状态栏 + 卡内嵌 scoped 正则 + 随卡世界书（含 `[config_override]` 配置覆盖）。所有运行时契约均按四仓源码核对。

## 组件

| 文件 | 作用 | 导入方式 |
| --- | --- | --- |
| `雾港航站.json` | 角色卡（洛檀）；内嵌 scoped 正则与主世界书绑定名 | 角色卡导入 |
| `雾港航站世界书.json` | 主世界书：`[initvar]` 基线、`[config_override]`、更新规则、输出格式、设定 | 世界书导入 |
| `运行脚本.folder.json` | MagVarUpdate Loader（锁定 commit `0a730cd`） | Tavern Helper 脚本导入 |
| `regex.json` | 卡内嵌正则的独立副本（与卡内嵌**二选一**，勿双装） | Regex 扩展导入为 Scoped |
| `状态栏.html` | 状态栏可读主源（正则内嵌内容与此同源） | 不导入，维护用 |
| `_build.mjs` | 从主源再生成 regex.json / 角色卡 / 世界书 / 夹具 | 不导入，维护用 |

## 导入顺序

1. 安装 Tavern Helper（酒馆助手）与 SillyTavern 1.18.x；
2. Tavern Helper → 脚本管理 → 导入 `运行脚本.folder.json`，启用其中的 `MVU变量框架`（需联网拉取锁定 commit 的 bundle）；
3. 世界书导入 `雾港航站世界书.json`；
4. 角色卡导入 `雾港航站.json`；卡内已写 `extensions.world = 雾港航站世界书`，同名即可自动绑定为主世界书（未绑定则在角色世界书设置中手动选择）；
5. 打开角色聊天，首次会弹出「使用角色内嵌正则」确认框，选择允许（或改用 `regex.json` 手动导入为 Scoped，二选一）；
6. 新建聊天即见开场与第 0 楼面板。

## 玩法核对点

- 开场即有面板：第 0 楼由开场文本中的 `<航站面板/>` 渲染；此后每楼由 MVU 自动追加的 `<StatusPlaceHolderImpl/>` 渲染；
- 变量闭环：世界书 `[initvar]` 建立基线；模型按 `[mvu_plot] 更新规则`/`输出格式` 在回复末尾输出 `<UpdateVariable>` 命令块（带分号与 `//` 原因）；体力用 `_.add` 相对增减、物资用 `_.assign`/`_.unset`、线索列表先 `_.set('线索', [])` 再 `_.insert`；
- 单写者示范：`玩家备忘.最新` 只由面板按钮写入（`parseMessage → replaceMvuData → saveChat → 同楼读回校验`），更新规则明令模型不得改写；
- 面板生命周期：`waitGlobalInitialized('Mvu')` 带 6 秒超时、数值 `getCurrentMessageId()`、`Mvu.getMvuData({type:'message', message_id})` 显式楼层；宿主编辑/Swipe 用 `MESSAGE_UPDATED/MESSAGE_SWIPED` 重读，MVU assistant 自动更新由后续消息重渲染重建 iframe，不在 `VARIABLE_UPDATE_ENDED` 中读取旧快照；`pagehide` 主动清理；
- 正则三件套：display 隐藏更新块（流式安全）→ display 渲染面板 fence → prompt 清理更新块与双标记；用户消息（placement 1）不受影响。

## 已知行为与限制

- MVU 初始化会把全局世界书扫描设置覆写为推荐值（scan_depth 2、recursive 等），并给 assistant 消息持久追加 `<StatusPlaceHolderImpl/>`；
- MVU 不自动把 `stat_data` 注入提示词；本样本的更新规则刻意采用相对增减设计，不依赖状态注入；
- Loader 需要网络；加载失败时面板显示「等待 MVU 超时」错误态；
- 全部文件通过 JSON 解析、正则校验与 5 条夹具（display 完整块/流式/第0楼/prompt 清理/用户消息不受影响）；真实宿主导入与游玩为 `runtime: not_run`。
