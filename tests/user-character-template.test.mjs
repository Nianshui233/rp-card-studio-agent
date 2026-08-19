import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { initializeProject, loadProject, loadProjectSource, makeProject } from "../scripts/forge/project.mjs";
import { applyAssemblyManifest, validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";
import { validateNamedSchema } from "../scripts/forge/schema.mjs";

test("canonical <user> template is adaptive and separates static profile from dynamic runtime state", async () => {
  const source = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "user-character.yaml"), "utf8"));
  assert.deepEqual(validateNamedSchema("user-character", source), []);
  assert.equal(source.schema_version, "1.2.0");
  assert.equal(source.contract.mode, "adaptive");
  assert.equal(source.contract.profile_scope, "static_profile");
  assert.equal(source.usage.runtime_state_policy, "separate");
  assert.deepEqual(Object.keys(source.profile), ["identity"]);
  assert.ok(source.contract.creation_fields.some((field) => field.scope === "static_profile" && field.target === "profile.identity.display_name"));
  assert.deepEqual(source.contract.runtime_state.dynamic_paths, []);
});

test("adaptive user contract accepts fantasy and cultivation fields without modern template leakage", async () => {
  const base = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "user-character.yaml"), "utf8"));
  const fantasy = structuredClone(base);
  fantasy.contract.creation_fields = [
    { id: "arcane_name", label: "法名", scope: "static_profile", target: "profile.身份.法名", type: "text", required: true },
    { id: "lineage", label: "血脉", scope: "static_profile", target: "profile.魔法.血脉", type: "text", required: false },
    { id: "current_mana", label: "初始魔力", scope: "initial_runtime", target: "runtime.魔力.当前值", type: "number", required: true },
  ];
  fantasy.contract.static_paths = ["profile.身份.法名", "profile.魔法.血脉"];
  fantasy.contract.runtime_state.dynamic_paths = ["runtime.魔力.当前值", "runtime.魔力.上限", "runtime.法术.冷却"];
  fantasy.profile = { 身份: { 法名: "" }, 魔法: { 血脉: "" } };
  assert.deepEqual(validateNamedSchema("user-character", fantasy), []);
  fantasy.status = "locked";
  const fantasyRuntime = await validateRuntimeSources({
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources: { positioning: [], world: [], characters: [], systems: [], scenes: [], ui: [], prompts: [], ejs: [], mvu: [], assembly: [], user_character: [{ relativePath: "src/user-character.yaml", value: fantasy }] },
    projectRoot: process.cwd(),
  });
  assert.equal(fantasyRuntime.issues.some((entry) => entry.rule.startsWith("user_character.")), false);
  assert.equal(Object.hasOwn(fantasy.profile, "age"), false);
  assert.equal(Object.hasOwn(fantasy.profile, "gender"), false);

  const cultivation = structuredClone(base);
  cultivation.contract.creation_fields = [
    { id: "dao_name", label: "道号", scope: "static_profile", target: "profile.身份.道号", type: "text", required: true },
    { id: "spirit_root", label: "灵根", scope: "static_profile", target: "profile.修行.灵根", type: "select", required: true },
    { id: "qi", label: "初始真元", scope: "initial_runtime", target: "runtime.修为.当前真元", type: "number", required: true },
  ];
  cultivation.contract.static_paths = ["profile.身份.道号", "profile.修行.灵根", "profile.修行.道途"];
  cultivation.contract.runtime_state.dynamic_paths = ["runtime.修为.当前真元", "runtime.修为.当前境界", "runtime.因果.当前劫数"];
  cultivation.profile = { 身份: { 道号: "" }, 修行: { 灵根: "", 道途: "" } };
  assert.deepEqual(validateNamedSchema("user-character", cultivation), []);
  cultivation.status = "locked";
  const cultivationRuntime = await validateRuntimeSources({
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources: { positioning: [], world: [], characters: [], systems: [], scenes: [], ui: [], prompts: [], ejs: [], mvu: [], assembly: [], user_character: [{ relativePath: "src/user-character.yaml", value: cultivation }] },
    projectRoot: process.cwd(),
  });
  assert.equal(cultivationRuntime.issues.some((entry) => entry.rule.startsWith("user_character.")), false);
});

test("canonical user profiles must stay blank during authoring", async () => {
  const source = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "user-character.yaml"), "utf8"));
  source.status = "locked";
  source.profile.identity.display_name = "林殊";
  const result = await validateRuntimeSources({
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources: { positioning: [], world: [], characters: [], systems: [], scenes: [], ui: [], prompts: [], ejs: [], mvu: [], assembly: [], user_character: [{ relativePath: "src/user-character.yaml", value: source }] },
    projectRoot: process.cwd(),
  });
  assert.ok(result.issues.some((entry) => entry.rule === "user_character.prefilled"));
});

test("opening creation fields must bind to the canonical user contract", async () => {
  const userPath = "src/user-character.yaml";
  const user = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "user-character.yaml"), "utf8"));
  user.contract.creation_fields = [
    { id: "name", label: "姓名", scope: "static_profile", target: "profile.name", type: "text", required: true },
    { id: "starting_location", label: "起始地点", scope: "initial_runtime", target: "runtime.location.current", type: "text", required: true },
  ];
  user.contract.static_paths = ["profile.name"];
  user.contract.runtime_state.dynamic_paths = ["runtime.location.current"];
  user.contract.runtime_state.read_only_mirrors = [{ from: "profile.name", to: "runtime.display.name", reason: "只用于 UI 显示" }];
  user.profile = { name: "" };
  const opening = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "opening.yaml"), "utf8"));
  opening.status = "locked";
  opening.creation_bridge = {
    enabled: true,
    content_policy: "blank_user_defined",
    profile_contract: userPath,
    profile_output: "user_entry_yaml_block",
    runtime_output: "initial_state_patch",
    input_fields: [
      { id: "name", label: "姓名", type: "text", required: true },
      { id: "starting_location", label: "起始地点", type: "text", required: true },
    ],
    bindings: [
      { input: "name", contract_path: "profile.name", targets: { user_entry: "profile.name", mvu: "stat_data.主控.显示.姓名" }, transform: "text" },
      { input: "starting_location", contract_path: "runtime.location.current", targets: { runtime: "stat_data.主控.位置.当前地点" }, transform: "text" },
    ],
    commit: {
      route: "user_message", marker: "<主控设定>", source_file: null, api_ref: null,
      worldbook_ref: null, entry_name: null, write_mode: "none", worldbook_readback: null,
      user_entry_write: "copy_only", runtime_write: "message_update",
      order: ["render_outputs", "write_user_entry", "readback_user_entry", "write_runtime", "readback_runtime", "start_opening"],
      readback: "静态 YAML 与动态状态消息均可人工核对", failure_fallback: "复制两份输出",
    },
  };
  const sources = {
    positioning: [], world: [], characters: [], systems: [], scenes: [], ui: [], mvu: [], ejs: [], assembly: [],
    user_character: [{ relativePath: userPath, value: user }],
    prompts: [{ relativePath: "src/opening.yaml", value: opening }],
  };
  const valid = await validateRuntimeSources({ project: { features: { mvu: false, ejs: false, status_ui: false } }, sources, projectRoot: process.cwd() });
  assert.equal(valid.issues.some((entry) => entry.rule === "opening.user_contract"), false);

  opening.creation_bridge.bindings[1] = { input: "starting_location", contract_path: "runtime.location.current", targets: { user_entry: "profile.entry_point.location" }, transform: "text" };
  const invalid = await validateRuntimeSources({ project: { features: { mvu: false, ejs: false, status_ui: false } }, sources, projectRoot: process.cwd() });
  assert.ok(invalid.issues.some((entry) => entry.rule === "opening.user_contract" && /不能写入静态/.test(entry.message)));
});

test("MVU user state accepts dynamic bindings and rejects a duplicated static profile", async () => {
  const userPath = "src/user-character.yaml";
  const user = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "user-character.yaml"), "utf8"));
  user.contract.creation_fields = [
    { id: "name", label: "姓名", scope: "static_profile", target: "profile.name", type: "text", required: true },
    { id: "starting_location", label: "起始地点", scope: "initial_runtime", target: "runtime.location.current", type: "text", required: true },
  ];
  user.contract.static_paths = ["profile.name", "profile.biography", "profile.personality", "profile.appearance", "profile.relationships"];
  user.contract.runtime_state.dynamic_paths = ["runtime.location.current"];
  user.contract.runtime_state.read_only_mirrors = [{ from: "profile.name", to: "runtime.display.name", reason: "只用于 UI 显示" }];
  user.profile = { name: "", biography: [], personality: {}, appearance: {}, relationships: [] };
  const mvu = YAML.parse(await readFile(join(process.cwd(), "assets", "templates", "mvu.yaml"), "utf8"));
  mvu.status = "locked";
  mvu.mvu.enabled = true;
  mvu.mvu.route = "native_schema";
  mvu.user_character_state = {
    enabled: true,
    profile_source: userPath,
    state_root: "stat_data.主控",
    dynamic_bindings: [
      { contract_path: "runtime.location.current", state_path: "stat_data.主控.位置.当前地点", reason: "当前位置会随 RP 改变" },
    ],
    read_only_mirrors: [
      { contract_path: "profile.name", state_path: "stat_data.主控.显示.姓名", reason: "只用于 UI 显示" },
    ],
    forbidden_profile_paths: ["profile.biography", "profile.personality", "profile.appearance", "profile.relationships"],
  };
  const sources = {
    positioning: [], world: [], characters: [], systems: [], scenes: [], ui: [], prompts: [], ejs: [], assembly: [],
    user_character: [{ relativePath: userPath, value: user }],
    mvu: [{ relativePath: "src/runtime/mvu.yaml", value: mvu }],
  };
  const valid = await validateRuntimeSources({ project: { features: { mvu: true, ejs: false, status_ui: false } }, sources, projectRoot: process.cwd() });
  assert.equal(valid.issues.some((entry) => entry.rule.startsWith("mvu.user_state")), false);

  mvu.user_character_state.dynamic_bindings.push({ contract_path: "profile.biography", state_path: "stat_data.主控.背景", reason: "错误复制完整背景" });
  const invalid = await validateRuntimeSources({ project: { features: { mvu: true, ejs: false, status_ui: false } }, sources, projectRoot: process.cwd() });
  assert.ok(invalid.issues.some((entry) => entry.rule === "mvu.user_state_duplication"));
});

test("new character-card projects reserve a disabled <user> source", async () => {
  const project = makeProject({ name: "潮痕用户模板测试", nsfw: false, reserveUserCharacter: true });
  assert.deepEqual(project.source_manifest.user_character, ["src/user-character.yaml"]);

  const root = await mkdtemp(join(tmpdir(), "rp-user-template-"));
  await initializeProject(root, { nsfw: false });
  const loaded = await loadProject(root);
  const source = await loadProjectSource(loaded);
  const entry = source.payload.data.character_book.entries.find((candidate) => (
    candidate.keys?.includes("<user>")
    || candidate.extensions?.rp_card_studio?.source_id === "user_character_template"
  ));
  assert.ok(entry, "CharacterBook should contain the reserved user template");
  assert.equal(entry.enabled, false);
  assert.equal(entry.constant, true);
  assert.equal(entry.position, "after_char");
  assert.match(entry.content, /用户主控设定/);
  assert.match(entry.content, /profile/);
  assert.match(await readFile(join(root, "src", "user-character.yaml"), "utf8"), /<user>/);
});

test("an explicit assembly manifest still receives the reserved disabled <user> entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "rp-user-template-assembly-"));
  await initializeProject(root, { nsfw: false });
  const project = await loadProject(root);
  const userPath = "src/user-character.yaml";
  const userValue = YAML.parse(await readFile(join(root, userPath), "utf8"));
  const sources = {
    positioning: [], world: [], characters: [], user_character: [{ relativePath: userPath, value: userValue }],
    systems: [], scenes: [], prompts: [], ui: [], mvu: [], assembly: [{ value: {
      worldbook_manifest: { display_name: "模板测试书", duplicate_policy: "error", entries: [] },
      runtime_manifest: { mode: "authored", regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} },
      media_manifest: { enabled: false, assets: [] }
    } }]
  };
  const result = await applyAssemblyManifest({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "模板测试", extensions: {}, character_book: { name: "模板测试", entries: [] } } }, { sources, projectRoot: project.projectRoot ?? root, target: "character" });
  assert.deepEqual(result.issues, []);
  const entry = result.payload.data.character_book.entries.find((candidate) => candidate.extensions?.rp_card_studio?.implicit_user_character_template);
  assert.ok(entry);
  assert.equal(entry.enabled, false);
  assert.deepEqual(entry.keys, ["<user>", "user"]);
  assert.equal(entry.constant, true);
});
