# 整合交付阶段

本阶段只做两件事：把已经确认的 RP 内容切分并排进 CharacterBook；把已经写好的真实运行组件原样装入角色卡。

涉及卡内脚本、消息前端、宿主按钮或 MVU 写入时，先读取
[酒馆助手运行时参考](../../st-runtime-authoring/references/host/tavern-helper-runtime.md) 与
[MVU 运行时参考](../../st-runtime-authoring/references/host/mvu-runtime.md)；涉及 EJS 时再读取
[EJS 运行时参考](../../st-runtime-authoring/references/host/ejs-runtime.md)，再按目标环境实测结果装配；不要把聊天楼 `data`、iframe 本地对象或未经验证的私有 API 当成持久状态。

## 内容装配

按内容责任而不是模板字段切分：

- `data.description`：完整项目入口/核心合同，不放任何 NPC 档案；
- 世界观：按稳定主题切分，常驻骨架少量，其余依关键词、位置、深度和递归触发；
- NPC：通常整块放入一个连续条目；
- 系统、场景、叙事规则：按完整职责整个放入，避免碎成失去上下文的小片；
- 用户主控模板：角色卡项目默认保留一个独立、默认禁用、以 `<user>` 为触发键的中文空白世界书条目；最终游玩者填写后再启用，或由开局 UI 收集后写入同一条目。普通世界、NPC、场景和系统不能依赖该条目才能运转，也不能把“系统核心/宿主/操作员”等项目概念自动指定为用户身份；
- MVU/EJS：把实际更新规则、输出格式、上下文模板等放入各自目标条目；
- 开场介绍/创角前端：由 `opening.yaml#/opening_ui` 维护，标记进入目标 opening，HTML由对应 display 正则装入；
- 开场创角变量桥：由 `opening.yaml#/creation_bridge` 维护表单字段、状态路径、提交路线与读回证据；不能把 `createChatMessages` 的 `data` 附件当成 MVU 写入成功；
- 持续状态 UI：来自 `status-ui.yaml`，只包含进入RP后的状态、物品、关系、任务等功能面；
- HTML 和正则：不进入世界书正文，而进入卡内扩展字段。

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

模块化 UI 先按 `ui-app.yaml` 执行 `rp-card-forge ui-build`，得到项目专属的自包含 HTML；随后 Forge 将 HTML 与正则配置分开写入项目包，并在项目清单中配对。不得把这些源码再次转换成通用 UI、额外运行层、合成 EJS 条目或固定正则组。

EJS 文件通常通过 `worldbook_manifest.entries[].source.kind: file` 放进明确的世界书条目。MVU 初始变量必须由名称含 `[initvar]` 的真实文件条目装入；更新规则和输出格式也进入各自明确目标。具体启用与路由由目标实现决定。

整合验收时，开场页点击确认后要用非默认值做一次读回：例如姓名、起始地点或身份至少改变一项，并确认状态栏/API读取到的是新值。若只看到聊天记录里出现了这些字，却读回仍是默认值，变量桥就是断的。

## 分件、导入与挂载

这三个状态不得混为一谈：

1. 项目包中存在独立世界书 JSON：世界书组件已经生成；
2. SillyTavern 世界书列表中存在同名书：世界书组件已经实际导入；
3. 角色编辑页主世界书选择和实际世界书名一致：角色已经挂载该书。

Forge 负责生成第 1 项并在项目清单中记录第 3 项的目标名称，但角色卡组件不能保证目标 SillyTavern 已经存在该书。真实宿主验收必须导入独立世界书并确认当前主世界书，而不能只检查项目包文件是否存在。

项目若明确要求零手工导入，可以编写项目专属 Tavern Helper 脚本调用目标版本已经实测的 SillyTavern 接口完成导入与挂载；这是版本耦合的卡侧自动化，不得修改 SillyTavern 本体，也不得用未经实测的固定通用脚本冒充成功。

## 正则成组审查

对每个真实协议检查完整规则组，例如：

- 开局标记：display 替换完整开局 HTML；prompt 只留下短叙事说明；
- 状态标记：display 替换完整状态 HTML；prompt 删除纯界面占位；
- 变量块：display 隐藏已完成和流式未完成块；prompt 按实际更新模型需要决定保留/删除及深度；
- 其他剧情块：检定、通知、选择等各自独立。

规则必须针对本卡标记和目标环境，不自动套一个所有卡共用的固定列表。

对每个 display 捕获标记还要反向检查生产者：开场消息、常驻模型输出契约、MVU框架、Tavern Helper脚本、用户动作或成熟既有实现中必须至少有一个真实来源。每轮状态栏默认把输出命令放在独立中文 CharacterBook 条目中；非 MVU 状态栏同时在该条目定义完整 XML 数据格式。只有正则和 HTML、没有生产者时不得交付。

## 默认交付

默认且唯一生成多文件 RP 项目包。项目包内分别提供角色卡 JSON、独立世界书 JSON、正则配置、酒馆助手脚本和完整自包含 HTML；项目清单、导入说明和验证报告一并落盘。项目源码可以继续留在工作区，但不能把单个组件文件冒充整个交付物。

## 构建纪律

1. 先构建所有 `multi_file_html` 前端，确认不存在 `ui.app_stale`；
2. 从 `src/` 构建候选；
3. 校验 YAML/JSON/JS/EJS/HTML/正则语法和引用；
4. 检查 CharacterBook ID、顺序、触发和递归；
5. 检查实际扩展字段结构、脚本启用状态和依赖；
6. 重新打开项目包，确认大段 HTML/JS/EJS 未被截断或重写；
7. 确认 HTML 正则配置的“替换内容”为空，并与同名完整 HTML 建立配对；
8. 在真实 SillyTavern 中按说明导入角色卡、独立世界书、正则和脚本，确认角色主世界书已挂载，再验证首聊、变量、UI、按钮与生命周期；
9. 没有实机只声明项目包候选与 `runtime: not_run`。

## 完成门槛

- 卡名、入口、开场与世界书投影正确，独立世界书不是空容器；
- 项目清单目标书名、独立世界书文件、SillyTavern 世界书列表和角色当前主世界书四者一致；
- 所有启用条目和运行组件都能追溯到维护源；
- HTML/JS/EJS/正则是作者实际写出的内容，不是 Forge 的通用替代品；
- 变量链与 UI 数据链闭合；
- 项目包各组件可解析、可往返且未知导入字段未丢失；
- 项目包使用唯一固定结构，不再根据用户选择改变交付形式；
- 真实宿主与人工验收状态如实记录。
