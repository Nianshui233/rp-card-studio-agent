import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyAssemblyManifest, validateRuntimeSources } from "../scripts/rp-card-runtime.mjs";

function basePayload() {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: { name: "雾港夜班", description: "项目入口", extensions: {} },
  };
}

test("authored regex fixtures preserve display, prompt, complete-block, and streaming-block rules", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rp-regex-fixtures-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src", "runtime"), { recursive: true });
  const html = "<!doctype html><html lang=\"zh-CN\"><head><style>body{font-family:sans-serif}</style></head><body><main>雾港开局</main><script>window.__wugangReady=true;</script></body></html>";
  await writeFile(path.join(root, "src/runtime/opening.html"), html, "utf8");

  const regexScripts = [
    {
      id: "opening-display",
      script_name: "[界面]雾港开局页",
      find_regex: "/<雾港开局页\\s*\\/>/g",
      replace_file: "src/runtime/opening.html",
      wrap_as_html_codeblock: true,
      placement: [2], disabled: false, markdown_only: true, prompt_only: false,
      run_on_edit: true, substitute_regex: 0, min_depth: null, max_depth: null,
    },
    {
      id: "opening-prompt",
      script_name: "[提示词]雾港开局说明",
      find_regex: "/<雾港开局页\\s*\\/>/g",
      replace_string: "雾港夜班正在等待开局身份与切入地点。",
      placement: [1], disabled: false, markdown_only: false, prompt_only: true,
      run_on_edit: true, substitute_regex: 0, min_depth: null, max_depth: null,
    },
    {
      id: "variables-complete-hide",
      script_name: "[变量]隐藏完整更新块",
      find_regex: "/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g",
      replace_string: "",
      placement: [2], disabled: false, markdown_only: true, prompt_only: false,
      run_on_edit: true, substitute_regex: 0, min_depth: null, max_depth: null,
    },
    {
      id: "variables-stream-hide",
      script_name: "[变量]隐藏流式更新块",
      find_regex: "/<UpdateVariable>(?:(?!<\\/UpdateVariable>)[\\s\\S])*$/g",
      replace_string: "",
      placement: [2], disabled: false, markdown_only: true, prompt_only: false,
      run_on_edit: true, substitute_regex: 0, min_depth: null, max_depth: null,
    },
  ];
  const assembly = {
    worldbook_manifest: { entries: [] },
    media_manifest: { enabled: false, assets: [] },
    runtime_manifest: {
      mode: "authored",
      regex_scripts: regexScripts,
      tavern_helper_scripts: [],
      extension_fields: {},
    },
  };
  const sources = {
    assembly: [{ relativePath: "src/integration/assembly.yaml", group: "assembly", value: assembly }],
    prompts: [], world: [], characters: [], systems: [], scenes: [], ui: [], mvu: [],
  };

  const validation = await validateRuntimeSources({
    project: { features: { mvu: true, ejs: false, status_ui: true }, deliverables: ["character_card_json"] },
    sources,
    projectRoot: root,
  });
  assert.deepEqual(validation.issues, []);

  const result = await applyAssemblyManifest(basePayload(), { sources, projectRoot: root, target: "character" });
  assert.deepEqual(result.issues, []);
  const packed = result.payload.data.extensions.regex_scripts;
  assert.equal(packed.length, 4, "Forge added or removed authored regex scripts");
  assert.deepEqual(packed.map((entry) => entry.scriptName), regexScripts.map((entry) => entry.script_name));
  assert.match(packed[0].replaceString, /^```html\n<!doctype html>/);
  assert.equal(packed[1].promptOnly, true);
  assert.equal(packed[1].replaceString, "雾港夜班正在等待开局身份与切入地点。");
  assert.match(packed[2].findRegex, /UpdateVariable/);
  assert.match(packed[3].findRegex, /UpdateVariable/);
  for (const entry of packed) {
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.scriptName, "string");
    assert.ok(Array.isArray(entry.placement));
    assert.equal(typeof entry.disabled, "boolean");
    assert.equal(typeof entry.markdownOnly, "boolean");
    assert.equal(typeof entry.promptOnly, "boolean");
    assert.equal(typeof entry.runOnEdit, "boolean");
    assert.equal(typeof entry.substituteRegex, "number");
  }
});