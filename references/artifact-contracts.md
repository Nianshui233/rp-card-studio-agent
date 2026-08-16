# 制品与装配契约

## 1. 维护源与生成物

- `project.yaml`：项目身份、预检、阶段计划、材料、依赖和交付物。
- `.rp-card-state.json`：实际阶段状态、摘要、构建和验证证据。
- `src/`：唯一维护源。
- `dist/`：生成制品，不作为主要编辑入口。
- `reports/`：验证和构建证据，不属于默认用户交付物。

初始化只创建当前已有信息能支持的轻量文件。角色卡是项目容器，不代表必须立刻创建一个人物源码。

## 2. 默认交付

默认最终交付一个角色卡 `.json`。只有用户在预检或后续明确要求时，才增加：

- PNG 角色卡；
- 独立世界书 JSON；
- 源码归档；
- 其他格式。

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

CharacterBook ID 使用稳定分配；已有受管条目尽量复用原 ID。Standalone 世界书使用规范数值 uid，并保留导入键。

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

每条记录映射到 SillyTavern 角色正则字段。`replace_file` 读取完整文件进入 `replaceString`；`replace_string` 保留内联内容。两者必须实际提供其一。

### Tavern Helper

`content_file` 读取完整 JavaScript 进入脚本 `content`；`content` 保留内联脚本。Forge 不改写脚本语义。

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

1. 读取并校验项目与源文件；
2. 生成基础角色卡/世界书表面；
3. 装配 CharacterBook；
4. 原样装配 Regex、Tavern Helper 脚本和扩展字段；
5. 恢复保真导入字段；
6. 绑定内嵌 CharacterBook；
7. 校验最终制品；
8. 写入 JSON；
9. 用户明确需要 PNG 时再嵌入图像；
10. 执行 roundtrip 和真实宿主验收。

## 10. 禁止的 Forge 职责

Forge 不得：

- 自动创作世界、人物、系统、场景或开场；
- 自动生成 MVU 引擎、Schema、Guard、更新规则或回复格式；
- 自动生成 EJS 条件正文；
- 自动发明固定状态标记或正则套件；
- 通过通用组件配置生成模板化 UI；
- 修改 SillyTavern 或插件本体；
- 静默覆盖用户已有实现。