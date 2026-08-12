import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyEjsTemplates,
  applyTavernHelperAdapter,
} from '../scripts/rp-card-runtime.mjs';

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

function runtimeVariable(overrides = {}) {
  return {
    source_path: 'relationship.trust',
    runtime_path: 'stat_data.relationship.trust',
    type: 'integer',
    default: 10,
    writer: { id: 'relationship_update', operations: ['set'] },
    readers: ['ejs'],
    visibility: 'model',
    ...overrides,
  };
}

function ejsEntry(overrides = {}) {
  const base = {
    id: 'trust_gate',
    source_ref: 'character:guide',
    complexity: 'section_branch',
    target: 'prompt',
    placement: 'after',
    insertion_order: 20,
    reads: ['stat_data.relationship.trust'],
    condition: {
      runtime_path: 'stat_data.relationship.trust',
      operator: 'gte',
      value: 50,
    },
    branches: {
      when_true: 'Trusted branch.',
      when_false: 'Guarded branch.',
      fallback: 'Neutral fallback.',
    },
  };
  return {
    ...base,
    ...overrides,
    condition: { ...base.condition, ...overrides.condition },
    branches: { ...base.branches, ...overrides.branches },
  };
}

function runtimeSources(entries, {
  ejsEnabled = true,
  mvuEnabled = false,
  variables = [runtimeVariable()],
  adapter = null,
} = {}) {
  return emptySources({
    characters: [{
      relativePath: 'src/characters/guide.yaml',
      value: { id: 'guide' },
    }],
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: mvuEnabled,
          variables,
          initialization: { defaults: {} },
          update_rules: [],
          routing: { entries: [] },
        },
        ejs: { enabled: ejsEnabled, entries },
        runtime_contract: {
          adapter,
          dependencies: [],
          assumptions: [],
          fallbacks: [],
        },
      },
    }],
  });
}

function characterPayload(entries = []) {
  return {
    data: {
      name: 'EJS host compatibility card',
      extensions: {},
      character_book: {
        name: 'Embedded EJS',
        description: '',
        scan_depth: null,
        token_budget: null,
        recursive_scanning: false,
        extensions: {},
        entries,
      },
    },
  };
}

async function compile(entries, options = {}) {
  return applyEjsTemplates(options.payload ?? characterPayload(), {
    project: { features: { ejs: options.featureEnabled ?? true, mvu: options.mvuEnabled ?? false } },
    sources: runtimeSources(entries, options),
    target: options.target ?? 'character',
  });
}

function assertDecoratorPrefix(content, expected) {
  const lines = content.split(/\r?\n/);
  assert.deepEqual(lines.slice(0, expected.length), expected);
  assert.ok(expected.every(line => line.startsWith('@@')));
  assert.ok(!lines.slice(0, expected.length).includes(''), 'decorators must be contiguous lines');
}

function entriesBySourceKey(result) {
  const entries = result.payload.data.character_book.entries;
  assert.ok(entries.every(entry => Number.isInteger(entry.id) && entry.id >= 0), 'generated CharacterBook ids must be non-negative integers');
  return new Map(entries.map(entry => [entry.extensions?.rp_card_studio?.source_key, entry]));
}

test('EJS compiles into CharacterBook entries without adding Tavern Helper scripts', async () => {
  const payload = characterPayload();
  payload.data.extensions.tavern_helper = {
    scripts: [{ id: 'imported_script', content: 'keep me' }],
  };

  const result = await compile([ejsEntry()], { payload });

  assert.deepEqual(result.issues, []);
  assert.equal(result.payload.data.character_book.entries.length, 1);
  assert.deepEqual(result.payload.data.extensions.tavern_helper.scripts, [
    { id: 'imported_script', content: 'keep me' },
  ]);
  assert.ok(result.payload.data.character_book.entries[0].content.includes('getvar'));
});

test('generated EJS entries use disabled constant CharacterBook host fields and contiguous decorators', async () => {
  const source = ejsEntry({ insertion_order: 23 });
  const result = await compile([source]);
  const entry = result.payload.data.character_book.entries[0];

  assert.deepEqual(result.issues, []);
  assert.ok(Number.isInteger(entry.id) && entry.id >= 0);
  assert.equal(entry.extensions.rp_card_studio.source_id, 'trust_gate');
  assert.equal(entry.extensions.rp_card_studio.source_key, 'ejs:trust_gate:generate');
  assert.equal(entry.comment, '条件模板（生成）：trust_gate');
  assert.equal(entry.enabled, false);
  assert.equal(entry.constant, true);
  assert.deepEqual(entry.keys, []);
  assert.deepEqual(entry.secondary_keys, []);
  assert.equal(entry.insertion_order, 23);
  assertDecoratorPrefix(entry.content, ['@@always_enabled', '@@private', '@@generate_after']);
});

test('prompt, render, and both targets map to generate/render entries and both splits in two', async () => {
  const result = await compile([
    ejsEntry({ id: 'prompt_gate', target: 'prompt', placement: 'before', insertion_order: 10 }),
    ejsEntry({ id: 'render_gate', target: 'render', placement: 'after', insertion_order: 20 }),
    ejsEntry({ id: 'shared_gate', target: 'both', placement: 'before', insertion_order: 30 }),
  ]);

  assert.deepEqual(result.issues, []);
  const bySourceKey = entriesBySourceKey(result);
  assert.deepEqual([...bySourceKey.keys()].sort(), [
    'ejs:prompt_gate:generate',
    'ejs:render_gate:render',
    'ejs:shared_gate:generate',
    'ejs:shared_gate:render',
  ]);

  assert.equal(bySourceKey.get('ejs:prompt_gate:generate').comment, '条件模板（生成）：prompt_gate');
  assertDecoratorPrefix(bySourceKey.get('ejs:prompt_gate:generate').content, [
    '@@always_enabled',
    '@@private',
    '@@generate_before',
  ]);

  assert.equal(bySourceKey.get('ejs:render_gate:render').comment, '条件模板（渲染）：render_gate');
  assertDecoratorPrefix(bySourceKey.get('ejs:render_gate:render').content, [
    '@@always_enabled',
    '@@private',
    '@@render_after',
    '@@if !is_user && !is_system',
  ]);

  assertDecoratorPrefix(bySourceKey.get('ejs:shared_gate:generate').content, [
    '@@always_enabled',
    '@@private',
    '@@generate_before',
  ]);
  assertDecoratorPrefix(bySourceKey.get('ejs:shared_gate:render').content, [
    '@@always_enabled',
    '@@private',
    '@@render_before',
    '@@if !is_user && !is_system',
  ]);
});

test('conditions use ledger-derived typed getvar defaults and emit true, false, and fallback branches', async () => {
  const variables = [
    runtimeVariable(),
    runtimeVariable({
      source_path: 'flags.met_before',
      runtime_path: 'stat_data.flags.met_before',
      type: 'boolean',
      default: false,
      writer: { id: 'flags_update', operations: ['set'] },
    }),
    runtimeVariable({
      source_path: 'mood.current',
      runtime_path: 'stat_data.mood.current',
      type: 'string',
      default: 'neutral',
      writer: { id: 'mood_update', operations: ['set'] },
    }),
  ];
  const result = await compile([
    ejsEntry(),
    ejsEntry({
      id: 'met_gate',
      reads: ['stat_data.flags.met_before'],
      condition: { runtime_path: 'stat_data.flags.met_before', operator: 'eq', value: true },
      branches: { when_true: 'Already met.', when_false: 'First meeting.', fallback: 'Meeting unknown.' },
    }),
    ejsEntry({
      id: 'mood_gate',
      reads: ['stat_data.mood.current'],
      condition: { runtime_path: 'stat_data.mood.current', operator: 'includes', value: 'warm' },
      branches: { when_true: 'Warm mood.', when_false: 'Cool mood.', fallback: 'Mood unavailable.' },
    }),
  ], { variables });

  assert.deepEqual(result.issues, []);
  const bySourceKey = entriesBySourceKey(result);
  const trust = bySourceKey.get('ejs:trust_gate:generate').content;
  const met = bySourceKey.get('ejs:met_gate:generate').content;
  const mood = bySourceKey.get('ejs:mood_gate:generate').content;

  assert.match(trust, /getvar\(["']stat_data\.relationship\.trust["'],\s*\{\s*defaults:\s*10\s*\}\)/);
  assert.match(met, /getvar\(["']stat_data\.flags\.met_before["'],\s*\{\s*defaults:\s*false\s*\}\)/);
  assert.match(mood, /getvar\(["']stat_data\.mood\.current["'],\s*\{\s*defaults:\s*["']neutral["']\s*\}\)/);

  for (const [content, branches] of [
    [trust, ['Trusted branch.', 'Guarded branch.', 'Neutral fallback.']],
    [met, ['Already met.', 'First meeting.', 'Meeting unknown.']],
    [mood, ['Warm mood.', 'Cool mood.', 'Mood unavailable.']],
  ]) {
    assert.match(content, /try\s*\{/);
    assert.match(content, /if\s*\(/);
    assert.match(content, /else\s*\{/);
    assert.match(content, /catch\s*\(/);
    for (const branch of branches) assert.ok(content.includes(branch), `missing branch: ${branch}`);
  assert.match(content, /catch[\s\S]*__rp_fallback/);
  }
});

test('MVU-linked EJS waits for and reads the message snapshot without falling back to getvar', async () => {
  const result = await compile([ejsEntry()], { mvuEnabled: true });
  const content = result.payload.data.character_book.entries[0].content;

  assert.ok(content.includes('globalThis.waitGlobalInitialized("Mvu")'));
  assert.ok(content.includes('const __rp_snapshot_selector = "current_message"'));
  assert.ok(content.includes(': {"type":"message","message_id":"latest"}'));
  assert.ok(content.includes('__rp_mvu.getMvuData(__rp_target)'));
  assert.ok(content.includes('__rp_mvu_data?.["stat_data"]'));
  assert.ok(content.includes('for (const __rp_segment of ["relationship", "trust"])'));
  assert.equal(/\bgetvar\s*\(/.test(content), false);
  assert.equal(/globalThis\.(?:stat_data|MVU)\b/.test(content), false);
  assert.equal(/getVariables\s*\(/.test(content), false);
});

test('truthy and falsy conditions without a comparison value compile safely', async () => {
  const variables = [runtimeVariable({
    source_path: 'flags.met_before',
    runtime_path: 'stat_data.flags.met_before',
    type: 'boolean',
    default: false,
  })];
  const result = await compile([
    ejsEntry({
      id: 'truthy_gate',
      reads: ['stat_data.flags.met_before'],
      condition: { runtime_path: 'stat_data.flags.met_before', operator: 'truthy' },
    }),
    ejsEntry({
      id: 'falsy_gate',
      reads: ['stat_data.flags.met_before'],
      condition: { runtime_path: 'stat_data.flags.met_before', operator: 'falsy' },
    }),
  ], { variables });

  assert.deepEqual(result.issues, []);
  const contents = result.payload.data.character_book.entries.map(entry => entry.content).join('\n');
  assert.match(contents, /Boolean\(__rp_value\)/);
  assert.match(contents, /!__rp_value/);
});

test('branch text is encoded as data and cannot terminate the generated EJS scriptlet', async () => {
  const result = await compile([ejsEntry({
    branches: {
      when_true: 'literal <% dangerous %> 100% true',
      when_false: 'literal %> false',
      fallback: '</script><% fallback %>',
    },
  })]);
  assert.deepEqual(result.issues, []);
  const content = result.payload.data.character_book.entries[0].content;
  assert.ok(content.includes('const __rp_when_true = "literal \\u003c\\u0025 dangerous \\u0025\\u003e 100\\u0025 true"'));
  assert.ok(content.includes('const __rp_when_false = "literal \\u0025\\u003e false"'));
  assert.ok(content.includes('const __rp_fallback = "\\u003c/script\\u003e\\u003c\\u0025 fallback \\u0025\\u003e"'));
});

test('an imported CharacterBook ID collision is reported and never overwritten', async () => {
  const imported = {
    id: 'ejs_trust_gate_generate',
    keys: [],
    secondary_keys: [],
    comment: 'Imported entry',
    content: 'Imported content must survive.',
    constant: true,
    enabled: true,
  };

  const result = await compile([ejsEntry()], { payload: characterPayload([imported]) });

  assert.ok(result.issues.length > 0, 'collision must be surfaced as a blocking issue');
  const collisions = result.payload.data.character_book.entries.filter(entry => entry.id === imported.id);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].comment, 'Imported entry');
  assert.equal(collisions[0].content, 'Imported content must survive.');
});

test('disabled project or source EJS features generate no entries', async () => {
  const featureDisabled = await compile([ejsEntry()], { featureEnabled: false });
  assert.deepEqual(featureDisabled.issues, []);
  assert.deepEqual(featureDisabled.payload.data.character_book.entries, []);

  const sourceDisabled = await compile([ejsEntry()], { ejsEnabled: false });
  assert.deepEqual(sourceDisabled.issues, []);
  assert.deepEqual(sourceDisabled.payload.data.character_book.entries, []);
});

test('EJS templates never generate for a non-character target', async () => {
  const payload = { name: 'Standalone worldbook', entries: {} };
  const result = await compile([ejsEntry()], { payload, target: 'worldbook' });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.payload, payload);
});

test('EJS alone does not generate a Tavern Helper MVU runtime guard', () => {
  const sources = runtimeSources([ejsEntry()], {
    adapter: {
      id: 'tavern_helper',
      version: '1.0.0',
      delivery: 'embedded',
      entrypoint: 'rp_card_studio_runtime_guard',
      readiness_probe: 'globalThis.Mvu',
      timeout_ms: 10000,
      fallback: 'Omit dynamic content.',
    },
  });

  const result = applyTavernHelperAdapter({ data: { extensions: {} } }, {
    project: { features: { mvu: false, ejs: true, status_ui: false } },
    sources,
    target: 'character',
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.payload.data.extensions.tavern_helper, undefined);
});
