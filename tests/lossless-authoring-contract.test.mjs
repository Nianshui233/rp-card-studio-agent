import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('creative stages preserve complete canonical YAML instead of authoring compressed worldbook summaries', () => {
  const agent = read('AGENT.md');
  const world = read('internal-skills/rp-project-foundation/references/worldbuilding.md');
  const character = read('internal-skills/rp-cast-authoring/references/character.md');
  const systems = read('internal-skills/rp-experience-authoring/references/systems.md');
  const scenes = read('internal-skills/rp-experience-authoring/references/scenes.md');
  assert.match(agent, /完整创作 YAML 与世界书无损拆分/);
  assert.match(agent, /不得一开始就.*压成摘要/);
  assert.match(world, /canonical 创作源[\s\S]*不得把完整世界改写成几段摘要/);
  assert.match(character, /canonical YAML[\s\S]*不得把它改写成短人设摘要/);
  assert.match(systems, /完整 canonical YAML[\s\S]*不把系统压成几条“核心规则”/);
  assert.match(scenes, /canonical 场景 YAML[\s\S]*无损拆分/);
});

test('worldbook packaging uses exact source slices and activation metadata rather than content deletion', () => {
  const skill = read('internal-skills/st-worldbook-regex/SKILL.md');
  const ref = read('internal-skills/st-worldbook-regex/references/lossless-yaml-packaging.md');
  const integration = read('internal-skills/st-integration-qa/references/integration.md');
  const validation = read('internal-skills/st-integration-qa/references/validation.md');
  assert.match(skill, /世界书 `content` 默认保留源 YAML 原文/);
  assert.match(ref, /连续原文片段/);
  assert.match(ref, /激活而不是压缩/);
  assert.match(integration, /按 mapping\/list 子树拆成更多原文块/);
  assert.match(validation, /按源顺序重组同一 YAML 对应的条目后与源正文一致/);
});

test('canonical templates declare lossless packaging intent', () => {
  for (const file of ['world.yaml', 'character.yaml', 'system.yaml', 'quantitative-system.mixin.yaml', 'scene.yaml']) {
    const source = read(path.join('assets', 'templates', file));
    assert.match(source, /^# canonical /, `${file} must identify itself as canonical source`);
    assert.match(source, /无损|完整保留|原文/, `${file} must preserve content during packaging`);
  }
});
