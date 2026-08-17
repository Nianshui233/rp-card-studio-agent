import fs from "node:fs";
import path from "node:path";
import { normalizeRegexDocument } from "./validate-tavern-regex.mjs";
import { applyEntry } from "./run-regex-fixtures.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

export function tracePipeline(regexDocument, fixture) {
  let current = fixture.input;
  const stages = [];
  for (const entry of normalizeRegexDocument(regexDocument)) {
    const next = applyEntry(entry, { ...fixture, input: current });
    stages.push({
      name: entry.scriptName ?? entry.script_name,
      enabled: entry.disabled !== true,
      placement: entry.placement,
      depth: fixture.depth,
      channel: fixture.channel,
      changed: next !== current,
      before: current,
      after: next,
    });
    current = next;
  }
  return { fixture: fixture.id ?? null, input: fixture.input, output: current, stages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const regexFile = option("--regex");
  const fixturesFile = option("--fixtures");
  if (!regexFile || !fixturesFile) throw new Error("用法: node trace-render-pipeline.mjs --regex regex.json --fixtures fixtures.json");
  const regexDocument = JSON.parse(fs.readFileSync(regexFile, "utf8"));
  const fixtureDocument = JSON.parse(fs.readFileSync(fixturesFile, "utf8"));
  const fixtures = Array.isArray(fixtureDocument) ? fixtureDocument : fixtureDocument.fixtures;
  process.stdout.write(`${JSON.stringify(fixtures.map((fixture) => tracePipeline(regexDocument, fixture)), null, 2)}\n`);
}
