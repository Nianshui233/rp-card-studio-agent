# MVU + EJS 明确只读桥

这份最小样例使用：

- 一个锁 commit 的 MagVarUpdate Loader；
- MVU 原生内部 Schema，由 `[initvar]` 与 `$meta` 生成；
- 一个 Tavern Helper bridge，监听 `prompt_template_prepare`，把最近有效消息的完整 MvuData 深拷贝到 `context.mvu`；
- ST-Prompt-Template 世界书条目读取 `mvu.stat_data`，并用 `await getwi('核验桥接示例','桥接简报')`；
- “随 AI 输出”模式使用标准 `<UpdateVariable>` lodash 命令和对应 prompt/display 清理；本样例不声明已适配额外模型解析。

导入：

1. 导入并绑定 `核验桥接示例.json` 为角色主世界书；
2. 导入 `runtime-scripts.folder.json`，手动启用其中唯一 Loader 和 bridge；
3. 导入 `regex.json` 并允许角色 scoped regex；
4. 安装并启用 ST-Prompt-Template；
5. 新建聊天检查 `stat_data.世界.区域`，确认不存在 `stat_data.stat_data`。

远程 Loader 已锁定到本次核对 commit；其传递依赖仍需联网。真实宿主运行：`not_run`。
