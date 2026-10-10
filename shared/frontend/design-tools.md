# 设计资料、可视化挑选与真实源码打磨

这里共享的是制作工具的操作合同，不是统管开场与状态栏的设计规则。两阶段各自使用自己的资料、问题、演示和复核指南；工具界面不会成为 RP 作品界面或默认皮肤。所有工具都可由有 Node 和浏览器能力的宿主使用，不依赖 TavernWeave 或另装设计技能。

## 先取得可用的设计材料

用本阶段的一项实际问题检索，不用“高级精美”替代问题：

```text
npm run frontend:design -- --stage opening_frontend --query "创角 分支" --kind reference
npm run frontend:design -- --stage message_frontend --query "人物关系网" --kind reference
npm run frontend:design -- --stage message_frontend --category "阅读与密度" --query "长中文"
```

结果有适用问题、采用方法、不能照搬的部分、原始来源和可用本地演示。无匹配不套通用页；继续提出本作方案或查实际公开参考。目录不是训练数据的替代权威，也不是已经查过的当前外部研究。模型负责查阅和筛选，不把挑选 JSON 的工作丢给用户。

需要视觉比较时，主动生成本阶段的独立离线挑选页并展示：

```text
npm run frontend:library -- --stage opening_frontend --root <作品目录> --out 制作文件/检查/界面参考/开场.html
npm run frontend:library -- --stage message_frontend --root <作品目录> --out 制作文件/检查/界面参考/持续消息.html
```

页面可直接打开，不需服务器；支持分类、搜索、来源、合成演示、容器宽度和候选清单导出。用户讨论的是画面和体验，不必知道资料 id。候选保持 proposed、research:not_performed、userAcceptance:not_recorded，不能导出后直接覆盖 authority 或 production。演示不是样品矩阵，不进入导入包、初始状态、正式回退或作品 Prompt。

每个阶段只维护当前页面。更新已有工具页面时带上上次输出的 `--replace-sha256 <摘要>`；摘要不符或文件非本工具输出就保留原文件，不能为了省事另存一套旧路线。

## 真实前端的现场打磨

```text
npm run frontend:workbench -- --root <作品目录> --fixtures 制作文件/检查/前端用例.json --case <实际用例id> --browser <现有Chrome或Edge程序>
```

工具沿用正式浏览器夹具执行器，读取最终导入字段，执行真实正则替换或后台脚本，核对源码装配一致；不是另画一个替身。真实源码、编译输出和依赖必须先齐全。脚本主路继续使用实际结果 iframe；不把函数塞进所有窗口掩盖错误。控制面板位于模拟宿主顶层，没有增加包裹消息的窗口层级。

在打开的受控浏览器里查看和操作；工具地址只是本次本地会话，普通新浏览器不拥有夹具连接，不能把它宣称为已部署的通用服务。工具只监听本机临时端口，结束按钮、Ctrl+C 或浏览器断开后关闭。不会启动酒馆、接入真实账户、发模型请求或导入制品。网络只重放原用例已核对资源；缺资源照实显示，绝不改生产源码去伪装成功。

参数由 Agent 从实际维护源码声明到 case.workbench，不要求用户填写合同。例如：

```json
{
  "workbench": {
    "controls": [{
      "id": "body-space", "label": "正文留白",
      "selector": ":root", "property": "--body-space", "type": "number",
      "min": 0, "max": 40, "step": 2, "unit": "px",
      "backport": {
        "path": "制作文件/运行源码/前端/状态栏.html", "format": "html",
        "selector": ":root", "property": "--body-space"
      }
    }],
    "presets": [{ "id": "comfortable", "label": "较宽松", "values": { "body-space": 20 } }],
    "observations": [{ "id": "current-place", "selector": "#current-place" }]
  }
}
```

范围和单位仅为结构示例，不是界面标准。支持数字滑条与精确输入、颜色、选项、单项/全部复位、本项目预设、原样对照、当前截图导出和参数重新载入。重新载入核对当前阶段、用例、源码与参数定义，只恢复样式，不恢复业务状态或免除注入确认。原样对照只关闭临时样式，保留候选和当前测试状态。容器调宽不会替用户重设浏览器视口。没有 backport 的参数可预览，但不会被回写器偷偷附加到正式源码。

需要测试状态切换时，另声明 stateAdapter：scope 为 host/frame，read/write/context 为该窗口内**实际夹具定义的**函数名；context 返回当前聊天、楼层、Swipe 或项目等价目标身份的对象，snapshots 为 `[{id,label,path}]`，path 只能位于制作文件/检查。工具同时记录页面实例，重载也令旧确认失效。工具不提供假冒 MVU 的万能状态接口，也不替项目编造完整状态树。

注入先展示来源批次、目标用例/窗口和字段前后差异，用户确认后才调用夹具写入函数；取消零写入。确认绑定当前状态、参数版本与快照字节，任一变化使确认失效。写后并列保存预期、实际读回和实际字段；不一致就报告失败，不宣称自动恢复或绝对隔离。这里只改受控夹具状态，不获得真实聊天写入许可。

## 选中的参数落回维护源码

面板“保存当前候选”只写 `制作文件/检查/前端打磨/` 的当前阶段/用例记录与截图。截图明确 eligibleForDesignReview:false，因为它含临时覆盖；不进入正式预览索引，不证明审美、用户接受或酒馆成功。

```text
npm run frontend:tune -- --root <作品目录> --record 制作文件/检查/前端打磨/<当前记录>.json
npm run frontend:tune -- --root <作品目录> --record 制作文件/检查/前端打磨/<当前记录>.json --apply --expected-plan <上一步计划摘要>
```

先展示具体声明的差异，已有明确授权覆盖该修改时直接执行，不再制造审批。回写器只修改制作文件/运行源码内已有的 HTML/CSS 声明或 JSON 字段；HTML 用 parse5 定位 style，CSS 用 PostCSS 定位声明。目标不唯一、源/导入内容/夹具变化、计划变化或没有映射就停止，不猜写入位置。正式导入包不会被此工具直接修改。

回写后移除临时覆盖，从维护源码重新构建、更新最终装配，再用相同场景和完整宽窄屏复核。新源码不等于旧导入内容已更新；旧打磨记录不得继续通过源哈希检查。正式设计证据仍由正常 frontend:check 产生，真实酒馆另验。

## 安装后的只读核验

```text
npm run install:check -- --target <实际安装Agent根目录的绝对路径> --host codex
npm run install:check -- --target <实际安装Agent根目录的绝对路径> --host generic --check-dependencies
```

比对当前源与实际安装文件，分别列出匹配、遗漏、改动、过时资源及技能完整性；不把源码树当安装目录。文本只容许换行格式差异，二进制逐字节核对。可选依赖检查也核对实际解析到的包版本。

工具不安装、不删除、不改全局规则。未安装的新文件、旧文件与本机个人修改分别展示，由本次明确授权决定怎样同步。host 字段只是记录目标，不代表已验证宿主支持；文件一致仍须新会话实际发现与调用，hostDiscovery 保持 not_verified。没有实机证据，也不因此宣称制品可直接导入。
