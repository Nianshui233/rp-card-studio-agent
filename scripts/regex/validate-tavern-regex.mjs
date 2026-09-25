import fs from "node:fs";
import path from "node:path";

export function parseRegex(value) {
  if (typeof value !== "string" || !value) throw new Error("findRegex 必须是非空字符串");
  if (!value.startsWith("/")) return new RegExp(value, "g");
  const end = value.lastIndexOf("/");
  if (end <= 0) throw new Error(`无效正则字面量: ${value}`);
  return new RegExp(value.slice(1, end), value.slice(end + 1));
}

export function normalizeRegexDocument(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.regex_scripts)) return value.regex_scripts;
  if (Array.isArray(value?.data?.extensions?.regex_scripts)) return value.data.extensions.regex_scripts;
  if (value && typeof value === "object" && (value.findRegex || value.find_regex)) return [value];
  throw new Error("输入不包含 Tavern Regex");
}

function valueOf(entry, camel) {
  const snake = camel.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
  if (Object.prototype.hasOwnProperty.call(entry, camel)) return entry[camel];
  return entry[snake];
}

function pushType(issues, index, entry, field, type) {
  const value = valueOf(entry, field);
  if (typeof value !== type) issues.push({ path: `${index}.${field}`, message: `${field} 必须是${type}` });
}

export const HOST_PLACEMENT_VALUES = Object.freeze([0, 1, 2, 3, 5, 6]);
const HOST_PLACEMENTS = new Set(HOST_PLACEMENT_VALUES);

export function validateRegexEntry(entry, index = 0) {
  const issues = [];
  const warnings = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {
      name: `regex-${index}`,
      issues: [{ path: `${index}`, message: "Regex entry 必须是对象" }],
      warnings,
    };
  }
  const name = valueOf(entry, "scriptName") ?? `regex-${index}`;
  pushType(issues, index, entry, "id", "string");
  pushType(issues, index, entry, "scriptName", "string");
  pushType(issues, index, entry, "findRegex", "string");
  pushType(issues, index, entry, "replaceString", "string");

  try { parseRegex(valueOf(entry, "findRegex")); }
  catch (error) { issues.push({ path: `${index}.findRegex`, message: error.message }); }

  const placement = entry.placement;
  if (!Array.isArray(placement) || placement.length === 0 || placement.some(item => !Number.isInteger(item))) {
    issues.push({ path: `${index}.placement`, message: "placement 必须是非空整数数组" });
  } else {
    const unsupported = placement.filter(item => !HOST_PLACEMENTS.has(item));
    if (unsupported.length > 0) {
      issues.push({ path: `${index}.placement`, message: `SillyTavern 不支持这些 placement: ${unsupported.join(", ")}` });
    }
    if (placement.includes(0)) {
      warnings.push({ path: `${index}.placement`, message: "placement 0 (MD_DISPLAY) 已弃用；新规则应使用具体调用阶段" });
    }
  }
  const trimStrings = valueOf(entry, "trimStrings");
  if (!Array.isArray(trimStrings) || trimStrings.some(item => typeof item !== "string")) {
    issues.push({ path: `${index}.trimStrings`, message: "trimStrings 必须是字符串数组" });
  }
  for (const field of ["disabled", "markdownOnly", "promptOnly", "runOnEdit"]) pushType(issues, index, entry, field, "boolean");

  const substituteRegex = valueOf(entry, "substituteRegex");
  if (!Number.isInteger(substituteRegex) || ![0, 1, 2].includes(substituteRegex)) {
    issues.push({ path: `${index}.substituteRegex`, message: "substituteRegex 必须是 0、1 或 2" });
  }
  for (const field of ["minDepth", "maxDepth"]) {
    const value = valueOf(entry, field);
    if (value !== null && !Number.isInteger(value)) {
      issues.push({ path: `${index}.${field}`, message: `${field} 必须是整数或 null` });
    } else if (Number.isInteger(value) && value < -1) {
      issues.push({ path: `${index}.${field}`, message: `${field} 低于宿主支持的 -1 哨兵值，会被 SillyTavern 忽略` });
    }
  }

  const replacement = valueOf(entry, "replaceString");
  const dynamicHtml = typeof replacement === "string" && /<!doctype\s+html|<html\b|<script\b/i.test(replacement);
  if (dynamicHtml && !/^```html\s*\r?\n[\s\S]*\r?\n```\s*$/i.test(replacement)) {
    issues.push({ path: `${index}.replaceString`, message: "动态 HTML 必须是 Tavern Helper 可识别的 fenced html 代码块" });
  }

  return { name, issues, warnings };
}

export function validateRegexDocument(value) {
  const entries = normalizeRegexDocument(value);
  const results = entries.map(validateRegexEntry);
  return { ok: results.every(item => item.issues.length === 0), count: entries.length, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const file = process.argv[2];
  if (!file) throw new Error("用法: node validate-tavern-regex.mjs <regex.json>");
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const report = validateRegexDocument(JSON.parse(text));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 4;
}
