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
const validateWorld = ajv.compile(worldSchema);
const validateCharacter = ajv.compile(characterSchema);
const worldTemplate = loadYaml("assets/templates/world.yaml");
const characterTemplate = loadYaml("assets/templates/character.yaml");

test("new world template is an RP World Bible rather than a configuration inventory", () => {
  assert.equal(validateWorld(worldTemplate), true, JSON.stringify(validateWorld.errors));
  assert.equal(worldTemplate.schema_version, "1.1.0");
  for (const key of [
    "world_identity",
    "setting_scope",
    "information_layers",
    "core_conflict",
    "world_rules",
    "factions_and_society",
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
});

test("new character template models an actor through psychology, behavior, relationships, speech, and anti-OOC", () => {
  assert.equal(validateCharacter(characterTemplate), true, JSON.stringify(validateCharacter.errors));
  assert.equal(characterTemplate.schema_version, "1.1.0");
  for (const key of ["identity", "story_role", "psychology", "behavior", "attitudes", "speech", "background", "relationships", "knowledge", "growth_arc", "anti_ooc"]) {
    assert.ok(Object.hasOwn(characterTemplate, key), key);
  }
  for (const legacyKey of ["narrative_function", "goals", "value_priority", "behavioral_rules", "stress_ladder", "ooc_guardrails", "examples"]) {
    assert.equal(Object.hasOwn(characterTemplate, legacyKey), false, legacyKey);
  }
  assert.deepEqual(Object.keys(characterTemplate.psychology), ["motivations", "fears", "values", "taboos", "internal_conflict"]);
  assert.deepEqual(Object.keys(characterTemplate.anti_ooc), ["always", "never", "meta_handling", "unknown_handling"]);
});

test("RP authoring fields survive model-facing projection", () => {
  const world = projectModelSource("world", {
    ...worldTemplate,
    id: "mist_harbor",
    display_name: "雾港",
    world_identity: { ...worldTemplate.world_identity, genre: "民俗悬疑" },
    core_conflict: { ...worldTemplate.core_conflict, current_situation: "潮雾正在吞没旧城区。" },
  });
  assert.equal(world.world_identity.genre, "民俗悬疑");
  assert.equal(world.core_conflict.current_situation, "潮雾正在吞没旧城区。");
  assert.equal(Object.hasOwn(world, "schema_version"), false);

  const character = projectModelSource("character", {
    ...characterTemplate,
    id: "night_warden",
    display_name: "守夜人",
    story_role: { function: "不可靠的引路人", connection_to_user: "受雇护送", current_stakes: "天亮前必须离港" },
    behavior: { rules: [{ trigger: "用户受威胁", action: "挡在用户前面", reason: "承诺高于安全" }], stress_response: [], quirks: [] },
    anti_ooc: { always: ["兑现承诺"], never: ["抛下同行者"], meta_handling: "先以角色回应", unknown_handling: "从价值排序外推" },
    psychology: {
      motivations: { goal: "护送用户离港", drive: "偿还旧债" },
      fears: { situation: "再次临阵退缩", loss: "最后一名信任自己的人" },
      values: { ranking: "承诺 > 安全", rationale: "会为兑现承诺承担风险" },
      taboos: ["绝不抛下同行者"],
      internal_conflict: "活下去与兑现承诺无法兼得",
    },
  });
  assert.equal(character.story_role.function, "不可靠的引路人");
  assert.equal(character.psychology.values.ranking, "承诺 > 安全");
  assert.ok(character.behavior);
  assert.ok(character.anti_ooc);
});

test("legacy 1.0 world and character source shapes remain schema-compatible", () => {
  const legacyWorld = {
    schema_version: "1.0.0", id: "legacy_world", display_name: "旧世界", status: "draft",
    premise: { summary: "", scale: "pending", time_scope: "", space_scope: "", public_reality: "" },
    fundamental_rules: [], society: { norms: [], institutions: [], factions: [] }, geography: { locations: [] },
    history: { events: [] }, knowledge: { player_visible: [], conditional: [], gm_only: [], model_only: [] },
    continuity: { invariants: [], open_questions: [] }, hooks: [], source_refs: [],
  };
  assert.equal(validateWorld(legacyWorld), true, JSON.stringify(validateWorld.errors));

  const legacyCharacter = {
    schema_version: "1.0.0", id: "legacy_character", display_name: "旧角色", status: "draft", role: "pending",
    identity: { aliases: [], age: null, species: "", occupation: "", appearance: [] },
    narrative_function: { purpose: "", pressure_on_player: "" }, goals: { immediate: [], long_term: [], hidden: [] },
    psychology: { needs: [], fears: [], weaknesses: [], biases: [], self_deceptions: [] }, value_priority: [],
    internal_conflicts: [], boundaries: [], behavioral_rules: [], stress_ladder: [], ooc_guardrails: [],
    speech: { register: "", rhythm: "", habits: [], avoid: [] }, relationships: [],
    knowledge: { player_visible: [], gm_only: [], model_only: [], mistaken: [], forbidden: [] },
    state_bindings: [], examples: [], tags: [], source_refs: [],
  };
  assert.equal(validateCharacter(legacyCharacter), true, JSON.stringify(validateCharacter.errors));
});
