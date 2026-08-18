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

function promptRegex(id, name, findRegex) {
  return {
    ...regex(id, name, findRegex),
    replace_string: "模型可见的开场回退",
    markdown_only: false,
    prompt_only: true,
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

function experienceEvidence({ advancements = {}, primaryPlaySurface = false } = {}) {
  return {
    baseline: {
      navigation: ["总览、状态、环境、NPC、行动与日志页签"],
      data_views: ["角色状态", "环境威胁", "势力与NPC", "行动与日志"],
      information_tools: ["物资搜索、势力筛选、NPC详情弹窗"],
      host_actions: ["确认后把行动写入 SillyTavern 输入框"],
      feedback_states: ["加载、空态、失败回退与行动确认"],
      responsive_checks: ["窄屏、触控和中文长文本"],
      theme_features: ["项目专属配色、仪表与启动演出"],
      data_binding: ["解析当前消息状态块，缺失时显示回退状态"],
    },
    level_advancements: {
      usability: advancements.usability ?? [],
      information_architecture: advancements.information_architecture ?? [],
      interaction_depth: advancements.interaction_depth ?? [],
      visual_expression: advancements.visual_expression ?? [],
      host_integration: advancements.host_integration ?? [],
      persistence_lifecycle: advancements.persistence_lifecycle ?? [],
    },
    primary_play_surface: primaryPlaySurface,
  };
}

function uiSource(surfaces, { experienceLevel = "light", dataDensity = "unknown", presentationModel = null, evidence = experienceEvidence(), status = "locked", openingRelationship = "separate" } = {}) {
  return {
    schema_version: "2.0.0",
    status,
    status_ui: {
      enabled: true,
      authoring_mode: "direct_html",
      experience_level: experienceLevel,
      data_density: dataDensity,
      ...(presentationModel ? { presentation_model: presentationModel } : {}),
      theme_direction: "测试",
      device_priority: "equal",
      surfaces,
      data_sources: [],
      host_interactions: [],
      opening_relationship: openingRelationship,
      experience_evidence: evidence,
      lifecycle_checks: [],
      runtime: "not_run",
    },
    source_refs: [],
  };
}

function projectSources({ surfaces, regexes, entries, openings = [], openingUi = null, uiOptions = {}, helperScripts = [] }) {
  return {
    assembly: [{ value: {
      worldbook_manifest: { entries },
      media_manifest: { enabled: false, assets: [] },
      runtime_manifest: { mode: "authored", regex_scripts: regexes, tavern_helper_scripts: helperScripts, extension_fields: {} },
    } }],
    ui: [{ value: uiSource(surfaces, uiOptions) }],
    prompts: openings.length || openingUi ? [{ value: { ...(openingUi ? { opening_ui: openingUi } : {}), openings } }] : [],
    mvu: [], world: [], characters: [], systems: [], scenes: [], positioning: [],
  };
}

const openingSurface = { id: "opening", name: "开局", marker: "<测试开局/>", file: "src/runtime/ui/opening.html" };
const statusSurface = { id: "status", name: "状态", marker: "<测试状态/>", file: "src/runtime/ui/status.html" };
const opening = { id: "default", is_default: true, visible_text: "<测试开局/>", prompt_visible_text: "测试开场即将开始。" };
const openingUi = {
  enabled: true,
  marker: "<测试开局/>",
  file: "README.md",
  render_route: "regex_replace",
  render_ref: null,
  render_evidence: [],
  opening_id: "default",
  experience_level: "light",
  theme_direction: "测试",
  device_priority: "equal",
  journey: "阅读介绍后确认入局",
  fallback: "使用文本开场",
  runtime: "not_run",
};
const openingRegex = regex("11111111-1111-4111-8111-111111111111", "[界面]开局", "/<测试开局\\s*\\/>/g");
const openingPromptRegex = promptRegex("11111111-1111-4111-8111-111111111112", "[提示词]开局回退", "/<测试开局\\s*\\/>/g");
const statusRegex = regex("22222222-2222-4222-8222-222222222222", "[界面]状态", "/<测试状态\\s*\\/>/g");

test("opening introduction and creation frontends belong to narrative opening, not status UI", async () => {
  const correct = projectSources({
    surfaces: [],
    regexes: [openingRegex, openingPromptRegex],
    entries: [entry("wb_core", "世界基础")],
    openings: [opening],
    openingUi,
  });
  const accepted = await validateRuntimeSources({ project: { features: { status_ui: false }, deliverables: ["rp_project_package"] }, sources: correct, projectRoot: process.cwd() });
  assert.deepEqual(accepted.issues, []);

  const misplaced = projectSources({
    surfaces: [openingSurface],
    regexes: [openingRegex, openingPromptRegex],
    entries: [entry("wb_core", "世界基础")],
    openings: [opening],
  });
  const rejected = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["rp_project_package"] }, sources: misplaced, projectRoot: process.cwd() });
  assert.ok(rejected.issues.some((candidate) => candidate.rule === "ui.stage_ownership"));
});

test("a constant model-visible CharacterBook output contract closes a recurring marker chain", async () => {
  const producedStatus = {
    ...statusSurface,
    emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] },
  };
  const sources = projectSources({
    surfaces: [producedStatus],
    regexes: [statusRegex],
    entries: [entry("wb_status_output", "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。")],
  });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["rp_project_package"] }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);
});

test("non-MVU cards can close the same chain with a dedicated XML output contract", async () => {
  const marker = "<潮痕状态><地点>...</地点></潮痕状态>";
  const surface = {
    id: "status",
    name: "潮痕状态",
    marker,
    file: "src/runtime/ui/status.html",
    emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_xml_status_output", evidence: [] },
  };
  const sources = projectSources({
    surfaces: [surface],
    regexes: [regex("33333333-3333-4333-8333-333333333333", "[界面]潮痕状态", "/<潮痕状态>[\\s\\S]*?<\\/潮痕状态>/g")],
    entries: [entry("wb_xml_status_output", [
      "每次回复末尾必须输出以下 XML 状态块，字段顺序固定，正文中不要解释：",
      marker,
    ].join("\n"))],
  });
  const validation = await validateRuntimeSources({ project: { features: { mvu: false, status_ui: true }, deliverables: ["rp_project_package"] }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);
});

test("verified framework producers remain available without forcing a worldbook contract", async () => {
  const surface = {
    ...statusSurface,
    emission: { producer: "framework", cadence: "every_assistant_message", source_ref: "StatusPlaceHolderImpl", evidence: ["目标MVU版本会在每条助手消息追加同一捕获标记"] },
  };
  const sources = projectSources({ surfaces: [surface], regexes: [statusRegex], entries: [entry("wb_core", "世界基础")] });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["rp_project_package"] }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);
});

test("light UI experience gaps are review warnings rather than numeric build gates", async () => {
  const producedStatus = {
    ...statusSurface,
    emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] },
  };
  const evidence = experienceEvidence();
  evidence.baseline.navigation = [];
  evidence.baseline.information_tools = [];
  evidence.baseline.host_actions = [];
  const sources = projectSources({
    surfaces: [producedStatus],
    regexes: [statusRegex],
    entries: [entry("wb_status_output", "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。")],
    uiOptions: { evidence },
  });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources, projectRoot: process.cwd() });
  const missing = validation.warnings.filter((candidate) => candidate.rule === "ui.experience_baseline");
  assert.equal(missing.length, 3);
  assert.ok(!validation.issues.some((candidate) => candidate.rule.startsWith("ui.experience_")));
});

test("higher UI levels use holistic review without byte, line, or dimension quotas", async () => {
  const producedStatus = {
    ...statusSurface,
    emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] },
  };
  const entries = [entry("wb_status_output", "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。")];
  const insufficient = projectSources({
    surfaces: [producedStatus], regexes: [statusRegex], entries,
    uiOptions: {
      experienceLevel: "heavy",
      evidence: experienceEvidence({ advancements: { interaction_depth: ["组合行动流程"] } }),
    },
  });
  const rejected = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources: insufficient, projectRoot: process.cwd() });
  assert.ok(!rejected.issues.some((candidate) => candidate.rule === "ui.experience_advancement"));

  const mature = projectSources({
    surfaces: [producedStatus], regexes: [statusRegex], entries,
    uiOptions: {
      experienceLevel: "heavy",
      evidence: experienceEvidence({ advancements: {
        usability: ["批量操作与快捷入口"],
        information_architecture: ["复合筛选与跨页详情"],
        interaction_depth: ["任务、物品与地图联动"],
        visual_expression: ["强主题场景演出"],
        host_integration: ["多类宿主动作与结果回填"],
      } }),
    },
  });
  const accepted = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources: mature, projectRoot: process.cwd() });
  assert.ok(!accepted.issues.some((candidate) => candidate.rule.startsWith("ui.experience_")));
  assert.ok(!JSON.stringify(mature).match(/line_count|byte_size|代码行数|文件大小/));
});

test("super-heavy UI declares the message application as the primary play surface", async () => {
  const advancements = Object.fromEntries([
    "usability", "information_architecture", "interaction_depth", "visual_expression", "host_integration", "persistence_lifecycle",
  ].map((key) => [key, [`${key} 增量`]]));
  const sources = projectSources({
    surfaces: [], regexes: [], entries: [entry("wb_core", "世界基础")],
    uiOptions: { experienceLevel: "super_heavy", evidence: experienceEvidence({ advancements }) },
  });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some((candidate) => candidate.rule === "ui.experience_primary_surface"));
});

test("draft UI reports incomplete runtime chains as warnings while locked UI blocks", async () => {
  const incomplete = { id: "draft", name: "草稿界面", marker: "", file: "missing.html" };
  const draft = projectSources({ surfaces: [incomplete], regexes: [], entries: [], uiOptions: { status: "draft" } });
  const draftValidation = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources: draft, projectRoot: process.cwd() });
  assert.ok(draftValidation.warnings.some((candidate) => candidate.rule === "ui.marker"));
  assert.ok(!draftValidation.issues.some((candidate) => candidate.rule === "ui.marker"));

  const locked = projectSources({ surfaces: [incomplete], regexes: [], entries: [], uiOptions: { status: "locked" } });
  const lockedValidation = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources: locked, projectRoot: process.cwd() });
  assert.ok(lockedValidation.issues.some((candidate) => candidate.rule === "ui.marker"));
});

test("helper-script UI route does not require a regex marker", async () => {
  const surface = { id: "helper", name: "脚本界面", marker: "", file: "", render_route: "helper_script", render_ref: "helper-ui", render_evidence: [] };
  const helperScripts = [{ type: "script", id: "helper-ui", name: "脚本界面", content: "console.log('ui')", enabled: true }];
  const sources = projectSources({ surfaces: [surface], regexes: [], entries: [], helperScripts });
  const validation = await validateRuntimeSources({ project: { features: { status_ui: true } }, sources, projectRoot: process.cwd() });
  assert.ok(!validation.issues.some((candidate) => candidate.rule === "ui.marker" || candidate.rule === "ui.marker_consumer"));
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

function openingArtifact({ misplaced = false } = {}) {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "开场前端归属测试",
      description: "入口",
      personality: "", scenario: "", first_mes: "<测试开局/>", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "",
      alternate_greetings: [], tags: [], creator: "", character_version: "1.0",
      extensions: {
        world: "开场前端世界书",
        regex_scripts: [hostRegex(openingRegex), hostRegex(openingPromptRegex)],
        rp_card_studio: { sources: {
          prompts: [{ path: "src/opening.yaml", value: { opening_ui: openingUi, openings: [opening] } }],
          ...(misplaced ? { ui: [{ path: "src/ui/status-ui.yaml", value: uiSource([openingSurface]) }] } : {}),
        } },
      },
      character_book: {
        name: "开场前端世界书", description: "", scan_depth: null, token_budget: null, recursive_scanning: false, extensions: {},
        entries: [{
          id: 1001, keys: [], secondary_keys: [], comment: "世界基础", content: "世界基础", constant: true, selective: false,
          insertion_order: 10, enabled: true, position: "before_char",
          extensions: { rp_card_studio: { generated: true, source_id: "wb_core", source_key: "assembly:wb_core", visibility: "model" } },
        }],
      },
    },
  };
}

test("assembled artifacts preserve the opening/status stage boundary", () => {
  const correct = validatePayload(openingArtifact());
  assert.ok(!correct.issues.some((candidate) => candidate.rule.startsWith("opening_ui.") || candidate.rule === "ui.stage_ownership"));

  const misplaced = validatePayload(openingArtifact({ misplaced: true }));
  assert.ok(misplaced.issues.some((candidate) => candidate.rule === "ui.stage_ownership"));
});

test("assembled Forge artifacts reject consumer-only UI markers", () => {
  const missing = validatePayload(artifact(statusSurface));
  assert.ok(missing.issues.some((candidate) => candidate.rule === "ui.marker_producer"));

  const produced = { ...statusSurface, emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] } };
  const valid = validatePayload(artifact(produced, "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。"));
  assert.ok(!valid.issues.some((candidate) => candidate.rule.startsWith("ui.marker_")));
});

test("assembled Forge artifacts preserve the declared UI experience evidence", () => {
  const produced = { ...statusSurface, emission: { producer: "model_output", cadence: "every_assistant_message", source_ref: "wb_status_output", evidence: [] } };
  const missing = artifact(produced, "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。");
  delete missing.data.extensions.rp_card_studio.sources.ui[0].value.status_ui.experience_evidence;
  const rejected = validatePayload(missing);
  assert.ok(rejected.warnings.some((candidate) => candidate.rule === "ui.experience_evidence"));
  assert.ok(!rejected.issues.some((candidate) => candidate.rule === "ui.experience_evidence"));

  const complete = validatePayload(artifact(produced, "每次回复末尾必须输出 `<测试状态/>` 标记，不得省略。"));
  assert.ok(!complete.issues.some((candidate) => candidate.rule.startsWith("ui.experience_")));
});

test("heavy UI with sparse variables stays valid when static and local presentation layers are declared", async () => {
  const sparseModel = {
    authoritative_paths: ["stat_data.time", "stat_data.location"],
    static_modules: ["五名固定角色档案", "洪武制度说明"],
    derived_views: ["当前风险摘要"],
    local_interaction_state: ["页签、搜索、折叠、筛选"],
    empty_state_policy: "没有动态记录时显示尚未建立，不填假数值",
    unknown_state_policy: "宿主不可用时显示未知并提供重试",
  };
  const validSources = projectSources({
    surfaces: [statusSurface],
    regexes: [hostRegex(statusRegex)],
    entries: [entry("status", "每次回复末尾输出 <测试状态/>。")],
    uiOptions: { experienceLevel: "heavy", dataDensity: "sparse", presentationModel: sparseModel },
  });
  const valid = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["rp_project_package"] }, sources: validSources, projectRoot: process.cwd() });
  assert.ok(!valid.issues.some((candidate) => candidate.rule === "ui.sparse_data_model"));
  assert.ok(valid.warnings.some((candidate) => candidate.rule === "ui.data_density"));

  const invalidSources = projectSources({
    surfaces: [statusSurface],
    regexes: [hostRegex(statusRegex)],
    entries: [entry("status", "每次回复末尾输出 <测试状态/>。")],
    uiOptions: { experienceLevel: "heavy", dataDensity: "sparse" },
  });
  const invalid = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["rp_project_package"] }, sources: invalidSources, projectRoot: process.cwd() });
  assert.ok(invalid.issues.some((candidate) => candidate.rule === "ui.sparse_data_model"));
});
