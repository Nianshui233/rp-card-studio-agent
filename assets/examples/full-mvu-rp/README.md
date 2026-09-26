# full-mvu-rp：雾港航站（全功能综合样本）

这是样本矩阵中的技术组合参考样本，用于展示角色卡、独立世界书、MVU、EJS、Regex、一次性开场页和持续消息状态栏怎样分工。它不是世界观、角色、系统或场景的压缩模板，也不代表正式项目的内容上限；正式创作应保留完整 canonical YAML，并在最终打包时按原文子树无损切入世界书。

当前开场页采用**复制交接**：它只生成玩家登记文本，不修改世界书、不切换 Greeting、不写 MVU，也不替玩家发送消息。玩家手动选择开场、粘贴并发送后，首轮 AI 更新再把登记内容写入聊天状态。

当前离线检查通过；真实 SillyTavern 导入/运行状态以文末证据为准，不据此承诺“已实机验收”。

```text
角色卡与独立世界书
+ 三个静态剧情 Greeting
+ 一次性开场/创角页面：预览 → 复制 → 操作指引
+ 持续消息状态栏
+ MVU 原生 Schema 与差分更新
+ Tavern Helper 运行协调器
+ ST-Prompt-Template 的 MVU→EJS 只读桥
+ 静态通知 Regex
```

## 文件与职责

| 文件 | 作用 | 是否导入 |
| --- | --- | --- |
| `雾港航站.json` | V3 角色卡；默认创角页 + 三个静态剧情 Greeting；内嵌 Scoped Regex | 是 |
| `雾港航站世界书.json` | MVU 初值/规则、输出合同、叙事、世界、人物、场景、系统与 EJS 动态上下文 | 是 |
| `运行脚本.folder.json` | 唯一 MVU Loader + 状态栏运行协调器 | 是 |
| `MVU运行合同.yaml` | 明确 native_schema、Greeting 初始化、lodash 方言、锁定 Loader 与必需条目 | 否（QA/维护配置） |
| `regex.json` | 卡内嵌 Regex 的独立副本；与卡内版本二选一 | 可选 |
| `开场.html` | 一次性开场/创角页面维护源码 | 否 |
| `状态栏.html` | 持续消息前端维护源码 | 否 |
| `运行协调器.js` | 输入仲裁、手记持久化、路径兼容和 EJS bridge | 否 |
| `动态上下文.ejs` | STPT generate-stage 只读动态上下文 | 否 |
| `regex.fixtures.json` | Regex 离线回放夹具 | 否 |
| `runtime.contract.test.mjs` | 被动开场边界、手记、输入仲裁、EJS bridge、集合 Schema 与路径修正测试 | 否 |
| `_build.mjs` | 从维护源码生成可导入 JSON，并执行关键合同断言 | 否 |

## 依赖与导入顺序

下列版本是源码核对目标，不是实机通过声明：

- SillyTavern 1.18.x；
- Tavern Helper 4.9.3；
- MagVarUpdate beta，Loader 锁定 commit `0a730cd4a9b99689d1135a49b542c780b977c24c`；
- ST-Prompt-Template 1.17.8.1（只用于 EJS 动态上下文）。

建议顺序：

1. 安装并启用 Tavern Helper；需要 EJS 动态上下文时再安装 ST-Prompt-Template。
2. Tavern Helper → 脚本管理 → 导入 `运行脚本.folder.json`。
3. 启用 `MVU变量框架` 与 `雾港航站协调器`；不要再启用第二份 MVU Loader。
4. 导入 `雾港航站世界书.json`。
5. 导入 `雾港航站.json`；确认主世界书绑定为 `雾港航站世界书`。
6. 允许角色内嵌 Scoped Regex；若改用独立 `regex.json`，二者只选一个。
7. 使用 ST-Prompt-Template 时，建议关闭不需要的 raw-message EJS 执行。
8. 新建聊天，从默认开场页开始。

Loader 需要联网拉取锁定 bundle。加载失败时，开场页仍可生成和复制登记文本，但首轮 MVU 登记与状态栏不会正常工作。

## 开场方式

### 1. 在默认开场页创角

页面收集：

- 玩家称呼；
- 公开来历；
- 公开专长；
- 行事倾向；
- 开局路线；
- 自定义路线的具体来意。

页面会生成一段可见、可编辑的 `【雾港航站·开局登记】` 文本。点击复制时优先使用 Clipboard API；权限被拒绝时会选中全文，并提示手动 `Ctrl+C`。

**页面不会：**

- 创建、更新或删除世界书条目；
- 改写 `<user>`；
- 切换第 0 楼 Swipe；
- 修改 Greeting 或 MVU；
- 覆盖消息输入框；
- 自动 `/send` 或 `/trigger`。

### 2. 手动选择剧情 Greeting

生成文本后，根据页面指引手动左右滑动第 0 楼：

- `例行巡灯`；
- `失联渡船`；
- `自定义来意`。

三条路线都有真实静态 Greeting 与 `<initvar>`，不依赖脚本在提交时改写第 0 楼。

### 3. 粘贴并亲手发送

1. 回到 SillyTavern 消息输入框。
2. 粘贴完整登记文本。
3. 确认这是新聊天的第一条玩家消息。
4. 亲手点击发送。
5. 等待 AI 回复与状态栏。
6. 检查玩家称呼、路线和开场状态是否已从“待登记”变为实际内容。

世界书中的 MVU 规则只在真实玩家消息带有登记 marker 时写入玩家字段。世界书同时交付详细更新规则、当前 `stat_data`/路径索引和单一 lodash 输出格式；三者不得省略或混入 JSON Patch。登记后，普通叙事不能猜测或覆盖玩家档案；只有玩家明确发送更正登记时才修改指定字段。

如果首轮正文正常但玩家状态仍是“待登记”，保留玩家原消息并重新生成 AI 回复。不要去世界书里手工补写运行状态。

## 持续消息前端

`状态栏.html` 只负责每楼运行状态，不包含创角或路线提交：

- 使用数值 `getCurrentMessageId()`；
- 读取完整 `Mvu.getMvuData({type:'message', message_id})`；
- 展示区域、天气、时段、潮位、安全度、体力、任务、关系、倒计时、物资、线索、玩家公开起点和本楼手记；
- 行动建议只写入输入框，不自动发送；
- 输入框已有草稿时不覆盖；
- 玩家手记执行 `parseMessage → replaceMvuData(数值楼层) → await saveChat → 同楼读回`；
- 编辑/Swipe 后重新读取；`pagehide` 清理订阅；
- 不把 `VARIABLE_UPDATE_ENDED` 当作持久化完成。

## Regex 与载体

主要链路：

1. 隐藏完整或流式半截 `<UpdateVariable>`；
2. 隐藏旧式 `<StatusPlaceHolderImpl/>`；
3. 将 `<航站开场/>` 替换为完整开场 HTML；
4. 将 `<航站面板/>` / `<StatusPlaceHolderImpl/>` 替换为完整状态栏 HTML；
5. 渲染航站通知；
6. 清理 prompt 中的技术 marker。

Regex 只作用于 assistant placement，不改写玩家登记消息。两个 `.html` 文件是可读维护主源，构建器把它们嵌入运行 Regex。

## 世界与玩法内容

样本同时包含：

- 雾港与北航站的公开/条件/秘密信息层；
- 无人介入时仍会推进的灯标、渡船、潮位和港务压力；
- 洛檀的价值、恐惧、底线、知识边界、语言和四类压力反应；
- 正常成功、部分成功、失败/拒绝、信息不足、重复处理与结算顺序；
- 北航站的权限、绕过、资源、人物运动、线索路线与失败后果；
- 调查、拒绝、行动失败和价值两难四组对话样例。

角色卡内容版本为 `2.2.0`；运行协调器版本为 `2.1.0`。本次版本把旧的“开场页直接写世界书、写目标 Swipe、自动发送”事务删除，改为玩家可审阅的复制交接。

## 构建与离线检查

在仓库根目录运行：

```powershell
npm test
npm run check -- --host-root "D:\AI\SillyTavern"
```

修改维护源码后，在本目录重建生成制品：

```powershell
node .\_build.mjs
```

`_build.mjs` 会阻止以下回归：

- 开场页重新取得世界书写入、Swipe 修改或自动发送能力；
- 缺少 Clipboard API 与手动复制回退；
- 三条路线缺少静态 Greeting；
- MVU运行合同、变量更新规则、变量路径索引或单一输出格式缺失；
- HTML 出现会破坏 fenced replacement 的序列；
- 玩家手记缺少数值楼层、`saveChat()` 或读回；
- 使用 `VARIABLE_UPDATE_ENDED` 冒充持久化完成；
- 世界、系统、角色或场景主合同缺少关键创作覆盖；
- 对话样例少于四类压力证明。

## 当前证据边界

- JSON、JavaScript、HTML 内联脚本、Tavern Regex 与离线夹具：可静态检查；
- 世界书、角色卡、ScriptFolder 结构与本地参考源码合同：`source_checked`；
- 真实 SillyTavern 导入、Clipboard 权限、玩家手动 Swipe/粘贴、首轮登记、插件联网、重载后持久化和浏览器视觉：`runtime: not_run`。

没有真实宿主证据前，不把本样本描述为实机通过。
