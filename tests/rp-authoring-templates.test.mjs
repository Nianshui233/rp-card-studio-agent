import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

import { projectModelSource } from "../scripts/forge/projection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const loadYaml = (relative) => parseYaml(readFileSync(path.join(root, relative), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });

const worldSchema = loadJson("assets/schemas/world.schema.json");
const characterSchema = loadJson("assets/schemas/character.schema.json");
const userCharacterSchema = loadJson("assets/schemas/user-character.schema.json");
const validateWorld = ajv.compile(worldSchema);
const validateCharacter = ajv.compile(characterSchema);
const validateUserCharacter = ajv.compile(userCharacterSchema);
const worldTemplate = loadYaml("assets/templates/world.yaml");
const characterTemplate = loadYaml("assets/templates/character.yaml");
const userCharacterTemplate = loadYaml("assets/templates/user-character.yaml");
const worldTemplateText = readFileSync(path.join(root, "assets/templates/world.yaml"), "utf8");
const characterTemplateText = readFileSync(path.join(root, "assets/templates/character.yaml"), "utf8");

test("new world template is an RP World Bible rather than a configuration inventory", () => {
  assert.equal(validateWorld(worldTemplate), true, JSON.stringify(validateWorld.errors));
  assert.equal(worldTemplate.schema_version, "1.2.0");
  for (const key of [
    "world_identity",
    "setting_scope",
    "information_layers",
    "core_conflict",
    "world_rules",
    "factions_and_society",
    "autonomous_motion",
    "improvised_characters",
    "common_knowledge",
    "timeline",
    "change_boundaries",
  ]) assert.ok(Object.hasOwn(worldTemplate, key), key);
  assert.equal(Object.hasOwn(worldTemplate, "premise"), false);
  assert.equal(Object.hasOwn(worldTemplate, "fundamental_rules"), false);
  const rule = worldTemplate.world_rules.systems[0];
  assert.deepEqual(
    Object.keys(rule),
    ["id", "name", "applies_to", "can_do", "cannot_do", "costs", "limits", "frequency", "resolution", "edge_cases", "priority"],
  );
  assert.deepEqual(
    Object.keys(worldTemplate.autonomous_motion),
    ["current_momentum", "daily_rhythms", "active_clocks", "faction_agendas", "resource_flows", "information_flows", "offscreen_event_rules", "update_cadence"],
  );
  assert.doesNotMatch(worldTemplateText, /user|player|用户|玩家/i);
});

test("new character template models an actor through psychology, behavior, relationships, speech, and anti-OOC", () => {
  assert.equal(validateCharacter(characterTemplate), true, JSON.stringify(validateCharacter.errors));
  assert.equal(characterTemplate.schema_version, "1.2.0");
  for (const key of ["identity", "story_role", "autonomy", "psychology", "behavior", "attitudes", "speech", "background", "relationships", "knowledge", "growth_arc", "anti_ooc"]) {
    assert.ok(Object.hasOwn(characterTemplate, key), key);
  }
  for (const legacyKey of ["narrative_function", "goals", "value_priority", "behavioral_rules", "stress_ladder", "ooc_guardrails", "examples"]) {
    assert.equal(Object.hasOwn(characterTemplate, legacyKey), false, legacyKey);
  }
  assert.deepEqual(Object.keys(characterTemplate.psychology), ["motivations", "fears", "values", "taboos", "internal_conflict"]);
  assert.deepEqual(Object.keys(characterTemplate.anti_ooc), ["always", "never", "meta_handling", "unknown_handling"]);
  assert.deepEqual(
    Object.keys(characterTemplate.autonomy),
    ["current_agenda", "obligations", "routines", "resources", "dependencies", "active_plans", "offscreen_actions", "priority_rules", "self_preservation", "private_life"],
  );
  assert.equal(characterTemplate.story_role.place_in_world, "");
  assert.doesNotMatch(characterTemplateText, /user|player|用户|玩家/i);
});

test("optional user-character template is isolated, disabled, and creation-UI compatible", () => {
  assert.equal(validateUserCharacter(userCharacterTemplate), true, JSON.stringify(validateUserCharacter.errors));
  assert.equal(userCharacterTemplate.worldbook.enabled_by_default, false);
  assert.equal(userCharacterTemplate.worldbook.position, "after_char");
  assert.equal(userCharacterTemplate.worldbook.depth, 4);
  assert.equal(userCharacterTemplate.worldbook.order, 9995);
  assert.deepEqual(userCharacterTemplate.worldbook.keys, ["<user>", "user"]);
  const projected = projectModelSource("user_character", {
    ...userCharacterTemplate,
    status: "locked",
    profile: { ...userCharacterTemplate.profile, name: "林默" },
  });
  assert.equal(projected.profile.name, "林默");
  assert.equal(Object.hasOwn(projected, "worldbook"), false);
  assert.equal(Object.hasOwn(projected, "schema_version"), false);
});
test("RP authoring fields survive model-facing projection", () => {
  const world = projectModelSource("world", {
    ...worldTemplate,
    id: "mist_harbor",
    display_name: "雾港",
    world_identity: { ...worldTemplate.world_identity, genre: "民俗悬疑" },
    core_conflict: { ...worldTemplate.core_conflict, current_situation: "潮雾正在吞没旧城区。" },
    autonomous_motion: { ...worldTemplate.autonomous_motion, current_momentum: "商会正在囤积药材，巡夜队准备封锁东港。" },
  });
  assert.equal(world.world_identity.genre, "民俗悬疑");
  assert.equal(world.core_conflict.current_situation, "潮雾正在吞没旧城区。");
  assert.equal(world.autonomous_motion.current_momentum, "商会正在囤积药材，巡夜队准备封锁东港。");
  assert.equal(Object.hasOwn(world, "schema_version"), false);

  const character = projectModelSource("character", {
    ...characterTemplate,
    id: "night_warden",
    display_name: "守夜人",
    story_role: { function: "不可靠的引路人", place_in_world: "受港口商会雇佣的夜间领航员", current_stakes: "天亮前必须离港" },
    autonomy: { ...characterTemplate.autonomy, current_agenda: "把违禁药材送出封锁区", obligations: ["偿还船主旧债"], offscreen_actions: ["联系走私船", "避开巡夜队"] },
    behavior: { rules: [{ trigger: "同行者受威胁", action: "挡在对方前面", reason: "承诺高于安全" }], stress_response: [], quirks: [] },
    anti_ooc: { always: ["兑现承诺"], never: ["抛下同行者"], meta_handling: "先以角色回应", unknown_handling: "从价值排序外推" },
    psychology: {
      motivations: { goal: "把药材送出封锁区", drive: "偿还旧债" },
      fears: { situation: "再次临阵退缩", loss: "最后一名信任自己的人" },
      values: { ranking: "承诺 > 安全", rationale: "会为兑现承诺承担风险" },
      taboos: ["绝不抛下同行者"],
      internal_conflict: "活下去与兑现承诺无法兼得",
    },
  });
  assert.equal(character.story_role.function, "不可靠的引路人");
  assert.equal(character.autonomy.current_agenda, "把违禁药材送出封锁区");
  assert.equal(character.psychology.values.ranking, "承诺 > 安全");
  assert.ok(character.behavior);
  assert.ok(character.anti_ooc);
});

test("world and character authoring contracts contain no in-fiction user role vocabulary", () => {
  const authoringContracts = [worldSchema, characterSchema, worldTemplate, characterTemplate]
    .map((value) => JSON.stringify(value))
    .join("\n");
  assert.doesNotMatch(authoringContracts, /user|player|用户角色|玩家角色/i);
});

test("schema 1.1 world and character sources remain compatible", () => {
  const world11 = structuredClone(worldTemplate);
  world11.schema_version = "1.1.0";
  delete world11.autonomous_motion;
  assert.equal(validateWorld(world11), true, JSON.stringify(validateWorld.errors));

  const character11 = structuredClone(characterTemplate);
  character11.schema_version = "1.1.0";
  delete character11.autonomy;
  assert.equal(validateCharacter(character11), true, JSON.stringify(validateCharacter.errors));
});

test("legacy 1.0 world and character source shapes remain schema-compatible", () => {
  const legacyWorld = {
    schema_version: "1.0.0", id: "legacy_world", display_name: "旧世界", status: "draft",
    premise: { summary: "", scale: "pending", time_scope: "", space_scope: "", public_reality: "" },
    fundamental_rules: [], society: { norms: [], institutions: [], factions: [] }, geography: { locations: [] },
    history: { events: [] }, knowledge: { publicly_known: [], conditional: [], gm_only: [], model_only: [] },
    continuity: { invariants: [], open_questions: [] }, hooks: [], source_refs: [],
  };
  assert.equal(validateWorld(legacyWorld), true, JSON.stringify(validateWorld.errors));

  const legacyCharacter = {
    schema_version: "1.0.0", id: "legacy_character", display_name: "旧角色", status: "draft", role: "pending",
    identity: { aliases: [], age: null, species: "", occupation: "", appearance: [] },
    narrative_function: { purpose: "", narrative_pressure: "" }, goals: { immediate: [], long_term: [], hidden: [] },
    psychology: { needs: [], fears: [], weaknesses: [], biases: [], self_deceptions: [] }, value_priority: [],
    internal_conflicts: [], boundaries: [], behavioral_rules: [], stress_ladder: [], ooc_guardrails: [],
    speech: { register: "", rhythm: "", habits: [], avoid: [] }, relationships: [],
    knowledge: { publicly_known: [], gm_only: [], model_only: [], mistaken: [], forbidden: [] },
    state_bindings: [], examples: [], tags: [], source_refs: [],
  };
  assert.equal(validateCharacter(legacyCharacter), true, JSON.stringify(validateCharacter.errors));
});
