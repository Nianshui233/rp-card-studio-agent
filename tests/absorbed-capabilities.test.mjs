import assert from "node:assert/strict";
import test from "node:test";

import { runFixtures } from "../scripts/regex/run-regex-fixtures.mjs";
import { tracePipeline } from "../scripts/regex/trace-render-pipeline.mjs";
import { validateRegistry } from "../scripts/components/validate-component-registry.mjs";

test("absorbed regex pipeline validates fixtures and exposes stage trace", () => {
  const regex = {
    scriptName: "状态栏",
    findRegex: "<Status />",
    replaceString: "<div>状态</div>",
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: true,
  };
  const fixtures = {
    fixtures: [
      { id: "display", input: "正文\n<Status />", placement: 2, depth: 0, channel: "display", expected: "正文\n<div>状态</div>" },
      { id: "prompt", input: "正文\n<Status />", placement: 2, depth: 0, channel: "prompt", expected: "正文\n<Status />" },
    ],
  };
  const report = runFixtures(regex, fixtures);
  assert.equal(report.ok, true);
  assert.equal(report.passed, 2);
  const trace = tracePipeline(regex, fixtures.fixtures[0]);
  assert.equal(trace.stages[0].changed, true);
  assert.equal(trace.output, fixtures.fixtures[0].expected);
});

test("component registry validates dependency and output ownership", () => {
  const valid = validateRegistry({
    components: [
      { id: "world", outputs: ["src/world.yaml"], depends_on: [] },
      { id: "ui", outputs: ["src/ui.html"], depends_on: ["world"] },
    ],
    recipes: [{ id: "card", components: ["world", "ui"] }],
  });
  assert.equal(valid.ok, true);
  const invalid = validateRegistry({
    components: [
      { id: "a", outputs: ["same"], depends_on: ["b"] },
      { id: "b", outputs: ["same"], depends_on: ["a"] },
    ],
    recipes: [{ id: "card", components: ["missing"] }],
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => /循环|冲突|不存在/.test(issue.message)));
});
