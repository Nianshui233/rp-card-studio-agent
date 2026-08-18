import assert from "node:assert/strict";
import test from "node:test";

import { makeProject } from "../scripts/forge/project.mjs";

test("new projects use the single fixed multi-file RP package deliverable", () => {
  const project = makeProject({ name: "雾港夜班", nsfw: false });
  assert.deepEqual(project.deliverables, ["rp_project_package"]);
  assert.equal(project.project.target, "character_card");
  assert.deepEqual(project.release.outputs, []);
});

test("optional runtime stages remain planned choices rather than automatic outputs", () => {
  const project = makeProject({
    name: "无前端单人卡",
    nsfw: false,
    stageRoute: ["positioning", "worldbuilding", "character", "narrative_opening", "integration"],
  });
  assert.equal(project.features.mvu, false);
  assert.equal(project.features.ejs, false);
  assert.equal(project.features.status_ui, false);
  assert.equal(project.source_manifest.mvu.length, 0);
  assert.equal(project.source_manifest.ui.length, 0);
});
