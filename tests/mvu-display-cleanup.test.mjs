import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validatePayload } from "../scripts/forge/formats.mjs";
import { validateNamedSchema } from "../scripts/forge/schema.mjs";
import { validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";

const COMPLETE_REGEX = {
  id: "33333333-3333-4333-8333-333333333333",
  script_name: "[变量]隐藏完整更新块",
  find_regex: "/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g",
  replace_string: "",
  placement: [2],
  disabled: false,
  markdown_only: true,
  prompt_only: false,
  run_on_edit: true,
  substitute_regex: 0,
  min_depth: null,
  max_depth: null,
};

const STREAMING_REGEX = {
  id: "44444444-4444-4444-8444-444444444444",
  script_name: "[变量]隐藏流式更新块",
  find_regex: "/<UpdateVariable>(?:(?!<\\/UpdateVariable>)[\\s\\S])*$/g",
  replace_string: "",
  placement: [2],
  disabled: false,
  markdown_only: true,
  prompt_only: false,
  run_on_edit: true,
  substitute_regex: 0,
  min_depth: null,
  max_depth: null,
};

function initVarEntry() {
  return {
    id: "mvu_initvar",
    display_name: "[initvar] 初始变量",
    source: { kind: "file", path: "src/runtime/mvu/初始变量.yaml" },
    enabled: false,
    activation: { mode: "constant", primary_keys: [], secondary_keys: [], selective: false, logic: "any", case_sensitive: false, match_whole_words: false },
    insertion: { position: "before_char", order: 10, depth: null, role: "system" },
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

function mvuSource(displayCleanup) {
  return {
    schema_version: "3.1.0",
    status: "locked",
    mvu: {
      enabled: true,
      route: "native_schema",
      state_root: "stat_data",
      framework: { delivery: "card_script", loader_script_id: "mvu-loader", loader_url: "https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js", expected_global: "Mvu", notes: [] },
      files: {
        initial_values: "src/runtime/mvu/初始变量.yaml",
        schema_script: "src/runtime/mvu/变量结构.js",
        update_rules: "src/runtime/mvu/变量更新规则.md",
        output_format: "src/runtime/mvu/变量输出.yaml",
        config_override: null,
        helper_scripts: [],
        supporting_files: [],
      },
      update_strategy: {
        mode: "same_turn",
        response_transport: "chat_message",
        operation_dialect: "lodash_commands",
        ...(displayCleanup ? { display_cleanup: displayCleanup } : {}),
        notes: [],
      },
      runtime_contract: {
        initialization: { entry_pattern: "[initvar]", enabled_worldbooks: ["character_primary", "character_additional", "global"], opening_override: "character_primary_replace", root_collision_policy: "unique_top_level_keys", notes: [] },
        persistence: { scope: "message", swipe_aware: true, readback: "current_message", notes: [] },
        cleanup: { snapshot_cleanup: "framework", replay_restore: "framework", history_missing_fallback: "读取最近有效快照，无数据时显示不可用", notes: [] },
        side_effects: { global_worldbook_settings: "framework_changes", notes: ["MagVarUpdate 调整世界书全局设置"] },
        version_matrix: { base_loader: ">=3.4.17", tool_calling: ">=4.8.4", custom_request_body: ">=4.8.13", batch_requests: ">=4.4.3" },
        remote_dependencies: { loader: "https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js", transitive_imports: ["testingcf.jsdelivr.net/npm/*/+esm"], runtime_evidence: [] },
      },      implementation_notes: [],
    },
    ejs: { enabled: false, engine: "none", templates: [], implementation_notes: [] },
    runtime_target: { sillytavern: "unverified" },
    dependencies: [],
    source_refs: [],
  };
}

function projectSources(regexScripts, displayCleanup) {
  const assembly = {
    worldbook_manifest: { entries: [initVarEntry()] },
    media_manifest: { enabled: false, assets: [] },
    runtime_manifest: {
      mode: "authored",
      regex_scripts: regexScripts,
      tavern_helper_scripts: [
        { id: "mvu-loader", name: "加载MVU", enabled: true, role: "mvu_loader", content: "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';" },
        { id: "mvu-schema", name: "变量结构", enabled: true, role: "mvu_schema", source_file: "src/runtime/mvu/变量结构.js", content_file: "src/runtime/mvu/变量结构.js" },
      ],
      extension_fields: {},
    },
  };
  return {
    assembly: [{ value: assembly }],
    mvu: [{ value: mvuSource(displayCleanup) }],
    prompts: [],
    world: [],
    characters: [],
    systems: [],
    scenes: [],
    ui: [],
    positioning: [],
  };
}

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-mvu-cleanup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/runtime/mvu"), { recursive: true });
  await writeFile(path.join(root, "src/runtime/mvu/初始变量.yaml"), "测试:\n  数值: [0, 描述]\n", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量结构.js"), "import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量输出.yaml"), "输出当前变量。\n", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量更新规则.md"), [
    "回复末尾输出：",
    "<UpdateVariable>",
    "<Analysis>逐项判断</Analysis>",
    "_.set('测试.数值', 0, 1);",
    "</UpdateVariable>",
  ].join("\n"), "utf8");
  return root;
}

test("chat-message MVU blocks require complete and streaming player-display cleanup", async (t) => {
  const root = await fixtureRoot(t);
  const missing = await validateRuntimeSources({
    project: { features: { mvu: true } },
    sources: projectSources([], null),
    projectRoot: root,
  });
  assert.ok(missing.issues.some((entry) => entry.rule === "mvu.update_block_complete_visibility"));
  assert.ok(missing.issues.some((entry) => entry.rule === "mvu.update_block_streaming_visibility"));

  const completeOnly = await validateRuntimeSources({
    project: { features: { mvu: true } },
    sources: projectSources([COMPLETE_REGEX], null),
    projectRoot: root,
  });
  assert.ok(!completeOnly.issues.some((entry) => entry.rule === "mvu.update_block_complete_visibility"));
  assert.ok(completeOnly.issues.some((entry) => entry.rule === "mvu.update_block_streaming_visibility"));

  const closed = await validateRuntimeSources({
    project: { features: { mvu: true } },
    sources: projectSources([COMPLETE_REGEX, STREAMING_REGEX], null),
    projectRoot: root,
  });
  assert.deepEqual(closed.issues, []);
});

test("prompt cleanup is a separate optional MVU channel", async (t) => {
  const root = await fixtureRoot(t);
  const source = projectSources([], null);
  source.mvu[0].value.mvu.update_strategy.prompt_cleanup = {
    mode: "card_regex",
    evidence: [],
    update_variable: { mode: "card_regex", evidence: [] },
    status_placeholder: { mode: "framework", evidence: ["MagVarUpdate filterPrompts"] },
  };
  const missing = await validateRuntimeSources({ project: { features: { mvu: true } }, sources: source, projectRoot: root });
  assert.ok(missing.issues.some((entry) => entry.rule === "mvu.update_block_complete_prompt_visibility"));

  const promptComplete = { ...COMPLETE_REGEX, id: "55555555-5555-4555-8555-555555555555", prompt_only: true, markdown_only: false };
  const promptStreaming = { ...STREAMING_REGEX, id: "66666666-6666-4666-8666-666666666666", prompt_only: true, markdown_only: false };
  const closedSource = projectSources([promptComplete, promptStreaming], null);
  closedSource.mvu[0].value.mvu.update_strategy.prompt_cleanup = source.mvu[0].value.mvu.update_strategy.prompt_cleanup;
  const closed = await validateRuntimeSources({ project: { features: { mvu: true } }, sources: closedSource, projectRoot: root });
  assert.ok(!closed.issues.some((entry) => entry.rule === "mvu.update_block_complete_prompt_visibility" || entry.rule === "mvu.update_block_streaming_prompt_visibility"));
});
test("mature external cleanup routes remain valid when their evidence is recorded", async (t) => {
  const root = await fixtureRoot(t);
  assert.ok(validateNamedSchema("mvu", mvuSource({ mode: "framework", evidence: [] })).length > 0);
  assert.deepEqual(validateNamedSchema("mvu", mvuSource({ mode: "framework", evidence: ["真实SillyTavern消息显示层验收通过"] })), []);
  const validation = await validateRuntimeSources({
    project: { features: { mvu: true } },
    sources: projectSources([], { mode: "framework", evidence: ["真实SillyTavern消息显示层验收通过"] }),
    projectRoot: root,
  });
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

function artifact(regexScripts) {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "技术验收卡",
      description: "项目入口",
      personality: "",
      scenario: "",
      first_mes: "开场",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "1.0",
      extensions: {
        world: "技术验收世界书",
        regex_scripts: regexScripts.map(hostRegex),
        rp_card_studio: { sources: { mvu: [{ path: "src/mvu.yaml", value: mvuSource(null) }] } },
      },
      character_book: {
        name: "技术验收世界书",
        description: "",
        scan_depth: null,
        token_budget: null,
        recursive_scanning: false,
        extensions: {},
        entries: [{
          id: 1001,
          keys: [],
          secondary_keys: [],
          comment: "[mvu_update]变量更新规则",
          content: "<UpdateVariable><Analysis>Y/N</Analysis>_.set('测试.数值', 0, 1);</UpdateVariable>",
          constant: true,
          selective: false,
          insertion_order: 100,
          enabled: true,
          position: "at_depth",
          depth: 1,
          role: "system",
          extensions: { rp_card_studio: { generated: true, source_key: "mvu:update" } },
        }],
      },
    },
  };
}

test("assembled Forge artifacts cannot pass while leaking MVU update blocks", () => {
  const missing = validatePayload(artifact([]));
  assert.ok(missing.issues.some((entry) => entry.rule === "mvu.update_block_complete_visibility"));
  assert.ok(missing.issues.some((entry) => entry.rule === "mvu.update_block_streaming_visibility"));

  const closed = validatePayload(artifact([COMPLETE_REGEX, STREAMING_REGEX]));
  assert.ok(!closed.issues.some((entry) => entry.rule.startsWith("mvu.update_block_")));
});
