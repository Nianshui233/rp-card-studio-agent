# mvu-ejs-rp：MVU_ZOD + EJS 世界书调度集成样本

这是仓库中用于验证 **MVU、MVU_ZOD、EJS 世界书模板和只读 bridge** 分层的最小完整样本。

## 各层职责

- `灰港避难所.json`：V3 角色卡，包含独立世界书、禁用 `[initvar]` 基线和 MVU/ZOD 脚本；角色卡不嵌入 CharacterBook。
- `灰港避难所世界书.json`：变量规则、动态 stat_data 注入、JSON Patch 输出合同，以及 EJS 场景控制器。
- `运行脚本.folder.json`：唯一锁定 commit 的 MVU Loader 与 ZOD 注册脚本。
- `schema.js`：可读 ZOD Schema 源。
- `MVU运行合同.yaml`：MVU 路线和消费者声明。
- `EJS运行合同.yaml`：EJS 执行阶段、共享消息变量 bridge、只读方向和失败回退。\n- `动态内容.ejs`：可读的动态场景模板源；构建器把它原文放入世界书“动态内容总控”条目。
- `regex.json` 与 `regex.fixtures.json`：变量更新和状态栏标记的离线检查。

## 关键路线

```text
当前消息 variables.stat_data
→ STPT getvar('stat_data.世界.地点', { scope: 'message' })
→ EJS 只读选择世界书条目
→ Prompt 注入动态场景规则
```

EJS 不注册 ZOD、不输出 `<UpdateVariable>`、不调用 `Mvu.replaceMvuData`。本样本使用 worldbook-initvar，只做静态检查，真实 STPT/MVU/宿主运行仍标记为 `runtime: not_run`。
