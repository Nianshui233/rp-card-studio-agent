# 整合交付阶段

本阶段只做两件事：把已经确认的 RP 内容切分并排进 CharacterBook；把已经写好的真实运行组件原样装入角色卡。

## 内容装配

按内容责任而不是模板字段切分：

- `data.description`：完整项目入口/核心合同，不放任何 NPC 档案；
- 世界观：按稳定主题切分，常驻骨架少量，其余依关键词、位置、深度和递归触发；
- NPC：通常整块放入一个连续条目；
- 系统、场景、叙事规则：按完整职责整个放入，避免碎成失去上下文的小片；
- 用户角色模板：作为独立、默认禁用的中文世界书条目，或由开局 UI 收集；
- MVU/EJS：把实际更新规则、输出格式、上下文模板等放入各自目标条目；
- UI 和正则：不进入世界书正文，而进入卡内扩展字段。

每个条目都审查：中文名称、启用、关键词、选择逻辑、position、depth、order、probability、sticky、cooldown、递归、目标模型/阶段和预算。

## 运行组件装配

使用 `runtime_manifest` 指向真实文件：

```yaml
runtime_manifest:
  mode: authored
  regex_scripts:
    - id: "稳定 UUID"
      script_name: "[界面]雾港状态栏"
      find_regex: "/<雾港状态栏\\s*\\/>/g"
      replace_file: "src/runtime/ui/状态界面.html"
      wrap_as_html_codeblock: true
      placement: [2]
      disabled: false
      markdown_only: true
      prompt_only: false
      run_on_edit: true
      substitute_regex: 0
      min_depth: null
      max_depth: null
  tavern_helper_scripts:
    - type: folder
      id: "wugang-runtime-folder"
      name: "雾港运行组件"
      enabled: true
      icon: "fa-solid fa-code"
      color: "#475569"
      scripts:
        - type: script
          id: "wugang-mvu-schema"
          name: "雾港：MVU变量结构"
          content_file: "src/runtime/mvu/变量结构.js"
          enabled: true
          info: "注册本卡 stat_data 结构"
  extension_fields: {}
```

Forge 只读取文件内容并填入 `replaceString` / `content`。不得把这些源码再次转换成通用 UI、额外运行层、合成 EJS 条目或固定正则组。

EJS 文件通常通过 `worldbook_manifest.entries[].source.kind: file` 放进明确的世界书条目。MVU 初始变量必须由名称含 `[initvar]` 的真实文件条目装入；更新规则和输出格式也进入各自明确目标。具体启用与路由由目标实现决定。

## 内嵌、导入与挂载

这三个状态不得混为一谈：

1. `data.character_book` 非空：世界书内容已经内嵌进角色卡；
2. SillyTavern 世界书列表中存在同名书：内嵌书已经执行“Import Card Lore/导入卡片世界书”；
3. `data.extensions.world`、角色编辑页主世界书选择和实际世界书名一致：角色已经挂载该书。

Forge 负责第 1 项并写出第 3 项的目标名称，但标准角色卡 JSON 不能保证目标 SillyTavern 已经存在该书。SillyTavern 默认会按 `world_import_dialog` 设置询问是否导入；没有弹窗或曾跳过时，应在角色菜单执行“Import Card Lore”。真实宿主验收必须完成导入并确认当前主世界书，而不能只检查 JSON 字段。

项目若明确要求零手工导入，可以编写项目专属 Tavern Helper 脚本调用目标版本已经实测的 SillyTavern 接口完成导入与挂载；这是版本耦合的卡侧自动化，不得修改 SillyTavern 本体，也不得用未经实测的固定通用脚本冒充成功。

## 正则成组审查

对每个真实协议检查完整规则组，例如：

- 开局标记：display 替换完整开局 HTML；prompt 只留下短叙事说明；
- 状态标记：display 替换完整状态 HTML；prompt 删除纯界面占位；
- 变量块：display 隐藏已完成和流式未完成块；prompt 按实际更新模型需要决定保留/删除及深度；
- 其他剧情块：检定、通知、选择等各自独立。

规则必须针对本卡标记和目标环境，不自动套一个所有卡共用的固定列表。

## 默认交付

默认只生成一个角色卡 `.json`。PNG、独立世界书、源码归档和其他报告只有预检明确要求时才列为最终制品。项目源码和验证文件是内部工作事实，不等于额外交付物。

## 构建纪律

1. 从 `src/` 构建候选；
2. 校验 YAML/JSON/JS/EJS/HTML/正则语法和引用；
3. 检查 CharacterBook ID、顺序、触发和递归；
4. 检查实际扩展字段结构、脚本启用状态和依赖；
5. 重新打开产物，确认大段 HTML/JS/EJS 未被截断或重写；
6. 需要 PNG 时再将已通过的 JSON 嵌入图像；
7. 在真实 SillyTavern 中导入内嵌 CharacterBook、确认角色主世界书已挂载，再验证首聊、变量、正则、UI、按钮与生命周期；
8. 没有实机只声明候选与 `runtime: not_run`。

## 完成门槛

- 卡名、入口、开场与世界书投影正确，CharacterBook 不是空容器；
- 内嵌书名、`data.extensions.world`、SillyTavern 世界书列表和角色当前主世界书四者一致；
- 所有启用条目和运行组件都能追溯到维护源；
- HTML/JS/EJS/正则是作者实际写出的内容，不是 Forge 的通用替代品；
- 变量链与 UI 数据链闭合；
- 产物可解析、可往返且未知导入字段未丢失；
- 交付清单只包含用户要求的制品；
- 真实宿主与人工验收状态如实记录。
