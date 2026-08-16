import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyAssemblyManifest,
  characterBookIdCandidate,
  selectOpeningMessages,
  validateRuntimeSources,
} from "../scripts/rp-card-runtime.mjs";

function payload() {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: { name: "雾港夜班", description: "入口", first_mes: "<雾港开局页/>", alternate_greetings: [], extensions: {} },
  };
}

test("authored runtime packs complete HTML, helper JS, and EJS without generic generation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-authored-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src", "runtime"), { recursive: true });
  const html = "<!doctype html><html lang=\"zh-CN\"><head><style>body{color:#eee}</style></head><body><button id=\"use\">使用</button><script type=\"module\">document.querySelector('#use').onclick=()=>parent.document.querySelector('#send_textarea').value='我使用了物品';</script></body></html>";
  const js = "await waitGlobalInitialized('Mvu');\nconsole.info('雾港变量结构已加载');";
  const ejs = "<% const state = getvar('stat_data', { defaults: {} }); %><%= JSON.stringify(state) %>";
  await writeFile(path.join(root, "src/runtime/status.html"), html, "utf8");
  await writeFile(path.join(root, "src/runtime/schema.js"), js, "utf8");
  await writeFile(path.join(root, "src/runtime/context.ejs"), ejs, "utf8");

  const assembly = {
    worldbook_manifest: {
      display_name: "雾港夜班世界书",
      preserve_imported_entries: true,
      duplicate_policy: "error",
      entries: [{
        id: "mvu_context",
        display_name: "[mvu_plot]当前状态上下文",
        enabled: true,
        activation: { mode: "constant", primary_keys: [], secondary_keys: [], selective: false, logic: "any", case_sensitive: false, match_whole_words: false },
        insertion: { position: "at_depth", order: 50, depth: 1, role: "system" },
        probability: 100,
        scan_depth: null,
        recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until_recursion: false },
        source: { kind: "file", path: "src/runtime/context.ejs" },
      }],
    },
    media_manifest: { enabled: false, assets: [] },
    runtime_manifest: {
      mode: "authored",
      regex_scripts: [{
        id: "wugang-status",
        script_name: "[界面]雾港状态栏",
        find_regex: "/<雾港状态栏\\s*\\/>/g",
        replace_file: "src/runtime/status.html",
        wrap_as_html_codeblock: true,
        placement: [2], disabled: false, markdown_only: true, prompt_only: false,
        run_on_edit: true, substitute_regex: 0, min_depth: null, max_depth: null,
      }],
      tavern_helper_scripts: [{ id: "wugang-schema", name: "雾港：变量结构", enabled: true, content_file: "src/runtime/schema.js" }],
      extension_fields: {},
    },
  };
  const sources = { assembly: [{ relativePath: "src/integration/assembly.yaml", group: "assembly", value: assembly }], prompts: [], mvu: [], ui: [], systems: [], scenes: [], world: [], characters: [] };
  const result = await applyAssemblyManifest(payload(), { sources, projectRoot: root, target: "character" });
  assert.deepEqual(result.issues, []);
  const regex = result.payload.data.extensions.regex_scripts[0];
  assert.equal(regex.scriptName, "[界面]雾港状态栏");
  assert.match(regex.replaceString, /^```html\n<!doctype html>/);
  assert.match(regex.replaceString, /send_textarea/);
  assert.doesNotMatch(regex.replaceString, /rp_card_studio_status_ui|synthetic_runtime_layer/);
  assert.equal(result.payload.data.extensions.tavern_helper.scripts[0].content, js);
  assert.equal(result.payload.data.character_book.entries[0].content, ejs);

  const validation = await validateRuntimeSources({ project: { features: { mvu: true, ejs: true, status_ui: true } }, sources, projectRoot: root });
  assert.deepEqual(validation.issues, []);
});

test("authored regex validation catches invalid patterns", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-regex-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sources = { assembly: [{ value: { runtime_manifest: { mode: "authored", regex_scripts: [{ id: "x", find_regex: "not-a-regex", replace_string: "x", placement: [2] }], tavern_helper_scripts: [], extension_fields: {} }, worldbook_manifest: { entries: [] } } }], prompts: [] };
  const report = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: root });
  assert.ok(report.issues.some((entry) => entry.rule === "regex.syntax"));
});

test("opening projection remains direct and character-book ids stay stable", () => {
  const selected = selectOpeningMessages([{ openings: [
    { id: "default", is_default: true, visible_text: "默认开场" },
    { id: "other", is_default: false, visible_text: "备选开场" },
  ] }]);
  assert.equal(selected.first, "默认开场");
  assert.deepEqual(selected.alternates, ["备选开场"]);
  assert.equal(characterBookIdCandidate("assembly:world"), characterBookIdCandidate("assembly:world"));
});
