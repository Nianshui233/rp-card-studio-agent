import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyMvuArtifacts,
  applySillyTavernRegexAdapter,
  applyTavernHelperAdapter,
} from '../scripts/rp-card-runtime.mjs';

const IDS = Object.freeze({
  prompt: '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d01',
  pending: '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d02',
  complete: '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d03',
  status: '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d04',
});
const PLACEHOLDER = '<StatusPlaceHolderImpl/>';

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

function runtimeSources({ mvu = true, ejs = false, status = true, statusMode = 'embedded' } = {}) {
  return emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: mvu,
          storage: {
            scope: 'message',
            namespace: 'stat_data',
            snapshot_selector: 'current_message',
          },
          variables: [{
            source_path: 'relationship.trust',
            runtime_path: 'stat_data.runtime.relationship_score',
            type: 'integer',
            default: 10,
            constraints: { minimum: 0, maximum: 100 },
            writer: { id: 'relationship_update', operations: ['set'] },
            readers: ['status_ui'],
            visibility: 'player',
          }],
          initialization: { defaults: { relationship: { trust: 10 } } },
          update_rules: [],
          routing: { entries: [] },
        },
        ejs: { enabled: ejs, entries: [] },
        runtime_contract: {
          adapter: {
            id: 'tavern_helper',
            version: '1.0.0',
            delivery: 'embedded',
            entrypoint: 'rp_card_studio_runtime_guard',
            readiness_probe: 'globalThis.Mvu',
            timeout_ms: 10000,
            fallback: 'Keep the last legal state.',
          },
          dependencies: [],
        },
      },
    }],
    ui: status ? [{
      relativePath: 'src/ui/status-ui.yaml',
      value: {
        status_ui: {
          enabled: true,
          mode: statusMode,
          read_only: true,
          refresh: 'on_message',
          text_template: 'Trust: {{relationship.trust}}',
          sections: [{
            id: 'relationship',
            display_name: 'Relationship',
            priority: 0,
            collapsed: false,
            fields: [{
              id: 'trust',
              source_path: 'relationship.trust',
              label: 'Trust',
              format: 'integer',
              missing_value: 'Unknown',
              visibility: 'player',
            }],
          }],
          commands: [],
          states: { degraded: 'Unavailable' },
          responsive: { narrow: 'compact_list', wide: 'grouped_columns' },
          visual: { hierarchy: ['relationship'] },
          accessibility: { keyboard: true, live_updates: 'polite', color_independent: true },
          delivery: {
            level: 'embedded',
            adapter: 'sillytavern_regex',
            surface: 'message',
            entrypoint: 'generated',
            artifact: 'inline',
            placeholder: PLACEHOLDER,
          },
        },
      },
    }] : [],
  });
}

function cardPayload(regexScripts) {
  return {
    data: {
      first_mes: `Opening.\n${PLACEHOLDER}\n${PLACEHOLDER}`,
      alternate_greetings: [
        `Alternate A. ${PLACEHOLDER}`,
        'Alternate B.',
      ],
      post_history_instructions: 'Existing instructions.',
      extensions: regexScripts === undefined ? {} : { regex_scripts: regexScripts },
    },
  };
}

function applyRegex({
  payload = cardPayload(),
  sources = runtimeSources(),
  mvu = true,
  status = true,
  target = 'character',
} = {}) {
  return applySillyTavernRegexAdapter(payload, {
    project: { features: { mvu, ejs: false, status_ui: status } },
    sources,
    target,
  });
}

function regexFromLiteral(literal) {
  const match = /^\/(.*)\/([a-z]*)$/s.exec(literal);
  assert.ok(match, `invalid regex literal: ${literal}`);
  return new RegExp(match[1], match[2]);
}

function simulateSillyTavernReplacement(script, rawString) {
  const findRegex = regexFromLiteral(script.findRegex);
  return rawString.replace(findRegex, function (match) {
    const args = [...arguments];
    const replaceString = script.replaceString.replace(/{{match}}/gi, '$0');
    return replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_token, num, groupName) => {
      const captured = num ? args[Number(num)] : args.at(-1)?.[groupName];
      return captured || '';
    });
  });
}

test('MVU emits the exact SillyTavern prompt filter and two display folds in stable order', () => {
  const result = applyRegex({ status: false, sources: runtimeSources({ status: false }) });

  assert.deepEqual(result.issues, []);
  const scripts = result.payload.data.extensions.regex_scripts;
  assert.deepEqual(scripts.map(script => script.id), [IDS.prompt, IDS.pending, IDS.complete]);
  assert.deepEqual(scripts[0], {
    id: IDS.prompt,
    scriptName: '[MVU] Filter variable updates from prompts',
    findRegex: '/<update(?:variable)?>[\\s\\S]*?(?:<\\/update(?:variable)?>|$)/gi',
    replaceString: '',
    trimStrings: [],
    placement: [1, 2],
    disabled: false,
    markdownOnly: false,
    promptOnly: true,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: 3,
  });
  for (const script of scripts.slice(1)) {
    assert.deepEqual(script.placement, [2]);
    assert.equal(script.markdownOnly, true);
    assert.equal(script.promptOnly, false);
    assert.equal(script.substituteRegex, 0);
  }
});

test('prompt filter removes multiple update blocks without swallowing prose between them', () => {
  const result = applyRegex({ status: false, sources: runtimeSources({ status: false }) });
  const filter = regexFromLiteral(result.payload.data.extensions.regex_scripts[0].findRegex);
  const message = 'Before <UpdateVariable>one</UpdateVariable> middle <update>two</update> after';

  assert.equal(message.replace(filter, ''), 'Before  middle  after');
});

test('pending update fold leaves the message status placeholder outside the folded block', () => {
  const result = applyRegex({ status: false, sources: runtimeSources({ status: false }) });
  const pending = result.payload.data.extensions.regex_scripts.find(script => script.id === IDS.pending);
  const rendered = `<UpdateVariable>\n<JSONPatch>[]</JSONPatch>\n${PLACEHOLDER}`
    .replace(regexFromLiteral(pending.findRegex), pending.replaceString);

  assert.match(rendered, /^<details[\s\S]*<\/details>\s*<StatusPlaceHolderImpl\/>$/);
  assert.equal((rendered.match(/<StatusPlaceHolderImpl\/>/g) ?? []).length, 1);
});

test('EJS-only and disabled runtime projects do not receive MVU regex scripts', () => {
  const ejsOnly = applyRegex({
    sources: runtimeSources({ mvu: false, ejs: true, status: false }),
    mvu: false,
    status: false,
  });
  const disabled = applyRegex({ sources: emptySources(), mvu: false, status: false });

  assert.equal(ejsOnly.payload.data.extensions.regex_scripts, undefined);
  assert.equal(disabled.payload.data.extensions.regex_scripts, undefined);
});

test('message status projection compiles full MVU paths and normalizes every opening placeholder', () => {
  const result = applyRegex();

  assert.deepEqual(result.issues, []);
  const scripts = result.payload.data.extensions.regex_scripts;
  assert.deepEqual(scripts.map(script => script.id), [IDS.prompt, IDS.pending, IDS.complete, IDS.status]);
  const status = scripts.at(-1);
  assert.deepEqual(status.placement, [2]);
  assert.equal(status.markdownOnly, true);
  assert.equal(status.promptOnly, false);
  assert.match(status.replaceString, /\{\{get_message_variable::stat_data\.runtime\.relationship_score\}\}/);
  assert.match(status.replaceString, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(status.replaceString, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,220px\),1fr\)\)/);
  assert.match(status.replaceString, /<details open[\s\S]*<dl[\s\S]*<dt[\s\S]*<dd/);
  assert.doesNotMatch(status.replaceString, /https?:\/\//);
  assert.doesNotMatch(status.replaceString, /<script|<iframe/i);
  assert.equal(result.payload.data.first_mes.match(/<StatusPlaceHolderImpl\/>/g)?.length, 1);
  assert.ok(result.payload.data.first_mes.endsWith(PLACEHOLDER));
  for (const greeting of result.payload.data.alternate_greetings) {
    assert.equal(greeting.match(/<StatusPlaceHolderImpl\/>/g)?.length, 1);
    assert.ok(greeting.endsWith(PLACEHOLDER));
  }
  assert.equal(result.payload.data.post_history_instructions.match(/RP Card Studio status placeholder contract/g)?.length, 1);
});

test('text mode emits a message-local text projection instead of HTML markup', () => {
  const result = applyRegex({ sources: runtimeSources({ statusMode: 'text' }) });
  const status = result.payload.data.extensions.regex_scripts.find(script => script.id === IDS.status);

  assert.equal(status.replaceString, 'Trust: {{get_message_variable::stat_data.runtime.relationship_score}}');
  assert.doesNotMatch(status.replaceString, /<div|<style|<script/i);
});

test('status projection preserves dollar amounts through the SillyTavern callback replacement algorithm', () => {
  const sources = runtimeSources({ statusMode: 'text' });
  sources.ui[0].value.status_ui.text_template = 'Fee: $5; total: $12; currency: $';
  const result = applyRegex({ sources });
  const status = result.payload.data.extensions.regex_scripts.find(script => script.id === IDS.status);

  const rendered = simulateSillyTavernReplacement(status, PLACEHOLDER);
  assert.equal(rendered, 'Fee: &#36;5; total: &#36;12; currency: &#36;');
  assert.equal(rendered.replaceAll('&#36;', '$'), 'Fee: $5; total: $12; currency: $');
});

test('message status projection uses native collapse state and only formats percent fields with a suffix', () => {
  const sources = runtimeSources();
  const ui = sources.ui[0].value.status_ui;
  ui.sections[0].collapsed = true;
  ui.sections[0].fields[0].format = 'percent';
  const result = applyRegex({ sources });
  const status = result.payload.data.extensions.regex_scripts.find(script => script.id === IDS.status);

  assert.match(status.replaceString, /<details style=/);
  assert.doesNotMatch(status.replaceString, /<details open/);
  assert.match(status.replaceString, /\{\{get_message_variable::stat_data\.runtime\.relationship_score\}\}%<\/dd>/);
});

test('reapplying the adapter is idempotent for scripts, placeholders, and reply contract', () => {
  const once = applyRegex();
  const twice = applyRegex({ payload: once.payload });

  assert.deepEqual(twice.issues, []);
  assert.deepEqual(twice.payload, once.payload);
});

test('a recognizable managed status rule refreshes when its generated template changes', () => {
  const initial = applyRegex();
  const sources = runtimeSources();
  sources.ui[0].value.status_ui.text_template = 'Updated trust: {{relationship.trust}}';
  const refreshed = applyRegex({ payload: initial.payload, sources });
  const statusRules = refreshed.payload.data.extensions.regex_scripts.filter(script => script.id === IDS.status);

  assert.deepEqual(refreshed.issues, []);
  assert.equal(statusRules.length, 1);
  assert.match(statusRules[0].replaceString, /Updated trust:/);
  assert.doesNotMatch(statusRules[0].replaceString, />Trust:/);
});

test('user regex scripts retain relative order before managed scripts', () => {
  const userA = { id: 'user-a', scriptName: 'User A' };
  const userB = { id: 'user-b', scriptName: 'User B' };
  const result = applyRegex({ payload: cardPayload([userA, userB]) });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.payload.data.extensions.regex_scripts.map(script => script.id), [
    'user-a', 'user-b', IDS.prompt, IDS.pending, IDS.complete, IDS.status,
  ]);
  assert.deepEqual(result.payload.data.extensions.regex_scripts[0], userA);
  assert.deepEqual(result.payload.data.extensions.regex_scripts[1], userB);
});

test('a managed id with different content blocks that rule without overwriting it', () => {
  const collision = { id: IDS.prompt, scriptName: 'User-owned collision' };
  const result = applyRegex({
    payload: cardPayload([collision]),
    status: false,
    sources: runtimeSources({ status: false }),
  });

  assert.ok(result.issues.some(issue => issue.rule === 'sillytavern_regex.id_collision'));
  assert.deepEqual(result.payload.data.extensions.regex_scripts[0], collision);
  assert.equal(result.payload.data.extensions.regex_scripts.some(script => (
    script.id === IDS.prompt && script.scriptName !== collision.scriptName
  )), false);
});

test('a non-array regex_scripts value blocks generation and is never overwritten', () => {
  const payload = cardPayload();
  payload.data.extensions.regex_scripts = { malformed: true };
  const result = applyRegex({ payload });

  assert.ok(result.issues.some(issue => issue.path === '/data/extensions/regex_scripts'));
  assert.deepEqual(result.payload.data.extensions.regex_scripts, { malformed: true });
});

test('status-disabled projects emit neither a projection rule nor placeholders', () => {
  const payload = cardPayload();
  payload.data.first_mes = 'Opening without status.';
  payload.data.alternate_greetings = ['Alternate without status.'];
  const result = applyRegex({ payload, status: false, sources: runtimeSources({ status: false }) });

  assert.equal(result.payload.data.extensions.regex_scripts.some(script => script.id === IDS.status), false);
  assert.equal(result.payload.data.first_mes, payload.data.first_mes);
  assert.deepEqual(result.payload.data.alternate_greetings, payload.data.alternate_greetings);
});

test('feature disablement removes only recognizable managed regexes and all status contracts', () => {
  const generated = applyRegex().payload;
  const userA = { id: 'user-a', scriptName: 'User A' };
  const userB = { id: 'user-b', scriptName: 'User B' };
  generated.data.extensions.regex_scripts.splice(0, 0, userA);
  generated.data.extensions.regex_scripts.splice(3, 0, userB);

  const statusOff = applyRegex({
    payload: generated,
    status: false,
    sources: runtimeSources({ status: false }),
  });
  assert.deepEqual(statusOff.issues, []);
  assert.deepEqual(statusOff.payload.data.extensions.regex_scripts.map(script => script.id), [
    'user-a', 'user-b', IDS.prompt, IDS.pending, IDS.complete,
  ]);
  assert.doesNotMatch(statusOff.payload.data.first_mes, /StatusPlaceHolderImpl/);
  assert.ok(statusOff.payload.data.alternate_greetings.every(greeting => !greeting.includes('StatusPlaceHolderImpl')));
  assert.doesNotMatch(statusOff.payload.data.post_history_instructions, /RP Card Studio status placeholder contract/);

  const mvuOff = applyRegex({
    payload: generated,
    mvu: false,
    sources: runtimeSources({ mvu: false }),
  });
  assert.deepEqual(mvuOff.issues, []);
  assert.deepEqual(mvuOff.payload.data.extensions.regex_scripts.map(script => script.id), [
    'user-a', 'user-b', IDS.status,
  ]);

  const allOff = applyRegex({
    payload: generated,
    mvu: false,
    status: false,
    sources: emptySources(),
  });
  assert.deepEqual(allOff.issues, []);
  assert.deepEqual(allOff.payload.data.extensions.regex_scripts, [userA, userB]);
  const allOffAgain = applyRegex({
    payload: allOff.payload,
    mvu: false,
    status: false,
    sources: emptySources(),
  });
  assert.deepEqual(allOffAgain.issues, []);
  assert.deepEqual(allOffAgain.payload, allOff.payload);
});

test('disabled features retain unrecognized user collisions with managed UUIDs', () => {
  const userPromptCollision = { id: IDS.prompt, scriptName: 'User prompt collision' };
  const userStatusCollision = { id: IDS.status, scriptName: 'User status collision' };
  const result = applyRegex({
    payload: cardPayload([userPromptCollision, userStatusCollision]),
    mvu: false,
    status: false,
    sources: emptySources(),
  });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.payload.data.extensions.regex_scripts, [userPromptCollision, userStatusCollision]);
});

test('MVU output contract orders narrative then update block then status placeholder', () => {
  const result = applyMvuArtifacts({
    data: {
      extensions: {},
      character_book: { entries: [] },
    },
  }, {
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources: runtimeSources(),
    target: 'character',
  });
  const output = result.payload.data.character_book.entries.find(entry => entry.content.includes('<UpdateVariable>'));

  assert.ok(output);
  const narrativeIndex = output.content.indexOf('narrative');
  const updateIndex = output.content.indexOf('<UpdateVariable>');
  const placeholderIndex = output.content.lastIndexOf(PLACEHOLDER);
  assert.ok(narrativeIndex >= 0 && narrativeIndex < updateIndex);
  assert.ok(updateIndex < placeholderIndex);
  assert.ok(output.content.trimEnd().endsWith(PLACEHOLDER));
  assert.doesNotMatch(output.content, /End each reply that changes state with one update block/);
});

test('Tavern Helper retains only MVU dependency and guard scripts', () => {
  const sources = runtimeSources();
  const result = applyTavernHelperAdapter(cardPayload(), {
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources,
    target: 'character',
  });

  assert.deepEqual(result.issues, []);
  const scripts = result.payload.data.extensions.tavern_helper.scripts;
  assert.deepEqual(scripts.map(script => script.id), ['rp_card_studio_runtime_guard']);

  const reapplied = applyTavernHelperAdapter(result.payload, {
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources,
    target: 'character',
  });
  assert.deepEqual(reapplied.issues, []);
  assert.deepEqual(reapplied.payload, result.payload);
});

test('Tavern Helper removes the legacy parent-page status script even without generated scripts', () => {
  const userScript = { id: 'user-script', name: 'User script' };
  const legacyStatus = {
    id: 'rp_card_studio_status_ui',
    name: 'RP Card Studio Status UI',
    info: 'Read-only status UI; execution order is encoded by the stable script id',
    content: `const key = Symbol.for("rp_card_studio.status_ui");
const hostWindow = globalThis.parent;
hostWindow.document.getElementById("sheld");
hostWindow.document.getElementById("form_sheld");`,
  };
  const payload = cardPayload();
  payload.data.extensions.tavern_helper = {
    scripts: [userScript, legacyStatus],
    user_metadata: { retained: true },
  };
  const result = applyTavernHelperAdapter(payload, {
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources: emptySources(),
    target: 'character',
  });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.payload.data.extensions.tavern_helper.scripts, [userScript]);
  assert.deepEqual(result.payload.data.extensions.tavern_helper.user_metadata, { retained: true });
});

test('Tavern Helper preserves and reports a user script that only collides with the legacy id', () => {
  const userCollision = {
    id: 'rp_card_studio_status_ui',
    name: 'User custom status script',
    content: 'globalThis.userStatus = true;',
  };
  const payload = cardPayload();
  payload.data.extensions.tavern_helper = { scripts: [userCollision] };
  const result = applyTavernHelperAdapter(payload, {
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources: emptySources(),
    target: 'character',
  });

  assert.ok(result.issues.some(issue => issue.rule === 'adapter.script_collision'));
  assert.deepEqual(result.payload.data.extensions.tavern_helper.scripts, [userCollision]);
});

test('Tavern Helper removes recognized runtime guard and dependency scripts when MVU is disabled', () => {
  const sources = runtimeSources();
  sources.mvu[0].value.runtime_contract.dependencies = [{
    id: 'mvu',
    class: 'remote',
    delivery: 'https://example.test/mvu-v1.js',
    version: '1.0.0',
    load_order: 10,
    readiness_probe: 'globalThis.Mvu',
    timeout_ms: 10000,
    fallback: 'Keep the last legal state.',
  }];
  const enabled = applyTavernHelperAdapter(cardPayload(), {
    project: { features: { mvu: true, ejs: false, status_ui: false } },
    sources,
    target: 'character',
  });
  const userScript = { id: 'user-script', name: 'User script' };
  enabled.payload.data.extensions.tavern_helper.scripts.unshift(userScript);
  enabled.payload.data.extensions.tavern_helper.user_metadata = { retained: true };

  const disabled = applyTavernHelperAdapter(enabled.payload, {
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources,
    target: 'character',
  });
  assert.deepEqual(disabled.issues, []);
  assert.deepEqual(disabled.payload.data.extensions.tavern_helper.scripts, [userScript]);
  assert.deepEqual(disabled.payload.data.extensions.tavern_helper.user_metadata, { retained: true });
});

test('Tavern Helper refreshes recognized managed scripts when runtime configuration changes', () => {
  const initialSources = runtimeSources();
  initialSources.mvu[0].value.runtime_contract.dependencies = [{
    id: 'mvu',
    class: 'remote',
    delivery: 'https://example.test/mvu-v1.js',
    version: '1.0.0',
    load_order: 10,
    readiness_probe: 'globalThis.Mvu',
    timeout_ms: 10000,
    fallback: 'Keep the last legal state.',
  }];
  const initial = applyTavernHelperAdapter(cardPayload(), {
    project: { features: { mvu: true, ejs: false, status_ui: false } },
    sources: initialSources,
    target: 'character',
  });
  const initialGuard = initial.payload.data.extensions.tavern_helper.scripts.find(script => script.id === 'rp_card_studio_runtime_guard');

  const updatedSources = structuredClone(initialSources);
  updatedSources.mvu[0].value.runtime_contract.adapter.timeout_ms = 20000;
  updatedSources.mvu[0].value.runtime_contract.dependencies[0].delivery = 'https://example.test/mvu-v2.js';
  updatedSources.mvu[0].value.runtime_contract.dependencies[0].version = '2.0.0';
  const updated = applyTavernHelperAdapter(initial.payload, {
    project: { features: { mvu: true, ejs: false, status_ui: false } },
    sources: updatedSources,
    target: 'character',
  });

  assert.deepEqual(updated.issues, []);
  const scripts = updated.payload.data.extensions.tavern_helper.scripts;
  assert.deepEqual(scripts.map(script => script.id), [
    'rp_card_studio_dependency_mvu',
    'rp_card_studio_runtime_guard',
  ]);
  assert.match(scripts[0].content, /mvu-v2\.js/);
  assert.match(scripts[0].info, /2\.0\.0/);
  assert.notEqual(scripts[1].content, initialGuard.content);
});

test('Tavern Helper preserves and reports unrecognized current managed-id collisions', () => {
  const userGuard = {
    id: 'rp_card_studio_runtime_guard',
    name: 'User runtime guard',
    content: 'globalThis.userGuard = true;',
  };
  const userDependency = {
    id: 'rp_card_studio_dependency_mvu',
    name: 'User dependency',
    content: 'globalThis.userDependency = true;',
  };
  const payload = cardPayload();
  payload.data.extensions.tavern_helper = { scripts: [userGuard, userDependency] };
  const result = applyTavernHelperAdapter(payload, {
    project: { features: { mvu: false, ejs: false, status_ui: false } },
    sources: emptySources(),
    target: 'character',
  });

  assert.equal(result.issues.filter(issue => issue.rule === 'adapter.script_collision').length, 2);
  assert.deepEqual(result.payload.data.extensions.tavern_helper.scripts, [userGuard, userDependency]);
});

test('worldbook targets remain untouched', () => {
  const payload = { entries: {}, extensions: {} };
  const result = applyRegex({ payload, target: 'worldbook' });

  assert.equal(result.payload, payload);
  assert.deepEqual(result.issues, []);
});
