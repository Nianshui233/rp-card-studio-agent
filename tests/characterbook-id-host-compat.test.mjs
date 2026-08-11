import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyAssemblyManifest,
  applyEjsTemplates,
  applyMvuArtifacts,
  characterBookIdCandidate,
  createCharacterBookIdAllocator,
} from '../scripts/rp-card-runtime.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forge = path.join(skillRoot, 'scripts', 'rp-card-forge.bundle.mjs');

function emptySources(overrides = {}) {
  return {
    positioning: [],
    material: [],
    world: [],
    characters: [{ relativePath: 'src/characters/guide.yaml', value: { id: 'guide' } }],
    systems: [],
    scenes: [],
    mvu: [],
    prompts: [],
    ui: [],
    assembly: [],
    ...overrides,
  };
}

function assemblySources(ids = ['guide', 'signal']) {
  return emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: {
          entries: ids.map((id, index) => ({
            id,
            source: { kind: 'inline', content: `${id} content` },
            enabled: true,
            activation: { mode: 'constant', primary_keys: [], secondary_keys: [], selective: false, logic: 'any' },
            insertion: { position: 'before_char', order: index },
            probability: 100,
            recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until_recursion: false },
            recipient: 'shared',
            visibility: 'model',
            fallback: 'skip',
          })),
        },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });
}

function characterPayload(entries = []) {
  return {
    data: {
      name: 'Numeric CharacterBook host card',
      extensions: {},
      character_book: { entries },
    },
  };
}

function mvuSource() {
  return {
    relativePath: 'src/mvu/runtime.yaml',
    value: {
      mvu: {
        enabled: true,
        variables: [{
          source_path: 'relationship.trust',
          runtime_path: 'stat_data.relationship.trust',
          type: 'integer',
          default: 10,
          writer: { operations: ['set'] },
          readers: ['ejs'],
        }],
        initialization: { defaults: { relationship: { trust: 10 } } },
        update_rules: [],
      },
      ejs: {
        enabled: true,
        entries: [{
          id: 'trust_gate',
          insertion_order: 1,
          reads: ['stat_data.relationship.trust'],
          condition: { runtime_path: 'stat_data.relationship.trust', operator: 'gte', value: 50 },
          target: 'both',
          branches: { when_true: 'trusted', when_false: 'guarded', fallback: 'unknown' },
        }],
      },
    },
  };
}

function sourceMap(mvu = false) {
  return emptySources({ mvu: mvu ? [mvuSource()] : [] });
}

test('embedded Assembly CharacterBook ids are stable non-negative integers', async () => {
  const first = await applyAssemblyManifest(characterPayload(), {
    sources: assemblySources(['signal', 'guide']),
    projectRoot: process.cwd(),
    target: 'character',
  });
  const second = await applyAssemblyManifest(characterPayload(), {
    sources: assemblySources(['guide', 'signal']),
    projectRoot: process.cwd(),
    target: 'character',
  });

  assert.deepEqual(first.issues, []);
  assert.deepEqual(second.issues, []);
  const map = (result) => Object.fromEntries(result.payload.data.character_book.entries.map((entry) => [
    entry.extensions.rp_card_studio.source_id,
    entry.id,
  ]));
  assert.deepEqual(map(first), map(second));
  assert.ok(Object.values(map(first)).every((id) => Number.isInteger(id) && id >= 0));
});

test('an imported numeric CharacterBook id is preserved and probed around', async () => {
  const candidate = characterBookIdCandidate('assembly:guide');
  const imported = { id: candidate, comment: 'Imported entry', content: 'keep me', enabled: true };
  const result = await applyAssemblyManifest(characterPayload([imported]), {
    sources: assemblySources(['guide']),
    projectRoot: process.cwd(),
    target: 'character',
  });

  assert.deepEqual(result.issues, []);
  assert.ok(result.warnings.some((item) => item.rule === 'assembly.id_collision'));
  const entries = result.payload.data.character_book.entries;
  assert.equal(entries.find((entry) => entry.id === candidate).content, 'keep me');
  const generated = entries.find((entry) => entry.extensions?.rp_card_studio?.source_id === 'guide');
  assert.ok(generated);
  assert.notEqual(generated.id, candidate);
  assert.equal(typeof generated.id, 'number');
  assert.equal(generated.extensions.rp_card_studio.source_id, 'guide');
});

test('resolved MVU and EJS numeric id collisions are warnings rather than Forge blockers', () => {
  const mvuCandidate = characterBookIdCandidate('mvu:initvar');
  const importedMvu = { id: mvuCandidate, comment: 'Imported MVU neighbor', content: 'keep mvu', enabled: true };
  const sources = sourceMap(true);
  const mvu = applyMvuArtifacts(characterPayload([importedMvu]), {
    project: { features: { mvu: true } },
    sources,
    target: 'character',
  });

  assert.deepEqual(mvu.issues, []);
  assert.ok(mvu.warnings.some(item => item.rule === 'mvu.id_collision'));
  assert.equal(mvu.payload.data.character_book.entries.find(entry => entry.id === mvuCandidate).content, 'keep mvu');
  const generatedMvu = mvu.payload.data.character_book.entries.find(entry => (
    entry.extensions?.rp_card_studio?.source_key === 'mvu:initvar'
  ));
  assert.ok(generatedMvu);
  assert.notEqual(generatedMvu.id, mvuCandidate);

  const ejsCandidate = characterBookIdCandidate('ejs:trust_gate:generate');
  const importedEjs = { id: ejsCandidate, comment: 'Imported EJS neighbor', content: 'keep ejs', enabled: true };
  const ejs = applyEjsTemplates(characterPayload([importedEjs]), {
    project: { features: { mvu: true, ejs: true } },
    sources,
    target: 'character',
  });

  assert.deepEqual(ejs.issues, []);
  assert.ok(ejs.warnings.some(item => item.rule === 'ejs.id_collision'));
  assert.equal(ejs.payload.data.character_book.entries.find(entry => entry.id === ejsCandidate).content, 'keep ejs');
  const generatedEjs = ejs.payload.data.character_book.entries.find(entry => (
    entry.extensions?.rp_card_studio?.source_key === 'ejs:trust_gate:generate'
  ));
  assert.ok(generatedEjs);
  assert.notEqual(generatedEjs.id, ejsCandidate);
});

test('MVU and EJS generated entries use numeric ids and distinct source keys', () => {
  const sources = sourceMap(true);
  const mvu = applyMvuArtifacts(characterPayload(), {
    project: { features: { mvu: true } },
    sources,
    target: 'character',
  });
  assert.deepEqual(mvu.issues, []);
  const ejs = applyEjsTemplates(mvu.payload, {
    project: { features: { mvu: true, ejs: true } },
    sources,
    target: 'character',
  });
  assert.deepEqual(ejs.issues, []);
  const entries = ejs.payload.data.character_book.entries;
  assert.ok(entries.every((entry) => Number.isInteger(entry.id) && entry.id >= 0));
  const sourceKeys = entries.map((entry) => entry.extensions?.rp_card_studio?.source_key).filter(Boolean);
  assert.equal(new Set(sourceKeys).size, sourceKeys.length);
  assert.ok(sourceKeys.includes('mvu:initvar'));
  assert.ok(sourceKeys.includes('ejs:trust_gate:generate'));
  assert.ok(sourceKeys.includes('ejs:trust_gate:render'));
});

test('a generated numeric id is reused for the same source key', async () => {
  const first = await applyAssemblyManifest(characterPayload(), {
    sources: assemblySources(['guide']),
    projectRoot: process.cwd(),
    target: 'character',
  });
  const second = await applyAssemblyManifest(first.payload, {
    sources: assemblySources(['guide']),
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.deepEqual(second.issues, []);
  const firstEntry = first.payload.data.character_book.entries[0];
  const secondEntry = second.payload.data.character_book.entries[0];
  assert.equal(firstEntry.id, secondEntry.id);
});

test('reused ids are reserved before new colliding source keys are assigned', () => {
  const collidingSourceKey = 'a:new_source';
  const existingSourceKey = 'z:existing_source';
  const existingId = characterBookIdCandidate(collidingSourceKey);
  const allocator = createCharacterBookIdAllocator([{
    id: existingId,
    extensions: {
      rp_card_studio: {
        source_id: 'existing_source',
        source_key: existingSourceKey,
        generated: true,
      },
    },
  }]);

  const allocations = allocator.allocateMany([collidingSourceKey, existingSourceKey]);
  assert.equal(allocations.get(existingSourceKey).id, existingId);
  assert.equal(allocations.get(existingSourceKey).reused, true);
  assert.notEqual(allocations.get(collidingSourceKey).id, existingId);
  assert.equal(allocator.allocate(existingSourceKey).id, existingId);
});

test('Forge no-assembly fallback emits numeric CharacterBook ids', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rp-card-characterbook-id-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const args of [
    ['init', root, '--nsfw', 'disabled', '--type', 'character'],
  ]) {
    const result = spawnSync(process.execPath, [forge, ...args, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${args[0]} failed: ${result.stdout}${result.stderr}`);
  }
  const projectPath = path.join(root, 'project.yaml');
  const project = readFileSync(projectPath, 'utf8').replace('  world: []', '  world:\n    - src/world/world.yaml');
  writeFileSync(projectPath, project, 'utf8');
  mkdirSync(path.join(root, 'src', 'world'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'world', 'world.yaml'), `
schema_version: 1.0.0
id: numeric_world
display_name: Numeric world
status: locked
premise:
  summary: A world for numeric id verification.
  scale: local
  time_scope: now
  space_scope: station
  public_reality: public
fundamental_rules: []
society:
  norms: []
  institutions: []
  factions: []
geography:
  locations: []
history:
  events: []
knowledge:
  player_visible: []
  conditional: []
  gm_only: []
  model_only: []
continuity:
  invariants: []
  open_questions: []
hooks: []
source_refs: []
`, 'utf8');
  const build = spawnSync(process.execPath, [forge, 'build', root, '--json'], { encoding: 'utf8' });
  assert.equal(build.status, 0, `build failed: ${build.stdout}${build.stderr}`);
  const card = JSON.parse(readFileSync(path.join(root, 'dist', 'character-card.json'), 'utf8'));
  const entries = Array.isArray(card.data.character_book.entries)
    ? card.data.character_book.entries
    : Object.values(card.data.character_book.entries ?? {});
  assert.ok(entries.length > 0, 'Forge fallback did not create CharacterBook entries');
  assert.ok(entries.every((entry) => Number.isInteger(entry.id) && entry.id >= 0));
  assert.ok(entries.every((entry) => entry.extensions?.rp_card_studio?.source_id));
});
