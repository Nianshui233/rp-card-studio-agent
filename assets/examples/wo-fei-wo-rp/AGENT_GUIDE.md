# Agent 样品注释索引：如何读这个完整制品

> 本文件只给 Agent/维护者阅读，不是导入组件，也不得复制进角色卡、世界书作品条目或玩家可见页面。

## A. 先判断文件层级

```text
我，非我.重构版.json / 我，非我.世界书.json
  = 玩家会导入的制品；不能加入维护说明。

开场入口页.html / 消息状态栏.html
  = 玩家会看到的消息内前端；代码可有实现注释，玩家可见文案不得解释宿主工具。

schema.js / 01-04 / MVU运行合同.yaml / regex.json / 运行脚本.folder.json
  = 运行层；负责把作品语义交给宿主执行，不能反向定义世界观。

README.md / AGENT_GUIDE.md / 导入说明.md
  = 样品解释和维护层；可以详细解释为什么这样设计。
```

## B. 来源顺序是硬规则

做旧卡改造时按下面顺序读，不要从样本矩阵倒推需求：

```text
原始卡与用户材料
→ 当前项目的 canonical 源
→ 用户已确认的新决定
→ 运行能力合同
→ 样本技术实现
→ Agent 自己的提案
```

本样品的入口页字段来自《我，非我》原始卡的创角页，不是来自 之前的通用样品矩阵或任何通用表单。另一个项目没有相同语义时，不得复制这些字段。

## C. 作品层与运行层不能互相污染

`世界书`文件中同时存在作品条目和运行合同条目，不代表它们属于同一层：

- uid 0–42：作品世界、角色、系统和玩法语义；由项目内容决定；
- uid 43–46：MVU 运行合同；只为宿主解析服务；
- uid 47–49：叙事/开场/主控资料规则；必须使用作品内可读的行为语言，不解释“加载器”“脚本”“条目路径”等工程过程。

如果把“怎样让宿主读到它”写进 uid 47–49，说明实现层回流到了作品层，应退回修改。

## D. 主控字段为什么不能随便补

例如 `当前目标`：

- 可以来自玩家资料中明确写出的目标；
- 可以来自玩家在剧情中明确说出的目标；
- 可以在正文发生明确的放弃/完成事实后更新；
- 不可以来自“眼前场景显然需要做什么”；
- 不可以因为页面有这个字段就给它填默认值；
- 不可以把 Agent 的建议写成主控已经决定的事。

同样规则适用于身份、关系、承诺、完成状态、好感度和关键数值。

## E. 前端的自由与硬边界

### 可以自由发挥

- 页面排版、色彩、字体、间距、动画；
- 同一真实字段的卡片、表格、仪表或文字呈现；
- 空态文案的自然语言；
- 内联 SVG 的装饰与无障碍补充；
- 错误回退的玩家可见措辞。

### 必须固定

- 数据只能来自唯一真实状态载荷；
- 不创建第二套持久状态；
- 不伪造默认玩家或示例数据；
- `schema` 的对象/字符串/缺省形状不应阻断已有 `stat_data` 渲染；
- SVG 元素不能把只读 `className` 当普通 DOM 属性赋值；
- 编辑消息、切换 Swipe、重载和无状态楼层要有回退；
- 前端玩家文案不能泄露内部接口、文件结构、维护路径或调试堆栈。

## E.1 iframe 画布与黑边

消息内 HTML 的 `body` 不等于页面外壳。默认让 `html/body` 透明，把深色背景放在真正的内容 surface 上；否则宿主背景、iframe 画布和 `max-width` 内容容器之间会出现黑色边缘。看到黑边时先画出三层背景并做父容器截图，不要直接增加 border、固定高度或 overflow 裁切来掩盖问题。

## F. 修改样品时的验证顺序

```text
1. 说明改动属于作品层、运行层还是维护层；
2. 说明来源：原始卡、用户决定、canonical 源、运行必需，还是仅参考；
3. 若新增作品字段/流程，先停下来作为提案，不自动落盘；
4. 更新实际样品文件；
5. 运行 package validator、Regex fixtures、Schema/initvar 检查和完整 npm test；
6. 用真实状态快照回放正常、schema 字符串、schema 缺省、空态、部分状态、Swipe 和重载；
7. 更新 README/注释，让下一个 Agent 知道“为什么这样写”；
8. 不把样品通过写成真实宿主验收。
```

## G.1 前端宿主载体

本样品的两个页面固定使用 Tavern Helper / JS-Slash-Runner message iframe，不是通用 HTML 页面：

```text
container: div.TH-render
source detection: pre/isFrontend
iframe id: TH-message--{message_id}--{index}
height: TH_UPDATE_VIEWPORT_HEIGHT
```

开场 marker 是 `<我非我开场/>`，状态栏 marker 是 `<StatusPlaceHolderImpl/>`；两条 Regex 都必须使用 fenced HTML、`markdownOnly=true`、`placement=[2]`、`promptOnly=false`、`runOnEdit=false`。

状态栏从当前消息楼读取：

```js
Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() })
```

`getCurrentMessageId`、`Mvu` 和 `waitGlobalInitialized` 都属于 Tavern Helper 宿主能力；不要把它们改成普通网页自造的全局变量，也不要用 `latest` 或上一楼缓存替代当前消息楼。

前端必须考虑 `render_started/load/swipe/edit/reload/delete/pagehide` 生命周期。流式路线在本样品中明确关闭；如果另一个项目启用流式，必须另做 streaming fixture 和宿主回归。

## G. 这个样品的已知路线

```text
独立世界书 + V3 角色卡 + 独立 Regex + ScriptFolder
+ MVU_ZOD + worldbook initvar + JSON Patch
+ 一次性入口页 + 持续消息状态栏
+ 不启用 EJS，不启用 MVU→EJS bridge
+ 开场/消息页面固定走 Tavern Helper message iframe 载体
```

不要从这个样品推断“所有项目都应该启用这些能力”。它只展示：当用户确实选择这些能力时，如何让来源、状态、页面、Regex 和宿主载荷闭合。

## MVU 工程组织与注释说明

本样品只有一份 canonical Schema：`schema.js` 不含注册器；`MVU源/注册入口.js` 负责就绪后注册，`MVU源/加载入口.js` 保留原有 Loader。`MVU源码合同.json` 绑定实际代码、01～04 变量源、世界书、角色卡、正则及项目 Schema fixture；`MVU构建/` 只有当前构建结果，不是另一条路线或备份。ScriptFolder 由源码构建，保持既有 ID、名称与按钮元数据。

变量源现在与实际条目正文逐字一致，工程解释集中在本指南，不将注释说明发送到模型的 RP 上下文。各变量源的用途说明如下：

### 01-初始化基线.yaml

这是唯一的空白初始状态。空对象/空数组代表“尚未发生”，不是等待 Agent 自由补全的邀请。

### 02-变量更新规则.yaml

每个字段的 check 是写入门槛。没有用户原话、材料事实或本轮可指认事件，就保持原值。
特别注意：表单字段不等于用户决定，场景压力不等于主控目标。

### 03-变量列表.txt

这是机器可用路径索引，不是让 Agent 随意扩展的字段清单。
Record 动态键与 Array 下标的规则必须与 Schema 和更新方言一致。

### 04-变量输出格式.yaml

这是机器输出协议。它可以解释 JSON Patch 的形状，但不能出现在作品叙事层。
更新块只记录事实变化；状态 marker 只负责把真实状态交给消息前端。

### 构建与验收

从 Agent 根目录执行：

```powershell
node scripts/mvu/mvu-zod-project.mjs build --root "assets/examples/wo-fei-wo-rp" --contract "MVU源码合同.json" --out "MVU构建"
node scripts/mvu/mvu-zod-project.mjs validate --root "assets/examples/wo-fei-wo-rp" --contract "MVU源码合同.json"
```

实际 YAML 和样品 Schema 已用于离线 fixture（初态、数字字符串/范围归一化、非法枚举）；每次检查重新构建并对比最终 ScriptFolder。JSON Schema 只是结构辅助，不替代真实 transform 执行。这里不声称完成新版精确制品的酒馆导入/保存验收：runtime 保持 not_run。不要复制这些字段到别的作品；复制的是责任边界与校验方法。
