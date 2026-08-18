import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { applyNsfwCharacterMixins, makeProject, validateRegisteredSources } from '../scripts/forge/project.mjs';
import { validateNamedSchema } from '../scripts/forge/schema.mjs';

const root = process.cwd();

test('character template carries the complete NSFW content layer', async () => {
  const template = YAML.parse(await readFile(path.join(root, 'assets/templates/character.yaml'), 'utf8'));
  assert.deepEqual(Object.keys(template.nsfw), [
    'sexual_orientation',
    'standing',
    'fetish',
    'preference',
    'sex_organs',
    'sensitive_areas',
    'contrast',
  ]);
  assert.match(await readFile(path.join(root, 'internal-skills/rp-cast-authoring/references/character.md'), 'utf8'), /每一份实际角色源码和最终 CharacterBook 角色条目/);
  assert.deepEqual(validateNamedSchema('character', template), []);
});

test('enabled NSFW injects the full character mixin into authored characters', async () => {
  const project = makeProject({ name: 'NSFW角色层回归', nsfw: true });
  const existing = {
    id: 'main_character',
    display_name: '主角',
    nsfw: { sexual_orientation: '双性恋', fetish: ['已有偏好'] },
  };
  const blank = { id: 'npc', display_name: 'NPC' };
  await applyNsfwCharacterMixins(project, [existing, blank]);
  for (const source of [existing, blank]) {
    assert.ok(source.nsfw);
    for (const field of ['sexual_orientation', 'standing', 'fetish', 'preference', 'sex_organs', 'sensitive_areas', 'contrast']) {
      assert.ok(Object.hasOwn(source.nsfw, field), `${source.display_name} missing ${field}`);
    }
  }
  assert.equal(existing.nsfw.sexual_orientation, '双性恋');
  assert.deepEqual(existing.nsfw.fetish, ['已有偏好']);
});

test('disabled NSFW does not inject the character mixin', async () => {
  const project = makeProject({ name: '关闭NSFW回归', nsfw: false });
  const source = { id: 'npc', display_name: 'NPC' };
  await applyNsfwCharacterMixins(project, [source]);
  assert.equal(source.nsfw, undefined);
});

test('enabled NSFW blocks a character source that omits the content layer', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'rp-nsfw-source-'));
  try {
    const project = makeProject({ name: 'NSFW源码门槛回归', nsfw: true });
    project.source_manifest.characters = ['src/characters/main.yaml'];
    await mkdir(path.join(temp, 'src', 'characters'), { recursive: true });
    const positioning = YAML.parse(await readFile(path.join(root, 'assets/templates/positioning.yaml'), 'utf8'));
    const character = YAML.parse(await readFile(path.join(root, 'assets/templates/character.yaml'), 'utf8'));
    delete character.nsfw;
    await writeFile(path.join(temp, 'src', 'positioning.yaml'), YAML.stringify(positioning));
    await writeFile(path.join(temp, 'src', 'characters', 'main.yaml'), YAML.stringify(character));
    const missing = await validateRegisteredSources({ projectRoot: temp, project });
    assert.ok(missing.issues.some((issue) => issue.rule === 'character.nsfw_required'));
    await applyNsfwCharacterMixins(project, [character]);
    await writeFile(path.join(temp, 'src', 'characters', 'main.yaml'), YAML.stringify(character));
    const complete = await validateRegisteredSources({ projectRoot: temp, project });
    assert.doesNotMatch(JSON.stringify(complete.issues), /character\.nsfw_required/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
