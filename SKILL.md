---
name: rp-card-studio
description: "分阶段共创、构建和验证 SillyTavern 角色卡项目。仅供用户显式调用。"
---

# SillyTavern制卡工坊

把角色卡创作当作可恢复、可验证的分阶段工程。用户掌握选择权；技能负责提问、给出方向、产出片段、维护状态并构建最终制品。

## 入口门

仅在用户通过技能选择器或 `$rp-card-studio` 显式调用时执行。若本文件被间接加载，而当前请求没有显式调用证据，停止本技能流程并按普通请求处理；不要因为“创建”“角色”“世界观”“SillyTavern”等自然语言自行启动。

若当前项目尚无已完成的预检记录，首次回复只做项目预检。读取 [project-preflight.md](references/project-preflight.md)，只收集当前请求尚未给出的以下信息：

1. 用户明确指定的项目工作区；
2. 是否启用 NSFW；
3. 新建、续作、材料转换、修改或审查；
4. 已有材料的位置；
5. 目标交付物。

不要在首轮询问题材、世界规则、角色、数值系统、剧情或界面内容。工作区未明确时，要求用户指定并停止；不得自选目录。续作项目若已有完整预检记录，只读核验后直接恢复记录中的当前阶段，不重复盘问。

## 事实源与状态

每个项目维护两类事实：

- `project.yaml` 是用户确认内容、创作规划和语义决定的事实源。
- `.rp-card-state.json` 是当前阶段、锁定记录、跨阶段待办、文件清单和验证证据的技术状态。

不要把关键状态只保存在对话记忆里。使用内置 Forge 更新技术状态；内容变更先更新语义源，再构建 `dist/`。生成物不是编辑入口。

创建、续作或修改项目前，读取 [artifact-contracts.md](references/artifact-contracts.md)。内容语义、运行时实现、呈现设计和最终装配分层维护：前序阶段只产出稳定 ID 与需求，`integration` 才决定世界书激活参数、媒体实际来源、适配器和交付路径。

## 阶段路线

预检完成后按默认路线推进：

```text
项目定位
-> 材料整理（可选）
-> 世界观
-> 角色
-> 系统（可选）
-> 场景（可选）
-> MVU/EJS（可选）
-> 叙事与开场
-> 状态栏/UI（可选）
-> 整合交付
```

用户可以跳过或调整阶段。切换前检查依赖并说明影响；普通模式等待用户选择，AI 只在获得覆盖该路线的明确授权后代为决定、报告理由并锁定。`MVU/EJS` 是可选阶段：前一阶段的收尾只决定“进入或跳过”，不提前询问 MVU、EJS 或组合等阶段内部问题。新建项目且没有既有实现时，跳过会保持两个 feature 为 `false`，在 `.rp-card-state.json` 写入 `stages.mvu_ejs.status: skipped` 和简短理由，不进入访谈、不生成禁用片段、依赖说明或阶段总汇，直接把 `narrative_opening` 作为下一阶段。续作、转换、修改或审查项目本轮跳过时要保留既有 feature、源码和依赖；若要修改、禁用或移除既有实现，必须进入该阶段完成迁移与验证，不能把“本轮跳过”当作关闭功能。

开始阶段式对话前，读取：

- [stage-engine.md](references/stage-engine.md)：轮次结构、完成门和阶段总汇；
- [stage-boundaries.md](references/stage-boundaries.md)：问题归属、越界处理和回退；
- [delegation-and-locking.md](references/delegation-and-locking.md)：用户选择、AI 放权和锁定规则。

## 阶段内循环

每个阶段重复以下循环，直到完成门成立：

1. 汇总本阶段已经确认的信息。
2. 一次提出多项本阶段问题，并为每项给出有实际差异的方向、影响和一个有理由的推荐。
3. 等待用户选定或补充，不替普通未授权决定拍板。
4. 用户回复后，先列出本轮新锁定内容，再给出可进入最终产物的片段。
5. 报告本阶段剩余缺口，只继续询问属于本阶段的问题。
6. 达到完成门后，给出完整阶段总汇、查缺补漏、风险、跨阶段待办和下一阶段方向。
7. 等待用户确认本阶段完成并选择下一阶段。

用户在同一条消息中回答多个问题时一次性吸收，不重复询问。用户主动提供其他阶段的信息时记录到跨阶段待办，不在当前阶段展开。

## AI 放权

用户明确说“你决定”“全部交给你”或同等表达时，授权范围内不再逐项询问：

1. 直接完成剩余决定；
2. 一次报告决定内容及理由；
3. 立即写入锁定记录；
4. 后续不再询问，也不把这些决定列为待确认项。

只有用户后来主动修改，才重新打开对应决定。不要把模糊的“你看着办”扩大到未提及的阶段；按其上下文确定授权范围。

## NSFW 开关

预检时必须得到明确的 `enabled` 或 `disabled`，已提供则不重复问。

- `disabled`：除项目级开关记录外，后续创作问题、内容模板、运行字段和玩家制品中完全不出现相关内容。
- `enabled`：后续不再询问额外偏好或边界；角色与状态栏阶段自动加载相应结构，不创建独立阶段。

无论开关如何，都遵守当前平台不可取消的安全要求。不要额外创建限制卡或反复提醒。

## 按需加载阶段资料

一次只读取当前阶段的文件：

| 当前阶段 | 必读资料 |
| --- | --- |
| 项目定位 | [positioning.md](references/stages/positioning.md) |
| 材料整理 | [materials.md](references/stages/materials.md) |
| 世界观 | [worldbuilding.md](references/stages/worldbuilding.md) |
| 角色 | [character.md](references/stages/character.md) |
| 系统 | [systems.md](references/stages/systems.md) |
| 场景 | [scenes.md](references/stages/scenes.md) |
| MVU/EJS（可选） | [mvu-ejs.md](references/stages/mvu-ejs.md) |
| 叙事与开场 | [narrative-opening.md](references/stages/narrative-opening.md) |
| 状态栏/UI | [status-ui.md](references/stages/status-ui.md) |
| 整合交付 | [integration.md](references/stages/integration.md) |

不要为了“全面”提前读取后续阶段。需要落盘、构建或交付时再读取 [artifact-contracts.md](references/artifact-contracts.md)；进入质量门时读取 [validation.md](references/validation.md)。

任何标为“可合并”“完整合并稿”或准备写入 `src/` 的 YAML/JSON 片段，都属于真实产物而不是示意伪代码。首次生成当前阶段的结构化片段前，读取该阶段资料指定的 `assets/templates/` 模板与 `assets/schemas/` Schema，沿用准确字段名、层级和枚举；生成后先做 Schema 校验。未通过时修正片段，不要把语义正确但结构无效的内容交给用户，也不要声称可由 Forge 直接合并。

## 内置 Forge

使用 `node scripts/rp-card-forge.bundle.mjs --help` 查看命令。该 bundle 随技能交付，由仓库内的 `scripts/rp-card-forge.mjs`、`scripts/forge/` 与固定构建脚本生成；它不调用外部制卡工具，也不要求运行时另行安装依赖。维护者只修改源码，不直接编辑 bundle。

主要命令：

```text
init       创建项目结构
inspect    识别材料和制品
unpack     将 JSON/PNG/世界书拆为维护源码
validate   检查结构、引用和生命周期
build      从源码构建 JSON 制品
pack       把角色卡数据写入 PNG
diff       比较语义差异
roundtrip  验证拆包与重建一致性
state      查询、锁定和切换阶段
doctor     检查运行环境与项目健康
```

写入前优先使用 `--dry-run`。不覆盖输入原件；没有用户明确提供 `--force` 时拒绝覆盖。命令失败时报告真实错误，不用手工修补 `dist/` 伪造成功。

## 稳定规则

- 只问会改变当前阶段结果的问题；已知信息不重复问。
- 机器 ID、变量路径和引用使用稳定英文；显示名和创作正文使用简体中文。
- 每个运行时状态字段都要有类型、默认值、写入者、读取者、展示者和边界行为；仅用于语义判定、由模型尽力维护的字段只要求稳定 ID、含义和行为后果，不假装具备确定性持久化。
- 同一开场的事实、初始状态、钩子和玩家交接点只定义一次；`prose`、`chat`、`galgame` 等呈现变体不得改写这些共享语义，增强呈现必须有纯文本回退。
- 世界书激活、插入、概率、媒体文件、预加载和适配器属于整合装配，不得提前混入世界观、场景或叙事阶段的问题。
- 多轴系统把阈值、计算、上限和示例绑定到具体 `axis_id`。
- 玩家可见信息与 GM 秘密分层，秘密不得泄漏到玩家制品。
- 修改旧卡时保留未知字段和原始输入；先解包到工作区，再改源码。
- 版本敏感行为以用户实际工作区和运行环境为准，不猜测 API 或扩展能力。
- 状态栏只交付到 AI 聊天消息：默认由 SillyTavern 角色正则替换消息末尾占位符；复杂实现也只能使用 Tavern Helper 消息级 JS/iframe。数据模型、访谈选项、生成器和交付物中都不存在父页面常驻面板或其降级分支。
- 启用 MVU 时，角色卡必须包含不回送变量更新块的 Prompt-only 正则；启用状态栏时，默认与备选开场、后续回复合同和消息内状态栏正则必须同时闭合。
- 离线通过不代表真实 SillyTavern 已验收；分开报告静态、制品和运行时证据。

## 交付门

整合交付前运行 Forge 的 `validate` 和 `roundtrip`，并按 [validation.md](references/validation.md) 区分阻断错误与警告。只有维护源码、生成制品、状态记录和验证报告一致时，才称为完成。

最终交付应列出：

1. 已完成和跳过的阶段；
2. 锁定决定及 AI 授权决定的记录位置；
3. 源文件与生成物；
4. `assembly.yaml`、媒体清单和适用的 `runtime-state.schema.json`；
5. 静态、制品和真实运行时证据；
6. 尚需用户在 SillyTavern 中确认的事项。
