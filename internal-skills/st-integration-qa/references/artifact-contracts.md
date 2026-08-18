# 制品与装配契约

## 1. 维护源与生成物

- `project.yaml`：项目身份、预检、阶段计划、材料、依赖和交付物。
- `.rp-card-state.json`：实际阶段状态、摘要、构建和验证证据。
- `src/`：唯一维护源。
- `dist/`：生成制品，不作为主要编辑入口。
- `reports/`：内部验证和构建证据；项目包中的 `07_验证报告.md` 是固定交付组成部分。

初始化只创建当前已有信息能支持的轻量文件。角色卡是项目容器，不代表必须立刻创建一个人物源码。

## 2. 默认交付

最终交付固定为多文件 RP 项目包，不再询问交付形式。项目包至少包含：

- 角色卡 JSON；
- 独立世界书 JSON；
- 正则配置 JSON；
- 每个前端页面一个完整、自包含 HTML；
- 酒馆助手脚本及 MVU/EJS 配套文件；
- 项目清单、导入说明和验证报告。

## 3. 卡面契约

- `data.name`：真单人卡使用唯一人物名；其他项目使用整体标题。
- `data.description`：项目入口或核心合同，不放 NPC 档案。
- `data.first_mes`：默认开场的真实正文或稳定开局标记。
- `data.alternate_greetings`：有实质差异的备选开场。
- 高级定义字段默认不承担世界、NPC 或系统的主维护职责；是否保留由导入保真和明确迁移策略决定。

## 4. CharacterBook 契约

`assembly.yaml.worldbook_manifest.entries` 是世界书装配清单。每项引用真实维护源，并明确宿主调度字段。

内容原则：

- 世界按主题切片；
- NPC 通常整块；
- 系统、场景、叙事规则按职责整块；
- 用户角色模板可独立、默认禁用；
- EJS 和运行提示词进入明确目标条目；
- 正则、HTML 和 Tavern Helper 脚本不塞进世界书正文。

CharacterBook ID 使用稳定分配；已有受管条目尽量复用原 ID。交付时转换为独立 SillyTavern 世界书 JSON，使用规范数值 uid 并保留导入键。锁定整合后的世界书必须非空，项目清单必须记录它要绑定的角色卡。

文件存在不等于已安装：SillyTavern 仍需导入独立世界书并设置为角色主世界书。真实宿主验收必须检查这两个现场状态。

## 5. 真实运行组件契约

`runtime_manifest.mode` 固定为 `authored`。它只登记已写好的文件：

```yaml
runtime_manifest:
  mode: authored
  regex_scripts: []
  tavern_helper_scripts: []
  extension_fields: {}
```

### Regex

每条记录映射到 SillyTavern 正则导入字段。开发期 `replace_file` 可以指向完整 HTML；交付时正则 JSON 与 HTML 分开，HTML 正则的 `replaceString` 留空，由用户按导入说明把同名完整 HTML 粘贴进“替换内容”。非 HTML 正则继续保留真实替换文本。

### Tavern Helper

`content_file` 读取完整 JavaScript 形成可独立导入的 Tavern Helper 脚本 JSON；`content` 保留内联脚本。Forge 不改写脚本语义。

### EJS

EJS 作为真实文件，由世界书条目的 `source.kind: file` 装入指定正文。Forge 不生成 EJS 分支，不把 EJS 变成通用条件表。

### 扩展字段

`extension_fields` 原样深合并到卡内扩展。它只用于项目确实需要且作者明确给出的宿主字段。

## 6. 导入保真

解包已有 JSON/PNG 时：

- 完整原制品保存在 `src/import/original.json`；
- PNG 原图按需保留；
- 未识别字段进入保真记录；
- 用户正则、脚本、CharacterBook 和未知扩展保持原内容；
- 未被项目明确接管的卡面字段保持原值；
- 不因 `data.name` 自动创造人物；
- 不因兼容旧卡而恢复本技能曾经的错误生成器。

保真副本与可运行交付必须分开理解：`src/import/original.json` 和 `preserved.json` 可以保留旧输入中不进入新项目的内容，但它们不能被当成 CharacterBook、世界书、脚本或其他导入组件重新装配。遇到涉及未成年人的成人性旧内容时，只保留输入保真并在迁移清单中标记删除；不要为它新增运行时成年门禁、年龄校验或模型拒绝合同。

重复构建不得累计重复条目、正则或脚本。

## 7. 世界书来源

来源支持：

- `inline`：条目内直接文本；
- `file`：工作区真实文件；
- `registered_source` / `path`：已登记 YAML 源或其 selector。

对结构化源使用 selector 时，装配内容保留模块身份和选择路径，避免片段失去归属。

来源不存在时：

- `fallback: skip` 记录 warning 并跳过；
- 其他情况阻断构建。

## 8. 媒体

媒体清单只描述项目实际使用的资源。工作区文件需要嵌入后交付；远程资源使用 HTTPS并登记回退。Forge 校验 MIME、大小、哈希、consumer 和场景槽位，不替作者创造媒体需求。

## 9. 构建顺序

1. 先把模块化 UI 源码构建为项目专属、自包含 HTML；
2. 读取并校验项目与源文件，阻断过期 UI 制品；
3. 生成轻量角色卡组件和独立世界书组件；
4. 将世界、NPC、系统、场景、叙事、MVU/EJS 条目装配进独立世界书；
5. 分别生成 Regex JSON、Tavern Helper 脚本 JSON 和完整自包含 HTML；
6. 恢复各组件自身需要的保真字段，不把维护路径带入交付包；
7. 生成项目清单、导入说明和验证报告；
8. 逐文件校验并检查组件配对关系；
9. 写入唯一的多文件 RP 项目包；
10. 执行组件往返和真实宿主验收。

## 10. 禁止的 Forge 职责

Forge 不得：

- 自动创作世界、人物、系统、场景或开场；
- 自动生成 MVU 引擎、Schema、Guard、更新规则或回复格式；
- 自动生成 EJS 条件正文；
- 自动发明固定状态标记或正则套件；
- 通过通用组件配置生成模板化 UI；
- 修改 SillyTavern 或插件本体；
- 静默覆盖用户已有实现。
