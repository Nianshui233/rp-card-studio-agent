import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";

import { inspectUiApp } from "../scripts/ui-app-builder.mjs";

const root = join(process.cwd(), "assets", "examples", "self-contained-rp");
const sampleRoots = [
  "self-contained-rp",
  "mvu-native-rp",
  "mvu-zod-rp",
  "opening-ui-rp",
  "multi-surface-rp",
  "zero-layer-rp",
].map((name) => join(process.cwd(), "assets", "examples", name));

test("bundled technical sample is self-contained and internally coherent", async () => {
  const assemblyText = await readFile(join(root, "assembly.yaml"), "utf8");
  const assembly = YAML.parse(assemblyText);
  assert.equal(assembly.worldbook_manifest.display_name, "潮痕档案馆世界书");
  assert.equal(assembly.runtime_manifest.mode, "authored");
  assert.equal(assembly.worldbook_manifest.entries.length, 3);

  const html = await readFile(join(root, "src", "runtime", "ui", "潮痕状态栏.html"), "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<style>[\s\S]*<\/style>/i);
  assert.match(html, /<body>[\s\S]*<script>[\s\S]*<\/script>[\s\S]*<\/body>/i);
  assert.doesNotMatch(html, /https?:\/\//i);

  const world = YAML.parse(await readFile(join(root, "src", "world", "世界书.yaml"), "utf8"));
  assert.equal(world.entries[2].display_name, "状态栏输出契约");
  assert.match(world.entries[2].content, /<潮痕状态栏\/>/);

  for (const file of ["状态栏.json", "变量隐藏-完整.json", "变量隐藏-流式.json"]) {
    const regex = JSON.parse(await readFile(join(root, "src", "runtime", "regex", file), "utf8"));
    assert.ok(regex.scriptName);
    assert.ok(regex.findRegex);
    assert.ok(Array.isArray(regex.placement));
  }

  const helper = await readFile(join(root, "src", "runtime", "scripts", "宿主动作.js"), "utf8");
  assert.match(helper, /sendArchiveAction/);
  assert.doesNotMatch(helper, /https?:\/\//i);
});

test("user-facing agent docs do not direct to the former external sample names", async () => {
  const files = [
    "AGENT.md",
    "README.md",
    join("internal-skills", "st-frontend-authoring", "references", "status-ui.md"),
    join("internal-skills", "st-runtime-authoring", "references", "mvu-ejs.md"),
    join("internal-skills", "st-integration-qa", "references", "validation.md"),
    join("internal-skills", "rp-project-foundation", "references", "materials.md"),
    join("internal-skills", "st-runtime-authoring", "references", "host", "mvu-runtime.md"),
    join("internal-skills", "st-runtime-authoring", "references", "host", "tavern-helper-runtime.md"),
    join("internal-skills", "st-runtime-authoring", "references", "host", "ejs-runtime.md"),
  ];
  for (const file of files) {
    const text = await readFile(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(text, /我，非我|尸变纪元|呕吐内心的少女|二十一人会/);
    assert.doesNotMatch(text, /https?:\/\//i);
  }
});

test("the sample matrix stays self-contained and free of external URLs", async () => {
  assert.equal(sampleRoots.length, 6);
  for (const sampleRoot of sampleRoots) {
    const files = await readdir(sampleRoot, { recursive: true, withFileTypes: true });
    assert.ok(files.some((entry) => entry.isFile() && entry.name === "README.md"), sampleRoot);
    assert.ok(
      files.some((entry) => entry.isFile() && entry.name === "创角变量桥.yaml"),
      `${sampleRoot} should declare a creation variable bridge`,
    );
    for (const entry of files) {
      if (!entry.isFile()) continue;
      const file = entry.parentPath ? join(entry.parentPath, entry.name) : join(sampleRoot, entry.name);
      const text = await readFile(file, "utf8");
      assert.doesNotMatch(text, /https?:\/\//i, file);
      assert.doesNotMatch(text, /我，非我|尸变纪元|呕吐内心的少女|二十一人会/, file);
      if (file.endsWith(".html") && !file.includes(`${join("fragments", "")}`)) assert.match(text, /<!doctype html>/i, file);
      if (file.endsWith(".html") && file.includes(`${join("fragments", "")}`)) assert.match(text, /<(?:main|section|article|div)\b/i, file);
    }
  }
});

test("opening/status separation sample is a reproducible modular double application", async () => {
  const sample = join(process.cwd(), "assets", "examples", "opening-ui-rp");
  const openingManifest = join(sample, "src", "runtime", "apps", "opening", "ui-app.yaml");
  const statusManifest = join(sample, "src", "runtime", "apps", "status", "ui-app.yaml");
  const openingOutput = join(sample, "src", "runtime", "ui", "开场页.html");
  const statusOutput = join(sample, "src", "runtime", "ui", "状态页.html");
  const opening = await inspectUiApp(openingManifest, openingOutput);
  const status = await inspectUiApp(statusManifest, statusOutput);
  assert.equal(opening.outputMatches, true);
  assert.equal(status.outputMatches, true);
  assert.ok(opening.mockState);
  assert.ok(status.mockState);

  const openingHtml = await readFile(openingOutput, "utf8");
  const statusHtml = await readFile(statusOutput, "utf8");
  assert.doesNotMatch(openingHtml, /window\.__RP_UI_MOCK__\s*=/);
  assert.doesNotMatch(statusHtml, /window\.__RP_UI_MOCK__\s*=/);
  const openingPreview = await readFile(join(sample, "src", "runtime", "apps", "opening", "dist", "开场页.preview.html"), "utf8");
  const statusPreview = await readFile(join(sample, "src", "runtime", "apps", "status", "dist", "状态页.preview.html"), "utf8");
  assert.match(openingPreview, /window\.__RP_UI_MOCK__\s*=/);
  assert.match(statusPreview, /window\.__RP_UI_MOCK__\s*=/);

  const openingPlan = YAML.parse(await readFile(join(sample, "src", "opening.yaml"), "utf8"));
  const statusPlan = YAML.parse(await readFile(join(sample, "src", "ui", "status-ui.yaml"), "utf8"));
  assert.equal(openingPlan.opening_ui.authoring_mode, "multi_file_html");
  assert.equal(statusPlan.status_ui.authoring_mode, "multi_file_html");
  assert.equal(statusPlan.status_ui.surfaces[0].app_manifest, "src/runtime/apps/status/ui-app.yaml");

  const assembly = YAML.parse(await readFile(join(sample, "assembly.yaml"), "utf8"));
  assert.ok(assembly.runtime_manifest.regex_scripts.some(item => item.replace_file === "src/runtime/ui/开场页.html"));
  assert.ok(assembly.runtime_manifest.regex_scripts.some(item => item.replace_file === "src/runtime/ui/状态页.html"));
  assert.ok(assembly.worldbook_manifest.entries.some(item => item.id === "wb_rain_status_contract"));
});
