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
  "retrofit-rp",
  "sparse-heavy-ui-rp",
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
    const nonBaselineUrls = text
      .replaceAll('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js', '')
      .replaceAll('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@beta/artifact/bundle.js', '')
      .replaceAll('https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js', '');
    assert.doesNotMatch(nonBaselineUrls, /https?:\/\//i);
  }
});

test("the sample matrix stays self-contained and free of external URLs", async () => {
  assert.equal(sampleRoots.length, 8);
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
      const nonBaselineUrls = text
        .replaceAll('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js', '')
        .replaceAll('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@beta/artifact/bundle.js', '')
        .replaceAll('https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js', '');
      assert.doesNotMatch(nonBaselineUrls, /https?:\/\//i, file);
      assert.doesNotMatch(text, /我，非我|尸变纪元|呕吐内心的少女|二十一人会/, file);
      if (file.endsWith(".html") && !file.includes(`${join("fragments", "")}`)) assert.match(text, /<!doctype html>/i, file);
      if (file.endsWith(".html") && file.includes(`${join("fragments", "")}`)) assert.match(text, /<(?:main|section|article|div)\b/i, file);
    }
  }
});

test("the sample coverage matrix names every bundled sample exactly once", async () => {
  const matrix = YAML.parse(await readFile(join(process.cwd(), "assets", "examples", "matrix.yaml"), "utf8"));
  const ids = matrix.samples.map((sample) => sample.id);
  assert.deepEqual([...ids].sort(), [
    "multi-surface-rp",
    "mvu-native-rp",
    "mvu-zod-rp",
    "opening-ui-rp",
    "retrofit-rp",
    "self-contained-rp",
    "sparse-heavy-ui-rp",
    "zero-layer-rp",
  ]);
  assert.equal(new Set(ids).size, ids.length);
  for (const sample of matrix.samples) {
    assert.ok(sample.route, `${sample.id} should declare a route`);
    assert.ok(sample.rp_shape, `${sample.id} should declare an RP shape`);
    assert.ok(Array.isArray(sample.runtime), `${sample.id} should declare runtime coverage`);
    assert.ok(Array.isArray(sample.delivery), `${sample.id} should declare delivery coverage`);
    assert.ok(Array.isArray(sample.fallback), `${sample.id} should declare fallback coverage`);
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

test("retrofit sample preserves the old input and replaces the user profile with a real blank template", async () => {
  const sample = join(process.cwd(), "assets", "examples", "retrofit-rp");
  const assembly = YAML.parse(await readFile(join(sample, "assembly.yaml"), "utf8"));
  assert.equal(assembly.operation, "edit");
  assert.equal(assembly.original.input, "src/original/original.json");
  assert.equal(assembly.original.preserved, "src/original/preserved.json");
  const original = JSON.parse(await readFile(join(sample, "src", "original", "original.json"), "utf8"));
  const preserved = JSON.parse(await readFile(join(sample, "src", "original", "preserved.json"), "utf8"));
  assert.equal(original.data.extensions.unknown_runtime.kept, true);
  assert.equal(preserved.unknown_fields[0].decision, "preserve");
  const user = YAML.parse(await readFile(join(sample, "src", "user-character.yaml"), "utf8"));
  assert.equal(user.enabled, false);
  assert.deepEqual(user.activation.keywords, ["<user>"]);
  assert.match(user.content, /<user>[\s\S]*<\/user>/);
  const html = await readFile(join(sample, "src", "runtime", "ui", "改造状态页.html"), "utf8");
  assert.match(html, /<body[\s>][\s\S]*<script[\s>][\s\S]*<\/body>/i);
});

test("sparse-data sample keeps heavy experience independent from variable count", async () => {
  const sample = join(process.cwd(), "assets", "examples", "sparse-heavy-ui-rp");
  const ui = YAML.parse(await readFile(join(sample, "src", "status-ui.yaml"), "utf8"));
  assert.equal(ui.status_ui.experience_level, "heavy");
  assert.equal(ui.status_ui.data_density, "sparse");
  assert.ok(ui.status_ui.presentation_model.static_modules.length > 0);
  assert.ok(ui.status_ui.presentation_model.local_interaction_state.length > 0);
  const html = await readFile(join(sample, "src", "runtime", "ui", "星港观测台.html"), "utf8");
  assert.match(html, /<nav[\s>]/i);
  assert.match(html, /<style[\s>][\s\S]*<script[\s>]/i);
  assert.match(html, /尚未建立|暂无记录/);
  assert.doesNotMatch(html, /https?:\/\//i);
});
