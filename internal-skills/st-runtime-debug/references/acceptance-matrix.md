# 真实宿主验收矩阵

## 变量卡故障排查证据行

对 MVU/MVU_ZOD 项目，验收表必须单独记录以下行，而不是把“回复看起来正常”当作一个总结果：

| 检查面 | 必须看到的证据 | 不能由它单独证明的内容 |
| --- | --- | --- |
| 消息变量 | 当前数值 message/Swipe 有 `stat_data` 与 `schema` | Prompt 一定看到了当前状态 |
| 注册与初始化日志 | Loader 就绪、ZOD 注册成功、初始化无错 | 后续模型会遵守输出合同 |
| 后端 Prompt | 变量列表、更新规则、输出格式、状态投影实际展开 | 模型一定输出 UpdateVariable |
| 原始 assistant 回复 | 完整 `<UpdateVariable>` 与 `<JSONPatch>`/选定方言 | MVU 一定接受每个操作 |
| 变量管理器读回 | 更新后的同一楼层值存在 | 状态栏已经刷新 |
| 状态栏/消息前端 | 当前 message_id、Swipe 和显示值一致 | 聊天文件已经耐久保存 |
| 保存/重载 | 保存后重载仍读到同一值 | 其他旧聊天也兼容 |

测试 Prompt 时，记录“原始世界书文本”和“宏替换后的最终 Prompt”两个版本。测试阶段可以启用模板和宏；制作/排查 Prompt 路由时先关闭它们观察原始输入，避免把两个阶段混为一谈。

## 证据身份与关闭条件

先记录：目标 SillyTavern/扩展版本、浏览器与视口、角色/聊天、当前 Swipe/消息数、导入状态，以及所有导入制品的 SHA-256。每行报告 `passed/failed/blocked/not_run` 和至少一个可观察证据；标明该证据不能证明什么。

只读源码/静态包检查不是 `runtime_pass`。真实运行通过必须针对这个哈希对应的制品，在记录的真实 ST 环境完成所选路径。任何源码或打包改动都会产生新制品身份，旧证据不自动适用。用户体验是否达标留给用户确认。

```text
Import        制品和所有运行组件存在
Dependencies  embedded/host/remote/regional/optional/development-only 分类一致
Fresh chat    首条消息和开场表面出现
Console       没有新增因果错误和未处理 Promise
DOM           元素数量、所属 frame、属性和尺寸正确
Interaction   点击、键盘、表单、关闭、重复提交正确
Data          明确数值楼层/Swipe/作用域改变并即时读回
Persistence   等待目标保存；关键数据重载或重开聊天后仍可读
Opening       chat/draft/Swipe 竞态守卫；固定路线验 Swipe/初态；动态路线验 user→AI→初始化
Events        MVU 变换事件不冒充持久化完成；assistant 重渲染与 user post-write 分开
Carrier       TH 与 STPT 使用各自 message ID、父页权限和清理合同
EJS safety    raw-message/sandbox/autosave 现场值与项目意图一致
Lifecycle     编辑、Swipe、重载、聊天切换不重复、不丢失
Responsive    窄屏、长中文、触控不裁切
Fallback      宿主能力缺失时能复制文本、保留输入或保持普通叙事
```
