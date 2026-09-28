---
<status_current_variable>
{{format_message_variable::stat_data}}
</status_current_variable>

【项目名 · stat_data 路径索引】
本文件必须由最终 Schema 生成/核对，不能保留示例中不存在或缺失的路径。

如果项目采用 `{{format_message_variable::stat_data}}` 注入完整当前状态，可以把它作为动态全量索引；此时仍要在运行合同中说明当前消息/Swipe 作用域，并保留 Record/Array 的操作规则。不要把动态全量索引和静态路径索引混写成两个互相矛盾的状态源。

一、世界
  /世界/当前日期
  /世界/当前时间
  /世界/当前地点

二、玩家
  /玩家/姓名
  /玩家/生命值
  /玩家/体力
  /玩家/背包/物品名称

三、任务
  /任务/主线/名称
  /任务/主线/阶段
  /任务/主线/进度

四、现场
  /现场/敌对单位/0
  /现场/可调查目标/0

Record 使用对象键，例如 `/玩家/背包/能量棒`。
Array 使用下标，追加使用目标方言支持的末尾位置。
