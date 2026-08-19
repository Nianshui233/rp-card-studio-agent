# SillyTavern制卡工坊

一个面向 SillyTavern 的 RP 项目创作 Agent。

它不把“角色卡”简单理解成某个角色的 JSON 档案，而是把一次创作视为完整的 RP 项目：世界观、NPC、角色关系、系统玩法、场景事件、开场、世界书、MVU、EJS、正则、Tavern Helper 脚本，以及消息内 HTML 前端，都可以成为同一个项目的一部分。

这个仓库适合希望用 AI 完整制作、改造、验证 SillyTavern RP 项目的人，尤其适合以下场景：

- 真正的单人物角色卡；
- 开放世界、群像、沙盒和多 NPC RP；
- 带世界书调度、变量、状态栏和 UI 的完整 RP 包；
- 开场介绍页、创角页、持续状态栏和独立前端/0 层玩法；
- 对已有 JSON/PNG 角色卡进行拆包、保真、改造和重新装配；
- 不熟悉 MVU、EJS、正则和 Tavern Helper，但希望让 AI 负责技术实现的人。

> 这是 Agent、私有 Skill 和 Forge 工具链仓库，不是 SillyTavern 插件，也不会修改 SillyTavern、Tavern Helper、MagVarUpdate 或其他插件本体。

## 它解决什么问题

制作一张成熟的 SillyTavern 卡，往往不只是写角色描述，还会遇到这些问题：

- 世界观内容应该如何拆进世界书；
- NPC 是否能够脱离玩家角色自行运转；
- 角色卡的 `description` 应该写什么；
- 变量应该存在哪里，UI 又从哪里读取；
- MVU 和 EJS 是否需要同时使用；
- 正则是处理玩家显示、模型提示词，还是两者都处理；
- 开场前端和持续状态栏如何分开；
- HTML/CSS/JS 如何与 SillyTavern 输入框、消息楼层和变量联动；
- 独立世界书是否真的挂载到角色；
- 交付的 JSON、正则、脚本和 HTML 是否还能在另一处导入。

制卡工坊把这些问题拆成阶段，逐阶段收集信息、做决定、产出片段，再在最后进行确定性的装配和验证。

## 核心理念

### RP 项目优先，而不是单一角色优先

大世界、群像和玩法项目使用能够概括整体的项目标题；只有真正的单人物卡才默认使用角色名。

角色卡的 `data.description` 默认是项目入口和核心合同，不是 NPC 档案。世界、NPC、系统和场景的主要内容进入独立世界书或对应项目源码。

世界和角色不应停在原地等待用户角色触发。优秀的 RP 项目应该有自己的生活、日程、冲突、关系和事件，即使暂时没有用户介入，也能够继续运转。

### 分阶段共创

每个阶段都遵循：

```text
当前阶段的多项问题
+ 信息采集
+ 方向差异
+ Agent 推荐
→ 用户选择、补充或授权 AI 决定
→ 立即生成当前阶段片段
→ 查缺补漏
→ 阶段总汇
→ 下一阶段建议
```

Agent 不会在世界观阶段追问角色模板，也不会在角色阶段追问正则 placement。技术细节尽量由 Agent 自行处理，用户只需要确认自己能理解的体验和方向。

### 个人自用工作流

本项目优先追求：

- 创作自由；
- 好玩；
- 沉浸；
- 美观；
- 便利；
- 真实可运行。

不会从公开商业产品或安全审查的角度额外压缩创作空间。只有会造成语法错误、数据丢失、功能断链、无法导入或严重 Bug 的问题才会阻止构建。

父页面访问、私有 API、复杂 JavaScript、远程依赖、消息内 iframe、主动生成、音频和 0 层前端，都可以按项目需要使用；依赖和实机结果会在报告中如实记录。

### 设下限，不设创作上限

Forge 会要求必要字段、合法 ID、真实来源、完整生产者/消费者和可运行链路，但不会因为以下原因阻断项目：

- 世界书条目很多；
- NPC 很多；
- 状态字段很多；
- HTML/CSS/JS 很长；
- UI 功能复杂；
- 正则很多；
- 项目 JSON 很大。

性能、上下文长度和维护成本可以作为优化建议报告，但不会被伪装成创作配额。

## Agent 架构

```text
用户
  ↓
AGENT.md：唯一主 Agent
  ├─ orchestrator/routing.yaml：阶段路由
  ├─ orchestrator/stage-loop.md：阶段对话闭环
  ├─ orchestrator/decision-locking.md：决定与完全放权
  ├─ orchestrator/hooks.yaml：Forge 生命周期钩子
  ├─ orchestrator/capabilities.yaml：宿主能力注册表
  ├─ internal-skills/：按阶段惰性加载的私有专业 Skill
  ├─ project.yaml：语义账本
  ├─ .rp-card-state.json：技术状态镜像
  └─ scripts/rp-card-forge.bundle.mjs：确定性 Forge
```

内部 Skill 不作为独立用户入口，也不各自维护项目事实。主 Agent 根据当前阶段加载主 Skill，只有出现具体技术需要时才加载支援模块。

主要模块包括：

| 模块 | 负责内容 |
|---|---|
| `rp-project-foundation` | 项目定位、材料整理、世界观基础 |
| `rp-cast-authoring` | 角色、NPC、群像、关系和 NSFW 角色层 |
| `rp-experience-authoring` | 系统、数值系统、场景、事件、叙事、开场和创角 |
| `st-runtime-authoring` | MVU、MVU_ZOD、EJS、变量、脚本和宿主运行链 |
| `st-frontend-authoring` | 开场前端、持续状态栏、完整 HTML 应用 |
| `st-worldbook-regex` | 世界书调度、输出标记和正则消费链 |
| `st-host-capabilities` | SillyTavern、Tavern Helper、本体 API、事件和父页面能力 |
| `st-api-reference` | API 签名、版本、事件参数和接口核对 |
| `st-integration-qa` | 整合、装配、往返验证和最终交付 |

## 固定工作流程

固定阶段顺序如下：

```text
项目定位
→ 材料整理（可选）
→ 世界观
→ 角色
→ 系统（可选）
→ 场景（可选）
→ MVU/EJS（可选）
→ 叙事与开场
→ 状态栏/UI（可选）
→ 整合交付
```

### 1. 项目定位

确认项目形态、核心乐趣、节奏、气质、项目标题和卡面入口职责。

### 2. 材料整理

新建项目可以跳过；旧卡改造必须先完成。Agent 会盘点角色卡、CharacterBook、独立世界书、正则、Tavern Helper、MVU/EJS、HTML、用户条目、未知扩展和媒体，并生成原始保真副本。

### 3. 世界观

设计世界历史、地理、制度、组织、规则、社会日常、异常机制、冲突源和自动运转事件，再按主题拆成世界书条目。

### 4. 角色

设计核心角色、NPC、群像、关系、目标、恐惧、行为规则、语言、日程和自主生活。角色通常保持完整条目，避免拆碎后失去连续性。

### 5. 系统

可选。先判断是叙事型、数值型还是混合型：战斗、资源、任务、时间、声望、技能、经济、调查、成长和后果可以用自然规则、精确数值或两者结合。只有确实会改变选择并需要稳定复算的维度才进入数值系统专科；数值规则本身在 MVU 之前完成范围、阈值、计算、边界、多事件和演算闭环。系统不一定需要 MVU。

### 6. 场景

可选。按玩法深度设计地点、区域、拓扑、入口、门禁、安保、资源、线索、可破坏结构、时间窗口、事件、日程、可出现人物、自然变化和场景转移。日常场景保持轻巧，潜入、调查、战术、经营和长期据点场景不能只写氛围概述。

### 7. MVU/EJS

可选。只在确实需要跨楼层变量、精确状态、动态提示词、变量 UI 或宿主联动时启用。

### 8. 叙事与开场

制作首条信息、备用开场、世界介绍、游玩指南、作者留言、创角流程和进入真实剧情的桥接。

### 9. 状态栏/UI

可选。开场介绍/创角前端和持续状态栏分别设计、分别访谈、分别开发、分别验收。

### 10. 整合交付

由 Forge 读取维护源，构建最终角色卡、世界书、正则、脚本、HTML、项目清单和验证报告。

## 旧卡改造流程

旧卡不会因为“已经问了几个问题”就直接进入重写或交付。

完整流程是：

```text
预检
→ 原始材料盘点
→ original.json / preserved.json
→ 用户条目和未知扩展处理
→ 世界观迁移
→ 角色迁移
→ 系统/场景迁移
→ MVU/EJS/正则/脚本迁移
→ UI 迁移或重做
→ 整合验证
```

旧卡改造必须明确每个部分是：

```text
保留 / 迁移 / 重写 / 清理 / 待确认
```

清理旧用户资料后，必须在维护源和最终世界书中提供独立、中文、默认禁用、以 `<user>` 为关键词的空白模板。

### 用户角色档案与运行状态

每个项目只维护一个 canonical `<user>` 用户角色条目。字段不是固定问卷：普通人物可以使用姓名、身份和背景，奇幻项目可以增加血脉、魔力亲和与法术体系，修仙项目可以改成道号、灵根、道途和因果，系统型项目可以使用职能、权限和服务对象。只要某项在项目中是稳定档案就进入 `<user>`；会随 RP 变化的值进入 MVU 或其他运行状态。

`src/user-character.yaml` 提供最小兜底骨架和可选字段库，实际项目先删掉不适用字段，再按世界观与玩法扩展。开场创角前端从最终合同生成字段：静态填写结果生成可直接粘贴或写入世界书的 `<user>` YAML，动态开局值生成独立状态补丁。非 MVU 项目不创建伪变量；无法自动修改世界书时明确提示用户复制、粘贴并启用条目。静态字段可以为了 UI 显示镜像进 MVU，但 `<user>` 始终是档案权威来源。

制作过程中 Agent 不询问用户准备扮演谁，也不代写用户人物。即使是真单人卡，“单人”也指唯一预先创作的卡内角色，而不是替用户设计配对主角。最终 `<user>` 和变量初值保持空白；创角页默认不填写人物。为了方便快速启动，可以提供用户主动点击、仍可编辑的预设示例。UI 阶段仍可询问玩家端观看和操作体验，因为这不等于定义虚构世界中的用户身份。

## 世界书、正则和运行链

### 世界书

世界书是 RP 内容的主要容器，优先使用可读 YAML/自然文本维护，最后才投影为 SillyTavern JSON。

条目会逐项决定：

- 常驻或关键词触发；
- 主关键词和次关键词；
- 插入位置；
- 深度；
- 顺序；
- 触发概率；
- 扫描深度；
- 入站递归；
- 出站递归；
- 递归延迟；
- 预算行为；
- 来源和回退。

### 正则

正则是文本变换层，不是变量存储层，也不是 UI 数据源。

它可以分别处理：

- 玩家显示层；
- 模型提示词层；
- 完整技术块；
- 流式未闭合技术块；
- 开场标记；
- 状态标记；
- 变量更新块；
- EJS 输出标记。

每个被正则消费的标记都必须有真实生产者：模型输出、MVU 框架、Tavern Helper、用户按钮或既有实现。

### MVU

卡内 MagVarUpdate 路线必须明确 Loader 来源。卡内加载时只保留一个有效 Loader：

```js
import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';
```

`native_schema` 路线由 `[initvar]` 和 MagVarUpdate 自动生成内部 Schema，不强制 Zod。

`mvu_zod` 或明确使用 Zod 的 `hybrid` 路线才附带：

```js
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
```

### EJS

EJS 是独立的 ST-Prompt-Template 路线，不等于 MVU。

它可以处理：

- 生成前模板；
- 渲染后模板；
- 变量作用域；
- `getwi` / `activewi`；
- 世界书按名调用；
- 提示词注入；
- 缓存；
- EJS 与 MVU 的显式 bridge。

只启用 EJS 时，不生成 MVU Loader、MVU Schema 或 `[initvar]`。

## 前端/UI

UI 阶段把页面当作真正的浏览器前端应用开发，而不是在消息里随手插入一个小面板。

开发时可以拆成：

```text
index.html
styles/
scripts/
fragments/
mock/
```

最终会拼接成一个完整、自包含的 HTML：

```html
<!doctype html>
<html>
<head>
  <style>完整 CSS</style>
</head>
<body>
  完整页面结构
  <script>完整 JavaScript</script>
</body>
</html>
```

支持的体验等级：

- 轻型：完整的轻量消息内应用；
- 轻中型：更多信息和交互；
- 中型：多页面、多组件、搜索、筛选、弹窗和更完整的数据展示；
- 重型：复杂交互、动画、宿主联动和丰富功能模块；
- 超重型/0 层：持续消息前端成为主要游玩表面。

UI 必须有真实数据来源、加载态、空态、错误态、按钮反馈和生命周期清理。模拟数据只用于预览，不会被注入正式运行 HTML。

## 宿主适配

默认宿主能力解析顺序是：

```text
当前 iframe 注入接口
→ TavernHelper
→ window.SillyTavern.getContext()
→ window.parent DOM / 本体 API
→ 复制文本或手动回退
```

状态读取通常是：

```text
等待 MVU 初始化
→ 获取当前消息楼层
→ 读取 stat_data
→ 回退 Tavern Helper message 变量
→ 无法读取时显示空态或错误态
```

按钮写入输入框通常是：

```text
triggerSlash('/setinput ...')
→ send_textarea
→ 派发 input/change 事件
→ 复制文本
→ 手动回退
```

父页面访问不是一概禁止项；项目只需要对能力探测、错误反馈、重复挂载和卸载清理负责。

## 快速开始

### 环境要求

- Node.js `>= 20`；
- 一个支持该 Agent 结构的 AI Agent 运行环境；
- 如果要进行真实运行验收，需要本地 SillyTavern；
- 如果项目启用 Tavern Helper、MVU、EJS 或其他插件，需要目标环境已安装对应依赖。

### 安装仓库依赖

```powershell
npm ci
```

### 将仓库作为 Agent 使用

仓库入口是：

```text
AGENT.md
```

运行环境应使用 `agent.yaml` 中登记的入口、私有 Skill 路由、能力注册表和 Hooks。Agent 只使用明确入口，不使用自然语言误触发。

### 初始化一个项目

```powershell
node scripts/rp-card-forge.bundle.mjs init <项目工作区> --nsfw enabled --stages '["positioning","worldbuilding","character","narrative_opening","integration"]'
```

可选阶段包括：

```text
materials
systems
scenes
mvu_ejs
status_ui
```

通常不需要手动编辑这些状态文件；制作过程中由 Agent 和 Forge 共同维护。

## 最终交付结构

```text
dist/<项目名>/
├─ 00_导入说明.md
├─ 01_项目清单.json
├─ 02_角色卡/
├─ 03_世界书/
├─ 04_正则/
├─ 05_前端/
├─ 06_酒馆助手/
├─ 07_MVU与EJS/
└─ 08_验证报告.md
```

默认且唯一交付方式是多文件 RP 项目包，不再在角色卡 JSON、PNG、单文件包和文件夹之间询问用户选择。

每个前端页面都是完整的 `.html` 文件。CSS 和 JavaScript 可以在源码阶段分开维护，但最终 HTML 不依赖同目录的其他文件。

## 导入顺序

1. 导入角色卡 JSON；
2. 导入独立世界书，并绑定为角色主世界书；
3. 导入正则 JSON；
4. 将 `05_前端` 中与正则配对的完整 HTML 粘贴到正则的“替换内容”；
5. 导入 `06_酒馆助手` 中的脚本；
6. 如果启用 MVU，先启用唯一 `mvu_loader`；
7. 只有 `mvu_zod` 或明确需要 Zod 的 `hybrid` 才启用 `mvu_schema`；
8. 启用项目专属同步、事件或生命周期脚本；
9. 按 `07_MVU与EJS` 和验证报告检查版本、全局世界书设置、远程依赖和宿主配置；
10. 开始首轮对话并进行实际验收。

## 验证边界

离线验证可以确认：

- YAML、JSON 和正则语法；
- JS、EJS、HTML 实际执行过的静态检查；
- 世界书非空和调度字段完整；
- 角色卡、世界书、正则和脚本的结构闭合；
- HTML/CSS/JS/EJS 在装配中没有被截断；
- JSON 往返后语义保持一致；
- Forge bundle 与源码一致；
- 项目是否包含真实的标记生产者和消费者。

只有真实 SillyTavern 才能确认：

- 世界书是否已经进入酒馆世界书列表；
- 角色主世界书是否真的挂载；
- 正则是否按目标通道执行；
- MVU/EJS/Tavern Helper 版本是否兼容；
- iframe/Blob URL 是否正常；
- UI 是否读取真实状态；
- 按钮、编辑、Swipe、重载和聊天切换是否正常；
- 远程 Loader 及其二级依赖是否成功加载。

没有实机验证时，报告会明确写出：

```text
runtime: not_run
```

这既不是“运行失败”，也不是“运行成功”，而是尚未在真实宿主中执行。

## NSFW 与制作期清理

NSFW 只在预检阶段确认一次。

启用后：

- 角色使用完整 NSFW 模板；
- 不再反复询问 NSFW 强度或许可；
- 不添加运行时门禁；
- 不向成品偷偷加入拒绝规则。

如果旧材料涉及不应迁移的成人内容，Agent 只在制作期删除或不迁移；原始输入可以保存在保真副本中，但不会进入可运行交付组件。

## 目录说明

```text
AGENT.md                         主 Agent 行为与工作原则
agent.yaml                       Agent 入口与默认交付声明
orchestrator/                    阶段路由、账本、Hooks、能力注册表
internal-skills/                 私有专业 Skill
assets/templates/                项目、世界书、角色、MVU、UI 模板
assets/schemas/                  项目和运行合同 Schema
assets/examples/                 自包含原创技术样本
scripts/rp-card-forge.mjs        Forge 源码入口
scripts/rp-card-forge.bundle.mjs Forge 可直接运行 bundle
scripts/ui-app-builder.mjs       模块化 UI 构建器
tests/                           自动化回归测试
```

## 开发者验证

```powershell
npm ci
npm run build:forge
npm run verify
```

`verify` 会执行：

- Forge bundle 一致性检查；
- Node.js 语法检查；
- Forge doctor；
- 项目、世界书、正则、MVU、EJS、UI、交付和往返测试；
- 宿主适配器回归测试；
- 大型 HTML、世界书和角色卡制品测试。

当前仓库的验证结果以最近一次实际运行的命令输出为准，不在 README 中虚构覆盖率、运行次数或真实 SillyTavern 通过结果。

## 进一步阅读

- [Agent 总规则](AGENT.md)
- [阶段路由](orchestrator/routing.yaml)
- [分阶段共创引擎](orchestrator/stage-loop.md)
- [阶段边界](orchestrator/stage-boundaries.md)
- [项目预检](orchestrator/project-preflight.md)
- [决定锁定](orchestrator/decision-locking.md)
- [宿主能力矩阵](internal-skills/st-host-capabilities/references/host-capability-matrix.md)
- [MVU/EJS 运行合同](internal-skills/st-runtime-authoring/references/mvu-ejs.md)
- [前端状态栏合同](internal-skills/st-frontend-authoring/references/status-ui.md)
- [整合验证规则](internal-skills/st-integration-qa/references/validation.md)
- [技术样本矩阵](assets/examples/matrix.yaml)

## 当前状态

这是一个持续迭代中的个人自用 Agent 仓库，正在为后续公开使用整理说明、样本、验证和部署边界。

欢迎通过 Issue 或 Pull Request 反馈：

- 阶段流程不清楚；
- Agent 错过了当前阶段的问题；
- 世界书调度错误；
- MVU/EJS 运行链断裂；
- 正则与 HTML 没有闭环；
- Tavern Helper 脚本无法加载；
- UI 有数据但玩家端显示异常；
- 交付包缺少文件或导入顺序不清楚。

提交问题时，尽量提供：

- 使用的 Agent 版本或提交号；
- 项目操作类型；
- Forge 验证输出；
- SillyTavern 与 Tavern Helper 版本；
- 相关项目包结构；
- 控制台首个因果错误；
- 能稳定复现问题的最小材料。
