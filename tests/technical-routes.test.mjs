import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyAssemblyManifest, validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";
import { validateNamedSchema } from "../scripts/forge/schema.mjs";

function payload() {
  return { spec: "chara_card_v2", spec_version: "2.0", data: { name: "技术路线测试", description: "入口", personality: "", scenario: "", first_mes: "开场", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: [], creator: "", character_version: "1.0", extensions: {} } };
}

function assembly(helperTrees = [], entries = []) {
  return {
    worldbook_manifest: { entries },
    media_manifest: { enabled: false, assets: [] },
    runtime_manifest: { mode: "authored", regex_scripts: [], tavern_helper_scripts: helperTrees, extension_fields: {} },
  };
}

function initVarEntry(file = "src/runtime/mvu/初始变量.yaml") {
  return {
    id: "mvu_initvar",
    display_name: "[initvar] 初始变量",
    source: { kind: "file", path: file },
    enabled: false,
    activation: {
      mode: "constant",
      primary_keys: [],
      secondary_keys: [],
      selective: false,
      logic: "any",
      case_sensitive: false,
      match_whole_words: false,
    },
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

function sourceSet(assemblySource, mvuSource = null) {
  return {
    assembly: [{ value: assemblySource }],
    mvu: mvuSource ? [{ value: mvuSource }] : [],
    prompts: [], world: [], characters: [], systems: [], scenes: [], ui: [], positioning: [],
  };
}

function nativeMvu(overrides = {}) {
  return {
    schema_version: "3.0.0",
    status: "locked",
    mvu: {
      enabled: true,
      route: "native_schema",
      state_root: "stat_data",
      framework: {
        delivery: "card_script",
        loader_script_id: "mvu-loader",
        loader_url: "https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js",
        expected_global: "Mvu",
        notes: [],
      },
      files: {
        initial_values: "src/runtime/mvu/初始变量.yaml",
        schema_script: null,
        update_rules: "src/runtime/mvu/变量更新规则.yaml",
        output_format: "src/runtime/mvu/变量输出格式.yaml",
        config_override: null,
        helper_scripts: [],
        supporting_files: [],
      },
      update_strategy: {
        mode: "same_turn",
        response_transport: "chat_message",
        operation_dialect: "lodash_commands",
        notes: [],
      },
      implementation_notes: [],
      ...overrides,
    },
    ejs: { enabled: false, engine: "none", templates: [], implementation_notes: [] },
    runtime_target: {},
    dependencies: [],
    source_refs: [],
  };
}

test("locked character integration rejects an empty CharacterBook manifest", async () => {
  const lockedAssembly = { ...assembly(), status: "locked" };
  const sources = sourceSet(lockedAssembly);
  sources.world = [{
    relativePath: "src/world/世界设定.yaml",
    value: { id: "test_world", display_name: "测试世界", premise: { summary: "存在且需要装配的世界。" } },
  }];

  const validation = await validateRuntimeSources({
    project: { features: {}, target: "character_card" },
    sources,
    projectRoot: process.cwd(),
  });

  assert.ok(validation.issues.some((entry) => entry.rule === "assembly.worldbook_empty"));
});

test("Tavern Helper ScriptFolder is preserved as a real script tree", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-helper-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/runtime"), { recursive: true });
  await writeFile(path.join(root, "src/runtime/loader.js"), "console.info('loader');", "utf8");
  await writeFile(path.join(root, "src/runtime/schema.js"), "console.info('schema');", "utf8");
  const trees = [{
    type: "folder", id: "runtime-folder", name: "雾港运行组件", enabled: true, icon: "fa-solid fa-code", color: "#475569",
    scripts: [
      { id: "mvu-loader", name: "加载 MVU 框架", enabled: true, content_file: "src/runtime/loader.js" },
      { id: "mvu-schema", name: "注册变量结构", enabled: true, content_file: "src/runtime/schema.js" },
    ],
  }];
  const sources = sourceSet(assembly(trees));
  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: root });
  assert.deepEqual(validation.issues, []);
  const result = await applyAssemblyManifest(payload(), { sources, projectRoot: root, target: "character" });
  assert.deepEqual(result.issues, []);
  const [folder] = result.payload.data.extensions.tavern_helper.scripts;
  assert.equal(folder.type, "folder");
  assert.equal(folder.name, "雾港运行组件");
  assert.deepEqual(folder.scripts.map((script) => script.type), ["script", "script"]);
  assert.equal(folder.scripts[0].content, "console.info('loader');");
  assert.deepEqual(validateNamedSchema("character-card", result.payload), [], "完整制品必须通过角色卡 Schema");
});

test("card-contained native MVU requires a real loader script and real source files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-mvu-closure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/runtime/mvu"), { recursive: true });
  await writeFile(path.join(root, "src/runtime/mvu/初始变量.yaml"), "状态:\n  天气: 雨", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量更新规则.yaml"), "规则: 按事件更新", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量输出格式.yaml"), "格式: UpdateVariable", "utf8");
  const loader = { id: "mvu-loader", name: "加载 MVU 框架", enabled: true, content: "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';" };
  const sources = sourceSet(assembly([loader], [initVarEntry()]), nativeMvu());
  const valid = await validateRuntimeSources({ project: { features: { mvu: true, ejs: false, status_ui: false } }, sources, projectRoot: root });
  assert.deepEqual(valid.issues, []);

  const missingLoader = sourceSet(assembly([], [initVarEntry()]), nativeMvu());
  const invalid = await validateRuntimeSources({ project: { features: { mvu: true, ejs: false, status_ui: false } }, sources: missingLoader, projectRoot: root });
  assert.ok(invalid.issues.some((entry) => entry.rule === "mvu.loader"));
});

test("MVU initial values must be projected into a real [initvar] CharacterBook entry", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-mvu-initvar-projection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/runtime/mvu"), { recursive: true });
  await writeFile(path.join(root, "src/runtime/mvu/初始变量.yaml"), "技术验收:\n  状态: 已初始化", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量更新规则.yaml"), "规则: 按事件更新", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/变量输出格式.yaml"), "格式: UpdateVariable", "utf8");
  const loader = { id: "mvu-loader", name: "加载 MVU 框架", enabled: true, content: "import 'bundle.js';" };
  const sources = sourceSet(assembly([loader]), nativeMvu());

  const validation = await validateRuntimeSources({
    project: { features: { mvu: true, ejs: false, status_ui: false } },
    sources,
    projectRoot: root,
  });

  assert.ok(validation.issues.some((entry) => entry.rule === "mvu.initial_values_projection"));
});

test("MVU_ZOD and EJS are independent optional layers", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-mvu-zod-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/runtime/mvu"), { recursive: true });
  await writeFile(path.join(root, "src/runtime/schema.js"), "registerMvuSchema({});", "utf8");
  await writeFile(path.join(root, "src/runtime/context.ejs"), "<%= JSON.stringify(stat_data) %>", "utf8");
  await writeFile(path.join(root, "src/runtime/mvu/初始变量.yaml"), "状态:\n  天气: 雨", "utf8");
  const source = nativeMvu({
    route: "mvu_zod",
    files: {
      initial_values: "src/runtime/mvu/初始变量.yaml",
      schema_script: "src/runtime/schema.js",
      update_rules: null,
      output_format: null,
      config_override: null,
      helper_scripts: [], supporting_files: [],
    },
  });
  source.ejs = {
    enabled: true,
    engine: "st_prompt_template",
    templates: [{ file: "src/runtime/context.ejs", host: "character_book", purpose: "向剧情模型投影当前状态", fallback: "" }],
    implementation_notes: [],
  };
  const loader = { id: "mvu-loader", name: "加载 MVU 框架", enabled: true, content: "import 'bundle.js';" };
  const validation = await validateRuntimeSources({ project: { features: { mvu: true, ejs: true, status_ui: false } }, sources: sourceSet(assembly([loader], [initVarEntry()]), source), projectRoot: root });
  assert.deepEqual(validation.issues, []);
});
