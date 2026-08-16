import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { initializeProject, loadProject, loadProjectSource, makeProject } from "../scripts/forge/project.mjs";
import { applyAssemblyManifest } from "../scripts/rp-card-runtime.mjs";

test("new character-card projects reserve a disabled <user> source", async () => {
  const project = makeProject({ name: "潮痕用户模板测试", nsfw: false, reserveUserCharacter: true });
  assert.deepEqual(project.source_manifest.user_character, ["src/user-character.yaml"]);

  const root = await mkdtemp(join(tmpdir(), "rp-user-template-"));
  await initializeProject(root, { nsfw: false });
  const loaded = await loadProject(root);
  const source = await loadProjectSource(loaded);
  const entry = source.payload.data.character_book.entries.find((candidate) => (
    candidate.keys?.includes("<user>")
    || candidate.extensions?.rp_card_studio?.source_id === "user_character_template"
  ));
  assert.ok(entry, "CharacterBook should contain the reserved user template");
  assert.equal(entry.enabled, false);
  assert.equal(entry.constant, true);
  assert.equal(entry.position, "after_char");
  assert.match(entry.content, /用户主控设定/);
  assert.match(entry.content, /profile/);
  assert.match(await readFile(join(root, "src", "user-character.yaml"), "utf8"), /<user>/);
});

test("an explicit assembly manifest still receives the reserved disabled <user> entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "rp-user-template-assembly-"));
  await initializeProject(root, { nsfw: false });
  const project = await loadProject(root);
  const userPath = "src/user-character.yaml";
  const userValue = YAML.parse(await readFile(join(root, userPath), "utf8"));
  const sources = {
    positioning: [], world: [], characters: [], user_character: [{ relativePath: userPath, value: userValue }],
    systems: [], scenes: [], prompts: [], ui: [], mvu: [], assembly: [{ value: {
      worldbook_manifest: { display_name: "模板测试书", duplicate_policy: "error", entries: [] },
      runtime_manifest: { mode: "authored", regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} },
      media_manifest: { enabled: false, assets: [] }
    } }]
  };
  const result = await applyAssemblyManifest({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "模板测试", extensions: {}, character_book: { name: "模板测试", entries: [] } } }, { sources, projectRoot: project.projectRoot ?? root, target: "character" });
  assert.deepEqual(result.issues, []);
  const entry = result.payload.data.character_book.entries.find((candidate) => candidate.extensions?.rp_card_studio?.implicit_user_character_template);
  assert.ok(entry);
  assert.equal(entry.enabled, false);
  assert.deepEqual(entry.keys, ["<user>", "user"]);
  assert.equal(entry.constant, true);
});
