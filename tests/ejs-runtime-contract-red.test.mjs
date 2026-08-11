import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  applyEjsTemplates,
  validateRuntimeSources,
} from '../scripts/rp-card-runtime.mjs';

function emptySources(overrides = {}) {
  return {
    positioning: [],
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

function runtimeVariable(namespace = 'stat_data') {
  return {
    source_path: 'relationship.trust',
    runtime_path: `${namespace}.relationship.trust`,
    type: 'integer',
    default: 10,
    constraints: { minimum: 0, maximum: 100 },
    writer: { id: 'relationship_update', operations: ['set'] },
    readers: ['ejs'],
    visibility: 'model',
  };
}

function ejsEntry(namespace = 'stat_data', target = 'prompt') {
  const runtimePath = `${namespace}.relationship.trust`;
  return {
    id: 'trust_gate',
    source_ref: 'character:guide',
    complexity: 'section_branch',
    engine: 'st_prompt_template',
    placement: 'after',
    insertion_order: 20,
    reads: [runtimePath],
    condition: { runtime_path: runtimePath, operator: 'gte', value: 50 },
    target,
    branches: {
      when_true: 'TRUSTED',
      when_false: 'GUARDED',
      fallback: 'FALLBACK',
    },
    missing_dependency: 'omit_dynamic',
  };
}

function runtimeSource({
  mvuEnabled = true,
  ejsEnabled = true,
  scope = 'message',
  namespace = 'stat_data',
  snapshotSelector = 'latest_message',
  ejsTarget = 'prompt',
  adapter = null,
} = {}) {
  return {
    relativePath: 'src/mvu/runtime.yaml',
    value: {
      mvu: {
        enabled: mvuEnabled,
        storage: {
          scope,
          namespace,
          snapshot_selector: snapshotSelector,
          merge_policy: 'scope_only',
        },
        variables: [runtimeVariable(namespace)],
        initialization: { defaults: { relationship: { trust: 10 } } },
        update_rules: [],
        routing: { entries: [] },
      },
      ejs: {
        enabled: ejsEnabled,
        entries: [ejsEntry(namespace, ejsTarget)],
      },
      runtime_contract: {
        adapter,
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
      name: 'EJS runtime contract card',
      extensions: {},
      character_book: {
        name: 'Generated EJS',
        description: '',
        scan_depth: null,
        token_budget: null,
        recursive_scanning: false,
        extensions: {},
        entries: [],
      },
    },
  };
}

function compile(options = {}) {
  const source = runtimeSource(options);
  return applyEjsTemplates(characterPayload(), {
    project: { features: { mvu: options.mvuEnabled ?? true, ejs: options.ejsEnabled ?? true } },
    sources: emptySources({ mvu: [source] }),
    target: 'character',
  });
}

function generatedContent(result) {
  const entry = result.payload.data.character_book.entries.find(candidate => (
    candidate.extensions?.rp_card_studio?.source_id === 'trust_gate'
  ));
  assert.ok(entry, 'generated EJS CharacterBook entry is missing');
  return entry.content;
}

/**
 * Run only the generated EJS subset. Decorator lines are host metadata and the
 * remaining tags are standard EJS script/output tags emitted by the skill.
 */
async function renderGeneratedEjs(content, sandbox = {}) {
  const template = content
    .split(/\r?\n/)
    .filter(line => !line.startsWith('@@'))
    .join('\n');
  const tag = /<%([=-]?)([\s\S]*?)%>/g;
  let cursor = 0;
  let program = 'let __rp_output = "";\n';
  for (let match = tag.exec(template); match; match = tag.exec(template)) {
    const literal = template.slice(cursor, match.index);
    if (literal) program += `__rp_output += ${JSON.stringify(literal)};\n`;
    if (match[1] === '-') {
      program += `__rp_output += String((${match[2].trim()}) ?? "");\n`;
    } else {
      program += `${match[2]}\n`;
    }
    cursor = match.index + match[0].length;
  }
  const tail = template.slice(cursor);
  if (tail) program += `__rp_output += ${JSON.stringify(tail)};\n`;
  program += 'return __rp_output;';
  const context = {
    setTimeout,
    clearTimeout,
    ...sandbox,
  };
  const result = vm.runInNewContext(`(async () => {\n${program}\n})()`, context, {
    filename: 'generated-ejs-red-test.js',
    timeout: 1000,
  });
  return result && typeof result.then === 'function' ? result : Promise.resolve(result);
}

test('EJS+MVU rejects non-message scopes and non-stat_data namespaces before generation', async () => {
  for (const options of [
    { scope: 'chat', namespace: 'stat_data', snapshotSelector: 'current_chat' },
    { scope: 'message', namespace: 'profile_data', snapshotSelector: 'latest_message' },
  ]) {
    const validation = await validateRuntimeSources({
      project: { features: { mvu: true, ejs: true } },
      sources: emptySources({ mvu: [runtimeSource(options)] }),
      projectRoot: process.cwd(),
    });
    assert.ok(
      validation.issues.some(issue => /storage|scope|namespace/i.test(`${issue.rule} ${issue.message}`)),
      `unsupported EJS+MVU storage contract must be blocked: ${JSON.stringify(validation.issues)}`,
    );
  }
});

test('generated EJS waits for Mvu with a bounded timeout before reading the snapshot', () => {
  const result = compile();
  assert.deepEqual(result.issues, []);
  const content = generatedContent(result);
  assert.match(content, /(?:globalThis\.)?waitGlobalInitialized\(\s*['"]Mvu['"]\s*\)/);
  assert.match(content, /Promise\.race\s*\(/);
  assert.match(content, /setTimeout\s*\(/);
  assert.match(content, /await[\s\S]{0,180}(?:globalThis\.)?waitGlobalInitialized/);
});

test('current_message render reads the historical message id supplied by ST-Prompt-Template', async () => {
  const result = compile({ snapshotSelector: 'current_message', ejsTarget: 'render' });
  assert.deepEqual(result.issues, []);
  const targets = [];
  const output = await renderGeneratedEjs(generatedContent(result), {
    message_id: 6,
    waitGlobalInitialized: async () => undefined,
    Mvu: {
      getMvuData(target) {
        targets.push(structuredClone(target));
        return { stat_data: { relationship: { trust: 75 } } };
      },
    },
  });

  assert.deepEqual(targets, [{ type: 'message', message_id: 6 }]);
  assert.match(output, /TRUSTED/);
});

test('current_message generation explicitly falls back to latest when no message id exists', async () => {
  const result = compile({ snapshotSelector: 'current_message', ejsTarget: 'prompt' });
  assert.deepEqual(result.issues, []);
  const targets = [];
  await renderGeneratedEjs(generatedContent(result), {
    waitGlobalInitialized: async () => undefined,
    Mvu: {
      getMvuData(target) {
        targets.push(structuredClone(target));
        return { stat_data: { relationship: { trust: 75 } } };
      },
    },
  });

  assert.deepEqual(targets, [{ type: 'message', message_id: 'latest' }]);
});

test('an available Mvu host with missing stat_data/path emits the EJS fallback branch', async () => {
  const result = compile();
  assert.deepEqual(result.issues, []);
  const output = await renderGeneratedEjs(generatedContent(result), {
    waitGlobalInitialized: async () => undefined,
    Mvu: { getMvuData: () => ({}) },
    getvar: () => 10,
  });
  assert.match(output, /FALLBACK/);
  assert.doesNotMatch(output, /TRUSTED|GUARDED/);
});

test('EJS-only templates retain exact getvar path reads without requiring Mvu', async () => {
  const result = compile({ mvuEnabled: false, ejsEnabled: true });
  assert.deepEqual(result.issues, []);
  const calls = [];
  const output = await renderGeneratedEjs(generatedContent(result), {
    getvar: (path, options) => {
      calls.push({ path, options });
      return 75;
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'stat_data.relationship.trust');
  assert.equal(calls[0].options?.defaults, 10);
  assert.match(output, /TRUSTED/);
});
