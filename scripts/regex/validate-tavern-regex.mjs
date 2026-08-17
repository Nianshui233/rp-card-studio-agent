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

export function validateRegexEntry(entry, index = 0) {
  const issues = [];
  const name = entry.scriptName ?? entry.script_name ?? `regex-${index}`;
  const find = entry.findRegex ?? entry.find_regex;
  try { parseRegex(find); } catch (error) { issues.push({ path: `${index}.findRegex`, message: error.message }); }
  const placement = entry.placement;
  if (!Array.isArray(placement) || placement.length === 0 || placement.some((item) => !Number.isInteger(item))) issues.push({ path: `${index}.placement`, message: "placement 必须是非空整数数组" });
  for (const field of ["disabled", "markdownOnly", "promptOnly", "runOnEdit"]) {
    const snake = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    const value = entry[field] ?? entry[snake];
    if (typeof value !== "boolean") issues.push({ path: `${index}.${field}`, message: `${field} 必须是布尔值` });
  }
  return { name, issues };
}

export function validateRegexDocument(value) {
  const entries = normalizeRegexDocument(value);
  const results = entries.map(validateRegexEntry);
  return { ok: results.every((item) => item.issues.length === 0), count: entries.length, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const file = process.argv[2];
  if (!file) throw new Error("用法: node validate-tavern-regex.mjs <regex.json>");
  const report = validateRegexDocument(JSON.parse(fs.readFileSync(file, "utf8")));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 4;
}
