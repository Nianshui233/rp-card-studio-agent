# 雨幕旅店：开场与持续界面分离样本

这个样本同时验证“开场与持续界面职责分离”和“模块化前端应用构建”：

- 首条消息使用 `<雨幕开场/>`，展示版本、世界介绍、游玩指南和创角入口；
- 进入剧情后使用 `<雨幕状态/>`，只展示当下房间、人物、物品和事件；
- 两者可以共享视觉主题，但不共享阶段职责，也不把介绍页误当常驻状态栏。

开场应用按中型制作，持续状态应用按轻型制作；等级用于展示两种规模在同一项目中可以独立决定。

它不是所有题材都应照搬的视觉模板；它演示当前默认开发方式。开场与状态分别拥有真正的 HTML/CSS/JS 应用工程，最终再构建成 `src/runtime/ui/开场页.html` 和 `状态页.html`。

## 源码与制品

```text
src/runtime/apps/opening/    开场浏览器应用源码与模拟数据
src/runtime/apps/status/     持续状态浏览器应用源码与模拟数据
src/runtime/ui/开场页.html    正式自包含运行制品
src/runtime/ui/状态页.html    正式自包含运行制品
src/world/旅店世界书.yaml      世界核心与每轮状态标记生产契约
assembly.yaml                 把构建结果装入开场/状态正则
```

两个 `ui-app.yaml` 都会额外生成 `dist/*.preview.html`，其中注入模拟状态，便于不用 SillyTavern 也能查看满数据界面。正式 `src/runtime/ui/*.html` 不含模拟数据。

从技能根目录构建：

```powershell
node scripts/rp-card-forge.bundle.mjs ui-build assets/examples/opening-ui-rp/src/runtime/apps/opening/ui-app.yaml
node scripts/rp-card-forge.bundle.mjs ui-build assets/examples/opening-ui-rp/src/runtime/apps/status/ui-app.yaml
```

开场页收集姓名、房间、来意、雨夜关系和开场节奏，由 `src/runtime/opening/创角变量桥.yaml` 维护字段绑定。确认后生成 `<雨幕创角>...</雨幕创角>` 主控设定块并尝试交给宿主输入框；这是非 MVU 路线，所以不会伪称已经改写了运行时变量。

持续状态页演示房态、住客搜索、事件进度和宿主行动。真实运行读取项目解析层提供的 `window.__RAIN_STATE__`，预览页才读取隔离的 `window.__RP_UI_MOCK__`。
