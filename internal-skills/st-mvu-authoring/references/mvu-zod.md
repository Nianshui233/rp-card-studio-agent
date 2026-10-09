# MVU_ZOD 完整交付路线

MVU_ZOD 不是“MVU 加一个可选 Schema 文件”。选择 mvu_zod 后，下列职责构成不可拆散的完整制品；缺件应在原路线补齐，不降级为 native，也不凭文件数量宣称完整。

## 必需制品清单

1. 唯一 MagVarUpdate Loader：保留已验证教程/模板的静态 import，记录实际 URL 和版本画像。
2. 完整 Zod Schema 源码：只定义项目实际需要的状态、类型、范围、默认值和 transform。
3. 独立注册入口与可导入脚本：导入 canonical Schema 和真实 mvu_zod.js，在宿主 Ready 后调用 registerMvuSchema；导入的是构建结果，不是残留相对 import 的源码。
4. 初始化：完整禁用的世界书 [initvar] 基线；每个 Greeting 可以继承基线、全量覆盖或通过更新命令修改差异。
5. 变量更新规则：覆盖项目状态根和实际可写字段族，说明 check、触发、不更新条件和单写者。
6. 当前变量列表与变量路径索引：真实当前值必须到达更新模型；路径与 Schema 一致，可使用静态索引或明确作用域的动态状态投影。
7. 变量输出格式：只选一种目标 parser 支持的方言，规则、示例、Regex 与 fixture 保持一致。
8. Regex：显示隐藏/美化、流式处理与历史 Prompt 清理分开验证，不永久删除原始更新块。
9. 真实消费者：状态栏、脚本或只读 EJS bridge 使用存在的路径，不创建影子状态树。
10. 运行合同与证据：保存、重载、消息楼层/Swipe、旧聊天和真实宿主回归。

完整的 source→build→import 操作见 mvu-source-build.md；所有静态结果都不能替代宿主验收。

## Schema 与动态对象

从已确认的状态合同生成 Schema，不从样本 UI 倒推字段。标量类型、数值单位/范围、enum、Record、Array 和派生/只读字段各有自己的语义。只要求项目实际使用的类型，不强制所有项目都有 Record 或 Array，不按固定字数判断规则完整性。

动态实体的缺字段策略需要有意识地设计，例如：

```ts
z.record(z.string(), z.object({
  当前状态: z.string().prefault('待初始化'),
  备注: z.string().prefault(''),
}).prefault({}))
```

这允许新增实体时遗漏部分字段而不丢掉整批对象；后续依据事实补齐。待初始化不能被 UI 伪装成已确认。prefault/default、coerce、transform 的真实效果通过项目 Schema 执行测试。

宿主注册复用其 z；离线检查的 Zod 版本单独记录，不宣称离线包就是宿主版本。Schema 模块不混入 Loader 或注册过程。若宿主 z 只能在 Ready 后获得，可导出 createSchema(z)，由入口在就绪后创建并注册；不要为符合静态文本模式而写出未定义的顶层 z 调用。

## 初始化策略

- [initvar] 世界书必须实际绑定/启用；条目自身禁用，避免基线当作当前剧情发给模型。正文就是状态树，不再包 stat_data。
- Greeting <initvar> 是全量替换，不是 YAML 合并；各 Swipe 独立验证全量根、类型与场景值。
- Greeting <UpdateVariable> 可以在共同基线上增量改变几个字段；用目标 MVU parser 和实际第 0 楼快照验收，不将部分 YAML 冒充全量 initvar。
- 默认值能补齐字段不等于角色身份、目标或关系已经由用户确认；未知状态保持未知。

## 三类 Prompt 与路由

变量列表回答“当前值/含义”，靠近最新剧情 D0 或 D1；更新规则回答“触发/check”，可以放在角色定义前后或其他已验证深度；输出格式回答“可执行命令形状”。不用把所有相关条目塞在 D0。

默认变量列表：

```text
<status_current_variable>
{{format_message_variable::stat_data}}
</status_current_variable>
```

可以拆分、条件化或组合这些职责。简明且自解释的字段可以合并规则；复杂状态不能以一段泛化规则替代实际边界。更新必须基于本轮可指认事实，避免重复结算历史剧情。当前消息/Swipe 的缺少快照行为必须明确。

额外模型解析时，[mvu_plot] 给叙事侧，[mvu_update] 给更新侧；无标记在已适配世界书中可给两侧，附加书适配情况以目标 bundle 为准。当前状态不能只发送给叙事模型。标记不替代蓝灯/绿灯、关键词、深度、预算和实际 Prompt 查看器验收。

下划线开头字段是模型只读；美元符号开头字段被格式化宏隐藏，不等于不可写。显示隐藏、写入权限、派生逻辑必须分开定义。

## 方言与 Regex

- JSON Patch 的教程操作是 replace/delta/insert/remove/move；move 使用 from/to。目标 parser 如果使用 from/path，运行合同声明 patch_move_target: path；不要照搬通用 RFC 替代核对实际 parser。
- lodash 路线只用目标 MVU 实际支持的命令；不能与 JSON Patch 混用。
- 输出格式中的占位模板不是可执行 fixture；另外准备实际值的回归输入。
- 历史 UpdateVariable 可以用“仅格式提示词”清理；最小深度可以保留最近更新，以免重复结算。显示隐藏/美化另走 display 通道。
- 不永久删除消息中的原始更新块；不删除当前变量列表、初始化或状态载体合同；技术清理默认不在编辑保存时永久写回。

## 消费、写入与运行证据

调用 Mvu API 前等待 waitGlobalInitialized('Mvu')。关键写入选择明确数值楼层，读取完整 MvuData，更新/写回同一消息，保存，再同面读回；重要事务保存后重载再次读回。UI 写入要留下叙事可理解的操作记录，不能只让 UI 自己知道数值变化。

离线至少执行真实 YAML 解析、实际 Schema、缺字段/default、coerce、transform、enum 拒绝和项目实际使用的动态结构 fixture。生成的 schema.json 辅助编辑/初始化检查，不替代实际 Zod transform 执行。

真实酒馆验收至少覆盖 Loader 和 Schema 注册、初始化、处理后的两侧 Prompt、一次真实模型更新、消息楼层变量、消费者、Swipe/编辑及保存重载。静态语法、构建、模拟事件或即时读回都不能称为宿主通过；未执行保持 runtime: not_run。
