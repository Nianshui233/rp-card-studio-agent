# MagVarUpdate 运行时参考

基线以目标 bundle 与现场能力为准。MagVarUpdate 仓库的包版本不足以表达当前功能，交付时记录实际 URL、commit/tag 或现场构建信息。

## 数据形状

当前楼层变量中的 MVU 数据至少包含：

```text
initialized_lorebooks
stat_data
schema
可选 display_data / delta_data
```

`stat_data` 是玩家状态根。`display_data` 和 `delta_data` 是变化显示，不应作为新 UI 的唯一真值。

## 初始化顺序

1. 从最近有效消息变量或空数据开始；
2. 扫描角色主书、附加书和全局启用书中名称含 `[initvar]` 的条目；
3. 把每个条目解析结果合入 `MvuData.stat_data`；
4. 生成/调和内部 Schema并清理 `$meta` 等标记；
5. 第 0 楼对每个 Swipe 分别建立消息变量；
6. 开场 `<initvar>` 存在时，用其内容替换角色主书基线，再加载其他书；
7. 继续解析该 Swipe 中的 MVU 更新命令。

因此 `[initvar]` 正文不能包含最外层 `stat_data:`。

MVU 会在聊天切换时销毁旧聊天级模块并重新初始化。每个消息 Swipe 有自己的变量快照；编辑、Swipe、删除和重演必须按实际楼层重读。

## 全局与唯一实例

MVU 通过 Tavern Helper 的唯一脚本机制只让一个名为 `MVU变量框架` 的实例运行。交付仍应只带一个 Loader，避免不确定的优先实例和重复网络加载。

MVU 将接口挂到父页面 `Mvu`，并发送 `global_Mvu_initialized`。Tavern Helper 消息 iframe调用 `waitGlobalInitialized('Mvu')` 后会取得代理。

等待没有内建失败结果；项目需要自己的超时和错误态：

```text
等待 Mvu 与超时竞争
→ 成功后再取当前楼层
→ 超时则显示“MVU 未就绪”、允许重试，不继续写入
```

## 读取

消息 iframe：

```js
const id = getCurrentMessageId();
const data = Mvu.getMvuData({ type: 'message', message_id: id });
const state = data.stat_data;
```

`getCurrentMessageId()` 不能在后台脚本 iframe调用。后台脚本从消息事件 payload、`getLastMessageId()` 或 `getChatMessages()` 取得明确数值楼层。

只读界面必要时可回退 `'latest'`；`'current'` 无效。关键写入必须使用明确数值 ID。

## 写入

```js
const before = Mvu.getMvuData({ type: 'message', message_id: id });
const next = await Mvu.parseMessage("_.set('角色.体力', 81);", before);
if (!next) throw new Error('没有解析到 MVU 更新命令');
await Mvu.replaceMvuData(next, { type: 'message', message_id: id });
const verified = Mvu.getMvuData({ type: 'message', message_id: id });
```

直接改本地对象、只改叙事正文或只写 `extra` 不算成功。

Tavern Helper 的 `ChatMessage.data` 映射消息变量；如果创建消息时写入的是完整合法 MvuData，它可以成为该楼快照，但仍需用 MVU API读回。不要把不完整对象伪装成快照。

## 事件 payload

当前事件族包括：

```text
VARIABLE_INITIALIZED(variables, swipe_id)
VARIABLE_UPDATE_STARTED(variables, ...版本相关参数)
COMMAND_PARSED(variables, commands, message_content)
VARIABLE_UPDATE_ENDED(variables, variables_before_update)
BEFORE_MESSAGE_UPDATE({variables, message_content})
```

不要依据旧教程把 `COMMAND_PARSED` 第一个参数当 commands。按目标 bundle 的类型和源码核对。

事件回调适合做幂等校正，例如范围限制和日期同步；不要和状态栏按钮、额外模型同时写同一字段。

## 更新与清理

MVU 扫描整条消息中的合法命令，自定义外层标签只负责组织和显示清理。`<StatusPlaceHolderImpl/>` 由 MVU在需要时追加；prompt 过滤与 display 隐藏分别验证。

完整更新块、流式半块、占位符、旧楼深度和额外模型模式都必须按实际协议检查。`runOnEdit` 可能把正则处理结果永久写回消息原文，不能机械开启。

## 版本能力

最低 Loader、工具调用、格式化输出、批量请求和角色卡配置覆盖是不同能力。现场只因 `Mvu` 存在，不能推断所有可选能力都可用。
