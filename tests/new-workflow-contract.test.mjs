import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const agent = readFileSync(new URL("../AGENT.md", import.meta.url), "utf8");
const preflight = readFileSync(new URL("../orchestrator/project-preflight.md", import.meta.url), "utf8");
const mvu = readFileSync(new URL("../internal-skills/st-runtime-authoring/references/mvu-ejs.md", import.meta.url), "utf8");
const ui = readFileSync(new URL("../internal-skills/st-frontend-authoring/references/status-ui.md", import.meta.url), "utf8");
const frontendSkill = readFileSync(new URL("../internal-skills/st-frontend-authoring/SKILL.md", import.meta.url), "utf8");
const integration = readFileSync(new URL("../internal-skills/st-integration-qa/references/integration.md", import.meta.url), "utf8");

test("agent preflight records an adjustable plan immediately", () => {
  assert.equal(existsSync(new URL("../SKILL.md", import.meta.url)), false);
  assert.match(agent, /首轮一次询问所有缺失的项目级信息/);
  assert.match(preflight, /工作区.*NSFW.*任务类型.*已有材料.*可选阶段计划/s);
  assert.doesNotMatch(preflight, /附加交付物|默认最终只交付一个角色卡/);
  assert.match(preflight, /立即在用户指定工作区建立或更新项目记录/);
  assert.match(preflight, /workflow\.planned_stages/);
  assert.doesNotMatch(preflight, /路线锁|--force|selected_stages/);
});

test("runtime private skills require actual source instead of proprietary generators", () => {
  assert.match(mvu, /真实文件/);
  assert.match(mvu, /\.ejs/);
  assert.match(mvu, /不在实际实现之外追加第二套合成校验层/);
  assert.match(ui, /完整 HTML 文档/);
  assert.match(ui, /源码应像真正浏览器应用一样按结构、视觉系统、布局、组件、动效、状态、渲染、交互和宿主适配拆分/);
  assert.match(ui, /rp-card-forge ui-build/);
  assert.match(frontendSkill, /单文件是交付形态，不是开发方式/);
  assert.match(integration, /Forge 将 HTML 与正则配置分开写入项目包/);
  assert.match(integration, /多文件 RP 项目包/);
  assert.doesNotMatch(agent, /generic `ui\.yaml` component compiler as the default authoring route[\s\S]*legacy_generated/);
});

test("obsolete generic UI compiler assets are gone", () => {
  assert.equal(existsSync(new URL("../scripts/ui/compiler.mjs", import.meta.url)), false);
  assert.equal(existsSync(new URL("../assets/templates/ui/components", import.meta.url)), false);
  assert.equal(existsSync(new URL("../assets/schemas/ui-component.schema.json", import.meta.url)), false);
});
