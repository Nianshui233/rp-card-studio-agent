import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeProject, loadProject, loadProjectSource, makeProject, makeState, validateProjectModel } from "../scripts/forge/project.mjs";
import { validatePayload } from "../scripts/forge/formats.mjs";
import { validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";

test("edit/convert projects cannot pass without preserved inputs and a replacement <user> source", () => {
  const project = makeProject({ name: "旧卡改造回归", nsfw: false, operation: "edit" });
  const state = makeState(project);
  state.active_stage = "integration";
  state.stages.materials.status = "complete";
  state.stages.materials.summary = "已盘点材料";
  state.stages.integration.status = "in_progress";
  project.workflow.current_stage = "integration";
  project.agent.active_skill = "st-integration-qa";
  project.agent.writable_stage = "integration";
  project.agent.readable_stages = ["preflight", "positioning", "materials", "integration"];
  project.source_manifest.user_character = [];
  project.source_manifest.preserved_imports = ["src/import/original.json", "src/import/preserved.json"];
  const report = validateProjectModel(project, state, path.resolve("."));
  assert.ok(report.issues.some((entry) => entry.rule === "legacy.material_inventory"));
  assert.ok(report.issues.some((entry) => entry.rule === "legacy.user_character_template"));
});

test("the materials intake gate can open before the replacement <user> file is created", () => {
  const project = makeProject({ name: "旧卡材料入口", nsfw: false, operation: "edit" });
  const state = makeState(project);
  project.source_manifest.user_character = [];
  project.source_manifest.preserved_imports = ["src/import/original.json", "src/import/preserved.json"];
  project.materials = [{ id: "input", path: "src/import/original.json", kind: "character_card_json", read_only: true }];
  const report = validateProjectModel(project, state, path.resolve("."));
  assert.equal(report.issues.some((entry) => entry.rule === "legacy.user_character_template"), false);
  assert.equal(report.issues.some((entry) => entry.rule === "user_character.required"), false);
});

test("legacy editing operations start in materials instead of silently entering positioning or integration", () => {
  const project = makeProject({ name: "旧卡入口阶段", nsfw: false, operation: "edit" });
  const state = makeState(project);
  assert.equal(project.workflow.current_stage, "materials");
  assert.equal(state.active_stage, "materials");
  assert.equal(state.stages.materials.status, "in_progress");
  assert.equal(state.stages.positioning.status, "not_started");
});

test("completed projects cannot be relabeled complete with unresolved stage or source contracts", () => {
  const project = makeProject({ name: "账本生命周期回归", nsfw: false });
  const state = makeState(project);
  project.workflow.planned_stages = [...project.workflow.stage_order];
  state.stages.positioning.status = "complete";
  state.stages.positioning.summary = "已完成定位";
  state.stages.integration.status = "complete";
  state.stages.integration.summary = "误标记完成";
  state.active_stage = "integration";
  project.workflow.current_stage = "integration";
  project.agent.writable_stage = "integration";
  project.agent.active_skill = "st-integration-qa";
  project.agent.readable_stages = ["preflight", "positioning", "integration"];
  const report = validateProjectModel(project, state, path.resolve("."));
  assert.ok(report.issues.some((entry) => entry.rule === "lifecycle.integration"));
});

test("assembled card tracking is portable and does not export maintainer file paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rp-legacy-portable-"));
  await initializeProject(root, { nsfw: false });
  const loaded = await loadProject(root);
  const result = await loadProjectSource(loaded);
  const serialized = JSON.stringify(result.payload);
  assert.doesNotMatch(serialized, /"path"\s*:\s*"src[\\/]/i);
  assert.doesNotMatch(serialized, /source_refs|replace_file|content_file/);
  assert.equal(result.payload.data.extensions.rp_card_studio.sources.user_character[0].path, undefined);
});

test("final card validation catches leaked source references", () => {
  const payload = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "便携性回归",
      description: "入口",
      first_mes: "开始",
      alternate_greetings: [],
      extensions: { rp_card_studio: { sources: { positioning: [{ value: { source_refs: ["src/positioning.yaml"] } }] } } },
    },
  };
  const report = validatePayload(payload);
  assert.ok(report.issues.some((entry) => entry.rule === "delivery.portability"));
  payload.data.extensions.regex_scripts = [{ replaceString: '<script src="./app.js"></script>' }];
  const localAssetReport = validatePayload(payload);
  assert.ok(localAssetReport.issues.some((entry) => entry.rule === "delivery.portability"));
});

test("source manifest cannot register one maintenance file under multiple semantic owners", () => {
  const project = makeProject({ name: "源码归属回归", nsfw: false });
  const state = makeState(project);
  project.source_manifest.world = ["src/positioning.yaml"];
  const report = validateProjectModel(project, state, path.resolve("."));
  assert.ok(report.issues.some((entry) => entry.rule === "source.duplicate"));
});

test("locked integration cannot leave registered world content uncovered by CharacterBook", async () => {
  const positioning = {
    id: "project_positioning",
    status: "locked",
    project_title: "覆盖回归",
    card_mode: "ensemble_package",
    premise: "一个完整入口",
    core_experiences: ["探索"],
    tone: ["沉浸"],
    play_rhythm: "持续推进",
    autonomous_world: "世界自行运转",
  };
  const world = {
    id: "world_core",
    display_name: "覆盖回归世界",
    premise: { summary: "一个完整世界", scale: "large", time_scope: "当代", space_scope: "城市", public_reality: "公开" },
    fundamental_rules: ["因果"],
    society: { norms: ["秩序"], institutions: ["机构"], factions: [] },
    geography: { locations: [{ id: "center", name: "中心", traits: ["繁忙"] }] },
    history: { events: [] },
    knowledge: { publicly_known: ["常识"], gm_only: [], model_only: [] },
    continuity: { invariants: ["连续"], open_questions: [] },
    hooks: ["入口"],
  };
  const sources = {
    positioning: [{ relativePath: "src/positioning.yaml", value: positioning }],
    world: [{ relativePath: "src/world/world.yaml", value: world }],
    characters: [], user_character: [], systems: [], scenes: [], prompts: [], ui: [], mvu: [],
    assembly: [{ value: {
      schema_version: "1.0.0",
      status: "locked",
      worldbook_manifest: { display_name: "覆盖回归世界书", preserve_imported_entries: true, duplicate_policy: "error", entries: [] },
      media_manifest: { enabled: false, assets: [] },
      runtime_manifest: { mode: "authored", regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} },
    } }],
  };
  const report = await validateRuntimeSources({ project: { features: {}, deliverables: ["character_card_json"] }, sources, projectRoot: process.cwd() });
  assert.ok(report.issues.some((entry) => entry.rule === "assembly.coverage"));
});

test("stage completion and feature flags cannot drift apart", () => {
  const project = makeProject({ name: "功能旗标回归", nsfw: false });
  const state = makeState(project);
  state.stages.status_ui.status = "complete";
  state.stages.status_ui.summary = "误标记完成";
  const report = validateProjectModel(project, state, path.resolve("."));
  assert.ok(report.issues.some((entry) => entry.rule === "lifecycle.flag"));
});

test("MVU card delivery cannot pass without an embedded Tavern Helper script", () => {
  const payload = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "MVU脚本回归",
      description: "入口",
      first_mes: "开始",
      alternate_greetings: [],
      extensions: {
        rp_card_studio: {
          sources: {
            mvu: [{ value: { mvu: { enabled: true, route: "native_schema", framework: { delivery: "card_script", loader_script_id: "missing_loader" } } } }],
          },
        },
        tavern_helper: { scripts: [] },
      },
    },
  };
  const report = validatePayload(payload);
  assert.ok(report.issues.some((entry) => entry.rule === "mvu.runtime_script"));
});
