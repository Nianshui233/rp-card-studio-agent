import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Agent never interviews for or authors the final player's in-world character", async () => {
  const agent = await read("AGENT.md");
  const boundaries = await read("orchestrator/stage-boundaries.md");
  const positioning = await read("internal-skills/rp-project-foundation/references/positioning.md");
  const character = await read("internal-skills/rp-cast-authoring/references/character.md");
  const opening = await read("internal-skills/rp-experience-authoring/references/narrative-opening.md");

  assert.match(agent, /不得询问用户“准备扮演谁/);
  assert.match(agent, /真单人卡中的“单人”指唯一预先创作的卡内角色\/NPC/);
  assert.match(boundaries, /所有阶段都不得询问用户准备扮演什么人物/);
  assert.match(boundaries, /玩家旅程.*UI 体验问题仍可询问/s);
  assert.match(positioning, /不询问“用户要扮演谁/);
  assert.match(character, /角色清单永远不包含 `<user>`/);
  assert.match(opening, /制作访谈没有询问用户要扮演谁/);
  assert.doesNotMatch(agent, /系统层可以按项目本体需要定义主控身份/);
  assert.doesNotMatch(positioning, /你将扮演并调度/);
});

test("blank creation is authoritative while optional quick presets remain user-triggered and editable", async () => {
  const openingTemplate = await read("assets/templates/opening.yaml");
  const userTemplate = await read("assets/templates/user-character.yaml");
  const stateSource = await read("assets/examples/opening-ui-rp/src/runtime/apps/opening/scripts/state.js");
  const renderSource = await read("assets/examples/opening-ui-rp/src/runtime/apps/opening/scripts/render.js");
  const bootstrapSource = await read("assets/examples/opening-ui-rp/src/runtime/apps/opening/scripts/bootstrap.js");
  const shell = await read("assets/examples/opening-ui-rp/src/runtime/apps/opening/fragments/shell.html");

  assert.match(openingTemplate, /content_policy: blank_user_defined/);
  assert.match(userTemplate, /display_name: ""/);
  assert.match(stateSource, /form:\s*\{ name: "", publicIdentity: "", startingLocation: "", startingGoal: "" \}/);
  assert.match(renderSource, /function applyPreset/);
  assert.match(renderSource, /已载入可编辑示例/);
  assert.doesNotMatch(bootstrapSource, /applyPreset\s*\(/);
  assert.match(shell, /快速示例（可编辑）/);
  assert.match(shell, /option value="">请选择<\/option>/);
});
