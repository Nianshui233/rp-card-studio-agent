import fs from "node:fs";
import path from "node:path";
import { normalizeRegexDocument, parseRegex, validateRegexDocument } from "./validate-tavern-regex.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

export function applyEntry(entry, fixture) {
  if (entry.disabled) return fixture.input;

  const placement = entry.placement;
  if (Array.isArray(placement) && fixture.placement !== undefined && !placement.includes(fixture.placement)) return fixture.input;
  const min = entry.minDepth ?? entry.min_depth;
  const max = entry.maxDepth ?? entry.max_depth;
  const depth = fixture.depth;
  if (Number.isInteger(depth)) {
    if (Number.isInteger(min) && min >= -1 && depth < min) return fixture.input;
    if (Number.isInteger(max) && max >= 0 && depth > max) return fixture.input;
  }
  if ((fixture.isEdit ?? fixture.is_edit) && !(entry.runOnEdit ?? entry.run_on_edit)) return fixture.input;

  const markdownOnly = entry.markdownOnly ?? entry.markdown_only ?? false;
  const promptOnly = entry.promptOnly ?? entry.prompt_only ?? false;
  const isMarkdown = fixture.channel === "display";
  const isPrompt = fixture.channel === "prompt";
  const appliesToChannel = (markdownOnly && isMarkdown)
    || (promptOnly && isPrompt)
    || (!markdownOnly && !promptOnly && !isMarkdown && !isPrompt);
  if (!appliesToChannel) return fixture.input;

  const substituteRegex = Number(entry.substituteRegex ?? entry.substitute_regex ?? 0);
  if (substituteRegex !== 0) {
    throw new Error("离线 Regex fixture 不执行 SillyTavern host macro substitution；该规则必须在真实宿主验证");
  }

  const findRegex = entry.findRegex ?? entry.find_regex;
  const replaceString = entry.replaceString ?? entry.replace_string ?? "";
  const macroPattern = /\{\{(?!match\}\})[^{}]*\}\}/i;
  if (macroPattern.test(replaceString)) {
    throw new Error("离线 Regex fixture 不执行 SillyTavern host replacement macros；该规则必须在真实宿主验证");
  }
  const trimStrings = entry.trimStrings ?? entry.trim_strings ?? [];
  if (trimStrings.some(value => typeof value !== "string" || macroPattern.test(value))) {
    throw new Error("离线 Regex fixture 只支持静态 trimStrings；含宿主 macro 的规则必须在真实宿主验证");
  }

  const regex = parseRegex(findRegex);
  return fixture.input.replace(regex, (...args) => {
    const maybeGroups = args.at(-1);
    const hasNamedGroups = maybeGroups && typeof maybeGroups === "object";
    const groups = hasNamedGroups ? maybeGroups : undefined;
    const fullMatch = args[0];
    const offsetIndex = args.length - (hasNamedGroups ? 3 : 2);
    const captures = args.slice(1, offsetIndex);
    const replacement = replaceString.replace(/\{\{match\}\}/gi, "$0");
    return replacement.replace(/\$(\d+)|\$<([^>]+)>/g, (token, number, groupName) => {
      let value;
      if (number !== undefined) {
        const index = Number(number);
        value = index === 0 ? fullMatch : captures[index - 1];
      } else if (groupName !== undefined) {
        value = groups && typeof groups === "object" ? groups[groupName] : undefined;
      }
      if (value === undefined || value === null || value === "") return "";
      let filtered = String(value);
      for (const trimString of trimStrings) filtered = filtered.replaceAll(trimString, "");
      return filtered;
    });
  });
}

export function runFixtures(regexDocument, fixtureDocument) {
  const validation = validateRegexDocument(regexDocument);
  if (!validation.ok) throw new Error(`正则校验失败: ${JSON.stringify(validation.results)}`);
  const entries = normalizeRegexDocument(regexDocument);
  const fixtures = Array.isArray(fixtureDocument) ? fixtureDocument : fixtureDocument.fixtures;
  const results = fixtures.map((fixture, index) => {
    let output = fixture.input;
    for (const entry of entries) output = applyEntry(entry, { ...fixture, input: output });
    const passed = fixture.expected_contains !== undefined
      ? output.includes(fixture.expected_contains)
      : output === fixture.expected;
    return {
      id: fixture.id ?? `fixture-${index}`,
      passed,
      expected: fixture.expected ?? { contains: fixture.expected_contains },
      actual: output,
    };
  });
  return { ok: results.every(item => item.passed), passed: results.filter(item => item.passed).length, total: results.length, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const regexFile = option("--regex");
  const fixturesFile = option("--fixtures");
  if (!regexFile || !fixturesFile) throw new Error("用法: node run-regex-fixtures.mjs --regex regex.json --fixtures fixtures.json");
  const readJson = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const report = runFixtures(readJson(regexFile), readJson(fixturesFile));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 4;
}
