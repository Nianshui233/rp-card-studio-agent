import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { validateNamedSchema } from '../scripts/forge/schema.mjs';

const root = process.cwd();
const readText = (relative) => readFile(path.join(root, relative), 'utf8');
const readYaml = async (relative) => YAML.parse(await readText(relative));

test('systems keep narrative rules by default and load quantitative depth only when needed', async () => {
  const skill = await readText('internal-skills/rp-experience-authoring/SKILL.md');
  const systems = await readText('internal-skills/rp-experience-authoring/references/systems.md');
  const quantitative = await readText('internal-skills/rp-experience-authoring/references/quantitative-systems.md');
  const systemTemplate = await readYaml('assets/templates/system.yaml');
  const mixin = await readYaml('assets/templates/quantitative-system.mixin.yaml');

  assert.match(skill, /只有系统被判定为数值型或混合型时读取/);
  assert.match(systems, /叙事型/);
  assert.match(systems, /数值型/);
  assert.match(systems, /混合型/);
  assert.match(systems, /不要因为最终可能使用 MVU/);
  for (const contract of ['无空档和无重叠', '多事件', '重复', '触顶或触底', '正向事件', '负向事件']) {
    assert.match(quantitative, new RegExp(contract));
  }

  assert.equal(systemTemplate.system_mode, 'narrative');
  assert.equal(systemTemplate.quantitative, undefined);
  assert.deepEqual(validateNamedSchema('system', systemTemplate), []);

  const quantitativeSystem = { ...systemTemplate, system_mode: 'quantitative', ...mixin };
  assert.deepEqual(validateNamedSchema('system', quantitativeSystem), []);
  const missingMixin = validateNamedSchema('system', { ...systemTemplate, system_mode: 'quantitative' });
  assert.ok(missingMixin.some((issue) => issue.rule === 'schema.required'));
});

test('scene authoring supports spatial, security, clue, time, destruction, and offscreen play loops', async () => {
  const scenes = await readText('internal-skills/rp-experience-authoring/references/scenes.md');
  const template = await readYaml('assets/templates/scene.yaml');

  for (const contract of [
    '空间拓扑', '门禁', '监控', '巡逻', '警报', '可破坏', '时间窗口',
    'possible_misdirection', 'offscreen_events', '行动压力测试', '空间闭环', '线索闭环',
  ]) {
    assert.match(scenes, new RegExp(contract));
  }

  assert.ok(template.spatial_structure);
  assert.ok(template.access_and_security);
  assert.ok(template.resources_and_changes);
  assert.ok(template.clue_structure);
  assert.ok(template.time_and_events);
  assert.ok(template.local_rules);
  assert.deepEqual(validateNamedSchema('scene', template), []);
});

test('character authoring preserves causal traceability instead of accepting isolated fields', async () => {
  const character = await readText('internal-skills/rp-cast-authoring/references/character.md');
  const template = await readText('assets/templates/character.yaml');

  for (const contract of [
    '角色因果审计', 'psychology.values', 'psychology.fears', 'psychology.taboos',
    'background.turning_point', 'speech.style', '每条 `taboo` 都能映射', 'NSFW 启用时',
  ]) {
    assert.match(character, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(template, /应能追溯到 values、fears、taboos、义务或关系事实/);
  assert.match(template, /每条 taboo 有直接映射/);
});

test('worldbuilding routes special inputs without creating new stages or runtime source paths', async () => {
  const world = await readText('internal-skills/rp-project-foundation/references/worldbuilding.md');
  for (const contract of [
    '特殊输入处理', '只有一个概念词', '大段小说', '已有世界观要求转换',
    '中途大改方向', '已有 IP', '多世界或平行维度', '极简世界',
    '不是额外用户阶段', '运行时不依赖原始路径',
  ]) {
    assert.match(world, new RegExp(contract));
  }
});
