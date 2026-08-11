import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

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
  const variables = mvuSources.flatMap((source) => source.mvu?.enabled ? source.mvu.variables ?? [] : []);
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
        for (const runtimePath of ejsEntry.reads ?? []) {
          const variable = byRuntime.get(runtimePath);
          if (!variable) {
            issues.push(issue(`/runtime/mvu/${sourceIndex}/ejs/entries/${entryIndex}/reads`, "mvu.reference", `EJS reads an unknown runtime path: ${runtimePath}`));
          } else if (!(variable.readers ?? []).includes("ejs")) {
            issues.push(issue(`/runtime/mvu/${sourceIndex}/ejs/entries/${entryIndex}/reads`, "mvu.reader", `Variable does not grant EJS read access: ${runtimePath}`));
          }
        }
      }
    }
  }
  return { variables, bySource, byRuntime };
}

function validateInitializations(mvuSources, openingSources, bySource, issues) {
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
    const resolved = override.strategy === "validated_merge" ? mergeValues(defaults, override.values ?? {}) : override.values ?? {};
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
        }
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
  const lifecycle = delivery?.lifecycle;
  return isObject(delivery)
    && typeof delivery.level === "string"
    && typeof delivery.adapter === "string" && delivery.adapter.length > 0
    && typeof delivery.entrypoint === "string" && delivery.entrypoint.length > 0
    && typeof delivery.artifact === "string" && delivery.artifact.length > 0
    && typeof delivery.mount_anchor === "string" && delivery.mount_anchor.length > 0
    && isObject(lifecycle)
    && Array.isArray(lifecycle.wait_for) && lifecycle.wait_for.length > 0
    && Array.isArray(lifecycle.cleanup) && ["events", "observers", "timers", "dom"].every((item) => lifecycle.cleanup.includes(item))
    && lifecycle.idempotent === true;
}

function validateUi(uiSources, bySource, project, issues, warnings) {
  const enabledSources = uiSources.filter((source) => source.status_ui?.enabled);
  if (Boolean(project?.features?.status_ui) !== (enabledSources.length > 0)) {
    issues.push(issue("/runtime/ui", "ui.lifecycle", "project.features.status_ui must match the enabled status UI sources"));
  }
  const runnable = uiSources.filter((source) => source.status_ui?.enabled
    && ["embedded", "both"].includes(source.status_ui.mode)
    && source.status_ui.delivery?.level === "embedded");
  if (runnable.length > 1) {
    issues.push(issue("/runtime/ui", "ui.delivery.collision", "Exactly one embedded status UI may own the runtime mount"));
  }
  for (const [sourceIndex, source] of uiSources.entries()) {
    const ui = source.status_ui;
    if (!ui?.enabled) continue;
    if (["embedded", "both"].includes(ui.mode) && !completeUiDelivery(ui)) {
      issues.push(issue(`/runtime/ui/${sourceIndex}/status_ui/delivery`, "ui.runtime_missing", "Embedded UI requires a complete Tavern Helper delivery contract"));
    } else if (["embedded", "both"].includes(ui.mode) && ui.delivery?.level !== "embedded") {
      warnings.push(issue(`/runtime/ui/${sourceIndex}/status_ui/delivery/level`, "ui.runtime_not_run", `UI delivery level ${ui.delivery?.level} is a specification or host dependency, not an embedded runtime artifact`));
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
  const mountAnchors = new Map();
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
    if (!ui?.enabled || !["embedded", "both"].includes(ui.mode) || !ui.delivery) continue;
    const base = `/runtime/ui/${sourceIndex}/status_ui/delivery`;
    if (ui.delivery.level === "embedded") {
      register(entrypoints, ui.delivery.entrypoint, `${base}/entrypoint`, "Adapter entrypoint");
      register(artifacts, ui.delivery.artifact, `${base}/artifact`, "Adapter artifact");
      register(mountAnchors, ui.delivery.mount_anchor, `${base}/mount_anchor`, "UI mount anchor");
      if (ui.delivery.adapter !== "tavern_helper") {
        issues.push(issue(base, "adapter.unsupported", `No embedded UI adapter generator is registered for: ${ui.delivery.adapter}`));
      }
      if (ui.delivery.entrypoint !== "generated") {
        issues.push(issue(`${base}/entrypoint`, "adapter.artifact", "Embedded status UI entrypoint must be generated"));
      }
      if (ui.delivery.artifact !== "inline") {
        issues.push(issue(`${base}/artifact`, "adapter.artifact", "Embedded status UI artifact must be inline"));
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
  for (const [entryIndex, entry] of (manifest?.entries ?? []).entries()) {
    const entryPath = `${basePath}/worldbook_manifest/entries/${entryIndex}`;
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

async function validateAssembly(sources, projectRoot, issues, warnings, target) {
  const assemblies = assemblySources(sources);
  if (assemblies.length > 1) {
    issues.push(issue("/runtime/assembly", "assembly.configuration", "Exactly one assembly source may own the integration manifest"));
  }
  for (const [sourceIndex, assembly] of assemblies.entries()) {
    const manifest = assembly.worldbook_manifest;
    issues.push(...worldbookHostIssues(manifest, target, `/runtime/assembly/${sourceIndex}`));
    const ids = new Set();
    for (const [entryIndex, entry] of (manifest?.entries ?? []).entries()) {
      if (ids.has(entry.id)) issues.push(issue(`/runtime/assembly/${sourceIndex}/worldbook_manifest/entries/${entryIndex}/id`, "assembly.reference", `Duplicate worldbook entry id: ${entry.id}`));
      ids.add(entry.id);
      try {
        await resolveAssemblyContent(entry.source, sources, projectRoot);
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
    validateInitializations(mvuSources, openingSources, graph.bySource, issues);
    validateUi(uiSources, graph.bySource, project, issues, warnings);
    validateRuntimeDeliveries(mvuSources, uiSources, issues);
    validateStateBindings(sources, graph.bySource, issues);
  }
  validateStableIds(sources, issues);
  validateStrongReferences(project, sources, issues);
  validateOpeningReferences(sources, openingSources, project, issues);
  validatePresentations(openingSources, assemblySources(sources), issues);
  validateMediaConsumers(sources, issues);
  validateStateMachines(values(sources, "systems"), project, sources, issues);
  const projectTarget = runtimeAssemblyTarget(project);
  await validateAssembly(sources, projectRoot, issues, warnings, projectTarget);
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
      name: `${payload.data.name ?? "Character"} Worldbook`,
      description: "Assembled by RP Card Studio",
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
  if (Array.isArray(container)) return container.map((entry) => String(entry?.id)).filter(Boolean);
  return Object.entries(container).flatMap(([key, entry]) => {
    const ids = [String(key)];
    if (entry?.id !== undefined && entry?.id !== null) ids.push(String(entry.id));
    return ids;
  });
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

function manifestEntry(entry, content, target) {
  const activation = entry.activation ?? {};
  const insertion = entry.insertion ?? {};
  const recursion = entry.recursion ?? {};
  const probability = entry.probability ?? 100;
  const scanDepth = entry.scan_depth ?? null;
  const selectiveLogic = ({ any: 0, not_all: 1, not_any: 2, all: 3 })[activation.logic ?? "any"];
  const rawPosition = ({ before_char: 0, after_char: 1, before_example: 5, after_example: 6, at_depth: 4 })[insertion.position ?? "before_char"];
  const rawRole = ({ system: 0, user: 1, assistant: 2 })[insertion.role] ?? null;
  const rawHostFields = {
    useProbability: true,
    probability,
    excludeRecursion: Boolean(recursion.prevent_incoming),
    preventRecursion: Boolean(recursion.prevent_outgoing),
    delayUntilRecursion: Boolean(recursion.delay_until_recursion),
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
    activation: clone(activation),
    insertion: clone(insertion),
    probability,
    recursion: clone(recursion),
    recipient: entry.recipient ?? "shared",
    visibility: entry.visibility ?? "model",
    token_budget: entry.token_budget ?? null,
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
      comment: entry.display_name ?? entry.id,
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
      extensions: { ...customExtensions, rp_card_studio: tracking }
    };
  }
  return {
    id: `wb_${entry.id}`,
    keys: clone(activation.primary_keys ?? []),
    secondary_keys: clone(activation.secondary_keys ?? []),
    comment: entry.display_name ?? entry.id,
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
  const generatedIds = [];
  for (const record of records) {
    try {
      const assembled = manifestEntry(record.entry, await resolveAssemblyContent(record.entry.source, sources, projectRoot), target);
      if (outputIds.has(assembled.id)) {
        if (manifest.duplicate_policy === "keep_imported") continue;
        if (manifest.duplicate_policy === "replace_imported") {
          removeContainerEntry(container, assembled.id);
        } else {
          issues.push(issue(`/runtime/assembly/${record.sourceIndex}/worldbook_manifest/entries/${record.entryIndex}/id`, "assembly.reference", `Duplicate assembled entry id: ${assembled.id}`));
          continue;
        }
      }
      outputIds.add(assembled.id);
      if (target === "worldbook") assembled.uid = allocateWorldbookUid(usedUids);
      appendContainerEntry(container, assembled);
      generatedIds.push(assembled.id);
    } catch (error) {
      const sourceIssue = issue(`/runtime/assembly/${record.sourceIndex}/worldbook_manifest/entries/${record.entryIndex}/source`, record.entry.fallback === "skip" ? "assembly.source.skipped" : "assembly.source", error.message);
      (record.entry.fallback === "skip" ? warnings : issues).push(sourceIssue);
    }
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
      const values = override.strategy === "validated_merge" ? mergeValues(initialization.defaults ?? {}, override.values ?? {}) : clone(override.values ?? {});
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

export function selectOpeningMessages(openingSources, mvuSources = []) {
  const openings = openingSources.flatMap((source) => source.openings ?? []);
  if (openings.length === 0) return null;
  const defaultOpening = openings.find((opening) => opening.is_default) ?? openings[0];
  const defaultVariants = presentationVariants(defaultOpening);
  const selected = defaultVariants.find((variant) => variant.isDefault) ?? defaultVariants[0];
  const lookup = initializationLookup(mvuSources);
  const alternates = [];
  const alternateSelections = [];
  for (const opening of openings) {
    for (const variant of presentationVariants(opening)) {
      if (opening === defaultOpening && variant.id === selected.id) continue;
      alternates.push(variant.text);
      alternateSelections.push({ opening_id: opening.id, variant_id: variant.id, ...resolveOpeningInitialization(opening, lookup) });
    }
  }
  return {
    first: selected.text,
    alternates,
    selection: {
      default: { opening_id: defaultOpening.id, variant_id: selected.id, ...resolveOpeningInitialization(defaultOpening, lookup) },
      alternates: alternateSelections,
      evidence: "artifact_only"
    }
  };
}

function tavernHelperRuntimeConfig(mvuSources, uiSources) {
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
  const waitFor = uiSources
    .filter((source) => source.status_ui?.enabled
      && ["embedded", "both"].includes(source.status_ui.mode)
      && source.status_ui.delivery?.adapter === "tavern_helper"
      && source.status_ui.delivery?.level === "embedded")
    .flatMap((source) => source.status_ui.delivery?.lifecycle?.wait_for ?? []);
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
  return {
    probes: [...new Set(probes.length > 0 ? probes : ["globalThis.Mvu"])],
    waitFor: [...new Set(waitFor)],
    timeoutMs: timeouts.length > 0 ? Math.max(...timeouts) : 10000,
    readinessPollMs: 100,
    statePollMs: 200,
    adapter: clone(embeddedAdapter),
    pathMappings
  };
}

function runtimeGuardScript(runtimeConfig) {
  const config = JSON.stringify(runtimeConfig).replaceAll("<", "\\u003c");
  return `(() => {
  "use strict";
  const key = Symbol.for("rp_card_studio.runtime_guard");
  globalThis[key]?.cleanup?.();
  const config = ${config};
  const timers = new Set();
  const listeners = [];
  const seenEvents = new Set();
  let disposed = false;
  let ready = false;
  const emit = (name, detail) => {
    if (typeof globalThis.CustomEvent === "function") globalThis.dispatchEvent?.(new CustomEvent(name, { detail }));
    else globalThis.dispatchEvent?.({ type: name, detail });
  };
  const readState = () => {
    if (globalThis.stat_data && typeof globalThis.stat_data === "object") return globalThis.stat_data;
    const lower = globalThis.Mvu?.getVariables?.()?.stat_data;
    if (lower && typeof lower === "object") return lower;
    const upper = globalThis.MVU?.getVariables?.()?.stat_data;
    return upper && typeof upper === "object" ? upper : null;
  };
  const readGlobalPath = (expression) => {
    const normalized = String(expression).trim().replace(/^(?:globalThis|window)\./, "");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(normalized)) return undefined;
    return normalized.split(".").reduce((current, segment) => current == null ? undefined : current[segment], globalThis);
  };
  const evaluators = config.probes.map((expression) => {
    return () => Boolean(readGlobalPath(expression));
  });
  const requirementReady = (name) => {
    if (seenEvents.has(name)) return true;
    if (name === "runtime_state_available" || name === "stat_data") return readState() !== null;
    if (name === "message_rendered") return typeof document !== "undefined" && document.readyState !== "loading";
    return Boolean(readGlobalPath(name));
  };
  const stableFingerprint = (value) => {
    const seen = new WeakSet();
    const normalize = (item) => {
      if (!item || typeof item !== "object") return item;
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
      if (Array.isArray(item)) return item.map(normalize);
      const output = {};
      for (const name of Object.keys(item).sort()) output[name] = normalize(item[name]);
      return output;
    };
    try { return JSON.stringify(normalize(value)); } catch { return "[Unserializable]"; }
  };
  let readinessTimer = null;
  let timeoutTimer = null;
  const checkReady = () => {
    if (disposed || ready) return;
    if (evaluators.every((evaluate) => evaluate()) && config.waitFor.every(requirementReady)) {
      ready = true;
      if (readinessTimer !== null) clearInterval(readinessTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      emit("rp-card-runtime-ready", { probes: config.probes, waitFor: config.waitFor });
    }
  };
  for (const name of config.waitFor) {
    const handler = () => { seenEvents.add(name); checkReady(); };
    globalThis.addEventListener?.(name, handler);
    listeners.push([name, handler]);
  }
  let lastFingerprint = stableFingerprint(readState());
  const stateTimer = setInterval(() => {
    if (disposed) return;
    const nextFingerprint = stableFingerprint(readState());
    if (nextFingerprint !== lastFingerprint) {
      lastFingerprint = nextFingerprint;
      emit("rp-card-state-change", { fingerprint: nextFingerprint });
      checkReady();
    }
  }, config.statePollMs);
  timers.add(stateTimer);
  readinessTimer = setInterval(checkReady, config.readinessPollMs);
  timers.add(readinessTimer);
  timeoutTimer = setTimeout(() => {
    if (!disposed && !ready) emit("rp-card-runtime-unavailable", { timeoutMs: config.timeoutMs, probes: config.probes, waitFor: config.waitFor });
    if (readinessTimer !== null) clearInterval(readinessTimer);
  }, config.timeoutMs);
  timers.add(timeoutTimer);
  const cleanup = () => {
    disposed = true;
    for (const [name, handler] of listeners) globalThis.removeEventListener?.(name, handler);
    for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
    timers.clear();
  };
  globalThis[key] = { cleanup };
  checkReady();
})();`;
}

function statusUiScript(ui, runtimeConfig) {
  const hierarchy = new Map((ui.visual?.hierarchy ?? []).map((id, index) => [id, index]));
  const sections = [...ui.sections ?? []].sort((left, right) => {
    const leftRank = hierarchy.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = hierarchy.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || (left.priority ?? 0) - (right.priority ?? 0);
  });
  const config = JSON.stringify({
    mountAnchor: ui.delivery?.mount_anchor ?? "rp-card-status",
    entrypoint: ui.delivery?.entrypoint ?? null,
    artifact: ui.delivery?.artifact ?? null,
    waitFor: runtimeConfig.waitFor,
    timeoutMs: runtimeConfig.timeoutMs,
    refresh: ui.refresh ?? "on_state_change",
    readOnly: ui.read_only !== false,
    responsive: clone(ui.responsive ?? {}),
    visual: clone(ui.visual ?? {}),
    sections: sections.map((section) => ({
      id: section.id,
      label: section.display_name,
      collapsed: Boolean(section.collapsed),
      fields: (section.fields ?? []).map((field) => ({ id: field.id, path: runtimeConfig.pathMappings[field.source_path] ?? field.source_path, sourcePath: field.source_path, label: field.label, format: field.format, missing: field.missing_value }))
    })),
    commands: (ui.commands ?? []).map((command) => clone(command)),
    loading: ui.states?.loading ?? "Loading",
    empty: ui.states?.empty ?? "No state",
    error: ui.states?.error ?? "State unavailable",
    degraded: ui.states?.degraded ?? ui.text_template ?? "State unavailable",
    liveUpdates: ui.accessibility?.live_updates ?? "polite"
  }).replaceAll("<", "\\u003c");
  return `(() => {
  "use strict";
  const key = Symbol.for("rp_card_studio.status_ui");
  globalThis[key]?.cleanup?.();
  const config = ${config};
  const listeners = [];
  const observers = [];
  const timers = new Set();
  const seenEvents = new Set();
  let host = null;
  let root = null;
  let ownsHost = false;
  let ready = false;
  const read = (value, state) => value.split(".").reduce((current, segment) => current == null ? undefined : current[segment], state);
  const state = () => globalThis.stat_data || globalThis.Mvu?.getVariables?.()?.stat_data || globalThis.MVU?.getVariables?.()?.stat_data || null;
  const readGlobalPath = (expression) => {
    const normalized = String(expression).trim().replace(/^(?:globalThis|window)\./, "");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(normalized)) return undefined;
    return normalized.split(".").reduce((current, segment) => current == null ? undefined : current[segment], globalThis);
  };
  const emit = (name, detail) => {
    if (typeof globalThis.CustomEvent === "function") globalThis.dispatchEvent?.(new CustomEvent(name, { detail }));
    else globalThis.dispatchEvent?.({ type: name, detail });
  };
  const resolveCallable = (expression) => {
    const normalized = String(expression).trim().replace(/^(?:globalThis|window)\./, "");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(normalized)) return null;
    const segments = normalized.split(".");
    const name = segments.pop();
    const owner = segments.reduce((current, segment) => current == null ? undefined : current[segment], globalThis);
    const callable = owner?.[name];
    return typeof callable === "function" ? { owner, callable } : null;
  };
  const executeCommand = async (command) => {
    const detail = { id: command.id, channel: command.channel, payload: command.payload, writerId: command.writer_id };
    emit("rp-card-ui-command", detail);
    try {
      let result;
      if (command.channel === "runtime_event") {
        emit(command.payload, detail);
        result = true;
      } else if (command.channel === "script_api") {
        const target = resolveCallable(command.payload);
        if (!target) throw new Error("Script API is unavailable: " + command.payload);
        result = await target.callable.call(target.owner, detail);
      } else if (command.channel === "chat_command") {
        const context = globalThis.SillyTavern?.getContext?.();
        const candidates = [
          [context, context?.executeSlashCommandsWithOptions],
          [context, context?.executeSlashCommands],
          [globalThis, globalThis.executeSlashCommandsWithOptions],
          [globalThis, globalThis.executeSlashCommands]
        ];
        const target = candidates.find(([, callable]) => typeof callable === "function");
        if (!target) throw new Error("SillyTavern chat command API is unavailable");
        result = await target[1].call(target[0], command.payload);
      } else {
        throw new Error("Unsupported UI command channel: " + command.channel);
      }
      emit("rp-card-ui-command-result", { ...detail, result });
      return result;
    } catch (error) {
      emit("rp-card-ui-command-error", { ...detail, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  const requirementReady = (name) => {
    if (seenEvents.has(name)) return true;
    if (name === "runtime_state_available" || name === "stat_data") return state() !== null;
    if (name === "message_rendered") return document.readyState !== "loading";
    return Boolean(readGlobalPath(name));
  };
  const ensureRoot = () => {
    if (!host?.isConnected) { host = document.getElementById(config.mountAnchor); ownsHost = false; }
    if (!host) {
      host = document.createElement("section");
      host.id = config.mountAnchor;
      (document.body || document.documentElement).append(host);
      ownsHost = true;
    }
    if (!root?.isConnected || root.parentNode !== host) {
      root = document.createElement("section");
      root.dataset.rpCardStudio = "status_ui";
      root.dataset.density = config.visual.density || "compact";
      root.dataset.narrowLayout = config.responsive.narrow || "single_column";
      root.dataset.wideLayout = config.responsive.wide || "grouped_columns";
      root.setAttribute("aria-live", config.liveUpdates);
      host.append(root);
    }
    return root;
  };
  const showStatus = (text) => { ensureRoot().textContent = text; };
  const format = (value, kind) => {
    if (kind === "list" && Array.isArray(value)) return value.join(", ");
    if (kind === "percent" && typeof value === "number") return String(value) + "%";
    if (value && typeof value === "object") {
      try { return JSON.stringify(value); } catch { return config.error; }
    }
    return String(value);
  };
  const render = () => {
    try {
      ensureRoot();
      root.replaceChildren();
      const currentState = state();
      if (!currentState) { root.textContent = config.degraded; return; }
      for (const section of config.sections) {
        const group = document.createElement(section.collapsed ? "details" : "section");
        if (section.collapsed) {
          const heading = document.createElement("summary"); heading.textContent = section.label; group.append(heading);
        } else {
          const heading = document.createElement("h3"); heading.textContent = section.label; group.append(heading);
        }
        for (const field of section.fields) {
          const row = document.createElement("div");
          const value = read(field.path, currentState);
          row.textContent = field.label + ": " + (value == null ? field.missing : format(value, field.format));
          group.append(row);
        }
        root.append(group);
      }
      if (!config.readOnly && config.commands.length > 0) {
        const commands = document.createElement("div");
        commands.dataset.rpCardStudioCommands = "true";
        for (const command of config.commands) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = command.label;
          button.addEventListener("click", async () => {
            button.disabled = true;
            try { await executeCommand(command); }
            catch { /* The command error is exposed through rp-card-ui-command-error. */ }
            finally { button.disabled = false; }
          });
          commands.append(button);
        }
        root.append(commands);
      }
      if (!root.childNodes.length) root.textContent = config.empty;
    } catch { if (root) root.textContent = config.error; }
  };
  const on = (name, handler) => { globalThis.addEventListener?.(name, handler); listeners.push([name, handler]); };
  let pollTimer = null;
  const markReady = () => {
    ready = true;
    if (pollTimer !== null) { clearInterval(pollTimer); timers.delete(pollTimer); pollTimer = null; }
  };
  const attemptRender = () => {
    if (!ready) {
      if (!config.waitFor.every(requirementReady)) return;
      markReady();
    }
    render();
  };
  on("rp-card-runtime-ready", () => { markReady(); render(); });
  on("rp-card-state-change", () => {
    if (!ready) attemptRender();
    else if (["on_state_change", "hybrid"].includes(config.refresh)) render();
  });
  for (const name of config.waitFor) on(name, () => {
    seenEvents.add(name);
    if (!ready) attemptRender();
    else if (name === "message_rendered" && ["on_message", "hybrid"].includes(config.refresh)) render();
  });
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => { if (!root?.isConnected || !host?.isConnected) attemptRender(); });
    observer.observe(document.documentElement, { childList: true, subtree: true }); observers.push(observer);
  }
  ensureRoot();
  showStatus(config.loading);
  pollTimer = setInterval(attemptRender, 100); timers.add(pollTimer);
  const timeoutTimer = setTimeout(() => { if (!ready) showStatus(config.degraded); }, config.timeoutMs); timers.add(timeoutTimer);
  const initialTimer = setTimeout(attemptRender, 0); timers.add(initialTimer);
  const cleanup = () => {
    for (const [name, handler] of listeners) globalThis.removeEventListener?.(name, handler);
    for (const item of observers) item.disconnect();
    for (const item of timers) { clearTimeout(item); clearInterval(item); }
    timers.clear();
    root?.remove();
    if (ownsHost && host && !host.childNodes.length) host.remove();
    root = null; host = null; ownsHost = false;
  };
  globalThis[key] = { cleanup, render, executeCommand };
})();`;
}

export function applyTavernHelperAdapter(payload, { project, sources, target }) {
  if (target !== "character") return { payload, issues: [] };
  const mvuSources = values(sources, "mvu");
  const uiSources = values(sources, "ui");
  const mvuAdapter = mvuSources.find((source) => source.runtime_contract?.adapter?.id === "tavern_helper" && source.runtime_contract.adapter.delivery === "embedded")?.runtime_contract?.adapter ?? null;
  const uiAdapter = uiSources.some((source) => source.status_ui?.delivery?.adapter === "tavern_helper" && source.status_ui.delivery.level === "embedded");
  const runtimeEnabled = mvuSources.some((source) => source.mvu?.enabled || source.ejs?.enabled)
    && (project?.features?.mvu || project?.features?.ejs);
  const uiSource = uiSources.find((source) => source.status_ui?.enabled
    && ["embedded", "both"].includes(source.status_ui.mode)
    && source.status_ui.delivery?.level === "embedded");
  const uiEnabled = Boolean(project?.features?.status_ui && uiSource);
  const runtimeConfig = tavernHelperRuntimeConfig(mvuSources, uiSources);
  const generated = [];
  if (runtimeEnabled && mvuAdapter) generated.push({
    id: "rp_card_studio_runtime_guard",
    name: "RP Card Studio Runtime Guard",
    enabled: true,
    entrypoint: mvuAdapter.entrypoint,
    load_order: mvuAdapter.load_order ?? 0,
    fallback: mvuAdapter.fallback,
    content: runtimeGuardScript(runtimeConfig)
  });
  if (uiEnabled && uiAdapter) generated.push({
    id: "rp_card_studio_status_ui",
    name: "RP Card Studio Status UI",
    enabled: true,
    entrypoint: uiSource.status_ui.delivery.entrypoint,
    artifact: uiSource.status_ui.delivery.artifact,
    content: statusUiScript(uiSource.status_ui, runtimeConfig)
  });
  if (generated.length === 0) return { payload, issues: [] };

  const output = clone(payload);
  output.data ??= {};
  output.data.extensions = isObject(output.data.extensions) ? output.data.extensions : {};
  const existing = output.data.extensions.tavern_helper;
  if (existing !== undefined && !isObject(existing)) {
    return { payload: output, issues: [issue("/data/extensions/tavern_helper", "adapter.collision", "tavern_helper extension is not an object")] };
  }
  const extension = isObject(existing) ? existing : {};
  if (extension.scripts !== undefined && !Array.isArray(extension.scripts)) {
    return { payload: output, issues: [issue("/data/extensions/tavern_helper/scripts", "adapter.collision", "tavern_helper scripts must be an array")] };
  }
  extension.scripts = extension.scripts ?? [];
  const existingIds = new Set(extension.scripts.map((script) => script?.id).filter(Boolean));
  const issues = [];
  for (const script of generated) {
    if (existingIds.has(script.id)) {
      issues.push(issue("/data/extensions/tavern_helper/scripts", "adapter.script_collision", `Refusing to overwrite Tavern Helper script: ${script.id}`));
      continue;
    }
    extension.scripts.push(script);
    existingIds.add(script.id);
  }
  output.data.extensions.tavern_helper = extension;
  return { payload: output, issues };
}
