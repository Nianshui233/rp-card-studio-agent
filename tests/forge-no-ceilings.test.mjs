import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function collectCeilings(value, pointer = "", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCeilings(item, `${pointer}/${index}`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    const next = `${pointer}/${key}`;
    if (["maxItems", "maxLength", "maxProperties", "maximum"].includes(key)) output.push({ path: next, value: item });
    collectCeilings(item, next, output);
  }
  return output;
}

test("Forge schemas contain no arbitrary creative scale ceilings", async () => {
  const schemaRoot = path.join(root, "assets", "schemas");
  const files = (await readdir(schemaRoot)).filter((file) => file.endsWith(".json"));
  const found = [];
  for (const file of files) {
    const schema = JSON.parse(await readFile(path.join(schemaRoot, file), "utf8"));
    for (const record of collectCeilings(schema)) found.push({ file, ...record });
  }

  const allowed = [
    { file: "assembly.schema.json", path: "/$defs/worldbookEntry/properties/probability/maximum", value: 100 },
    { file: "assembly.schema.json", path: "/$defs/worldbookEntry/properties/scan_depth/maximum", value: 1000 },
    { file: "assembly.schema.json", path: "/$defs/worldbookEntry/properties/recursion/properties/delay_until_recursion/oneOf/1/maximum", value: 10000 },
    { file: "project.schema.json", path: "/properties/deliverables/maxItems", value: 1 },
    { file: "project.schema.json", path: "/properties/source_manifest/properties/assembly/maxItems", value: 1 },
    { file: "project.schema.json", path: "/$defs/singlePathList/maxItems", value: 1 },
    { file: "user-character.schema.json", path: "/properties/worldbook/properties/probability/maximum", value: 100 },
    { file: "world.schema.json", path: "/properties/factions_and_society/properties/faction_relations/properties/bilateral/items/properties/parties/maxItems", value: 2 },
  ];

  assert.deepEqual(found, allowed, "新增上限必须证明它是宿主协议/唯一所有权/结构定义，而不是创作规模配额");
});

test("Forge policy explicitly sets floors without content-size ceilings", async () => {
  const agent = await readFile(path.join(root, "AGENT.md"), "utf8");
  const runtime = await readFile(path.join(root, "scripts", "rp-card-runtime.mjs"), "utf8");
  const project = await readFile(path.join(root, "scripts", "forge", "project.mjs"), "utf8");
  assert.match(agent, /设下限，不设创作上限/);
  assert.doesNotMatch(`${runtime}\n${project}`, /\b(?:MAX|LIMIT)_(?:HTML|CARD|WORLD|ENTRY|CHARACTER|SCENE|SCRIPT|REGEX|COMPONENT|VARIABLE)(?:_|\b)/);
});

test("adaptive user contracts keep only a semantic floor and no project-field ceiling", async () => {
  const schema = JSON.parse(await readFile(path.join(root, "assets", "schemas", "user-character.schema.json"), "utf8"));
  assert.equal(schema.properties.profile.additionalProperties, true);
  assert.equal(schema.properties.profile.maxProperties, undefined);
  assert.equal(schema.properties.contract.properties.creation_fields.maxItems, undefined);
  assert.equal(schema.properties.contract.properties.runtime_state.properties.dynamic_paths.maxItems, undefined);
  assert.match(schema.$defs.contractPath.pattern, /profile\|runtime/);

  const runtime = await readFile(path.join(root, "scripts", "rp-card-runtime.mjs"), "utf8");
  assert.match(runtime, /至少需要一个静态身份锚点/);
  assert.doesNotMatch(runtime, /用户合同必须(?:包含|使用).*(?:姓名|年龄|性别|职业)/);
});
