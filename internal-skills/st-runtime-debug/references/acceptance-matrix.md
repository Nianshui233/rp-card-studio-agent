# 真实宿主验收矩阵

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
