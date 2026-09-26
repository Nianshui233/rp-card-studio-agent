# MVU_ZOD 完整交付路线

MVU_ZOD 不是“MVU 加一个可选 Schema 文件”。一旦选择 `mvu_zod`，以下组件构成不可拆散的完整制品；缺任何一项都不能降级为 native MVU 后继续交付。

## 必需制品清单

1. **唯一且锁版本的 MagVarUpdate Loader**；
2. **完整 Zod Schema 源码**，覆盖所有持久状态根、嵌套对象、Record、Array、enum、范围、默认值和必要 transform；
3. **可导入的 ZOD Tavern Helper Script/ScriptFolder**，导入锁版本 `mvu_zod.js`，导出 `Schema`，在宿主 Ready 后执行 `registerMvuSchema(Schema)`；
4. **唯一初始化策略**：完整世界书 `[initvar]` 基线，或每个可游玩 Greeting/Swipe 的完整 `<initvar>`；
5. **详细变量更新规则**：逐状态根、逐字段族说明何时更新、何时不更新、范围、频率、新增/删除/迁移和单写者；
6. **当前状态注入与变量路径索引**：让更新模型看到真实 `stat_data`，并明确标量、Record、Array 的可写路径；
7. **变量输出格式**：选择并只选择一个真实方言（JSON Patch 或 MVU lodash 命令），给出合法操作与路径示例；
8. **Regex 闭环**：隐藏 initvar、处理完整/流式更新块、prompt/display 分工，并为状态栏占位符提供真实消费者；
9. **真实消费者**：状态栏、EJS bridge 或其他组件只能读取 Schema 中存在的路径；
10. **导入说明与验收证据**：版本、顺序、联网失败、旧聊天策略和 `runtime: not_run/pass`。

缺 ZOD、更新规则、路径索引、输出格式或初始化覆盖时必须阻断，不得以“先做简版”“以后补”或“native 也能跑”为理由降级。

## Schema 制作

从已经确认的状态合同生成 Schema，而不是从状态栏字段倒推：

- 标量明确 `string/number/boolean/enum`；
- 数值使用 coerce、范围 transform 和清楚单位；
- 动态命名对象使用 `z.record`，不要误写固定数组；
- 有顺序、允许重复的集合才用 `z.array`；
- 所有顶层状态根有稳定名称；
- `.prefault()`/`.default()` 与锁定的 Zod 版本一致；
- 只读/派生字段不交给模型写；
- Schema 复用宿主 `window.z`/全局 `z`，不引入第三个 Zod 实例。

## 初始化策略

### 世界书基线

使用完整 `[initvar]` 条目。所有可游玩 Greeting 默认继承；若某 Greeting 提供 `<initvar>` 覆盖，该覆盖必须是完整状态树，不能只写差异片段。

### 每 Greeting 初态

每个真正可进入剧情的 Greeting/Swipe 都必须有完整 `<initvar>`，顶层键与 Schema 完全一致。纯载体 marker（例如只含 `<介绍>` 的页面）可以没有初态，但它不能直接进入游玩。

所有 initvar 至少检查：

- YAML 可解析；
- 顶层键与 Schema 一致；
- 值类型可被 Zod 接受；
- route-specific 值确实属于目标 Swipe；
- 不存在 `stat_data.stat_data`。

## 更新规则不是摘要

Zod 只负责校验，不会教 LLM 何时改变状态。详细规则必须覆盖所有可写状态根，并写清：

- 触发事实；
- 不更新条件；
- 数值范围、单位和合理单次变化；
- Record 新建/修改/删除；
- Array 插入/删除/去重；
- 对象在不同状态根之间迁移；
- 只读字段和脚本单写字段；
- 同轮冲突与结算顺序；
- 至少一个合法更新示例。

复杂 Schema 不允许只交付几条泛化规则。

## 当前状态与路径索引

变量更新上下文必须包含当前状态，例如：

```text
<status_current_variable>
{{format_message_variable::stat_data}}
</status_current_variable>
```

并提供与 Schema 同步的路径索引。JSON Patch 使用 JSON Pointer；lodash 方言使用完整点路径。每个顶层根必须出现，Record 和 Array 路径示例必须分开。

## 输出方言

项目只选一种：

- JSON Patch：`replace/delta/insert/remove/move` 等目标 provider 真实支持的操作；
- MVU lodash：`_.set/_.add/_.assign/_.insert/...` 等锁定版本支持的命令。

输出合同、更新规则、Regex、fixture 和实际解析器必须使用同一方言。禁止输出合同写 JSON Patch、示例却混入 lodash，或 Regex 仍匹配旧标签。

## ScriptFolder

推荐一个可导入 ScriptFolder 同时携带：

```text
MVU Loader
ZOD Schema 注册脚本
项目运行协调脚本（如实际需要）
```

卡内嵌脚本与独立 ScriptFolder 同时交付时，按名称核对内容完全一致。Loader 和 `registerMvuSchema` 各只能有一个。

## 静态与运行验收

静态检查至少运行：

```powershell
node scripts/validate-rolecard-package.mjs ... --zod-source "配置/MVU/schema.js" --mvu-contract "配置/MVU运行合同.yaml"
python -X utf8 scripts/mvu/validate-initvar-yaml.py --card "导入：项目名/角色卡/项目名.json" --zod-script "配置/MVU/schema.js"
```

运行验收至少覆盖：

- 正常初始化；
- 缺字段由 prefault 补全；
- 字符串数字 coerce；
- 数值 clamp；
- enum 非法值；
- Record 新键；
- Array 插入/删除；
- Zod 拒绝后的错误与状态保留；
- 所有 Greeting/Swipe；
- 一次真实模型更新；
- 状态栏读取；
- 保存、重载和旧聊天。

静态通过不等于 Zod 在目标宿主实际运行通过。
