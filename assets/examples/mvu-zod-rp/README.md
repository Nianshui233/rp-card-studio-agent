# mvu-zod-rp：灰港避难所

这是仓库中 **MVU_ZOD 完整制品路线的主参考样本**。它不是 native MVU 的缩写版，也不依赖 EJS。

## 必需组件

- `灰港避难所.json`：V3 角色卡；两个可游玩 Greeting 都有完整 `<initvar>`；嵌入 Regex、CharacterBook 和两项 Tavern Helper 脚本。
- `灰港避难所世界书.json`：详细变量更新规则、当前状态与路径索引、JSON Patch 输出格式、叙事规则。
- `运行脚本.folder.json`：唯一锁定 commit 的 MagVarUpdate Loader + 完整 ZOD 注册脚本。
- `schema.js`：可读 Zod Schema 源；与 ScriptFolder 中 ZOD 内容一致。
- `MVU运行合同.yaml`：明确 mode、初始化策略、输出方言、锁定依赖、必需世界书条目和验收状态。
- `regex.json`：initvar 隐藏、UpdateVariable 完整/流式清理、状态栏渲染。
- `regex.fixtures.json`：上述 Regex 的离线回放。
- `状态栏.html`：按当前数值消息楼层读取完整 MvuData；不监听 `VARIABLE_UPDATE_ENDED` 冒充保存完成。

## 完整闭环

```text
锁版本 MVU Loader
+ registerMvuSchema(Schema)
+ 每个可游玩 Greeting 的完整 initvar
+ [mvu_update] 详细更新规则
+ 当前 stat_data 与路径索引
+ 单一 JSON Patch 输出方言
+ UpdateVariable/initvar Regex
+ 当前楼层状态栏消费者
```

缺少其中任一项都不是“轻量 MVU_ZOD”，而是不完整制品。

## 静态验证

```powershell
node scripts/validate-rolecard-package.mjs `
  --root assets/examples/mvu-zod-rp `
  --card 灰港避难所.json `
  --worldbook 灰港避难所世界书.json `
  --worldbook-name 灰港避难所世界书 `
  --regex regex.json `
  --regex-mode alternative `
  --fixtures regex.fixtures.json `
  --script-folder 运行脚本.folder.json `
  --zod-source schema.js `
  --mvu-contract MVU运行合同.yaml
```

另运行：

```powershell
python -X utf8 scripts/mvu/validate-initvar-yaml.py `
  --card assets/examples/mvu-zod-rp/灰港避难所.json `
  --zod-script assets/examples/mvu-zod-rp/schema.js
```

静态检查不替代真实 Tavern Helper、MagVarUpdate 和 Zod 运行验收；当前保持 `runtime: not_run`。
