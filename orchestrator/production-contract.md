# 生产级制品合同

这是 RP Card Studio 的工程生产层合同。它不替代世界观、角色和访谈 Skill，而是把“正确产出”变成可重复的项目结构、构建、验证和宿主回归流程。

## 目标

```text
用户依据
→ 访谈覆盖
→ canonical 创作源
→ 运行合同
→ 确定性构建
→ 单一路线交付 manifest
→ 静态检查
→ 真实宿主回归
→ 用户验收
```

任何一步缺失，都只能称为候选或未完成，不能称为最终正确。

## 项目生产状态

每个需要运行组件的项目必须有：

```text
.rp-card/production.json
创作源/
配置/
验收/
导入：项目名/manifest.json
fixtures/
```

`.rp-card/production.json` 只保存生产状态、组件门禁、诊断证据和交付指针；RP 内容仍以 `创作源/` canonical 为权威。

## 访谈完整性与深度

访谈不能以“问过一个问题”或模型认为“信息够了”结束。每个阶段使用 coverage profile，维度状态必须是 `confirmed`、`delegated`、`deferred` 或 `not_applicable`，并且达到最低深度：

```text
surface      表层方向
structured   结构确认
detailed     细节确认
runtime      真实运行/宿主确认
```

缺少必要维度、深度不足、依赖项未展开或仍有阻断性未决项时，禁止进入制作。阶段报告必须列出已确认、已放权、已暂缓、仍未回答和准备代定的事项。

## 前端阶段门禁

开场前端或消息前端在访谈覆盖前不得实现。至少需要明确：

- 玩家体验和内容层级；
- 数据来源与唯一写者；
- 生命周期：当前楼、Swipe、编辑、重载；
- 交互是否写输入框、剪贴板或自动发送；
- 空态和宿主失败回退；
- 载体、正则、iframe 和真实宿主回归路径。

## Tavern Helper 前端载体门禁

开场前端和持续消息前端的默认宿主载体固定为 Tavern Helper / JS-Slash-Runner message iframe，不把普通浏览器 HTML、裸 `@@iframe` 或未知 iframe 当成等价路线。frontend manifest 必须锁定：

```text
container = div.TH-render
sourceDetection = pre_isFrontend
iframeIdTemplate = TH-message--{message_id}--{index}
heightProtocol = TH_UPDATE_VIEWPORT_HEIGHT
lifecycle = render_started/load/swipe/edit/reload/delete/pagehide
capabilityProbe = true
```

脚本 iframe、STPT `@@iframe` 和消息 iframe 是三条不同路线，不能混称。启用 streaming 时必须有独立 streaming fixture；前端回归必须覆盖当前楼、Swipe、编辑、重载、删除、流式和 iframe 清理。

## EJS 阶段门禁

EJS 是 ST-Prompt-Template 高权限模板执行路线，不是 MVU 存储层。启用 EJS 后必须闭合：

```text
template_source
execution_contract
scope_contract
output_contract
side_effect_contract
runtime_settings
failure_fallback
version_pin
fixtures
host_regression
```

根据实际使用追加：`getwi_contract`、`iframe_carrier`、`raw_message_contract`、`mvu_bridge`。`generation`、`preparation/raw-message`、`render`、`@@preprocessing`、`@@iframe` 不能只靠语法检查；每条实际路径都要有 fixture 和真实宿主回归。EJS 读取 MVU 必须显式 bridge，EJS 写入 MVU 必须显式双向合同和唯一写者。

## MVU 阶段门禁

`mvu_zod` 路线必须一次性闭合以下组件：

```text
schema
initvar
variable_list
update_rules
path_index
output_format
runtime_contract
loader
consumer
fixtures
```

缺变量列表、缺路径索引、缺输出格式或缺任一运行消费者，都不能交接。不能通过“先做前端、以后再补 MVU”绕过门禁。

## 诊断声明等级

```text
hypothesis   假设
observed     直接观察
reproduced   已复现
verified     修复后回归通过
accepted     用户验收
```

“已经定位”“已经修复”“可直接导入”必须有 `verified` 或更高等级；“用户已接受”必须有 `accepted`。用户报告的操作事实先记录为 `user_observation`，没有直接相反的宿主证据时，不得反复质疑用户操作。

## 运行和交付

```text
node scripts/production/production-check.mjs init --root <项目目录> --project-id <id> --title <title>
node scripts/production/production-check.mjs validate --root <项目目录>
```

`validate` 失败时不得生成最终交付声明。真实 SillyTavern 运行、回归 fixture 和用户验收分开记录，静态检查不能替代宿主证据。
