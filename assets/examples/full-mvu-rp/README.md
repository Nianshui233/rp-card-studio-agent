# full-mvu-rp：雾港航站（全功能综合样本）

这是样本矩阵中的**主参考样本**，目标不是把互斥实现机械叠加，而是给出一套职责闭合、可维护、可直接导入游玩的完整路线：

```text
角色卡与世界书内容
+ 固定 Greeting / 动态自定义开局
+ 独立一次性开场前端
+ 独立持续消息前端
+ MVU 原生 Schema 与差分更新
+ Tavern Helper 后台协调器
+ ST-Prompt-Template 的 MVU→EJS 只读桥
+ 静态通知正则
+ 卡内嵌 Scoped Regex
+ 保存、读回、竞态、失败与手动回退
```

纯静态 UI、非 MVU 消息快照、STPT `@@iframe` 等是**替代载体**，不与本样本的同一状态表面重复安装。这里覆盖的是完整功能类别和真实运行闭环，而不是在一个聊天里制造多套权威状态。

## 文件与职责

| 文件 | 作用 | 是否导入 |
| --- | --- | --- |
| `雾港航站.json` | V3 角色卡；含三条 Greeting Swipe、卡内嵌 Scoped Regex 与主世界书绑定名 | 是 |
| `雾港航站世界书.json` | MVU 初值/覆盖、输出合同、叙事、世界、人物、场景、系统、`<user>`、EJS 动态上下文 | 是 |
| `运行脚本.folder.json` | 唯一 MVU Loader + 雾港协调器 | 是 |
| `regex.json` | 卡内嵌正则的独立副本；与卡内嵌版本二选一 | 可选 |
| `开场.html` | 一次性开场/创角前端的完整维护源码 | 否 |
| `状态栏.html` | 持续消息前端的完整维护源码 | 否 |
| `运行协调器.js` | 开场事务、消息动作、持久化、EJS bridge 的维护源码 | 否 |
| `动态上下文.ejs` | STPT generate-stage 只读动态上下文源码 | 否 |
| `regex.fixtures.json` | 正则离线回放夹具 | 否 |
| `runtime.contract.test.mjs` | 固定/动态开局、回滚、输入仲裁、手记、EJS bridge、集合 Schema 与路径修正的宿主合同模拟 | 否 |
| `_build.mjs` | 从维护源码生成所有可导入 JSON，并执行关键合同断言 | 否 |

## 依赖与导入顺序

本样本按本仓库本次源码核对目标设计：

- SillyTavern 1.18.x；
- Tavern Helper 4.9.3；
- MagVarUpdate beta，Loader 锁定 commit `0a730cd4a9b99689d1135a49b542c780b977c24c`；
- ST-Prompt-Template 1.17.8.1（用于 EJS 动态上下文；缺少时主要 RP/MVU/UI 仍可运行，但没有该层 prompt bridge）。

建议顺序：

1. 安装并启用 Tavern Helper；如要使用 EJS 动态上下文，再安装 ST-Prompt-Template。
2. Tavern Helper → 脚本管理 → 导入 `运行脚本.folder.json`。
3. 在文件夹内依次启用 `MVU变量框架` 与 `雾港航站协调器`。一个聊天/角色不要再启用第二份 MVU Loader。
4. 导入 `雾港航站世界书.json`。
5. 导入 `雾港航站.json`。卡内 `extensions.world` 已指向 `雾港航站世界书`；若未自动绑定，在角色世界书设置里手动设为主世界书。
6. 新建聊天时允许角色内嵌 Scoped Regex。若不允许卡内正则，则手动导入 `regex.json` 为 Scoped；两者二选一，不要双装。
7. 使用 ST-Prompt-Template 时，建议关闭 `raw_message_evaluation_enabled`。本样本不需要执行原始 user/assistant 消息里的 EJS；`autosave_enabled` 对本样本的只读桥也不是必要条件。
8. **新建聊天**，不要在已有楼层的旧聊天里运行一次性开场提交。

Loader 需要联网拉取锁定 bundle；加载失败时开场页会保留手动 Swipe 回退，消息面板会显示明确错误态。

## 三条开局路径

### 1. 一次性开场页

默认第 0 楼显示独立 `开场.html`。页面采用“问题＋建议＋为什么＋影响”的结构，只收集：

- 玩家称呼；
- 公开来历；
- 可观察专长；
- 行事倾向；
- 开局路线。

正式字段不预填最终身份。预览后会冻结聊天身份、第 0 楼 Swipe/正文指纹、表单内容和可读取的输入框草稿；确认期间发生变化会取消旧提交。

### 2. 固定 Greeting

- `例行巡灯` → 第 0 楼 Swipe 1；
- `失联渡船` → 第 0 楼 Swipe 2。

协调器先精确更新唯一 `entry.name === '<user>'` 条目，再切换到目标 Swipe，向该 Swipe 的 `swipes_data` 写入玩家公开起点并等待 `saveChat()`。旧开场 iframe 即使被切 Swipe 销毁，后台协调器仍继续完成事务。固定 Greeting 不自动替玩家发言。

### 3. 动态自定义来意

动态路线使用 Swipe 0：

1. 更新 canonical `<user>`；
2. 写入 Swipe 0 的 MVU 初态；
3. 把第 0 楼改写成真实剧情 Greeting 与持续消息面板；
4. 通过 Tavern Helper 执行 `/send ... | /trigger`；
5. 等待真实 user 楼、真实 assistant 楼和该 assistant 楼的 MVU 快照；
6. 最后写入 committed metadata。

它不使用 `generate()`，也不把只改第 0 楼或只插入一条 user 消息冒充完整开局链。AI 生成失败但 user 楼已经保存时，不删除玩家消息；会标为可恢复并提示在宿主中继续生成。

## 持续消息前端

`状态栏.html` 只负责每楼运行状态，不包含创角或路线提交：

- 使用数值 `getCurrentMessageId()`；
- 显式读取 `Mvu.getMvuData({type:'message', message_id})`；
- 展示区域、天气、时段、潮位、安全度、体力、任务、关系、倒计时、物资、线索、玩家公开起点和本楼手记；
- 根据真实任务生成三个**写入输入框但不自动发送**的行动建议；
- 输入框已有草稿时不覆盖，返回冲突和可复制文本；
- 玩家手记通过协调器执行 `parseMessage → replaceMvuData(数值楼层) → await saveChat → 同楼读回`；
- 保存后发送项目自有 post-write 信号；
- 编辑/Swipe 使用 `MESSAGE_UPDATED`、`MESSAGE_SWIPED` 重读；
- `pagehide` 清理所有订阅；
- 不监听 `VARIABLE_UPDATE_ENDED` 冒充持久化完成。

旧楼展示旧快照，这是有意的消息楼层语义，不会偷偷改读最新楼。

## EJS 动态上下文

`雾港航站协调器` 监听 `prompt_template_prepare`，把最近有效消息的完整 MvuData 深拷贝到 `context.mvu`。世界书中的禁用条目 `STPT·MVU动态上下文` 使用：

```text
@@generate_before
@@always_enabled
@@activate
```

读取 `mvu.stat_data`，并通过 `await getwi('雾港航站世界书', '航站共识简报')` 取得按名简报。桥是只读的，不用 EJS 维护第二套变量，也不依赖 STPT 默认关闭的 autosave。

## 正则闭环

卡内与独立 `regex.json` 同源，包含：

1. MVU 更新块完整/流式隐藏；
2. Greeting `<initvar>` 显示隐藏；
3. `<航站通知>` 流式半块隐藏；
4. `<航站通知>` 纯静态 Markdown 显示；
5. `<航站开场/>` → Tavern Helper fenced opening iframe；
6. `<航站面板/>` / `<StatusPlaceHolderImpl/>` → fenced message iframe；
7. 通知的 prompt 语义摘要；
8. initvar、更新块和纯技术 marker 的 prompt 清理。

正则只作用于 assistant placement `[2]`，不会改写玩家消息。动态 HTML 完整内嵌在 fenced code block 中；两个 `.html` 文件只是可读维护主源。

## 世界与玩法内容

样本不是空壳技术演示。世界书包含：

- 会自行推进的雾港制度、维修预算、势力利益、公开/条件/秘密信息和航运压力；
- 世界硬/软边界、浓雾航行裁决以及无人介入时的势力下一步；
- 洛檀的目标、恐惧、价值排序、底线、内在冲突、日程、知识边界、语言和成长门槛；
- 洛檀在合作/索取、冲突/拒绝、压力/失败、价值两难四类情境中的行为合同；
- 三名具有目标、信息、谈判点、顾虑和场外下一步的相关人物；
- 北航站的世界锚点、危险、拓扑、入口、权限、绕过、人物运动、资源、时间、三条线索路线和失败闭环；
- 航站安全度、雾钟倒计时、洛檀信任的阈值语义、恢复方式、重复处理与固定结算顺序；
- 例行巡灯、失联渡船、自定义来意三条推进逻辑；
- 无隐藏骰点的观察—求证—付出成本—得到后果循环；
- 四组可直接校准角色和 MVU 的对话示例，并断言任务焦点与阶段同步。

## 2.1.0 创作合同补强

本版不改变 2.0.2 已验证的运行时协议，重点把主参考样本从“技术全功能＋中等创作深度”升级为“创作与技术共同完整”：

- 世界合同加入范围、制度代价、航行硬规则、信息分层、势力利益、无人介入推进和硬/软边界；
- 洛檀加入价值—行为、恐惧—压力、底线—反向边界、知识边界、语言与成长条件；
- 玩法系统加入正常成功、部分成功、失败/拒绝、信息不足、重复处理、结算顺序、数值阈值和恢复方式；
- 北航站加入世界锚点、整体危险、权限/绕过、人物运动、三条线索链和场景边界；
- `mes_example` 扩展为调查、拒绝、失败、价值两难四组，并修正旧示例只更新任务阶段、未同步 `角色.当前任务` 的漂移；
- `_build.mjs` 新增创作合同断言，防止后续把主参考样本重新压缩成只剩技术壳。

角色卡内容版本为 `2.1.0`；Tavern Helper 协调器运行协议仍为 `2.0.2`，因此现有运行合同测试和旧版字符串倒计时迁移保持不变。创作内容和 Greeting 初态的变更应通过重新导入并新建聊天验证；真实宿主创作表现仍标记 `runtime: not_run`。

## 2.0.2 第二轮实机日志修复

第二轮新聊天证明 2.0.1 的集合与完整路径修复已经生效：三条线索成功插入，`系统.航站安全度`、`系统.警报`、当前任务和任务阶段均正确更新。本版继续修复新暴露的两点：

- `系统.雾钟倒计时` 从带单位字符串（如 `20分钟`）改为分钟数值（如 `20`），因此可安全使用 `_.add('系统.雾钟倒计时', -3)`；状态栏负责补上“分钟”显示单位；
- 对已经使用 2.0.1 字符串倒计时的聊天，协调器会在下一次解析该字段的 `_.add` 时把命令转换成数值 `_.set`，避免同一错误继续发生；
- MVU 对 Greeting `<initvar>` 的元数据清理可能晚于第 0 楼首次显示，因此状态栏和 EJS 摘要会主动过滤 `$meta` / `$arrayMeta`，避免物资出现 `$meta×[object Object]` 或线索出现 `[object Object]`。

这次聊天 metadata 中没有 `mistport_opening`，玩家字段也保持“待登记”，说明它是直接切到固定 Greeting 的手动回退路线，没有执行开场登记事务；因此这份记录不能用于判断开场档案写入是否成功。要验证开场事务，应从默认 Swipe 0 页面完成预览和确认，再检查 committed metadata 与玩家字段。

## 2.0.1 实机日志修复

根据一次真实新聊天回放，本版修复了五个变量一致性问题：

- `线索` 数组加入 MVU `$arrayMeta`，明确 `extensible: true`，因此 `_.insert` / `_.remove` 不再被原生 Schema 拒绝；
- `物资` 对象加入局部 `$meta.extensible: true`，新增备用件、工具或临时物资时不再触发未知键错误；
- 更新规则列出完整路径，并明确 `航站安全度` 必须写成 `系统.航站安全度`；协调器还在 `COMMAND_PARSED` 阶段只对已知的精确根级简写做兜底修正；
- 开场玩家档案和路线初态不再直接修改 `stat_data`，改由 `Mvu.parseMessage` 生成完整 MvuData，再整体写回目标 Swipe，避免 `display_data` / `delta_data` 仍停留在“待登记”。
- 更新合同要求警报通知同步 `系统.警报`，任务焦点切换时同步 `角色.当前任务` 与 `任务.主线.阶段`，发生可感知耗时时更新倒计时，减少正文与状态栏漂移。

旧聊天已经生成的 Schema 不会因重新导入文件自动改变。验证本修复时，应重新导入更新后的世界书、角色卡与 ScriptFolder，并**新建聊天**；不要用旧聊天判断新初态是否生效。

## 构建与离线检查

在本目录运行：

```powershell
node .\_build.mjs
node ..\..\..\scripts\regex\validate-tavern-regex.mjs .\regex.json
node ..\..\..\scripts\regex\run-regex-fixtures.mjs --regex .\regex.json --fixtures .\regex.fixtures.json
```

`_build.mjs` 还会阻止以下回归：

- 两种前端重新混合职责；
- HTML 中出现会破坏 fenced replacement 的序列；
- 关键写入重新使用 `message_id:'latest'`；
- 使用 `VARIABLE_UPDATE_ENDED` 当保存完成事件；
- 缺少 canonical `<user>` 精确匹配；
- 动态开局丢失 `/send → /trigger`；
- 玩家手记缺少数值楼层、`saveChat()` 或读回；
- 世界、系统、角色或场景主合同缺少关键创作覆盖；
- 对话样例少于四类压力证明，或任务焦点与任务阶段没有同步。

## 当前证据边界

- JSON、JavaScript、HTML 内联脚本、Tavern Regex 与离线夹具：可静态检查；
- 世界书、角色卡、ScriptFolder 结构与本地参考源码合同：`source_checked`；
- 真实 SillyTavern 导入、插件联网加载、Greeting iframe 销毁后后台续跑、真实生成、重载后持久化和浏览器视觉：`runtime: not_run`。

没有真实宿主证据前，不把本样本描述为实机通过。
