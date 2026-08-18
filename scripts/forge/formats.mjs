import { inputError, unsupportedError } from './errors.mjs';
import { isDirectory } from './fs-transaction.mjs';
import { isPlainObject, parseJsonText, readUtf8, sha256 } from './json.mjs';
import { extractCardFromPng, PNG_SIGNATURE } from './png.mjs';
import { validateNamedSchema } from './schema.mjs';

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export var Format = Object.freeze({
  CHARACTER_V2: "sillytavern-character-card-v2",
  CHARACTER_V3: "sillytavern-character-card-v3",
  PNG_CHARACTER_V2: "sillytavern-character-card-v2-png",
  PNG_CHARACTER_V3: "sillytavern-character-card-v3-png",
  WORLDBOOK: "sillytavern-worldbook-entries",
  PROJECT: "rp-card-studio-project"
});
var CHARACTER_FORMATS = /* @__PURE__ */ new Set([
  Format.CHARACTER_V2,
  Format.CHARACTER_V3,
  Format.PNG_CHARACTER_V2,
  Format.PNG_CHARACTER_V3
]);
var PNG_CHARACTER_FORMATS = /* @__PURE__ */ new Set([
  Format.PNG_CHARACTER_V2,
  Format.PNG_CHARACTER_V3
]);
var UI_BASELINE_EVIDENCE = Object.freeze({
  navigation: "internal navigation",
  data_views: "multiple real data views",
  information_tools: "search, filtering, folding, detail, or equivalent information tools",
  host_actions: "a real SillyTavern or Tavern Helper action",
  feedback_states: "confirmation, loading, empty, success, failure, or fallback feedback",
  responsive_checks: "responsive, touch, or long-CJK-content checks",
  theme_features: "a finished project-specific theme",
  data_binding: "real data binding, refresh, and missing-data handling"
});
var UI_ADVANCEMENT_KEYS = Object.freeze([
  "usability",
  "information_architecture",
  "interaction_depth",
  "visual_expression",
  "host_integration",
  "persistence_lifecycle"
]);
function hasUiEvidence(value) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim());
}
function artifactStageTarget(status, issues, warnings) {
  return status === "locked" ? issues : warnings;
}
function validateManagedUiExperience(statusUi, base, status, issues, warnings) {
  const evidence = statusUi?.experience_evidence;
  if (!isPlainObject(evidence)) {
    warnings.push(issue(`${base}/experience_evidence`, "ui.experience_evidence", "Ongoing UI has no player-visible experience review; this does not block the artifact"));
    return;
  }
  const baseline = evidence.baseline;
  for (const [key, label] of Object.entries(UI_BASELINE_EVIDENCE)) {
    if (!isPlainObject(baseline) || !hasUiEvidence(baseline[key])) {
      warnings.push(issue(`${base}/experience_evidence/baseline/${key}`, "ui.experience_baseline", `Experience review has not recorded ${label}; explain when it is not applicable`));
    }
  }
  const advancements = evidence.level_advancements;
  const count = isPlainObject(advancements)
    ? UI_ADVANCEMENT_KEYS.filter((key) => hasUiEvidence(advancements[key])).length
    : 0;
  const level = statusUi?.experience_level;
  if (level !== "light" && count === 0) warnings.push(issue(`${base}/experience_evidence/level_advancements`, "ui.experience_advancement", `${level} has not described its overall additions beyond light; no numeric quota is enforced`));
  if (level === "super_heavy" && evidence.primary_play_surface !== true) {
    artifactStageTarget(status, issues, warnings).push(issue(`${base}/experience_evidence/primary_play_surface`, "ui.experience_primary_surface", "Super-heavy / zero-layer UI should declare the message application as the primary play surface"));
  }
}
export function isCharacterFormat(format) {
  return CHARACTER_FORMATS.has(format);
}
export function isPngCharacterFormat(format) {
  return PNG_CHARACTER_FORMATS.has(format);
}
function pngFormatForPayload(payload) {
  return payload?.spec === "chara_card_v3" ? Format.PNG_CHARACTER_V3 : Format.PNG_CHARACTER_V2;
}
var CHARACTER_DATA_KEYS = /* @__PURE__ */ new Set([
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
export function detectJsonFormat(value) {
  if (!isPlainObject(value)) return null;
  if (value.spec === "chara_card_v2" && isPlainObject(value.data)) return Format.CHARACTER_V2;
  if (value.spec === "chara_card_v3" && isPlainObject(value.data)) return Format.CHARACTER_V3;
  if (Array.isArray(value.entries) || isPlainObject(value.entries)) return Format.WORLDBOOK;
  return null;
}
export function formatSummary(value, format) {
  if (isCharacterFormat(format)) {
    const topLevelUnknown = Object.keys(value).filter((key) => !["spec", "spec_version", "data"].includes(key));
    const dataUnknown = Object.keys(value.data ?? {}).filter((key) => !CHARACTER_DATA_KEYS.has(key));
    return {
      format,
      name: value.data?.name ?? "",
      specVersion: value.spec_version ?? null,
      alternateGreetings: Array.isArray(value.data?.alternate_greetings) ? value.data.alternate_greetings.length : 0,
      worldbookEntries: countWorldbookEntries(value.data?.character_book),
      unknownFields: { topLevel: topLevelUnknown, data: dataUnknown }
    };
  }
  if (format === Format.WORLDBOOK) {
    return {
      format,
      name: value.name ?? "",
      entries: countWorldbookEntries(value),
      unknownFields: {
        topLevel: Object.keys(value).filter((key) => !["name", "description", "entries"].includes(key))
      }
    };
  }
  return { format };
}
function worldbookEntries(book) {
  if (!isPlainObject(book)) return [];
  if (Array.isArray(book.entries)) return book.entries;
  if (isPlainObject(book.entries)) return Object.values(book.entries);
  return [];
}
function countWorldbookEntries(book) {
  return worldbookEntries(book).length;
}
export function hasWorldbookEntries(book) {
  return countWorldbookEntries(book) > 0;
}
function hasManagedWorldbookEntries(book) {
  return worldbookEntries(book).some((entry) => (
    isPlainObject(entry?.extensions?.rp_card_studio)
    && entry.extensions.rp_card_studio.generated === true
  ));
}
function embeddedCharacterBookName(value) {
  const explicitName = value?.data?.character_book?.name;
  if (typeof explicitName === "string" && explicitName.trim().length > 0) return explicitName;
  const characterName = value?.data?.name;
  if (typeof characterName === "string" && characterName.trim().length > 0) {
    return `${characterName}'s Lorebook`;
  }
  return null;
}
function validateEmbeddedCharacterBookBinding(value, issues, warnings) {
  const characterBook = value?.data?.character_book;
  if (!characterBook) return;
  if (!hasWorldbookEntries(characterBook)) {
    const authoritative = value?.data?.extensions?.rp_card_studio?.worldbook_manifest?.authoritative === true;
    (authoritative ? issues : warnings).push(issue(
      "/data/character_book/entries",
      "character_book.empty",
      authoritative
        ? "Forge-managed CharacterBook is empty; nothing can be imported or linked in SillyTavern"
        : "Embedded CharacterBook exists but contains no entries",
    ));
    return;
  }
  const expectedName = embeddedCharacterBookName(value);
  const explicitName = characterBook?.name;
  if (typeof explicitName !== "string" || explicitName.trim().length === 0) {
    warnings.push(issue(
      "/data/character_book/name",
      "character_book.name_fallback",
      expectedName
        ? `Embedded CharacterBook has no usable name; SillyTavern falls back to ${expectedName}`
        : "Embedded CharacterBook has no usable name and no character name is available for SillyTavern's fallback",
    ));
  }
  if (!expectedName) return;
  const boundName = value?.data?.extensions?.world;
  if (boundName === expectedName) return;
  const managed = hasManagedWorldbookEntries(characterBook);
  const target = managed ? issues : warnings;
  target.push(issue(
    "/data/extensions/world",
    "character_book.binding",
    managed
      ? `Forge-managed CharacterBook entries require the primary lorebook binding ${expectedName}; found ${JSON.stringify(boundName ?? null)}`
      : `Embedded CharacterBook ${expectedName} is not the character's primary lorebook; found ${JSON.stringify(boundName ?? null)}. This is valid only when the different or empty binding is intentional`,
  ));
}
export function validatePayload(value, format = detectJsonFormat(value)) {
  const issues = [];
  const warnings = [];
  if (isCharacterFormat(format)) {
    issues.push(...validateNamedSchema("character-card", value));
    validatePortableDelivery(value, issues);
    validateCharacterRegexScripts(value, issues);
    validateManagedMvuRuntimeClosure(value, issues);
    validateManagedMvuDisplayCleanup(value, issues);
    validateManagedOpeningUi(value, issues, warnings);
    validateManagedUiMarkerProducers(value, issues, warnings);
    validateEmbeddedCharacterBookBinding(value, issues, warnings);
    return { format, issues, warnings };
  }
  if (format === Format.WORLDBOOK) {
    validateWorldbook(value, "", issues);
    return { format, issues, warnings };
  }
  issues.push(issue("/", "unsupported", "无法识别为 Character Card V2/V3 或世界书 entries JSON"));
  return { format: null, issues, warnings };
}

function looksLikeExternalMaintenancePath(value) {
  return typeof value === "string" && (
    /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value)
    || /(?:^|[\\/])src[\\/]/i.test(value)
    || /\.rp-card(?:[\\/]|$)/i.test(value)
    || /(?:^|\.\.)[\\/]/.test(value)
  );
}

function validatePortableDelivery(value, issues) {
  const forbiddenKeys = new Set(["source_refs", "replace_file", "content_file", "app_manifest"]);
  const pathKeys = new Set(["file", "path"]);
  function walk(node, basePath) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${basePath}/${index}`));
      return;
    }
    if (!isPlainObject(node)) {
      if (typeof node === "string" && /(?:^|\n)\s*source_ref:\s*["']?(?:src[\\/]|[A-Za-z]:|\.\.?[\\/])/i.test(node)) {
        issues.push(issue(basePath, "delivery.portability", "最终角色卡正文不能携带维护源码的 source_ref 文件路径"));
      }
      if (typeof node === "string" && /(?:import\s+[^;]*?from\s*|(?:src|href)\s*=\s*|url\(\s*)["']?(?:\.\.?[\\/]|src[\\/])/i.test(node)) {
        issues.push(issue(basePath, "delivery.portability", "最终角色卡中的 HTML/CSS/JS 不能继续引用本地相对文件；请把资源内嵌或改为明确的远程依赖"));
      }
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${basePath}/${key}`;
      if (forbiddenKeys.has(key)) {
        issues.push(issue(childPath, "delivery.portability", `最终角色卡不能携带维护字段 ${key}；运行时必须使用已内嵌内容`));
        continue;
      }
      if (pathKeys.has(key) && looksLikeExternalMaintenancePath(child)) {
        issues.push(issue(childPath, "delivery.portability", `最终角色卡不能依赖外部维护文件路径: ${child}`));
        continue;
      }
      walk(child, childPath);
    }
  }
  walk(value, "");
}

function validateCharacterRegexScripts(value, issues) {
  const scripts = value?.data?.extensions?.regex_scripts;
  if (!Array.isArray(scripts)) return;
  const ids = new Set();
  for (const [index, script] of scripts.entries()) {
    const base = `/data/extensions/regex_scripts/${index}`;
    if (!isPlainObject(script)) continue;
    if (typeof script.id === "string") {
      if (ids.has(script.id)) issues.push(issue(`${base}/id`, "regex.id_duplicate", `Duplicate scoped regex UUID: ${script.id}`));
      ids.add(script.id);
    }
    if (Number.isInteger(script.minDepth) && Number.isInteger(script.maxDepth) && script.minDepth > script.maxDepth) {
      issues.push(issue(base, "regex.depth", `Scoped regex minDepth ${script.minDepth} exceeds maxDepth ${script.maxDepth}`));
    }
    if (typeof script.findRegex === "string" && script.findRegex.length > 0) {
      try {
        compileRegexString(script.findRegex);
      } catch (error) {
        issues.push(issue(`${base}/findRegex`, "regex.syntax", `Invalid scoped regex: ${error.message}`));
      }
    }
  }
}

function compileRegexString(source) {
  if (!source.startsWith("/")) return new RegExp(source);
  const closingSlash = source.lastIndexOf("/");
  if (closingSlash <= 0) return new RegExp(source);
  const pattern = source.slice(1, closingSlash);
  const flags = source.slice(closingSlash + 1);
  return new RegExp(pattern, flags);
}

function artifactUpdateBlockTags(value) {
  const texts = [
    value?.data?.first_mes,
    value?.data?.system_prompt,
    value?.data?.post_history_instructions,
    ...(Array.isArray(value?.data?.alternate_greetings) ? value.data.alternate_greetings : []),
    ...worldbookEntries(value?.data?.character_book).map((entry) => entry?.content),
  ];
  const tags = new Set();
  const blocks = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  for (const text of texts) {
    for (const match of String(text ?? "").matchAll(blocks)) {
      const [, tag, body] = match;
      if (/update.*variable|variable.*update/i.test(tag) || /_\.(?:set|assign|unset|update)\s*\(|"op"\s*:/i.test(body)) {
        tags.add(tag);
      }
    }
  }
  return tags;
}

function managedMvuSources(value) {
  const sources = value?.data?.extensions?.rp_card_studio?.sources?.mvu;
  if (!Array.isArray(sources)) return [];
  return sources.map((source) => source?.value).filter((source) => isPlainObject(source?.mvu) && source.mvu.enabled === true);
}

function validateManagedMvuRuntimeClosure(value, issues) {
  const mvuSources = managedMvuSources(value);
  if (mvuSources.length === 0) return;
  const nodes = [];
  function collect(items) {
    for (const item of items ?? []) {
      if (!isPlainObject(item)) continue;
      nodes.push(item);
      if (item.type === "folder") collect(item.scripts);
    }
  }
  collect(value?.data?.extensions?.tavern_helper?.scripts);
  const ids = new Set(nodes.map((node) => node.id).filter(Boolean));
  for (const [index, source] of mvuSources.entries()) {
    const mvu = source.mvu ?? {};
    if (mvu.route === "existing" || mvu.framework?.delivery === "host_required") continue;
    const base = `/data/extensions/rp_card_studio/sources/mvu/${index}/value/mvu`;
    const loaderId = mvu.framework?.loader_script_id;
    if (!Array.isArray(value?.data?.extensions?.tavern_helper?.scripts) || nodes.length === 0) {
      issues.push(issue(base, "mvu.runtime_script", "启用 MVU 的最终角色卡缺少已内嵌的 Tavern Helper 脚本；不能只在维护源里声明变量"));
      continue;
    }
    if (mvu.framework?.delivery === "card_script" && (!loaderId || !ids.has(loaderId))) {
      issues.push(issue(`${base}/framework/loader_script_id`, "mvu.runtime_script", `最终角色卡缺少 loader_script_id=${JSON.stringify(loaderId ?? null)} 对应的 Tavern Helper 脚本`));
    }
    if (nodes.every((node) => typeof node.content !== "string" || !node.content.trim())) {
      issues.push(issue(base, "mvu.runtime_script", "Tavern Helper 脚本节点存在但没有实际内嵌代码"));
    }
  }
}

function artifactDisplayRegexPipeline(value) {
  const scripts = value?.data?.extensions?.regex_scripts;
  if (!Array.isArray(scripts)) return [];
  const pipeline = [];
  for (const script of scripts) {
    if (!isPlainObject(script)
      || script.disabled === true
      || !Array.isArray(script.placement)
      || !script.placement.includes(2)
      || script.promptOnly === true
      || typeof script.findRegex !== "string") continue;
    try {
      pipeline.push({
        pattern: compileRegexString(script.findRegex),
        replacement: typeof script.replaceString === "string" ? script.replaceString : "",
      });
    } catch {
      // validateCharacterRegexScripts reports malformed patterns separately.
    }
  }
  return pipeline;
}

function applyArtifactRegexPipeline(text, pipeline) {
  return pipeline.reduce((current, regex) => current.replace(regex.pattern, regex.replacement), text);
}

function validateManagedMvuDisplayCleanup(value, issues) {
  const mvuSources = managedMvuSources(value);
  if (mvuSources.length === 0) return;
  const tags = artifactUpdateBlockTags(value);
  if (tags.size === 0) return;
  const requiresCardRegex = mvuSources.some((source) => {
    const mvu = source.mvu;
    if (mvu?.update_strategy?.response_transport !== "chat_message") return false;
    const mode = mvu?.update_strategy?.display_cleanup?.mode
      ?? (mvu?.route === "existing" ? "existing" : "card_regex");
    return mode === "card_regex";
  });
  if (!requiresCardRegex) return;

  const pipeline = artifactDisplayRegexPipeline(value);
  for (const tag of tags) {
    const completeSentinel = `__RP_MVU_COMPLETE_${tag}__`;
    const streamingSentinel = `__RP_MVU_STREAMING_${tag}__`;
    const complete = `正文\n<${tag}>\n<Analysis>${completeSentinel}</Analysis>\n_.set('状态', 0, 1);\n</${tag}>\n正文`;
    const streaming = `正文\n<${tag}>\n<Analysis>${streamingSentinel}</Analysis>\n_.set('状态', 0,`;
    if (applyArtifactRegexPipeline(complete, pipeline).includes(completeSentinel)) {
      issues.push(issue(
        "/data/extensions/regex_scripts",
        "mvu.update_block_complete_visibility",
        `Forge-managed MVU artifact leaves completed <${tag}> technical content visible to the player`,
      ));
    }
    if (applyArtifactRegexPipeline(streaming, pipeline).includes(streamingSentinel)) {
      issues.push(issue(
        "/data/extensions/regex_scripts",
        "mvu.update_block_streaming_visibility",
        `Forge-managed MVU artifact leaves streaming, unclosed <${tag}> technical content visible to the player`,
      ));
    }
  }
}

function artifactMarkerAppearsInText(text, marker) {
  const source = String(text ?? "");
  const exact = String(marker ?? "").trim();
  if (!exact) return false;
  if (source.includes(exact)) return true;
  const tag = exact.match(/^<([^\s/>]+)\b/)?.[1];
  if (!tag) return false;
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`<${escaped}(?:\\s|/?>)`, "i").test(source)) return false;
  return !exact.includes(`</${tag}>`) || new RegExp(`</${escaped}\\s*>`, "i").test(source);
}

function artifactHasOutputDirective(text) {
  return /(?:每(?:次|轮).{0,24}回复|回复.{0,16}(?:末尾|结尾)|(?:必须|务必|始终|固定).{0,16}(?:输出|追加|附加|写入)|(?:输出|追加|附加|写入).{0,24}(?:标签|标记|XML|状态块)|(?:always|every|each).{0,24}(?:output|append|emit)|(?:output|append|emit).{0,24}(?:response|reply))/is.test(String(text ?? ""));
}

function artifactUiSources(value) {
  const sources = value?.data?.extensions?.rp_card_studio?.sources?.ui;
  if (!Array.isArray(sources)) return [];
  return sources.map((source) => source?.value).filter((source) => isPlainObject(source?.status_ui) && source.status_ui.enabled === true);
}

function artifactUiDisplayPatterns(value) {
  const scripts = value?.data?.extensions?.regex_scripts;
  if (!Array.isArray(scripts)) return [];
  const patterns = [];
  for (const script of scripts) {
    if (!isPlainObject(script)
      || script.disabled === true
      || script.promptOnly === true
      || script.markdownOnly !== true
      || !Array.isArray(script.placement)
      || script.placement.length === 0
      || typeof script.findRegex !== "string") continue;
    try { patterns.push(compileRegexString(script.findRegex)); }
    catch { /* validateCharacterRegexScripts reports malformed patterns separately. */ }
  }
  return patterns;
}

function artifactUiPromptPatterns(value) {
  const scripts = value?.data?.extensions?.regex_scripts;
  if (!Array.isArray(scripts)) return [];
  const patterns = [];
  for (const script of scripts) {
    if (!isPlainObject(script)
      || script.disabled === true
      || script.promptOnly !== true
      || !Array.isArray(script.placement)
      || script.placement.length === 0
      || typeof script.findRegex !== "string") continue;
    try { patterns.push(compileRegexString(script.findRegex)); }
    catch { /* validateCharacterRegexScripts reports malformed patterns separately. */ }
  }
  return patterns;
}

function artifactPatternMatchesMarker(pattern, marker) {
  const candidate = new RegExp(pattern.source, pattern.flags);
  candidate.lastIndex = 0;
  return candidate.test(marker);
}

function artifactHelperIds(nodes) {
  const output = new Set();
  for (const node of (nodes ?? [])) {
    if (typeof node?.id === "string" && node.id) output.add(node.id);
    if (Array.isArray(node?.scripts)) {
      for (const id of artifactHelperIds(node.scripts)) output.add(id);
    }
  }
  return output;
}

function artifactOpeningSources(value) {
  const sources = value?.data?.extensions?.rp_card_studio?.sources?.prompts;
  if (!Array.isArray(sources)) return [];
  return sources.map((source) => source?.value).filter((source) => isPlainObject(source));
}

function validateManagedOpeningUi(value, issues, warnings) {
  const sources = artifactOpeningSources(value);
  if (sources.length === 0) return;
  const displayPatterns = artifactUiDisplayPatterns(value);
  const promptPatterns = artifactUiPromptPatterns(value);
  const messages = [value?.data?.first_mes, ...(Array.isArray(value?.data?.alternate_greetings) ? value.data.alternate_greetings : [])];
  for (const [sourceIndex, source] of sources.entries()) {
    const openingUi = source.opening_ui;
    if (!isPlainObject(openingUi) || !openingUi.enabled) continue;
    const base = `/data/extensions/rp_card_studio/sources/prompts/${sourceIndex}/value/opening_ui`;
    const target = artifactStageTarget(source.status, issues, warnings);
    const route = openingUi.render_route ?? "regex_replace";
    const marker = typeof openingUi.marker === "string" ? openingUi.marker.trim() : "";
    if (route === "regex_replace") {
      if (!marker) target.push(issue(`${base}/marker`, "opening_ui.marker", "Regex opening frontend is missing its first-message marker"));
      else {
        if (!displayPatterns.some((pattern) => artifactPatternMatchesMarker(pattern, marker))) target.push(issue(`${base}/marker`, "opening_ui.display_consumer", `Managed opening marker ${marker} has no enabled display regex`));
        if (!promptPatterns.some((pattern) => artifactPatternMatchesMarker(pattern, marker))) target.push(issue(`${base}/marker`, "opening_ui.prompt_consumer", `Managed opening marker ${marker} has no prompt-only fallback regex`));
        if (!messages.some((message) => artifactMarkerAppearsInText(message, marker))) target.push(issue(`${base}/opening_id`, "opening_ui.producer", `No assembled opening message emits managed opening marker ${marker}`));
      }
    } else if (["helper_script", "ejs", "framework", "existing"].includes(route)) {
      const evidence = Array.isArray(openingUi.render_evidence) ? openingUi.render_evidence.filter((item) => typeof item === "string" && item.trim()) : [];
      if (!openingUi.render_ref && evidence.length === 0) target.push(issue(`${base}/render_evidence`, "opening_ui.render_evidence", `${route} opening route needs a real reference or evidence`));
    }
    const sourceOpenings = Array.isArray(source.openings) ? source.openings : [];
    const candidates = typeof openingUi.opening_id === "string" && openingUi.opening_id
      ? sourceOpenings.filter((opening) => opening.id === openingUi.opening_id)
      : sourceOpenings.filter((opening) => opening.is_default);
    if (["regex_replace", "inline_html"].includes(route) && !candidates.some((opening) => typeof opening.prompt_visible_text === "string" && opening.prompt_visible_text.trim())) target.push(issue(`${base}/opening_id`, "opening_ui.prompt_fallback", "Player-only opening UI should provide non-empty prompt_visible_text"));
  }
}

function validateManagedUiMarkerProducers(value, issues, warnings) {
  const uiSources = artifactUiSources(value);
  if (uiSources.length === 0) return;
  const displayPatterns = artifactUiDisplayPatterns(value);
  const openings = [value?.data?.first_mes, ...(Array.isArray(value?.data?.alternate_greetings) ? value.data.alternate_greetings : [])];
  const entries = worldbookEntries(value?.data?.character_book);
  const helperIds = artifactHelperIds(value?.data?.extensions?.tavern_helper?.scripts);

  for (const [uiIndex, source] of uiSources.entries()) {
    const uiBase = `/data/extensions/rp_card_studio/sources/ui/${uiIndex}/value/status_ui`;
    const target = artifactStageTarget(source.status, issues, warnings);
    validateManagedUiExperience(source.status_ui, uiBase, source.status, issues, warnings);
    const relationship = source.status_ui.opening_relationship ?? "separate";
    for (const [surfaceIndex, surface] of (source.status_ui.surfaces ?? []).entries()) {
      const base = `/data/extensions/rp_card_studio/sources/ui/${uiIndex}/value/status_ui/surfaces/${surfaceIndex}`;
      const route = surface?.render_route ?? "regex_replace";
      const marker = typeof surface?.marker === "string" ? surface.marker.trim() : "";
      if (route === "regex_replace") {
        if (!marker) { target.push(issue(`${base}/marker`, "ui.marker", "Regex UI surface is missing its capture marker or XML sample")); continue; }
        if (!displayPatterns.some((pattern) => artifactPatternMatchesMarker(pattern, marker))) target.push(issue(`${base}/marker`, "ui.marker_consumer", `Managed UI marker ${marker} has no enabled display regex consumer`));
      } else if (["helper_script", "ejs", "framework", "existing"].includes(route)) {
        const renderEvidence = Array.isArray(surface?.render_evidence) ? surface.render_evidence.filter((item) => typeof item === "string" && item.trim()) : [];
        if (!surface?.render_ref && renderEvidence.length === 0) target.push(issue(`${base}/render_evidence`, "ui.render_evidence", `${route} UI route needs a real reference or evidence`));
      }

      const belongsToOpening = openings.some((opening) => artifactMarkerAppearsInText(opening, marker));
      if (belongsToOpening && relationship === "separate") target.push(issue(`${base}`, "ui.stage_ownership", `First-message marker ${marker} overlaps ongoing UI; declare an intentional shared or transition relationship when appropriate`));

      const emission = surface?.emission;
      if (!isPlainObject(emission)) {
        if (route === "regex_replace") target.push(issue(`${base}/emission`, "ui.marker_producer", `Managed ongoing UI marker ${marker} has no model contract, framework, script, or user-action producer`));
        continue;
      }

      const producer = emission.producer;
      const cadence = emission.cadence;
      const sourceRef = emission.source_ref;
      const evidence = Array.isArray(emission.evidence) ? emission.evidence.filter((item) => typeof item === "string" && item.trim()) : [];
      if (producer === "opening_message") {
        if (!belongsToOpening) {
          target.push(issue(`${base}/emission/producer`, "ui.stage_ownership", "opening_message does not emit this marker"));
        } else if (relationship === "separate") {
          target.push(issue(`${base}/emission/producer`, "ui.stage_ownership", "opening_message producer requires an explicit shared or transition relationship"));
        }
        continue;
      }
      if (producer === "model_output") {
        const entry = entries.find((candidate) => candidate?.extensions?.rp_card_studio?.source_id === sourceRef);
        if (!entry) {
          target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_reference", `No embedded model-visible contract matches source_ref ${JSON.stringify(sourceRef ?? null)}`));
          continue;
        }
        const tracking = entry?.extensions?.rp_card_studio;
        if (entry.enabled === false || tracking?.visibility !== "model" || entry.constant !== true) {
          target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_contract", "Embedded UI output contract must be enabled, constant, and model-visible for every-message cadence"));
        }
        if (marker && !artifactMarkerAppearsInText(entry.content, marker)) target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_contract", `Embedded output contract does not contain the same marker/XML block ${marker}`));
        else if (!artifactHasOutputDirective(entry.content)) warnings.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_wording", "Output wording was not recognized automatically; review semantics manually"));
        continue;
      }
      if (producer === "helper_script" && (typeof sourceRef !== "string" || !helperIds.has(sourceRef))) {
        target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_reference", `No embedded Tavern Helper script matches producer source_ref ${JSON.stringify(sourceRef ?? null)}`));
      }
      if (["framework", "helper_script", "user_action", "existing"].includes(producer) && evidence.length === 0) {
        target.push(issue(`${base}/emission/evidence`, "ui.marker_producer_evidence", `${producer} producer needs actual evidence`));
      }
      if (producer === "user_action" && cadence === "every_assistant_message") {
        target.push(issue(`${base}/emission/cadence`, "ui.marker_producer_cadence", "user_action cannot guarantee a marker on every assistant message"));
      }
    }
  }
}
function validateWorldbook(value, basePath, issues) {
  if (!isPlainObject(value)) {
    issues.push(issue(basePath || "/", "type", "世界书必须是对象"));
    return;
  }
  if (!isPlainObject(value.entries)) {
    const looksLikeCharacterBook = Array.isArray(value.entries);
    issues.push(issue(
      `${basePath}/entries` || "/entries",
      looksLikeCharacterBook ? "format.character_book" : "type",
      looksLikeCharacterBook
        ? "Detected a bare CharacterBook. It belongs inside a Character Card and cannot be imported as a standalone SillyTavern worldbook"
        : "Standalone SillyTavern worldbook entries must be an object keyed by uid",
    ));
    return;
  }
  const usedUids = /* @__PURE__ */ new Set();
  for (const [key, entry] of Object.entries(value.entries)) {
    const entryPath = `${basePath}/entries/${key}`;
    if (!isPlainObject(entry)) {
      issues.push(issue(entryPath, "type", "世界书条目必须是对象"));
      continue;
    }
    if (Object.hasOwn(entry, "keys") || Object.hasOwn(entry, "insertion_order")) {
      issues.push(issue(entryPath, "format.character_book", "CharacterBook entry fields are not valid in a standalone SillyTavern worldbook"));
      continue;
    }
    if (!/^(0|[1-9]\d*)$/.test(key)) {
      issues.push(issue(entryPath, "worldbook.uid", `Worldbook entry key must be a canonical non-negative integer: ${key}`));
      continue;
    }
    const keyUid = Number(key);
    const uid = entry.uid === void 0 ? keyUid : entry.uid;
    if (typeof uid !== "number" || !Number.isInteger(uid) || uid < 0) {
      issues.push(issue(`${entryPath}/uid`, "worldbook.uid", `Worldbook uid must be a non-negative integer: ${entry.uid}`));
    } else {
      if (String(uid) !== key) issues.push(issue(`${entryPath}/uid`, "worldbook.uid", `Worldbook entry key ${key} does not match uid ${uid}`));
      if (usedUids.has(uid)) issues.push(issue(`${entryPath}/uid`, "worldbook.uid", `Duplicate worldbook uid: ${uid}`));
      usedUids.add(uid);
    }
    if (!Array.isArray(entry.key)) issues.push(issue(`${entryPath}/key`, "type", "Standalone worldbook key must be an array"));
    if (!Array.isArray(entry.keysecondary)) issues.push(issue(`${entryPath}/keysecondary`, "type", "Standalone worldbook keysecondary must be an array"));
    if (typeof entry.content !== "string") issues.push(issue(`${entryPath}/content`, "type", "Standalone worldbook content must be a string"));
    if (typeof entry.disable !== "boolean") issues.push(issue(`${entryPath}/disable`, "type", "Standalone worldbook disable must be a boolean"));
    if (!Number.isInteger(entry.position)) issues.push(issue(`${entryPath}/position`, "type", "Standalone worldbook position must be an integer"));
  }
}
export function issue(pathValue, rule, message) {
  return { path: pathValue || "/", rule, message };
}
export async function loadArtifact(inputPath) {
  const absolute = path.resolve(inputPath);
  const stats = await stat(absolute).catch((error) => {
    if (error?.code === "ENOENT") throw inputError(`输入不存在: ${absolute}`);
    throw error;
  });
  if (stats.isDirectory()) {
    return { format: Format.PROJECT, path: absolute, projectRoot: absolute };
  }
  if (!stats.isFile()) throw unsupportedError(`不支持的输入类型: ${absolute}`);
  const buffer = await readFile(absolute);
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const extracted = extractCardFromPng(buffer, absolute);
    const format = pngFormatForPayload(extracted.payload);
    const validation = validatePayload(extracted.payload, format);
    return {
      format,
      path: absolute,
      buffer,
      payload: extracted.payload,
      png: {
        selectedKeyword: extracted.selectedKeyword,
        charaChunks: extracted.charaChunks,
        ccv3Chunks: extracted.ccv3Chunks,
        nonCardDigest: extracted.nonCardDigest
      },
      validation,
      digest: sha256(buffer)
    };
  }
  const text = await readUtf8(absolute);
  const payload = parseJsonText(text, absolute);
  const format = detectJsonFormat(payload);
  if (!format) throw unsupportedError(`无法识别输入格式: ${absolute}`);
  return {
    format,
    path: absolute,
    buffer,
    payload,
    validation: validatePayload(payload, format),
    digest: sha256(buffer)
  };
}
