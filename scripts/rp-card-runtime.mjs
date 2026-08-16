import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { projectModelSource, semanticLeafPointers } from "./forge/projection.mjs";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function issue(pathValue, rule, message) {
  return { path: pathValue, rule, message };
}

const UI_BASELINE_EVIDENCE = Object.freeze({
  navigation: "内部导航",
  data_views: "多类数据视图",
  information_tools: "搜索、筛选、折叠或详情等信息操作",
  host_actions: "真实 SillyTavern / 酒馆助手联动动作",
  feedback_states: "确认、加载、空态、成功、失败或回退反馈",
  responsive_checks: "窄屏、触控、中文长文本或其他响应式检查",
  theme_features: "与项目题材绑定的主题视觉",
  data_binding: "真实数据读取、刷新与缺失处理",
});

const UI_ADVANCEMENT_KEYS = Object.freeze(["usability", "information_architecture", "interaction_depth", "visual_expression", "host_integration", "persistence_lifecycle"]);

function nonEmptyEvidence(value) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim());
}

function stageTarget(status, issues, warnings) {
  return status === "locked" ? issues : warnings;
}

function validateUiExperienceEvidence(statusUi, base, status, issues, warnings) {
  const evidence = statusUi?.experience_evidence;
  if (!isObject(evidence)) {
    warnings.push(issue(`${base}/experience_evidence`, "ui.experience_evidence", "建议记录玩家可验证的体验依据；它是质量复盘，不是填写数量门槛"));
    return;
  }

  const baseline = evidence.baseline;
  for (const [key, label] of Object.entries(UI_BASELINE_EVIDENCE)) {
    if (!isObject(baseline) || !nonEmptyEvidence(baseline[key])) {
      warnings.push(issue(`${base}/experience_evidence/baseline/${key}`, "ui.experience_baseline", `尚未记录${label}；不适用时可在阶段总结说明理由`));
    }
  }

  const advancements = evidence.level_advancements;
  const advancementCount = isObject(advancements)
    ? UI_ADVANCEMENT_KEYS.filter((key) => nonEmptyEvidence(advancements[key])).length
    : 0;
  const level = statusUi?.experience_level;
  if (level !== "light" && advancementCount === 0) {
    warnings.push(issue(`${base}/experience_evidence/level_advancements`, "ui.experience_advancement", `${level} 尚未说明相对轻型基线的实际增量；等级按整体玩家体验判断，不按数组数量计算`));
  }
  if (level === "super_heavy" && evidence.primary_play_surface !== true) {
    stageTarget(status, issues, warnings).push(issue(`${base}/experience_evidence/primary_play_surface`, "ui.experience_primary_surface", "超重型/0层游玩应明确持续消息前端是主要游玩表面"));
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function entries(sources, group) {
  return Array.isArray(sources?.[group]) ? sources[group] : [];
}

function values(sources, group) {
  return entries(sources, group).map((entry) => entry.value).filter(isObject);
}

function resolveWithin(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new Error("Runtime source path must be a non-empty string");
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relativePath);
  const relation = path.relative(absoluteRoot, absolute);
  if (relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation))) return absolute;
  throw new Error(`Runtime source escapes project root: ${relativePath}`);
}

const CHARACTER_BOOK_ID_MIN = 1_000_000;
const CHARACTER_BOOK_ID_MAX = 2_147_483_647;
const CHARACTER_BOOK_ID_SPAN = CHARACTER_BOOK_ID_MAX - CHARACTER_BOOK_ID_MIN + 1;

function canonicalCharacterBookId(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function characterBookIdCandidate(sourceKey) {
  if (typeof sourceKey !== "string" || sourceKey.length === 0) {
    throw new Error("CharacterBook source key must be a non-empty string");
  }
  const digest = createHash("sha256").update(`rp-card-studio:character-book:${sourceKey}`).digest();
  return CHARACTER_BOOK_ID_MIN + (digest.readUInt32BE(0) % CHARACTER_BOOK_ID_SPAN);
}

function trackedSourceKey(entry) {
  const tracking = entry?.extensions?.rp_card_studio;
  return isObject(tracking) && typeof tracking.source_key === "string" ? tracking.source_key : null;
}

export function createCharacterBookIdAllocator(existingEntries = []) {
  const list = Array.isArray(existingEntries) ? existingEntries : isObject(existingEntries) ? Object.values(existingEntries) : [];
  const used = new Set();
  const reusable = new Map();
  for (const entry of list) {
    const id = canonicalCharacterBookId(entry?.id);
    if (id === null) continue;
    used.add(id);
    const key = trackedSourceKey(entry);
    if (key && !reusable.has(key)) reusable.set(key, id);
  }
  const assigned = new Map();
  return {
    allocateMany(sourceKeys) {
      const result = new Map();
      for (const sourceKey of [...new Set(sourceKeys)].sort()) {
        if (assigned.has(sourceKey)) {
          result.set(sourceKey, assigned.get(sourceKey));
          continue;
        }
        const reusableId = reusable.get(sourceKey);
        if (reusableId !== undefined) {
          const allocation = { id: reusableId, candidate: reusableId, collision: false, reused: true };
          assigned.set(sourceKey, allocation);
          result.set(sourceKey, allocation);
          continue;
        }
        const candidate = characterBookIdCandidate(sourceKey);
        let id = candidate;
        let collision = false;
        while (used.has(id)) {
          collision = true;
          id = id >= CHARACTER_BOOK_ID_MAX ? CHARACTER_BOOK_ID_MIN : id + 1;
          if (id === candidate) throw new Error("CharacterBook id space exhausted");
        }
        used.add(id);
        const allocation = { id, candidate, collision, reused: false };
        assigned.set(sourceKey, allocation);
        result.set(sourceKey, allocation);
      }
      return result;
    },
  };
}

function allOpenings(openingSources) {
  return (openingSources ?? []).flatMap((source) => source?.openings ?? []);
}

export function selectOpeningMessages(openingSources) {
  const openings = allOpenings(openingSources);
  if (openings.length === 0) return null;
  const defaultOpening = openings.find((opening) => opening.is_default) ?? openings[0];
  const text = (opening) => String(opening.visible_text ?? opening.text ?? "");
  return {
    first: text(defaultOpening),
    alternates: openings.filter((opening) => opening !== defaultOpening).map(text),
    selection: {
      default: { opening_id: defaultOpening.id },
      alternates: openings.filter((opening) => opening !== defaultOpening).map((opening) => ({ opening_id: opening.id })),
      evidence: "artifact_only",
    },
  };
}

function normalizeRefId(reference, prefix) {
  if (typeof reference !== "string") return null;
  return reference.startsWith(prefix) ? reference.slice(prefix.length) : reference;
}

function validateMediaConsumers(sources, issues) {
  const targets = new Map([
    ["opening", new Set(values(sources, "prompts").flatMap((source) => source.openings ?? []).map((opening) => opening.id))],
    ["character", new Set(values(sources, "characters").map((source) => source.id))],
    ["scene", new Set(values(sources, "scenes").map((source) => source.id))],
    ["world", new Set(values(sources, "world").map((source) => source.id))],
    ["system", new Set(values(sources, "systems").map((source) => source.id))],
    ["ui", new Set(values(sources, "ui").flatMap((source) => [
      ...(source.status_ui?.sections ?? []).map((section) => section.id),
      ...source.ui_component ? [source.ui_component.id] : [],
    ]))]
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

function assemblySources(sources) {
  return values(sources, "assembly");
}

function stringifyWorldbookYaml(value) {
  return YAML.stringify(value, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  }).trimEnd();
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

function validateCharacterBookCoverage(manifest, sources, base, warnings, project) {
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
    warnings.push(issue(
      `${base}/worldbook_manifest/entries`,
      "assembly.coverage",
      `[assembly.coverage] 世界书装配未完整覆盖 ${required.label}（${sourceHint}；缺少 ${missingHint}）；可用一个整源条目或多个 selector 条目联合覆盖，并分别明确触发、插入、深度、顺序、概率与递归策略`,
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
    if (insertion.position === "outlet" && !insertion.outlet_name) {
      issues.push(issue(`${entryPath}/insertion/outlet_name`, "assembly.insertion", "outlet 条目必须填写 outlet_name"));
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
    const positioning = entries(sources, "positioning")[0]?.value;
    const packageMode = positioning?.card_mode;
    const isProjectShapedCard = target === "character"
      && packageMode
      && packageMode !== "pending"
      && packageMode !== "single_character_card";
    if (
      assembly?.status === "locked"
      && project?.project?.operation === "create"
      && isProjectShapedCard
      && !assembly.card_entry
    ) {
      issues.push(issue(
        `/runtime/assembly/${sourceIndex}/card_entry`,
        "assembly.card_entry",
        "完整世界、玩法、群像或长期 RP 包必须在整合阶段维护最终 card_entry；不要把定位阶段的短摘要直接当作 data.description"
      ));
    }
    if (
      assembly?.status === "locked"
      && ["core_world_contract", "compact_package_entry"].includes(assembly.card_entry?.mode)
      && (typeof assembly.card_entry?.content !== "string" || !assembly.card_entry.content.trim())
    ) {
      issues.push(issue(
        `/runtime/assembly/${sourceIndex}/card_entry/content`,
        "assembly.card_entry",
        "锁定的 card_entry 必须包含最终可投影内容"
      ));
    }
    const manifest = assembly.worldbook_manifest;
    issues.push(...worldbookHostIssues(manifest, target, `/runtime/assembly/${sourceIndex}`));
    const requiredSources = requiredCharacterBookSources(sources, project);
    if (
      target === "character"
      && assembly?.status === "locked"
      && requiredSources.length > 0
      && (manifest?.entries ?? []).length === 0
    ) {
      issues.push(issue(
        `/runtime/assembly/${sourceIndex}/worldbook_manifest/entries`,
        "assembly.worldbook_empty",
        "锁定的角色卡整合清单没有任何 CharacterBook 条目；卡内虽可能出现空 character_book 容器，但世界、人物、系统和场景不会被导入或挂载",
      ));
    }
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
    validateCharacterBookCoverage(manifest, sources, `/runtime/assembly/${sourceIndex}`, warnings, project);
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
      return typeof selected === "string" ? selected : stringifyWorldbookYaml(selected);
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
    return typeof selected === "string" ? selected : stringifyWorldbookYaml(selected);
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
  return typeof content === "string" ? content : stringifyWorldbookYaml(content);
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
  const rawPosition = ({
    before_char: 0,
    after_char: 1,
    author_note_top: 2,
    author_note_bottom: 3,
    at_depth: 4,
    before_example: 5,
    after_example: 6,
    outlet: 7,
  })[insertion.position ?? "before_char"];
  const rawRole = ({ system: 0, user: 1, assistant: 2 })[insertion.role] ?? null;
  const rawHostFields = {
    useProbability: entry.use_probability ?? true,
    probability,
    excludeRecursion: Boolean(recursion.prevent_incoming),
    preventRecursion: Boolean(recursion.prevent_outgoing),
    delayUntilRecursion: recursion.delay_until_recursion ?? false,
    ignoreBudget,
    depth: insertion.depth ?? null,
    role: rawRole,
    selectiveLogic,
    caseSensitive: activation.case_sensitive ?? null,
    matchWholeWords: activation.match_whole_words ?? null,
    matchPersonaDescription: activation.match_persona_description ?? false,
    matchCharacterDescription: activation.match_character_description ?? false,
    matchCharacterPersonality: activation.match_character_personality ?? false,
    matchCharacterDepthPrompt: activation.match_character_depth_prompt ?? false,
    matchScenario: activation.match_scenario ?? false,
    matchCreatorNotes: activation.match_creator_notes ?? false,
    outletName: insertion.outlet_name ?? "",
    group: entry.group ?? "",
    groupOverride: entry.group_override ?? false,
    groupWeight: entry.group_weight ?? null,
    useGroupScoring: entry.use_group_scoring ?? null,
    automationId: entry.automation_id ?? "",
    vectorized: entry.vectorized ?? false,
    sticky: entry.sticky ?? null,
    cooldown: entry.cooldown ?? null,
    delay: entry.delay ?? null,
    triggers: clone(entry.triggers ?? []),
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
    use_probability: rawHostFields.useProbability,
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
    match_persona_description: rawHostFields.matchPersonaDescription,
    match_character_description: rawHostFields.matchCharacterDescription,
    match_character_personality: rawHostFields.matchCharacterPersonality,
    match_character_depth_prompt: rawHostFields.matchCharacterDepthPrompt,
    match_scenario: rawHostFields.matchScenario,
    match_creator_notes: rawHostFields.matchCreatorNotes,
    outlet_name: rawHostFields.outletName,
    group: rawHostFields.group,
    group_override: rawHostFields.groupOverride,
    group_weight: rawHostFields.groupWeight,
    use_group_scoring: rawHostFields.useGroupScoring,
    automation_id: rawHostFields.automationId,
    vectorized: rawHostFields.vectorized,
    sticky: rawHostFields.sticky,
    cooldown: rawHostFields.cooldown,
    delay: rawHostFields.delay,
    triggers: rawHostFields.triggers,
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

async function authoredText(projectRoot, inlineValue, fileValue, label) {
  if (typeof inlineValue === "string" && typeof fileValue === "string") throw new Error(`${label} defines both inline content and a file`);
  if (typeof fileValue === "string") return readFile(resolveWithin(projectRoot, fileValue), "utf8");
  if (typeof inlineValue === "string") return inlineValue;
  throw new Error(`${label} must define inline content or a file`);
}

function mergeById(existing, authored, pathValue) {
  const output = Array.isArray(existing) ? clone(existing) : [];
  const issues = [];
  for (const item of authored) {
    const policy = item.collision ?? "error";
    const clean = clone(item);
    delete clean.collision;
    const index = output.findIndex((candidate) => candidate?.id === clean.id);
    if (index < 0) output.push(clean);
    else if (policy === "replace") output[index] = clean;
    else if (policy !== "keep" && canonicalJson(output[index]) !== canonicalJson(clean)) {
      issues.push(issue(pathValue, "assembly.runtime_collision", `Runtime id collides: ${clean.id}`));
    }
  }
  return { value: output, issues };
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (isObject(value) && isObject(target[key])) deepMerge(target[key], value);
    else target[key] = clone(value);
  }
  return target;
}

async function applyAuthoredRuntime(payload, runtime, projectRoot, target) {
  const issues = [];
  if (!runtime || runtime.mode !== "authored" || target !== "character") return issues;
  payload.data ??= {};
  payload.data.extensions = isObject(payload.data.extensions) ? payload.data.extensions : {};

  const regexes = [];
  for (const [index, source] of (runtime.regex_scripts ?? []).entries()) {
    try {
      let replacement = await authoredText(projectRoot, source.replace_string, source.replace_file, `regex_scripts[${index}]`);
      if (source.wrap_as_html_codeblock && !/^\s*```html\b/i.test(replacement)) replacement = `\`\`\`html\n${replacement.trim()}\n\`\`\``;
      regexes.push({
        id: source.id,
        scriptName: source.script_name,
        findRegex: source.find_regex,
        replaceString: replacement,
        trimStrings: clone(source.trim_strings ?? []),
        placement: clone(source.placement),
        disabled: Boolean(source.disabled),
        markdownOnly: Boolean(source.markdown_only),
        promptOnly: Boolean(source.prompt_only),
        runOnEdit: source.run_on_edit !== false,
        substituteRegex: source.substitute_regex ?? 0,
        minDepth: source.min_depth ?? null,
        maxDepth: source.max_depth ?? null,
        collision: source.collision,
      });
    } catch (error) {
      issues.push(issue(`/runtime_manifest/regex_scripts/${index}`, "runtime.source", error.message));
    }
  }
  const mergedRegex = mergeById(payload.data.extensions.regex_scripts, regexes, "/data/extensions/regex_scripts");
  issues.push(...mergedRegex.issues);
  if (regexes.length || Array.isArray(payload.data.extensions.regex_scripts)) payload.data.extensions.regex_scripts = mergedRegex.value;

  async function materializeHelperNode(source, sourcePath) {
    if (source.type === "folder") {
      const scripts = [];
      for (const [index, child] of (source.scripts ?? []).entries()) {
        scripts.push(await materializeHelperNode({ ...child, type: "script" }, `${sourcePath}/scripts/${index}`));
      }
      return {
        type: "folder",
        enabled: source.enabled !== false,
        name: source.name,
        id: source.id,
        icon: source.icon ?? "",
        color: source.color ?? "",
        scripts,
        collision: source.collision,
      };
    }
    return {
      type: "script",
      enabled: source.enabled !== false,
      name: source.name,
      id: source.id,
      content: await authoredText(projectRoot, source.content, source.content_file, sourcePath),
      info: source.info ?? "",
      button: clone(source.button ?? { enabled: false, buttons: [] }),
      data: clone(source.data ?? {}),
      export_with: clone(source.export_with ?? { data: true, button: true }),
      collision: source.collision,
    };
  }

  const helpers = [];
  for (const [index, source] of (runtime.tavern_helper_scripts ?? []).entries()) {
    try {
      helpers.push(await materializeHelperNode(source, `tavern_helper_scripts[${index}]`));
    } catch (error) {
      issues.push(issue(`/runtime_manifest/tavern_helper_scripts/${index}`, "runtime.source", error.message));
    }
  }
  if (helpers.length) {
    const extension = isObject(payload.data.extensions.tavern_helper) ? clone(payload.data.extensions.tavern_helper) : {};
    const merged = mergeById(extension.scripts, helpers, "/data/extensions/tavern_helper/scripts");
    issues.push(...merged.issues);
    extension.scripts = merged.value;
    payload.data.extensions.tavern_helper = extension;
  }
  deepMerge(payload.data.extensions, runtime.extension_fields ?? {});
  return issues;
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
  issues.push(...await applyAuthoredRuntime(output, manifests[0]?.runtime_manifest, projectRoot, target));
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

function parseRegexLiteral(value) {
  if (typeof value !== "string") throw new Error("find_regex must be a string");
  const match = value.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/);
  return match ? new RegExp(match[1], match[2]) : new RegExp(value);
}

function updateBlockTags(text) {
  const tags = new Set();
  const blocks = /<([A-Za-z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of String(text ?? "").matchAll(blocks)) {
    const [, tag, body] = match;
    if (/update.*variable|variable.*update/i.test(tag) || /_\.(?:set|assign|unset|update)\s*\(|"op"\s*:/i.test(body)) {
      tags.add(tag);
    }
  }
  return tags;
}

function isAiDisplayRegex(regex) {
  return regex?.disabled !== true
    && Array.isArray(regex?.placement)
    && regex.placement.includes(2)
    && regex?.prompt_only !== true;
}

async function authoredDisplayRegexPipeline(runtime, projectRoot) {
  const pipeline = [];
  for (const [index, regex] of (runtime?.regex_scripts ?? []).entries()) {
    if (!isAiDisplayRegex(regex)) continue;
    try {
      pipeline.push({
        pattern: parseRegexLiteral(regex.find_regex),
        replacement: await authoredText(projectRoot, regex.replace_string, regex.replace_file, `regex_scripts[${index}]`),
      });
    } catch {
      // validateAuthoredRuntime reports syntax and source errors separately.
    }
  }
  return pipeline;
}

function applyRegexPipeline(text, pipeline) {
  return pipeline.reduce((current, regex) => current.replace(regex.pattern, regex.replacement), text);
}

function markerAppearsInText(text, marker) {
  const source = String(text ?? "");
  const exact = String(marker ?? "").trim();
  if (!exact) return false;
  if (source.includes(exact)) return true;
  const tag = exact.match(/^<([^\s/>]+)\b/)?.[1];
  if (!tag) return false;
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`<${escaped}(?:\\s|/?>)`, "i");
  if (!opening.test(source)) return false;
  return !exact.includes(`</${tag}>`) || new RegExp(`</${escaped}\\s*>`, "i").test(source);
}

function hasOutputDirective(text) {
  return /(?:每(?:次|轮).{0,24}回复|回复.{0,16}(?:末尾|结尾)|(?:必须|务必|始终|固定).{0,16}(?:输出|追加|附加|写入)|(?:输出|追加|附加|写入).{0,24}(?:标签|标记|XML|状态块)|(?:always|every|each).{0,24}(?:output|append|emit)|(?:output|append|emit).{0,24}(?:response|reply))/is.test(String(text ?? ""));
}

function regexMatchesMarker(pattern, marker) {
  const candidate = new RegExp(pattern.source, pattern.flags);
  candidate.lastIndex = 0;
  return candidate.test(marker);
}

function uiDisplayRegexPatterns(runtime) {
  const patterns = [];
  for (const regex of (runtime?.regex_scripts ?? [])) {
    if (regex?.disabled === true || regex?.prompt_only === true || regex?.markdown_only !== true || !Array.isArray(regex?.placement) || regex.placement.length === 0) continue;
    try { patterns.push(parseRegexLiteral(regex.find_regex)); }
    catch { /* validateAuthoredRuntime reports malformed patterns separately. */ }
  }
  return patterns;
}

function uiPromptRegexPatterns(runtime) {
  const patterns = [];
  for (const regex of (runtime?.regex_scripts ?? [])) {
    if (regex?.disabled === true || regex?.prompt_only !== true || !Array.isArray(regex?.placement) || regex.placement.length === 0) continue;
    try { patterns.push(parseRegexLiteral(regex.find_regex)); }
    catch { /* validateAuthoredRuntime reports malformed patterns separately. */ }
  }
  return patterns;
}

async function validateOpeningUiSources(sources, projectRoot, assembly, issues, warnings) {
  const runtime = assembly?.runtime_manifest;
  const displayPatterns = uiDisplayRegexPatterns(runtime);
  const promptPatterns = uiPromptRegexPatterns(runtime);
  const helperIds = helperRuntimeIds(runtime?.tavern_helper_scripts);
  for (const [sourceIndex, source] of values(sources, "prompts").entries()) {
    const openingUi = source.opening_ui;
    if (!isObject(openingUi) || !openingUi.enabled) continue;
    const base = `/runtime/opening/${sourceIndex}/opening_ui`;
    const target = stageTarget(source.status, issues, warnings);
    const route = openingUi.render_route ?? "regex_replace";
    const marker = typeof openingUi.marker === "string" ? openingUi.marker.trim() : "";
    const sourceOpenings = Array.isArray(source.openings) ? source.openings : [];
    const candidates = typeof openingUi.opening_id === "string" && openingUi.opening_id
      ? sourceOpenings.filter((opening) => opening.id === openingUi.opening_id)
      : sourceOpenings.filter((opening) => opening.is_default);
    if (candidates.length === 0) target.push(issue(`${base}/opening_id`, "opening_ui.producer", "开场前端没有对应的默认或指定 opening"));
    if (["regex_replace", "inline_html"].includes(route)) {
      const file = openingUi.file;
      if (typeof file !== "string" || !file) target.push(issue(`${base}/file`, "opening_ui.source", `${route} 开场前端需要真实 HTML 源文件`));
      else { try { await stat(resolveWithin(projectRoot, file)); } catch { target.push(issue(`${base}/file`, "opening_ui.source", `开场前端源文件不存在: ${file}`)); } }
    }
    if (route === "regex_replace") {
      if (!marker) target.push(issue(`${base}/marker`, "opening_ui.marker", "正则替换路线必须声明首消息标记"));
      else {
        if (!displayPatterns.some((pattern) => regexMatchesMarker(pattern, marker))) target.push(issue(`${base}/marker`, "opening_ui.display_consumer", `开场标记 ${marker} 没有对应 display 正则`));
        if (!promptPatterns.some((pattern) => regexMatchesMarker(pattern, marker))) target.push(issue(`${base}/marker`, "opening_ui.prompt_consumer", `开场标记 ${marker} 没有 prompt-only 回退正则`));
        if (candidates.length > 0 && !candidates.some((opening) => markerAppearsInText(opening.visible_text ?? opening.text, marker))) target.push(issue(`${base}/opening_id`, "opening_ui.producer", `目标 opening 没有生产开场标记 ${marker}`));
      }
    } else if (route === "helper_script") {
      if (typeof openingUi.render_ref !== "string" || !helperIds.has(openingUi.render_ref)) target.push(issue(`${base}/render_ref`, "opening_ui.render_reference", "helper_script 路线必须指向实际 Tavern Helper 脚本"));
    } else if (["ejs", "framework", "existing"].includes(route)) {
      const evidence = Array.isArray(openingUi.render_evidence) ? openingUi.render_evidence.filter((item) => typeof item === "string" && item.trim()) : [];
      if (!openingUi.render_ref && evidence.length === 0) target.push(issue(`${base}/render_evidence`, "opening_ui.render_evidence", `${route} 路线需要真实引用或运行证据`));
    }
    if (["regex_replace", "inline_html"].includes(route) && !candidates.some((opening) => typeof opening.prompt_visible_text === "string" && opening.prompt_visible_text.trim())) target.push(issue(`${base}/opening_id`, "opening_ui.prompt_fallback", "会向玩家显示纯界面的开场应提供模型可见的文本回退"));
  }
}

async function validateUiSurfaceProducers(sources, projectRoot, assembly, openings, issues, warnings) {
  const runtime = assembly?.runtime_manifest;
  const displayPatterns = uiDisplayRegexPatterns(runtime);
  const worldbookEntries = assembly?.worldbook_manifest?.entries ?? [];
  const helperIds = helperRuntimeIds(runtime?.tavern_helper_scripts);

  for (const [uiIndex, uiSource] of values(sources, "ui").entries()) {
    const statusUi = uiSource.status_ui ?? {};
    if (!statusUi.enabled) continue;
    const uiBase = `/runtime/ui/${uiIndex}/status_ui`;
    const target = stageTarget(uiSource.status, issues, warnings);
    validateUiExperienceEvidence(statusUi, uiBase, uiSource.status, issues, warnings);
    const relationship = statusUi.opening_relationship ?? "separate";
    for (const [surfaceIndex, surface] of (statusUi.surfaces ?? []).entries()) {
      const base = `/runtime/ui/${uiIndex}/status_ui/surfaces/${surfaceIndex}`;
      const route = surface?.render_route ?? "regex_replace";
      const marker = typeof surface?.marker === "string" ? surface.marker.trim() : "";
      if (route === "regex_replace") {
        if (!marker) { target.push(issue(`${base}/marker`, "ui.marker", "正则替换路线必须声明真实捕获标记或 XML 样例")); continue; }
        if (!displayPatterns.some((pattern) => regexMatchesMarker(pattern, marker))) target.push(issue(`${base}/marker`, "ui.marker_consumer", `UI 标记 ${marker} 没有对应 display 正则`));
      } else if (route === "inline_html") {
        if (typeof surface?.file !== "string" || !surface.file) target.push(issue(`${base}/file`, "ui.render_source", "inline_html 路线需要真实 HTML 源文件"));
        else { try { await stat(resolveWithin(projectRoot, surface.file)); } catch { target.push(issue(`${base}/file`, "ui.render_source", `UI 源文件不存在: ${surface.file}`)); } }
      } else if (route === "helper_script") {
        if (typeof surface?.render_ref !== "string" || !helperIds.has(surface.render_ref)) target.push(issue(`${base}/render_ref`, "ui.render_reference", "helper_script 渲染路线必须指向实际 Tavern Helper 脚本"));
      } else {
        const renderEvidence = Array.isArray(surface?.render_evidence) ? surface.render_evidence.filter((item) => typeof item === "string" && item.trim()) : [];
        if (!surface?.render_ref && renderEvidence.length === 0) target.push(issue(`${base}/render_evidence`, "ui.render_evidence", `${route} 渲染路线需要真实引用或证据`));
      }

      const belongsToOpening = marker && openings.some((opening) => markerAppearsInText(opening.visible_text ?? opening.text, marker));
      if (belongsToOpening && relationship === "separate") target.push(issue(`${base}`, "ui.stage_ownership", `首条消息标记 ${marker} 与持续 UI 重合；若为有意共享，请声明 opening_relationship`));

      const emission = surface?.emission;
      if (!isObject(emission)) {
        if (route === "regex_replace") target.push(issue(`${base}/emission`, "ui.marker_producer", `持续 UI 标记 ${marker} 没有模型输出合同、框架、脚本或用户动作生产者`));
        continue;
      }

      const producer = emission.producer;
      const cadence = emission.cadence;
      const sourceRef = emission.source_ref;
      const evidence = Array.isArray(emission.evidence) ? emission.evidence.filter((item) => typeof item === "string" && item.trim()) : [];
      if (producer === "opening_message") {
        if (!belongsToOpening) target.push(issue(`${base}/emission/producer`, "ui.stage_ownership", "opening_message 没有在目标开场中产生该标记"));
        else if (relationship === "separate") target.push(issue(`${base}/emission/producer`, "ui.stage_ownership", "持续 UI 使用 opening_message 时必须声明共享或过渡关系"));
        continue;
      }

      if (producer === "model_output") {
        const entry = worldbookEntries.find((candidate) => candidate?.id === sourceRef);
        if (!entry) {
          target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_reference", `模型输出生产者应指向实际模型可见合同；未找到 ${JSON.stringify(sourceRef ?? null)}`));
          continue;
        }
        if (entry.enabled === false || entry.visibility !== "model") {
          target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_contract", "UI 输出合同必须启用且对模型可见"));
        }
        if (entry?.activation?.mode !== "constant") {
          target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_contract", "每轮输出合同应常驻；按需输出可选择其他 cadence 或生产路线"));
        }
        try {
          const content = await resolveWorldbookContent(entry.source, sources, projectRoot, entry.display_name);
          if (marker && !markerAppearsInText(content, marker)) target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_contract", `模型输出合同没有包含同一个标记/XML块 ${marker}`));
          else if (!hasOutputDirective(content)) warnings.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_wording", `合同 ${sourceRef} 的输出措辞未被自动识别；请人工确认语义，措辞本身不阻断构建`));
        } catch (error) {
          target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_contract", error.message));
        }
        continue;
      }

      if (producer === "helper_script" && (typeof sourceRef !== "string" || !helperIds.has(sourceRef))) {
        target.push(issue(`${base}/emission/source_ref`, "ui.marker_producer_reference", `helper_script 生产者必须指向实际 Tavern Helper 脚本；未找到 ${JSON.stringify(sourceRef ?? null)}`));
      }
      if (["framework", "helper_script", "user_action", "existing"].includes(producer) && evidence.length === 0) {
        target.push(issue(`${base}/emission/evidence`, "ui.marker_producer_evidence", `${producer} 生产者需要记录实际证据`));
      }
      if (producer === "user_action" && cadence === "every_assistant_message") {
        target.push(issue(`${base}/emission/cadence`, "ui.marker_producer_cadence", "user_action 不能保证每条 AI 回复都产生标记"));
      }
    }
  }
}

async function validateMvuUpdateBlockDisplay(mvu, runtime, projectRoot, base, issues) {
  if (mvu?.update_strategy?.response_transport !== "chat_message") return;

  const protocolParts = [];
  for (const name of ["update_rules", "output_format"]) {
    const relativePath = mvu?.files?.[name];
    if (typeof relativePath !== "string" || !relativePath) continue;
    try {
      protocolParts.push(await readFile(resolveWithin(projectRoot, relativePath), "utf8"));
    } catch {
      // validateMvuRuntimeSources reports missing files separately.
    }
  }
  const tags = new Set(protocolParts.flatMap((text) => [...updateBlockTags(text)]));
  if (tags.size === 0) return;

  const cleanupMode = mvu?.update_strategy?.display_cleanup?.mode
    ?? (mvu?.route === "existing" ? "existing" : "card_regex");
  if (cleanupMode !== "card_regex") return;

  const pipeline = await authoredDisplayRegexPipeline(runtime, projectRoot);
  for (const tag of tags) {
    const completeSentinel = `__RP_MVU_COMPLETE_${tag}__`;
    const streamingSentinel = `__RP_MVU_STREAMING_${tag}__`;
    const complete = `正文\n<${tag}>\n<Analysis>${completeSentinel}</Analysis>\n_.set('状态', 0, 1);\n</${tag}>\n正文`;
    const streaming = `正文\n<${tag}>\n<Analysis>${streamingSentinel}</Analysis>\n_.set('状态', 0,`;
    if (applyRegexPipeline(complete, pipeline).includes(completeSentinel)) {
      issues.push(issue(
        `${base}/mvu/update_strategy/display_cleanup`,
        "mvu.update_block_complete_visibility",
        `聊天变量协议 <${tag}> 的完整技术块仍会出现在玩家显示层；请增加匹配本卡真实标签的完整块隐藏正则，或显式记录已经验证的外部清理机制`,
      ));
    }
    if (applyRegexPipeline(streaming, pipeline).includes(streamingSentinel)) {
      issues.push(issue(
        `${base}/mvu/update_strategy/display_cleanup`,
        "mvu.update_block_streaming_visibility",
        `聊天变量协议 <${tag}> 在流式生成尚未闭合时仍会泄露技术正文；请增加流式半块隐藏正则，或显式记录已经验证的外部清理机制`,
      ));
    }
  }
}

async function validateAuthoredRuntime(runtime, projectRoot, issues, warnings) {
  if (!runtime) return;
  if (runtime.mode !== "authored") {
    issues.push(issue("/runtime_manifest/mode", "runtime.mode", "New projects must use authored runtime components"));
    return;
  }
  const ids = new Set();
  for (const [index, regex] of (runtime.regex_scripts ?? []).entries()) {
    const base = `/runtime_manifest/regex_scripts/${index}`;
    if (ids.has(regex.id)) issues.push(issue(`${base}/id`, "runtime.duplicate", `Duplicate runtime id: ${regex.id}`));
    ids.add(regex.id);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(regex.id ?? "")) {
      issues.push(issue(`${base}/id`, "regex.id", "角色卡正则 id 必须是 UUID"));
    }
    try { parseRegexLiteral(regex.find_regex); } catch (error) { issues.push(issue(`${base}/find_regex`, "regex.syntax", error.message)); }
    if (Number.isInteger(regex.min_depth) && Number.isInteger(regex.max_depth) && regex.min_depth > regex.max_depth) {
      issues.push(issue(base, "regex.depth", "min_depth exceeds max_depth"));
    }
    try {
      const replacement = await authoredText(projectRoot, regex.replace_string, regex.replace_file, base);
      if (regex.wrap_as_html_codeblock && !/<!doctype html|<html\b/i.test(replacement)) warnings.push(issue(base, "ui.document", "HTML wrapper requested but source is not a complete HTML document"));
    } catch (error) { issues.push(issue(base, "runtime.source", error.message)); }
  }
  async function validateHelperNode(script, base) {
    if (ids.has(script.id)) issues.push(issue(`${base}/id`, "runtime.duplicate", `Duplicate runtime id: ${script.id}`));
    ids.add(script.id);
    if (script.type === "folder") {
      for (const [index, child] of (script.scripts ?? []).entries()) {
        await validateHelperNode({ ...child, type: "script" }, `${base}/scripts/${index}`);
      }
      return;
    }
    try {
      const content = await authoredText(projectRoot, script.content, script.content_file, base);
      if (!content.trim()) issues.push(issue(base, "runtime.source", "Tavern Helper script is empty"));
    } catch (error) { issues.push(issue(base, "runtime.source", error.message)); }
  }
  for (const [index, script] of (runtime.tavern_helper_scripts ?? []).entries()) {
    await validateHelperNode(script, `/runtime_manifest/tavern_helper_scripts/${index}`);
  }
}

function helperRuntimeIds(nodes) {
  return new Set((nodes ?? []).flatMap((node) => node?.type === "folder"
    ? [node.id, ...helperRuntimeIds(node.scripts)]
    : [node?.id]).filter(Boolean));
}

async function validateMvuRuntimeSources(project, sources, projectRoot, assembly, issues, warnings) {
  const helperIds = helperRuntimeIds(assembly?.runtime_manifest?.tavern_helper_scripts);
  for (const [index, source] of values(sources, "mvu").entries()) {
    const base = `/runtime/mvu/${index}`;
    const target = stageTarget(source.status, issues, warnings);
    const mvu = source.mvu ?? {};
    if (mvu.enabled) {
      if (!mvu.route || mvu.route === "none") {
        target.push(issue(`${base}/mvu/route`, "mvu.route", "启用 MVU 时需要选择 native_schema、mvu_zod、hybrid 或 existing 路线"));
      }
      const initialValues = mvu.files?.initial_values;
      if (mvu.route !== "existing" && !initialValues) {
        target.push(issue(`${base}/mvu/files/initial_values`, "mvu.initial_values", "新 MVU 路线需要实际初始变量源；MVU_ZOD 不能代替初始值"));
      }
      if (mvu.route !== "existing" && initialValues) {
        const projectedInitVar = (assembly?.worldbook_manifest?.entries ?? []).some((entry) => String(entry?.display_name ?? "").toLowerCase().includes("[initvar]") && isObject(entry?.source));
        if (!projectedInitVar) {
          target.push(issue(`${base}/mvu/files/initial_values`, "mvu.initial_values_projection", "最终 CharacterBook 需要名称含 [initvar] 的有效初始化条目；其维护源可以是文件、内联、登记源或既有导入"));
        }
      }
      if (["mvu_zod", "hybrid"].includes(mvu.route) && !mvu.files?.schema_script) {
        target.push(issue(`${base}/mvu/files/schema_script`, "mvu.schema", "MVU_ZOD 路线需要实际变量结构脚本"));
      }
      const delivery = mvu.framework?.delivery;
      if (mvu.route !== "existing" && !["card_script", "host_required"].includes(delivery)) {
        target.push(issue(`${base}/mvu/framework/delivery`, "mvu.loader", "MVU 路线需要明确由卡内脚本加载框架，或声明宿主预装"));
      }
      if (delivery === "card_script") {
        const loaderId = mvu.framework?.loader_script_id;
        if (!loaderId || !helperIds.has(loaderId)) {
          target.push(issue(`${base}/mvu/framework/loader_script_id`, "mvu.loader", "卡内 MVU 路线缺少与 loader_script_id 对应的 Tavern Helper 加载脚本"));
        }
      }
      if (delivery === "host_required") {
        warnings.push(issue(`${base}/mvu/framework`, "mvu.host_dependency", "MVU 框架依赖宿主预装；角色卡自身不携带加载器"));
      }
      for (const [name, relativePath] of Object.entries(mvu.files ?? {})) {
        const fileList = Array.isArray(relativePath) ? relativePath : [relativePath];
        for (const [fileIndex, candidate] of fileList.entries()) {
          if (typeof candidate !== "string" || !candidate) continue;
          try { await stat(resolveWithin(projectRoot, candidate)); }
          catch { target.push(issue(`${base}/mvu/files/${name}/${fileIndex}`, "mvu.source", `MVU 源文件不存在: ${candidate}`)); }
        }
      }
      await validateMvuUpdateBlockDisplay(mvu, assembly?.runtime_manifest, projectRoot, base, target);
    }
    const ejs = source.ejs ?? {};
    if (ejs.enabled && (!Array.isArray(ejs.templates) || ejs.templates.length === 0)) {
      target.push(issue(`${base}/ejs/templates`, "ejs.source", "启用 EJS 时至少需要一份真实模板及其宿主位置"));
    }
    for (const [templateIndex, template] of (ejs.templates ?? []).entries()) {
      try { await stat(resolveWithin(projectRoot, template.file)); }
      catch { target.push(issue(`${base}/ejs/templates/${templateIndex}/file`, "ejs.source", `EJS 源文件不存在: ${template.file}`)); }
    }
  }
}

export async function validateRuntimeSources({ project, sources, projectRoot }) {
  const issues = [];
  const warnings = [];
  const assemblies = assemblySources(sources);
  if (assemblies.length > 1) {
    issues.push(issue('/source_manifest/assembly', 'assembly.configuration', 'Exactly one assembly source is allowed'));
  }
  const assembly = assemblies[0];
  const openingUiEnabled = values(sources, "prompts").some((source) => source?.opening_ui?.enabled === true);
  if ((project?.features?.mvu || project?.features?.ejs || project?.features?.status_ui || openingUiEnabled) && !assembly?.runtime_manifest) {
    const lockedRuntime = assembly?.status === "locked"
      || values(sources, "mvu").some((source) => source.status === "locked" && (source?.mvu?.enabled || source?.ejs?.enabled))
      || values(sources, "ui").some((source) => source.status === "locked" && source?.status_ui?.enabled)
      || values(sources, "prompts").some((source) => source.status === "locked" && source?.opening_ui?.enabled);
    stageTarget(lockedRuntime ? "locked" : "draft", issues, warnings).push(issue('/runtime_manifest', 'runtime.required', '启用的运行功能需要真实源码和 runtime_manifest；草稿阶段可继续补齐'));
  }
  await validateAuthoredRuntime(assembly?.runtime_manifest, projectRoot, issues, warnings);
  await validateMvuRuntimeSources(project, sources, projectRoot, assembly, issues, warnings);

  const openingSources = values(sources, 'prompts');
  const openings = allOpenings(openingSources);
  if (openings.length > 0) {
    const defaults = openings.filter((opening) => opening.is_default);
    if (defaults.length !== 1) issues.push(issue('/openings', 'opening.default', 'Exactly one opening must be default'));
    const openingIds = new Set();
    for (const [index, opening] of openings.entries()) {
      if (openingIds.has(opening.id)) issues.push(issue(`/openings/${index}/id`, 'opening.duplicate', `Duplicate opening id: ${opening.id}`));
      openingIds.add(opening.id);
      const text = opening.visible_text ?? opening.text;
      if (typeof text !== 'string' || !text.trim()) issues.push(issue(`/openings/${index}/visible_text`, 'opening.content', 'Opening text is empty'));
    }
  }

  await validateUiSurfaceProducers(sources, projectRoot, assembly, openings, issues, warnings);
  await validateOpeningUiSources(sources, projectRoot, assembly, issues, warnings);

  validatePresentations(openingSources, assemblies, issues);
  validateMediaConsumers(sources, issues);
  await validateAssembly(sources, projectRoot, issues, warnings, runtimeAssemblyTarget(project), project);
  return { issues, warnings };
}
