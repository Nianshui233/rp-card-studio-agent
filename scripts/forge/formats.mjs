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
function countWorldbookEntries(book) {
  if (!isPlainObject(book)) return 0;
  if (Array.isArray(book.entries)) return book.entries.length;
  if (isPlainObject(book.entries)) return Object.keys(book.entries).length;
  return 0;
}
export function validatePayload(value, format = detectJsonFormat(value)) {
  const issues = [];
  const warnings = [];
  if (isCharacterFormat(format)) {
    issues.push(...validateNamedSchema("character-card", value));
    return { format, issues, warnings };
  }
  if (format === Format.WORLDBOOK) {
    validateWorldbook(value, "", issues);
    return { format, issues, warnings };
  }
  issues.push(issue("/", "unsupported", "无法识别为 Character Card V2/V3 或世界书 entries JSON"));
  return { format: null, issues, warnings };
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
