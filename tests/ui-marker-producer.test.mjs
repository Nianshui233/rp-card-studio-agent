import assert from "node:assert/strict";
import test from "node:test";

import { validatePayload } from "../scripts/forge/formats.mjs";
import { validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";

function regex(id, name, findRegex) {
  return {
    id,
    script_name: name,
    find_regex: findRegex,
    replace_string: "<div>界面</div>",
    placement: [2],
    disabled: false,
    markdown_only: true,
    prompt_only: false,
    run_on_edit: true,
    substitute_regex: 0,
    min_depth: null,
    max_depth: null,
  };
}

function entry(id, content) {
  return {
    id,
    display_name: id,
    source: { kind: "inline", content },
    enabled: true,
    activation: { mode: "constant", primary_keys: [], secondary_keys: [], selective: false, logic: "any", case_sensitive: false, match_whole_words: false },
    insertion: { position: "at_depth", order: 100, depth: 0, role: "system" },
    probability: 100,
    scan_depth: null,
    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until_recursion: false },
    recipient: "shared",
    visibility: "model",
    ignore_budget: true,
    token_budget: null,
    fallback: "block",
  };
}

function uiSource(surfaces) {
  return {
    schema_version: "2.0.0",
    status: "locked",
    status_ui: {
      enabled: true,
      authoring_mode: "direct_html",
      experience_level: "light",
      theme_direction: "测试",
      device_priority: "equal",
      surfaces,
      data_sources: [],
      host_interactions: [],
      lifecycle_checks: [],
      runtime: "not_run",
    },
    source_refs: [],
  };
}

function projectSources({ surfaces, regexes, entries, openings = [] }) {
  return {
    assembly: [{ value: {
      worldbook_manifest: { entries },
      media_manifest: { enabled: false, assets: [] },
      runtime_manifest: { mode: "authored", regex_scripts: regexes, tavern_helper_scripts: [], extension_fields: {} },
    } }],
    ui: [{ value: uiSource(surfaces) }],
    prompts: openings.length ? [{ value: { openings } }] : [],
    mvu: [], world: [], characters: [], systems: [], scenes: [], positioning: [],
  };
}

const openingSurface = { id: "opening", name: "开局", marker: "<测试开局/>", file: "src/runtime/ui/opening.html" };
const statusSurface = { id: "status", name: "状态", marker: "<测试状态/>", file: "src/runtime/ui/status.html" };
const opening = { id: "default", is_default: true, visible_text: "<测试开局/>" };
const openingRegex = regex("11111111-1111-4111-8111-111111111111", "[界面]开局", "/<测试开局\\s*\\/>/g");
const statusRegex = regex("22222222-2222-4222-8222-222222222222", "[界面]状态", "/<测试状态\\s*\\/>/g");

test("opening markers are inferred, but recurring UI markers require a real producer", async () => {
  const sources = projectSources({
    surfaces: [openingSurface, statusSurface],
    regexes: [openingRegex, statusRegex],
    entries: [entry("wb_core", "世界基础")],
    openings: [opening],
  });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["character_card_json"] }, sources, projectRoot: process.cwd() });
  assert.equal(validation.issues.filter((candidate) => candidate.rule === "ui.marker_producer").length, 1);
  assert.match(validation.issues.find((candidate) => candidate.rule === "ui.marker_producer").message, /<测试状态\/>/);
});

test("a constant model-visible CharacterBook output contract closes a recurring marker chain", async () => {
  const producedStatus = {
    ...statusSurface,
    emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] },
  };
  const sources = projectSources({
    surfaces: [openingSurface, producedStatus],
    regexes: [openingRegex, statusRegex],
    entries: [entry("wb_status_output", "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。")],
    openings: [opening],
  });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["character_card_json"] }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);
});

test("non-MVU cards can close the same chain with a dedicated XML output contract", async () => {
  const marker = "<我非我状态><地点>...</地点></我非我状态>";
  const surface = {
    id: "status",
    name: "我，非我状态",
    marker,
    file: "src/runtime/ui/status.html",
    emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_xml_status_output", evidence: [] },
  };
  const sources = projectSources({
    surfaces: [surface],
    regexes: [regex("33333333-3333-4333-8333-333333333333", "[界面]我非我状态", "/<我非我状态>[\\s\\S]*?<\\/我非我状态>/g")],
    entries: [entry("wb_xml_status_output", [
      "每次回复末尾必须输出以下 XML 状态块，字段顺序固定，正文中不要解释：",
      marker,
    ].join("\n"))],
  });
  const validation = await validateRuntimeSources({ project: { features: { mvu: false, status_ui: true }, deliverables: ["character_card_json"] }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);
});

test("verified framework producers remain available without forcing a worldbook contract", async () => {
  const surface = {
    ...statusSurface,
    emission: { producer: "framework", cadence: "every_assistant_message", source_ref: "StatusPlaceHolderImpl", evidence: ["目标MVU版本会在每条助手消息追加同一捕获标记"] },
  };
  const sources = projectSources({ surfaces: [surface], regexes: [statusRegex], entries: [entry("wb_core", "世界基础")] });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["character_card_json"] }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);
});

function hostRegex(source) {
  return {
    id: source.id,
    scriptName: source.script_name,
    findRegex: source.find_regex,
    replaceString: source.replace_string,
    trimStrings: [],
    placement: source.placement,
    disabled: source.disabled,
    markdownOnly: source.markdown_only,
    promptOnly: source.prompt_only,
    runOnEdit: source.run_on_edit,
    substituteRegex: source.substitute_regex,
    minDepth: source.min_depth,
    maxDepth: source.max_depth,
  };
}

function artifact(surface, outputContract = null) {
  const bookEntries = [{
    id: 1001,
    keys: [], secondary_keys: [], comment: "世界基础", content: "世界基础", constant: true, selective: false,
    insertion_order: 10, enabled: true, position: "before_char",
    extensions: { rp_card_studio: { generated: true, source_id: "wb_core", source_key: "assembly:wb_core", visibility: "model" } },
  }];
  if (outputContract) {
    bookEntries.push({
      id: 1002,
      keys: [], secondary_keys: [], comment: "状态栏输出契约", content: outputContract, constant: true, selective: false,
      insertion_order: 100, enabled: true, position: "at_depth", depth: 0,
      extensions: { rp_card_studio: { generated: true, source_id: "wb_status_output", source_key: "assembly:wb_status_output", visibility: "model" } },
    });
  }
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "UI生产链测试",
      description: "入口",
      personality: "", scenario: "", first_mes: "开场", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "",
      alternate_greetings: [], tags: [], creator: "", character_version: "1.0",
      extensions: {
        world: "UI生产链世界书",
        regex_scripts: [hostRegex(statusRegex)],
        rp_card_studio: { sources: { ui: [{ path: "src/ui/status-ui.yaml", value: uiSource([surface]) }] } },
      },
      character_book: { name: "UI生产链世界书", description: "", scan_depth: null, token_budget: null, recursive_scanning: false, extensions: {}, entries: bookEntries },
    },
  };
}

test("assembled Forge artifacts reject consumer-only UI markers", () => {
  const missing = validatePayload(artifact(statusSurface));
  assert.ok(missing.issues.some((candidate) => candidate.rule === "ui.marker_producer"));

  const produced = { ...statusSurface, emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] } };
  const valid = validatePayload(artifact(produced, "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。"));
  assert.ok(!valid.issues.some((candidate) => candidate.rule.startsWith("ui.marker_")));
});
