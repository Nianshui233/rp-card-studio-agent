import fs from "node:fs";
import path from "node:path";
import { normalizeRegexDocument, parseRegex, validateRegexDocument } from "./validate-tavern-regex.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

export function applyEntry(entry, fixture) {
  if (entry.disabled) return fixture.input;
  if (Array.isArray(entry.placement) && fixture.placement !== undefined && !entry.placement.includes(fixture.placement)) return fixture.input;
  const min = entry.minDepth ?? entry.min_depth;
  const max = entry.maxDepth ?? entry.max_depth;
  if (Number.isInteger(min) && fixture.depth < min) return fixture.input;
  if (Number.isInteger(max) && fixture.depth > max) return fixture.input;

  const display = entry.markdownOnly ?? entry.destination?.display ?? false;
  const prompt = entry.promptOnly ?? entry.destination?.prompt ?? false;
  if (fixture.channel === "display" && !display) return fixture.input;
  if (fixture.channel === "prompt" && !prompt) return fixture.input;
  if (fixture.channel === "raw" && (display || prompt)) return fixture.input;

  return fixture.input.replace(parseRegex(entry.findRegex ?? entry.find_regex), entry.replaceString ?? entry.replace_string ?? "");
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
