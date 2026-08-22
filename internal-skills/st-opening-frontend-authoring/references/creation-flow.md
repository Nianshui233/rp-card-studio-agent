# 创角、事务写入与正常开场交接

创角前端只收集正式开局确实需要的玩家资料与初始选择。它不为完整感要求玩家在不了解世界时填写整套履历，也不预填最终玩家人物。

## 字段分工

```text
稳定玩家档案
→ 唯一 canonical <user> 世界书条目

动态开局状态
→ 选中的目标 Greeting Swipe 的 MVU 或项目状态

页面草稿
→ 绑定稳定聊天身份，只服务未提交表单和预览

动态开局发言
→ canonical buildOpeningMessage(draft) 生成的真实 user 消息
```

一个事实只能有一个权威来源。稳定档案和动态状态有意重复时说明哪个是权威、另一个如何派生或同步。

## 表单规则

- 正式字段默认空白；placeholder 只能举例，不能成为提交值；
- 快速预设默认不选，玩家主动选择后仍可逐项编辑；
- 只要求会改变开场、长期称呼、权限或运行初态的字段；
- 可留到 RP 中自然形成的资料明确标记可选；
- 不读取或猜测制作用户本人的身份作为玩家默认值；
- 校验错误贴近字段显示，并保留其他已填内容；
- 预览和最终发送使用同一个 `buildOpeningMessage(draft)`，不维护两套模板。

## 草稿隔离

草稿键优先使用稳定 chat UUID；无 UUID 才使用角色/群组 + chat ID 的明确 fallback。聊天重命名不应产生新主键，分支应产生独立草稿身份。

草稿至少含：

```text
owner/chat identity
schema_version
draft revision/hash
selected route
player fields
opening body
updated_at
```

损坏或旧版草稿隔离迁移，不让 A 聊天草稿串到 B 聊天。

## 两类提交协议

### A. 固定 Greeting 路线

第 0 楼 `first_mes/alternate_greetings` 是真实 assistant Swipe。动态初态属于最终选中的 Swipe。

推荐协议：

```text
capture chat + draft + current 0楼 swipe/revision
→ validate dependencies
→ 切换到目标 0楼 swipe_id
→ 旧 iframe可被销毁；由后台协调器或新实例确认目标 Swipe
→ 向目标 Swipe 写动态初态
→ 保存并按目标 Swipe 读回
→ 如需玩家开局发言，走正常发送链
→ 确认 committed
```

不能：

```text
先向当前 Swipe 写初态
→ 再切另一个 Greeting
```

否则初态可能留在旧 Swipe。

### B. 动态创角/自定义开局路线

```text
capture context
→ flush draft
→ validate draft and dependencies
→ build preview/message
→ final confirm
→ snapshot persistent targets
→ 写 canonical <user> 档案
→ 写动态初态
→ 显式等待宿主保存
→ 分别读回；关键项目按需重载后再读回
→ rebuild message from frozen draft
→ recheck chat/draft/0楼/input/runtime
→ 将文本放入 ST 输入框
→ 触发正常发送
→ 确认真实 user 楼创建
→ 确认真实 AI 楼创建
→ 确认变量初始化/状态可读
→ 写 opening committed 标记并清理草稿
```

`generate/generateRaw` 只返回生成结果，不创建聊天楼层；`createChatMessages` 直接插入 user 楼也不自动走正常 AI 生成链。二者不能单独冒充“进入正式 RP”。

## canonical `<user>` 条目

优先使用当前 Worldbook API：

```text
getWorldbook(目标书)
→ 精确筛选 entry.name === '<user>'
→ 0 个：createWorldbookEntries
→ 1 个：按 UID 通过 updateWorldbookWith 更新并启用
→ 多于 1 个：停止并报告冲突，不猜哪个是 canonical
→ 重新 getWorldbook
→ 按 UID + exact name 读回
```

不使用 deprecated `getLorebookEntries({filter:{comment:'<user>'}})` 判断唯一性；其字符串 filter 是包含匹配，可能误匹配近似名称。

## 动态初态与持久化

- MVU 写入完整 MvuData，不只写 `stat_data`；
- 所有关键写入使用明确数值楼层，不使用 `'latest'`；
- `Mvu.replaceMvuData`/`replaceVariables` 后立即读回只表示内存接受；
- 关键提交调用已验证的 `saveChat()`/世界书保存接口并等待完成；
- 若提交完成声明包含“刷新后仍在”，必须实际重载或重开聊天后读回；
- 任一步失败不能显示整体成功。可安全回滚时回滚；不能回滚时展示已成功/未成功部分和可恢复动作。

## 输入框仲裁与正常发送

最终动作尽可能等同玩家在 ST 输入框发送一条正常消息：

- 输入框为空：填入 frozen canonical message 并触发正常发送；
- 输入框已有未提交文本：不覆盖，提示玩家合并、替换或取消；
- 自动发送失败：保留文本，让玩家手动发送；
- 发送后按聊天长度、角色、内容指纹和事件确认真实 user 楼，不只检查按钮点击成功；
- 再确认正常 AI 楼与变量初始化，不自行调用独立 `generate()` 填充一楼。

## 提交锁与恢复

提交时设置单实例锁和 AbortController。重复点击复用当前事务或明确拒绝；切聊天、切 Swipe、卸载或上下文 revision 变化时 abort。旧 iframe 被销毁后，由后台协调器或新实例从 chat-scoped pending transaction 恢复，不把提交锁只放在即将消失的页面局部变量中。

固定 Greeting 在目标 Swipe/初态保存并读回后写 `opening committed`；动态自定义开局在真实 user 楼存在后写标记，并继续验证真实 AI 楼与变量初始化。标记用于阻止刷新后重复提交，但不能禁止玩家编辑或分支；重新开局需要显式重置流程并说明影响。

## 验收情境

至少执行：

1. 全空或缺失必填值；
2. 一个主动选择的非默认值；
3. 确认期间切聊天或首消息 Swipe；
4. canonical `<user>` 已存在、缺失和重复冲突；
5. 内存写入成功但保存失败；
6. 输入框已有玩家文本；
7. 重复点击与页面重挂载；
8. 动态自定义路线：真实 user 楼 → 真实 AI 楼 → 变量初始化；固定 Greeting 路线：目标 Swipe/初态后交还输入权；
9. 刷新或重开聊天后状态仍能读回。

没有真实 SillyTavern 证据时记录 `runtime: not_run`。
