import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyAssemblyManifest,
  validateRuntimeSources,
} from '../scripts/rp-card-runtime.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forge = process.env.RP_CARD_FORGE ?? path.join(skillRoot, 'scripts', 'rp-card-forge.bundle.mjs');

function emptySources(overrides = {}) {
  return {
    positioning: [],
    world: [],
    characters: [],
    systems: [],
    scenes: [],
    mvu: [],
    prompts: [],
    ui: [],
    assembly: [],
    ...overrides,
  };
}

function worldbookEntry(overrides = {}) {
  const base = {
    id: 'guide',
    source: { kind: 'inline', content: 'Guide text.' },
    enabled: true,
    activation: {
      mode: 'constant',
      primary_keys: [],
      secondary_keys: [],
      selective: false,
      logic: 'any',
    },
    insertion: { position: 'before_char', order: 1 },
    probability: 100,
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until_recursion: false,
    },
    recipient: 'shared',
    visibility: 'model',
    fallback: 'skip',
  };
  return {
    ...base,
    ...overrides,
    activation: { ...base.activation, ...overrides.activation },
    insertion: { ...base.insertion, ...overrides.insertion },
    recursion: { ...base.recursion, ...overrides.recursion },
  };
}

function sourcesWithManifest(entries) {
  return emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: { entries },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });
}

function characterPayload() {
  return {
    data: {
      name: 'Host compatibility card',
      extensions: {},
      character_book: { entries: [] },
    },
  };
}

function runForge(args, { expectSuccess = false } = {}) {
  const result = spawnSync(process.execPath, [forge, ...args, '--json'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (expectSuccess && result.status !== 0) {
    assert.fail(`Forge failed with status ${result.status}:\n${output}`);
  }
  return { ...result, output };
}

function tempRoot(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), `rp-card-worldbook-${label}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('embedded worldbook maps example-message positions to SillyTavern 5 and 6', async () => {
  const sources = sourcesWithManifest([
    worldbookEntry({ id: 'before_example', insertion: { position: 'before_example', order: 1 } }),
    worldbookEntry({ id: 'after_example', insertion: { position: 'after_example', order: 2 } }),
  ]);

  const result = await applyAssemblyManifest(characterPayload(), {
    sources,
    projectRoot: process.cwd(),
    target: 'character',
  });

  assert.deepEqual(result.issues, []);
  assert.ok(result.payload.data.character_book.entries.every(entry => Number.isInteger(entry.id) && entry.id >= 0));
  const actual = Object.fromEntries(result.payload.data.character_book.entries.map(entry => [
    entry.extensions.rp_card_studio.source_id,
    entry.extensions.position,
  ]));
  assert.deepEqual(actual, { before_example: 5, after_example: 6 });
});

test('embedded worldbook emits camelCase selective logic and probability extensions', async () => {
  const sources = sourcesWithManifest([worldbookEntry({
    activation: {
      mode: 'keywords',
      primary_keys: ['signal'],
      secondary_keys: ['guide'],
      selective: true,
      logic: 'not_any',
    },
    probability: 37,
  })]);

  const result = await applyAssemblyManifest(characterPayload(), {
    sources,
    projectRoot: process.cwd(),
    target: 'character',
  });

  assert.deepEqual(result.issues, []);
  const entry = result.payload.data.character_book.entries[0];
  assert.equal(entry.extensions.useProbability, true);
  assert.equal(entry.extensions.probability, 37);
  assert.equal(entry.extensions.selectiveLogic, 2);
});

test('standalone worldbook entries receive unique numeric uid values', async () => {
  const sources = sourcesWithManifest([
    worldbookEntry({ id: 'first', insertion: { order: 1 } }),
    worldbookEntry({ id: 'second', insertion: { order: 2 } }),
  ]);

  const result = await applyAssemblyManifest({ entries: {} }, {
    sources,
    projectRoot: process.cwd(),
    target: 'worldbook',
  });

  assert.deepEqual(result.issues, []);
  const entries = Object.values(result.payload.entries);
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => Number.isInteger(entry.uid)), `invalid uids: ${entries.map(entry => entry.uid).join(', ')}`);
  assert.equal(new Set(entries.map(entry => entry.uid)).size, entries.length);
});

test('standalone worldbook fallback emits SillyTavern host fields without an assembly manifest', t => {
  const root = tempRoot(t, 'fallback');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'worldbook'], { expectSuccess: true });
  runForge(['build', root], { expectSuccess: true });

  const artifactPath = path.join(root, 'dist', 'worldbook.json');
  runForge(['validate', artifactPath], { expectSuccess: true });
  const worldbook = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const entry = Object.values(worldbook.entries)[0];
  assert.ok(entry, 'fallback build did not emit a worldbook entry');
  assert.ok(Array.isArray(entry.key) && entry.key.length > 0, `missing host key: ${JSON.stringify(entry)}`);
  assert.deepEqual(entry.keysecondary, []);
  assert.equal(entry.constant, true);
  assert.equal(entry.selective, false);
  assert.equal(entry.disable, false);
  assert.equal(entry.position, 0);
});

test('unsupported visibility and routing metadata cannot silently produce active prompt entries', async () => {
  const cases = [
    worldbookEntry({ id: 'gm_secret', visibility: 'gm' }),
    worldbookEntry({ id: 'update_recipient', recipient: 'update' }),
    worldbookEntry({ id: 'limited_budget', token_budget: 64 }),
    worldbookEntry({ id: 'include_fallback', fallback: 'include' }),
  ];
  const unsafe = [];

  for (const candidate of cases) {
    const sources = sourcesWithManifest([candidate]);
    const validation = await validateRuntimeSources({
      project: { features: {} },
      sources,
      projectRoot: process.cwd(),
    });
    const result = await applyAssemblyManifest(characterPayload(), {
      sources,
      projectRoot: process.cwd(),
      target: 'character',
    });
    const entry = result.payload.data.character_book.entries.find(item => item.extensions?.rp_card_studio?.source_id === candidate.id);
    const blocked = validation.issues.length > 0 || result.issues.length > 0;
    const safelyDegraded = !entry || entry.enabled === false || entry.disable === true;
    if (!blocked && !safelyDegraded) unsafe.push(candidate.id);
  }

  assert.deepEqual(unsafe, [], `unsupported metadata produced active entries: ${unsafe.join(', ')}`);
});

test('worldbook source fallback is enforced during the build', async () => {
  const missingSource = { kind: 'registered_source', source_ref: 'world:missing' };
  const blockingSources = sourcesWithManifest([worldbookEntry({
    id: 'blocking_fallback',
    source: missingSource,
    fallback: 'block',
  })]);
  const skippedSources = sourcesWithManifest([worldbookEntry({
    id: 'skipped_fallback',
    source: missingSource,
    fallback: 'skip',
  })]);

  const blockingValidation = await validateRuntimeSources({
    project: { features: {} },
    sources: blockingSources,
    projectRoot: process.cwd(),
  });
  const blockingResult = await applyAssemblyManifest(characterPayload(), {
    sources: blockingSources,
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.ok(blockingValidation.issues.some(issue => issue.rule === 'assembly.source'));
  assert.ok(blockingResult.issues.some(issue => issue.rule === 'assembly.source'));

  const skippedValidation = await validateRuntimeSources({
    project: { features: {} },
    sources: skippedSources,
    projectRoot: process.cwd(),
  });
  const skippedResult = await applyAssemblyManifest(characterPayload(), {
    sources: skippedSources,
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.deepEqual(skippedValidation.issues, []);
  assert.ok(skippedValidation.warnings.some(warning => warning.rule === 'assembly.source.skipped'));
  assert.deepEqual(skippedResult.issues, []);
  assert.ok(skippedResult.warnings.some(warning => warning.rule === 'assembly.source.skipped'));
  assert.equal(skippedResult.payload.data.character_book.entries.length, 0);
});

test('character filters are native only for standalone SillyTavern worldbooks', async () => {
  const filtered = worldbookEntry({
    id: 'filtered_guide',
    character_filter: {
      avatar_stems: ['Seraphina'],
      tag_ids: ['tag-id-featured'],
      is_exclude: false,
    },
  });
  const sources = sourcesWithManifest([filtered]);

  const standalone = await applyAssemblyManifest({ entries: {} }, {
    sources,
    projectRoot: process.cwd(),
    target: 'worldbook',
  });
  assert.deepEqual(standalone.issues, []);
  const standaloneEntry = Object.values(standalone.payload.entries)[0];
  assert.deepEqual(standaloneEntry.characterFilter, {
    names: ['Seraphina'],
    tags: ['tag-id-featured'],
    isExclude: false,
  });

  const embedded = await applyAssemblyManifest(characterPayload(), {
    sources,
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.ok(embedded.issues.some(issue => issue.path.endsWith('/character_filter')));
});

test('standalone assembly never overwrites an imported object key that lacks uid', async () => {
  const sources = sourcesWithManifest([worldbookEntry({ id: 'new_guide' })]);
  const imported = {
    entries: {
      0: { id: 'legacy', content: 'Imported without uid.', enabled: true },
    },
  };

  const result = await applyAssemblyManifest(imported, {
    sources,
    projectRoot: process.cwd(),
    target: 'worldbook',
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.payload.entries['0'].content, 'Imported without uid.');
  const generated = Object.values(result.payload.entries).find(entry => entry.extensions?.rp_card_studio?.source_id === 'new_guide');
  assert.ok(generated, `generated entry was overwritten or lost: ${JSON.stringify(result.payload.entries)}`);
  assert.equal(generated.uid, 1);
});

test('runtime validation infers embedded character-card target from deliverables', async () => {
  const sources = sourcesWithManifest([worldbookEntry({
    id: 'embedded_filter',
    character_filter: { avatar_stems: ['Seraphina'], tag_ids: [], is_exclude: false },
  })]);

  const validation = await validateRuntimeSources({
    project: { features: {}, deliverables: ['character_card_json'] },
    sources,
    projectRoot: process.cwd(),
  });

  assert.ok(validation.issues.some(issue => issue.path.endsWith('/character_filter')));
});

test('entry scan depth maps 0, null, and 1000 to each SillyTavern representation', async () => {
  const depths = [0, null, 1000];
  const sources = sourcesWithManifest(depths.map((scanDepth, index) => worldbookEntry({
    id: `limited_scan_${index}`,
    insertion: { order: index },
    scan_depth: scanDepth,
  })));

  const standalone = await applyAssemblyManifest({ entries: {} }, {
    sources,
    projectRoot: process.cwd(),
    target: 'worldbook',
  });
  assert.deepEqual(standalone.issues, []);
  assert.deepEqual(Object.values(standalone.payload.entries).map(entry => entry.scanDepth), depths);

  const embedded = await applyAssemblyManifest(characterPayload(), {
    sources,
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.deepEqual(embedded.issues, []);
  assert.deepEqual(embedded.payload.data.character_book.entries.map(entry => entry.extensions.scan_depth), depths);
});

test('entry scan depth rejects values outside SillyTavern range', async () => {
  for (const scanDepth of [-1, 1001, 1.5]) {
    const sources = sourcesWithManifest([worldbookEntry({ scan_depth: scanDepth })]);
    const validation = await validateRuntimeSources({
      project: { features: {}, deliverables: ['worldbook'] },
      sources,
      projectRoot: process.cwd(),
    });
    assert.ok(validation.issues.some(issue => issue.path.endsWith('/scan_depth')), `accepted scan_depth ${scanDepth}`);
  }
});

test('book-level scan settings remain blocked because SillyTavern only reads global settings', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: {
          scan_depth: 4,
          token_budget: 2048,
          recursive_scanning: true,
          entries: [],
        },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });

  const validation = await validateRuntimeSources({
    project: { features: {}, deliverables: ['worldbook'] },
    sources,
    projectRoot: process.cwd(),
  });
  assert.equal(validation.issues.filter(issue => issue.rule === 'assembly.host.unsupported').length, 3);
});

test('bare CharacterBook JSON is rejected instead of being misclassified as a standalone worldbook', t => {
  const root = tempRoot(t, 'bare-character-book');
  const input = path.join(root, 'character-book.json');
  writeFileSync(input, JSON.stringify({
    name: 'Embedded-only character book',
    description: 'This is the Character Card character_book shape.',
    entries: [{
      keys: ['signal'],
      secondary_keys: [],
      content: 'Character book entry.',
      constant: false,
      selective: false,
      insertion_order: 10,
      enabled: true,
      position: 'before_char',
      extensions: { position: 0 },
    }],
  }, null, 2));

  const result = runForge(['validate', input]);
  assert.notEqual(result.status, 0, `bare CharacterBook was accepted:\n${result.output}`);
  assert.match(result.output, /CharacterBook|Character Book|character_book/i);
});

test('standalone object entries require canonical numeric keys and integer uid values', async () => {
  const sources = sourcesWithManifest([]);
  const malformedContainers = [
    { foo: { uid: 0, key: [], keysecondary: [], content: 'nonnumeric key', disable: false } },
    { '01': { uid: 1, key: [], keysecondary: [], content: 'leading zero key', disable: false } },
    { 1: { uid: '1', key: [], keysecondary: [], content: 'string uid', disable: false } },
  ];

  for (const entries of malformedContainers) {
    const result = await applyAssemblyManifest({ entries }, {
      sources,
      projectRoot: process.cwd(),
      target: 'worldbook',
    });
    assert.ok(result.issues.some(issue => issue.rule === 'assembly.uid'), `accepted malformed entries: ${JSON.stringify(entries)}`);
  }
});

test('standalone assembly blocks imported worldbook key and uid mismatches', async () => {
  const sources = sourcesWithManifest([]);
  const imported = {
    entries: {
      0: { uid: 1, id: 'first', content: 'Mismatched identity.' },
      1: { uid: 1, id: 'second', content: 'Duplicate identity.' },
    },
  };

  const result = await applyAssemblyManifest(imported, {
    sources,
    projectRoot: process.cwd(),
    target: 'worldbook',
  });

  assert.ok(result.issues.some(issue => issue.rule === 'assembly.uid'));
});

test('no-assembly Forge fallback reserves imported numeric worldbook keys', t => {
  const root = tempRoot(t, 'imported-key');
  const input = path.join(root, 'input.json');
  writeFileSync(input, JSON.stringify({
    name: 'Imported worldbook',
    entries: {
      0: {
        id: 'legacy',
        key: ['legacy'],
        keysecondary: [],
        content: 'Imported without uid.',
        constant: true,
        selective: false,
        order: 0,
        position: 0,
        disable: false,
      },
    },
  }, null, 2));
  const project = path.join(root, 'project');
  runForge(['unpack', input, '--output', project, '--nsfw', 'disabled'], { expectSuccess: true });

  const primaryPath = path.join(project, 'src', 'world', 'worldbook.yaml');
  const additionalPath = path.join(project, 'src', 'world', 'additional.yaml');
  const primary = readFileSync(primaryPath, 'utf8');
  const additional = primary
    .replace(/^id:.*$/m, 'id: additional')
    .replace(/^display_name:.*$/m, 'display_name: Additional');
  writeFileSync(additionalPath, additional, 'utf8');
  const projectPath = path.join(project, 'project.yaml');
  const projectYaml = readFileSync(projectPath, 'utf8');
  const updatedProject = projectYaml.replace(
    '  world:\n    - src/world/worldbook.yaml',
    '  world:\n    - src/world/worldbook.yaml\n    - src/world/additional.yaml',
  );
  assert.notEqual(updatedProject, projectYaml, 'could not register the additional world source');
  writeFileSync(projectPath, updatedProject, 'utf8');

  runForge(['build', project], { expectSuccess: true });
  const output = JSON.parse(readFileSync(path.join(project, 'dist', 'worldbook.json'), 'utf8'));
  assert.equal(output.entries['0'].content, 'Imported without uid.');
  const generated = Object.values(output.entries).find(entry => entry.extensions?.rp_card_studio?.source_id === 'additional');
  assert.ok(generated, `additional entry was overwritten or lost: ${JSON.stringify(output.entries)}`);
  assert.equal(generated.uid, 1);
});

test('no-assembly Forge build blocks a noncanonical imported worldbook key', t => {
  const root = tempRoot(t, 'invalid-imported-key');
  const project = path.join(root, 'project');
  runForge(['init', project, '--nsfw', 'disabled', '--type', 'worldbook'], { expectSuccess: true });

  const worldPath = path.join(project, 'src', 'world', 'worldbook.yaml');
  const world = readFileSync(worldPath, 'utf8');
  const injected = world.replace(
    '    entries: {}',
    '    entries:\n      foo:\n        uid: 0\n        key: [legacy]\n        keysecondary: []\n        content: Invalid key.\n        constant: true\n        selective: false\n        order: 0\n        position: 0\n        disable: false',
  );
  assert.notEqual(injected, world, 'could not inject the invalid worldbook entry');
  writeFileSync(worldPath, injected, 'utf8');

  const result = runForge(['build', project]);
  assert.notEqual(result.status, 0, `noncanonical key was built:\n${result.output}`);
  assert.match(result.output, /uid|\u6761\u76EE\u952E|entry key/i);
});
