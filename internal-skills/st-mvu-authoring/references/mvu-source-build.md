# MVU_ZOD：实际源码 → 构建 → 导入

## 使用边界

这是宿主无关的 Node 工程校验链，供 Codex、Claude Code、OpenCode、OpenClaw、DeepSeek harness 等调用。它不依赖某个宿主的聊天记忆，不替代创作访谈、用户授权或真实 SillyTavern 验收。

优先保留已验证教程/工程模板的 Schema 与入口职责、Loader import、API 和构建方法。使用本工具时采用下述 split 模块合同；已有其他构建器的项目需要实现同等“实际重建并对比导入正文”的适配，不靠填通过标记绕过，也不擅自换掉目标 provider。脚本不联网下载/执行 provider，远程 import 保留给 Tavern Helper。

## 建立 canonical 文件

以 assets/templates/mvu-zod-source-contract.json 为合同起点，按当前项目修改路径/ID；不要保留示例玩家字段或未确认身份。

- schema.ts/js：只导出 Schema，或导出 createSchema(z)。使用宿主全局 z/_ 或项目内纯模块；离线模块不得需要 DOM、MVU 或远程 provider。
- 注册入口：导入 Schema/工厂和 registerMvuSchema，在宿主就绪后注册。
- loader.js：单个已验证静态 import。tutorial_default 明确允许教程滚动地址，不冒称已锁版本；pinned 才要求固定 tag/commit。
- initvar.yaml：完整基线；变量列表、更新规则、路径索引、输出格式使用真实 canonical 文本。
- 制作文件/检查/用例/schema.json：数组，每项 name/input/expected（accept 或 reject）；对 default/coerce/transform 再写 output，校验实际规范化结果而非只有通过与否。
- 制作文件/配置/MVU运行合同.yaml 与最终正则 JSON：参与源码哈希和包级校验，版本画像、方言、provider 与源码合同一致。
- 世界书与角色卡导入 JSON：先通过既有无损打包流程生成；worldbookBindings 将 canonical 组件映射到实际条目。Prompt 职责可在同一条目组合，sources 顺序和 separator 必须与实际正文一致；initvar 数据不与 Prompt 混合。Greeting-only 全量初始化不强制单独世界书基线，但所有实际可游玩 Greeting 必须完整，仍使用 canonical initvar 做初态 fixture。

本构建器输出独立的 Loader + 注册器 ScriptFolder。Loader 默认保留酒馆助手按钮功能；可用 scriptMetadata/folderMetadata 保留已有导出元数据，构建只替换既定 ID 对应的当前代码。它不生成或覆盖其他项目脚本/前端，若目标已有额外脚本就拒绝覆盖，使用专用生成目录。

## 执行

在 Agent 工具包根目录安装锁定依赖，再指定作品项目：

```powershell
npm ci
node scripts/mvu/mvu-zod-project.mjs build --root "作品项目目录"
node scripts/mvu/mvu-zod-project.mjs validate --root "作品项目目录"
node scripts/production/production-check.mjs validate --root "作品项目目录"
```

可用 --contract 指定项目内合同路径，默认 制作文件/项目记录/mvu-source-contract.json；--out 是项目内输出目录，默认 制作文件/构建/MVU。

构建生成 registration.js、loader.js、schema.json、initvar.normalized.json、指定 ScriptFolder 和真实构建记录。所有路径限制在当前作品项目，拒绝链接逃逸、覆盖源码或输出互相重叠。schema.json 描述输入结构；不可表达的 transform 以实际 Schema fixture 为准，不宣称 JSON Schema 复刻了所有逻辑。

检查会重新执行构建和 Schema：

1. 哈希覆盖注册入口、Schema、实际导入的局部依赖、Prompt、fixture、角色卡/世界书；不接受 inline source 或自填 sourceHash。
2. 真正解析 YAML，再用实际 Schema 测初态、各实际 Greeting 全量覆盖和 fixture；工程型 TS 经构建处理，不粗暴删类型/拼接源码。
3. 精确比较重建结果、磁盘 build 输出和最终 JSON 内的每个脚本；检查启用、唯一性及全部最终脚本的 ES module 语法。
4. 世界书正文与 canonical 组件一致；更新模型确实能收到变量列表；最终角色卡 Greeting 不能逃过 Schema 校验。
5. 生产门禁读取真实组件路径；mvu.sourceContract 使用相同合同对象，组件路径与合同保持一致。passed 字符串不提供通过依据。

包级 CLI 使用 --mvu-source-contract 时，会核对本次指定角色卡/世界书/ScriptFolder 的实际正文是否与合同校验制品一致。--zod-source 是旧 inline 源/构建正文的辅助镜像，不能代替 canonical 工程校验。

## 证据分级

构建记录明确 evidenceLevel: offline_only。离线 Zod 固定版本写入报告；宿主 Zod/扩展版本另行记录，不把本工具版本强制冒充所有宿主的版本。

runtime 初始为 not_run。请求记录 pass 时，必须有真实运行记录文件/哈希、当前精确 artifactHash、同一份 Schema/Prompt/世界书/开局输入哈希、宿主版本、采集时间/方法及分步骤原始证据文件/哈希，覆盖注册、初始化、处理后的 Prompt、更新解析、消息读回和保存重载。

哈希只能证明材料与当前制品的绑定和一致性，不能证明文件是现场采集、观察正确或用户已接受。Agent 必须实际查看现场/用户提供证据；不能自己生成一个记录、勾 observed 后称运行成功。未能复现就是 not_run/failed；用户验收仍由阶段授权账本处理。

## 依据入口

教程： https://stagedog.github.io/络络/教程/手写mvu变量卡/
重点核对安装/脚本、初始化、变量提示词、脚本/界面控制变量、手写结构与电脑编写模板。实现依据是这些责任边界，不是示例卡的人设、字段或界面外观。遇到版本差异，查看目标 provider 源码与实际宿主，不按域名或模板文本推断原因。
