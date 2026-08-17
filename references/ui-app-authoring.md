# 模块化浏览器前端应用工作流

角色卡最终需要的是正则 `replaceString`、开场消息或其他载体中的一个自包含 HTML；这只是部署格式，不是开发方式。

开场前端与持续状态前端默认按真正的浏览器应用开发：先拆分结构、视觉系统、页面组件、交互、状态、宿主适配和模拟数据，分别制作与验收，最后再构建成完整单文件 HTML。不要因为最终要内联，就在开发阶段退化成一块安全、克制、只读的小面板。

## 两层制品

始终区分：

1. **开发源码**：多文件应用工程，便于分阶段创作、扩展、调试和复盘；
2. **运行制品**：构建得到的一份完整 HTML，供正则、开场或其他 SillyTavern 载体使用。

最终角色卡默认仍只交付 `.json`。源码工程保留在项目工作区，除非用户明确要求源码归档，不把文件夹当成额外交付物。

## 默认目录

每个完整功能面拥有自己的应用目录。开场与持续状态默认是两个应用：

```text
src/runtime/apps/
  opening/
    ui-app.yaml
    index.html
    fragments/
    styles/
      tokens.css
      base.css
      layout.css
      components.css
      effects.css
      responsive.css
    scripts/
      state.js
      host-adapter.js
      render.js
      interactions.js
      bootstrap.js
    mock/
      state.json
  status/
    ...

src/runtime/ui/
  开场界面.html           # 构建结果
  状态界面.html           # 构建结果
```

不要把一个统一功能面拆成几十条互不连贯的正则。源码组件化和运行表面碎片化是两件不同的事：可以有很多 CSS/JS/HTML 片段，但最终同一导航与状态域仍构建为一份完整 HTML。

## UI 应用清单

`ui-app.yaml` 示例：

```yaml
schema_version: 1.0.0

ui_app:
  id: dingge-opening
  surface: opening            # opening / status / message_tool / zero_layer
  experience_level: heavy
  entry_html: index.html
  fragments:
    - slot: APP_SHELL
      file: fragments/app-shell.html
  styles:
    - styles/tokens.css
    - styles/base.css
    - styles/layout.css
    - styles/components.css
    - styles/effects.css
    - styles/responsive.css
  scripts:
    - scripts/state.js
    - scripts/host-adapter.js
    - scripts/render.js
    - scripts/interactions.js
    - scripts/bootstrap.js
  mock_state: mock/state.json
  preview_output: dist/开场界面.preview.html
  script_wrapper: iife
  output: ../../ui/开场界面.html
```

入口 HTML 使用三个构建槽位：

```html
<!-- RP_UI_STYLES -->
<!-- RP_UI_FRAGMENT:APP_SHELL -->
<!-- RP_UI_SCRIPTS -->
```

构建器按清单顺序合并 CSS 与 JS，并插入 HTML 片段：

```powershell
node scripts/rp-card-forge.bundle.mjs ui-build <项目目录>/src/runtime/apps/opening/ui-app.yaml
```

使用 `--dry-run` 只检查，不写入；使用 `--output` 可临时指定预览制品。项目锁定或构建角色卡前，运行 HTML 必须与清单源码重新构建的结果一致。源码变化但未重建会报告 `ui.app_stale`。

若同时声明 `mock_state` 与 `preview_output`，`ui-build` 还会生成一份仅用于工作区浏览器验收的预览 HTML，并注入 `window.__RP_UI_MOCK__`。正式 `output` 不含模拟数据；正则和角色卡只引用正式 `output`，绝不引用 `.preview.html`。

`classic_concat` 风格的多文件脚本通过清单顺序共享同一个 IIFE 作用域，不写 `import/export`。如果用户明确选择 React/Vue/Svelte/Vite 等正式工程，使用 `compiled_frontend` 和项目自己的构建流程，最终仍输出自包含 HTML并记录构建证据；不要为了“像前端工程”而强制引入框架。

## 分层职责

### `index.html` 与 `fragments/`

只负责语义结构、页面容器、导航、弹窗、抽屉、反馈层和数据挂载点。不要在这里同时完成全部样式和运行逻辑。

### `styles/tokens.css`

先确定项目自己的颜色、字体、间距、边框、阴影、材质和动效令牌。视觉主题来自世界和玩法，不使用默认蓝色后台仪表盘。

### 其他 CSS

- `base.css`：重置、字体、基本可访问状态；
- `layout.css`：应用外壳、网格、导航和功能页布局；
- `components.css`：人物、物品、事件、地图、表单、指标、弹窗等组件；
- `effects.css`：主题装饰、转场、反馈和趣味演出；
- `responsive.css`：聊天宽度、窄屏、触控、软键盘、中文长文本和减少动画。

CSS 层应有独立的创作轮次。不要把视觉表现当成“功能完成后的可选润色”而自动省略。

### `scripts/state.js`

定义页面内状态、草稿、当前视图、筛选条件和派生展示。它不直接访问宿主。

### `scripts/host-adapter.js`

集中封装 SillyTavern、Tavern Helper、MVU、EJS 或既有插件能力：

- 同时探测当前 `window` 和 `window.parent`；
- 等待目标全局初始化；
- 获取当前消息 ID；
- 读取和写回真实状态；
- 监听变量与消息生命周期；
- 填充/发送输入、创建消息或调用生成；
- 返回明确成功、失败和回退结果。

页面组件不应各自散写父页面 DOM 或插件全局。父页面访问、私有 API 和复杂宿主联动可以使用；只需记录目标版本、失败表现并真机验证，不为个人自用项目额外设置创作门禁。

### `scripts/render*.js`

把状态映射为自然中文、主题化且可操作的功能页面。可按页面继续拆分，例如 `render-inventory.js`、`render-characters.js`、`render-events.js`。

### `scripts/interactions.js`

实现导航、筛选、弹窗、物品使用、行动生成、表单校验、快捷操作、趣味交互和反馈。按钮不能只是装饰；真实动作应通过 `host-adapter.js` 落到宿主或生成可恢复文本。

### `mock/state.json`

提供完整满数据样本。前端在没有连接 SillyTavern 时可进入模拟模式，用于查看真实布局，而不是永远停在“正在读取变量”。至少覆盖：

- 满数据；
- 空数组/空对象；
- 中文长文本；
- 多人物、多物品、多事件；
- 危险、错误或异常状态。

中型、重型和超重型默认应有模拟状态。它是视觉与交互验收工具，不得在真实运行时冒充实时数据。

## 正确制作顺序

UI 阶段按以下顺序多轮推进，每轮仍遵循“问题与信息采集 + 推荐方向 → 用户选定或放权 → 给出片段/实现 → 阶段总结”：

1. 分别锁定开场与持续状态的等级、设备、视觉方向和主要功能；
2. 写前端产品方案：信息架构、页面地图、主要旅程、数据来源、宿主动作；
3. 写数据契约：可见字段 → 真实路径 → 刷新时机 → 缺失/错误表现；
4. 建应用目录与 `ui-app.yaml`；
5. 只做 HTML 结构与语义，不急着内联；
6. 独立完成设计令牌、布局、组件、主题演出和响应式；
7. 用模拟状态完成普通浏览器满数据验收；
8. 实现交互和操作反馈；
9. 通过 `host-adapter.js` 接入真实 SillyTavern/MVU/Tavern Helper；
10. 在真实宿主中检查数据、按钮、编辑、Swipe、重载、聊天切换和 Blob URL 模式；
11. 执行 `ui-build`，生成自包含 HTML；
12. 正则或装配只引用构建结果，最后再构建角色卡 JSON。

不要一开始就要求模型直接输出最终完整 HTML。也不要在应用结构尚未确认时，用一个巨大代码块同时解决设计、数据和宿主问题。

## 等级与应用规模

所有等级都按浏览器应用思维制作，区别是产品范围、视觉演出和交互深度：

- **轻型**：成熟的单一持续应用，功能范围较克制，但仍有导航、多类真实数据、信息操作、宿主动作、反馈、响应式和完整主题；
- **轻中型**：在轻型上增加多个便利、动效、信息工具或宿主联动；
- **中型**：产品级信息架构、复合操作、更多完整功能区和可靠 UI 状态；
- **重型**：强主题演出、复杂联动、大量实际玩法入口、深度宿主协作和多阶段旅程；
- **超重型/0层**：前端成为主要游玩表面，可使用正式构建工程和应用级路由/状态管理。

等级不由代码行数单独决定，但低代码量、单屏静态卡片、无模拟数据的空壳、只有几个数值的仪表盘通常无法承载中型或重型体验。代码规模可以作为异常信号，不能代替玩家体验判断。

## 构建与交付检查

- 开发源码与运行 HTML 职责清楚；
- `ui-build` 可重复执行且结果稳定；
- 最终 HTML 包含完整 `<style>` 与 `<script>`，不残留本地文件引用或构建槽位；
- 最终 HTML 仍通过功能面质量探针和宿主作用域检查；
- 正则 `replaceString` 使用构建结果，不引用开发目录；
- 构建角色卡前不存在 `ui.app_stale`；
- 默认交付仍是一个角色卡 `.json`，PNG 或源码归档只在用户明确要求时额外提供。
