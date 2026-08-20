# MVU / EJS 技术配方

只在项目确实需要变量、跨楼层状态或动态模板时读取。涉及消息楼层、iframe、全局对象或真实 API 时，再按需读取一个 `host/` 参考。

## 先选最短路线

- 无变量：不启用 MVU；
- `native_schema`：由 `[initvar]` 的数据与 `$meta` 形成内部结构；
- `mvu_zod`：使用真实 Zod 脚本注册项目结构；
- `hybrid`：只有原生 Schema 与 Zod 各有明确职责时使用；
- `existing`：沿用已有且已验证的实现；
- EJS 与 MVU 分开决定。

状态栏不自动意味着需要 MVU。只启用 EJS 时，不生成 MVU Loader、Schema、`[initvar]` 或更新块。

## 用户档案与动态状态

世界书 `<user>` 条目是唯一静态档案源。稳定资料进入该条目；当前位置、资源、伤势、任务和关系变化进入运行状态。UI 可读取授权的只读镜像，但不得把完整静态档案复制成第二套 MVU 人物树。

创角提交时，静态字段写入 `<user>`，动态字段写入真实运行状态，两边分别读回。只改页面本地对象、聊天正文或消息 `data` 附件不算成功。

## MVU 底座

卡内加载 MagVarUpdate 时只能有一个 Loader：

```js
import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';
```

若宿主已经全局加载，不再附加第二个 Loader，而是在交付说明中记录宿主依赖。

所有新 MVU 路线都需要真实初值，并进入名称含 `[initvar]` 的 CharacterBook 条目。MVU_ZOD 只注册结构，不能代替初值。开场 `<initvar>` 是主世界书初始化后的覆盖层，不是无世界书时的独立启动器。

Zod 路线使用：

```js
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
```

`Schema`、默认结构、枚举、范围和 `registerMvuSchema(Schema)` 根据项目实际变量创作。`native_schema` 不强制该脚本。

## 更新协议

更新可以随正文同轮发生，也可以由额外模型解析。根据目标版本选择实际支持的 JSON Patch、lodash 命令或既有方言。

以下组件分别存在，不能互相冒充：

1. `[initvar]` 初值；
2. 变量结构/Schema；
3. 变量更新规则；
4. 回复输出格式；
5. 模型提示词侧清理；
6. 玩家显示侧清理；
7. UI 读取和必要写入。

只依赖目标版本已经验证的 `[mvu_plot]`、`[mvu_update]`、`[config_override]` 等行为。远程 bundle 记录准确 URL、版本、加载顺序和失败回退。

## EJS

EJS 是 ST-Prompt-Template 或既有宿主执行的真实模板正文，不是存储层。每份模板明确：

- 生成前、渲染后或消息处理阶段；
- 读取变量和作用域；
- 输出对象；
- `getwi`、`activewi`、`injectPrompts` 等调用；
- 缓存策略；
- 是否写变量或原始消息；
- 失败回退。

按名调用的世界书条目使用稳定名称，通常默认关闭且不参与关键词扫描。EJS 读取或写入 MVU 时明确方向和路径，避免 EJS、MVU、正则、脚本同时写同一字段。EJS 可以直接维护为世界书正文或独立文本文件，按目标宿主实际导入。

## 状态、UI 与清理

MVU UI 优先等待初始化并读取当前消息楼层：

```js
await waitGlobalInitialized('Mvu');
const state = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });
const stat = state.stat_data;
```

`display_data` / `delta_data` 不作为新 UI 的唯一数据源。编辑、Swipe、重载和聊天切换后重新读取对应楼层。

MagVarUpdate 可能追加 `<StatusPlaceHolderImpl/>`。提示词过滤不等于玩家显示替换；`<UpdateVariable>` 与占位符的 prompt/display 行为分别检查。完整更新块和流式未闭合块都要用真实正则夹具回放，确保技术内容不会裸露。

## 完成条件

- Loader、`[initvar]`、结构、更新、模型上下文和 UI 形成真实闭环；
- 变量路径只有一个写入权，读取者能处理缺失值；
- EJS 有真实模板、目标宿主和失败回退；
- Tavern Helper 保留真实 Script/ScriptFolder 结构；
- 角色主世界书已在真实 SillyTavern 导入并绑定；
- 未实测部分明确记录 `runtime: not_run`。
