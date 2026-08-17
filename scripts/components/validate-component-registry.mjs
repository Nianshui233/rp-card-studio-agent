import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

function load(file) {
  const text = fs.readFileSync(file, "utf8");
  return path.extname(file).toLowerCase() === ".json" ? JSON.parse(text) : YAML.parse(text);
}

export function validateRegistry(document) {
  const issues = [];
  const components = Array.isArray(document?.components) ? document.components : [];
  const recipes = Array.isArray(document?.recipes) ? document.recipes : [];
  if (!Array.isArray(document?.components)) issues.push({ path: "components", message: "components 必须是数组" });
  if (!Array.isArray(document?.recipes)) issues.push({ path: "recipes", message: "recipes 必须是数组" });
  const byId = new Map();
  const outputOwners = new Map();
  for (const [index, component] of components.entries()) {
    if (!component?.id || typeof component.id !== "string") issues.push({ path: `components.${index}.id`, message: "组件 ID 缺失" });
    else if (byId.has(component.id)) issues.push({ path: `components.${index}.id`, message: `组件 ID 重复: ${component.id}` });
    else byId.set(component.id, component);
    for (const output of component?.outputs ?? []) {
      if (outputOwners.has(output)) issues.push({ path: `components.${index}.outputs`, message: `输出所有权冲突: ${output}` });
      else outputOwners.set(output, component.id);
    }
  }
  for (const [id, component] of byId) {
    for (const dependency of component.depends_on ?? []) if (!byId.has(dependency)) issues.push({ path: `components.${id}.depends_on`, message: `依赖不存在: ${dependency}` });
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack = []) {
    if (visiting.has(id)) { issues.push({ path: `components.${id}.depends_on`, message: `组件依赖循环: ${[...stack, id].join(" -> ")}` }); return; }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).depends_on ?? []) visit(dependency, [...stack, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  const recipeIds = new Set();
  for (const [index, recipe] of recipes.entries()) {
    if (!recipe?.id || recipeIds.has(recipe.id)) issues.push({ path: `recipes.${index}.id`, message: "Recipe ID 缺失或重复" });
    recipeIds.add(recipe?.id);
    for (const component of recipe?.components ?? []) if (!byId.has(component)) issues.push({ path: `recipes.${index}.components`, message: `Recipe 引用了不存在的组件: ${component}` });
  }
  return { ok: issues.length === 0, components: components.length, recipes: recipes.length, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const file = process.argv[2];
  if (!file) throw new Error("用法: node validate-component-registry.mjs <registry.yaml>");
  const report = validateRegistry(load(file));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 4;
}
