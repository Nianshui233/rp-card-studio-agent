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

## 前端阶段门禁

开场前端或消息前端在访谈覆盖前不得实现。至少需要明确：

- 玩家体验和内容层级；
- 数据来源与唯一写者；
- 生命周期：当前楼、Swipe、编辑、重载；
- 交互是否写输入框、剪贴板或自动发送；
- 空态和宿主失败回退；
- 载体、正则、iframe 和真实宿主回归路径。

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
