function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasContent(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

export function compactModelSource(value) {
  if (Array.isArray(value)) {
    return value.map(compactModelSource).filter(hasContent);
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, compactModelSource(item)])
      .filter(([, item]) => hasContent(item)));
  }
  return value;
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source?.[key]]));
}

function withoutMaintenance(source) {
  if (!isObject(source)) return source;
  const ignored = new Set(["schema_version", "id", "status", "tags", "source_refs", "extensions"]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !ignored.has(key)));
}

/**
 * Return only the model-facing semantics of a maintained source. Packaging metadata,
 * imported card payloads, openings, and other host-owned fields never belong in a
 * CharacterBook entry.
 */
export function projectModelSource(group, source) {
  const normalizedGroup = ({
    characters: "character",
    systems: "system",
    scenes: "scene",
    prompts: "prompt",
  })[group] ?? group;

  let projected;
  if (normalizedGroup === "world") {
    projected = pick(source, [
      "id",
      "display_name",
      "premise",
      "fundamental_rules",
      "society",
      "geography",
      "history",
      "knowledge",
      "continuity",
      "hooks",
      "world_identity",
      "setting_scope",
      "information_layers",
      "core_conflict",
      "world_rules",
      "species",
      "factions_and_society",
      "autonomous_motion",
      "improvised_characters",
      "common_knowledge",
      "timeline",
      "change_boundaries",
      "cross_world_rules",
      "open_questions",
    ]);
  } else if (normalizedGroup === "character") {
    projected = pick(source, [
      "id",
      "display_name",
      "role",
      "identity",
      "narrative_function",
      "goals",
      "psychology",
      "value_priority",
      "internal_conflicts",
      "boundaries",
      "behavioral_rules",
      "stress_ladder",
      "ooc_guardrails",
      "speech",
      "relationships",
      "knowledge",
      "state_bindings",
      "examples",
      "nsfw",
      "story_role",
      "autonomy",
      "behavior",
      "attitudes",
      "background",
      "growth_arc",
      "anti_ooc",
    ]);
  } else if (normalizedGroup === "system") {
    projected = pick(source, [
      "id",
      "display_name",
      "purpose",
      "axes",
      "rules",
      "state_machines",
      "settlement_order",
      "invariants",
      "failure_modes",
    ]);
  } else if (normalizedGroup === "user_character") {
    projected = pick(source, [
      "id",
      "display_name",
      "usage",
      "profile",
    ]);
  } else if (normalizedGroup === "scene") {
    projected = pick(source, [
      "id",
      "display_name",
      "purpose",
      "context",
      "entrances",
      "exits",
      "zones",
      "surface_layer",
      "gm_only",
      "risks",
      "clues",
      "events",
      "state_bindings",
      "media_slots",
    ]);
    // Older projects stored this typed scene contract in the opaque extension
    // bag. Keep it readable while new projects use the first-class field.
    if (projected.media_slots === undefined && Array.isArray(source?.extensions?.media_slots)) {
      projected.media_slots = source.extensions.media_slots;
    }
  } else if (normalizedGroup === "prompt") {
    projected = pick(source, ["narrative", "dialogue_examples"]);
  } else if (normalizedGroup === "positioning") {
    projected = pick(source, [
      "premise",
      "target_users",
      "experience_pillars",
      "tone",
      "expected_span",
      "scope_notes",
    ]);
    if (projected.expected_span === "pending") delete projected.expected_span;
  } else {
    projected = withoutMaintenance(source);
  }

  return compactModelSource(projected);
}

/**
 * List the smallest useful JSON-pointer boundaries that must be covered by one
 * or more assembly selectors. Arrays are treated as a unit so a selector such
 * as /fundamental_rules remains a stable integration boundary.
 */
export function semanticLeafPointers(value, pointer = "") {
  if (Array.isArray(value)) return value.length > 0 ? [pointer] : [];
  if (!isObject(value)) return hasContent(value) ? [pointer] : [];
  return Object.entries(value).flatMap(([key, item]) => {
    const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
    return semanticLeafPointers(item, `${pointer}/${escaped}`);
  });
}
