import assert from 'node:assert/strict';
import test from 'node:test';

import { applyEjsTemplates } from '../scripts/rp-card-runtime.mjs';

function emptySources(mvu = []) {
  return {
    positioning: [],
    world: [],
    characters: [{ relativePath: 'src/characters/guide.yaml', value: { id: 'guide' } }],
    systems: [],
    scenes: [],
    mvu,
    prompts: [],
    ui: [],
    assembly: [],
  };
}

function runtimeVariable(overrides = {}) {
  return {
    source_path: 'relationship.trust',
    runtime_path: 'stat_data.relationship.trust',
    type: 'integer',
    default: 10,
    constraints: { minimum: 0, maximum: 100 },
    writer: { kind: 'update_model', id: 'relationship_update', operations: ['set'] },
    readers: ['ejs'],
    renderer: null,
    cleanup: 'retain',
    migration: 'keep_if_valid',
    visibility: 'model',
    ...overrides,
  };
}

function ejsEntry(overrides = {}) {
  const base = {
    id: 'trust_gate',
    source_ref: 'character:guide',
    complexity: 'section_branch',
    engine: 'st_prompt_template',
    placement: 'after',
    insertion_order: 20,
    reads: ['stat_data.relationship.trust'],
    condition: {
      runtime_path: 'stat_data.relationship.trust',
      operator: 'gte',
      value: 50,
    },
    target: 'prompt',
    branches: {
      when_true: 'Trusted branch.',
      when_false: 'Guarded branch.',
      fallback: 'Neutral fallback.',
    },
    missing_dependency: 'omit_dynamic',
  };
  return {
    ...base,
    ...overrides,
    condition: { ...base.condition, ...overrides.condition },
    branches: { ...base.branches, ...overrides.branches },
  };
}

function runtimeSource(id, entries, variables = [runtimeVariable()]) {
  return {
    relativePath: `src/mvu/${id}.yaml`,
    value: {
      mvu: {
        enabled: true,
        storage: {
          scope: 'message',
          namespace: 'stat_data',
          snapshot_selector: 'latest_message',
          merge_policy: 'scope_only',
        },
        variables,
        initialization: { defaults: {}, opening_overrides: [] },
        update_rules: [],
        routing: { entries: [] },
      },
      ejs: { enabled: true, entries },
      runtime_contract: {
        adapter: null,
        dependencies: [{
          id: 'st_prompt_template',
          class: 'host_required',
          delivery: 'Install and enable ST-Prompt-Template in SillyTavern.',
          version: '1.17.6.8',
          readiness_probe: 'globalThis.EjsTemplate',
          timeout_ms: 10000,
          fallback: 'Omit dynamic content.',
        }],
        assumptions: [],
        fallbacks: ['Omit dynamic content.'],
      },
    },
  };
}

function characterPayload() {
  return {
    data: {
      name: 'EJS bridge contract card',
      extensions: {},
      character_book: {
        extensions: {},
        entries: [],
      },
    },
  };
}

function compile(sources) {
  return applyEjsTemplates(characterPayload(), {
    project: { features: { mvu: true, ejs: true } },
    sources: emptySources(sources),
    target: 'character',
  });
}

function generatedContent(result, sourceId) {
  const entry = result.payload.data.character_book.entries.find(candidate => (
    candidate.extensions?.rp_card_studio?.source_id === sourceId
  ));
  assert.ok(entry, `missing generated EJS entry for ${sourceId}`);
  assert.ok(Number.isInteger(entry.id) && entry.id >= 0, `invalid CharacterBook id for ${sourceId}: ${entry.id}`);
  assert.ok(entry.extensions.rp_card_studio.generated === true);
  return entry.content;
}

test('generated EJS waits for the authoritative MVU snapshot and never masks missing paths with getvar defaults', () => {
  const result = compile([runtimeSource('primary', [ejsEntry()])]);

  assert.deepEqual(result.issues, []);
  const content = generatedContent(result, 'trust_gate');
  const wait = content.indexOf('waitGlobalInitialized("Mvu")');
  const mvuBridge = content.indexOf('__rp_mvu.getMvuData');
  assert.ok(wait >= 0, 'EJS must wait for the MVU host');
  assert.ok(mvuBridge > wait, 'EJS must read MVU only after the bounded readiness wait');
  assert.match(content, /const __rp_snapshot_selector = "latest_message"/);
  assert.match(content, /:\s*\{"type":"message","message_id":"latest"\}/);
  assert.match(content, /getMvuData\(__rp_target\)/);
  assert.match(content, /__rp_mvu_data\?\.\["stat_data"\]/);
  assert.doesNotMatch(content, /\bgetvar\s*\(/, 'MVU-linked EJS must use its explicit fallback branch when state is missing');
  assert.doesNotMatch(content, /globalThis\.stat_data\b|globalThis\.MVU\b|\.getVariables\s*\(|EjsTemplate\.allVariables\s*\(/);
});

test('truthy and falsy conditions compile without a value field', async () => {
  for (const operator of ['truthy', 'falsy']) {
    const condition = { runtime_path: 'stat_data.flags.ready', operator };
    const entry = ejsEntry({
      id: `${operator}_gate`,
      reads: ['stat_data.flags.ready'],
      condition,
    });
    delete entry.condition.value;
    const variable = runtimeVariable({
      source_path: 'flags.ready',
      runtime_path: 'stat_data.flags.ready',
      type: 'boolean',
      default: false,
      constraints: {},
      writer: { kind: 'update_model', id: 'flags_update', operations: ['set'] },
    });
    let result;

    await assert.doesNotReject(async () => {
      result = compile([runtimeSource(operator, [entry], [variable])]);
    }, `${operator} must not stringify an absent comparison value`);

    assert.deepEqual(result.issues, []);
    const content = generatedContent(result, `${operator}_gate`);
    assert.match(content, /__rp_collection_truthy/);
    assert.doesNotMatch(content, /\bundefined\b/);
  }
});

test('branch text containing EJS delimiters is escaped before the host template is emitted', () => {
  const unsafe = ejsEntry({
    branches: {
      when_true: 'Literal marker: <% not executable %>.',
      when_false: 'Safe false branch.',
      fallback: 'Safe fallback.',
    },
  });

  const result = compile([runtimeSource('unsafe_branch', [unsafe])]);

  assert.deepEqual(result.issues, []);
  const content = generatedContent(result, 'trust_gate');
  assert.doesNotMatch(content, /Literal marker: <% not executable %>/);
  assert.match(content, /Literal marker: \\u003c\\u0025 not executable \\u0025\\u003e/);
  assert.match(content, /__rp_when_true/);
});

test('duplicate runtime declarations cannot overwrite each other while compiling EJS defaults', () => {
  const first = runtimeSource('first', [ejsEntry({ id: 'first_gate' })], [
    runtimeVariable({ default: 10 }),
  ]);
  const second = runtimeSource('second', [ejsEntry({ id: 'second_gate' })], [
    runtimeVariable({ default: 99 }),
  ]);

  const result = compile([first, second]);

  assert.ok(
    result.issues.some(issue => /duplicate|ambiguous|conflict/.test(`${issue.rule} ${issue.message}`)),
    `duplicate runtime paths must be reported: ${JSON.stringify(result.issues)}`,
  );
  assert.equal(
    result.payload.data.character_book.entries.length,
    0,
    'ambiguous declarations must block the whole EJS projection instead of using the last default',
  );
});
