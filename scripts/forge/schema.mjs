import Ajv2020 from 'ajv/dist/2020.js';

import { existsSync, readFileSync } from "node:fs";
var SCHEMA_NAMES = Object.freeze([
  "project",
  "state",
  "character-card",
  "positioning",
  "world",
  "character",
  "system",
  "scene",
  "mvu",
  "opening",
  "status-ui",
  "assembly"
]);
var ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
var validators = /* @__PURE__ */ new Map();
for (const name of SCHEMA_NAMES) {
  const sourceUrl = new URL(`../../assets/schemas/${name}.schema.json`, import.meta.url);
  const bundleUrl = new URL(`../assets/schemas/${name}.schema.json`, import.meta.url);
  const url = existsSync(sourceUrl) ? sourceUrl : bundleUrl;
  const schema = JSON.parse(readFileSync(url, "utf8"));
  validators.set(name, ajv.compile(schema));
}
export function validateNamedSchema(name, value, pathPrefix = "") {
  const validator = validators.get(name);
  if (!validator) throw new Error(`未知 Schema: ${name}`);
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error) => ({
    path: `${pathPrefix}${error.instancePath || "/"}`,
    rule: `schema.${error.keyword}`,
    message: error.message ?? `未通过 ${name} Schema`,
    schema: name,
    params: error.params
  }));
}
export var SOURCE_SCHEMA_BY_GROUP = Object.freeze({
  positioning: "positioning",
  world: "world",
  characters: "character",
  systems: "system",
  scenes: "scene",
  mvu: "mvu",
  prompts: "opening",
  ui: "status-ui",
  assembly: "assembly"
});
