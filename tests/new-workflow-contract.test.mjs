import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const preflight = readFileSync(new URL("../references/project-preflight.md", import.meta.url), "utf8");
const mvu = readFileSync(new URL("../references/stages/mvu-ejs.md", import.meta.url), "utf8");
const ui = readFileSync(new URL("../references/stages/status-ui.md", import.meta.url), "utf8");
const integration = readFileSync(new URL("../references/stages/integration.md", import.meta.url), "utf8");

test("skill remains explicit-only and preflight records an adjustable plan immediately", () => {
  assert.match(skill, /only when the user explicitly selects it or invokes `\$rp-card-studio`/);
  assert.match(preflight, /工作区.*NSFW.*任务类型.*已有材料.*可选阶段计划.*附加交付物/s);
  assert.match(preflight, /立即在用户指定工作区建立或更新项目记录/);
  assert.match(preflight, /workflow\.planned_stages/);
  assert.doesNotMatch(preflight, /路线锁|--force|selected_stages/);
});

test("runtime stages require actual source instead of proprietary generators", () => {
  assert.match(mvu, /真实文件/);
  assert.match(mvu, /\.ejs/);
  assert.match(mvu, /不在实际实现之外追加第二套合成校验层/);
  assert.match(ui, /完整 HTML 文档/);
  assert.match(ui, /源码应像真正浏览器应用一样按结构、视觉系统、布局、组件、动效、状态、渲染、交互和宿主适配拆分/);
  assert.match(ui, /rp-card-forge ui-build/);
  assert.match(skill, /single file is the deployment artifact, not the development method/);
  assert.match(integration, /随后 Forge 只读取该构建结果并填入 `replaceString` \/ `content`/);
  assert.doesNotMatch(skill, /generic `ui\.yaml` component compiler as the default authoring route[\s\S]*legacy_generated/);
});

test("obsolete generic UI compiler assets are gone", () => {
  assert.equal(existsSync(new URL("../scripts/ui/compiler.mjs", import.meta.url)), false);
  assert.equal(existsSync(new URL("../assets/templates/ui/components", import.meta.url)), false);
  assert.equal(existsSync(new URL("../assets/schemas/ui-component.schema.json", import.meta.url)), false);
});
