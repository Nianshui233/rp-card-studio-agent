import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { projectModelSource, semanticLeafPointers } from "./forge/projection.mjs";

const OPERATION_TYPES = Object.freeze({
  set: new Set(["string", "integer", "number", "boolean", "enum", "object", "array"]),
  add: new Set(["integer", "number"]),
  subtract: new Set(["integer", "number"]),
  append: new Set(["array"]),
  remove: new Set(["array", "object"]),
  move: new Set(["array"]),
  derive: new Set(["string", "integer", "number", "boolean", "enum", "object", "array"])
});

const PROTOCOL_OPERATION_ALIASES = Object.freeze({
  set: new Set(["set", "replace"]),
  add: new Set(["add", "delta"]),
  subtract: new Set(["subtract", "delta"]),
  append: new Set(["append", "insert"]),
  remove: new Set(["remove"]),
  move: new Set(["move"]),
  derive: new Set(["set", "replace"])
});

const KNOWN_REFERENCE_PREFIXES = new Set([
  "positioning",
  "material",
  "world",
  "character",
  "system",
  "scene",
  "opening",
  "ui",
  "media",
  "axis"
]);

const MANAGED_MVU_RUNTIME = Object.freeze({
  version: "0.179.0",
  url: "https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@v0.179.0/artifact/bundle.js"
});

const MANAGED_MVU_SCHEMA_RUNTIME = Object.freeze({
  version: "0.3.449",
  url: "https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@v0.3.449/dist/util/mvu_zod.js"
});

function issue(pathValue, rule, message) {
  return { path: pathValue || "/", rule, message };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entries(sources, group) {
  return Array.isArray(sources?.[group]) ? sources[group] : [];
}

function values(sources, group) {
  return entries(sources, group).map((entry) => entry.value).filter(isObject);
}

function clone(value) {
  return structuredClone(value);
}

// SillyTavern CharacterBook ids are numeric. Keep generated ids in a stable,
// high range so imported low ids remain readable and collision probing is cheap.
const CHARACTER_BOOK_ID_MIN = 1_000_000;
const CHARACTER_BOOK_ID_MAX = 2_147_483_647;
const CHARACTER_BOOK_ID_SPAN = CHARACTER_BOOK_ID_MAX - CHARACTER_BOOK_ID_MIN + 1;

function canonicalCharacterBookId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function characterBookIdCandidate(sourceKey) {
  if (typeof sourceKey !== "string" || sourceKey.length === 0) {
    throw new Error("CharacterBook source key must be a non-empty string");
  }
  const digest = createHash("sha256").update(`rp-card-studio:character-book:${sourceKey}`).digest();
  const hash = digest.readUInt32BE(0);
  return CHARACTER_BOOK_ID_MIN + (hash % CHARACTER_BOOK_ID_SPAN);
}

function characterBookTrackingKey(entry) {
  const tracking = entry?.extensions?.rp_card_studio;
  if (!isObject(tracking)) return null;
  if (typeof tracking.source_key === "string" && tracking.source_key.length > 0) return tracking.source_key;
  if (tracking.generated !== true || tracking.source_id === undefined || tracking.source_id === null) return null;
  const sourceId = String(tracking.source_id);
  if (tracking.kind === "ejs_template") return `ejs:${sourceId}:${tracking.channel ?? "generate"}`;
  if (typeof tracking.kind === "string" && tracking.kind.startsWith("mvu_")) return `mvu:${tracking.kind.slice(4)}`;
  if (tracking.kind === "assembly") return `assembly:${sourceId}`;
  return `${tracking.kind ?? "generated"}:${sourceId}`;
}

export function createCharacterBookIdAllocator(existingEntries = []) {
  const entries = Array.isArray(existingEntries)
    ? existingEntries
    : isObject(existingEntries) ? Object.values(existingEntries) : [];
  const used = new Set();
  const reusable = new Map();
  const assigned = new Map();
  const idOwners = new Map();
  for (const entry of entries) {
    const id = canonicalCharacterBookId(entry?.id);
    if (id === null) continue;
    used.add(id);
    const sourceKey = characterBookTrackingKey(entry);
    const owners = idOwners.get(id) ?? [];
    owners.push(sourceKey);
    idOwners.set(id, owners);
    if (sourceKey && !reusable.has(sourceKey)) reusable.set(sourceKey, id);
  }

  function allocateMany(sourceKeys) {
    const keys = [...new Set((sourceKeys ?? []).filter((key) => typeof key === "string" && key.length > 0))].sort();
    const requested = new Set(keys);
    // A generated entry with the same source key can keep its previous id.
    // Release those ids before assigning the batch, then claim them again in
    // sorted source-key order so hash collisions are order independent.
    const releasable = new Set();
    for (const [sourceKey, id] of reusable) {
      const owners = idOwners.get(id) ?? [];
      if (requested.has(sourceKey) && !assigned.has(sourceKey) && owners.length === 1 && owners[0] === sourceKey) {
        used.delete(id);
        releasable.add(sourceKey);
      }
    }
    const allocations = new Map();
    const pending = [];
    for (const sourceKey of keys) {
      if (assigned.has(sourceKey)) {
        allocations.set(sourceKey, assigned.get(sourceKey));
        continue;
      }
      const reusableId = reusable.get(sourceKey);
      if (releasable.has(sourceKey) && reusableId !== undefined && !used.has(reusableId)) {
        const allocation = { id: reusableId, candidate: reusableId, collision: false, reused: true };
        used.add(reusableId);
        assigned.set(sourceKey, allocation);
        allocations.set(sourceKey, allocation);
        continue;
      }
      pending.push(sourceKey);
    }
    for (const sourceKey of pending) {
      const candidate = characterBookIdCandidate(sourceKey);
      let id = candidate;
      let collision = false;
      while (used.has(id)) {
        collision = true;
        id = id >= CHARACTER_BOOK_ID_MAX ? CHARACTER_BOOK_ID_MIN : id + 1;
        if (id === candidate) throw new Error("CharacterBook id space exhausted");
      }
      const allocation = { id, candidate, collision, reused: false };
      used.add(id);
      idOwners.set(id, [sourceKey]);
      assigned.set(sourceKey, allocation);
      allocations.set(sourceKey, allocation);
    }
    return allocations;
  }

  function allocate(sourceKey) {
    return allocateMany([sourceKey]).get(sourceKey);
  }

  return { allocate, allocateMany, used };
}

function mergeValues(base, overlay) {
  const output = isObject(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(isObject(overlay) ? overlay : {})) {
    output[key] = isObject(value) && isObject(output[key]) ? mergeValues(output[key], value) : clone(value);
  }
  return output;
}

function resolveWithin(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`Project path must be a non-empty relative path: ${relativePath ?? ""}`);
  }
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Project path escapes the workspace: ${relativePath}`);
  }
  return resolved;
}

function getPath(root, dottedPath) {
  let current = root;
  for (const segment of String(dottedPath).split(".")) {
    if (!isObject(current) || !Object.hasOwn(current, segment)) return { found: false, value: undefined };
    current = current[segment];
  }
  return { found: true, value: current };
}

function setPath(root, dottedPath, value) {
  const segments = String(dottedPath).split(".");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current.properties ??= {};
    current.required ??= [];
    if (!current.required.includes(segment)) current.required.push(segment);
    current.properties[segment] ??= {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: []
    };
    current = current.properties[segment];
  }
  const leaf = segments.at(-1);
  current.properties ??= {};
  current.required ??= [];
  if (!current.required.includes(leaf)) current.required.push(leaf);
  current.properties[leaf] = value;
}

function normalizeRefId(reference, prefix) {
  if (typeof reference !== "string") return null;
  return reference.startsWith(prefix) ? reference.slice(prefix.length) : reference;
}

function pathConflict(left, right) {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function valueMatchesType(value, type) {
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "enum") return ["string", "number", "boolean"].includes(typeof value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  return true;
}

function valueMatchesConstraints(value, variable) {
  const constraints = isObject(variable.constraints) ? variable.constraints : {};
  if (typeof constraints.minimum === "number" && typeof value === "number" && value < constraints.minimum) return false;
  if (typeof constraints.maximum === "number" && typeof value === "number" && value > constraints.maximum) return false;
  if (Array.isArray(constraints.values) && !constraints.values.some((candidate) => Object.is(candidate, value))) return false;
  if (typeof constraints.pattern === "string" && typeof value === "string") {
    try {
      if (!new RegExp(constraints.pattern).test(value)) return false;
    } catch {
      return false;
    }
  }
  if (Number.isInteger(constraints.max_items) && Array.isArray(value) && value.length > constraints.max_items) return false;
  return true;
}

function validateWriteValue(write, variable, pathValue, issues) {
  const hasValue = Object.hasOwn(write, "value");
  if (write.operation === "set") {
    if (!hasValue || !valueMatchesType(write.value, variable.type) || !valueMatchesConstraints(write.value, variable)) {
      issues.push(issue(`${pathValue}/value`, "mvu.write.value", `Set value does not satisfy ${variable.source_path}`));
    }
    return;
  }
  if (["add", "subtract"].includes(write.operation)) {
    const valid = hasValue && (variable.type === "integer"
      ? Number.isInteger(write.value)
      : typeof write.value === "number" && Number.isFinite(write.value));
    if (!valid) issues.push(issue(`${pathValue}/value`, "mvu.write.value", `${write.operation} requires a ${variable.type} delta for ${variable.source_path}`));
    return;
  }
  if (write.operation === "append" && !hasValue) {
    issues.push(issue(`${pathValue}/value`, "mvu.write.value", `Append requires a value for ${variable.source_path}`));
  }
}

function variableSchema(variable) {
  const typeMap = {
    string: "string",
    integer: "integer",
    number: "number",
    boolean: "boolean",
    object: "object",
    array: "array"
  };
  const constraints = isObject(variable.constraints) ? variable.constraints : {};
  const schema = {
    ...(variable.type === "enum" ? {} : { type: typeMap[variable.type] ?? "string" }),
    default: clone(variable.default)
  };
  if (variable.type === "enum") {
    if (Array.isArray(constraints.values) && constraints.values.length > 0) schema.enum = clone(constraints.values);
    const sample = schema.enum?.[0] ?? variable.default;
    if (typeof sample === "string") schema.type = "string";
    else if (typeof sample === "number") schema.type = Number.isInteger(sample) ? "integer" : "number";
    else if (typeof sample === "boolean") schema.type = "boolean";
  }
  if (typeof constraints.minimum === "number") schema.minimum = constraints.minimum;
  if (typeof constraints.maximum === "number") schema.maximum = constraints.maximum;
  if (typeof constraints.pattern === "string") schema.pattern = constraints.pattern;
  if (Number.isInteger(constraints.max_items)) schema.maxItems = constraints.max_items;
  if (variable.type === "object") {
    // Object variables have no declared child shape. Keep their contents open so
    // legal remove/set operations are not contradicted by the generated schema.
    schema.additionalProperties = true;
  }
  return schema;
}

export function generateRuntimeStateSchema(sources) {
  const runtimeSources = entries(sources, "mvu").filter((entry) => entry.value?.mvu?.enabled);
  const runtimeVariables = runtimeSources.flatMap((entry) => {
    const namespace = entry.value.mvu.storage?.namespace ?? "stat_data";
    return (entry.value.mvu.variables ?? []).map((variable) => ({ variable, namespace, source: entry.relativePath }));
  });
  const variables = runtimeVariables.map((entry) => entry.variable);
  if (variables.length === 0) return null;
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://rp-card-studio.local/generated/runtime-state.schema.json",
    title: "RP Card Studio Runtime State",
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
    "x-rp-card-studio": {
      generated: true,
      evidence: "artifact_only",
      root_semantics: {
        representation: "storage_namespace_contents",
        namespaces: [...new Set(runtimeVariables.map((entry) => entry.namespace))]
      },
      mappings: runtimeVariables.map(({ variable, namespace }) => ({
        source_path: variable.source_path,
        runtime_path: variable.runtime_path,
        schema_path: variable.runtime_path.startsWith(`${namespace}.`) ? variable.runtime_path.slice(namespace.length + 1) : variable.runtime_path
      })),
      storage_contracts: runtimeSources.map((entry) => ({ source: entry.relativePath, contract: clone(entry.value.mvu.storage ?? null) })),
      protocol_contracts: runtimeSources.map((entry) => ({ source: entry.relativePath, contract: clone(entry.value.mvu.protocol ?? null) })),
      initialization: {
        defaults: runtimeSources.map((entry) => ({ source: entry.relativePath, values: clone(entry.value.mvu.initialization?.defaults ?? {}) })),
        profiles: runtimeSources.flatMap((entry) => (entry.value.mvu.initialization?.profiles ?? []).map((profile) => ({ source: entry.relativePath, ...clone(profile) }))),
        opening_overrides: runtimeSources.flatMap((entry) => (entry.value.mvu.initialization?.opening_overrides ?? []).map((override) => ({ source: entry.relativePath, ...clone(override) }))),
        opening_bindings: runtimeSources.flatMap((entry) => (entry.value.mvu.initialization?.opening_bindings ?? []).map((binding) => ({ source: entry.relativePath, ...clone(binding) })))
      },
      opening_initializations: resolveOpeningInitializations(values(sources, "prompts"), runtimeSources.map((entry) => entry.value))
    }
  };
  for (const { variable, namespace } of [...runtimeVariables].sort((left, right) => left.variable.runtime_path.localeCompare(right.variable.runtime_path))) {
    const schemaPath = variable.runtime_path.startsWith(`${namespace}.`) ? variable.runtime_path.slice(namespace.length + 1) : variable.runtime_path;
    setPath(schema, schemaPath, variableSchema(variable));
  }
  return schema;
}

function validateVariables(mvuSources, issues) {
  // EJS-only projects still need a ledger so their conditions can be checked
  // and compiled. They do not activate the MVU runtime just because the
  // variables are declared here.
  const variables = mvuSources.flatMap((source) => (source.mvu?.enabled || source.ejs?.enabled) ? source.mvu.variables ?? [] : []);
  const bySource = new Map();
  const byRuntime = new Map();
  const namespaces = new Set(mvuSources.filter((source) => source.mvu?.enabled).map((source) => source.mvu.storage?.namespace ?? "stat_data"));
  if (namespaces.size > 1) issues.push(issue("/runtime/mvu/storage/namespace", "mvu.storage", `Runtime state schema requires one storage namespace; found: ${[...namespaces].join(", ")}`));
  for (const [index, variable] of variables.entries()) {
    const base = `/runtime/variables/${index}`;
    for (const [existingPath] of bySource) {
      if (pathConflict(existingPath, variable.source_path)) {
        issues.push(issue(`${base}/source_path`, "mvu.reference", `Source path conflicts with another variable: ${variable.source_path}`));
        break;
      }
    }
    for (const [existingPath] of byRuntime) {
      if (pathConflict(existingPath, variable.runtime_path)) {
        issues.push(issue(`${base}/runtime_path`, "mvu.reference", `Runtime path conflicts with another variable: ${variable.runtime_path}`));
        break;
      }
    }
    bySource.set(variable.source_path, variable);
    byRuntime.set(variable.runtime_path, variable);
    if (!valueMatchesType(variable.default, variable.type) || !valueMatchesConstraints(variable.default, variable)) {
      issues.push(issue(`${base}/default`, "mvu.default", `Default value does not satisfy ${variable.source_path}`));
    }
  }

  for (const [sourceIndex, source] of mvuSources.entries()) {
    if (!source.mvu?.enabled && !source.ejs?.enabled) continue;
    for (const [ruleIndex, rule] of (source.mvu?.update_rules ?? []).entries()) {
      const base = `/runtime/mvu/${sourceIndex}/update_rules/${ruleIndex}`;
      for (const readPath of rule.reads ?? []) {
        if (!bySource.has(readPath)) issues.push(issue(`${base}/reads`, "mvu.reference", `Update rule reads an unknown variable: ${readPath}`));
      }
      for (const [writeIndex, write] of (rule.writes ?? []).entries()) {
        const writePath = `${base}/writes/${writeIndex}`;
        const variable = bySource.get(write.source_path);
        if (!variable) {
          issues.push(issue(`${writePath}/source_path`, "mvu.reference", `Update rule writes an unknown variable: ${write.source_path}`));
          continue;
        }
        if (rule.writer_id !== variable.writer?.id) {
          issues.push(issue(`${base}/writer_id`, "mvu.writer", `Writer ${rule.writer_id} does not own ${write.source_path}`));
        }
        if (!(variable.writer?.operations ?? []).includes(write.operation)) {
          issues.push(issue(`${writePath}/operation`, "mvu.operation", `Writer does not allow ${write.operation} on ${write.source_path}`));
        }
        if (!OPERATION_TYPES[write.operation]?.has(variable.type)) {
          issues.push(issue(`${writePath}/operation`, "mvu.operation", `Operation ${write.operation} is incompatible with ${variable.type}`));
        } else {
          validateWriteValue(write, variable, writePath, issues);
        }
        const protocolOperations = source.mvu?.protocol?.operations;
        const aliases = PROTOCOL_OPERATION_ALIASES[write.operation];
        if (Array.isArray(protocolOperations) && aliases && !protocolOperations.some((operation) => aliases.has(operation))) {
          issues.push(issue(`${writePath}/operation`, "mvu.protocol.operation", `Operation ${write.operation} is not representable by protocol ${source.mvu.protocol.id}`));
        }
      }
    }
    for (const [routeIndex, route] of (source.mvu?.routing?.entries ?? []).entries()) {
      if (/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(route.source_ref) && !bySource.has(route.source_ref)) {
        issues.push(issue(`/runtime/mvu/${sourceIndex}/routing/entries/${routeIndex}/source_ref`, "mvu.reference", `Routing entry references an unknown variable: ${route.source_ref}`));
      }
    }
    if (source.ejs?.enabled) {
      for (const [entryIndex, ejsEntry] of (source.ejs.entries ?? []).entries()) {
        const entryBase = `/runtime/mvu/${sourceIndex}/ejs/entries/${entryIndex}`;
        for (const runtimePath of ejsEntry.reads ?? []) {
          const variable = byRuntime.get(runtimePath);
          if (!variable) {
            issues.push(issue(`${entryBase}/reads`, "mvu.reference", `EJS reads an unknown runtime path: ${runtimePath}`));
          } else if (!(variable.readers ?? []).includes("ejs")) {
            issues.push(issue(`${entryBase}/reads`, "mvu.reader", `Variable does not grant EJS read access: ${runtimePath}`));
          }
        }
        if (!isObject(ejsEntry.condition)) {
          issues.push(issue(`${entryBase}/condition`, "ejs.contract", "Executable EJS entries require a structured condition"));
        } else {
          const conditionVariable = byRuntime.get(ejsEntry.condition.runtime_path);
          if (!conditionVariable) {
            issues.push(issue(`${entryBase}/condition/runtime_path`, "mvu.reference", `EJS condition reads an unknown runtime path: ${ejsEntry.condition.runtime_path}`));
          } else {
            if (!(ejsEntry.reads ?? []).includes(ejsEntry.condition.runtime_path)) {
              issues.push(issue(`${entryBase}/reads`, "ejs.contract", "EJS condition runtime_path must be declared in reads"));
            }
            const operator = ejsEntry.condition.operator;
            if (["lt", "lte", "gt", "gte"].includes(operator) && !["integer", "number"].includes(conditionVariable.type)) {
              issues.push(issue(`${entryBase}/condition/operator`, "ejs.condition", `${operator} requires a numeric runtime variable`));
            }
            if (operator === "includes" && !["string", "array"].includes(conditionVariable.type)) {
              issues.push(issue(`${entryBase}/condition/operator`, "ejs.condition", "includes requires a string or array runtime variable"));
            }
            if (!["truthy", "falsy"].includes(operator)
              && !valueMatchesType(ejsEntry.condition.value, conditionVariable.type === "enum" ? "string" : conditionVariable.type)) {
              issues.push(issue(`${entryBase}/condition/value`, "ejs.condition", "EJS comparison value does not match the runtime variable type"));
            }
          }
        }
        if (!isObject(ejsEntry.branches)
          || !["when_true", "when_false", "fallback"].every((name) => typeof ejsEntry.branches[name] === "string" && ejsEntry.branches[name].length > 0)) {
          issues.push(issue(`${entryBase}/branches`, "ejs.contract", "Executable EJS entries require non-empty true, false, and fallback branches"));
        }
      }
    }
  }
  return { variables, bySource, byRuntime };
}

function validateInitializations(mvuSources, openingSources, bySource, issues, warnings = []) {
  const openings = new Map();
  for (const source of openingSources) {
    for (const opening of source.openings ?? []) openings.set(opening.id, opening);
  }
  const profiles = new Map();
  const profileDefinitions = new Map();
  const completeProfiles = new Set();
  const bindings = [];
  const overrides = [];
  for (const [sourceIndex, source] of mvuSources.entries()) {
    if (!source.mvu?.enabled) continue;
    const namespace = source.mvu.storage?.namespace ?? "stat_data";
    for (const [variableIndex, variable] of (source.mvu.variables ?? []).entries()) {
      if (!variable.runtime_path?.startsWith(`${namespace}.`)) {
        issues.push(issue(`/runtime/mvu/${sourceIndex}/variables/${variableIndex}/runtime_path`, "mvu.storage", `Runtime path must be inside storage namespace ${namespace}: ${variable.runtime_path}`));
      }
    }
    const initialization = source.mvu.initialization ?? {};
    if (isObject(initialization.defaults)) {
      if (profileDefinitions.has("default")) {
        issues.push(issue(`/runtime/mvu/${sourceIndex}/initialization/defaults`, "initialization.reference", "Duplicate initialization profile: default"));
      } else {
        profiles.set("default", initialization.defaults);
        profileDefinitions.set("default", { id: "default", values: initialization.defaults, extends: null });
      }
      for (const [sourcePath, variable] of bySource) {
        const candidate = getPath(initialization.defaults, sourcePath);
        const emptyContainer = (Array.isArray(candidate.value) && candidate.value.length === 0)
          || (isObject(candidate.value) && Object.keys(candidate.value).length === 0);
        const nonEmptyDefault = (Array.isArray(variable.default) && variable.default.length > 0)
          || (isObject(variable.default) && Object.keys(variable.default).length > 0);
        if (candidate.found && emptyContainer && nonEmptyDefault) {
          issues.push(issue(
            `/runtime/mvu/${sourceIndex}/initialization/defaults`,
            "initialization.default_override",
            `Initialization replaces non-empty variable default with an empty container: ${sourcePath}`
          ));
        }
      }
    }
    for (const [profileIndex, profile] of (initialization.profiles ?? []).entries()) {
      if (profileDefinitions.has(profile.id)) {
        issues.push(issue(`/runtime/mvu/${sourceIndex}/initialization/profiles/${profileIndex}/id`, "initialization.reference", `Duplicate initialization profile: ${profile.id}`));
        continue;
      }
      profiles.set(profile.id, profile.values);
      profileDefinitions.set(profile.id, profile);
      if (profile.strategy === "complete_replace") completeProfiles.add(profile.id);
    }
    for (const binding of initialization.opening_bindings ?? []) bindings.push(binding);
    for (const [overrideIndex, override] of (initialization.opening_overrides ?? []).entries()) {
      overrides.push({ override, sourceIndex, overrideIndex, defaults: initialization.defaults ?? {} });
    }
  }

  const resolvedProfiles = new Map();
  const resolving = new Set();
  const resolveProfile = (profileId) => {
    if (resolvedProfiles.has(profileId)) return resolvedProfiles.get(profileId);
    const definition = profileDefinitions.get(profileId);
    if (!definition) return null;
    if (resolving.has(profileId)) {
      issues.push(issue(`/runtime/initialization/profiles/${profileId}/extends`, "initialization.reference", `Initialization profile inheritance cycle includes: ${profileId}`));
      return definition.values ?? {};
    }
    resolving.add(profileId);
    const parentId = normalizeRefId(definition.extends, "mvu_init:");
    let inherited = {};
    if (parentId) {
      if (!profileDefinitions.has(parentId)) issues.push(issue(`/runtime/initialization/profiles/${profileId}/extends`, "initialization.reference", `Initialization profile extends an unknown profile: ${definition.extends}`));
      else inherited = resolveProfile(parentId) ?? {};
    }
    resolving.delete(profileId);
    const resolved = mergeValues(inherited, definition.values ?? {});
    resolvedProfiles.set(profileId, resolved);
    return resolved;
  };
  for (const profileId of profileDefinitions.keys()) resolveProfile(profileId);
  profiles.clear();
  for (const [profileId, profileValues] of resolvedProfiles) profiles.set(profileId, profileValues);

  for (const [profileId, profileValues] of profiles) {
    validateInitializationPaths(`/runtime/initialization/profiles/${profileId}`, `Profile ${profileId}`, profileValues, bySource, issues);
    for (const [sourcePath, variable] of bySource) {
      const candidate = getPath(profileValues, sourcePath);
      if (!candidate.found) continue;
      if (!valueMatchesType(candidate.value, variable.type) || !valueMatchesConstraints(candidate.value, variable)) {
        issues.push(issue(`/runtime/initialization/profiles/${profileId}`, "initialization.value", `Profile value does not satisfy ${sourcePath}`));
      }
    }
  }

  const completenessIssues = new Set();
  const validateCompleteProfile = (profileId, pathValue) => {
    if (!profiles.has(profileId)) return;
    for (const sourcePath of bySource.keys()) {
      const key = `${profileId}:${sourcePath}`;
      if (!getPath(profiles.get(profileId), sourcePath).found && !completenessIssues.has(key)) {
        issues.push(issue(pathValue, "initialization.value", `Complete replacement profile is missing: ${sourcePath}`));
        completenessIssues.add(key);
      }
    }
  };
  for (const profileId of completeProfiles) validateCompleteProfile(profileId, `/runtime/initialization/profiles/${profileId}`);

  const bindingByOpening = new Map();
  for (const [index, binding] of bindings.entries()) {
    const openingId = normalizeRefId(binding.opening_ref, "opening:");
    const profileId = normalizeRefId(binding.profile_ref, "mvu_init:");
    if (!openings.has(openingId)) issues.push(issue(`/runtime/initialization/opening_bindings/${index}/opening_ref`, "initialization.reference", `Binding references an unknown opening: ${binding.opening_ref}`));
    if (!profiles.has(profileId)) issues.push(issue(`/runtime/initialization/opening_bindings/${index}/profile_ref`, "initialization.reference", `Binding references an unknown profile: ${binding.profile_ref}`));
    if (binding.strategy === "complete_replace") validateCompleteProfile(profileId, `/runtime/initialization/opening_bindings/${index}/profile_ref`);
    if (bindingByOpening.has(openingId)) issues.push(issue(`/runtime/initialization/opening_bindings/${index}`, "initialization.reference", `Opening has more than one initialization binding: ${binding.opening_ref}`));
    bindingByOpening.set(openingId, binding);
  }
  const overrideByOpening = new Map();
  for (const record of overrides) {
    const { override, sourceIndex, overrideIndex, defaults } = record;
    const openingId = normalizeRefId(override.opening_ref, "opening:");
    const pathValue = `/runtime/mvu/${sourceIndex}/initialization/opening_overrides/${overrideIndex}`;
    if (!openings.has(openingId)) issues.push(issue(`${pathValue}/opening_ref`, "initialization.reference", `Opening override references an unknown opening: ${override.opening_ref}`));
    if (overrideByOpening.has(openingId)) issues.push(issue(pathValue, "initialization.reference", `Opening has more than one initialization override: ${override.opening_ref}`));
    overrideByOpening.set(openingId, override);
    const resolved = override.values ?? {};
    validateInitializationPaths(pathValue, `Opening override ${override.opening_ref}`, resolved, bySource, issues);
    for (const [sourcePath, variable] of bySource) {
      const candidate = getPath(resolved, sourcePath);
      if (candidate.found && (!valueMatchesType(candidate.value, variable.type) || !valueMatchesConstraints(candidate.value, variable))) {
        issues.push(issue(pathValue, "initialization.value", `Opening initialization does not satisfy ${sourcePath}`));
      }
    }
    for (const sourcePath of bySource.keys()) {
      if (!getPath(resolved, sourcePath).found) issues.push(issue(pathValue, "initialization.value", `Opening initialization is missing: ${sourcePath}`));
    }
  }
  for (const [openingId, opening] of openings) {
    const binding = bindingByOpening.get(openingId);
    const override = overrideByOpening.get(openingId);
    const profileId = normalizeRefId(opening.initial_state_ref, "mvu_init:");
    if (profileId && !profiles.has(profileId)) issues.push(issue(`/runtime/openings/${openingId}/initial_state_ref`, "initialization.reference", `Opening references an unknown initialization profile: ${opening.initial_state_ref}`));
    if (binding && profileId && normalizeRefId(binding.profile_ref, "mvu_init:") !== profileId) {
      issues.push(issue(`/runtime/openings/${openingId}/initial_state_ref`, "initialization.reference", `Opening and binding select different initialization profiles`));
    }
    if (override && (profileId || binding)) {
      issues.push(issue(`/runtime/openings/${openingId}/initial_state_ref`, "initialization.reference", "Opening initialization is ambiguous between an override and a profile"));
    }
    if (mvuSources.some((source) => source.mvu?.enabled) && !profileId && !binding && !override) {
      issues.push(issue(`/runtime/openings/${openingId}/initial_state_ref`, "initialization.reference", "MVU-enabled openings require an explicit initialization profile, binding, or override"));
    }
  }
  const selections = new Map();
  for (const [openingId, opening] of openings) {
    const binding = bindingByOpening.get(openingId);
    const profileId = normalizeRefId(opening.initial_state_ref, "mvu_init:")
      ?? normalizeRefId(binding?.profile_ref, "mvu_init:");
    if (!profileId || overrideByOpening.has(openingId)) continue;
    const group = selections.get(profileId) ?? [];
    group.push(opening);
    selections.set(profileId, group);
  }
  for (const [profileId, selectedOpenings] of selections) {
    const scenes = new Set(selectedOpenings.map((opening) => opening.scene_ref).filter(Boolean));
    if (selectedOpenings.length > 1 && scenes.size > 1) {
      warnings.push(issue(
        "/runtime/openings",
        "initialization.shared_profile",
        `Openings in different scenes share initialization profile ${profileId}; verify location, time, transit state, and established facts for each opening`
      ));
    }
  }
}

function validateInitializationPaths(pathValue, label, profileValues, bySource, issues) {
  const declaredPaths = [...bySource.keys()];
  const walk = (value, currentPath) => {
    if (currentPath) {
      const variable = bySource.get(currentPath);
      if (variable) return;
      if (!declaredPaths.some((declaredPath) => declaredPath.startsWith(`${currentPath}.`))) {
        issues.push(issue(pathValue, "initialization.value", `${label} contains an unknown variable path: ${currentPath}`));
        return;
      }
    }
    if (!isObject(value)) {
      if (currentPath) issues.push(issue(pathValue, "initialization.value", `${label} path does not resolve to a declared variable: ${currentPath}`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      walk(child, currentPath ? `${currentPath}.${key}` : key);
    }
  };
  walk(profileValues, "");
}

function validateStateBindings(sources, bySource, issues) {
  if (bySource.size === 0) return;
  for (const group of ["characters", "scenes"]) {
    for (const [sourceIndex, source] of values(sources, group).entries()) {
      for (const [bindingIndex, binding] of (source.state_bindings ?? []).entries()) {
        if (!bySource.has(binding.source_path)) {
          issues.push(issue(`/runtime/${group}/${sourceIndex}/state_bindings/${bindingIndex}/source_path`, "mvu.reference", `${group} binding references an unknown MVU variable: ${binding.source_path}`));
        }
      }
    }
  }
}

function validateOpeningReferences(sources, openingSources, project, issues) {
  const characterIds = new Set(values(sources, "characters").map((source) => source.id));
  const sceneIds = new Set(values(sources, "scenes").map((source) => source.id));
  const openingIds = new Set();
  let openingCount = 0;
  let defaultCount = 0;
  for (const [sourceIndex, source] of openingSources.entries()) {
    for (const [openingIndex, opening] of (source.openings ?? []).entries()) {
      openingCount += 1;
      if (openingIds.has(opening.id)) issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/id`, "opening.identity", `Duplicate opening id: ${opening.id}`));
      openingIds.add(opening.id);
      if (opening.is_default === true) defaultCount += 1;
      const sceneId = normalizeRefId(opening.scene_ref, "scene:");
      if (sceneId && !sceneIds.has(sceneId)) issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/scene_ref`, "opening.reference", `Opening references an unknown scene: ${opening.scene_ref}`));
      for (const characterRef of opening.present_character_refs ?? []) {
        const characterId = normalizeRefId(characterRef, "character:");
        if (!characterIds.has(characterId)) issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/present_character_refs`, "opening.reference", `Opening references an unknown character: ${characterRef}`));
      }
    }
    for (const [exampleIndex, example] of (source.dialogue_examples ?? []).entries()) {
      const characterId = normalizeRefId(example.character_ref, "character:");
      if (characterId && !characterIds.has(characterId)) issues.push(issue(`/runtime/openings/${sourceIndex}/dialogue_examples/${exampleIndex}/character_ref`, "opening.reference", `Dialogue example references an unknown character: ${example.character_ref}`));
    }
  }
  if (openingCount > 0 && defaultCount !== 1) {
    issues.push(issue("/runtime/openings", "opening.identity", `Exactly one default opening is required; found ${defaultCount}`));
  }
}

function validateMediaConsumers(sources, issues) {
  const targets = new Map([
    ["opening", new Set(values(sources, "prompts").flatMap((source) => source.openings ?? []).map((opening) => opening.id))],
    ["character", new Set(values(sources, "characters").map((source) => source.id))],
    ["scene", new Set(values(sources, "scenes").map((source) => source.id))],
    ["world", new Set(values(sources, "world").map((source) => source.id))],
    ["system", new Set(values(sources, "systems").map((source) => source.id))],
    ["ui", new Set(values(sources, "ui").flatMap((source) => source.status_ui?.sections ?? []).map((section) => section.id))]
  ]);
  const sceneSlots = new Map();
  for (const [sceneIndex, scene] of values(sources, "scenes").entries()) {
    const slots = Array.isArray(scene.media_slots)
      ? scene.media_slots
      : Array.isArray(scene.extensions?.media_slots) ? scene.extensions.media_slots : [];
    const byId = new Map();
    for (const [slotIndex, slot] of slots.entries()) {
      if (byId.has(slot.id)) {
        issues.push(issue(`/runtime/scenes/${sceneIndex}/media_slots/${slotIndex}/id`, "media.slot", `Duplicate scene media slot: ${scene.id} / ${slot.id}`));
      } else {
        byId.set(slot.id, {
          ...slot,
          path: `/runtime/scenes/${sceneIndex}/media_slots/${slotIndex}`,
        });
      }
    }
    sceneSlots.set(scene.id, byId);
  }
  const claimedSlots = new Map();
  for (const [assemblyIndex, assembly] of assemblySources(sources).entries()) {
    if (!assembly.media_manifest?.enabled) continue;
    for (const [assetIndex, asset] of (assembly.media_manifest.assets ?? []).entries()) {
      for (const [consumerIndex, consumer] of (asset.consumers ?? []).entries()) {
        const claim = `${consumer.ref}\u0000${consumer.slot}`;
        if (claimedSlots.has(claim)) {
          issues.push(issue(`/runtime/assembly/${assemblyIndex}/media_manifest/assets/${assetIndex}/consumers/${consumerIndex}`, "media.reference", `Media consumer slot is already claimed by ${claimedSlots.get(claim)}: ${consumer.ref} / ${consumer.slot}`));
        } else {
          claimedSlots.set(claim, `media:${asset.id}`);
        }
        const match = /^([a-z_]+):([a-z][a-z0-9_]*)$/.exec(consumer.ref ?? "");
        if (!match || !targets.get(match[1])?.has(match[2])) {
          issues.push(issue(`/runtime/assembly/${assemblyIndex}/media_manifest/assets/${assetIndex}/consumers/${consumerIndex}/ref`, "media.reference", `Media consumer does not resolve: ${consumer.ref}`));
        } else if (match[1] === "scene") {
          const declaredSlots = sceneSlots.get(match[2]) ?? new Map();
          if (!declaredSlots.has(consumer.slot)) {
            issues.push(issue(`/runtime/assembly/${assemblyIndex}/media_manifest/assets/${assetIndex}/consumers/${consumerIndex}/slot`, "media.slot", `Scene media consumer does not resolve to a declared slot: ${consumer.ref} / ${consumer.slot}`));
          }
        }
      }
    }
  }
  for (const [sceneId, slots] of sceneSlots.entries()) {
    for (const slot of slots.values()) {
      if (slot.required === true && !claimedSlots.has(`scene:${sceneId}\u0000${slot.id}`)) {
        issues.push(issue(slot.path, "media.required", `Required scene media slot has no assembled asset: scene:${sceneId} / ${slot.id}`));
      }
    }
  }
}

function uiTypeCompatible(format, type) {
  if (format === "percent") return type === "integer" || type === "number";
  if (format === "list") return type === "array";
  if (format === "enum") return type === "enum" || type === "string";
  return format === type;
}

function completeUiDelivery(ui) {
  const delivery = ui.delivery;
  const supportedAdapter = (delivery?.level === "embedded" && delivery?.adapter === "sillytavern_regex")
    || (delivery?.level === "host_required" && delivery?.adapter === "tavern_helper_message");
  return isObject(delivery)
    && supportedAdapter
    && delivery.surface === "message"
    && delivery.entrypoint === "generated"
    && delivery.artifact === "inline"
    && delivery.placeholder === "<StatusPlaceHolderImpl/>";
}

function validateUi(uiSources, bySource, project, issues, warnings) {
  const enabledSources = uiSources.filter((source) => source.status_ui?.enabled);
  if (Boolean(project?.features?.status_ui) !== (enabledSources.length > 0)) {
    issues.push(issue("/runtime/ui", "ui.lifecycle", "project.features.status_ui must match the enabled status UI sources"));
  }
  const runnable = uiSources.filter((source) => source.status_ui?.enabled
    && ["text", "embedded", "both"].includes(source.status_ui.mode)
    && completeUiDelivery(source.status_ui));
  if (runnable.length > 1) {
    issues.push(issue("/runtime/ui", "ui.delivery.collision", "Exactly one generated status UI may own the message projection"));
  }
  for (const [sourceIndex, source] of uiSources.entries()) {
    const ui = source.status_ui;
    if (!ui?.enabled) continue;
    const enabledMode = ["text", "embedded", "both"].includes(ui.mode);
    const generatedRequested = ui.delivery?.level === "embedded"
      || ui.delivery?.entrypoint === "generated"
      || ui.delivery?.artifact === "inline";
    if (enabledMode && generatedRequested && !completeUiDelivery(ui)) {
      issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/delivery`, "ui.runtime_missing", "Generated UI requires a complete supported message delivery contract"));
    } else if (enabledMode && !isObject(ui.delivery)) {
      issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/delivery`, "ui.runtime_missing", "Enabled UI requires a message delivery contract"));
    } else if (enabledMode && ui.delivery?.level !== "embedded") {
      const message = completeUiDelivery(ui)
        ? "The generated Tavern Helper message iframe is an optional advanced candidate only. Offline validation cannot prove iframe navigation or script execution; keep runtime evidence at not_run until the target host verifies its configured renderer transport and requested behavior"
        : `UI delivery level ${ui.delivery?.level} is a specification or unverified host dependency`;
      warnings.push(issue(`/runtime/ui/${sourceIndex}/status_ui/delivery/level`, "ui.runtime_not_run", message));
    }
    const baselineRegexCapability = ui.read_only === true
      && ui.refresh === "on_message"
      && (ui.commands ?? []).length === 0
      && ui.responsive?.narrow !== "tabs"
      && ui.responsive?.wide !== "tabs";
    if (enabledMode
      && completeUiDelivery(ui)
      && ui.delivery?.adapter === "tavern_helper_message"
      && baselineRegexCapability) {
      warnings.push(issue(
        `/runtime/ui/${sourceIndex}/status_ui/delivery/adapter`,
        "ui.regex_preferred",
        "This read-only on-message status UI fits the verified baseline contract; prefer embedded sillytavern_regex. Keep tavern_helper_message as an opt-in advanced host dependency",
      ));
    }
    const boundUiFields = new Map((ui.sections ?? []).flatMap((section) => (
      (section.fields ?? []).map((field) => [field.source_path, field])
    )));
    const textTemplate = String(ui.text_template ?? "");
    for (const match of textTemplate.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}/g)) {
      const field = boundUiFields.get(match[1]);
      if (!field) {
        issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/text_template`, "ui.summary_path", `Status summary path must also be a player-visible UI field: ${match[1]}`));
      } else if (field.format === "percent"
        && /^\s*%/.test(textTemplate.slice(match.index + match[0].length))) {
        issues.push(issue(
          `/runtime/ui/${sourceIndex}/status_ui/text_template`,
          "ui.percent_suffix",
          `format=percent already supplies the % suffix; remove the literal % after {{${match[1]}}}`,
        ));
      }
    }
    for (const [sectionIndex, section] of (ui.sections ?? []).entries()) {
      for (const [fieldIndex, field] of (section.fields ?? []).entries()) {
        const base = `/runtime/ui/${sourceIndex}/sections/${sectionIndex}/fields/${fieldIndex}`;
        const variable = bySource.get(field.source_path);
        if (!variable) {
          issues.push(issue(`${base}/source_path`, "ui.source_path", `UI field references an unknown variable: ${field.source_path}`));
          continue;
        }
        if (!(variable.readers ?? []).includes("status_ui")) issues.push(issue(`${base}/source_path`, "ui.reader", `Variable does not grant status UI read access: ${field.source_path}`));
        if (variable.visibility !== "player") issues.push(issue(`${base}/visibility`, "ui.visibility", `UI cannot expose non-player state: ${field.source_path}`));
        if (!uiTypeCompatible(field.format, variable.type)) issues.push(issue(`${base}/format`, "ui.format", `UI format ${field.format} is incompatible with ${variable.type}`));
      }
    }
    const writerIds = new Set([...bySource.values()].map((variable) => variable.writer?.id).filter(Boolean));
    if (completeUiDelivery(ui)
      && (ui.read_only !== true || (ui.commands ?? []).length > 0)) {
      issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/commands`, "ui.command", "The generated status projection is read-only; command execution requires a separately implemented message runtime"));
    }
    if (completeUiDelivery(ui) && (ui.refresh !== "on_message"
      || ui.responsive?.narrow === "tabs" || ui.responsive?.wide === "tabs")) {
      issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/delivery`, "ui.runtime_unimplemented", "The generated status projection currently supports on_message refresh without tabs"));
    }
    if (ui.read_only && (ui.commands ?? []).length > 0) {
      issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/commands`, "ui.command", "A read-only status UI cannot expose write commands"));
    }
    for (const [commandIndex, command] of (ui.commands ?? []).entries()) {
      const commandPath = `/runtime/ui/${sourceIndex}/commands/${commandIndex}`;
      if (!writerIds.has(command.writer_id)) issues.push(issue(`${commandPath}/writer_id`, "ui.writer", `UI command references an unknown writer: ${command.writer_id}`));
      if (command.channel === "script_api" && !/^(?:(?:globalThis|window)\.)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(command.payload)) {
        issues.push(issue(`${commandPath}/payload`, "ui.command", "script_api payload must be a safe dotted global function path"));
      }
      if (command.channel === "runtime_event" && !/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(command.payload)) {
        issues.push(issue(`${commandPath}/payload`, "ui.command", "runtime_event payload must be an event name"));
      }
    }
  }
}

function validateRuntimeDeliveries(mvuSources, uiSources, issues) {
  const entrypoints = new Map();
  const artifacts = new Map();
  const register = (registry, value, pathValue, label) => {
    if (typeof value !== "string" || value.length === 0) return;
    if (registry.has(value)) issues.push(issue(pathValue, "adapter.collision", `${label} collides with ${registry.get(value)}: ${value}`));
    else registry.set(value, pathValue);
  };
  for (const [sourceIndex, source] of mvuSources.entries()) {
    const adapter = source.runtime_contract?.adapter;
    if (!adapter) continue;
    const base = `/runtime/mvu/${sourceIndex}/runtime_contract/adapter`;
    if (adapter.delivery === "embedded") {
      register(entrypoints, adapter.entrypoint, `${base}/entrypoint`, "Adapter entrypoint");
      if (adapter.id !== "tavern_helper") {
        issues.push(issue(base, "adapter.unsupported", `No embedded adapter generator is registered for: ${adapter.id}`));
      } else if (adapter.entrypoint !== "rp_card_studio_runtime_guard") {
        issues.push(issue(`${base}/entrypoint`, "adapter.artifact", "Embedded Tavern Helper MVU uses the generated rp_card_studio_runtime_guard entrypoint"));
      }
    }
    if (adapter.id === "tavern_helper" && source.mvu?.enabled && (source.mvu.storage?.namespace ?? "stat_data") !== "stat_data") {
      issues.push(issue(`${base}/id`, "adapter.storage", "The Tavern Helper adapter supports only the stat_data storage namespace"));
    }
  }
  for (const [sourceIndex, source] of uiSources.entries()) {
    const ui = source.status_ui;
    if (!ui?.enabled || !["text", "embedded", "both"].includes(ui.mode) || !ui.delivery) continue;
    const base = `/runtime/ui/${sourceIndex}/status_ui/delivery`;
    if (completeUiDelivery(ui)) {
      register(entrypoints, ui.delivery.entrypoint, `${base}/entrypoint`, "Adapter entrypoint");
      register(artifacts, ui.delivery.artifact, `${base}/artifact`, "Adapter artifact");
      if (ui.delivery.entrypoint !== "generated") {
        issues.push(issue(`${base}/entrypoint`, "adapter.artifact", "Generated status UI entrypoint must be generated"));
      }
      if (ui.delivery.artifact !== "inline") {
        issues.push(issue(`${base}/artifact`, "adapter.artifact", "Generated status UI artifact must be inline"));
      }
      if (ui.delivery.surface !== "message") {
        issues.push(issue(`${base}/surface`, "adapter.surface", "Generated status UI must project into each assistant message"));
      }
      if (ui.delivery.placeholder !== "<StatusPlaceHolderImpl/>") {
        issues.push(issue(`${base}/placeholder`, "adapter.placeholder", "Generated status UI must use <StatusPlaceHolderImpl/>"));
      }
    }
  }
}

function validateHostRuntimeContracts(mvuSources, issues) {
  for (const [sourceIndex, source] of mvuSources.entries()) {
    const base = `/runtime/mvu/${sourceIndex}`;
    const mvu = source.mvu;
    const adapter = source.runtime_contract?.adapter;
    if (mvu?.enabled && mvu.update_mode !== "same_generation") {
      issues.push(issue(`${base}/mvu/update_mode`, "mvu.update_mode_unimplemented", "Enabled MVU currently supports same_generation only; extra_pass requires an independent request, parse, and commit chain"));
    }
    if (!mvu?.enabled && mvu?.update_mode !== "disabled") {
      issues.push(issue(`${base}/mvu/update_mode`, "mvu.update_mode_lifecycle", "Disabled MVU must use update_mode: disabled"));
    }
    if (mvu?.enabled && adapter?.id === "tavern_helper" && adapter.delivery === "embedded") {
      const storage = mvu.storage ?? {};
      const scope = storage.scope ?? "message";
      const snapshotSelector = storage.snapshot_selector ?? "current_message";
      if (scope !== "message" || !["current_message", "latest_message"].includes(snapshotSelector)) {
        issues.push(issue(`${base}/mvu/storage`, "adapter.storage_scope", "Embedded Tavern Helper MVU currently supports only message storage with current_message or latest_message snapshots"));
      }
    }
    if (!source.ejs?.enabled) continue;
    if (mvu?.enabled) {
      const storage = mvu.storage ?? {};
      const scope = storage.scope ?? "message";
      const namespace = storage.namespace ?? "stat_data";
      const snapshotSelector = storage.snapshot_selector ?? "current_message";
      if (scope !== "message" || namespace !== "stat_data"
        || !["current_message", "latest_message"].includes(snapshotSelector)) {
        issues.push(issue(
          `${base}/mvu/storage`,
          "ejs.storage_contract",
          "EJS linked to MVU currently supports only the stat_data namespace on the current/latest message snapshot",
        ));
      }
    }
    const dependencies = Array.isArray(source.runtime_contract?.dependencies) ? source.runtime_contract.dependencies : [];
    const ejsDependency = dependencies.find((dependency) => dependency?.id === "st_prompt_template");
    if (!ejsDependency
      || ejsDependency.class !== "host_required"
      || ejsDependency.version !== "1.17.6.8"
      || !/^(?:(?:globalThis|window)\.)?EjsTemplate$/.test(ejsDependency.readiness_probe ?? "")) {
      issues.push(issue(`${base}/runtime_contract/dependencies`, "ejs.dependency", "Enabled EJS requires the host ST-Prompt-Template 1.17.6.8 dependency with an EjsTemplate readiness probe"));
    }
    for (const [entryIndex, entry] of (source.ejs.entries ?? []).entries()) {
      if (entry.engine !== "st_prompt_template") {
        issues.push(issue(`${base}/ejs/entries/${entryIndex}/engine`, "ejs.engine", "EJS entries must use the st_prompt_template engine"));
      }
    }
  }
}

function validateStableIds(sources, issues) {
  for (const group of ["world", "characters", "systems", "scenes"]) {
    const seen = new Map();
    for (const [sourceIndex, source] of values(sources, group).entries()) {
      if (typeof source.id !== "string") continue;
      if (seen.has(source.id)) issues.push(issue(`/runtime/${group}/${sourceIndex}/id`, "identity.duplicate", `Duplicate ${group} id: ${source.id}`));
      else seen.set(source.id, sourceIndex);
    }
  }
  const sectionIds = new Set();
  for (const [sourceIndex, source] of values(sources, "ui").entries()) {
    for (const [sectionIndex, section] of (source.status_ui?.sections ?? []).entries()) {
      if (sectionIds.has(section.id)) issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/sections/${sectionIndex}/id`, "identity.duplicate", `Duplicate UI section id: ${section.id}`));
      sectionIds.add(section.id);
    }
  }
}

function referenceRegistry(project, sources) {
  const registry = new Map([...KNOWN_REFERENCE_PREFIXES].map((prefix) => [prefix, new Set()]));
  const add = (prefix, id) => {
    if (typeof id === "string" && id.length > 0) registry.get(prefix)?.add(id);
  };
  for (const source of values(sources, "positioning")) add("positioning", source.id);
  for (const material of project?.materials ?? []) add("material", material.id);
  for (const [prefix, group] of [["world", "world"], ["character", "characters"], ["system", "systems"], ["scene", "scenes"]]) {
    for (const source of values(sources, group)) add(prefix, source.id);
  }
  for (const source of values(sources, "prompts")) {
    for (const opening of source.openings ?? []) add("opening", opening.id);
  }
  for (const source of values(sources, "ui")) {
    for (const section of source.status_ui?.sections ?? []) add("ui", section.id);
  }
  for (const source of values(sources, "systems")) {
    for (const axis of source.axes ?? []) add("axis", axis.id);
  }
  for (const source of assemblySources(sources)) {
    for (const asset of source.media_manifest?.assets ?? []) add("media", asset.id);
  }
  return registry;
}

function validateKnownReference(reference, pathValue, registry, issues) {
  if (typeof reference !== "string") return false;
  const separator = reference.indexOf(":");
  if (separator <= 0) return false;
  const prefix = reference.slice(0, separator);
  const id = reference.slice(separator + 1);
  if (prefix === "player") return true;
  if (!KNOWN_REFERENCE_PREFIXES.has(prefix)) return false;
  if (!registry.get(prefix)?.has(id)) {
    issues.push(issue(pathValue, "reference.unresolved", `Reference does not resolve: ${reference}`));
  }
  return true;
}

function validateStrongReferences(project, sources, issues) {
  const registry = referenceRegistry(project, sources);
  const groupsWithSourceRefs = ["positioning", "world", "characters", "systems", "scenes", "prompts"];
  for (const group of groupsWithSourceRefs) {
    for (const [sourceIndex, source] of values(sources, group).entries()) {
      for (const [refIndex, reference] of (source.source_refs ?? []).entries()) {
        validateKnownReference(reference, `/runtime/${group}/${sourceIndex}/source_refs/${refIndex}`, registry, issues);
      }
    }
  }
  for (const [sourceIndex, source] of values(sources, "characters").entries()) {
    for (const [relationshipIndex, relationship] of (source.relationships ?? []).entries()) {
      validateKnownReference(relationship.target_ref, `/runtime/characters/${sourceIndex}/relationships/${relationshipIndex}/target_ref`, registry, issues);
    }
  }
  for (const [sourceIndex, source] of values(sources, "scenes").entries()) {
    validateKnownReference(source.context?.world_ref, `/runtime/scenes/${sourceIndex}/context/world_ref`, registry, issues);
    for (const [entranceIndex, entrance] of (source.entrances ?? []).entries()) {
      validateKnownReference(entrance.from_ref, `/runtime/scenes/${sourceIndex}/entrances/${entranceIndex}/from_ref`, registry, issues);
    }
    for (const [exitIndex, sceneExit] of (source.exits ?? []).entries()) {
      validateKnownReference(sceneExit.to_ref, `/runtime/scenes/${sourceIndex}/exits/${exitIndex}/to_ref`, registry, issues);
    }
    const zoneIds = new Set((source.zones ?? []).map((zone) => zone.id));
    for (const [zoneIndex, zone] of (source.zones ?? []).entries()) {
      for (const [connectionIndex, connection] of (zone.connections ?? []).entries()) {
        if (!zoneIds.has(connection)) {
          issues.push(issue(`/runtime/scenes/${sourceIndex}/zones/${zoneIndex}/connections/${connectionIndex}`, "reference.unresolved", `Zone connection does not resolve in scene ${source.id}: ${connection}`));
        }
      }
    }
  }
  for (const [sourceIndex, source] of values(sources, "systems").entries()) {
    for (const [axisIndex, axis] of (source.axes ?? []).entries()) {
      validateKnownReference(axis.subject, `/runtime/systems/${sourceIndex}/axes/${axisIndex}/subject`, registry, issues);
    }
  }
  for (const [sourceIndex, source] of values(sources, "mvu").entries()) {
    for (const [routeIndex, route] of (source.mvu?.routing?.entries ?? []).entries()) {
      validateKnownReference(route.source_ref, `/runtime/mvu/${sourceIndex}/routing/entries/${routeIndex}/source_ref`, registry, issues);
    }
    for (const [entryIndex, ejsEntry] of (source.ejs?.entries ?? []).entries()) {
      validateKnownReference(ejsEntry.source_ref, `/runtime/mvu/${sourceIndex}/ejs/entries/${entryIndex}/source_ref`, registry, issues);
    }
  }
}

function validateStateMachines(systemSources, project, sources, issues) {
  const runtimeAvailable = Boolean(project?.features?.mvu || project?.features?.ejs
    || values(sources, "mvu").some((source) => source.mvu?.enabled || source.ejs?.enabled));
  for (const [sourceIndex, source] of systemSources.entries()) {
    const axesById = new Map((source.axes ?? []).map((axis) => [axis.id, axis]));
    const axes = new Set(axesById.keys());
    const validateEffect = (effect, pathValue) => {
      const axisId = normalizeRefId(effect.axis_ref ?? effect.axis_id, "axis:");
      const axis = axesById.get(axisId);
      if (!axis) {
        issues.push(issue(`${pathValue}/axis_id`, "system.effect.reference", `Effect references an unknown axis: ${axisId}`));
        return;
      }
      if (!OPERATION_TYPES[effect.operation]?.has(axis.type)) {
        issues.push(issue(`${pathValue}/operation`, "system.effect.operation", `Operation ${effect.operation} is incompatible with axis type ${axis.type}`));
      }
      if (effect.value !== undefined && ["set", "add", "subtract"].includes(effect.operation)) {
        const expectedType = ["add", "subtract"].includes(effect.operation) ? "number" : axis.type;
        const typeMatches = expectedType === "number" ? typeof effect.value === "number" && Number.isFinite(effect.value) : valueMatchesType(effect.value, expectedType);
        if (!typeMatches || (effect.operation === "set" && !valueMatchesConstraints(effect.value, axis))) {
          issues.push(issue(`${pathValue}/value`, "system.effect.value", `Effect value does not satisfy axis ${axis.id}`));
        }
      }
    };
    for (const [axisIndex, axis] of (source.axes ?? []).entries()) {
      if (!valueMatchesType(axis.initial, axis.type) || !valueMatchesConstraints(axis.initial, axis)) {
        issues.push(issue(`/runtime/systems/${sourceIndex}/axes/${axisIndex}/initial`, "system.axis.value", `Axis initial value does not satisfy ${axis.id}`));
      }
      for (const [updateIndex, update] of (axis.updates ?? []).entries()) validateEffect({ ...update, axis_id: axis.id }, `/runtime/systems/${sourceIndex}/axes/${axisIndex}/updates/${updateIndex}`);
    }
    for (const [ruleIndex, rule] of (source.rules ?? []).entries()) {
      for (const [effectIndex, effect] of (rule.effects ?? []).entries()) validateEffect(effect, `/runtime/systems/${sourceIndex}/rules/${ruleIndex}/effects/${effectIndex}`);
    }
    for (const [machineIndex, machine] of (source.state_machines ?? []).entries()) {
      const base = `/runtime/systems/${sourceIndex}/state_machines/${machineIndex}`;
      const axisId = normalizeRefId(machine.axis_ref ?? machine.axis_id ?? machine.state_axis_id, "axis:");
      if (axisId && !axes.has(axisId)) issues.push(issue(`${base}/axis_ref`, "system.state_machine.reference", `State machine references an unknown axis: ${axisId}`));
      const stateAxis = axesById.get(axisId);
      if (stateAxis && !["string", "enum"].includes(stateAxis.type)) issues.push(issue(`${base}/state_axis_id`, "system.state_machine.contract", `State machine axis must be string or enum: ${axisId}`));
      if (machine.enforcement === "runtime_required" && !runtimeAvailable) issues.push(issue(`${base}/enforcement`, "system.state_machine.runtime", "runtime_required state machines need MVU/EJS or an equivalent enabled runtime"));
      const states = new Set();
      for (const [stateIndex, state] of (machine.states ?? []).entries()) {
        if (states.has(state.id)) issues.push(issue(`${base}/states/${stateIndex}/id`, "system.state_machine.reference", `Duplicate state: ${state.id}`));
        states.add(state.id);
        for (const [effectIndex, effect] of [...state.entry ?? [], ...state.entry_effects ?? [], ...state.exit ?? [], ...state.exit_effects ?? []].entries()) {
          validateEffect(effect, `${base}/states/${stateIndex}/effects/${effectIndex}`);
        }
      }
      const initial = normalizeRefId(machine.initial_state_ref ?? machine.initial_state_id ?? machine.initial_state ?? machine.initial, "state:");
      if (initial && !states.has(initial)) issues.push(issue(`${base}/initial_state_ref`, "system.state_machine.reference", `Unknown initial state: ${initial}`));
      if (stateAxis && initial && stateAxis.initial !== undefined && stateAxis.initial !== initial) {
        issues.push(issue(`${base}/initial_state`, "system.state_machine.reference", `State machine initial state does not match axis ${axisId}`));
      }
      if (stateAxis && Array.isArray(stateAxis.constraints?.values)) {
        for (const stateId of states) if (!stateAxis.constraints.values.includes(stateId)) issues.push(issue(`${base}/states`, "system.state_machine.contract", `Axis constraints do not include state: ${stateId}`));
        for (const value of stateAxis.constraints.values) if (!states.has(value)) issues.push(issue(`${base}/states`, "system.state_machine.contract", `Axis constraint has no machine state: ${value}`));
      }
      const transitionIds = new Set();
      for (const [transitionIndex, transition] of (machine.transitions ?? []).entries()) {
        if (transitionIds.has(transition.id)) issues.push(issue(`${base}/transitions/${transitionIndex}/id`, "system.state_machine.reference", `Duplicate transition: ${transition.id}`));
        transitionIds.add(transition.id);
        const rawFrom = transition.from_ref ?? transition.from_state ?? transition.from;
        const fromStates = (Array.isArray(rawFrom) ? rawFrom : [rawFrom]).map((value) => normalizeRefId(value, "state:")).filter(Boolean);
        const to = normalizeRefId(transition.to_ref ?? transition.to_state ?? transition.to, "state:");
        for (const from of fromStates) {
          if (from !== "*" && !states.has(from)) issues.push(issue(`${base}/transitions/${transitionIndex}/from`, "system.state_machine.reference", `Transition starts at an unknown state: ${from}`));
        }
        if (to && !states.has(to)) issues.push(issue(`${base}/transitions/${transitionIndex}/to`, "system.state_machine.reference", `Transition ends at an unknown state: ${to}`));
        for (const [effectIndex, effect] of (transition.effects ?? []).entries()) {
          validateEffect(effect, `${base}/transitions/${transitionIndex}/effects/${effectIndex}`);
        }
      }
      if (initial && states.has(initial)) {
        const reachable = new Set([initial]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const transition of machine.transitions ?? []) {
            const rawFrom = transition.from_ref ?? transition.from_state ?? transition.from;
            const fromStates = (Array.isArray(rawFrom) ? rawFrom : [rawFrom]).map((value) => normalizeRefId(value, "state:")).filter(Boolean);
            const to = normalizeRefId(transition.to_ref ?? transition.to_state ?? transition.to, "state:");
            if (to && !reachable.has(to) && (fromStates.includes("*") || fromStates.some((from) => reachable.has(from)))) {
              reachable.add(to);
              changed = true;
            }
          }
        }
        for (const stateId of states) if (!reachable.has(stateId)) issues.push(issue(`${base}/states`, "system.state_machine.reachability", `State is unreachable from ${initial}: ${stateId}`));
      }
      const resets = [...machine.resets ?? [], ...machine.reset ? [machine.reset] : []];
      for (const [resetIndex, reset] of resets.entries()) {
        const to = normalizeRefId(reset.to_ref ?? reset.to_state ?? reset.to, "state:");
        if (to && !states.has(to)) issues.push(issue(`${base}/resets/${resetIndex}/to`, "system.state_machine.reference", `Reset ends at an unknown state: ${to}`));
        for (const [effectIndex, effect] of (reset.effects ?? []).entries()) {
          validateEffect(effect, `${base}/resets/${resetIndex}/effects/${effectIndex}`);
        }
      }
    }
  }
}

function assemblySources(sources) {
  return values(sources, "assembly");
}

function normalizeAssemblySelector(value) {
  if (typeof value !== "string" || value === "") return "";
  return value.startsWith("/") ? value : `/${value}`;
}

function resolveRegisteredAssemblySource(source, sources) {
  if (!isObject(source) || !["registered_source", "path"].includes(source.kind)) return null;
  const rawReference = source.ref ?? source.source_ref ?? source.path;
  if (typeof rawReference !== "string") return null;
  const [reference, inlinePointer] = rawReference.split("#/");
  const selector = normalizeAssemblySelector(source.selector ?? (inlinePointer === undefined ? "" : inlinePointer));
  for (const [group, sourceEntries] of Object.entries(sources ?? {})) {
    const direct = sourceEntries.find((entry) => entry.relativePath === reference);
    if (direct) return { relativePath: direct.relativePath, group, selector, sourceEntry: direct };
  }
  const match = /^([a-z_]+):([a-z][a-z0-9_]*)$/.exec(reference);
  if (!match) return null;
  const [, rawGroup, id] = match;
  const groupAliases = { character: "characters", system: "systems", scene: "scenes", prompt: "prompts" };
  const group = groupAliases[rawGroup] ?? rawGroup;
  const sourceEntry = entries(sources, group).find((entry) => entry.value?.id === id);
  return sourceEntry ? { relativePath: sourceEntry.relativePath, group, selector, sourceEntry } : null;
}

function requiredCharacterBookSources(sources, project) {
  const records = [];
  const add = (group, label, sourceEntries, displayNameOverride = null) => {
    for (const sourceEntry of sourceEntries) {
      const displayName = displayNameOverride
        ?? sourceEntry.value?.display_name
        ?? sourceEntry.value?.openings?.[0]?.display_name
        ?? sourceEntry.value?.id
        ?? sourceEntry.relativePath;
      const projection = projectModelSource(group, sourceEntry.value);
      const semanticPointers = semanticLeafPointers(projection);
      if (semanticPointers.length === 0) continue;
      records.push({
        relativePath: sourceEntry.relativePath,
        label: `${label}：${displayName}`,
        group,
        semanticPointers,
      });
    }
  };
  add("positioning", "项目定位", entries(sources, "positioning"), project?.project?.display_name ?? null);
  add("world", "世界设定", entries(sources, "world"));
  add("character", "人物档案", entries(sources, "characters"));
  add("system", "系统规则", entries(sources, "systems"));
  add("scene", "场景资料", entries(sources, "scenes"));
  add("prompt", "叙事与对白", entries(sources, "prompts"));
  return records;
}

function selectorCoversPointer(selector, pointer) {
  // Selected fragments are wrapped with their module identity when materialized,
  // so any reachable selector also carries these root identity fields.
  if (pointer === "/id" || pointer === "/display_name") return true;
  return selector === "" || selector === pointer || pointer.startsWith(`${selector}/`);
}

function assemblyRegistrations(manifest, sources) {
  return (manifest?.entries ?? []).map((entry, entryIndex) => ({
    entry,
    entryIndex,
    resolved: resolveRegisteredAssemblySource(entry.source, sources),
  })).filter((record) => record.resolved);
}

function validateCharacterBookCoverage(manifest, sources, base, issues, project) {
  const registrations = assemblyRegistrations(manifest, sources)
    .filter(({ entry }) => entry.enabled === true && entry.probability > 0);
  for (const required of requiredCharacterBookSources(sources, project)) {
    const selectors = registrations
      .filter(({ resolved }) => resolved.relativePath === required.relativePath)
      .map(({ resolved }) => resolved.selector);
    const missingPointers = required.semanticPointers
      .filter((pointer) => !selectors.some((selector) => selectorCoversPointer(selector, pointer)));
    const covered = missingPointers.length === 0;
    if (covered) continue;
    const missingHint = [...new Set(missingPointers.map((pointer) => pointer.split("/").slice(0, 3).join("/")))]
      .slice(0, 8)
      .join("、");
    const firstMissingRoot = missingPointers[0]?.split("/").slice(0, 2).join("/") ?? "";
    const sourceHint = `${required.relativePath}${firstMissingRoot ? `#${firstMissingRoot}` : ""}`;
    issues.push(issue(
      `${base}/worldbook_manifest/entries`,
      "assembly.coverage",
      `世界书装配未完整覆盖 ${required.label}（${sourceHint}；缺少 ${missingHint}）；可用一个整源条目或多个 selector 条目联合覆盖，并分别明确触发、插入、深度、顺序、概率与递归策略`,
    ));
  }
}

function validateSingleCharacterEntry(manifest, sources, base, issues) {
  const positioning = entries(sources, "positioning")
    .find((sourceEntry) => sourceEntry.value?.status === "locked")?.value
    ?? entries(sources, "positioning")[0]?.value;
  if (positioning?.card_mode !== "single_character_card") return;
  const registrations = assemblyRegistrations(manifest, sources);
  const primaries = entries(sources, "characters")
    .filter((sourceEntry) => sourceEntry.value?.role === "primary_character");
  for (const primary of primaries) {
    const roots = registrations.filter(({ resolved }) => (
      resolved.relativePath === primary.relativePath && resolved.selector === ""
    ));
    const stable = roots.find(({ entry }) => (
      entry.enabled === true
      && entry.activation?.mode === "constant"
      && entry.probability === 100
      && entry.ignore_budget === true
    ));
    if (stable) continue;
    const displayName = primary.value?.display_name ?? primary.value?.id ?? primary.relativePath;
    issues.push(issue(
      `${base}/worldbook_manifest/entries`,
      "assembly.single_character",
      `真正单人卡的唯一角色“${displayName}”必须由一个整源、启用、常驻、100% 概率且 ignore_budget=true 的独立条目承载，避免每轮唯一角色定义被关键词、随机概率或世界书预算丢弃`,
    ));
  }
}

function fallbackAssetId(asset) {
  const raw = asset.fallback_ref ?? asset.fallback?.asset_ref ?? asset.fallback?.ref ?? asset.fallback;
  if (typeof raw !== "string" || ["skip", "none", "text", "omit", "block", "include"].includes(raw)) return null;
  return normalizeRefId(normalizeRefId(raw, "asset:"), "media:");
}

function mediaDigest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function mediaMimeMatches(buffer, mimeType) {
  const ascii = (start, end) => buffer.subarray(start, end).toString("ascii");
  const hex = (start, end) => buffer.subarray(start, end).toString("hex");
  const checks = {
    "image/png": () => hex(0, 8) === "89504e470d0a1a0a",
    "image/jpeg": () => hex(0, 2) === "ffd8",
    "image/gif": () => ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
    "image/webp": () => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
    "audio/ogg": () => ascii(0, 4) === "OggS",
    "audio/wav": () => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE",
    "video/mp4": () => ascii(4, 8) === "ftyp",
    "video/webm": () => hex(0, 4) === "1a45dfa3",
    "font/woff": () => ascii(0, 4) === "wOFF",
    "font/woff2": () => ascii(0, 4) === "wOF2",
    "font/ttf": () => hex(0, 4) === "00010000",
    "font/otf": () => ascii(0, 4) === "OTTO"
  };
  return checks[mimeType] ? checks[mimeType]() : true;
}

async function resolveMediaBytes(asset, sources, projectRoot) {
  const source = asset.source ?? asset;
  if (source.kind === "file") return readFile(resolveWithin(projectRoot, source.path));
  if (["registered_source", "inline"].includes(source.kind)) {
    return Buffer.from(await resolveAssemblyContent(source, sources, projectRoot), "utf8");
  }
  throw new Error(`Media source cannot be embedded: ${source.kind ?? "missing"}`);
}

function validateMediaBytes(asset, buffer, pathValue, issues) {
  if (asset.mime_type && !mediaMimeMatches(buffer, asset.mime_type)) {
    issues.push(issue(`${pathValue}/mime_type`, "media.mime", `Media bytes do not match declared MIME type: ${asset.mime_type}`));
  }
  if (asset.integrity?.bytes !== undefined && asset.integrity.bytes !== buffer.length) {
    issues.push(issue(`${pathValue}/integrity/bytes`, "media.integrity", `Media byte count mismatch: expected ${asset.integrity.bytes}, received ${buffer.length}`));
  }
  if (asset.integrity?.sha256 && asset.integrity.sha256 !== mediaDigest(buffer)) {
    issues.push(issue(`${pathValue}/integrity/sha256`, "media.integrity", "Media SHA-256 digest does not match"));
  }
}

async function materializeMediaManifest(mediaManifest, sources, projectRoot) {
  const manifest = clone(mediaManifest ?? { enabled: false, assets: [] });
  const issues = [];
  if (!manifest.enabled) return { manifest, issues };
  for (const [assetIndex, asset] of (manifest.assets ?? []).entries()) {
    if (asset.delivery !== "embedded") continue;
    const pathValue = `/runtime/assembly/0/media_manifest/assets/${assetIndex}`;
    try {
      const originalSource = clone(asset.source);
      const bytes = await resolveMediaBytes(asset, sources, projectRoot);
      validateMediaBytes(asset, bytes, pathValue, issues);
      asset.source = {
        kind: "embedded",
        encoding: "base64",
        data: bytes.toString("base64")
      };
      asset.integrity = { sha256: mediaDigest(bytes), bytes: bytes.length };
      asset.extensions = isObject(asset.extensions) ? asset.extensions : {};
      asset.extensions.rp_card_studio = {
        ...(isObject(asset.extensions.rp_card_studio) ? asset.extensions.rp_card_studio : {}),
        original_source: originalSource
      };
    } catch (error) {
      issues.push(issue(`${pathValue}/source`, "media.embed", error.message));
    }
  }
  return { manifest, issues };
}

function validatePresentations(openingSources, assemblies, issues) {
  const mediaAssets = new Map(assemblies.flatMap((assembly) => assembly.media_manifest?.enabled ? assembly.media_manifest.assets ?? [] : []).map((asset) => [asset.id, asset]));
  const mediaIds = new Set(mediaAssets.keys());
  for (const [sourceIndex, source] of openingSources.entries()) {
    for (const [openingIndex, opening] of (source.openings ?? []).entries()) {
      if (!opening.presentations) continue;
      const variants = opening.presentations.variants ?? [];
      const ids = new Set();
      for (const [variantIndex, variant] of variants.entries()) {
        if (ids.has(variant.id)) issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations/variants/${variantIndex}/id`, "opening.presentation.reference", `Duplicate presentation variant: ${variant.id}`));
        ids.add(variant.id);
      }
      if (!ids.has(opening.presentations.default_variant_id)) {
        issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations/default_variant_id`, "opening.presentation.reference", `Default presentation variant does not exist: ${opening.presentations.default_variant_id}`));
      }
      for (const [variantIndex, variant] of variants.entries()) {
        const fallback = normalizeRefId(variant.fallback_variant_ref, "presentation:");
        if (fallback && !ids.has(fallback)) issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations/variants/${variantIndex}/fallback_variant_ref`, "opening.presentation.reference", `Presentation fallback does not exist: ${variant.fallback_variant_ref}`));
        for (const mediaRef of variant.media_refs ?? []) {
          const mediaId = normalizeRefId(mediaRef, "media:");
          if (!mediaIds.has(mediaId)) {
            issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations/variants/${variantIndex}/media_refs`, "media.reference", `Presentation media does not exist in an enabled media manifest: ${mediaRef}`));
          } else {
            const expectedRef = `opening:${opening.id}`;
            const expectedSlot = `presentation.${variant.id}.`;
            const consumers = mediaAssets.get(mediaId).consumers ?? [];
            if (!consumers.some((consumer) => consumer.ref === expectedRef && consumer.slot.startsWith(expectedSlot) && consumer.slot.length > expectedSlot.length)) {
              issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations/variants/${variantIndex}/media_refs`, "media.reference", `Presentation media ${mediaRef} must declare consumer ${expectedRef} with a ${expectedSlot}* slot`));
            }
          }
        }
      }
      const fallbacks = new Map(variants.map((variant) => [variant.id, normalizeRefId(variant.fallback_variant_ref, "presentation:")]).filter(([, fallback]) => fallback));
      for (const id of fallbacks.keys()) {
        const seen = new Set();
        let current = id;
        while (fallbacks.has(current)) {
          if (seen.has(current)) {
            issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations`, "opening.presentation.reference", `Presentation fallback cycle includes: ${current}`));
            break;
          }
          seen.add(current);
          current = fallbacks.get(current);
        }
      }
      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      const isTextTerminal = (variant) => variant?.mode === "prose"
        && (variant.media_refs ?? []).length === 0
        && variant.delivery === "builtin";
      for (const [variantIndex, variant] of variants.entries()) {
        if (isTextTerminal(variant)) continue;
        const seen = new Set();
        let current = variant;
        let resolved = false;
        while (current && !seen.has(current.id)) {
          if (isTextTerminal(current)) { resolved = true; break; }
          seen.add(current.id);
          const fallbackId = normalizeRefId(current.fallback_variant_ref, "presentation:");
          current = fallbackId ? byId.get(fallbackId) : null;
        }
        if (!resolved) {
          issues.push(issue(`/runtime/openings/${sourceIndex}/${openingIndex}/presentations/variants/${variantIndex}/fallback_variant_ref`, "opening.presentation.reference", `Presentation variant does not resolve to a builtin prose fallback: ${variant.id}`));
        }
      }
    }
  }
}

function worldbookHostIssues(manifest, target, basePath = "/runtime/assembly") {
  const issues = [];
  if (manifest?.scan_depth !== undefined && manifest.scan_depth !== null) {
    issues.push(issue(`${basePath}/worldbook_manifest/scan_depth`, "assembly.host.unsupported", "SillyTavern does not consume per-book scan_depth; configure the host global setting instead"));
  }
  if (manifest?.token_budget !== undefined && manifest.token_budget !== null) {
    issues.push(issue(`${basePath}/worldbook_manifest/token_budget`, "assembly.host.unsupported", "SillyTavern does not consume per-book token_budget; configure the host global setting instead"));
  }
  if (manifest?.recursive_scanning === true) {
    issues.push(issue(`${basePath}/worldbook_manifest/recursive_scanning`, "assembly.host.unsupported", "SillyTavern does not consume per-book recursive_scanning; configure the host global setting instead"));
  }
  const displayNames = new Map();
  const insertionOrders = new Map();
  for (const [entryIndex, entry] of (manifest?.entries ?? []).entries()) {
    const entryPath = `${basePath}/worldbook_manifest/entries/${entryIndex}`;
    const requireFields = (value, fields, pathValue, rule) => {
      for (const field of fields) {
        if (!isObject(value) || !Object.hasOwn(value, field)) {
          issues.push(issue(`${pathValue}/${field}`, rule, `世界书条目必须显式决定 ${field}`));
        }
      }
    };
    requireFields(entry.activation, ["mode", "primary_keys", "secondary_keys", "selective", "logic", "case_sensitive", "match_whole_words"], `${entryPath}/activation`, "assembly.activation");
    requireFields(entry.insertion, ["position", "order", "depth", "role"], `${entryPath}/insertion`, "assembly.insertion");
    requireFields(entry.recursion, ["prevent_incoming", "prevent_outgoing", "delay_until_recursion"], `${entryPath}/recursion`, "assembly.recursion");
    if (!Object.hasOwn(entry, "probability")) {
      issues.push(issue(`${entryPath}/probability`, "assembly.probability", "世界书条目必须显式决定触发概率"));
    }
    if (!Object.hasOwn(entry, "scan_depth")) {
      issues.push(issue(`${entryPath}/scan_depth`, "assembly.scan_depth", "世界书条目必须显式决定扫描深度；继承宿主全局值时填写 null"));
    }
    if (entry.ignore_budget !== undefined && typeof entry.ignore_budget !== "boolean") {
      issues.push(issue(`${entryPath}/ignore_budget`, "assembly.ignore_budget", "ignore_budget 必须是布尔值"));
    }
    const displayName = typeof entry.display_name === "string" ? entry.display_name.trim() : "";
    if (!displayName) {
      issues.push(issue(`${entryPath}/display_name`, "assembly.entry_name", "每个世界书条目都必须有明确的用户可见名称"));
    } else if (displayNames.has(displayName)) {
      issues.push(issue(`${entryPath}/display_name`, "assembly.entry_name", `世界书条目名称重复：${displayName}`));
    } else {
      displayNames.set(displayName, entryIndex);
    }
    const activation = entry.activation ?? {};
    const primaryKeys = activation.primary_keys ?? [];
    const secondaryKeys = activation.secondary_keys ?? [];
    if (activation.mode === "constant" && (primaryKeys.length > 0 || secondaryKeys.length > 0 || activation.selective === true)) {
      issues.push(issue(`${entryPath}/activation`, "assembly.activation", "常驻条目不得同时声明关键词或二级筛选；请明确选择常驻或关键词触发"));
    }
    if (activation.mode === "keywords" && primaryKeys.length === 0) {
      issues.push(issue(`${entryPath}/activation/primary_keys`, "assembly.activation", "关键词条目至少需要一个主关键词"));
    }
    if (activation.selective === true && secondaryKeys.length === 0) {
      issues.push(issue(`${entryPath}/activation/secondary_keys`, "assembly.activation", "启用二级筛选时至少需要一个二级关键词"));
    }
    if (activation.selective !== true && secondaryKeys.length > 0) {
      issues.push(issue(`${entryPath}/activation/selective`, "assembly.activation", "存在二级关键词时必须显式启用 selective"));
    }
    const insertion = entry.insertion ?? {};
    if (insertion.position === "at_depth") {
      if (!Number.isInteger(insertion.depth)) {
        issues.push(issue(`${entryPath}/insertion/depth`, "assembly.insertion", "at_depth 条目必须明确非负整数深度"));
      }
      if (!insertion.role) {
        issues.push(issue(`${entryPath}/insertion/role`, "assembly.insertion", "at_depth 条目必须明确 system、user 或 assistant 角色"));
      }
    } else if (insertion.depth !== null && insertion.depth !== undefined) {
      issues.push(issue(`${entryPath}/insertion/depth`, "assembly.insertion", "非 at_depth 条目的 depth 应显式设为 null"));
    }
    if (Number.isInteger(insertion.order)) {
      if (insertionOrders.has(insertion.order)) {
        issues.push(issue(`${entryPath}/insertion/order`, "assembly.order", `世界书插入顺序重复：${insertion.order}`));
      } else {
        insertionOrders.set(insertion.order, entryIndex);
      }
    }
    const recursion = entry.recursion ?? {};
    const delay = recursion.delay_until_recursion;
    const validDelay = typeof delay === "boolean"
      || (Number.isInteger(delay) && delay >= 1 && delay <= 10000);
    if (delay !== undefined && !validDelay) {
      issues.push(issue(`${entryPath}/recursion/delay_until_recursion`, "assembly.recursion", "delay_until_recursion 必须是布尔值或 1..10000 的递归层级"));
    }
    if (delay !== false && delay !== undefined && recursion.prevent_incoming === true) {
      issues.push(issue(`${entryPath}/recursion`, "assembly.recursion", "条目同时延迟到递归阶段并禁止递归进入，将永远无法触发"));
    }
    if (entry.recipient !== undefined && entry.recipient !== "shared") {
      issues.push(issue(`${entryPath}/recipient`, "assembly.host.unsupported", "SillyTavern worldbook entries do not route to plot/update recipients; use shared"));
    }
    if (entry.visibility !== undefined && entry.visibility !== "model") {
      issues.push(issue(`${entryPath}/visibility`, "assembly.visibility.unsupported", "SillyTavern has no isolated player/GM worldbook channel; only model visibility is safe without a router"));
    }
    if (entry.token_budget !== undefined && entry.token_budget !== null) {
      issues.push(issue(`${entryPath}/token_budget`, "assembly.host.unsupported", "SillyTavern has no per-entry numeric token budget"));
    }
    if (entry.scan_depth !== undefined && entry.scan_depth !== null && (!Number.isInteger(entry.scan_depth) || entry.scan_depth < 0 || entry.scan_depth > 1000)) {
      issues.push(issue(`${entryPath}/scan_depth`, "assembly.host.range", "SillyTavern entry scan_depth must be null or an integer from 0 through 1000"));
    }
    if (entry.fallback !== undefined && !["skip", "block"].includes(entry.fallback)) {
      issues.push(issue(`${entryPath}/fallback`, "assembly.fallback.unsupported", "Worldbook fallback must be skip or block; include has no deterministic replacement content"));
    }
    if (target === "character" && entry.character_filter) {
      issues.push(issue(`${entryPath}/character_filter`, "assembly.host.unsupported", "Embedded character books do not preserve SillyTavern characterFilter; use a standalone worldbook"));
    }
  }
  return issues;
}

async function validateAssembly(sources, projectRoot, issues, warnings, target, project) {
  const assemblies = assemblySources(sources);
  if (assemblies.length > 1) {
    issues.push(issue("/runtime/assembly", "assembly.configuration", "Exactly one assembly source may own the integration manifest"));
  }
  for (const [sourceIndex, assembly] of assemblies.entries()) {
    const manifest = assembly.worldbook_manifest;
    issues.push(...worldbookHostIssues(manifest, target, `/runtime/assembly/${sourceIndex}`));
    const enabledEntries = (manifest?.entries ?? []).filter((entry) => entry?.enabled !== false);
    const contentEntries = enabledEntries.filter((entry) => entry?.activation?.mode === "keywords");
    if (contentEntries.length >= 3 && contentEntries.every((entry) => (
      entry?.recursion?.prevent_incoming === true && entry?.recursion?.prevent_outgoing === true
    ))) {
      warnings.push(issue(
        `/runtime/assembly/${sourceIndex}/worldbook_manifest/entries`,
        "assembly.recursion_network",
        "Every keyword-driven content entry blocks recursion in both directions; related people, places, factions, and clues cannot activate one another"
      ));
    }
    validateCharacterBookCoverage(manifest, sources, `/runtime/assembly/${sourceIndex}`, issues, project);
    if (target === "character") {
      validateSingleCharacterEntry(manifest, sources, `/runtime/assembly/${sourceIndex}`, issues);
    }
    const ids = new Set();
    for (const [entryIndex, entry] of (manifest?.entries ?? []).entries()) {
      if (ids.has(entry.id)) issues.push(issue(`/runtime/assembly/${sourceIndex}/worldbook_manifest/entries/${entryIndex}/id`, "assembly.reference", `Duplicate worldbook entry id: ${entry.id}`));
      ids.add(entry.id);
      try {
        await resolveWorldbookContent(entry.source, sources, projectRoot);
      } catch (error) {
        const sourceIssue = issue(`/runtime/assembly/${sourceIndex}/worldbook_manifest/entries/${entryIndex}/source`, entry.fallback === "skip" ? "assembly.source.skipped" : "assembly.source", error.message);
        (entry.fallback === "skip" ? warnings : issues).push(sourceIssue);
      }
    }
    const media = assembly.media_manifest;
    if (!media?.enabled) continue;
    const assets = new Map();
    for (const [assetIndex, asset] of (media.assets ?? []).entries()) {
      if (assets.has(asset.id)) issues.push(issue(`/runtime/assembly/${sourceIndex}/media_manifest/assets/${assetIndex}/id`, "media.reference", `Duplicate media asset id: ${asset.id}`));
      assets.set(asset.id, asset);
      const source = asset.source ?? asset;
      const sourceKind = source.kind ?? "file";
      const localPath = source.path ?? asset.path;
      const assetPath = `/runtime/assembly/${sourceIndex}/media_manifest/assets/${assetIndex}`;
      if (asset.delivery === "remote" && sourceKind !== "url") {
        issues.push(issue(`${assetPath}/source`, "media.delivery", "Remote media delivery requires an HTTPS URL source"));
      }
      if (["file", "registered_source", "inline"].includes(sourceKind) && asset.delivery !== "embedded") {
        issues.push(issue(`${assetPath}/delivery`, "media.delivery", `Workspace media source ${sourceKind} must be embedded before delivery`));
      }
      if (sourceKind === "url" && (typeof source.url !== "string" || !source.url.startsWith("https://"))) {
        issues.push(issue(`${assetPath}/source/url`, "media.delivery", "Remote media URLs must use HTTPS"));
      }
      if (sourceKind === "file" && typeof localPath === "string") {
        try {
          const info = await stat(resolveWithin(projectRoot, localPath));
          if (!info.isFile()) throw new Error(`Media asset is not a file: ${localPath}`);
          const bytes = await readFile(resolveWithin(projectRoot, localPath));
          validateMediaBytes(asset, bytes, assetPath, issues);
        } catch (error) {
          issues.push(issue(`${assetPath}/source`, "media.file", error.message));
        }
      } else if (["registered_source", "inline"].includes(sourceKind)) {
        try {
          const bytes = Buffer.from(await resolveAssemblyContent(source, sources, projectRoot), "utf8");
          validateMediaBytes(asset, bytes, assetPath, issues);
        } catch (error) {
          issues.push(issue(`${assetPath}/source`, "media.reference", error.message));
        }
      } else if (asset.delivery === "embedded") {
        issues.push(issue(`${assetPath}/source`, "media.embed", "Embedded media requires a local, registered, or inline source"));
      }
    }
    const graph = new Map();
    for (const [id, asset] of assets) {
      const fallback = fallbackAssetId(asset);
      if (!fallback) continue;
      if (!assets.has(fallback)) issues.push(issue(`/runtime/assembly/${sourceIndex}/media_manifest/assets`, "media.reference", `Media fallback does not exist: ${fallback}`));
      graph.set(id, fallback);
    }
    for (const id of graph.keys()) {
      const seen = new Set();
      let current = id;
      while (graph.has(current)) {
        if (seen.has(current)) {
          issues.push(issue(`/runtime/assembly/${sourceIndex}/media_manifest/assets`, "media.reference", `Media fallback cycle includes: ${current}`));
          break;
        }
        seen.add(current);
        current = graph.get(current);
      }
    }
  }
}

function runtimeAssemblyTarget(project) {
  if (project?.project?.target === "worldbook" || project?.target === "worldbook") return "worldbook";
  if (project?.project?.target === "character_card" || project?.target === "character_card") return "character";
  const deliverables = Array.isArray(project?.deliverables) ? project.deliverables : [];
  return deliverables.some((item) => item === "character_card_json" || item === "character_card_png") ? "character" : "worldbook";
}

export async function validateRuntimeSources({ project, sources, projectRoot }) {
  const issues = [];
  const warnings = [];
  const mvuSources = values(sources, "mvu");
  const openingSources = values(sources, "prompts");
  const uiSources = values(sources, "ui");
  const anyRuntimeSource = mvuSources.length > 0 || openingSources.length > 0 || uiSources.length > 0;
  if (anyRuntimeSource || project?.features?.mvu || project?.features?.ejs || project?.features?.status_ui) {
    const graph = validateVariables(mvuSources, issues);
    validateInitializations(mvuSources, openingSources, graph.bySource, issues, warnings);
    validateUi(uiSources, graph.bySource, project, issues, warnings);
    validateRuntimeDeliveries(mvuSources, uiSources, issues);
    validateHostRuntimeContracts(mvuSources, issues);
    validateStateBindings(sources, graph.bySource, issues);
  }
  validateStableIds(sources, issues);
  validateStrongReferences(project, sources, issues);
  validateOpeningReferences(sources, openingSources, project, issues);
  validatePresentations(openingSources, assemblySources(sources), issues);
  validateMediaConsumers(sources, issues);
  validateStateMachines(values(sources, "systems"), project, sources, issues);
  const projectTarget = runtimeAssemblyTarget(project);
  if (projectTarget === "character" && project?.features?.mvu === true) {
    for (const [sourceIndex, source] of mvuSources.entries()) {
      if (!source.mvu?.enabled) continue;
      const adapter = source.runtime_contract?.adapter;
      if (adapter?.id !== "tavern_helper" || adapter.delivery !== "embedded") {
        issues.push(issue(
          `/runtime/mvu/${sourceIndex}/runtime_contract/adapter`,
          "mvu.runtime_delivery",
          "MVU character-card delivery requires the embedded Tavern Helper adapter so Forge can include the pinned engine, generated schema registrar, and runtime guard"
        ));
      }
    }
  }
  await validateAssembly(sources, projectRoot, issues, warnings, projectTarget, project);
  return { issues, warnings };
}

async function resolveAssemblyContent(source, sources, projectRoot) {
  if (!isObject(source)) throw new Error("Worldbook entry source must be an object");
  if (source.kind === "inline") {
    if (typeof source.content !== "string") throw new Error("Inline worldbook source requires content");
    return source.content;
  }
  if (source.kind === "file" || (!source.kind && typeof source.path === "string")) {
    return readFile(resolveWithin(projectRoot, source.path), "utf8");
  }
  if (source.kind === "path" || source.kind === "registered_source") {
    const reference = source.ref ?? source.source_ref ?? source.path;
    if (typeof reference !== "string") throw new Error("Path source requires ref or path");
    const direct = Object.values(sources ?? {}).flat().find((entry) => entry.relativePath === reference);
    if (direct) {
      const selected = selectPointer(direct.value, source.selector, reference);
      return typeof selected === "string" ? selected : JSON.stringify(selected, null, 2);
    }
    const match = /^([a-z_]+):([a-z][a-z0-9_]*)(?:#\/(.*))?$/.exec(reference);
    if (!match) throw new Error(`Unknown structured source path: ${reference}`);
    const [, rawGroup, id, inlinePointer] = match;
    const groupAliases = { character: "characters", system: "systems", scene: "scenes", prompt: "prompts" };
    const group = groupAliases[rawGroup] ?? rawGroup;
    const candidate = entries(sources, group).find((entry) => entry.value?.id === id)?.value;
    if (!candidate) throw new Error(`Unknown structured source: ${group}:${id}`);
    const pointer = source.selector ? source.selector.replace(/^\//, "") : inlinePointer;
    const selected = selectPointer(candidate, pointer, reference);
    return typeof selected === "string" ? selected : JSON.stringify(selected, null, 2);
  }
  throw new Error(`Unsupported worldbook source kind: ${source.kind ?? "missing"}`);
}

function modelSelectionEnvelope(group, projected, selector, selected, entryDisplayName) {
  if (!selector) return selected;
  const normalizedGroup = ({
    characters: "character",
    systems: "system",
    scenes: "scene",
    prompts: "prompt",
  })[group] ?? group;
  const module = {
    type: normalizedGroup,
    ...(typeof projected?.id === "string" ? { id: projected.id } : {}),
    ...(typeof projected?.display_name === "string" ? { display_name: projected.display_name } : {}),
    ...(typeof entryDisplayName === "string" && entryDisplayName ? { entry_name: entryDisplayName } : {}),
    selection: selector,
  };
  return { module, content: selected };
}

async function resolveWorldbookContent(source, sources, projectRoot, entryDisplayName = null) {
  if (!isObject(source)) throw new Error("Worldbook entry source must be an object");
  if (!["registered_source", "path"].includes(source.kind)) {
    return resolveAssemblyContent(source, sources, projectRoot);
  }
  const resolved = resolveRegisteredAssemblySource(source, sources);
  const reference = source.ref ?? source.source_ref ?? source.path;
  if (!resolved) throw new Error(`Unknown structured source path: ${reference}`);
  const projected = projectModelSource(resolved.group, resolved.sourceEntry.value);
  const selected = selectPointer(projected, resolved.selector, reference);
  const content = modelSelectionEnvelope(
    resolved.group,
    projected,
    resolved.selector,
    selected,
    entryDisplayName,
  );
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function selectPointer(value, pointer, reference) {
  let selected = value;
  const normalized = typeof pointer === "string" ? pointer.replace(/^\//, "") : "";
  for (const segment of normalized ? normalized.split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~")) : []) {
    if ((!isObject(selected) && !Array.isArray(selected)) || !Object.hasOwn(selected, segment)) throw new Error(`Unknown structured source path: ${reference}`);
    selected = selected[segment];
  }
  return selected;
}

function worldbookEntriesContainer(payload, target, manifest) {
  const preserveImported = manifest?.preserve_imported_entries !== false;
  if (target === "character") {
    payload.data ??= {};
    payload.data.character_book ??= {
      name: `${payload.data.name ?? "未命名角色"} 世界书`,
      description: "由 SillyTavern制卡工坊装配",
      scan_depth: null,
      token_budget: null,
      recursive_scanning: false,
      extensions: {},
      entries: []
    };
    const existing = Array.isArray(payload.data.character_book.entries) ? payload.data.character_book.entries : Object.values(payload.data.character_book.entries ?? {});
    payload.data.character_book.entries = preserveImported ? existing.filter((entry) => !entry?.extensions?.rp_card_studio?.source_id) : [];
    if (typeof manifest?.display_name === "string") payload.data.character_book.name = manifest.display_name;
    if (typeof manifest?.description === "string") payload.data.character_book.description = manifest.description;
    if (manifest?.scan_depth !== undefined) payload.data.character_book.scan_depth = manifest.scan_depth;
    if (manifest?.token_budget !== undefined) payload.data.character_book.token_budget = manifest.token_budget;
    if (manifest?.recursive_scanning !== undefined) payload.data.character_book.recursive_scanning = manifest.recursive_scanning;
    return payload.data.character_book.entries;
  }
  if (Array.isArray(payload.entries)) {
    payload.entries = preserveImported ? payload.entries.filter((entry) => !entry?.extensions?.rp_card_studio?.source_id) : [];
  } else {
    const existing = isObject(payload.entries) ? Object.entries(payload.entries) : [];
    payload.entries = preserveImported
      ? Object.fromEntries(existing.filter(([, entry]) => !entry?.extensions?.rp_card_studio?.source_id))
      : {};
  }
  if (typeof manifest?.display_name === "string") payload.name = manifest.display_name;
  if (typeof manifest?.description === "string") payload.description = manifest.description;
  return payload.entries;
}

function containerIds(container) {
  const ids = [];
  const add = (value) => {
    if (value === undefined || value === null) return;
    ids.push(value, String(value));
  };
  if (Array.isArray(container)) {
    for (const entry of container) add(entry?.id);
    return ids;
  }
  for (const [key, entry] of Object.entries(container)) {
    add(key);
    add(entry?.id);
  }
  return ids;
}

function normalizeAndValidateContainerUids(container) {
  const usedUids = new Set();
  const issues = [];
  if (Array.isArray(container)) {
    issues.push(issue("/entries", "assembly.uid", "Standalone SillyTavern worldbook entries must be an object keyed by canonical numeric uid values"));
  }
  const records = Array.isArray(container) ? container.map((entry, index) => [String(index), entry]) : Object.entries(container);
  for (const [key, entry] of records) {
    if (!isObject(entry)) continue;
    const canonicalKey = /^(0|[1-9]\d*)$/.test(key);
    const keyUid = canonicalKey ? Number(key) : null;
    if (!Array.isArray(container) && !canonicalKey) {
      issues.push(issue(`/entries/${key}`, "assembly.uid", `Worldbook entry key must be a canonical non-negative integer: ${key}`));
    }
    if (entry.uid === undefined && keyUid !== null) entry.uid = keyUid;
    const uid = entry.uid === undefined ? null : entry.uid;
    if (uid !== null && (typeof uid !== "number" || !Number.isInteger(uid) || uid < 0)) {
      issues.push(issue(`/entries/${key}/uid`, "assembly.uid", `Worldbook uid must be a non-negative integer: ${entry.uid}`));
      if (keyUid !== null) usedUids.add(keyUid);
      continue;
    }
    if (keyUid !== null && uid !== null && uid !== keyUid) {
      issues.push(issue(`/entries/${key}/uid`, "assembly.uid", `Worldbook entry key ${key} does not match uid ${uid}`));
    }
    if (uid !== null && usedUids.has(uid)) {
      issues.push(issue(`/entries/${key}/uid`, "assembly.uid", `Duplicate worldbook uid: ${uid}`));
    }
    if (keyUid !== null) usedUids.add(keyUid);
    if (uid !== null) usedUids.add(uid);
  }
  return { usedUids, issues };
}

function allocateWorldbookUid(usedUids) {
  let uid = 0;
  while (usedUids.has(uid)) uid += 1;
  usedUids.add(uid);
  return uid;
}

function removeContainerEntry(container, id) {
  if (Array.isArray(container)) {
    const index = container.findIndex((entry) => String(entry?.id) === id);
    if (index >= 0) container.splice(index, 1);
    return;
  }
  for (const [key, entry] of Object.entries(container)) {
    if (String(key) === id || String(entry?.id) === id) delete container[key];
  }
}

function appendContainerEntry(container, entry) {
  if (Array.isArray(container)) container.push(entry);
  else container[entry.uid ?? entry.id] = entry;
}

function rpExtensionHost(payload, target) {
  if (target === "character") {
    payload.data ??= {};
    payload.data.extensions = isObject(payload.data.extensions) ? payload.data.extensions : {};
    payload.data.extensions.rp_card_studio = isObject(payload.data.extensions.rp_card_studio) ? payload.data.extensions.rp_card_studio : {};
    return payload.data.extensions.rp_card_studio;
  }
  payload.extensions = isObject(payload.extensions) ? payload.extensions : {};
  payload.extensions.rp_card_studio = isObject(payload.extensions.rp_card_studio) ? payload.extensions.rp_card_studio : {};
  return payload.extensions.rp_card_studio;
}

function manifestEntry(entry, content, target, characterBookId = null) {
  const activation = entry.activation ?? {};
  const insertion = entry.insertion ?? {};
  const recursion = entry.recursion ?? {};
  const probability = entry.probability ?? 100;
  const scanDepth = entry.scan_depth ?? null;
  const ignoreBudget = entry.ignore_budget ?? entry.extensions?.ignore_budget ?? false;
  const selectiveLogic = ({ any: 0, not_all: 1, not_any: 2, all: 3 })[activation.logic ?? "any"];
  const rawPosition = ({ before_char: 0, after_char: 1, before_example: 5, after_example: 6, at_depth: 4 })[insertion.position ?? "before_char"];
  const rawRole = ({ system: 0, user: 1, assistant: 2 })[insertion.role] ?? null;
  const rawHostFields = {
    useProbability: true,
    probability,
    excludeRecursion: Boolean(recursion.prevent_incoming),
    preventRecursion: Boolean(recursion.prevent_outgoing),
    delayUntilRecursion: recursion.delay_until_recursion ?? false,
    ignoreBudget,
    depth: insertion.depth ?? null,
    role: rawRole,
    selectiveLogic,
    caseSensitive: activation.case_sensitive ?? null,
    matchWholeWords: activation.match_whole_words ?? null
  };
  const customExtensions = isObject(entry.extensions) ? clone(entry.extensions) : {};
  const existingTracking = isObject(customExtensions.rp_card_studio) ? customExtensions.rp_card_studio : {};
  const tracking = {
    ...existingTracking,
    source_id: entry.id,
    ...(target === "character" ? {
      source_key: `assembly:${entry.id}`,
      generated: true,
      kind: "assembly",
    } : {}),
    activation: clone(activation),
    insertion: clone(insertion),
    probability,
    recursion: clone(recursion),
    recipient: entry.recipient ?? "shared",
    visibility: entry.visibility ?? "model",
    token_budget: entry.token_budget ?? null,
    ignore_budget: ignoreBudget,
    scan_depth: scanDepth,
    fallback: clone(entry.fallback ?? "skip")
  };
  const characterExtensions = {
    ...customExtensions,
    position: rawPosition,
    useProbability: rawHostFields.useProbability,
    probability,
    exclude_recursion: rawHostFields.excludeRecursion,
    prevent_recursion: rawHostFields.preventRecursion,
    delay_until_recursion: rawHostFields.delayUntilRecursion,
    ignore_budget: ignoreBudget,
    depth: rawHostFields.depth,
    role: rawRole,
    selectiveLogic,
    case_sensitive: rawHostFields.caseSensitive,
    match_whole_words: rawHostFields.matchWholeWords,
    scan_depth: scanDepth,
    rp_card_studio: tracking
  };
  if (target === "worldbook") {
    const characterFilter = isObject(entry.character_filter) ? {
      names: clone(entry.character_filter.avatar_stems ?? []),
      tags: clone(entry.character_filter.tag_ids ?? []),
      isExclude: Boolean(entry.character_filter.is_exclude)
    } : null;
    return {
      id: `wb_${entry.id}`,
      key: clone(activation.primary_keys ?? []),
      keysecondary: clone(activation.secondary_keys ?? []),
      comment: entry.display_name ?? `世界书条目：${entry.id}`,
      content,
      constant: activation.mode === "constant",
      selective: Boolean(activation.selective),
      order: insertion.order ?? 0,
      position: rawPosition,
      disable: entry.enabled === false,
      enabled: entry.enabled !== false,
      scanDepth,
      ...rawHostFields,
      ...characterFilter ? { characterFilter } : {},
      extensions: { ...customExtensions, ignore_budget: ignoreBudget, rp_card_studio: tracking }
    };
  }
  return {
    id: characterBookId,
    keys: clone(activation.primary_keys ?? []),
    secondary_keys: clone(activation.secondary_keys ?? []),
    comment: entry.display_name ?? `世界书条目：${entry.id}`,
    content,
    constant: activation.mode === "constant",
    selective: Boolean(activation.selective),
    enabled: entry.enabled !== false,
    position: insertion.position ?? "before_char",
    insertion_order: insertion.order ?? 0,
    ...rawHostFields,
    extensions: characterExtensions
  };
}

export async function applyAssemblyManifest(payload, { sources, projectRoot, target }) {
  const manifests = assemblySources(sources);
  if (manifests.length === 0) return { payload, issues: [], warnings: [] };
  if (manifests.length > 1) {
    return {
      payload: clone(payload),
      issues: [issue("/runtime/assembly", "assembly.configuration", "Exactly one assembly source may own the integration manifest")],
      warnings: []
    };
  }
  const issues = [];
  const warnings = [];
  const output = clone(payload);
  const manifest = manifests.at(-1)?.worldbook_manifest ?? { entries: [] };
  issues.push(...worldbookHostIssues(manifest, target, "/runtime/assembly/0"));
  const container = worldbookEntriesContainer(output, target, manifest);
  const records = manifests.flatMap((source, sourceIndex) => (source.worldbook_manifest?.entries ?? []).map((entry, entryIndex) => ({ entry, sourceIndex, entryIndex })));
  records.sort((left, right) => (left.entry.insertion?.order ?? 0) - (right.entry.insertion?.order ?? 0) || left.entry.id.localeCompare(right.entry.id));
  const outputIds = new Set(containerIds(container));
  const uidState = target === "worldbook" ? normalizeAndValidateContainerUids(container) : { usedUids: new Set(), issues: [] };
  issues.push(...uidState.issues);
  const usedUids = uidState.usedUids;
  const characterBookIds = target === "character" ? createCharacterBookIdAllocator(container) : null;
  const generatedIds = [];
  const resolvedRecords = [];
  for (const record of records) {
    try {
      const content = await resolveWorldbookContent(
        record.entry.source,
        sources,
        projectRoot,
        record.entry.display_name,
      );
      const legacyId = `wb_${record.entry.id}`;
      const legacyCollision = target === "character" && container.some((entry) => entry?.id === legacyId);
      if (legacyCollision && manifest.duplicate_policy !== "replace_imported") {
        if (manifest.duplicate_policy !== "keep_imported") {
          issues.push(issue(`/runtime/assembly/${record.sourceIndex}/worldbook_manifest/entries/${record.entryIndex}/id`, "assembly.reference", `Duplicate assembled entry id: ${legacyId}`));
        }
        continue;
      }
      if (legacyCollision) {
        removeContainerEntry(container, legacyId);
        outputIds.delete(legacyId);
      }
      resolvedRecords.push({ ...record, content });
    } catch (error) {
      const sourceIssue = issue(`/runtime/assembly/${record.sourceIndex}/worldbook_manifest/entries/${record.entryIndex}/source`, record.entry.fallback === "skip" ? "assembly.source.skipped" : "assembly.source", error.message);
      (record.entry.fallback === "skip" ? warnings : issues).push(sourceIssue);
    }
  }
  const allocations = characterBookIds?.allocateMany(resolvedRecords.map((record) => `assembly:${record.entry.id}`));
  for (const record of resolvedRecords) {
    const allocation = allocations?.get(`assembly:${record.entry.id}`);
    const assembled = manifestEntry(record.entry, record.content, target, allocation?.id);
    if (allocation?.collision) {
      warnings.push(issue(`/data/character_book/entries/${assembled.id}`, "assembly.id_collision", `Stable CharacterBook id ${allocation.candidate} was occupied; assigned ${allocation.id} to ${record.entry.id}`));
    }
    if (outputIds.has(assembled.id) || outputIds.has(String(assembled.id))) {
      if (manifest.duplicate_policy === "keep_imported") continue;
      if (manifest.duplicate_policy === "replace_imported") {
        removeContainerEntry(container, String(assembled.id));
      } else {
        issues.push(issue(`/runtime/assembly/${record.sourceIndex}/worldbook_manifest/entries/${record.entryIndex}/id`, "assembly.reference", `Duplicate assembled entry id: ${assembled.id}`));
        continue;
      }
    }
    outputIds.add(assembled.id);
    outputIds.add(String(assembled.id));
    if (target === "worldbook") assembled.uid = allocateWorldbookUid(usedUids);
    appendContainerEntry(container, assembled);
    generatedIds.push(assembled.id);
  }
  const extension = rpExtensionHost(output, target);
  extension.worldbook_manifest = {
    authoritative: true,
    entry_ids: generatedIds,
    configuration: clone(manifest)
  };
  const materializedMedia = await materializeMediaManifest(manifests[0]?.media_manifest, sources, projectRoot);
  issues.push(...materializedMedia.issues);
  extension.media_manifest = materializedMedia.manifest;
  extension.assembly_extensions = clone(manifests[0]?.extensions ?? {});
  return { payload: output, issues, warnings };
}

function mvuCharacterBookEntry({ id, sourceId, sourceKey, comment, content, enabled, kind, order, depth = null }) {
  const atDepth = Number.isInteger(depth);
  return {
    id,
    keys: [],
    secondary_keys: [],
    comment,
    content,
    constant: true,
    selective: false,
    insertion_order: order,
    enabled,
    position: atDepth ? "after_char" : "before_char",
    use_regex: true,
    extensions: {
      position: atDepth ? 4 : 0,
      useProbability: true,
      probability: 100,
      exclude_recursion: true,
      prevent_recursion: true,
      delay_until_recursion: false,
      depth: atDepth ? depth : 4,
      role: 0,
      selectiveLogic: 0,
      scan_depth: null,
      rp_card_studio: {
        kind,
        source_id: sourceId ?? kind,
        source_key: sourceKey ?? `mvu:${kind.replace(/^mvu_/, "")}`,
        generated: true,
      }
    }
  };
}

function mvuUpdateRulesContent(mvuSources) {
  const variables = mvuSources.flatMap((source) => source.mvu?.variables ?? []);
  const rules = mvuSources.flatMap((source) => source.mvu?.update_rules ?? []);
  const lines = [
    "MVU variable update rules:",
    "- Update only paths declared below and only when the current reply supplies the stated evidence.",
    "- Keep the previous legal value when a condition is uncertain or a constraint would be violated.",
    "- Treat one response as one batch; do not partially keep a rejected batch.",
    "",
    "Declared variables:"
  ];
  for (const variable of variables) {
    lines.push(`- ${variable.source_path}: type=${variable.type}; default=${JSON.stringify(variable.default)}; operations=${(variable.writer?.operations ?? []).join(",") || "none"}; constraints=${JSON.stringify(variable.constraints ?? {})}`);
  }
  lines.push("", "Update triggers:");
  for (const rule of rules) {
    lines.push(`- ${rule.id}: ${rule.trigger}`);
    lines.push(`  failure: ${rule.failure}`);
  }
  return lines.join("\n");
}

function mvuVariableListContent() {
  return `---
<status_current_variable>
{{format_message_variable::stat_data}}
</status_current_variable>`;
}

function mvuOutputFormatContent(mvuSources, { statusEnabled = false } = {}) {
  const protocol = mvuSources.find((source) => source.mvu?.protocol)?.mvu.protocol ?? {};
  const operations = protocol.operations ?? ["replace", "delta", "insert", "remove", "move"];
  const responseOrder = statusEnabled
    ? `Structure every reply in this exact order: narrative content, one variable update block, then exactly one ${STATUS_PLACEHOLDER}.
The status placeholder must be the final content. Never put a variable update block after it.`
    : "End each reply that changes state with one variable update block.";
  const statusSuffix = statusEnabled ? `\n${STATUS_PLACEHOLDER}` : "";
  const examplePath = mvuSources
    .flatMap((source) => source.mvu?.variables ?? [])
    .map((variable) => variable.source_path)
    .find((pathValue) => typeof pathValue === "string")
    ?.split(".")
    .map((segment) => segment.replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/") ?? "state/value";
  return `${responseOrder}
Use only these operations: ${operations.join(", ")}.
Paths use JSON Pointer syntax and must name a declared variable. Return an empty JSON array when no state changes.

<UpdateVariable>
<Analysis>Briefly justify every change from facts in the current reply.</Analysis>
<JSONPatch>
[
  { "op": "replace", "path": "/${examplePath}", "value": "new value" }
]
</JSONPatch>
</UpdateVariable>${statusSuffix}`;
}

export function applyMvuArtifacts(payload, { project, sources, target }) {
  if (target !== "character" || project?.features?.mvu !== true) return { payload, issues: [] };
  const mvuSources = values(sources, "mvu").filter((source) => source.mvu?.enabled);
  if (mvuSources.length === 0) return { payload, issues: [] };
  const defaults = mvuSources.reduce((state, source) => mergeValues(state, source.mvu.initialization?.defaults ?? {}), {});
  const statusEnabled = Boolean(activeStatusUi(project, sources));
  const generated = [
    mvuCharacterBookEntry({
      // MVU v0.179.0 discovers initialization entries by searching comment
      // for the literal [initvar] marker. Keep the visible title Chinese-first.
      comment: "初始化变量（保持禁用）[initvar]",
      content: JSON.stringify(defaults, null, 2),
      enabled: false,
      kind: "mvu_initvar",
      order: 14720
    }),
    mvuCharacterBookEntry({
      comment: "变量列表（当前状态）",
      content: mvuVariableListContent(),
      enabled: true,
      kind: "mvu_variable_list",
      order: 14721,
      depth: 1
    }),
    mvuCharacterBookEntry({
      comment: "变量更新规则",
      content: mvuUpdateRulesContent(mvuSources),
      enabled: true,
      kind: "mvu_update_rules",
      order: 14722,
      depth: 0
    }),
    mvuCharacterBookEntry({
      comment: statusEnabled ? "回复输出格式（含状态栏）" : "回复输出格式",
      content: mvuOutputFormatContent(mvuSources, { statusEnabled }),
      enabled: true,
      kind: "mvu_update_format",
      order: 14723,
      depth: 0
    })
  ];
  const output = clone(payload);
  const existingEntries = output.data?.character_book?.entries;
  const entries = Array.isArray(existingEntries) ? existingEntries : [];
  const ids = new Set(entries.map((entry) => entry?.id).filter((id) => id !== undefined));
  const sourceKeys = new Set(entries.map((entry) => characterBookTrackingKey(entry)).filter(Boolean));
  const allocator = createCharacterBookIdAllocator(entries);
  const allocations = allocator.allocateMany(generated.map((entry) => entry.extensions.rp_card_studio.source_key));
  const issues = [];
  const warnings = [];
  const accepted = [];
  for (const entry of generated) {
    const tracking = entry.extensions.rp_card_studio;
    const sourceKey = tracking.source_key;
    const allocation = allocations.get(sourceKey);
    const legacyId = `rp_${tracking.kind}`;
    if (entries.some((candidate) => candidate?.id === legacyId)) {
      issues.push(issue(`/data/character_book/entries/${legacyId}`, "mvu.entry_collision", `Refusing to overwrite CharacterBook entry: ${legacyId}`));
      continue;
    }
    entry.id = allocation.id;
    if (allocation.collision) {
      warnings.push(issue(`/data/character_book/entries/${entry.id}`, "mvu.id_collision", `Stable CharacterBook id ${allocation.candidate} was occupied; assigned ${allocation.id} to ${tracking.kind}`));
    }
    const existingSourceIndex = entries.findIndex((candidate) => characterBookTrackingKey(candidate) === sourceKey);
    if (existingSourceIndex >= 0 && allocation.reused) {
      entries[existingSourceIndex] = entry;
      ids.add(entry.id);
      continue;
    }
    if (sourceKeys.has(sourceKey) || ids.has(entry.id)) {
      issues.push(issue(`/data/character_book/entries/${entry.id}`, "mvu.entry_collision", `Refusing to overwrite CharacterBook entry: ${entry.id}`));
      continue;
    }
    sourceKeys.add(sourceKey);
    ids.add(entry.id);
    accepted.push(entry);
  }
  if (accepted.length === 0) return { payload: output, issues, warnings };
  output.data ??= {};
  output.data.character_book ??= {
    name: `${output.data.name ?? "未命名角色"} 世界书`,
    description: "SillyTavern制卡工坊 MVU 运行规则",
    scan_depth: null,
    token_budget: null,
    recursive_scanning: false,
    extensions: {},
    entries: []
  };
  output.data.character_book.entries = Array.isArray(output.data.character_book.entries) ? output.data.character_book.entries : [];
  output.data.character_book.entries.push(...accepted);
  return { payload: output, issues, warnings };
}

function ejsLiteral(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return "undefined";
  return serialized
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("%", "\\u0025")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function ejsConditionExpression(condition) {
  switch (condition.operator) {
    case "eq": return `Object.is(__rp_value, ${ejsLiteral(condition.value)})`;
    case "ne": return `!Object.is(__rp_value, ${ejsLiteral(condition.value)})`;
    case "lt": return `__rp_value < ${ejsLiteral(condition.value)}`;
    case "lte": return `__rp_value <= ${ejsLiteral(condition.value)}`;
    case "gt": return `__rp_value > ${ejsLiteral(condition.value)}`;
    case "gte": return `__rp_value >= ${ejsLiteral(condition.value)}`;
    case "truthy": return "__rp_collection_truthy";
    case "falsy": return "!__rp_collection_truthy";
    case "includes": return `(typeof __rp_value === "string" || Array.isArray(__rp_value)) && __rp_value.includes(${ejsLiteral(condition.value)})`;
    default: return "false";
  }
}

function ejsTemplateContent(entry, channel, variable, bridge = null) {
  const placement = entry.placement === "before" ? "before" : "after";
  // Every entry gets its own lexical scope because SillyTavern may evaluate
  // several CharacterBook entries in one EJS context.
  const decorators = ["@@always_enabled", "@@private", `@@${channel}_${placement}`];
  if (channel === "render") decorators.push("@@if !is_user && !is_system");
  const runtimePath = ejsLiteral(entry.condition.runtime_path);
  const defaultValue = ejsLiteral(variable.default);
  const namespace = bridge?.namespace ?? "stat_data";
  const namespacePrefix = `${namespace}.`;
  const pathWithoutNamespace = entry.condition.runtime_path.startsWith(namespacePrefix)
    ? entry.condition.runtime_path.slice(namespacePrefix.length)
    : entry.condition.runtime_path;
  const runtimeSegments = pathWithoutNamespace.split(".").map(ejsLiteral).join(", ");
  const trueBranch = ejsLiteral(entry.branches.when_true);
  const falseBranch = ejsLiteral(entry.branches.when_false);
  const fallbackBranch = ejsLiteral(entry.branches.fallback);
  const expression = ejsConditionExpression(entry.condition);
  const collectionTruthiness = ["truthy", "falsy"].includes(entry.condition.operator)
    ? `
    const __rp_collection_truthy = Array.isArray(__rp_value)
      ? __rp_value.length > 0
      : (__rp_value !== null && typeof __rp_value === "object")
        ? Object.keys(__rp_value).length > 0
        : Boolean(__rp_value);`
    : "";
  const header = `${decorators.join("\n")}
<% {
  const __rp_when_true = ${trueBranch};
  const __rp_when_false = ${falseBranch};
  const __rp_fallback = ${fallbackBranch};
  try {`;
  if (!bridge?.enabled) {
    return `${header}
    const __rp_value = getvar(${runtimePath}, { defaults: ${defaultValue} });
    ${collectionTruthiness}
    if (${expression}) { %><%- __rp_when_true %><% } else { %><%- __rp_when_false %><% }
  } catch (__rp_error) { %><%- __rp_fallback %><% }
} %>`;
  }
  const target = ejsLiteral(bridge.target);
  const snapshotSelector = ejsLiteral(bridge.snapshotSelector ?? "latest_message");
  const timeoutMs = Number.isInteger(bridge.timeoutMs) && bridge.timeoutMs > 0 ? bridge.timeoutMs : 10000;
  const namespaceLiteral = ejsLiteral(namespace);
  return `${header}
    if (typeof globalThis.waitGlobalInitialized !== "function") throw new Error("waitGlobalInitialized is unavailable");
    let __rp_timeout_id = null;
    try {
      await Promise.race([
        globalThis.waitGlobalInitialized("Mvu"),
        new Promise((_, reject) => {
          __rp_timeout_id = setTimeout(() => reject(new Error("MVU initialization timed out")), ${timeoutMs});
        })
      ]);
    } finally {
      if (__rp_timeout_id !== null) clearTimeout(__rp_timeout_id);
    }
    const __rp_mvu = globalThis.Mvu;
    if (!__rp_mvu || typeof __rp_mvu.getMvuData !== "function") throw new Error("MVU API is unavailable");
    const __rp_snapshot_selector = ${snapshotSelector};
    const __rp_target = __rp_snapshot_selector === "current_message"
      && typeof message_id === "number"
      && Number.isInteger(message_id)
      ? { type: "message", message_id }
      : ${target};
    const __rp_mvu_data = __rp_mvu.getMvuData(__rp_target);
    const __rp_namespace = __rp_mvu_data?.[${namespaceLiteral}];
    let __rp_value;
    let __rp_found = Boolean(__rp_namespace) && typeof __rp_namespace === "object";
    let __rp_cursor = __rp_namespace;
    if (__rp_found) {
      for (const __rp_segment of [${runtimeSegments}]) {
        if (__rp_cursor == null
          || (typeof __rp_cursor !== "object" && typeof __rp_cursor !== "function")
          || !Object.prototype.hasOwnProperty.call(__rp_cursor, __rp_segment)) {
          __rp_found = false;
          break;
        }
        __rp_cursor = __rp_cursor[__rp_segment];
      }
      if (__rp_found) __rp_value = __rp_cursor;
    }
    if (!__rp_found) { %><%- __rp_fallback %><% } else {
      ${collectionTruthiness}
      if (${expression}) { %><%- __rp_when_true %><% } else { %><%- __rp_when_false %><% }
    }
  } catch (__rp_error) { %><%- __rp_fallback %><% }
} %>`;
}

function ejsHostEntry(entry, channel, variable, characterBookId = null, bridge = null) {
  const channelLabel = channel === "generate" ? "生成" : "渲染";
  return {
    id: characterBookId,
    keys: [],
    secondary_keys: [],
    comment: `条件模板（${channelLabel}）：${entry.display_name ?? entry.id}`,
    content: ejsTemplateContent(entry, channel, variable, bridge),
    constant: true,
    selective: false,
    insertion_order: entry.insertion_order,
    enabled: false,
    position: "before_char",
    use_regex: true,
    extensions: {
      position: 0,
      useProbability: true,
      probability: 100,
      exclude_recursion: true,
      prevent_recursion: true,
      delay_until_recursion: false,
      depth: 0,
      role: 0,
      selectiveLogic: 0,
      scan_depth: null,
      rp_card_studio: {
        kind: "ejs_template",
        source_id: entry.id,
        source_key: `ejs:${entry.id}:${channel}`,
        generated: true,
        target: entry.target,
        channel,
        runtime_path: entry.condition.runtime_path,
        missing_dependency: entry.missing_dependency ?? "omit_dynamic"
      }
    }
  };
}

export function applyEjsTemplates(payload, { project, sources, target }) {
  if (target !== "character" || project?.features?.ejs !== true) return { payload, issues: [] };
  const mvuSources = values(sources, "mvu");
  const enabledSources = mvuSources.filter((source) => source.ejs?.enabled);
  if (enabledSources.length === 0) return { payload, issues: [] };
  const output = clone(payload);
  const issues = [];
  const warnings = [];
  const declarations = mvuSources.flatMap((source, sourceIndex) => (source.mvu?.variables ?? []).map((variable, variableIndex) => ({
    sourceIndex,
    variableIndex,
    variable,
    source,
  })));
  const ambiguousPaths = new Set();
  for (let leftIndex = 0; leftIndex < declarations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < declarations.length; rightIndex += 1) {
      const left = declarations[leftIndex];
      const right = declarations[rightIndex];
      if (!pathConflict(left.variable.runtime_path, right.variable.runtime_path)) continue;
      ambiguousPaths.add(left.variable.runtime_path);
      ambiguousPaths.add(right.variable.runtime_path);
    }
  }
  if (ambiguousPaths.size > 0) {
    for (const runtimePath of [...ambiguousPaths].sort()) {
      const owners = declarations
        .filter(({ variable }) => pathConflict(variable.runtime_path, runtimePath))
        .map(({ sourceIndex, variableIndex, variable }) => "/runtime/mvu/" + sourceIndex + "/variables/" + variableIndex + " (" + variable.runtime_path + ")")
        .join(", ");
      issues.push(issue("/runtime/ejs/" + runtimePath, "ejs.variable_ambiguous", "EJS projection refused because runtime path " + runtimePath + " conflicts with " + owners));
    }
    return { payload: output, issues, warnings };
  }
  const variables = new Map(declarations.map((declaration) => [declaration.variable.runtime_path, declaration]));
  const generated = [];
  const existingEntries = output.data?.character_book?.entries;
  const entries = Array.isArray(existingEntries) ? existingEntries : [];
  const ids = new Set(entries.map((entry) => entry?.id).filter((id) => id !== undefined));
  const sourceKeys = new Set(entries.map((entry) => characterBookTrackingKey(entry)).filter(Boolean));
  const allocator = createCharacterBookIdAllocator(entries);
  const existingSourceEntries = new Map(entries.map((entry) => [characterBookTrackingKey(entry), entry]).filter(([key]) => key));
  const candidates = [];
  for (const source of enabledSources) {
    for (const entry of source.ejs.entries ?? []) {
      const declaration = isObject(entry.condition) ? variables.get(entry.condition.runtime_path) : null;
      const variable = declaration?.variable;
      if (!variable || !isObject(entry.branches)) {
        issues.push(issue(`/runtime/ejs/${entry.id ?? "unknown"}`, "ejs.contract", "EJS entry cannot be compiled without a structured condition, branches, and a declared runtime variable"));
        continue;
      }
      if (!(entry.reads ?? []).includes(entry.condition.runtime_path)) {
        issues.push(issue(`/runtime/ejs/${entry.id}/reads`, "ejs.contract", "EJS condition runtime_path must be declared in reads"));
        continue;
      }
      const channels = entry.target === "both" ? ["generate", "render"] : [entry.target === "render" ? "render" : "generate"];
      for (const channel of channels) {
        const sourceKey = `ejs:${entry.id}:${channel}`;
        const legacyId = `ejs_${entry.id}_${channel === "generate" ? "generate" : "render"}`;
        candidates.push({ entry, channel, variable, declaration, sourceKey, legacyId });
      }
    }
  }
  const allocations = allocator.allocateMany(candidates.map((candidate) => candidate.sourceKey));
  for (const candidate of candidates) {
    const { entry, channel, variable, declaration, sourceKey, legacyId } = candidate;
    if (entries.some((existing) => existing?.id === legacyId)) {
      issues.push(issue(`/data/character_book/entries/${legacyId}`, "ejs.entry_collision", `Refusing to overwrite CharacterBook entry: ${legacyId}`));
      continue;
    }
    const allocation = allocations.get(sourceKey);
    const bridgeSource = project?.features?.mvu === true && declaration.source.mvu?.enabled
      ? declaration.source
      : null;
    const storage = bridgeSource?.mvu?.storage ?? {};
    const bridgeContractParts = bridgeSource
      ? [bridgeSource.runtime_contract?.adapter, ...(bridgeSource.runtime_contract?.dependencies ?? [])].filter(Boolean)
      : [];
    const bridgeTimeout = bridgeContractParts.find((part) => part.id === "tavern_helper"
      || /(?:^|\.)Mvu$/.test(part.readiness_probe ?? ""))?.timeout_ms
      ?? bridgeContractParts.find((part) => part.id === "st_prompt_template")?.timeout_ms
      ?? 10000;
    const bridge = bridgeSource ? {
      enabled: true,
      namespace: storage.namespace ?? "stat_data",
      target: { type: "message", message_id: "latest" },
      snapshotSelector: storage.snapshot_selector ?? "current_message",
      timeoutMs: bridgeTimeout,
    } : null;
    const compiled = ejsHostEntry(entry, channel, variable, allocation.id, bridge);
    if (allocation.collision) {
      warnings.push(issue(`/data/character_book/entries/${compiled.id}`, "ejs.id_collision", `Stable CharacterBook id ${allocation.candidate} was occupied; assigned ${allocation.id} to ${sourceKey}`));
    }
    const existingSourceEntry = existingSourceEntries.get(sourceKey);
    if (existingSourceEntry && allocation.reused) {
      const existingIndex = entries.indexOf(existingSourceEntry);
      if (existingIndex >= 0) entries[existingIndex] = compiled;
      continue;
    }
    if (sourceKeys.has(sourceKey) || ids.has(compiled.id)) {
      issues.push(issue(`/data/character_book/entries/${compiled.id}`, "ejs.entry_collision", `Refusing to overwrite CharacterBook entry: ${compiled.id}`));
      continue;
    }
    sourceKeys.add(sourceKey);
    ids.add(compiled.id);
    generated.push(compiled);
  }
  if (generated.length === 0) return { payload: output, issues, warnings };
  output.data ??= {};
  output.data.character_book ??= {
    name: `${output.data.name ?? "未命名角色"} 世界书`,
    description: "SillyTavern制卡工坊 EJS 条件模板",
    scan_depth: null,
    token_budget: null,
    recursive_scanning: false,
    extensions: {},
    entries: []
  };
  output.data.character_book.entries = Array.isArray(output.data.character_book.entries) ? output.data.character_book.entries : [];
  output.data.character_book.entries.push(...generated);
  return { payload: output, issues, warnings };
}

function presentationVariants(opening) {
  const presentations = opening.presentations;
  if (!presentations) return [{ id: "default", text: opening.visible_text, isDefault: true }];
  const variants = Array.isArray(presentations) ? presentations : presentations.variants ?? presentations.items ?? [];
  const defaultId = opening.default_variant_id ?? presentations.default_variant_id ?? variants[0]?.id;
  const normalized = variants.map((variant) => ({
    id: variant.id,
    text: variant.visible_text ?? variant.text ?? variant.content,
    isDefault: variant.id === defaultId
  })).filter((variant) => typeof variant.text === "string" && variant.text.length > 0);
  return normalized.length > 0 ? normalized : [{ id: "default", text: opening.visible_text, isDefault: true }];
}

function initializationLookup(mvuSources) {
  const profiles = new Map();
  const definitions = new Map();
  const bindings = new Map();
  const overrides = new Map();
  for (const source of mvuSources) {
    const initialization = source.mvu?.initialization ?? {};
    if (!definitions.has("default") && isObject(initialization.defaults)) {
      definitions.set("default", { id: "default", extends: null, values: initialization.defaults });
    }
    for (const profile of initialization.profiles ?? []) if (!definitions.has(profile.id)) definitions.set(profile.id, profile);
    for (const binding of initialization.opening_bindings ?? []) bindings.set(normalizeRefId(binding.opening_ref, "opening:"), binding);
    for (const override of initialization.opening_overrides ?? []) {
      const values = clone(override.values ?? {});
      overrides.set(normalizeRefId(override.opening_ref, "opening:"), values);
    }
  }
  const resolving = new Set();
  const resolveProfile = (id) => {
    if (profiles.has(id)) return profiles.get(id);
    const definition = definitions.get(id);
    if (!definition || resolving.has(id)) return null;
    resolving.add(id);
    const parentId = normalizeRefId(definition.extends, "mvu_init:");
    const resolved = mergeValues(parentId ? resolveProfile(parentId) ?? {} : {}, definition.values ?? {});
    resolving.delete(id);
    profiles.set(id, resolved);
    return resolved;
  };
  for (const id of definitions.keys()) resolveProfile(id);
  return { profiles, bindings, overrides };
}

function resolveOpeningInitialization(opening, lookup) {
  if (lookup.overrides.has(opening.id)) {
    return { source: "opening_override", profile_id: null, state: clone(lookup.overrides.get(opening.id)) };
  }
  const binding = lookup.bindings.get(opening.id);
  const profileId = normalizeRefId(opening.initial_state_ref, "mvu_init:")
    ?? normalizeRefId(binding?.profile_ref, "mvu_init:");
  return {
    source: profileId ? (opening.initial_state_ref ? "opening_ref" : "opening_binding") : null,
    profile_id: profileId,
    state: profileId && lookup.profiles.has(profileId) ? clone(lookup.profiles.get(profileId)) : null
  };
}

function resolveOpeningInitializations(openingSources, mvuSources) {
  const lookup = initializationLookup(mvuSources);
  return openingSources.flatMap((source) => (source.openings ?? []).map((opening) => ({
    opening_id: opening.id,
    ...resolveOpeningInitialization(opening, lookup)
  })));
}

function openingTextWithInitialization(text, initialization) {
  if (!isObject(initialization?.state)) return text;
  return `${text}\n\n<initvar>\n${JSON.stringify(initialization.state, null, 2)}\n</initvar>`;
}

export function selectOpeningMessages(openingSources, mvuSources = []) {
  const openings = openingSources.flatMap((source) => source.openings ?? []);
  if (openings.length === 0) return null;
  const defaultOpening = openings.find((opening) => opening.is_default) ?? openings[0];
  const defaultVariants = presentationVariants(defaultOpening);
  const selected = defaultVariants.find((variant) => variant.isDefault) ?? defaultVariants[0];
  const lookup = initializationLookup(mvuSources);
  const defaultInitialization = resolveOpeningInitialization(defaultOpening, lookup);
  const alternates = [];
  const alternateSelections = [];
  for (const opening of openings) {
    for (const variant of presentationVariants(opening)) {
      if (opening === defaultOpening && variant.id === selected.id) continue;
      const initialization = resolveOpeningInitialization(opening, lookup);
      alternates.push(openingTextWithInitialization(variant.text, initialization));
      alternateSelections.push({ opening_id: opening.id, variant_id: variant.id, ...initialization });
    }
  }
  return {
    first: openingTextWithInitialization(selected.text, defaultInitialization),
    alternates,
    selection: {
      default: { opening_id: defaultOpening.id, variant_id: selected.id, ...defaultInitialization },
      alternates: alternateSelections,
      evidence: "artifact_only"
    }
  };
}

function tavernHelperRuntimeConfig(mvuSources, expectedCharacterName = null) {
  const probes = [];
  const timeouts = [];
  for (const source of mvuSources) {
    if (!source.mvu?.enabled && !source.ejs?.enabled) continue;
    const contract = source.runtime_contract ?? {};
    const adapter = contract.adapter;
    if (adapter?.id === "tavern_helper") {
      if (typeof adapter.readiness_probe === "string") probes.push(adapter.readiness_probe);
      if (Number.isInteger(adapter.timeout_ms)) timeouts.push(adapter.timeout_ms);
    }
    for (const dependency of contract.dependencies ?? []) {
      if (typeof dependency.readiness_probe === "string") probes.push(dependency.readiness_probe);
      if (Number.isInteger(dependency.timeout_ms)) timeouts.push(dependency.timeout_ms);
    }
  }
  const embeddedAdapter = mvuSources
    .map((source) => source.runtime_contract?.adapter)
    .find((adapter) => adapter?.id === "tavern_helper" && adapter.delivery === "embedded") ?? null;
  const pathMappings = Object.fromEntries(mvuSources.flatMap((source) => {
    const namespace = source.mvu?.storage?.namespace ?? "stat_data";
    return (source.mvu?.variables ?? []).map((variable) => [
      variable.source_path,
      variable.runtime_path.startsWith(`${namespace}.`) ? variable.runtime_path.slice(namespace.length + 1) : variable.runtime_path
    ]);
  }));
  const activeMvu = mvuSources.find((source) => source.mvu?.enabled) ?? null;
  const storage = activeMvu?.mvu?.storage ?? {};
  const storageScope = storage.scope ?? "message";
  const snapshotSelector = storage.snapshot_selector ?? "current_message";
  const target = storageScope === "message"
    ? { type: "message", message_id: "latest" }
    : storageScope === "script"
      ? { type: "script" }
      : { type: storageScope };
  const variables = mvuSources.flatMap((source) => (source.mvu?.enabled ? source.mvu.variables ?? [] : [])).map((variable) => ({
    sourcePath: variable.source_path,
    runtimePath: variable.runtime_path,
    type: variable.type,
    default: clone(variable.default),
    constraints: clone(variable.constraints ?? {}),
    operations: clone(variable.writer?.operations ?? [])
  }));
  const remoteImports = mvuSources.flatMap((source) => (source.runtime_contract?.dependencies ?? [])
    .filter((dependency) => dependency.class === "remote" && typeof dependency.delivery === "string")
    .map((dependency) => ({
      id: dependency.id,
      version: dependency.version,
      url: dependency.delivery,
      loadOrder: dependency.load_order ?? 0
    })));
  return {
    expectedCharacterName: typeof expectedCharacterName === "string" && expectedCharacterName.length > 0
      ? expectedCharacterName
      : null,
    probes: [...new Set(probes.length > 0 ? probes : ["globalThis.Mvu"])],
    timeoutMs: timeouts.length > 0 ? Math.max(...timeouts) : 10000,
    readinessPollMs: 100,
    statePollMs: 200,
    adapter: clone(embeddedAdapter),
    pathMappings,
    target,
    snapshotSelector,
    namespace: storage.namespace ?? "stat_data",
    variables,
    remoteImports
  };
}

function runtimeGuardScript(runtimeConfig) {
  const config = JSON.stringify(runtimeConfig).replaceAll("<", "\\u003c");
  return `(async () => {
  "use strict";
  const key = Symbol.for("rp_card_studio.runtime_guard");
  globalThis[key]?.cleanup?.();
  const config = ${config};
  const timers = new Set();
  const listeners = [];
  const lifecycleListeners = [];
  let disposed = false;
  let ready = false;
  let api = null;
  let lastLegal = null;
  const cloneValue = (value) => {
    if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  const resolveTarget = () => {
    const target = cloneValue(config.target);
    if (target?.type !== "message" || config.snapshotSelector !== "current_message") return target;
    try {
      const messageId = typeof globalThis.getCurrentMessageId === "function"
        ? globalThis.getCurrentMessageId()
        : undefined;
      if (Number.isInteger(messageId)) target.message_id = messageId;
    } catch { /* Character scripts have no message-frame id; latest is the documented fallback. */ }
    return target;
  };
  const emit = async (name, detail) => {
    if (typeof globalThis.eventEmit === "function") {
      try { await globalThis.eventEmit(name, detail); } catch { /* Host observers must not break MVU state. */ }
    }
  };
  const belongsToCurrentCharacter = () => {
    if (!config.expectedCharacterName) return true;
    if (typeof globalThis.getCurrentCharacterName !== "function") return false;
    try { return globalThis.getCurrentCharacterName() === config.expectedCharacterName; } catch { return false; }
  };
  const getAt = (root, path) => String(path).split(".").reduce((value, name) => value == null ? undefined : value[name], root);
  const setAt = (root, path, value) => {
    const names = String(path).split(".");
    const leaf = names.pop();
    let owner = root;
    for (const name of names) {
      if (!owner[name] || typeof owner[name] !== "object" || Array.isArray(owner[name])) owner[name] = {};
      owner = owner[name];
    }
    owner[leaf] = cloneValue(value);
  };
  const validValue = (value, variable) => {
    const typed = variable.type === "integer" ? Number.isInteger(value)
      : variable.type === "number" ? typeof value === "number" && Number.isFinite(value)
      : variable.type === "string" ? typeof value === "string"
      : variable.type === "enum" ? ["string", "number", "boolean"].includes(typeof value)
      : variable.type === "boolean" ? typeof value === "boolean"
      : variable.type === "array" ? Array.isArray(value)
      : variable.type === "object" ? Boolean(value) && typeof value === "object" && !Array.isArray(value)
      : true;
    if (!typed) return false;
    const constraints = variable.constraints || {};
    if (typeof constraints.minimum === "number" && typeof value === "number" && value < constraints.minimum) return false;
    if (typeof constraints.maximum === "number" && typeof value === "number" && value > constraints.maximum) return false;
    if (Array.isArray(constraints.values) && !constraints.values.some((candidate) => Object.is(candidate, value))) return false;
    if (typeof constraints.pattern === "string" && typeof value === "string") {
      try { if (!new RegExp(constraints.pattern).test(value)) return false; } catch { return false; }
    }
    if (Number.isInteger(constraints.max_items) && Array.isArray(value) && value.length > constraints.max_items) return false;
    return true;
  };
  const validateData = (data) => {
    if (!data || typeof data !== "object" || !data.stat_data || typeof data.stat_data !== "object") return ["stat_data"];
    return config.variables.filter((variable) => !validValue(getAt(data, variable.runtimePath), variable)).map((variable) => variable.runtimePath);
  };
  const repairDefaults = (data) => {
    if (!data?.stat_data || typeof data.stat_data !== "object") return { validRoot: false, changed: false };
    let changed = false;
    for (const variable of config.variables) {
      const value = getAt(data, variable.runtimePath);
      if (value === undefined) {
        setAt(data, variable.runtimePath, variable.default);
        changed = true;
      }
    }
    return { validRoot: true, changed };
  };
  const replaceInPlace = (target, source) => {
    for (const name of Object.keys(target)) delete target[name];
    Object.assign(target, cloneValue(source));
  };
  const normalizeCommandPath = (path) => String(path ?? "")
    .replace(/^stat_data\\./, "")
    .replace(/^\\//, "")
    .replaceAll("/", ".");
  const allowedCommands = new Map();
  for (const variable of config.variables) {
    const aliases = [variable.sourcePath, variable.runtimePath, variable.runtimePath.replace(/^stat_data\\./, "")];
    for (const alias of aliases) allowedCommands.set(normalizeCommandPath(alias), variable);
  }
  const operationAllowed = (command, variable) => {
    const allowed = variable.operations || [];
    if (command.type === "set") return allowed.includes("set");
    if (command.type === "add") return allowed.includes("add") || allowed.includes("subtract");
    if (command.type === "insert") return allowed.includes("append") || allowed.includes("set");
    if (command.type === "delete") return allowed.includes("remove");
    if (command.type === "move") return allowed.includes("move");
    return false;
  };
  const initializeState = async (variables, swipeId, source = "initialized", persistDefaults = false) => {
    if (disposed) return false;
    const repaired = repairDefaults(variables);
    if (!repaired.validRoot) {
      void emit("rp-card-runtime-unavailable", { reason: "MVU did not initialize stat_data", swipeId });
      return false;
    }
    const invalid = validateData(variables);
    if (invalid.length > 0) {
      void emit("rp-card-state-rejected", { reason: "invalid_initial_state", paths: invalid });
      return false;
    }
    if (persistDefaults && repaired.changed) {
      try {
        await api.replaceMvuData(cloneValue(variables), resolveTarget());
      } catch (error) {
        await emit("rp-card-runtime-unavailable", { reason: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }
    if (disposed) return false;
    const becameReady = !ready;
    lastLegal = cloneValue(variables);
    ready = true;
    if (becameReady) void emit("rp-card-runtime-ready", { target: resolveTarget() });
    void emit("rp-card-state-change", { source });
    return true;
  };
  const onInitialized = (variables, swipeId) => {
    if (!ensureCurrentCharacter()) return;
    void initializeState(variables, swipeId);
  };
  const onCommandsParsed = (_variables, commands) => {
    if (!ensureCurrentCharacter()) return;
    if (!Array.isArray(commands)) return;
    const accepted = commands.filter((command) => {
      const variable = allowedCommands.get(normalizeCommandPath(command?.args?.[0]));
      if (!variable || !operationAllowed(command, variable)) return false;
      if (command.type === "move") {
        const destination = allowedCommands.get(normalizeCommandPath(command?.args?.[1]));
        return Boolean(destination) && operationAllowed(command, destination);
      }
      return true;
    });
    commands.splice(0, commands.length, ...accepted);
  };
  const onUpdateEnded = (variables, before) => {
    if (!ensureCurrentCharacter()) return;
    const invalid = validateData(variables);
    if (invalid.length > 0) {
      if (before && typeof before === "object") replaceInPlace(variables, before);
      void emit("rp-card-state-rejected", { reason: "invalid_update", paths: invalid });
      return;
    }
    const becameReady = !ready;
    lastLegal = cloneValue(variables);
    ready = true;
    if (becameReady) void emit("rp-card-runtime-ready", { target: resolveTarget() });
    void emit("rp-card-state-change", { source: "mvu_update" });
  };
  const onBeforeMessageUpdate = (context) => {
    if (!ensureCurrentCharacter()) return;
    const invalid = validateData(context?.variables);
    if (invalid.length > 0 && lastLegal && context?.variables) {
      replaceInPlace(context.variables, lastLegal);
      void emit("rp-card-state-rejected", { reason: "invalid_before_message_update", paths: invalid });
    }
  };
  const on = (event, handler) => {
    if (disposed) return;
    globalThis.eventOn(event, handler);
    listeners.push([event, handler]);
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    for (const [event, handler] of listeners.splice(0)) {
      try { globalThis.eventRemoveListener(event, handler); } catch { /* Host cleanup must remain best effort. */ }
    }
    for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
    timers.clear();
    for (const [event, handler] of lifecycleListeners.splice(0)) {
      try { globalThis.removeEventListener?.(event, handler); } catch { /* Frame cleanup must remain best effort. */ }
    }
    if (globalThis[key] === handle) {
      try { delete globalThis[key]; } catch { globalThis[key] = undefined; }
    }
  };
  const ensureCurrentCharacter = () => {
    if (disposed) return false;
    if (belongsToCurrentCharacter()) return true;
    cleanup();
    void emit("rp-card-runtime-unavailable", { reason: "Runtime guard no longer belongs to the current character" });
    return false;
  };
  const onLifecycle = (event) => {
    if (typeof globalThis.addEventListener !== "function") return;
    const handler = () => cleanup();
    globalThis.addEventListener(event, handler, { once: true });
    lifecycleListeners.push([event, handler]);
  };
  const handle = { cleanup, get ready() { return ready; } };
  globalThis[key] = handle;
  onLifecycle("pagehide");
  onLifecycle("unload");
  try {
    if (typeof globalThis.waitGlobalInitialized !== "function") throw new Error("waitGlobalInitialized is unavailable");
    let timeoutTimer = null;
    const timeout = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error("MVU initialization timed out")), config.timeoutMs);
      timers.add(timeoutTimer);
    });
    try {
      await Promise.race([globalThis.waitGlobalInitialized("Mvu"), timeout]);
    } finally {
      if (timeoutTimer !== null) { clearTimeout(timeoutTimer); timers.delete(timeoutTimer); }
    }
    api = globalThis.Mvu;
    if (!api?.getMvuData || !api?.replaceMvuData || !api?.events) throw new Error("MVU API is incomplete");
    if (typeof globalThis.eventOn !== "function"
      || typeof globalThis.eventEmit !== "function"
      || typeof globalThis.eventRemoveListener !== "function") throw new Error("Tavern Helper event API is unavailable");
    if (!belongsToCurrentCharacter()) {
      cleanup();
      throw new Error("Runtime guard belongs to a different character");
    }
    const eventNames = [
      api.events.VARIABLE_INITIALIZED,
      api.events.COMMAND_PARSED,
      api.events.VARIABLE_UPDATE_ENDED,
      api.events.BEFORE_MESSAGE_UPDATE,
    ];
    if (eventNames.some((event) => typeof event !== "string")) throw new Error("MVU event contract is incomplete");
    on(api.events.VARIABLE_INITIALIZED, onInitialized);
    on(api.events.COMMAND_PARSED, onCommandsParsed);
    on(api.events.VARIABLE_UPDATE_ENDED, onUpdateEnded);
    on(api.events.BEFORE_MESSAGE_UPDATE, onBeforeMessageUpdate);
    const chatChangedEvent = globalThis.tavern_events?.CHAT_CHANGED;
    if (typeof chatChangedEvent === "string") on(chatChangedEvent, ensureCurrentCharacter);
    const snapshot = api.getMvuData(resolveTarget());
    if (!ready && snapshot?.stat_data && typeof snapshot.stat_data === "object") {
      await initializeState(snapshot, undefined, "bootstrap", true);
    }
  } catch (error) {
    await emit("rp-card-runtime-unavailable", { reason: error instanceof Error ? error.message : String(error) });
  }
})();`;
}

// JS-Slash-Runner parses character scripts with a strict Zod object. Keep the
// host-facing projection deliberately small; project-only adapter metadata
// belongs in the source contract and reports, not in the card extension.
function tavernHelperScript({ id, name, content, enabled = true, info = "" }) {
  return {
    type: "script",
    enabled,
    name,
    id,
    content,
    info,
    button: { enabled: true, buttons: [] },
    data: {},
    export_with: { data: true, button: true }
  };
}

// Recognition data only. Forge never executes or regenerates this retired
// parent-page script; matching copies are removed when old cards are rebuilt.
const DEPRECATED_PARENT_STATUS_SCRIPT_FINGERPRINT = Object.freeze({
  id: "rp_card_studio_status_ui",
  name: "RP Card Studio Status UI",
  info: "Read-only status UI; execution order is encoded by the stable script id"
});
const LEGACY_RUNTIME_GUARD_SCRIPT = Object.freeze({
  id: "rp_card_studio_runtime_guard",
  name: "RP Card Studio Runtime Guard",
  info: "MVU runtime guard; execution order is encoded by the stable script id"
});
const RUNTIME_GUARD_SCRIPT = Object.freeze({
  id: "rp_card_studio_runtime_guard",
  name: "SillyTavern制卡工坊：MVU 运行守卫",
  info: "MVU 运行守卫；执行顺序由稳定脚本 ID 确定"
});
const DEPENDENCY_SCRIPT_PREFIX = "rp_card_studio_dependency_";
const MVU_RUNTIME_SCRIPT = Object.freeze({
  id: "rp_card_studio_00_mvu_runtime",
  name: "MVU：运行引擎",
  info: `固定版本 MVU 运行引擎：${MANAGED_MVU_RUNTIME.version}`
});
const MVU_SCHEMA_SCRIPT = Object.freeze({
  id: "rp_card_studio_10_mvu_schema",
  name: "MVU：变量结构",
  info: `由变量账本生成；注册器版本：${MANAGED_MVU_SCHEMA_RUNTIME.version}`
});

function zodLiteral(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "undefined" : serialized.replaceAll("<", "\\u003c");
}

function zodVariableExpression(variable) {
  const constraints = variable.constraints ?? {};
  let expression;
  switch (variable.type) {
    case "integer":
      expression = "z.coerce.number().int()";
      break;
    case "number":
      expression = "z.coerce.number()";
      break;
    case "boolean":
      expression = "z.boolean()";
      break;
    case "enum": {
      const values = Array.isArray(constraints.values) ? constraints.values : [];
      if (values.length > 0 && values.every((value) => typeof value === "string")) {
        expression = `z.enum(${zodLiteral(values)})`;
      } else if (values.length === 1) {
        expression = `z.literal(${zodLiteral(values[0])})`;
      } else if (values.length > 1) {
        expression = `z.union([${values.map((value) => `z.literal(${zodLiteral(value)})`).join(",")}])`;
      } else {
        expression = "z.union([z.string(),z.number(),z.boolean()])";
      }
      break;
    }
    case "array":
      expression = "z.array(z.unknown())";
      break;
    case "object":
      expression = "z.record(z.string(), z.unknown())";
      break;
    default:
      expression = "z.string()";
      break;
  }
  if (typeof constraints.minimum === "number" && ["integer", "number"].includes(variable.type)) {
    expression += `.min(${zodLiteral(constraints.minimum)})`;
  }
  if (typeof constraints.maximum === "number" && ["integer", "number"].includes(variable.type)) {
    expression += `.max(${zodLiteral(constraints.maximum)})`;
  }
  if (typeof constraints.pattern === "string" && variable.type === "string") {
    expression += `.regex(new RegExp(${zodLiteral(constraints.pattern)}))`;
  }
  if (Number.isInteger(constraints.max_items) && variable.type === "array") {
    expression += `.max(${constraints.max_items})`;
  }
  return expression;
}

function mvuSchemaScript(mvuSources) {
  const root = { children: new Map(), expression: null };
  const variables = mvuSources.flatMap((source) => source.mvu?.enabled ? source.mvu.variables ?? [] : []);
  for (const variable of variables) {
    let cursor = root;
    for (const segment of variable.source_path.split(".")) {
      if (!cursor.children.has(segment)) cursor.children.set(segment, { children: new Map(), expression: null });
      cursor = cursor.children.get(segment);
    }
    cursor.expression = zodVariableExpression(variable);
  }
  const compileNode = (node) => {
    if (node.expression) return node.expression;
    const fields = [...node.children.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${compileNode(child)}`);
    return `z.object({${fields.join(",")}})`;
  };
  return `import { registerMvuSchema } from ${JSON.stringify(MANAGED_MVU_SCHEMA_RUNTIME.url)};

const Schema = ${compileNode(root)};

$(() => {
  registerMvuSchema(Schema);
  console.info("[SillyTavern制卡工坊] MVU 变量结构已注册：MVU 更新约束与 Tavern Helper 消息变量校验均已接入");
});`;
}

function isReservedTavernHelperScriptId(id) {
  return id === DEPRECATED_PARENT_STATUS_SCRIPT_FINGERPRINT.id
    || id === RUNTIME_GUARD_SCRIPT.id
    || id === MVU_RUNTIME_SCRIPT.id
    || id === MVU_SCHEMA_SCRIPT.id
    || (typeof id === "string" && id.startsWith(DEPENDENCY_SCRIPT_PREFIX));
}

function isDeprecatedParentStatusScript(script) {
  const content = script?.content;
  return script?.id === DEPRECATED_PARENT_STATUS_SCRIPT_FINGERPRINT.id
    && script?.name === DEPRECATED_PARENT_STATUS_SCRIPT_FINGERPRINT.name
    && script?.info === DEPRECATED_PARENT_STATUS_SCRIPT_FINGERPRINT.info
    && typeof content === "string"
    && content.includes('Symbol.for("rp_card_studio.status_ui")')
    && content.includes("globalThis.parent")
    && content.includes('getElementById("sheld")')
    && content.includes('getElementById("form_sheld")');
}

function isRuntimeGuardScript(script) {
  const content = script?.content;
  return script?.id === RUNTIME_GUARD_SCRIPT.id
    && [RUNTIME_GUARD_SCRIPT, LEGACY_RUNTIME_GUARD_SCRIPT].some((fingerprint) => (
      script?.name === fingerprint.name && script?.info === fingerprint.info
    ))
    && typeof content === "string"
    && content.includes('Symbol.for("rp_card_studio.runtime_guard")')
    && content.includes('waitGlobalInitialized("Mvu")')
    && content.includes("getMvuData")
    && content.includes("replaceMvuData");
}

function isDependencyScript(script) {
  const id = script?.id;
  if (typeof id !== "string" || !id.startsWith(DEPENDENCY_SCRIPT_PREFIX)) return false;
  const dependencyId = id.slice(DEPENDENCY_SCRIPT_PREFIX.length);
  const currentName = `SillyTavern制卡工坊依赖：${dependencyId}`;
  const legacyName = `RP Card Studio dependency: ${dependencyId}`;
  if (!dependencyId || ![currentName, legacyName].includes(script?.name)) return false;
  if (typeof script?.info !== "string"
    || !(script.info.startsWith("固定版本远程依赖：") || script.info.startsWith("Pinned remote dependency "))) return false;
  const match = /^import\s+([\s\S]+);$/.exec(script?.content ?? "");
  if (!match) return false;
  try {
    return typeof JSON.parse(match[1]) === "string";
  } catch {
    return false;
  }
}

function isManagedMvuRuntimeScript(script) {
  return script?.id === MVU_RUNTIME_SCRIPT.id
    && script?.name === MVU_RUNTIME_SCRIPT.name
    && script?.info === MVU_RUNTIME_SCRIPT.info
    && script?.content === `import ${JSON.stringify(MANAGED_MVU_RUNTIME.url)};`;
}

function isManagedMvuSchemaScript(script) {
  return script?.id === MVU_SCHEMA_SCRIPT.id
    && script?.name === MVU_SCHEMA_SCRIPT.name
    && script?.info === MVU_SCHEMA_SCRIPT.info
    && typeof script?.content === "string"
    && script.content.includes(`from ${JSON.stringify(MANAGED_MVU_SCHEMA_RUNTIME.url)}`)
    && script.content.includes("registerMvuSchema(Schema)");
}

function isRecognizableTavernHelperScript(script) {
  return isDeprecatedParentStatusScript(script)
    || isRuntimeGuardScript(script)
    || isManagedMvuRuntimeScript(script)
    || isManagedMvuSchemaScript(script)
    || isDependencyScript(script);
}

export function applyTavernHelperAdapter(payload, { project, sources, target }) {
  if (target !== "character") return { payload, issues: [] };
  const mvuSources = values(sources, "mvu");
  const mvuAdapter = mvuSources.find((source) => source.runtime_contract?.adapter?.id === "tavern_helper" && source.runtime_contract.adapter.delivery === "embedded")?.runtime_contract?.adapter ?? null;
  const runtimeEnabled = mvuSources.some((source) => source.mvu?.enabled)
    && project?.features?.mvu;
  const runtimeConfig = tavernHelperRuntimeConfig(mvuSources, payload?.data?.name);
  const generated = [];
  if (runtimeEnabled && mvuAdapter) {
    generated.push(tavernHelperScript({
      ...MVU_RUNTIME_SCRIPT,
      enabled: true,
      content: `import ${JSON.stringify(MANAGED_MVU_RUNTIME.url)};`
    }));
    generated.push(tavernHelperScript({
      ...MVU_SCHEMA_SCRIPT,
      enabled: true,
      content: mvuSchemaScript(mvuSources)
    }));
    const seenImports = new Set();
    for (const dependency of runtimeConfig.remoteImports) {
      if (dependency.id === "mvu") continue;
      if (seenImports.has(dependency.url)) continue;
      seenImports.add(dependency.url);
      generated.push(tavernHelperScript({
        id: `rp_card_studio_dependency_${dependency.id}`,
        name: `SillyTavern制卡工坊依赖：${dependency.id}`,
        enabled: true,
        info: `固定版本远程依赖：${dependency.version ?? "未标版本"}`,
        content: `import ${JSON.stringify(dependency.url)};`
      }));
    }
  }
  if (runtimeEnabled && mvuAdapter) generated.push(tavernHelperScript({
    id: "rp_card_studio_runtime_guard",
    name: RUNTIME_GUARD_SCRIPT.name,
    enabled: true,
    info: RUNTIME_GUARD_SCRIPT.info,
    content: runtimeGuardScript(runtimeConfig)
  }));
  const existingScripts = payload?.data?.extensions?.tavern_helper?.scripts;
  const cleanupNeeded = Array.isArray(existingScripts)
    && existingScripts.some((script) => isReservedTavernHelperScriptId(script?.id));
  if (generated.length === 0 && !cleanupNeeded) return { payload, issues: [] };

  // Tavern Helper sorts enabled scripts by id, not by card order or a custom
  // load_order field. Keep its generated block deterministic while preserving
  // the relative order of user-owned scripts in the serialized card.
  generated.sort((left, right) => left.id.localeCompare(right.id));

  const output = clone(payload);
  output.data ??= {};
  if (output.data.extensions !== undefined && !isObject(output.data.extensions)) {
    return { payload: output, issues: [issue("/data/extensions", "adapter.collision", "Character extensions must be an object")] };
  }
  output.data.extensions ??= {};
  const existing = output.data.extensions.tavern_helper;
  if (existing !== undefined && !isObject(existing)) {
    return { payload: output, issues: [issue("/data/extensions/tavern_helper", "adapter.collision", "tavern_helper extension is not an object")] };
  }
  const extension = isObject(existing) ? existing : {};
  if (extension.scripts !== undefined && !Array.isArray(extension.scripts)) {
    return { payload: output, issues: [issue("/data/extensions/tavern_helper/scripts", "adapter.collision", "tavern_helper scripts must be an array")] };
  }
  extension.scripts = extension.scripts ?? [];
  const generatedById = new Map(generated.map((script) => [script.id, script]));
  const retained = [];
  const collisions = new Set();
  const reservedCollisions = new Set();
  for (const script of extension.scripts) {
    const desired = generatedById.get(script?.id);
    const recognizable = isRecognizableTavernHelperScript(script);
    if (!desired && isReservedTavernHelperScriptId(script?.id)) {
      if (recognizable) continue;
      retained.push(script);
      reservedCollisions.add(script.id);
      continue;
    }
    if (!desired) {
      retained.push(script);
      continue;
    }
    if (canonicalJson(script) !== canonicalJson(desired) && !recognizable) {
      retained.push(script);
      collisions.add(script.id);
    }
  }
  const issues = [...reservedCollisions].map((id) => issue(
    "/data/extensions/tavern_helper/scripts",
    "adapter.script_collision",
    `Refusing to remove unrecognized Tavern Helper script using reserved managed id: ${id}`
  ));
  for (const script of generated) {
    if (collisions.has(script.id)) {
      issues.push(issue("/data/extensions/tavern_helper/scripts", "adapter.script_collision", `Refusing to overwrite Tavern Helper script: ${script.id}`));
      continue;
    }
    retained.push(script);
  }
  extension.scripts = retained;
  output.data.extensions.tavern_helper = extension;
  return { payload: output, issues };
}

const STATUS_PLACEHOLDER = "<StatusPlaceHolderImpl/>";
const STATUS_REPLY_CONTRACT_MARKER = "[RP Card Studio status placeholder contract]";
const STATUS_REPLY_CONTRACT_CONTENT = `每条助手回复都必须以且仅以一个 ${STATUS_PLACEHOLDER} 结束。若回复包含变量更新块，先输出变量更新块，再输出占位符。占位符之后不得追加正文，也不得在其他位置重复输出。`;
const MANAGED_REGEX_IDS = Object.freeze({
  mvuInitPromptFilter: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d05",
  mvuInitDisplayFilter: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d06",
  mvuPromptFilter: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d01",
  mvuPendingFold: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d02",
  mvuCompleteFold: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d03",
  statusProjection: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d04",
  statusPromptFilter: "0e4c7a2c-5c51-4a15-8f8e-f2a81f831d07"
});
const MANAGED_REGEX_NAMES = Object.freeze({
  [MANAGED_REGEX_IDS.mvuInitPromptFilter]: "MVU：从提示词移除初始化数据",
  [MANAGED_REGEX_IDS.mvuInitDisplayFilter]: "MVU：隐藏初始化数据",
  [MANAGED_REGEX_IDS.mvuPromptFilter]: "MVU：从提示词移除变量更新",
  [MANAGED_REGEX_IDS.mvuPendingFold]: "[隐藏]未完成的变量更新",
  [MANAGED_REGEX_IDS.mvuCompleteFold]: "[隐藏]变量更新",
  [MANAGED_REGEX_IDS.statusProjection]: "[界面]状态栏",
  [MANAGED_REGEX_IDS.statusPromptFilter]: "[不发送]界面占位符",
});
const LEGACY_MANAGED_REGEX_NAMES = Object.freeze({
  [MANAGED_REGEX_IDS.mvuInitPromptFilter]: "[MVU] Filter initialization from prompts",
  [MANAGED_REGEX_IDS.mvuInitDisplayFilter]: "[MVU] Hide initialization from messages",
  [MANAGED_REGEX_IDS.mvuPromptFilter]: "[MVU] Filter variable updates from prompts",
  [MANAGED_REGEX_IDS.mvuPendingFold]: "[MVU] Fold pending variable update",
  [MANAGED_REGEX_IDS.mvuCompleteFold]: "[MVU] Fold complete variable update",
  [MANAGED_REGEX_IDS.statusProjection]: "[Status] Project message status bar",
  [MANAGED_REGEX_IDS.statusPromptFilter]: "[Status] Remove placeholder from prompts",
});

function sillyTavernRegexScript({
  id,
  scriptName,
  findRegex,
  replaceString,
  placement,
  markdownOnly,
  promptOnly,
  minDepth = null,
  maxDepth = null
}) {
  return {
    id,
    scriptName,
    findRegex,
    replaceString,
    trimStrings: [],
    placement,
    disabled: false,
    markdownOnly,
    promptOnly,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth,
    maxDepth
  };
}

function mvuRegexScripts() {
  return [
    sillyTavernRegexScript({
      id: MANAGED_REGEX_IDS.mvuInitPromptFilter,
      scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.mvuInitPromptFilter],
      findRegex: "/<initvar>\\s*[\\s\\S]*?\\s*<\\/initvar>/gi",
      replaceString: "",
      placement: [1, 2],
      markdownOnly: false,
      promptOnly: true
    }),
    sillyTavernRegexScript({
      id: MANAGED_REGEX_IDS.mvuPromptFilter,
      scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.mvuPromptFilter],
      findRegex: "/<update(?:variable)?>[\\s\\S]*?(?:<\\/update(?:variable)?>|$)/gi",
      replaceString: "",
      placement: [1, 2],
      markdownOnly: false,
      promptOnly: true,
      minDepth: 2,
      maxDepth: null
    }),
    sillyTavernRegexScript({
      id: MANAGED_REGEX_IDS.mvuInitDisplayFilter,
      scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.mvuInitDisplayFilter],
      findRegex: "/<initvar>\\s*[\\s\\S]*?\\s*<\\/initvar>/gi",
      replaceString: "",
      placement: [2],
      markdownOnly: true,
      promptOnly: false
    }),
    sillyTavernRegexScript({
      id: MANAGED_REGEX_IDS.mvuPendingFold,
      scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.mvuPendingFold],
      findRegex: "/<update(?:variable)?>(?![\\s\\S]*?<\\/update(?:variable)?>)\\s*([\\s\\S]*?)\\s*(?=<StatusPlaceHolderImpl\\s*\\/>\\s*$|$)/i",
      replaceString: "",
      placement: [2],
      markdownOnly: true,
      promptOnly: false
    }),
    sillyTavernRegexScript({
      id: MANAGED_REGEX_IDS.mvuCompleteFold,
      scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.mvuCompleteFold],
      findRegex: "/<update(?:variable)?>\\s*([\\s\\S]*?)\\s*<\\/update(?:variable)?>/gi",
      replaceString: "",
      placement: [2],
      markdownOnly: true,
      promptOnly: false
    })
  ];
}

function escapeHtml(value) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => replacements[character]);
}

function statusRuntimePath(sourcePath, runtimeConfig, field = null) {
  const namespace = field?.data_source ?? runtimeConfig.namespace ?? "stat_data";
  const mapped = runtimeConfig.pathMappings[sourcePath] ?? sourcePath;
  const semanticPath = mapped.replace(/^(?:stat_data|display_data)\./, "");
  return `${namespace}.${semanticPath}`;
}

function compileStatusText(template, runtimeConfig, fieldsBySourcePath = new Map()) {
  return escapeHtml(template).replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}/g,
    (_match, sourcePath) => {
      const suffix = fieldsBySourcePath.get(sourcePath)?.format === "percent" ? "%" : "";
      return `{{format_message_variable::${statusRuntimePath(sourcePath, runtimeConfig, fieldsBySourcePath.get(sourcePath))}}}${suffix}`;
    }
  );
}

function statusProjectionHtml(ui, runtimeConfig) {
  const hierarchy = new Map((ui.visual?.hierarchy ?? []).map((id, index) => [id, index]));
  const fieldsBySourcePath = new Map((ui.sections ?? []).flatMap((section) => (
    (section.fields ?? []).map((field) => [field.source_path, field])
  )));
  const sections = [...ui.sections ?? []].sort((left, right) => {
    const leftRank = hierarchy.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = hierarchy.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || (left.priority ?? 0) - (right.priority ?? 0);
  });
  const summary = typeof ui.text_template === "string" && ui.text_template.trim().length > 0
    ? `<div style="grid-column:1/-1;font-weight:650;color:#f4f4f5">${compileStatusText(ui.text_template, runtimeConfig, fieldsBySourcePath)}</div>`
    : "";
  const sectionMarkup = sections.map((section) => {
    const fields = (section.fields ?? []).map((field) => {
      const macro = `{{format_message_variable::${statusRuntimePath(field.source_path, runtimeConfig, field)}}}`;
      const suffix = field.format === "percent" ? "%" : "";
      return `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:baseline"><dt style="min-width:0;color:#a1a1aa">${escapeHtml(field.label ?? field.id)}</dt><dd style="margin:0;color:#fafafa;font-weight:650;overflow-wrap:anywhere">${macro}${suffix}</dd></div>`;
    }).join("");
    if (!fields) return "";
    const open = section.collapsed === true ? "" : " open";
    return `<details${open} style="min-width:0;border-top:1px solid #3f3f46;padding-top:6px"><summary style="cursor:pointer;font-size:11px;color:#67e8f9">${escapeHtml(section.display_name ?? section.id)}</summary><dl style="display:grid;gap:4px;margin:6px 0 0">${fields}</dl></details>`;
  }).join("");
  const fallback = compileStatusText(ui.states?.degraded ?? "Status unavailable", runtimeConfig);
  const liveMode = ["polite", "assertive"].includes(ui.accessibility?.live_updates)
    ? ui.accessibility.live_updates
    : "off";
  return `<div data-rp-card-studio="status" role="status" aria-live="${liveMode}" aria-atomic="true" style="box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid #3f3f46;border-left:3px solid #22d3ee;border-radius:6px;background:#18181b;color:#e4e4e7;font:12px/1.45 system-ui,sans-serif;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px">${summary}${sectionMarkup || `<div>${fallback}</div>`}</div>`;
}

function statusTemplateTokens(template, runtimeConfig, fieldsBySourcePath) {
  const source = String(template ?? "");
  const tokens = [];
  const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) tokens.push({ type: "text", value: source.slice(cursor, match.index) });
    const field = fieldsBySourcePath.get(match[1]);
    if (field) {
      tokens.push({
        type: "value",
        runtimePath: statusRuntimePath(match[1], runtimeConfig, field),
        format: field.format,
        missing: field.missing_value
      });
    } else {
      tokens.push({ type: "text", value: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ type: "text", value: source.slice(cursor) });
  return tokens;
}

function statusMessageConfig(ui, runtimeConfig) {
  const hierarchy = new Map((ui.visual?.hierarchy ?? []).map((id, index) => [id, index]));
  const playerSections = [...ui.sections ?? []]
    .map((section) => ({
      id: section.id,
      displayName: section.display_name ?? section.id,
      priority: section.priority ?? 0,
      collapsed: section.collapsed === true,
      fields: (section.fields ?? [])
        .filter((field) => field.visibility === "player")
        .map((field) => ({
          id: field.id,
          label: field.label ?? field.id,
          runtimePath: statusRuntimePath(field.source_path, runtimeConfig, field),
          sourcePath: field.source_path,
          format: field.format,
          missing: field.missing_value ?? "Unavailable"
        }))
    }))
    .filter((section) => section.fields.length > 0)
    .sort((left, right) => {
      const leftRank = hierarchy.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = hierarchy.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.priority - right.priority;
    });
  const fieldsBySourcePath = new Map(playerSections.flatMap((section) => section.fields.map((field) => [field.sourcePath, field])));
  return {
    mode: ui.mode,
    namespace: runtimeConfig.namespace ?? "stat_data",
    summary: statusTemplateTokens(ui.text_template, runtimeConfig, fieldsBySourcePath),
    sections: playerSections.map((section) => ({
      id: section.id,
      displayName: section.displayName,
      collapsed: section.collapsed,
      fields: section.fields.map(({ sourcePath: _sourcePath, ...field }) => field)
    })),
    states: {
      loading: ui.states?.loading ?? "Loading status...",
      empty: ui.states?.empty ?? "No status is available for this message.",
      error: ui.states?.error ?? "Status could not be read.",
      degraded: ui.states?.degraded ?? "The message runtime is unavailable."
    },
    liveMode: ["polite", "assertive"].includes(ui.accessibility?.live_updates)
      ? ui.accessibility.live_updates
      : "off",
    pollIntervalMs: 100,
    steadyPollIntervalMs: 2000,
    maxAttempts: 40
  };
}

const STATUS_MESSAGE_RUNTIME = `(function () {
  "use strict";
  var root = document.getElementById("rp-card-status");
  function showFatalState() {
    if (!root) return;
    root.setAttribute("data-rp-runtime-state", "error");
    root.replaceChildren();
    var message = document.createElement("p");
    message.className = "rp-status-state";
    message.textContent = "状态栏暂时无法读取。";
    root.appendChild(message);
  }
  try {
  var config = __RP_STATUS_CONFIG__;
  var timer = null;
  var attempts = 0;
  var disposed = false;
  var ready = false;
  var lastFingerprint = null;
  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function cleanup() {
    disposed = true;
    clearTimer();
  }
  function stateText(name) {
    return config.states[name] || config.states.error;
  }
  function showState(name) {
    if (!root || disposed) return;
    root.setAttribute("data-rp-runtime-state", name);
    root.replaceChildren();
    var message = document.createElement("p");
    message.className = "rp-status-state";
    message.textContent = stateText(name);
    root.appendChild(message);
  }
  function getAt(value, path) {
    return String(path).split(".").reduce(function (current, name) {
      return current == null ? undefined : current[name];
    }, value);
  }
  function displayValue(value, binding) {
    if (value === undefined || value === null) return binding.missing;
    if (binding.format === "percent") return String(value) + "%";
    if (binding.format === "list" || binding.format === "object") {
      try { return JSON.stringify(value); } catch (_error) { return binding.missing; }
    }
    return String(value);
  }
  function appendValue(parent, variables, binding) {
    var value = document.createElement("span");
    value.className = "rp-status-value";
    value.setAttribute("data-rp-status-path", binding.runtimePath);
    value.textContent = displayValue(getAt(variables, binding.runtimePath), binding);
    parent.appendChild(value);
  }
  function appendSummary(parent, variables) {
    if (!Array.isArray(config.summary) || config.summary.length === 0) return;
    var summary = document.createElement("div");
    summary.className = "rp-status-summary";
    config.summary.forEach(function (token) {
      if (token.type === "text") {
        summary.appendChild(document.createTextNode(token.value));
      } else {
        appendValue(summary, variables, token);
      }
    });
    parent.appendChild(summary);
  }
  function appendSections(parent, variables) {
    config.sections.forEach(function (section) {
      var details = document.createElement("details");
      details.className = "rp-status-section";
      details.open = !section.collapsed;
      var summary = document.createElement("summary");
      summary.textContent = section.displayName;
      details.appendChild(summary);
      var list = document.createElement("dl");
      section.fields.forEach(function (field) {
        var row = document.createElement("div");
        row.className = "rp-status-row";
        var term = document.createElement("dt");
        term.textContent = field.label;
        var definition = document.createElement("dd");
        appendValue(definition, variables, field);
        row.appendChild(term);
        row.appendChild(definition);
        list.appendChild(row);
      });
      details.appendChild(list);
      parent.appendChild(details);
    });
  }
  function render(variables) {
    if (!root || disposed) return;
    root.setAttribute("data-rp-runtime-state", "ready");
    root.replaceChildren();
    appendSummary(root, variables);
    if (config.mode !== "text") appendSections(root, variables);
    if (!root.hasChildNodes()) showState("empty");
  }
  function displayFingerprint(variables) {
    var values = [];
    config.summary.forEach(function (token) {
      if (token.type === "value") {
        values.push([token.runtimePath, displayValue(getAt(variables, token.runtimePath), token)]);
      }
    });
    config.sections.forEach(function (section) {
      section.fields.forEach(function (field) {
        values.push([field.runtimePath, displayValue(getAt(variables, field.runtimePath), field)]);
      });
    });
    return JSON.stringify(values);
  }
  function schedule(delay) {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(safeAttempt, delay);
  }
  function retry(finalState) {
    if (disposed) return;
    if (ready) {
      schedule(config.steadyPollIntervalMs);
      return;
    }
    attempts += 1;
    if (attempts >= config.maxAttempts) {
      showState(finalState);
      return;
    }
    schedule(config.pollIntervalMs);
  }
  function attempt() {
    clearTimer();
    if (disposed) return;
    if (typeof globalThis.getCurrentMessageId !== "function" || typeof globalThis.getVariables !== "function") {
      retry("degraded");
      return;
    }
    var messageId;
    try {
      messageId = globalThis.getCurrentMessageId();
    } catch (_error) {
      showState("error");
      return;
    }
    if (!Number.isInteger(messageId) || messageId < 0) {
      showState("error");
      return;
    }
    var variables;
    try {
      variables = globalThis.getVariables({ type: "message", message_id: messageId });
    } catch (_error) {
      retry("error");
      return;
    }
    var namespace = getAt(variables, config.namespace);
    if (!namespace || typeof namespace !== "object" || Array.isArray(namespace)) {
      retry("empty");
      return;
    }
    var fingerprint = displayFingerprint(variables);
    if (!ready || fingerprint !== lastFingerprint) {
      render(variables);
      ready = true;
      lastFingerprint = fingerprint;
    }
    attempts = 0;
    schedule(config.steadyPollIntervalMs);
  }
  function safeAttempt() {
    try {
      attempt();
    } catch (_error) {
      showFatalState();
    }
  }
  if (root) {
    root.setAttribute("aria-live", config.liveMode);
    showState("loading");
  }
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("pagehide", cleanup, { once: true });
    globalThis.addEventListener("unload", cleanup, { once: true });
  }
  safeAttempt();
  } catch (_error) {
    showFatalState();
  }
})();`;

function inlineScriptJson(value) {
  return JSON.stringify(value).replace(/[<>&$\u2028\u2029]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  ));
}

function statusMessageFrontend(ui, runtimeConfig) {
  const config = statusMessageConfig(ui, runtimeConfig);
  const runtime = STATUS_MESSAGE_RUNTIME.replace("__RP_STATUS_CONFIG__", inlineScriptJson(config));
  const loadingText = escapeHtml(config.states.loading).replace(/\$/g, "&#36;");
  return [
    "```",
    '<body data-rp-card-studio="status-frame">',
    "<title>消息状态栏</title>",
    "<style>",
    'body[data-rp-card-studio="status-frame"]{margin:0;padding:0;background:transparent;color:#e4e4e7;font:12px/1.45 system-ui,sans-serif}',
    '#rp-card-status{box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid #3f3f46;border-left:3px solid #22d3ee;border-radius:6px;background:#18181b;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}',
    '.rp-status-summary{grid-column:1/-1;font-weight:650;color:#f4f4f5;overflow-wrap:anywhere}',
    '.rp-status-section{min-width:0;border-top:1px solid #3f3f46;padding-top:6px}',
    '.rp-status-section>summary{cursor:pointer;font-size:11px;color:#67e8f9}',
    '.rp-status-section>dl{display:grid;gap:4px;margin:6px 0 0}',
    '.rp-status-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:baseline}',
    '.rp-status-row>dt{min-width:0;color:#a1a1aa;overflow-wrap:anywhere}',
    '.rp-status-row>dd{margin:0;color:#fafafa;font-weight:650;overflow-wrap:anywhere}',
    '.rp-status-state{grid-column:1/-1;margin:0;color:#a1a1aa;overflow-wrap:anywhere}',
    '@media(max-width:520px){#rp-card-status{grid-template-columns:minmax(0,1fr)}.rp-status-row{grid-template-columns:minmax(0,1fr)}}',
    "</style>",
    `<main id="rp-card-status" data-rp-runtime-state="loading" role="status" aria-atomic="true"><p class="rp-status-state">${loadingText}</p></main>`,
    "<script>",
    runtime,
    "</script>",
    "</body>",
    "```"
  ].join("\n");
}

function statusRegexScript(ui, runtimeConfig) {
  const messageRuntime = ui.delivery?.adapter === "tavern_helper_message";
  const fieldsBySourcePath = new Map((ui.sections ?? []).flatMap((section) => (
    (section.fields ?? []).map((field) => [field.source_path, field])
  )));
  const projection = messageRuntime
    ? statusMessageFrontend(ui, runtimeConfig)
    : ui.mode === "text"
      ? compileStatusText(ui.text_template || ui.states?.degraded || "Status unavailable", runtimeConfig, fieldsBySourcePath)
      : statusProjectionHtml(ui, runtimeConfig);
  return sillyTavernRegexScript({
    id: MANAGED_REGEX_IDS.statusProjection,
    scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.statusProjection],
    findRegex: "/<StatusPlaceHolderImpl\\s*\\/>/g",
    // SillyTavern interprets every $n in replaceString as a capture reference,
    // even though it uses a replacement callback. An HTML entity is the only
    // stable literal dollar representation after Markdown rendering.
    replaceString: messageRuntime ? projection : projection.replace(/\$/g, "&#36;"),
    placement: [2],
    markdownOnly: true,
    promptOnly: false
  });
}

function statusPromptFilterRegexScript() {
  return sillyTavernRegexScript({
    id: MANAGED_REGEX_IDS.statusPromptFilter,
    scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.statusPromptFilter],
    findRegex: "/<StatusPlaceHolderImpl\\s*\\/>/g",
    replaceString: "",
    placement: [2],
    markdownOnly: false,
    promptOnly: true
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function normalizeStatusPlaceholder(value) {
  const withoutPlaceholders = String(value ?? "")
    .replace(/<StatusPlaceHolderImpl\s*\/>/gi, "")
    .trimEnd();
  return `${withoutPlaceholders}${withoutPlaceholders ? "\n\n" : ""}${STATUS_PLACEHOLDER}`;
}

function removeStatusPlaceholders(value) {
  return String(value ?? "")
    .replace(/<StatusPlaceHolderImpl\s*\/>/gi, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function removeStatusReplyContract(value) {
  const existing = String(value ?? "");
  if (!existing.includes(STATUS_REPLY_CONTRACT_MARKER)) return existing;
  return existing
    .replace(/\[RP Card Studio status placeholder contract\]\r?\n[^\r\n]*(?:\r?\n)?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function syncStatusReplyContract(output, enabled) {
  output.data ??= {};
  const book = output.data.character_book;
  const existingEntries = Array.isArray(book?.entries)
    ? book.entries
    : isObject(book?.entries) ? Object.values(book.entries) : [];
  const sourceKey = "status:reply_contract";
  const existingIndex = existingEntries.findIndex((entry) => characterBookTrackingKey(entry) === sourceKey);
  if (!enabled) {
    if (existingIndex >= 0) existingEntries.splice(existingIndex, 1);
    if (book) book.entries = existingEntries;
    return [];
  }
  const allocator = createCharacterBookIdAllocator(existingEntries);
  const allocation = allocator.allocateMany([sourceKey]).get(sourceKey);
  const generated = mvuCharacterBookEntry({
    id: allocation.id,
    sourceId: "reply_contract",
    sourceKey,
    comment: "状态栏：回复输出约定",
    content: STATUS_REPLY_CONTRACT_CONTENT,
    enabled: true,
    kind: "status_reply_contract",
    order: 14723,
    depth: 0,
  });
  output.data.character_book ??= {
    name: `${output.data.name ?? "未命名角色"} 世界书`,
    description: "SillyTavern制卡工坊状态栏输出规则",
    scan_depth: null,
    token_budget: null,
    recursive_scanning: false,
    extensions: {},
    entries: [],
  };
  if (existingIndex >= 0 && allocation.reused) existingEntries[existingIndex] = generated;
  else existingEntries.push(generated);
  output.data.character_book.entries = existingEntries;
  return allocation.collision
    ? [issue(`/data/character_book/entries/${generated.id}`, "status.id_collision", `Stable CharacterBook id ${allocation.candidate} was occupied; assigned ${allocation.id} to ${sourceKey}`)]
    : [];
}

function activeStatusUi(project, sources) {
  if (project?.features?.status_ui !== true) return null;
  return values(sources, "ui").find((source) => source.status_ui?.enabled
    && ["text", "embedded", "both"].includes(source.status_ui.mode)
    && completeUiDelivery(source.status_ui))?.status_ui ?? null;
}

function managedRegexFingerprint(script) {
  return canonicalJson({
    scriptName: script?.scriptName,
    findRegex: script?.findRegex,
    trimStrings: script?.trimStrings,
    placement: script?.placement,
    disabled: script?.disabled,
    markdownOnly: script?.markdownOnly,
    promptOnly: script?.promptOnly,
    runOnEdit: script?.runOnEdit,
    substituteRegex: script?.substituteRegex,
    minDepth: script?.minDepth,
    maxDepth: script?.maxDepth
  });
}

function isRecognizableManagedRegexScript(script) {
  if (!Object.values(MANAGED_REGEX_IDS).includes(script?.id)) return false;
  const expected = script.id === MANAGED_REGEX_IDS.statusProjection
    ? {
      scriptName: MANAGED_REGEX_NAMES[MANAGED_REGEX_IDS.statusProjection],
      findRegex: "/<StatusPlaceHolderImpl\\s*\\/>/g",
      trimStrings: [],
      placement: [2],
      disabled: false,
      markdownOnly: true,
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null
    }
    : script.id === MANAGED_REGEX_IDS.statusPromptFilter
      ? statusPromptFilterRegexScript()
      : mvuRegexScripts().find((candidate) => candidate.id === script.id);
  if (!expected) return false;
  const actualFingerprint = managedRegexFingerprint(script);
  if (actualFingerprint === managedRegexFingerprint(expected)) return true;
  const legacyName = LEGACY_MANAGED_REGEX_NAMES[script.id];
  return Boolean(legacyName)
    && actualFingerprint === managedRegexFingerprint({ ...expected, scriptName: legacyName });
}

function mergeManagedRegexScripts(output, generated) {
  output.data ??= {};
  if (output.data.extensions === undefined && generated.length === 0) return [];
  if (output.data.extensions !== undefined && !isObject(output.data.extensions)) {
    return [issue("/data/extensions", "sillytavern_regex.collision", "Character extensions must be an object")];
  }
  output.data.extensions ??= {};
  const existing = output.data.extensions.regex_scripts;
  if (existing === undefined && generated.length === 0) return [];
  if (existing !== undefined && !Array.isArray(existing)) {
    return [issue("/data/extensions/regex_scripts", "sillytavern_regex.collision", "regex_scripts must be an array")];
  }
  const desiredById = new Map(generated.map((script) => [script.id, script]));
  const collisions = new Set();
  const retained = [];
  for (const script of existing ?? []) {
    const desired = desiredById.get(script?.id);
    if (!desired) {
      if (isRecognizableManagedRegexScript(script)) continue;
      retained.push(script);
      continue;
    }
    if (canonicalJson(script) !== canonicalJson(desired) && !isRecognizableManagedRegexScript(script)) {
      retained.push(script);
      collisions.add(script.id);
    }
  }
  const issues = [...collisions].map((id) => issue(
    "/data/extensions/regex_scripts",
    "sillytavern_regex.id_collision",
    `Refusing to overwrite SillyTavern regex script: ${id}`
  ));
  output.data.extensions.regex_scripts = [
    ...retained,
    ...generated.filter((script) => !collisions.has(script.id))
  ];
  return issues;
}

export function applySillyTavernRegexAdapter(payload, { project, sources, target }) {
  if (target !== "character") return { payload, issues: [] };
  const mvuSources = values(sources, "mvu");
  const mvuEnabled = project?.features?.mvu === true && mvuSources.some((source) => source.mvu?.enabled);
  const ui = activeStatusUi(project, sources);

  const output = clone(payload);
  const generated = mvuEnabled ? mvuRegexScripts() : [];
  output.data ??= {};
  if (typeof output.data.post_history_instructions === "string") {
    output.data.post_history_instructions = removeStatusReplyContract(output.data.post_history_instructions);
  }
  const contractWarnings = syncStatusReplyContract(output, Boolean(ui) && !mvuEnabled);
  if (ui) {
    const runtimeConfig = tavernHelperRuntimeConfig(mvuSources);
    generated.push(statusPromptFilterRegexScript());
    generated.push(statusRegexScript(ui, runtimeConfig));
    output.data.first_mes = normalizeStatusPlaceholder(output.data.first_mes);
    output.data.alternate_greetings = Array.isArray(output.data.alternate_greetings)
      ? output.data.alternate_greetings.map(normalizeStatusPlaceholder)
      : [];
  } else if (isObject(output.data)) {
    if (typeof output.data.first_mes === "string") {
      output.data.first_mes = removeStatusPlaceholders(output.data.first_mes);
    }
    if (Array.isArray(output.data.alternate_greetings)) {
      output.data.alternate_greetings = output.data.alternate_greetings.map(removeStatusPlaceholders);
    }
  }
  const issues = mergeManagedRegexScripts(output, generated);
  return { payload: output, issues, warnings: contractWarnings };
}

function hostWorldbookLookup(registry, name) {
  if (!name) return null;
  if (registry instanceof Map) return registry.get(name) ?? null;
  if (isObject(registry) && !Array.isArray(registry)) return registry[name] ?? null;
  return null;
}

function hostWorldbookEntries(book) {
  const container = book?.entries;
  if (Array.isArray(container)) return container;
  if (isObject(container) && !Array.isArray(container)) return Object.values(container);
  return [];
}

function managedHostEntries(book) {
  return hostWorldbookEntries(book).filter((entry) => {
    const tracking = entry?.extensions?.rp_card_studio;
    return tracking?.generated === true
      && typeof tracking.source_key === "string"
      && tracking.source_key.length > 0;
  });
}

function parseHostInitvar(entry) {
  if (!entry || !/\[initvar\]/i.test(entry.comment ?? "")) return null;
  try {
    const value = JSON.parse(entry.content);
    return isObject(value) && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function auditSillyTavernMvuLifecycle(payload, worldbookRegistry = {}, hostSettings = {}) {
  const embedded = payload?.data?.character_book;
  const bookName = typeof embedded?.name === "string" ? embedded.name : null;
  const binding = payload?.data?.extensions?.world;
  const hostBook = hostWorldbookLookup(worldbookRegistry, bookName);
  const embeddedManaged = managedHostEntries(embedded);
  const hostManaged = new Map(managedHostEntries(hostBook).map((entry) => [
    entry.extensions.rp_card_studio.source_key,
    entry,
  ]));
  const managedEntries = embeddedManaged.map((entry) => {
    const sourceKey = entry.extensions.rp_card_studio.source_key;
    const hostEntry = hostManaged.get(sourceKey);
    return {
      source_key: sourceKey,
      present: Boolean(hostEntry),
      content_matches: Boolean(hostEntry) && hostEntry.content === entry.content,
    };
  });
  const embeddedInitvar = embeddedManaged.find((entry) => (
    entry.extensions.rp_card_studio.source_key === "mvu:initvar"
  ));
  const hostInitvar = hostManaged.get("mvu:initvar");
  const statData = parseHostInitvar(hostInitvar);
  const bindingMatches = Boolean(bookName) && binding === bookName;
  const registryPresent = Boolean(hostBook);
  const managedContentMatches = embeddedManaged.length > 0
    && managedEntries.every((entry) => entry.present && entry.content_matches);
  const initvarRecognizable = Boolean(embeddedInitvar)
    && /\[initvar\]/i.test(embeddedInitvar.comment ?? "")
    && Boolean(statData);
  const blobUrlRendering = typeof hostSettings?.tavern_helper?.render?.use_blob_url === "boolean"
    ? hostSettings.tavern_helper.render.use_blob_url
    : null;
  const cardName = payload?.data?.name;
  const enabledCharacterScripts = hostSettings?.tavern_helper?.scripts?.enabled_characters;
  const characterScriptsEnabled = typeof hostSettings?.tavern_helper?.scripts?.character_enabled === "boolean"
    ? hostSettings.tavern_helper.scripts.character_enabled
    : Array.isArray(enabledCharacterScripts) && typeof cardName === "string"
      ? enabledCharacterScripts.includes(cardName)
      : null;
  const mvuStarted = typeof hostSettings?.runtime_observation?.mvu_started === "boolean"
    ? hostSettings.runtime_observation.mvu_started
    : null;
  const observedBlobFailure = blobUrlRendering === true && mvuStarted === false;
  const embeddedMvuScriptCompatible = observedBlobFailure ? false : mvuStarted === true ? true : null;
  const hostBlockers = [];
  if (characterScriptsEnabled === false) hostBlockers.push("tavern_helper_character_scripts_disabled");
  if (observedBlobFailure) hostBlockers.push("tavern_helper_blob_url_rendering_observed_failure");
  const ready = bindingMatches && registryPresent && managedContentMatches && initvarRecognizable;
  const runtimeReady = !ready
    ? false
    : characterScriptsEnabled === false || mvuStarted === false
      ? false
      : mvuStarted === true
        ? true
        : null;
  return {
    ready,
    runtime_ready: runtimeReady,
    book_name: bookName,
    binding,
    binding_matches: bindingMatches,
    registry_present: registryPresent,
    managed_entries: managedEntries,
    managed_content_matches: managedContentMatches,
    initvar: {
      present: Boolean(hostInitvar),
      recognizable: initvarRecognizable,
    },
    host_compatibility: {
      sillytavern_version: hostSettings?.sillytavern_version ?? null,
      tavern_helper_version: hostSettings?.tavern_helper_version ?? null,
      tavern_helper_blob_url_rendering: blobUrlRendering,
      tavern_helper_character_scripts_enabled: characterScriptsEnabled,
      mvu_started_observation: mvuStarted,
      blob_url_workaround_recommended: observedBlobFailure,
      embedded_mvu_script_compatible: embeddedMvuScriptCompatible,
      blockers: hostBlockers,
    },
    stat_data: statData,
  };
}
