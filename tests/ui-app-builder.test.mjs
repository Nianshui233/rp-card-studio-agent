import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildUiApp, inspectUiApp } from "../scripts/ui-app-builder.mjs";
import { validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";

async function makeApp() {
  const root = await mkdtemp(path.join(tmpdir(), "rp-ui-app-"));
  const app = path.join(root, "src", "runtime", "apps", "status");
  const output = path.join(root, "src", "runtime", "ui", "状态界面.html");
  await mkdir(path.join(app, "fragments"), { recursive: true });
  await mkdir(path.join(app, "styles"), { recursive: true });
  await mkdir(path.join(app, "scripts"), { recursive: true });
  await mkdir(path.join(app, "mock"), { recursive: true });
  await writeFile(path.join(app, "ui-app.yaml"), `schema_version: 1.0.0
ui_app:
  id: test-status
  surface: status
  experience_level: light
  entry_html: index.html
  fragments:
    - slot: APP_SHELL
      file: fragments/shell.html
  styles: [styles/tokens.css, styles/app.css]
  scripts: [scripts/state.js, scripts/host-adapter.js, scripts/app.js]
  mock_state: mock/state.json
  preview_output: dist/status.preview.html
  script_wrapper: iife
  output: ../../ui/状态界面.html
`);
  await writeFile(path.join(app, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width"><!-- RP_UI_STYLES --></head><body><!-- RP_UI_FRAGMENT:APP_SHELL --><!-- RP_UI_SCRIPTS --></body></html>`);
  await writeFile(path.join(app, "fragments", "shell.html"), `<nav><button data-view="a">总览</button><button data-view="b">人物</button></nav><main><section id="view-a"><input placeholder="搜索详情"><button data-action="send">行动</button><div class="loading empty error success">反馈</div></section><section id="view-b">事件日志</section></main>`);
  await writeFile(path.join(app, "styles", "tokens.css"), `:root{--accent:#a33}`);
  await writeFile(path.join(app, "styles", "app.css"), `body{color:var(--accent)}@media(max-width:600px){body{font-size:14px}}`);
  await writeFile(path.join(app, "scripts", "state.js"), `const AppState={data:null};`);
  await writeFile(path.join(app, "scripts", "host-adapter.js"), `const mvu=window.Mvu||window.parent?.Mvu;AppState.data=mvu?.getMvuData?.({type:'message',message_id:0})?.stat_data||window.__RP_UI_MOCK__;`);
  await writeFile(path.join(app, "scripts", "app.js"), `document.addEventListener('click',()=>window.parent?.document);`);
  await writeFile(path.join(app, "mock", "state.json"), `{"玩家":{"姓名":["测试"]}}`);
  return { root, app, manifest: path.join(app, "ui-app.yaml"), output };
}

test("ui-build combines real HTML/CSS/JS sources into one self-contained document", async () => {
  const fixture = await makeApp();
  const result = await buildUiApp(fixture.manifest);
  const html = await readFile(fixture.output, "utf8");
  const preview = await readFile(path.join(fixture.app, "dist", "status.preview.html"), "utf8");
  assert.equal(result.output, fixture.output);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<style>[\s\S]*tokens\.css[\s\S]*app\.css[\s\S]*<\/style>/);
  assert.match(html, /<script>[\s\S]*state\.js[\s\S]*host-adapter\.js[\s\S]*app\.js[\s\S]*<\/script>/);
  assert.match(html, /fragment:APP_SHELL/);
  assert.doesNotMatch(html, /RP_UI_(?:STYLES|SCRIPTS|FRAGMENT)/);
  assert.doesNotMatch(html, /__RP_UI_MOCK__\s*=/);
  assert.match(preview, /window\.__RP_UI_MOCK__\s*=/);
  const inspected = await inspectUiApp(fixture.manifest, fixture.output);
  assert.equal(inspected.outputMatches, true);
  assert.equal(inspected.outputPathMatches, true);
  assert.ok(inspected.mockState.endsWith(path.join("mock", "state.json")));
});

test("ui-build preserves head + body message surfaces while wrapping only the preview", async () => {
  const fixture = await makeApp();
  const manifestText = await readFile(fixture.manifest, "utf8");
  await writeFile(fixture.manifest, manifestText.replace("  experience_level: light\n", "  experience_level: light\n  output_mode: message_surface\n"));
  await writeFile(path.join(fixture.app, "index.html"), `<head><meta name="viewport" content="width=device-width"><!-- RP_UI_STYLES --></head><body><!-- RP_UI_FRAGMENT:APP_SHELL --><!-- RP_UI_SCRIPTS --></body>`);
  const result = await buildUiApp(fixture.manifest);
  const html = await readFile(fixture.output, "utf8");
  const preview = await readFile(path.join(fixture.app, "dist", "status.preview.html"), "utf8");
  assert.equal(result.outputMode, "message_surface");
  assert.doesNotMatch(html, /<!doctype html>/i);
  assert.match(html, /^<head>/i);
  assert.match(preview, /<!doctype html>/i);
  assert.match(preview, /window\.__RP_UI_MOCK__/);
});

test("runtime validation reports stale modular UI artifacts", async () => {
  const fixture = await makeApp();
  await buildUiApp(fixture.manifest);
  const sources = {
    assembly: [{ value: { worldbook_manifest: { entries: [] }, media_manifest: { enabled: false, assets: [] }, runtime_manifest: { mode: "authored", regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} } } }],
    ui: [{ value: {
      status: "locked",
      status_ui: {
        enabled: true, authoring_mode: "multi_file_html", experience_level: "light", theme_direction: "测试", device_priority: "equal",
        data_sources: [], host_interactions: [], lifecycle_checks: [], runtime: "not_run", opening_relationship: "separate",
        experience_evidence: { baseline: {}, level_advancements: {}, primary_play_surface: false },
        surfaces: [{ id: "status", name: "状态", marker: "<状态/>", app_manifest: "src/runtime/apps/status/ui-app.yaml", file: "src/runtime/ui/状态界面.html", render_route: "inline_html", render_ref: null, render_evidence: [], emission: null }],
      }, source_refs: [],
    } }],
    prompts: [], mvu: [], world: [], characters: [], systems: [], scenes: [], positioning: [],
  };
  const current = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["character_card_json"] }, sources, projectRoot: fixture.root });
  assert.ok(!current.issues.some(candidate => candidate.rule === "ui.app_stale"));

  await writeFile(path.join(fixture.app, "styles", "app.css"), `body{color:#fff}@media(max-width:600px){body{font-size:13px}}`);
  const stale = await validateRuntimeSources({ project: { features: { status_ui: true }, deliverables: ["character_card_json"] }, sources, projectRoot: fixture.root });
  assert.ok(stale.issues.some(candidate => candidate.rule === "ui.app_stale"));
});

test("checked-in Forge bundle exposes ui-build as a real command", async () => {
  const fixture = await makeApp();
  const bundle = fileURLToPath(new URL("../scripts/rp-card-forge.bundle.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [bundle, "ui-build", fixture.manifest, "--dry-run", "--json"], {
    cwd: fixture.root,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.equal(result.status, 0, output);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.command, "ui-build");
  assert.equal(report.data.dryRun, true);
});
