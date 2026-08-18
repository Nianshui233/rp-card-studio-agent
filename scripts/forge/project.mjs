import {
  applyAssemblyManifest,
  createCharacterBookIdAllocator,
  selectOpeningMessages,
} from '../rp-card-runtime.mjs';

import {
  AGENT_ARCHITECTURE,
  CAPABILITY_ID_SET,
  agentLedgerForStage,
  primarySkillForStage,
  readableStagesForState,
} from './agent-routing.mjs';

import { inputError, integrityError, validationError } from './errors.mjs';
import {
  commitNewDirectory,
  commitWrites,
  pathExists,
  resolveWithin,
  withProjectLock,
} from './fs-transaction.mjs';
import { detectJsonFormat, Format, hasWorldbookEntries, isCharacterFormat, issue, validatePayload } from './formats.mjs';
import {
  isPlainObject,
  prettyJson,
  readJson,
  semanticEqual,
  sha256,
  stableJson,
} from './json.mjs';
import { SOURCE_SCHEMA_BY_GROUP, schemaNameForSource, validateNamedSchema } from './schema.mjs';
import { readYaml, stringifyYaml } from './yaml.mjs';
import { projectModelSource } from './projection.mjs';

import path from "node:path";
import { readFile } from "node:fs/promises";

export var PROJECT_FILE = "project.yaml";
export var STATE_FILE = ".rp-card-state.json";
export var PROJECT_SCHEMA_VERSION = "1.0.0";
export var STATE_SCHEMA_VERSION = "1.0.0";
export var STAGES = Object.freeze([
  "preflight",
  "positioning",
  "materials",
  "worldbuilding",
  "character",
  "systems",
  "scenes",
  "mvu_ejs",
  "narrative_opening",
  "status_ui",
  "integration"
]);
var WORKFLOW_STAGES = Object.freeze(STAGES.slice(1));
var OPTIONAL_STAGES = Object.freeze(["materials", "systems", "scenes", "mvu_ejs", "status_ui"]);
var REQUIRED_WORKFLOW_STAGES = Object.freeze(["positioning", "worldbuilding", "character", "narrative_opening", "integration"]);
var DEFAULT_STAGE_ROUTE = Object.freeze([...WORKFLOW_STAGES]);
var SINGLE_CHARACTER_CARD_MODES = /* @__PURE__ */ new Set(["single_character_card"]);
var ANCHOR_CHARACTER_CARD_MODES = /* @__PURE__ */ new Set([
  "world_scenario_with_anchor_character",
  "gameplay_with_anchor_character",
]);
var PROJECT_TITLE_DECISION_IDS = /* @__PURE__ */ new Set([
  "positioning.project_title",
  "positioning.card_title",
]);
var ADVANCED_DEFINITION_CLEAR_POLICIES = /* @__PURE__ */ new Set([
  "migrate_to_characterbook",
  "clear_after_migration",
]);
var PLACEHOLDER_PROJECT_TITLES = /* @__PURE__ */ new Set([
  "未命名项目",
  "未命名 RP 项目",
]);
export var STAGE_STATUSES = Object.freeze([
  "not_started",
  "in_progress",
  "awaiting_user",
  "complete",
  "skipped",
  "blocked"
]);
var PROJECT_ROOT_KEYS = /* @__PURE__ */ new Set([
  "schema_version",
  "project",
  "preflight",
  "workflow",
  "agent",
  "capabilities",
  "blueprint",
  "features",
  "deliverables",
  "materials",
  "decisions",
  "cross_stage_backlog",
  "handoffs",
  "source_manifest",
  "runtime_target",
  "release"
]);
var SOURCE_GROUPS = Object.freeze([
  "positioning",
  "world",
  "characters",
  "user_character",
  "systems",
  "scenes",
  "mvu",
  "prompts",
  "ui",
  "assembly",
  "preserved_imports"
]);
var DELIVERABLES = /* @__PURE__ */ new Set([
  "project_source",
  "character_card_json",
  "character_card_png",
  "worldbook_json",
  "validation_report"
]);
var ID_PATTERN = /^[a-z][a-z0-9_]*$/;
var DECISION_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
var COMMON_CHARACTER_DATA = Object.freeze({
  description: "",
  personality: "",
  scenario: "",
  first_mes: "",
  mes_example: "",
  creator_notes: "",
  system_prompt: "",
  post_history_instructions: "",
  alternate_greetings: [],
  tags: [],
  creator: "",
  character_version: "1.0",
  extensions: {}
});
function defaultCharacter(name, version = 2) {
  return {
    spec: `chara_card_v${version}`,
    spec_version: `${version}.0`,
    data: { name, ...COMMON_CHARACTER_DATA }
  };
}
function projectCharacterCardVersion(project) {
  const delivery = (project?.decisions ?? []).find((decision) => (
    decision.id === "integration.delivery_format"
    && decision.status === "active"
    && decision.locked === true
  ))?.value;
  return typeof delivery === "string" && /^character_card_v3(?:_|$)/.test(delivery) ? 3 : 2;
}
function defaultWorldbook(name) {
  return { name, description: "", entries: {} };
}
export function defaultPositioning(projectTitle = "未命名项目") {
  return {
    schema_version: "2.0.0",
    id: "project_positioning",
    status: "draft",
    project_title: projectTitle,
    card_entry: "",
    premise: "",
    card_mode: "pending",
    core_experiences: [],
    tone: [],
    play_rhythm: "",
    autonomous_world: "",
    scope_notes: [],
    source_refs: []
  };
}
export function worldSourceFromBook(payload) {
  const name = typeof payload?.name === "string" && payload.name.trim() ? payload.name : "未命名世界";
  return {
    schema_version: "1.0.0",
    id: machineId(name),
    display_name: name,
    status: "draft",
    premise: {
      summary: typeof payload?.description === "string" ? payload.description : "",
      scale: "pending",
      time_scope: "",
      space_scope: "",
      public_reality: ""
    },
    fundamental_rules: [],
    society: { norms: [], institutions: [], factions: [] },
    geography: { locations: [] },
    history: { events: [] },
    knowledge: { publicly_known: [], gm_only: [], model_only: [] },
    continuity: { invariants: [], open_questions: [] },
    hooks: [],
    source_refs: [],
    extensions: { worldbook: structuredClone(payload) }
  };
}
function machineId(name) {
  const ascii = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return ascii || `project_${sha256(name).slice(0, 10)}`;
}
function emptySourceManifest() {
  return Object.fromEntries(SOURCE_GROUPS.map((key) => [key, []]));
}
export function normalizeStagePlan(route) {
  if (!Array.isArray(route)) throw inputError("阶段路线必须是按规范顺序排列的数组");
  const selected = [...route];
  if (selected.some((stage) => !WORKFLOW_STAGES.includes(stage))) {
    throw inputError("阶段路线包含未知阶段", { supported: WORKFLOW_STAGES });
  }
  if (new Set(selected).size !== selected.length) throw inputError("阶段路线不能包含重复阶段");
  const canonical = WORKFLOW_STAGES.filter((stage) => selected.includes(stage));
  if (!semanticEqual(selected, canonical)) throw inputError("阶段路线必须保持规范顺序，不能重排阶段");
  const missing = REQUIRED_WORKFLOW_STAGES.filter((stage) => !selected.includes(stage));
  if (missing.length > 0) throw inputError("阶段路线缺少必经阶段", { missing });
  return selected;
}
export function applyStagePlan(project, route) {
  const selected = normalizeStagePlan(route);
  project.workflow.planned_stages = [...selected];
  project.preflight.workflow_confirmed = true;
  return selected;
}
export const applyStageRoute = applyStagePlan;
function initialProjectStage(operation) {
  // `convert` is the raw unpack/intake operation; it must remain mechanically
  // compatible with generic card round-trips. The Agent switches a real old-
  // card editing or audit run to `edit`/`audit`, which starts at materials.
  return ["edit", "audit"].includes(operation) ? "materials" : "positioning";
}
function initialStages(activeStage = "positioning") {
  return Object.fromEntries(STAGES.map((stage) => [stage, {
    status: stage === "preflight" ? "complete" : stage === activeStage ? "in_progress" : "not_started",
    round: stage === "preflight" || stage === activeStage ? 1 : 0,
    summary: stage === "preflight" ? "项目预检已记录，阶段计划可随项目需要调整" : null
  }]));
}
export function makeProject({ name, target = "character_card", nsfw, operation = "create", stageRoute = DEFAULT_STAGE_ROUTE, reserveUserCharacter = undefined }) {
  if (typeof nsfw !== "boolean") throw inputError("创建项目必须明确提供 NSFW enabled 或 disabled");
  const projectId = machineId(name);
  const selectedStages = normalizeStagePlan(stageRoute);
  const activeStage = initialProjectStage(operation);
  const isWorldbook = target === "worldbook";
  const sourceManifest = emptySourceManifest();
  sourceManifest.positioning.push("src/positioning.yaml");
  if (isWorldbook) {
    sourceManifest.world.push("src/world/worldbook.yaml");
  } else if ((reserveUserCharacter ?? operation !== "convert") !== false) {
    // Character-card projects reserve a disabled <user> template. The raw
    // convert/intake operation is the one deliberate exception so generic
    // card round-trips remain lossless; the Agent adds the template before
    // entering the real edit/audit lane.
    sourceManifest.user_character.push("src/user-character.yaml");
  }
  return {
    schema_version: PROJECT_SCHEMA_VERSION,
    project: {
      id: projectId,
      display_name: name,
      locale: "zh-CN",
      workspace: ".",
      operation,
      status: "active"
    },
    preflight: {
      workspace_confirmed: true,
      nsfw: { confirmed: true, enabled: nsfw, decision_source: "user" },
      input_materials_confirmed: true,
      deliverables_confirmed: true,
      workflow_confirmed: true
    },
    workflow: {
      stage_order: [...WORKFLOW_STAGES],
      optional_stages: [...OPTIONAL_STAGES],
      planned_stages: [...selectedStages],
      current_stage: activeStage
    },
    agent: agentLedgerForStage(activeStage, initialStages(activeStage), STAGES),
    capabilities: { enabled: [], planned: [], evidence: [] },
    blueprint: {
      mode: "direct",
      total_design: null,
      first_playable: null,
      growth_tracks: [],
      parking_lot: [],
      next: null,
    },
    features: {
      materials: false,
      systems: false,
      scenes: false,
      mvu: false,
      ejs: false,
      status_ui: false
    },
    deliverables: [isWorldbook ? "worldbook_json" : "character_card_json"],
    materials: [],
    decisions: [{
      id: "preflight_nsfw",
      stage: "preflight",
      summary: `NSFW ${nsfw ? "enabled" : "disabled"}`,
      value: nsfw,
      decided_by: "user",
      locked: true,
      status: "active",
      rationale: "用户在项目预检中明确选择",
      round: 1,
      history: []
    }],
    cross_stage_backlog: [],
    handoffs: [],
    source_manifest: sourceManifest,
    runtime_target: {
      application: "SillyTavern",
      version: "unverified",
      dependencies: []
    },
    release: { version: "0.1.0", outputs: [], accepted_warnings: [] }
  };
}
export function makeState(project, { revision = 0 } = {}) {
  const activeStage = initialProjectStage(project?.project?.operation);
  const preflightDecisions = project.decisions.filter((decision) => decision.stage === "preflight" && decision.locked && decision.status === "active");
  return {
    schema_version: STATE_SCHEMA_VERSION,
    project_id: project.project.id,
    revision,
    active_stage: activeStage,
    stages: initialStages(activeStage),
    decision_locks: preflightDecisions.map((decision) => decisionLock(decision)),
    delegations: [],
    cross_stage_backlog: [],
    dirty_sources: [],
    last_build: null,
    validation: { status: "not_run", runs: [] },
    transaction: null,
    updated_at: null
  };
}
export function syncAgentLedger(project, state) {
  const stage = state.active_stage;
  project.workflow.current_stage = stage;
  project.agent = stage === "preflight"
    ? {
        architecture: AGENT_ARCHITECTURE,
        active_skill: null,
        writable_stage: "preflight",
        readable_stages: readableStagesForState(state.stages, stage, STAGES),
      }
    : agentLedgerForStage(stage, state.stages, STAGES);
  return project.agent;
}
async function projectFilesForInit(root, { type = "character", nsfw, stageRoute = DEFAULT_STAGE_ROUTE } = {}) {
  const name = path.basename(path.resolve(root));
  if (!["character", "worldbook"].includes(type)) {
    throw inputError(`init --type 仅支持 character 或 worldbook，收到: ${type}`);
  }
  const project = makeProject({
    name,
    target: type === "worldbook" ? "worldbook" : "character_card",
    nsfw,
    stageRoute,
    reserveUserCharacter: type === "character",
  });
  const state = makeState(project);
  const source = type === "worldbook" ? worldSourceFromBook(defaultWorldbook(name)) : null;
  const userCharacter = type === "character"
    ? await readYaml(await templateAssetUrl("user-character.yaml"))
    : null;
  const nsfwSources = await applyNsfwTemplates(project, source);
  const sourcePath = type === "worldbook" ? projectSourcePath(project) : null;
  const positioning = defaultPositioning(name);
  return {
    project,
    state,
    files: [
      { relativePath: PROJECT_FILE, content: stringifyYaml(project) },
      { relativePath: STATE_FILE, content: prettyJson(state) },
      { relativePath: "src/positioning.yaml", content: stringifyYaml(positioning) },
      ...userCharacter ? [{ relativePath: "src/user-character.yaml", content: stringifyYaml(userCharacter) }] : [],
      ...sourcePath ? [{ relativePath: sourcePath, content: stringifyYaml(source) }] : [],
      ...nsfwSources.uiSource ? [{ relativePath: "src/ui/status-ui.yaml", content: stringifyYaml(nsfwSources.uiSource) }] : []
    ],
    source,
    userCharacter,
    positioning,
    uiSource: nsfwSources.uiSource
  };
}
export async function initializeProject(root, options = {}) {
  const prepared = await projectFilesForInit(root, options);
  const model = validateProjectModel(prepared.project, prepared.state, path.resolve(root));
  model.issues.push(...validateNamedSchema("positioning", prepared.positioning, "/src/positioning.yaml"));
  if (prepared.source) {
    model.issues.push(...validateNamedSchema("world", prepared.source, `/${projectSourcePath(prepared.project)}`));
  }
  if (prepared.userCharacter) model.issues.push(...validateNamedSchema("user-character", prepared.userCharacter, "/src/user-character.yaml"));
  if (prepared.uiSource) model.issues.push(...validateNamedSchema("status-ui", prepared.uiSource, "/src/ui/status-ui.yaml"));
  if (model.issues.length > 0) throw validationError("初始化候选未通过内置 Schema", model);
  const result = await commitNewDirectory(root, prepared.files, options);
  return { ...prepared, ...result };
}
export async function applyNsfwTemplates(project, characterSource) {
  if (project?.preflight?.nsfw?.enabled !== true || projectTarget(project) !== "character_card") {
    return { uiSource: null };
  }
  const statusUi = await readYaml(await templateAssetUrl("status-ui.yaml"));
  const statusMixin = await readYaml(await templateAssetUrl("nsfw/status-ui.mixin.yaml"));
  if (characterSource) {
    const characterMixin = await readYaml(await templateAssetUrl("nsfw/character.mixin.yaml"));
    characterSource.nsfw = structuredClone(characterMixin.nsfw);
  }
  if (!project.workflow.planned_stages.includes("status_ui")) return { uiSource: null };
  statusUi.status_ui.mature_content_topics = structuredClone(statusMixin.mature_content_topics ?? []);
  project.source_manifest.ui.push("src/ui/status-ui.yaml");
  return { uiSource: statusUi };
}
async function templateAssetUrl(relativePath) {
  const sourceUrl = new URL(`../../assets/templates/${relativePath}`, import.meta.url);
  if (await pathExists(sourceUrl)) return sourceUrl;
  const bundleUrl = new URL(`../assets/templates/${relativePath}`, import.meta.url);
  if (await pathExists(bundleUrl)) return bundleUrl;
  throw inputError(`找不到内置模板: ${relativePath}`);
}
export async function loadProject(root, { allowLegacy = false } = {}) {
  const projectRoot = path.resolve(root);
  const projectPath = path.join(projectRoot, PROJECT_FILE);
  const statePath = path.join(projectRoot, STATE_FILE);
  const project = await readYaml(projectPath);
  const state = await readJson(statePath);
  if (!allowLegacy) {
    if (project?.schema_version !== PROJECT_SCHEMA_VERSION) {
      throw validationError(`不支持的 project.yaml schema_version: ${project?.schema_version}`, {
        supported: [PROJECT_SCHEMA_VERSION],
        hint: "运行 state <project> migrate"
      });
    }
    if (state?.schema_version !== STATE_SCHEMA_VERSION) {
      throw validationError(`不支持的状态 schema_version: ${state?.schema_version}`, {
        supported: [STATE_SCHEMA_VERSION],
        hint: "运行 state <project> migrate"
      });
    }
  }
  return { projectRoot, projectPath, statePath, project, state };
}
export function projectTarget(project) {
  return project?.deliverables?.some((item) => item === "character_card_json" || item === "character_card_png") ? "character_card" : "worldbook";
}
export function projectSourcePath(project) {
  const group = projectTarget(project) === "worldbook" ? "world" : "positioning";
  const candidates = project?.source_manifest?.[group];
  const source = Array.isArray(candidates)
    ? candidates.find((entry) => /\.ya?ml$/i.test(entry))
    : null;
  if (source) return source;
  throw inputError(`project.yaml 的 source_manifest.${group} 没有 YAML 维护源`);
}
function projectPreservedPath(project) {
  return project?.source_manifest?.preserved_imports?.find((entry) => entry.endsWith("/preserved.json")) ?? null;
}
function projectOriginalJsonPath(project) {
  return project?.source_manifest?.preserved_imports?.find((entry) => entry.endsWith("/original.json")) ?? null;
}
export function projectPngBasePath(project) {
  return project?.source_manifest?.preserved_imports?.find((entry) => /\.png$/i.test(entry)) ?? null;
}
export function projectOutputPaths(project) {
  const isWorldbook = projectTarget(project) === "worldbook";
  return {
    json: isWorldbook ? "dist/worldbook.json" : "dist/character-card.json",
    png: isWorldbook ? null : "dist/character-card.png"
  };
}
export function validateProjectModel(project, state, root) {
  const issues = [
    ...validateNamedSchema("project", project, "/project.yaml"),
    ...validateNamedSchema("state", state, `/${STATE_FILE}`)
  ];
  const warnings = [];
  if (!isPlainObject(project)) return { issues: [modelIssue("/project.yaml", "type", "project.yaml 根节点必须是对象")], warnings };
  rejectUnknownKeys(project, PROJECT_ROOT_KEYS, "", issues);
  if (project.schema_version !== PROJECT_SCHEMA_VERSION) issues.push(modelIssue("/schema_version", "const", `必须为 ${PROJECT_SCHEMA_VERSION}`));
  if (!ID_PATTERN.test(project?.project?.id ?? "")) issues.push(modelIssue("/project/id", "pattern", "项目 ID 必须是 snake_case"));
  for (const field of ["display_name", "workspace", "operation", "status"]) {
    if (typeof project?.project?.[field] !== "string" || project.project[field] === "") {
      issues.push(modelIssue(`/project/${field}`, "required", `${field} 必须是非空字符串`));
    }
  }
  if (typeof project?.project?.locale !== "string" || project.project.locale.trim() === "") issues.push(modelIssue("/project/locale", "type", "locale 必须是非空字符串"));
  if (!project?.preflight?.workspace_confirmed || !project?.preflight?.input_materials_confirmed || !project?.preflight?.deliverables_confirmed || !project?.preflight?.workflow_confirmed) {
    issues.push(modelIssue("/preflight", "confirmed", "工作区、输入材料、交付物和阶段路线必须完成预检确认"));
  }
  if (project?.preflight?.nsfw?.confirmed !== true || !["user"].includes(project?.preflight?.nsfw?.decision_source)) {
    issues.push(modelIssue("/preflight/nsfw", "confirmed", "NSFW 必须由用户明确锁定"));
  }
  if (typeof project?.preflight?.nsfw?.enabled !== "boolean") issues.push(modelIssue("/preflight/nsfw/enabled", "type", "NSFW enabled 必须是布尔值"));
  if (!semanticEqual(project?.workflow?.stage_order, WORKFLOW_STAGES)) issues.push(modelIssue("/workflow/stage_order", "const", "阶段顺序与规范不一致"));
  if (!semanticEqual(project?.workflow?.optional_stages, OPTIONAL_STAGES)) issues.push(modelIssue("/workflow/optional_stages", "const", "可选阶段清单与规范不一致"));
  try { normalizeStagePlan(project?.workflow?.planned_stages); } catch (error) { issues.push(modelIssue("/workflow/planned_stages", "route", error.message)); }
  if (!STAGES.includes(project?.workflow?.current_stage)) issues.push(modelIssue("/workflow/current_stage", "enum", "当前阶段无效"));
  if (project?.workflow?.current_stage !== state?.active_stage) issues.push(modelIssue("/workflow/current_stage", "integrity", "语义账本 current_stage 与技术状态 active_stage 不一致"));
  if (project?.agent?.architecture !== AGENT_ARCHITECTURE) issues.push(modelIssue("/agent/architecture", "const", `Agent 架构必须为 ${AGENT_ARCHITECTURE}`));
  const expectedSkill = STAGES.includes(state?.active_stage) && state.active_stage !== "preflight"
    ? primarySkillForStage(state.active_stage)
    : null;
  if (expectedSkill && project?.agent?.active_skill !== expectedSkill) issues.push(modelIssue("/agent/active_skill", "route", `当前阶段必须路由到 ${expectedSkill}`));
  if (project?.agent?.writable_stage !== state?.active_stage) issues.push(modelIssue("/agent/writable_stage", "integrity", "私有 Skill 可写阶段必须等于当前阶段"));
  const expectedReadable = readableStagesForState(state?.stages, state?.active_stage, STAGES);
  if (!semanticEqual(project?.agent?.readable_stages, expectedReadable)) issues.push(modelIssue("/agent/readable_stages", "integrity", "私有 Skill 可读阶段与实际完成状态不一致"));
  for (const feature of ["materials", "systems", "scenes", "mvu", "ejs", "status_ui"]) {
    if (typeof project?.features?.[feature] !== "boolean") issues.push(modelIssue(`/features/${feature}`, "type", "功能开关必须是布尔值"));
  }
  if (!Array.isArray(project.deliverables) || project.deliverables.length === 0) {
    issues.push(modelIssue("/deliverables", "minItems", "至少需要一个交付物"));
  } else {
    for (const item of project.deliverables) if (!DELIVERABLES.has(item)) issues.push(modelIssue("/deliverables", "enum", `未知交付物: ${item}`));
  }
  if (!isPlainObject(project.source_manifest)) issues.push(modelIssue("/source_manifest", "required", "缺少 source_manifest"));
  const isCharacterProject = projectTarget(project) === "character_card";
  const intakeOpen = ["edit", "audit"].includes(project?.project?.operation)
    && state?.active_stage === "materials"
    && ["in_progress", "awaiting_user", "blocked"].includes(state?.stages?.materials?.status);
  const requiresUserTemplate = isCharacterProject && project?.project?.operation !== "convert" && !intakeOpen;
  if (requiresUserTemplate && (!Array.isArray(project?.source_manifest?.user_character) || project.source_manifest.user_character.length === 0)) {
    issues.push(modelIssue(
      "/source_manifest/user_character",
      "user_character.required",
      "角色卡项目必须登记一个独立的空白 <user> 模板源；如需清理旧用户档案，应替换而不是删除",
    ));
  }
  const positioningEntries = project?.source_manifest?.positioning;
  if (Array.isArray(positioningEntries) && positioningEntries.length !== 1) {
    issues.push(modelIssue(
      "/source_manifest/positioning",
      "cardinality",
      "项目定位必须且只能登记一个 canonical YAML 维护源",
    ));
  }
  for (const group of SOURCE_GROUPS) {
    const groupEntries = project?.source_manifest?.[group];
    if (group === "assembly" && groupEntries === undefined) continue;
    if (group === "user_character" && groupEntries === undefined) continue;
    if (!Array.isArray(groupEntries)) issues.push(modelIssue(`/source_manifest/${group}`, "type", "源码清单必须是数组"));
    for (const entry of groupEntries ?? []) {
      if (typeof entry !== "string" || entry === "") issues.push(modelIssue(`/source_manifest/${group}`, "type", "源码路径必须是非空字符串"));
      else if (root) {
        try {
          resolveWithin(root, entry);
        } catch (error) {
          issues.push(modelIssue(`/source_manifest/${group}`, "path", error.message));
        }
      }
    }
  }
  const sourceOwners = new Map();
  for (const group of SOURCE_GROUPS) {
    for (const entry of project?.source_manifest?.[group] ?? []) {
      if (typeof entry !== "string") continue;
      const previous = sourceOwners.get(entry);
      if (previous && previous !== group) {
        issues.push(modelIssue(`/source_manifest/${group}`, "source.duplicate", `同一维护源不能同时登记在 ${previous} 和 ${group}: ${entry}`));
      } else {
        sourceOwners.set(entry, group);
      }
    }
  }
  validateDecisions(project.decisions, issues);
  validateProjectTitleDecisionLocks(project.decisions, issues);
  validateHandoffs(project.handoffs, issues);
  validateCapabilities(project.capabilities, issues);
  validateBlueprint(project.blueprint, issues);
  validateLegacyTransformationContract(project, state, issues);
  if (project?.runtime_target?.application !== "SillyTavern") issues.push(modelIssue("/runtime_target/application", "const", "运行目标必须是 SillyTavern"));
  if (!Array.isArray(project?.runtime_target?.dependencies)) issues.push(modelIssue("/runtime_target/dependencies", "type", "dependencies 必须是数组"));
  if (!Array.isArray(project?.release?.accepted_warnings)) issues.push(modelIssue("/release/accepted_warnings", "type", "accepted_warnings 必须是数组"));
  validateState(state, project, issues);
  validateStageLifecycle(project, state, issues);
  validateFeatureSourceLifecycle(project, state, issues);
  validateMvuLifecycle(project, state, issues);
  try {
    projectSourcePath(project);
  } catch (error) {
    issues.push(modelIssue("/source_manifest", "source", error.message));
  }
  return { issues, warnings };
}
function validateHandoffs(handoffs, issues) {
  if (!Array.isArray(handoffs)) {
    issues.push(modelIssue("/handoffs", "type", "handoffs 必须是数组"));
    return;
  }
  const ids = new Set();
  for (const [index, handoff] of handoffs.entries()) {
    const base = `/handoffs/${index}`;
    if (!ID_PATTERN.test(handoff?.id ?? "")) issues.push(modelIssue(`${base}/id`, "pattern", "交接 ID 必须是 snake_case"));
    else if (ids.has(handoff.id)) issues.push(modelIssue(`${base}/id`, "unique", `交接 ID 重复: ${handoff.id}`));
    ids.add(handoff?.id);
    if (!STAGES.includes(handoff?.source_stage)) issues.push(modelIssue(`${base}/source_stage`, "enum", "交接来源阶段无效"));
    if (!STAGES.includes(handoff?.target_stage)) issues.push(modelIssue(`${base}/target_stage`, "enum", "交接目标阶段无效"));
    if (!['advisory', 'blocking'].includes(handoff?.severity)) issues.push(modelIssue(`${base}/severity`, "enum", "交接严重度无效"));
    if (typeof handoff?.reason !== "string" || handoff.reason.trim() === "") issues.push(modelIssue(`${base}/reason`, "required", "交接原因不能为空"));
    if (!Array.isArray(handoff?.suggested_change) || handoff.suggested_change.length === 0) issues.push(modelIssue(`${base}/suggested_change`, "minItems", "交接至少需要一个建议改动"));
    if (!['open', 'accepted', 'resolved', 'rejected'].includes(handoff?.status)) issues.push(modelIssue(`${base}/status`, "enum", "交接状态无效"));
  }
}
function validateCapabilities(capabilities, issues) {
  if (!isPlainObject(capabilities)) {
    issues.push(modelIssue("/capabilities", "type", "capabilities 必须是对象"));
    return;
  }
  for (const field of ["enabled", "planned"]) {
    if (!Array.isArray(capabilities[field])) {
      issues.push(modelIssue(`/capabilities/${field}`, "type", `${field} 必须是数组`));
      continue;
    }
    const seen = new Set();
    for (const [index, id] of capabilities[field].entries()) {
      if (typeof id !== "string" || !CAPABILITY_ID_SET.has(id)) issues.push(modelIssue(`/capabilities/${field}/${index}`, "enum", `未知宿主能力: ${id}`));
      if (seen.has(id)) issues.push(modelIssue(`/capabilities/${field}/${index}`, "unique", `能力重复: ${id}`));
      seen.add(id);
    }
  }
  if (!Array.isArray(capabilities.evidence)) {
    issues.push(modelIssue("/capabilities/evidence", "type", "capabilities.evidence 必须是数组"));
    return;
  }
  const evidenceIds = new Set();
  for (const [index, record] of capabilities.evidence.entries()) {
    if (!CAPABILITY_ID_SET.has(record?.id)) issues.push(modelIssue(`/capabilities/evidence/${index}/id`, "enum", `未知宿主能力: ${record?.id}`));
    if (evidenceIds.has(record?.id)) issues.push(modelIssue(`/capabilities/evidence/${index}/id`, "unique", `能力证据重复: ${record?.id}`));
    evidenceIds.add(record?.id);
    if (!["not_run", "pass", "fail", "blocked"].includes(record?.status)) issues.push(modelIssue(`/capabilities/evidence/${index}/status`, "enum", "能力证据状态无效"));
    if (!["declared", "source_checked", "artifact_checked", "runtime"].includes(record?.level)) issues.push(modelIssue(`/capabilities/evidence/${index}/level`, "enum", "能力证据层级无效"));
    if (typeof record?.notes !== "string") issues.push(modelIssue(`/capabilities/evidence/${index}/notes`, "type", "能力证据说明必须是字符串"));
  }
}
function validateBlueprint(blueprint, issues) {
  if (!isPlainObject(blueprint)) {
    issues.push(modelIssue("/blueprint", "type", "blueprint 必须是对象"));
    return;
  }
  if (!["direct", "single_blueprint", "blueprint_set", "program_blueprint_set"].includes(blueprint.mode)) {
    issues.push(modelIssue("/blueprint/mode", "enum", "蓝图模式无效"));
  }
  for (const field of ["total_design", "first_playable", "next"]) {
    if (blueprint[field] !== null && typeof blueprint[field] !== "string") issues.push(modelIssue(`/blueprint/${field}`, "type", `${field} 必须是路径字符串或 null`));
  }
  for (const field of ["growth_tracks", "parking_lot"]) {
    if (!Array.isArray(blueprint[field]) || blueprint[field].some((entry) => typeof entry !== "string" || !entry.trim())) issues.push(modelIssue(`/blueprint/${field}`, "type", `${field} 必须是字符串路径数组`));
  }
  if (blueprint.mode === "direct" && ["total_design", "first_playable", "next"].some((field) => blueprint[field] !== null)) {
    issues.push(modelIssue("/blueprint", "mode", "direct 模式不能声明蓝图执行文件"));
  }
}
function validateDecisions(decisions, issues) {
  if (!Array.isArray(decisions)) {
    issues.push(modelIssue("/decisions", "type", "decisions 必须是数组"));
    return;
  }
  const ids = /* @__PURE__ */ new Set();
  for (const [index, decision] of decisions.entries()) {
    const base = `/decisions/${index}`;
    if (!DECISION_ID_PATTERN.test(decision?.id ?? "")) issues.push(modelIssue(`${base}/id`, "pattern", "决定 ID 必须是稳定点路径"));
    if (ids.has(decision?.id)) issues.push(modelIssue(`${base}/id`, "unique", `决定 ID 重复: ${decision.id}`));
    ids.add(decision?.id);
    if (!STAGES.includes(decision?.stage)) issues.push(modelIssue(`${base}/stage`, "enum", "决定阶段无效"));
    if (typeof decision?.summary !== "string" || decision.summary === "") issues.push(modelIssue(`${base}/summary`, "required", "决定摘要不能为空"));
    if (!["user", "ai_delegation", "imported"].includes(decision?.decided_by)) issues.push(modelIssue(`${base}/decided_by`, "enum", "决定来源无效"));
    if (typeof decision?.locked !== "boolean") issues.push(modelIssue(`${base}/locked`, "type", "locked 必须是布尔值"));
    if (!["active", "superseded"].includes(decision?.status)) issues.push(modelIssue(`${base}/status`, "enum", "决定状态无效"));
    if (typeof decision?.rationale !== "string" || decision.rationale === "") issues.push(modelIssue(`${base}/rationale`, "required", "决定理由不能为空"));
    if (!Array.isArray(decision?.history)) issues.push(modelIssue(`${base}/history`, "type", "决定历史必须是数组"));
  }
}
function validateProjectTitleDecisionLocks(decisions, issues) {
  const activeLocks = (decisions ?? []).filter((decision) => (
    PROJECT_TITLE_DECISION_IDS.has(decision?.id)
    && decision.status === "active"
    && decision.locked === true
  ));
  if (activeLocks.length < 2) return;
  const values = new Set(activeLocks.map((decision) => (
    typeof decision.value === "string" ? decision.value.trim() : JSON.stringify(decision.value)
  )));
  if (values.size > 1) {
    issues.push(modelIssue(
      "/decisions",
      "positioning.project_title_conflict",
      "positioning.project_title 与兼容字段 positioning.card_title 不能保留互相冲突的有效锁",
    ));
  }
}

function validateLegacyTransformationContract(project, state, issues) {
  const operation = project?.project?.operation;
  if (!['edit', 'convert', 'audit'].includes(operation)) return;

  if (["edit", "audit"].includes(operation) && !project?.workflow?.planned_stages?.includes("materials")) {
    issues.push(modelIssue(
      "/workflow/planned_stages",
      "legacy.material_stage",
      "旧卡编辑/审查车道必须把 materials 纳入阶段路线，不能用可选阶段配置绕过材料盘点",
    ));
  }

  const preserved = project?.source_manifest?.preserved_imports;
  if (!Array.isArray(preserved) || !preserved.some((entry) => /(?:^|[\\/])original\.json$/i.test(entry))) {
    issues.push(modelIssue(
      '/source_manifest/preserved_imports',
      'legacy.original_preservation',
      '旧卡改造必须先保留原始角色卡 original.json；禁止在未建立可回溯副本前直接改写旧卡',
    ));
  }
  if (!Array.isArray(preserved) || !preserved.some((entry) => /(?:^|[\\/])preserved\.json$/i.test(entry))) {
    issues.push(modelIssue(
      '/source_manifest/preserved_imports',
      'legacy.preserved_manifest',
      '旧卡改造必须登记 preserved.json，记录保留、迁移、清理和未知字段策略',
    ));
  }
  if (!Array.isArray(project?.materials) || project.materials.length === 0) {
    issues.push(modelIssue(
      '/materials',
      'legacy.material_inventory',
      '旧卡改造在进入世界观或整合前必须完成材料盘点，至少登记原卡及其附属世界书、正则、脚本和扩展',
    ));
  }

  const userSources = project?.source_manifest?.user_character;
  const intakeOpen = ["edit", "audit"].includes(operation)
    && state?.active_stage === "materials"
    && ["in_progress", "awaiting_user", "blocked"].includes(state?.stages?.materials?.status);
  if (["edit", "audit"].includes(operation) && !intakeOpen && (!Array.isArray(userSources) || userSources.length === 0)) {
    issues.push(modelIssue(
      '/source_manifest/user_character',
      'legacy.user_character_template',
      '清理旧用户档案后必须建立新的空白 <user> 模板源；不能只删除旧条目而不补位',
    ));
  }

  const stage = state?.stages?.materials;
  if (state?.stages?.integration?.status === 'complete' && stage?.status !== 'complete') {
    issues.push(modelIssue(
      '/state/stages/integration/status',
      'legacy.stage_order',
      '旧卡材料盘点未完成时不能把整合交付标记为 complete',
    ));
  }
}
function validateStageLifecycle(project, state, issues) {
  const stages = state?.stages ?? {};
  const planned = new Set(project?.workflow?.planned_stages ?? []);
  const ordered = WORKFLOW_STAGES;
  const required = new Set(REQUIRED_WORKFLOW_STAGES);

  for (const stage of ordered) {
    const record = stages[stage];
    if (!record) continue;
    if (["complete", "skipped"].includes(record.status) && (typeof record.summary !== "string" || !record.summary.trim())) {
      issues.push(modelIssue(`/state/stages/${stage}/summary`, "lifecycle.summary", `${stage} 已标记为 ${record.status}，必须保留阶段总汇或跳过理由`));
    }
    if (record.status !== "not_started" && !planned.has(stage)) {
      issues.push(modelIssue(`/workflow/planned_stages`, "lifecycle.plan", `${stage} 已经执行但没有登记在 planned_stages`));
    }
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const stage = ordered[index];
    const record = stages[stage];
    if (!record || !["complete", "skipped"].includes(record.status)) continue;
    const unresolved = ordered.slice(0, index).filter((previous) => {
      if (!planned.has(previous)) return false;
      return !["complete", "skipped"].includes(stages[previous]?.status);
    });
    if (unresolved.length > 0) {
      issues.push(modelIssue(`/state/stages/${stage}/status`, "lifecycle.order", `${stage} 不能在前置阶段完成前标记为 ${record.status}: ${unresolved.join(", ")}`));
    }
    if (required.has(stage) && record.status === "skipped") {
      issues.push(modelIssue(`/state/stages/${stage}/status`, "lifecycle.required", `${stage} 是必经阶段，不能标记为 skipped`));
    }
  }

  const active = state?.active_stage;
  if (active && active !== "preflight" && !planned.has(active)) {
    issues.push(modelIssue(`/state/active_stage`, "lifecycle.plan", `当前阶段 ${active} 不在 planned_stages 中`));
  }
  if (stages.integration?.status === "complete") {
    const unresolved = ordered.slice(0, -1).filter((stage) => planned.has(stage) && !["complete", "skipped"].includes(stages[stage]?.status));
    if (unresolved.length > 0) {
      issues.push(modelIssue(`/state/stages/integration/status`, "lifecycle.integration", `整合交付不能在这些阶段未完成时标记为 complete: ${unresolved.join(", ")}`));
    }
    const blockingHandoffs = (project?.handoffs ?? []).filter((handoff) => handoff.severity === "blocking" && ["open", "accepted"].includes(handoff.status));
    if (blockingHandoffs.length > 0) {
      issues.push(modelIssue(`/handoffs`, "lifecycle.handoff", `存在未解决的 blocking 交接，不能完成整合交付: ${blockingHandoffs.map((handoff) => handoff.id).join(", ")}`));
    }
  }
  if (project?.project?.status === "complete" && stages.integration?.status !== "complete") {
    issues.push(modelIssue(`/project/status`, "lifecycle.project", "项目 status=complete 时 integration 必须已经完成"));
  }
  if (project?.project?.status === "complete" && (!Array.isArray(project?.release?.outputs) || project.release.outputs.length === 0)) {
    issues.push(modelIssue(`/release/outputs`, "lifecycle.release", "项目 status=complete 时必须登记实际交付输出"));
  }
}

function validateFeatureSourceLifecycle(project, state, issues) {
  const sourceManifest = project?.source_manifest ?? {};
  const stages = state?.stages ?? {};
  const contracts = [
    ["materials", "materials", () => Array.isArray(project?.materials) && project.materials.length > 0],
    ["systems", "systems", () => Array.isArray(sourceManifest.systems) && sourceManifest.systems.length > 0],
    ["scenes", "scenes", () => Array.isArray(sourceManifest.scenes) && sourceManifest.scenes.length > 0],
    ["status_ui", "ui", () => Array.isArray(sourceManifest.ui) && sourceManifest.ui.length > 0],
  ];
  for (const [feature, group, hasSource] of contracts) {
    const enabled = project?.features?.[feature] === true;
    const status = stages[feature]?.status;
    if (status === "complete" && !enabled) {
      issues.push(modelIssue(`/features/${feature}`, "lifecycle.flag", `${feature} 阶段已完成但功能开关仍为 false`));
    }
    if (status === "skipped" && enabled) {
      issues.push(modelIssue(`/features/${feature}`, "lifecycle.flag", `${feature} 阶段已跳过但功能开关仍为 true`));
    }
    if (enabled && status === "complete" && !hasSource()) {
      issues.push(modelIssue(`/source_manifest/${group}`, "lifecycle.source", `${feature} 已启用并标记完成，但没有对应维护源码`));
    }
    if (!enabled && status === "skipped" && Array.isArray(sourceManifest[group]) && sourceManifest[group].length > 0) {
      issues.push(modelIssue(`/source_manifest/${group}`, "lifecycle.source", `${feature} 已跳过但仍登记了启用源码；请迁移到 preserved_imports 或重新启用该阶段`));
    }
  }
  const runtimeStatus = stages.mvu_ejs?.status;
  const runtimeEnabled = project?.features?.mvu === true || project?.features?.ejs === true;
  if (runtimeStatus === "complete" && !runtimeEnabled) {
    issues.push(modelIssue("/features", "lifecycle.flag", "mvu_ejs 阶段已完成但 MVU/EJS 功能开关都为 false"));
  }
  if (runtimeStatus === "skipped" && runtimeEnabled) {
    issues.push(modelIssue("/features", "lifecycle.flag", "mvu_ejs 阶段已跳过但仍启用了 MVU 或 EJS"));
  }
}

function validateState(state, project, issues) {
  if (!isPlainObject(state)) {
    issues.push(modelIssue(`/${STATE_FILE}`, "type", "状态根节点必须是对象"));
    return;
  }
  if (state.schema_version !== STATE_SCHEMA_VERSION) issues.push(modelIssue("/state/schema_version", "const", `必须为 ${STATE_SCHEMA_VERSION}`));
  if (state.project_id !== project?.project?.id) issues.push(modelIssue("/state/project_id", "reference", "状态 project_id 与 project.yaml 不一致"));
  if (!Number.isInteger(state.revision) || state.revision < 0) issues.push(modelIssue("/state/revision", "type", "revision 必须是非负整数"));
  if (!STAGES.includes(state.active_stage)) issues.push(modelIssue("/state/active_stage", "enum", "active_stage 无效"));
  for (const stage of STAGES) {
    const stageState = state?.stages?.[stage];
    if (!isPlainObject(stageState)) {
      issues.push(modelIssue(`/state/stages/${stage}`, "required", "缺少阶段状态"));
      continue;
    }
    if (!STAGE_STATUSES.includes(stageState.status)) issues.push(modelIssue(`/state/stages/${stage}/status`, "enum", "阶段状态无效"));
    if (!Number.isInteger(stageState.round) || stageState.round < 0) issues.push(modelIssue(`/state/stages/${stage}/round`, "type", "阶段轮次必须是非负整数"));
    if (stageState.summary !== null && typeof stageState.summary !== "string") issues.push(modelIssue(`/state/stages/${stage}/summary`, "type", "阶段摘要必须是字符串或 null"));
  }
  if (!Array.isArray(state.decision_locks)) issues.push(modelIssue("/state/decision_locks", "type", "decision_locks 必须是数组"));
  const lockedDecisions = new Map((project.decisions ?? []).filter((decision) => decision.locked).map((decision) => [decision.id, decision]));
  const technicalLockIds = /* @__PURE__ */ new Set();
  for (const [index, lock] of (state.decision_locks ?? []).entries()) {
    if (technicalLockIds.has(lock?.decision_id)) issues.push(modelIssue(`/state/decision_locks/${index}/decision_id`, "unique", "技术决定锁重复"));
    technicalLockIds.add(lock?.decision_id);
    const decision = lockedDecisions.get(lock?.decision_id);
    if (!decision) issues.push(modelIssue(`/state/decision_locks/${index}`, "reference", "技术锁没有对应的已锁定语义决定"));
    else if (lock.value_hash !== decisionValueHash(decision)) issues.push(modelIssue(`/state/decision_locks/${index}/value_hash`, "integrity", "决定锁哈希与 project.yaml 不一致"));
    if (!["user", "ai_delegation", "imported"].includes(lock?.locked_by)) issues.push(modelIssue(`/state/decision_locks/${index}/locked_by`, "enum", "锁定来源无效"));
    else if (decision && lock.locked_by !== decision.decided_by) issues.push(modelIssue(`/state/decision_locks/${index}/locked_by`, "integrity", "技术锁来源与语义决定来源不一致"));
  }
  for (const decisionId of lockedDecisions.keys()) {
    if (!technicalLockIds.has(decisionId)) issues.push(modelIssue("/state/decision_locks", "required", `已锁定决定缺少技术锁: ${decisionId}`));
  }
  for (const key of ["delegations", "cross_stage_backlog", "dirty_sources"]) {
    if (!Array.isArray(state[key])) issues.push(modelIssue(`/state/${key}`, "type", `${key} 必须是数组`));
  }
  if (!isPlainObject(state.validation) || !Array.isArray(state.validation?.runs)) issues.push(modelIssue("/state/validation", "type", "validation 结构无效"));
  if (state.transaction !== null && !isPlainObject(state.transaction)) issues.push(modelIssue("/state/transaction", "type", "transaction 必须是对象或 null"));
}
function validateMvuLifecycle(project, state, issues) {
  const stage = state?.stages?.mvu_ejs;
  const status = stage?.status;
  const mvuEnabled = project?.features?.mvu === true;
  const ejsEnabled = project?.features?.ejs === true;
  const anyEnabled = mvuEnabled || ejsEnabled;
  const sourceCount = Array.isArray(project?.source_manifest?.mvu) ? project.source_manifest.mvu.length : 0;
  // operation describes the current work run. Existing workspaces must refresh
  // it through `state ... operation ...` before lifecycle validation.
  const isCreateRun = project?.project?.operation === "create";
  if (status === "skipped" && (typeof stage?.summary !== "string" || stage.summary.trim() === "")) {
    issues.push(modelIssue("/state/stages/mvu_ejs/summary", "required", "mvu_ejs 标记为 skipped 时必须记录跳过理由"));
  }
  if (isCreateRun && status === "skipped") {
    if (anyEnabled) issues.push(modelIssue("/features", "lifecycle", "新建项目跳过 mvu_ejs 时不能启用 MVU 或 EJS"));
    if (sourceCount > 0) issues.push(modelIssue("/source_manifest/mvu", "lifecycle", "新建项目跳过 mvu_ejs 时不能登记 MVU/EJS 源码"));
    return;
  }
  if (isCreateRun && status === "complete" && !anyEnabled) {
    issues.push(modelIssue("/state/stages/mvu_ejs/status", "lifecycle", "新建项目未启用 MVU 或 EJS 时应将 mvu_ejs 标记为 skipped"));
  }
  if (status === "in_progress") return;
  if (anyEnabled && sourceCount === 0) {
    issues.push(modelIssue("/source_manifest/mvu", "required", "启用或保留 MVU/EJS 时必须登记对应源码"));
  }
  if (!anyEnabled && sourceCount > 0) {
    issues.push(modelIssue("/source_manifest/mvu", "lifecycle", "MVU/EJS feature 均关闭时不能保留启用源码；需迁移到 preserved_imports 或完成清理"));
  }
}
function validateMvuSourceConsistency(project, source, sourcePath, issues) {
  if (source?.mvu?.enabled !== project?.features?.mvu) {
    issues.push(modelIssue(`/${sourcePath}/mvu/enabled`, "lifecycle", "project.features.mvu 与 MVU 源码开关不一致"));
  }
  if (source?.ejs?.enabled !== project?.features?.ejs) {
    issues.push(modelIssue(`/${sourcePath}/ejs/enabled`, "lifecycle", "project.features.ejs 与 EJS 源码开关不一致"));
  }
}
function rejectUnknownKeys(value, allowed, base, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(modelIssue(`${base}/${key}`, "additionalProperties", `不允许额外字段: ${key}`));
  }
}
function modelIssue(pathValue, rule, message) {
  return { path: pathValue, rule, message };
}
export async function loadProjectSource(loaded) {
  const sources = await readRegisteredSources(loaded);
  const relativeSource = projectSourcePath(loaded.project);
  const sourcePath = resolveWithin(loaded.projectRoot, relativeSource);
  const target = projectTarget(loaded.project) === "worldbook" ? "worldbook" : "character";
  const semanticSource = Object.values(sources).flat()
    .find((entry) => entry.relativePath === relativeSource)?.value;
  if (!semanticSource) throw inputError(`主维护源未登记或无法读取: ${relativeSource}`);
  const relativeOriginalJson = target === "character" ? projectOriginalJsonPath(loaded.project) : null;
  const originalJsonPath = relativeOriginalJson ? resolveWithin(loaded.projectRoot, relativeOriginalJson) : null;
  const originalPayload = originalJsonPath && await pathExists(originalJsonPath)
    ? await readJson(originalJsonPath)
    : null;
  const basePayload = target === "worldbook"
    ? assembleWorldbook(sources)
    : assembleCharacterCard(sources, loaded.project, loaded.state, originalPayload);
  const assembled = await applyAssemblyManifest(basePayload, {
    sources,
    projectRoot: loaded.projectRoot,
    target
  });
  const relativePreserved = projectPreservedPath(loaded.project);
  const preservedPath = relativePreserved ? resolveWithin(loaded.projectRoot, relativePreserved) : null;
  const preserved = preservedPath && await pathExists(preservedPath) ? await readJson(preservedPath) : null;
  const restored = applyPreserved(assembled.payload, preserved);
  const worldbookBound = bindEmbeddedCharacterBook(restored.payload, { target });
  const format = target === "worldbook" ? Format.WORLDBOOK : detectJsonFormat(worldbookBound.payload);
  if (!format) throw validationError("装配后的角色卡版本无法识别", {
    issues: [issue("/spec", "unsupported", "仅支持 Character Card V2 或 V3")]
  });
  const payloadValidation = validatePayload(worldbookBound.payload, format);
  payloadValidation.issues.push(
    ...assembled.issues,
    ...worldbookBound.issues,
  );
  payloadValidation.warnings.push(
    ...(assembled.warnings ?? []),
    ...(worldbookBound.warnings ?? []),
  );
  return {
    sourcePath,
    semanticSource,
    sources,
    consumedSources: Object.values(sources).flat().map((entry) => entry.relativePath),
    preservedPath,
    payload: worldbookBound.payload,
    restoredPaths: restored.restoredPaths,
    validation: payloadValidation,
    format
  };
}
export async function readRegisteredSources(loaded) {
  const sources = Object.fromEntries(Object.keys(SOURCE_SCHEMA_BY_GROUP).map((group) => [group, []]));
  for (const group of Object.keys(SOURCE_SCHEMA_BY_GROUP)) {
    for (const relativePath of loaded.project?.source_manifest?.[group] ?? []) {
      sources[group].push({
        relativePath,
        absolutePath: resolveWithin(loaded.projectRoot, relativePath),
        value: await readYaml(resolveWithin(loaded.projectRoot, relativePath))
      });
    }
  }
  return sources;
}
export async function validateRegisteredSources(loaded) {
  const issues = [];
  const checks = [];
  const sources = Object.fromEntries(Object.keys(SOURCE_SCHEMA_BY_GROUP).map((group) => [group, []]));
  for (const group of Object.keys(SOURCE_SCHEMA_BY_GROUP)) {
    for (const relativePath of loaded.project?.source_manifest?.[group] ?? []) {
      const absolutePath = resolveWithin(loaded.projectRoot, relativePath);
      let schema = null;
      try {
        const source = await readYaml(absolutePath);
        sources[group].push({ relativePath, absolutePath, value: source });
        schema = schemaNameForSource(group, source);
        const sourceIssues = validateNamedSchema(schema, source, `/${relativePath}`);
        issues.push(...sourceIssues);
        if (group === "mvu" && loaded.state?.stages?.mvu_ejs?.status !== "in_progress") {
          validateMvuSourceConsistency(loaded.project, source, relativePath, issues);
        }
        checks.push({ path: absolutePath, schema, valid: sourceIssues.length === 0 });
      } catch (error) {
        issues.push(modelIssue(`/${relativePath}`, "read", error.message));
        checks.push({ path: absolutePath, schema, valid: false });
      }
    }
  }
  for (const relativePath of loaded.project?.source_manifest?.preserved_imports ?? []) {
    const absolutePath = resolveWithin(loaded.projectRoot, relativePath);
    if (!await pathExists(absolutePath)) issues.push(modelIssue(`/${relativePath}`, "required", "登记的保留输入不存在"));
  }
  validateCardModelComposition(sources, issues);
  validatePositioningProjectIdentity(loaded, sources, issues);
  return { issues, checks };
}

function validatePositioningProjectIdentity(loaded, sources, issues) {
  if (loaded.state?.stages?.positioning?.status !== "complete") return;
  const positioningEntry = sources.positioning.find((entry) => entry.value?.status === "locked");
  if (!positioningEntry) {
    issues.push(modelIssue(
      "/source_manifest/positioning",
      "positioning.project_title",
      "定位阶段已完成，但没有 status=locked 的定位源码",
    ));
    return;
  }

  const projectTitle = loaded.project?.project?.display_name?.trim();
  if (!projectTitle || PLACEHOLDER_PROJECT_TITLES.has(projectTitle)) {
    issues.push(modelIssue(
      "/project/display_name",
      "positioning.project_title",
      "定位完成前必须把项目占位名替换为已锁定的中文项目标题",
    ));
  }

  const titleDecisions = (loaded.project?.decisions ?? []).filter((decision) => (
    PROJECT_TITLE_DECISION_IDS.has(decision.id)
    && decision.status === "active"
    && decision.locked === true
  ));
  const titleDecision = titleDecisions.find((decision) => decision.id === "positioning.project_title")
    ?? titleDecisions[0];
  if (!titleDecision) {
    issues.push(modelIssue(
      "/decisions",
      "positioning.project_title",
      "定位阶段已完成，但缺少已锁定的 positioning.project_title 决定",
    ));
    return;
  }
  const conflictingTitleDecisions = titleDecisions.filter((decision) => (
    typeof decision.value !== "string" || decision.value.trim() !== projectTitle
  ));
  if (conflictingTitleDecisions.length > 0) {
    issues.push(modelIssue(
      "/decisions",
      "positioning.project_title_conflict",
      `所有有效项目标题锁必须与 project.project.display_name 一致；冲突锁：${conflictingTitleDecisions.map((decision) => decision.id).join("、")}`,
    ));
  }
}

function validateCardModelComposition(sources, issues) {
  const positioning = sources.positioning.find((entry) => entry.value?.status === "locked")?.value
    ?? sources.positioning[0]?.value;
  const characters = sources.characters;
  const primaries = characters.filter((entry) => entry.value?.role === "primary_character");
  const mode = positioning?.card_mode ?? "pending";
  const singleCharacterCard = SINGLE_CHARACTER_CARD_MODES.has(mode);
  const requiresPrimary = singleCharacterCard || ANCHOR_CHARACTER_CARD_MODES.has(mode);

  if (primaries.length > 1) {
    for (const entry of primaries.slice(1)) {
      issues.push(modelIssue(`/${entry.relativePath}/role`, "composition.primary_character", "一个 RP 项目最多只能有一个 primary_character 叙事锚点"));
    }
  }
  if (requiresPrimary && primaries.length !== 1) {
    issues.push(modelIssue("/source_manifest/characters", "composition.primary_character", `card_mode=${mode} 要求恰好一个 primary_character`));
  }
  if (singleCharacterCard && characters.length !== 1) {
    issues.push(modelIssue("/source_manifest/characters", "composition.single_character", "真正的单人卡必须且只能登记一个角色源码"));
  }
}
function projectOwnsCardSurface(project, state, positioning) {
  if (project?.project?.operation === "create") return true;
  if (positioning?.status !== "locked" || state?.stages?.positioning?.status !== "complete") return false;
  const projectTitle = project?.project?.display_name?.trim();
  if (!projectTitle) return false;
  const titleDecisions = (project?.decisions ?? []).filter((decision) => (
    PROJECT_TITLE_DECISION_IDS.has(decision.id)
    && decision.status === "active"
    && decision.locked === true
  ));
  return titleDecisions.length > 0 && titleDecisions.every((decision) => (
    typeof decision.value === "string" && decision.value.trim() === projectTitle
  ));
}

function projectClearsAdvancedDefinitions(project, projectOwnsSurface) {
  if (project?.project?.operation === "create") return true;
  if (!projectOwnsSurface) return false;
  return (project?.decisions ?? []).some((decision) => (
    decision.id === "integration.advanced_definition_policy"
    && decision.status === "active"
    && decision.locked === true
    && ADVANCED_DEFINITION_CLEAR_POLICIES.has(decision.value)
  ));
}

function assembledCardEntry(sources, positioning, payload, projectOwnsSurface) {
  if (!projectOwnsSurface) return payload?.data?.description ?? "";
  const contract = sources.assembly[0]?.value?.card_entry;
  if (contract?.mode === "preserve_imported") return payload?.data?.description ?? "";
  if (
    ["core_world_contract", "compact_package_entry"].includes(contract?.mode)
    && typeof contract?.content === "string"
    && contract.content.trim()
  ) {
    return contract.content;
  }
  return typeof positioning?.card_entry === "string" ? positioning.card_entry : "";
}

function assembleCharacterCard(sources, project, state, originalPayload = null) {
  const characters = sources.characters.map((entry) => entry.value);
  const primary = characters.find((source) => source.role === "primary_character");
  const positioning = sources.positioning.find((entry) => entry.value?.status === "locked")?.value
    ?? sources.positioning[0]?.value;
  const projectTitle = project?.project?.display_name ?? "未命名 RP 项目";
  const singleCharacterCard = SINGLE_CHARACTER_CARD_MODES.has(positioning?.card_mode)
    && characters.length === 1;
  const cardName = singleCharacterCard ? primary?.display_name ?? projectTitle : projectTitle;
  const payload = isPlainObject(originalPayload)
    ? structuredClone(originalPayload)
    : defaultCharacter(cardName, projectCharacterCardVersion(project));
  const projectOwnsSurface = projectOwnsCardSurface(project, state, positioning);
  const clearAdvancedDefinitions = projectClearsAdvancedDefinitions(project, projectOwnsSurface);
  if (payload.spec !== "chara_card_v2" && payload.spec !== "chara_card_v3") payload.spec = "chara_card_v2";
  if (typeof payload.spec_version !== "string" && typeof payload.spec_version !== "number") {
    payload.spec_version = payload.spec === "chara_card_v3" ? "3.0" : "2.0";
  }
  payload.data = isPlainObject(payload.data) ? payload.data : {};
  payload.data.name = projectOwnsSurface
    ? cardName
    : payload.data.name ?? cardName;
  if (projectOwnsSurface) {
    payload.data.description = assembledCardEntry(sources, positioning, payload, projectOwnsSurface);
  }
  const advancedDefinitionFields = [
    "personality",
    "scenario",
    "mes_example",
    "creator_notes",
    "system_prompt",
    "post_history_instructions",
  ];
  if (clearAdvancedDefinitions) {
    for (const field of advancedDefinitionFields) payload.data[field] = "";
  }
  const cardFields = sources.assembly[0]?.value?.card_fields;
  if (isPlainObject(cardFields)) {
    for (const field of advancedDefinitionFields) {
      if (Object.hasOwn(cardFields, field) && typeof cardFields[field] === "string") {
        payload.data[field] = cardFields[field];
      }
    }
  }
  if (projectOwnsSurface && singleCharacterCard && Array.isArray(primary?.tags)) {
    payload.data.tags = [...primary.tags];
  } else if (!Array.isArray(payload.data.tags)) {
    payload.data.tags = [];
  }
  const openingSources = sources.prompts.map((entry) => entry.value);
  const openingMessages = selectOpeningMessages(openingSources, sources.mvu.map((entry) => entry.value));
  if (openingMessages) {
    payload.data.first_mes = openingMessages.first;
    payload.data.alternate_greetings = openingMessages.alternates;
    payload.data.extensions = isPlainObject(payload.data.extensions) ? payload.data.extensions : {};
    payload.data.extensions.rp_card_studio = isPlainObject(payload.data.extensions.rp_card_studio) ? payload.data.extensions.rp_card_studio : {};
    payload.data.extensions.rp_card_studio.opening_selection = openingMessages.selection;
  }
  for (const [key, value] of Object.entries(COMMON_CHARACTER_DATA)) {
    if (payload.data[key] === void 0) payload.data[key] = structuredClone(value);
  }
  const bookSources = [
    ...sources.positioning
      .filter((entry) => positioningIsMeaningful(entry.value))
      .map((entry) => ["positioning", entry, projectTitle]),
    ...sources.world.map((entry) => ["world", entry]),
    ...(sources.user_character ?? []).map((entry) => ["user_character", entry]),
    ...sources.characters.map((entry) => ["character", entry]),
    ...sources.systems.map((entry) => ["system", entry]),
    ...sources.scenes.map((entry) => ["scene", entry]),
    ...sources.prompts.map((entry) => ["prompt", entry]),
  ];
  if (bookSources.length > 0 && sources.assembly.length === 0) {
    payload.data.character_book ??= {
      name: `${payload.data.name} 世界书`,
      description: "由 SillyTavern制卡工坊装配的模块化设定与运行规则",
      scan_depth: null,
      token_budget: null,
      recursive_scanning: false,
      extensions: {},
      entries: []
    };
    const existingEntries = Array.isArray(payload.data.character_book.entries)
      ? payload.data.character_book.entries
      : isPlainObject(payload.data.character_book.entries)
        ? Object.values(payload.data.character_book.entries)
        : [];
    payload.data.character_book.entries = existingEntries;
    const allocator = createCharacterBookIdAllocator(existingEntries);
    const allocations = allocator.allocateMany(bookSources.map(([group, entry], index) => `character:${group}:${entry.value.id ?? `${group}_${index + 1}`}`));
    for (const [index, [group, entry, displayNameOverride]] of bookSources.entries()) {
      const sourceId = entry.value.id ?? `${group}_${index + 1}`;
      const sourceKey = `character:${group}:${sourceId}`;
      const existingIndex = existingEntries.findIndex((candidate) => candidate?.extensions?.rp_card_studio?.source_key === sourceKey);
      const generated = characterBookEntry(group, entry.value, index, allocations.get(sourceKey)?.id, {
        cardMode: positioning?.card_mode,
        displayNameOverride,
      });
      if (existingIndex >= 0 && allocations.get(sourceKey)?.reused) existingEntries[existingIndex] = generated;
      else existingEntries.push(generated);
    }
  }
  if (hasAdditionalAssemblySources(sources, "character")) {
    payload.data.extensions = mergeStructuredExtensions(payload.data.extensions, sources);
  }
  return payload;
}
function assembleWorldbook(sources) {
  const primaryEntry = sources.world[0];
  const source = primaryEntry?.value;
  const embedded = source?.extensions?.worldbook;
  const payload = isPlainObject(embedded) ? structuredClone(embedded) : defaultWorldbook(source?.display_name ?? "未命名世界");
  payload.name = source?.display_name ?? payload.name ?? "未命名世界";
  payload.description = source?.premise?.summary ?? payload.description ?? "";
  if (!Array.isArray(payload.entries) && !isPlainObject(payload.entries)) payload.entries = {};
  const hasAssemblyManifest = sources.assembly.length > 0;
  const hasImportedEntries = entryCount(payload.entries) > 0;
  let order = entryCount(payload.entries);
  const usedUids = standaloneWorldbookUids(payload.entries);
  if (!hasAssemblyManifest) {
    for (const [group, entries] of Object.entries(sources)) {
      for (const entry of entries) {
        if (group === "positioning" && !positioningIsMeaningful(entry.value)) continue;
        if (entry === primaryEntry && hasImportedEntries) continue;
        appendWorldbookEntry(payload.entries, standaloneWorldbookEntry(group, entry.value, order, allocateStandaloneWorldbookUid(usedUids)));
        order += 1;
      }
    }
  }
  if (hasAdditionalAssemblySources(sources, "worldbook")) {
    payload.extensions = mergeStructuredExtensions(payload.extensions, sources);
  }
  return payload;
}
function positioningIsMeaningful(source) {
  return Boolean(source?.card_entry)
    || Boolean(source?.premise)
    || source?.card_mode !== "pending"
    || (source?.core_experiences?.length ?? 0) > 0
    || (source?.tone?.length ?? 0) > 0
    || Boolean(source?.play_rhythm)
    || Boolean(source?.autonomous_world)
    || (source?.scope_notes?.length ?? 0) > 0;
}
function hasAdditionalAssemblySources(sources, target) {
  if (sources.positioning.some((entry) => positioningIsMeaningful(entry.value))) return true;
  if (target === "character" && sources.characters.length > 1) return true;
  if (target === "worldbook" && sources.world.length > 1) return true;
  const ignored = new Set(target === "character" ? ["positioning", "characters"] : ["positioning", "world"]);
  return Object.entries(sources).some(([group, entries]) => !ignored.has(group) && entries.length > 0);
}
function renderStructured(value) {
  return stringifyYaml(value).trimEnd();
}
const PORTABLE_SOURCE_DROP_KEYS = new Set([
  "source_refs",
  "replace_file",
  "content_file",
  "app_manifest",
  "preview_output",
  "output",
  "entry_html",
  "styles",
  "scripts",
  "fragments",
  "mock_state",
  "initial_values",
  "schema_script",
  "update_rules",
  "output_format",
  "config_override",
  "helper_scripts",
  "supporting_files",
]);
function looksLikeMaintenancePath(value) {
  return typeof value === "string" && (
    /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value)
    || /(?:^|[\\/])src[\\/]/i.test(value)
    || /\.rp-card(?:[\\/]|$)/i.test(value)
    || /(?:^|\.\.)[\\/]/.test(value)
  );
}
function portableSourceValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => portableSourceValue(item, key)).filter((item) => item !== undefined);
  if (!isPlainObject(value)) {
    if ((key === "source_ref" || key === "source") && looksLikeMaintenancePath(value)) return undefined;
    return value;
  }
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (PORTABLE_SOURCE_DROP_KEYS.has(childKey)) continue;
    if (childKey === "source_refs") continue;
    if (childKey === "file" && looksLikeMaintenancePath(childValue)) continue;
    if ((childKey === "source_ref" || childKey === "source") && looksLikeMaintenancePath(childValue)) continue;
    const next = portableSourceValue(childValue, childKey);
    if (next !== undefined) output[childKey] = next;
  }
  return output;
}
function structuredSources(sources) {
  const portableGroups = new Set(["positioning", "world", "characters", "user_character", "systems", "scenes", "mvu", "prompts", "ui"]);
  return Object.fromEntries(Object.entries(sources).filter(([group]) => portableGroups.has(group)).map(([group, entries]) => [
    group,
    entries.map((entry) => ({ value: portableSourceValue(entry.value) }))
  ]));
}
function mergeStructuredExtensions(existing, sources) {
  const extensions = isPlainObject(existing) ? structuredClone(existing) : {};
  const current = isPlainObject(extensions.rp_card_studio) ? extensions.rp_card_studio : {};
  extensions.rp_card_studio = { ...current, sources: structuredSources(sources) };
  return extensions;
}
function characterBookEntry(group, source, index, characterBookId = null, options = {}) {
  const id = source.id ?? `${group}_${index + 1}`;
  const displayName = options.displayNameOverride ?? source.display_name ?? source.openings?.[0]?.display_name ?? id;
  const config = automaticCharacterBookConfig(group, source, index, options.cardMode);
  return {
    id: characterBookId,
    keys: config.keys,
    secondary_keys: [],
    comment: `${characterBookGroupLabel(group)}：${displayName}`,
    content: renderCharacterBookSource(group, source),
    constant: config.constant,
    selective: false,
    insertion_order: config.order,
    enabled: config.enabled,
    position: config.position,
    use_regex: false,
    useProbability: true,
    probability: config.probability,
    excludeRecursion: config.recursion.preventIncoming,
    preventRecursion: config.recursion.preventOutgoing,
    delayUntilRecursion: false,
    depth: config.depth,
    role: 0,
    selectiveLogic: 0,
    caseSensitive: false,
    matchWholeWords: false,
    extensions: {
      position: config.position === "after_char" ? 1 : 0,
      useProbability: true,
      probability: config.probability,
      exclude_recursion: config.recursion.preventIncoming,
      prevent_recursion: config.recursion.preventOutgoing,
      delay_until_recursion: false,
      depth: config.depth,
      role: 0,
      selectiveLogic: 0,
      case_sensitive: false,
      match_whole_words: false,
      scan_depth: config.scanDepth,
      ignore_budget: config.ignoreBudget,
      rp_card_studio: {
        group,
        source_id: id,
        source_key: `character:${group}:${id}`,
        generated: true,
        kind: "character_book_source",
        activation: {
          mode: config.constant ? "constant" : "keywords",
          primary_keys: config.keys,
          secondary_keys: [],
          selective: false,
          logic: "any",
          case_sensitive: false,
          match_whole_words: false,
        },
        insertion: {
          position: config.position,
          order: config.order,
          depth: config.depth,
          role: "system",
        },
        probability: config.probability,
        scan_depth: config.scanDepth,
        ignore_budget: config.ignoreBudget,
        recursion: {
          prevent_incoming: config.recursion.preventIncoming,
          prevent_outgoing: config.recursion.preventOutgoing,
          delay_until_recursion: false,
        },
      }
    }
  };
}
function characterBookGroupLabel(group) {
  return ({
    world: "世界设定",
    character: "人物档案",
    characters: "人物档案",
    user_character: "用户角色模板",
    system: "系统规则",
    systems: "系统规则",
    scene: "场景资料",
    scenes: "场景资料",
    prompt: "叙事规则",
    prompts: "叙事规则",
    positioning: "项目定位",
    mvu: "MVU 规则",
    ui: "状态栏规则",
    assembly: "装配规则",
  })[group] ?? "资料条目";
}
function automaticCharacterBookConfig(group, source, index, cardMode = "pending") {
  if (group === "user_character") {
    const contract = source.worldbook ?? {};
    return {
      enabled: contract.enabled_by_default === true,
      constant: contract.constant !== false,
      keys: Array.isArray(contract.keys) ? contract.keys : ["<user>", "user"],
      order: Number.isInteger(contract.order) ? contract.order : 9995,
      position: contract.position === "before_char" ? "before_char" : "after_char",
      depth: Number.isInteger(contract.depth) ? contract.depth : 4,
      probability: Number.isInteger(contract.probability) ? contract.probability : 100,
      scanDepth: null,
      ignoreBudget: false,
      recursion: {
        preventIncoming: contract.recursion?.prevent_incoming !== false,
        preventOutgoing: contract.recursion?.prevent_outgoing !== false,
      },
    };
  }
  const displayName = source.display_name ?? source.openings?.[0]?.display_name ?? source.id;
  const aliases = group === "character" ? source.identity?.aliases ?? [] : [];
  const keywords = [displayName, ...aliases].filter((value, keyIndex, values) => (
    typeof value === "string" && value.trim() && values.indexOf(value) === keyIndex
  ));
  const singleCharacter = group === "character" && SINGLE_CHARACTER_CARD_MODES.has(cardMode);
  const constant = ["positioning", "world", "system", "prompt"].includes(group) || singleCharacter;
  const ignoreBudget = singleCharacter;
  const protocolEntry = ["positioning", "system", "prompt"].includes(group);
  const baseOrder = ({ positioning: 50, world: 100, character: 300, scene: 400, system: 500, prompt: 600 })[group] ?? 900;
  return {
    enabled: true,
    constant,
    keys: constant ? [] : keywords,
    order: baseOrder + index,
    position: ["positioning", "system", "prompt"].includes(group) || singleCharacter ? "after_char" : "before_char",
    depth: null,
    probability: 100,
    scanDepth: constant ? null : 4,
    ignoreBudget,
    recursion: {
      preventIncoming: protocolEntry || group === "world",
      preventOutgoing: protocolEntry,
    },
  };
}
function renderCharacterBookSource(group, source) {
  return renderStructured(projectModelSource(group, source));
}
function standaloneWorldbookEntry(group, source, index, uid = index) {
  const id = source.id ?? `${group}_${index + 1}`;
  const displayName = source.display_name ?? id;
  return {
    uid,
    id: `rp_${group}_${id}`,
    key: [displayName, id],
    keysecondary: [],
    comment: `${characterBookGroupLabel(group)}：${displayName}`,
    content: renderStructured(projectModelSource(group, source)),
    constant: true,
    selective: false,
    selectiveLogic: 0,
    useProbability: true,
    probability: 100,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    scanDepth: null,
    depth: 4,
    role: 0,
    disable: false,
    enabled: true,
    order: index,
    position: 0,
    extensions: { rp_card_studio: { group, source_id: id } }
  };
}
function standaloneWorldbookUids(entries) {
  const usedUids = /* @__PURE__ */ new Set();
  if (Array.isArray(entries)) throw integrityError("SillyTavern 独立世界书 entries 必须是以 uid 为键的对象");
  const records = Object.entries(entries);
  for (const [key, entry] of records) {
    if (!isPlainObject(entry)) continue;
    const canonicalKey = /^(0|[1-9]\d*)$/.test(key);
    if (!canonicalKey) throw integrityError(`世界书条目键必须是规范非负整数: ${key}`);
    const keyUid = Number(key);
    if (entry.uid === void 0 && keyUid !== null) entry.uid = keyUid;
    const uid = entry.uid === void 0 ? null : entry.uid;
    if (uid !== null && (typeof uid !== "number" || !Number.isInteger(uid) || uid < 0)) {
      throw integrityError(`世界书条目 uid 必须是非负整数: ${entry.uid}`);
    }
    if (keyUid !== null && uid !== null && keyUid !== uid) {
      throw integrityError(`世界书条目键 ${key} 与 uid ${uid} 不一致`);
    }
    if (uid !== null && usedUids.has(uid)) throw integrityError(`世界书含重复 uid: ${uid}`);
    if (keyUid !== null) usedUids.add(keyUid);
    if (uid !== null) usedUids.add(uid);
  }
  return usedUids;
}
function allocateStandaloneWorldbookUid(usedUids) {
  let uid = 0;
  while (usedUids.has(uid)) uid += 1;
  usedUids.add(uid);
  return uid;
}
function entryCount(entries) {
  return Array.isArray(entries) ? entries.length : Object.keys(entries).length;
}
function appendWorldbookEntry(entries, entry) {
  if (Array.isArray(entries)) entries.push(entry);
  else entries[entry.uid ?? entry.id] = entry;
}
export function collectPreserved(payload, format) {
  const entries = [];
  if (isCharacterFormat(format)) {
    const knownTop = /* @__PURE__ */ new Set(["spec", "spec_version", "data"]);
    const knownData = /* @__PURE__ */ new Set([
      "name",
      "description",
      "personality",
      "scenario",
      "first_mes",
      "mes_example",
      "creator_notes",
      "system_prompt",
      "post_history_instructions",
      "alternate_greetings",
      "tags",
      "creator",
      "character_version",
      "extensions",
      "character_book"
    ]);
    for (const [key, value] of Object.entries(payload)) {
      if (!knownTop.has(key)) entries.push({ path: `/${escapePointer(key)}`, value });
    }
    for (const [key, value] of Object.entries(payload.data ?? {})) {
      if (!knownData.has(key)) entries.push({ path: `/data/${escapePointer(key)}`, value });
    }
    for (const [key, value] of Object.entries(payload.data?.extensions ?? {})) {
      entries.push({ path: `/data/extensions/${escapePointer(key)}`, value });
    }
  } else if (format === Format.WORLDBOOK) {
    const known = /* @__PURE__ */ new Set(["name", "description", "entries"]);
    for (const [key, value] of Object.entries(payload)) {
      if (!known.has(key)) entries.push({ path: `/${escapePointer(key)}`, value });
    }
  }
  return { schema_version: 1, entries };
}
function escapePointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function unescapePointer(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}
function applyPreserved(payload, preserved) {
  const clone = structuredClone(payload);
  const restoredPaths = [];
  if (!isPlainObject(preserved) || !Array.isArray(preserved.entries)) return { payload: clone, restoredPaths };
  for (const entry of preserved.entries) {
    if (!isPlainObject(entry) || typeof entry.path !== "string" || !entry.path.startsWith("/")) continue;
    const segments = entry.path.slice(1).split("/").map(unescapePointer);
    let current = clone;
    let valid = true;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (current[segment] === void 0) current[segment] = {};
      if (!isPlainObject(current[segment])) {
        valid = false;
        break;
      }
      current = current[segment];
    }
    if (!valid) continue;
    const key = segments.at(-1);
    if (!Object.hasOwn(current, key)) {
      current[key] = structuredClone(entry.value);
      restoredPaths.push(entry.path);
    }
  }
  return { payload: clone, restoredPaths };
}
function bindEmbeddedCharacterBook(payload, { target }) {
  const clone = structuredClone(payload);
  const issues = [];
  const warnings = [];
  if (target !== "character") return { payload: clone, issues, warnings };
  const characterBook = clone.data?.character_book;
  if (!hasWorldbookEntries(characterBook)) return { payload: clone, issues, warnings };
  const explicitName = characterBook.name;
  const characterName = clone.data?.name;
  const bookName = typeof explicitName === "string" && explicitName.trim().length > 0
    ? explicitName
    : typeof characterName === "string" && characterName.trim().length > 0
      ? `${characterName}'s Lorebook`
      : null;
  if (!bookName) {
    issues.push(issue(
      "/data/character_book/name",
      "character_book.binding",
      "An embedded CharacterBook requires either a usable book name or a character name for SillyTavern's fallback",
    ));
    return { payload: clone, issues, warnings };
  }
  characterBook.name = bookName;
  clone.data.extensions = isPlainObject(clone.data.extensions) ? clone.data.extensions : {};
  const existingWorld = clone.data.extensions.world;
  if (typeof existingWorld === "string" && existingWorld.length > 0 && existingWorld !== bookName) {
    issues.push(issue(
      "/data/extensions/world",
      "character_book.binding_conflict",
      `Refusing to replace existing primary lorebook ${JSON.stringify(existingWorld)} with embedded CharacterBook ${JSON.stringify(bookName)}; resolve the imported-card binding explicitly`,
    ));
    return { payload: clone, issues, warnings };
  }
  clone.data.extensions.world = bookName;
  return { payload: clone, issues, warnings };
}
function lockHash(value) {
  return sha256(JSON.stringify(stableJson(value)));
}
export function decisionValue(decision) {
  return structuredClone(decision.value);
}
function decisionValueHash(decision) {
  return lockHash(decisionValue(decision));
}
export function decisionLock(decision, lockedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    decision_id: decision.id,
    value_hash: decisionValueHash(decision),
    locked_by: decision.decided_by,
    locked_at: lockedAt
  };
}
export async function updateManagedState(loaded, nextState, options = {}) {
  const result = await commitWrites([
    { path: loaded.statePath, content: prettyJson(nextState) }
  ], { ...options, force: true });
  loaded.state = nextState;
  return result;
}
export async function updateProjectAndState(loaded, nextProject, nextState, options = {}) {
  const result = await commitWrites([
    { path: loaded.projectPath, content: stringifyYaml(nextProject) },
    { path: loaded.statePath, content: prettyJson(nextState) }
  ], { ...options, force: true });
  loaded.project = nextProject;
  loaded.state = nextState;
  return result;
}
export async function runProjectMutation(root, callback, options = {}) {
  const absolute = path.resolve(root);
  return withProjectLock(absolute, () => callback(absolute), options);
}
export function migrateProject(project, state = null) {
  if (project?.schema_version === PROJECT_SCHEMA_VERSION) {
    const hasPlan = Array.isArray(project?.workflow?.planned_stages);
    const legacyRoute = Array.isArray(project?.workflow?.selected_stages) ? project.workflow.selected_stages : null;
    const hasLegacyDecision = (project?.decisions ?? []).some((decision) => decision.id === "preflight.stage_route");
    const activeStage = STAGES.includes(state?.active_stage)
      ? state.active_stage
      : STAGES.includes(project?.workflow?.current_stage)
        ? project.workflow.current_stage
        : "positioning";
    const hasAgent = project?.agent?.architecture === AGENT_ARCHITECTURE
      && project?.agent?.writable_stage === activeStage
      && project?.workflow?.current_stage === activeStage
      && Array.isArray(project?.handoffs)
      && isPlainObject(project?.capabilities);
    if (project?.preflight?.workflow_confirmed === true && hasPlan && !legacyRoute && !hasLegacyDecision && hasAgent) return { value: project, migrated: false };
    const migrated = structuredClone(project);
    migrated.preflight ??= {};
    migrated.preflight.workflow_confirmed = true;
    migrated.workflow ??= { stage_order: [...WORKFLOW_STAGES], optional_stages: [...OPTIONAL_STAGES] };
    migrated.workflow.stage_order = [...WORKFLOW_STAGES];
    migrated.workflow.optional_stages = [...OPTIONAL_STAGES];
    migrated.workflow.planned_stages = normalizeStagePlan(legacyRoute ?? migrated.workflow.planned_stages ?? DEFAULT_STAGE_ROUTE);
    delete migrated.workflow.selected_stages;
    migrated.decisions ??= [];
    migrated.decisions = migrated.decisions.filter((decision) => decision.id !== "preflight.stage_route");
    migrated.handoffs ??= [];
    migrated.capabilities ??= { enabled: [], planned: [], evidence: [] };
    migrated.blueprint ??= { mode: "direct", total_design: null, first_playable: null, growth_tracks: [], parking_lot: [], next: null };
    const stageState = state ? structuredClone(state) : { active_stage: activeStage, stages: initialStages() };
    stageState.active_stage = activeStage;
    syncAgentLedger(migrated, stageState);
    return { value: migrated, migrated: true };
  }
  if (![0, "0", "0.1.0"].includes(project?.schema_version)) {
    throw validationError(`无法迁移 project.yaml 版本: ${project?.schema_version}`);
  }
  if (isPlainObject(project?.preflight) && isPlainObject(project?.source_manifest)) {
    const migrated = structuredClone(project);
    migrated.schema_version = PROJECT_SCHEMA_VERSION;
    migrated.handoffs ??= [];
    migrated.capabilities ??= { enabled: [], planned: [], evidence: [] };
    migrated.blueprint ??= { mode: "direct", total_design: null, first_playable: null, growth_tracks: [], parking_lot: [], next: null };
    const activeStage = STAGES.includes(state?.active_stage) ? state.active_stage : "positioning";
    syncAgentLedger(migrated, state ?? { active_stage: activeStage, stages: initialStages() });
    return { value: migrated, migrated: true };
  }
  const legacyName = project?.project?.name ?? project?.name ?? project?.project?.id ?? "project";
  const legacyNsfw = project?.project?.nsfw?.enabled;
  if (typeof legacyNsfw !== "boolean") {
    throw validationError("旧项目未明确锁定 NSFW，不能自动迁移", {
      hint: "先在 project.yaml 中明确 preflight.nsfw.enabled"
    });
  }
  const target = project?.project?.target ?? project?.target ?? "character_card";
  return {
    value: makeProject({ name: legacyName, target, nsfw: legacyNsfw, operation: "continue" }),
    migrated: true
  };
}
export function migrateState(state, project) {
  if (state?.schema_version === STATE_SCHEMA_VERSION) {
    const cleaned = (state?.decision_locks ?? []).filter((lock) => lock.decision_id !== "preflight.stage_route");
    const existingIds = new Set(cleaned.map((lock) => lock.decision_id));
    const missing = (project?.decisions ?? []).filter((decision) => decision.locked && !existingIds.has(decision.id));
    const legacySkipped = Object.values(state?.stages ?? {}).some((stage) => stage?.summary === "项目预检阶段路线未选择");
    if (missing.length === 0 && cleaned.length === (state?.decision_locks ?? []).length && !legacySkipped) return { value: state, migrated: false };
    const migrated = structuredClone(state);
    migrated.decision_locks = cleaned;
    migrated.decision_locks.push(...missing.map((decision) => decisionLock(decision)));
    for (const stage of Object.values(migrated.stages ?? {})) {
      if (stage?.summary === "项目预检阶段路线未选择") {
        stage.status = "not_started";
        stage.round = 0;
        stage.summary = null;
      }
    }
    return { value: migrated, migrated: true };
  }
  if (![0, "0", "0.1.0", 1].includes(state?.schema_version)) {
    throw validationError(`无法迁移状态版本: ${state?.schema_version}`);
  }
  if (isPlainObject(state?.stages) && Array.isArray(state?.decision_locks)) {
    const migrated2 = structuredClone(state);
    migrated2.schema_version = STATE_SCHEMA_VERSION;
    return { value: migrated2, migrated: true };
  }
  const migrated = makeState(project, { revision: Number(state?.source_revision ?? state?.revision ?? 0) });
  const legacyStage = String(state?.workflow?.active_stage ?? state?.active_stage ?? "positioning").replaceAll("-", "_");
  if (STAGES.includes(legacyStage)) {
    migrated.active_stage = legacyStage;
    migrated.stages.positioning.status = legacyStage === "positioning" ? "in_progress" : "complete";
    migrated.stages[legacyStage].status = "in_progress";
    migrated.stages[legacyStage].round = Math.max(1, migrated.stages[legacyStage].round);
  }
  return { value: migrated, migrated: true };
}
export function assertValidSource(source) {
  if (source.validation.issues.length > 0) {
    throw validationError("源数据未通过结构校验", {
      format: source.format,
      issues: source.validation.issues
    });
  }
}
export async function readOriginalPng(loaded) {
  const relative = projectPngBasePath(loaded.project);
  if (!relative) throw inputError("项目没有登记 PNG 基底，无法输出 PNG");
  const pngPath = resolveWithin(loaded.projectRoot, relative);
  return { pngPath, buffer: await readFile(pngPath) };
}
export function compareLockValue(existing, value) {
  return semanticEqual(existing, value);
}
export function assertDecisionId(id) {
  if (!DECISION_ID_PATTERN.test(id)) throw inputError(`决定 ID 必须是稳定英文点路径: ${id}`);
}
export function addPreservedImport(project, relativePath) {
  project.source_manifest.preserved_imports.push(relativePath);
  project.source_manifest.preserved_imports = [...new Set(project.source_manifest.preserved_imports)];
}
