import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import * as runtime from '../scripts/rp-card-runtime.mjs';

const {
  applyTavernHelperAdapter,
  selectOpeningMessages,
} = runtime;

const MVU_TARGET = { type: 'message', message_id: 'latest' };
const MVU_VERSION = 'v0.179.0';
const MVU_IMPORT_URL = `https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@${MVU_VERSION}/artifact/bundle.js`;
const MVU_SCHEMA_VERSION = 'v0.3.449';
const MVU_SCHEMA_IMPORT_URL = `https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@${MVU_SCHEMA_VERSION}/dist/util/mvu_zod.js`;

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

function runtimeVariables() {
  return [
    {
      source_path: 'relationship.trust',
      runtime_path: 'stat_data.relationship.trust',
      type: 'integer',
      default: 10,
      constraints: { minimum: 0, maximum: 100 },
      writer: { kind: 'update_model', id: 'relationship_update', operations: ['set', 'add', 'subtract'] },
      readers: ['plot_model', 'update_model', 'status_ui', 'script'],
      renderer: 'status_ui.relationship_trust',
      cleanup: 'retain',
      migration: 'clamp_to_current_range',
      visibility: 'player',
    },
    {
      source_path: 'relationship.mood',
      runtime_path: 'stat_data.relationship.mood',
      type: 'enum',
      default: 'calm',
      constraints: { values: ['calm', 'angry'] },
      writer: { kind: 'update_model', id: 'relationship_update', operations: ['set'] },
      readers: ['plot_model', 'update_model', 'status_ui', 'script'],
      renderer: 'status_ui.relationship_mood',
      cleanup: 'retain',
      migration: 'use_default_if_invalid',
      visibility: 'player',
    },
  ];
}

function runtimeSources({
  mvuEnabled = true,
  ejsEnabled = false,
  adapterDelivery = 'embedded',
  dependencyClass = 'host_required',
  dependencyDelivery,
  snapshotSelector = 'latest_message',
} = {}) {
  const dependency = {
    id: 'mvu',
    class: dependencyClass,
    delivery: dependencyDelivery ?? (dependencyClass === 'remote'
      ? MVU_IMPORT_URL
      : 'Install and enable MVU in SillyTavern.'),
    version: dependencyClass === 'remote' ? '0.179.0' : 'host-managed',
    load_order: 10,
    readiness_probe: 'globalThis.Mvu',
    timeout_ms: 50,
    fallback: 'Keep the last legal state.',
  };
  return emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: mvuEnabled,
          implementation: 'tavern_helper_mvu',
          update_mode: mvuEnabled ? 'same_generation' : 'disabled',
          output_dialect: 'mvu_json_patch',
          storage: {
            scope: 'message',
            namespace: 'stat_data',
            snapshot_selector: snapshotSelector,
            merge_policy: 'scope_only',
          },
          protocol: {
            id: 'mvu_json_patch',
            version: '1.0.0',
            envelope: 'UpdateVariable',
            path_syntax: 'json_pointer',
            operations: ['replace', 'delta', 'insert', 'remove', 'move'],
            atomicity: 'batch',
            precondition: 'validate_before_commit',
            error_policy: 'reject_batch',
          },
          variables: runtimeVariables(),
          initialization: {
            defaults: { relationship: { trust: 10, mood: 'calm' } },
            opening_overrides: [],
            profiles: [
              {
                id: 'arrival',
                extends: null,
                strategy: 'complete_replace',
                values: { relationship: { trust: 25, mood: 'calm' } },
              },
              {
                id: 'crisis',
                extends: null,
                strategy: 'complete_replace',
                values: { relationship: { trust: 5, mood: 'angry' } },
              },
            ],
            opening_bindings: [],
          },
          update_rules: [{
            id: 'relationship_update',
            trigger: 'A witnessed action changes trust.',
            writer_id: 'relationship_update',
            reads: ['relationship.trust'],
            writes: [{ source_path: 'relationship.trust', operation: 'add', value: 1 }],
            failure: 'Keep the previous legal state.',
          }],
          routing: { entries: [] },
        },
        ejs: {
          enabled: ejsEnabled,
          entries: ejsEnabled ? [{
            id: 'trust_gate',
            source_ref: 'character:guide',
            complexity: 'section_branch',
            condition: 'stat_data.relationship.trust >= 50',
            reads: ['stat_data.relationship.trust'],
            target: 'prompt',
            fallback: 'Neutral fallback.',
          }] : [],
        },
        runtime_contract: {
          adapter: {
            id: 'tavern_helper',
            version: '1.0.0',
            delivery: adapterDelivery,
            entrypoint: 'rp_card_studio_runtime_guard',
            readiness_probe: 'globalThis.Mvu',
            timeout_ms: 50,
            fallback: 'Keep the last legal state.',
          },
          dependencies: [dependency],
          assumptions: [],
          fallbacks: ['Keep the last legal state.'],
        },
      },
    }],
  });
}

function characterPayload(entries = []) {
  return {
    data: {
      name: 'MVU host compatibility card',
      extensions: {},
      character_book: {
        name: 'Embedded MVU entries',
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

async function compileMvuArtifacts(options = {}) {
  assert.equal(
    typeof runtime.applyMvuArtifacts,
    'function',
    'rp-card-runtime.mjs must export applyMvuArtifacts',
  );
  return runtime.applyMvuArtifacts(options.payload ?? characterPayload(), {
    project: { features: { mvu: options.featureEnabled ?? true, ejs: false } },
    sources: options.sources ?? runtimeSources(),
    target: options.target ?? 'character',
  });
}

function guardResult(options = {}) {
  const sources = options.sources ?? runtimeSources(options);
  return applyTavernHelperAdapter(options.payload ?? characterPayload(), {
    project: {
      features: {
        mvu: options.mvuFeature ?? true,
        ejs: options.ejsFeature ?? false,
        status_ui: false,
      },
    },
    sources,
    target: 'character',
  });
}

function findGuard(result) {
  assert.deepEqual(result.issues, []);
  const scripts = result.payload.data.extensions.tavern_helper?.scripts ?? [];
  const guard = scripts.find(script => script.id === 'rp_card_studio_runtime_guard');
  assert.ok(guard, `runtime guard was not generated: ${JSON.stringify(scripts)}`);
  return { guard, scripts };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function mvuData(statData) {
  return {
    initialized_lorebooks: {},
    stat_data: structuredClone(statData),
  };
}

function extractInitvar(message) {
  const match = message.match(/<initvar>\s*([\s\S]*?)\s*<\/initvar>\s*$/);
  assert.ok(match, `opening does not end with an <initvar> block: ${message}`);
  return JSON.parse(match[1]);
}

function assertHostApiText(script) {
  assert.match(script, /waitGlobalInitialized\(\s*(['"])Mvu\1\s*\)/);
  assert.match(script, /Promise\.race\s*\(/);
  assert.match(script, /globalThis\.Mvu/);
  assert.match(script, /getMvuData\s*\(/);
  assert.match(script, /replaceMvuData\s*\(/);
  assert.match(script, /eventOn\s*\(/);
  assert.match(script, /eventRemoveListener\s*\(/);
  assert.match(script, /getCurrentCharacterName\s*\(/);
  assert.match(script, /onLifecycle\("pagehide"\)/);
  assert.match(script, /onLifecycle\("unload"\)/);
  assert.doesNotMatch(script, /parseAndCommit|parseMessage\s*\(/);
  assert.doesNotMatch(script, /getVariables\s*\(/);
  assert.doesNotMatch(script, /globalThis\.MVU/);
  assert.doesNotMatch(script, /mag_variable_/);
}

async function evaluateGuard(script, {
  initialData = mvuData({ relationship: { trust: 10, mood: 'calm' } }),
  exposeMvu = true,
  waitFailure = null,
  currentMessageId,
  currentCharacterName = 'MVU host compatibility card',
} = {}) {
  const eventNames = {
    VARIABLE_INITIALIZED: 'host:init',
    COMMAND_PARSED: 'host:parsed',
    VARIABLE_UPDATE_ENDED: 'host:update-ended',
    BEFORE_MESSAGE_UPDATE: 'host:before-message-update',
  };
  const tavernEvents = { CHAT_CHANGED: 'host:chat-changed' };
  const listeners = new Map();
  const lifecycleListeners = new Map();
  const onCalls = [];
  const removeCalls = [];
  const emitCalls = [];
  const waitCalls = [];
  const getCalls = [];
  const replaceCalls = [];
  const trace = [];
  const timers = new Set();
  let currentData = initialData;
  let activeCharacterName = currentCharacterName;

  const api = {
    events: eventNames,
    getMvuData(options) {
      trace.push('getMvuData');
      getCalls.push(plain(options));
      return currentData;
    },
    async replaceMvuData(nextData, options) {
      replaceCalls.push({ data: nextData, options: plain(options) });
      currentData = nextData;
    },
  };

  const setTrackedTimeout = (handler, delay, ...args) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      handler(...args);
    }, delay);
    timers.add(timer);
    return timer;
  };
  const clearTrackedTimeout = timer => {
    clearTimeout(timer);
    timers.delete(timer);
  };
  const setTrackedInterval = (handler, delay, ...args) => {
    const timer = setInterval(handler, delay, ...args);
    timers.add(timer);
    return timer;
  };
  const clearTrackedInterval = timer => {
    clearInterval(timer);
    timers.delete(timer);
  };

  const sandbox = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    dispatchEvent() {},
    structuredClone,
    setTimeout: setTrackedTimeout,
    clearTimeout: clearTrackedTimeout,
    setInterval: setTrackedInterval,
    clearInterval: clearTrackedInterval,
    getCurrentCharacterName() {
      return activeCharacterName;
    },
    addEventListener(eventName, handler) {
      const eventListeners = lifecycleListeners.get(eventName) ?? new Set();
      eventListeners.add(handler);
      lifecycleListeners.set(eventName, eventListeners);
    },
    removeEventListener(eventName, handler) {
      lifecycleListeners.get(eventName)?.delete(handler);
    },
    tavern_events: tavernEvents,
    async waitGlobalInitialized(name) {
      waitCalls.push(name);
      if (waitFailure) throw waitFailure;
    },
    eventOn(eventName, handler) {
      trace.push(`eventOn:${eventName}`);
      onCalls.push({ eventName, handler });
      const eventListeners = listeners.get(eventName) ?? new Set();
      eventListeners.add(handler);
      listeners.set(eventName, eventListeners);
      return { stop: () => eventListeners.delete(handler) };
    },
    async eventEmit(eventName, ...args) {
      emitCalls.push({ eventName, args });
      for (const listener of [...listeners.get(eventName) ?? []]) await listener(...args);
    },
    eventRemoveListener(eventName, handler) {
      removeCalls.push({ eventName, handler });
      listeners.get(eventName)?.delete(handler);
    },
  };
  if (exposeMvu) sandbox.Mvu = api;
  if (currentMessageId !== undefined) sandbox.getCurrentMessageId = () => currentMessageId;

  const completion = vm.runInNewContext(script, sandbox, {
    filename: 'rp_card_studio_runtime_guard.js',
    timeout: 1000,
  });
  if (completion && typeof completion.then === 'function') await completion;
  await new Promise(resolve => setImmediate(resolve));

  const emit = async (eventName, ...args) => {
    await sandbox.eventEmit(eventName, ...args);
    await new Promise(resolve => setImmediate(resolve));
  };
  const emitLifecycle = async (eventName) => {
    for (const listener of [...lifecycleListeners.get(eventName) ?? []]) await listener();
    await new Promise(resolve => setImmediate(resolve));
  };
  const dispose = () => {
    vm.runInNewContext(
      'globalThis[Symbol.for("rp_card_studio.runtime_guard")]?.cleanup?.()',
      sandbox,
    );
    for (const timer of timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    timers.clear();
  };

  return {
    api,
    dispose,
    emit,
    emitLifecycle,
    eventNames,
    emitCalls,
    get currentData() { return currentData; },
    get handle() {
      return vm.runInNewContext(
        'globalThis[Symbol.for("rp_card_studio.runtime_guard")]',
        sandbox,
      );
    },
    getCalls,
    listeners,
    lifecycleListeners,
    onCalls,
    removeCalls,
    replaceCalls,
    sandbox,
    setCurrentCharacterName(value) { activeCharacterName = value; },
    tavernEvents,
    trace,
    waitCalls,
  };
}

test('MVU artifacts emit native initvar, update-rule, and output-format CharacterBook entries', async () => {
  const result = await compileMvuArtifacts();

  assert.deepEqual(result.issues, []);
  const entries = result.payload.data.character_book.entries;
  assert.ok(entries.every(entry => Number.isInteger(entry.id) && entry.id >= 0), 'MVU CharacterBook ids must be non-negative integers');
  assert.ok(entries.every(entry => entry.extensions?.rp_card_studio?.generated === true), 'MVU entries must be marked as generated');
  const bySourceKey = sourceKey => entries.find(entry => (
    entry.extensions?.rp_card_studio?.source_key === sourceKey
  ));
  const initvar = bySourceKey('mvu:initvar');
  assert.ok(initvar, `missing mvu:initvar entry: ${JSON.stringify(entries)}`);
  assert.equal(initvar.comment, '初始化变量（保持禁用）[initvar]');
  assert.equal(initvar.enabled, false);
  assert.equal(initvar.constant, true);
  assert.deepEqual(initvar.keys, []);
  assert.deepEqual(initvar.secondary_keys, []);
  assert.match(initvar.content, /["']?relationship["']?\s*:/);
  assert.match(initvar.content, /["']?trust["']?\s*:\s*10/);
  assert.match(initvar.content, /["']?mood["']?\s*:\s*["']?calm["']?/);

  const updateEntries = [bySourceKey('mvu:update_rules'), bySourceKey('mvu:update_format')];
  assert.ok(updateEntries.every(Boolean), `expected update rules and output format: ${JSON.stringify(entries)}`);
  assert.deepEqual(updateEntries.map(entry => entry.comment), ['变量更新规则', '回复输出格式']);
  assert.ok(updateEntries.every(entry => entry.enabled === true));
  assert.ok(updateEntries.every(entry => entry.constant === true));
  assert.ok(updateEntries.every(entry => Array.isArray(entry.keys) && entry.keys.length === 0));

  const rules = updateEntries.find(entry => !entry.content.includes('<UpdateVariable>'));
  const output = updateEntries.find(entry => entry.content.includes('<UpdateVariable>'));
  assert.ok(rules, 'missing mvu:update_rules entry');
  assert.match(rules.content, /relationship\.trust|relationship:\s*[\s\S]*trust/);
  assert.match(rules.content, /witnessed action changes trust/i);
  assert.ok(output, 'missing mvu:update_format entry');
  assert.match(output.content, /<UpdateVariable>/);
  assert.match(output.content, /<Analysis>/);
  assert.match(output.content, /<JSONPatch>/);
  assert.match(output.content, /<\/JSONPatch>/);
  assert.match(output.content, /<\/UpdateVariable>/);
  assert.match(output.content, /MVU appends the status placeholder at runtime/);
  assert.doesNotMatch(output.content, /<StatusPlaceHolderImpl\s*\/>/);
});

test('opening selection appends each resolved state as a machine-readable initvar block', () => {
  const openings = [{
    openings: [
      {
        id: 'arrival',
        is_default: true,
        visible_text: 'Arrival opening.',
        initial_state_ref: 'mvu_init:arrival',
      },
      {
        id: 'crisis',
        is_default: false,
        visible_text: 'Crisis alternate.',
        initial_state_ref: 'mvu_init:crisis',
      },
    ],
  }];
  const mvuSources = runtimeSources().mvu.map(source => source.value);

  const result = selectOpeningMessages(openings, mvuSources);

  assert.match(result.first, /^Arrival opening\.\s*<initvar>/);
  assert.deepEqual(extractInitvar(result.first), { relationship: { trust: 25, mood: 'calm' } });
  assert.equal(result.alternates.length, 1);
  assert.match(result.alternates[0], /^Crisis alternate\.\s*<initvar>/);
  assert.deepEqual(extractInitvar(result.alternates[0]), { relationship: { trust: 5, mood: 'angry' } });
});

test('runtime guard uses only the verified MVU globals, methods, and dynamic event constants', () => {
  const { guard } = findGuard(guardResult());

  assertHostApiText(guard.content);
  for (const eventName of [
    'VARIABLE_INITIALIZED',
    'COMMAND_PARSED',
    'VARIABLE_UPDATE_ENDED',
    'BEFORE_MESSAGE_UPDATE',
  ]) {
    assert.match(guard.content, new RegExp(`\\.events\\.${eventName}\\b`));
  }
});

test('runtime guard subscribes first and bootstraps an already initialized MVU snapshot', async () => {
  const { guard } = findGuard(guardResult());
  const harness = await evaluateGuard(guard.content);
  try {
    assert.equal(harness.handle.ready, true, 'an existing stat_data snapshot must make the guard ready');
    assert.deepEqual(harness.getCalls, [MVU_TARGET]);
    const firstRead = harness.trace.indexOf('getMvuData');
    assert.ok(firstRead > 0);
    assert.ok(
      harness.trace.slice(0, firstRead).filter(item => item.startsWith('eventOn:')).length === 5,
      `all MVU listeners must be installed before bootstrap: ${JSON.stringify(harness.trace)}`,
    );
    const emitted = new Set(harness.emitCalls.map(call => call.eventName));
    assert.ok(emitted.has('rp-card-runtime-ready'));
    assert.ok(emitted.has('rp-card-state-change'));
  } finally {
    harness.dispose();
  }
});

test('runtime guard persists repaired defaults when bootstrap finds an older partial snapshot', async () => {
  const initialData = mvuData({ relationship: { trust: 42 } });
  const { guard } = findGuard(guardResult());
  const harness = await evaluateGuard(guard.content, { initialData });
  try {
    assert.equal(harness.handle.ready, true);
    assert.equal(harness.replaceCalls.length, 1);
    assert.deepEqual(harness.replaceCalls[0].options, MVU_TARGET);
    assert.deepEqual(plain(harness.currentData.stat_data), {
      relationship: { trust: 42, mood: 'calm' },
    });
  } finally {
    harness.dispose();
  }
});

test('runtime guard honors a contextual current_message id and falls back to latest outside message frames', async () => {
  const { guard } = findGuard(guardResult({ snapshotSelector: 'current_message' }));
  const contextual = await evaluateGuard(guard.content, { currentMessageId: 9 });
  try {
    assert.deepEqual(contextual.getCalls, [{ type: 'message', message_id: 9 }]);
  } finally {
    contextual.dispose();
  }

  const fallback = await evaluateGuard(guard.content);
  try {
    assert.deepEqual(fallback.getCalls, [MVU_TARGET]);
  } finally {
    fallback.dispose();
  }
});

test('runtime guard initializes missing defaults through the host initialization event', async () => {
  const { guard } = findGuard(guardResult());
  assertHostApiText(guard.content);
  const harness = await evaluateGuard(guard.content);
  try {
    assert.deepEqual(harness.waitCalls, ['Mvu']);
    const variables = mvuData({ relationship: { trust: 42 } });

    await harness.emit(harness.eventNames.VARIABLE_INITIALIZED, variables, 0);

    assert.deepEqual(plain(variables.stat_data), {
      relationship: { trust: 42, mood: 'calm' },
    });
    assert.equal(harness.replaceCalls.length, 0, 'initialization events must not double-write host state');
  } finally {
    harness.dispose();
  }
});

test('runtime guard rolls an invalid host update back as one atomic batch', async () => {
  const { guard } = findGuard(guardResult());
  assertHostApiText(guard.content);
  const harness = await evaluateGuard(guard.content);
  try {
    const before = mvuData({ relationship: { trust: 30, mood: 'calm' } });
    const candidate = mvuData({ relationship: { trust: 101, mood: 'angry' } });

    await harness.emit(harness.eventNames.VARIABLE_UPDATE_ENDED, candidate, before);

    assert.deepEqual(plain(candidate), plain(before));
    assert.equal(harness.replaceCalls.length, 0, 'host events must not call replaceMvuData');
  } finally {
    harness.dispose();
  }
});

test('runtime guard cleanup removes every listener with the original dynamic event and handler', async () => {
  const { guard } = findGuard(guardResult());
  assertHostApiText(guard.content);
  const harness = await evaluateGuard(guard.content);
  try {
    assert.deepEqual(
      new Set(harness.onCalls.map(call => call.eventName)),
      new Set([...Object.values(harness.eventNames), harness.tavernEvents.CHAT_CHANGED]),
    );

    harness.handle.cleanup();

    assert.equal(harness.removeCalls.length, harness.onCalls.length);
    for (const subscription of harness.onCalls) {
      assert.ok(harness.removeCalls.some(removal => (
        removal.eventName === subscription.eventName && removal.handler === subscription.handler
      )));
    }
    assert.ok([...harness.listeners.values()].every(eventListeners => eventListeners.size === 0));
  } finally {
    harness.dispose();
  }
});

test('runtime guard cleans itself up when its script iframe unloads', async () => {
  const { guard } = findGuard(guardResult());
  const harness = await evaluateGuard(guard.content);
  try {
    assert.equal(harness.lifecycleListeners.get('pagehide')?.size, 1);
    assert.equal(harness.lifecycleListeners.get('unload')?.size, 1);

    await harness.emitLifecycle('pagehide');

    assert.equal(harness.handle, undefined);
    assert.ok([...harness.listeners.values()].every(eventListeners => eventListeners.size === 0));
    assert.ok([...harness.lifecycleListeners.values()].every(eventListeners => eventListeners.size === 0));
  } finally {
    harness.dispose();
  }
});

test('a stale guard cannot filter or roll back another character update', async () => {
  const { guard } = findGuard(guardResult());
  const harness = await evaluateGuard(guard.content);
  try {
    harness.setCurrentCharacterName('Another character');
    await harness.emit(harness.tavernEvents.CHAT_CHANGED, 'another-chat');

    const before = mvuData({ other: { phase: 'arrival' } });
    const candidate = mvuData({ other: { phase: 'verification' } });
    await harness.emit(harness.eventNames.VARIABLE_UPDATE_ENDED, candidate, before);

    assert.deepEqual(plain(candidate), plain(mvuData({ other: { phase: 'verification' } })));
    assert.equal(harness.handle, undefined);
    assert.ok([...harness.listeners.values()].every(eventListeners => eventListeners.size === 0));
  } finally {
    harness.dispose();
  }
});

test('missing MVU host dependency degrades without inventing global stat_data', async () => {
  const { guard } = findGuard(guardResult());
  assertHostApiText(guard.content);
  const harness = await evaluateGuard(guard.content, { exposeMvu: false });
  try {
    assert.deepEqual(harness.waitCalls, ['Mvu']);
    assert.equal(Object.hasOwn(harness.sandbox, 'stat_data'), false);
    assert.equal(harness.getCalls.length, 0);
    assert.equal(harness.replaceCalls.length, 0);
  } finally {
    harness.dispose();
  }
});

test('EJS-only projects never receive an MVU runtime guard', () => {
  const sources = runtimeSources({ mvuEnabled: false, ejsEnabled: true });
  const result = guardResult({
    sources,
    mvuFeature: false,
    ejsFeature: true,
  });

  assert.deepEqual(result.issues, []);
  const scripts = result.payload.data.extensions.tavern_helper?.scripts ?? [];
  assert.equal(scripts.some(script => script.id === 'rp_card_studio_runtime_guard'), false);
});

test('remote MVU dependency emits one pinned import script before the runtime guard', () => {
  const result = guardResult({ dependencyClass: 'remote', dependencyDelivery: MVU_IMPORT_URL });
  const { scripts } = findGuard(result);
  const imports = scripts.filter(script => /\bimport\s*(?:\(|['"])/.test(script.content));

  assert.equal(imports.length, 1, `unexpected import scripts: ${JSON.stringify(scripts)}`);
  assert.equal(imports[0].type, 'script');
  assert.equal(imports[0].enabled, true);
  assert.match(imports[0].content, /@v0\.179\.0\/artifact\/bundle\.js/);
  assert.doesNotMatch(imports[0].content, /@(?:master|main|latest)\b/);
  assert.equal(imports[0].content.match(/https?:\/\//g)?.length, 1);
  assert.ok(
    scripts.indexOf(imports[0]) < scripts.findIndex(script => script.id === 'rp_card_studio_runtime_guard'),
    'the pinned dependency import must load before the runtime guard',
  );
});

test('enabled MVU always emits a pinned engine, generated schema registrar, and guard', () => {
  const result = guardResult({ dependencyClass: 'host_required' });
  const { scripts } = findGuard(result);
  const byId = new Map(scripts.map(script => [script.id, script]));
  const engine = byId.get('rp_card_studio_00_mvu_runtime');
  const schema = byId.get('rp_card_studio_10_mvu_schema');
  const guard = byId.get('rp_card_studio_runtime_guard');

  assert.ok(engine, `missing embedded MVU engine: ${JSON.stringify(scripts)}`);
  assert.ok(schema, `missing generated MVU schema registrar: ${JSON.stringify(scripts)}`);
  assert.ok(guard);
  assert.equal(engine.content, `import ${JSON.stringify(MVU_IMPORT_URL)};`);
  assert.match(schema.content, new RegExp(MVU_SCHEMA_IMPORT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(schema.content, /registerMvuSchema\(Schema\)/);
  assert.match(schema.content, /relationship["']?\s*:\s*z\.object/);
  assert.match(schema.content, /trust["']?\s*:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(100\)/);
  assert.match(schema.content, /mood["']?\s*:\s*z\.enum\(\["calm","angry"\]\)/);
  assert.doesNotMatch(engine.content, /@(?:master|main|latest)\b/);
  assert.doesNotMatch(schema.content, /@(?:master|main|latest)\b/);
  assert.ok(scripts.indexOf(engine) < scripts.indexOf(schema));
  assert.ok(scripts.indexOf(schema) < scripts.indexOf(guard));
});

test('MVU prompt artifacts include current variables, update rules, and output format', async () => {
  const result = await compileMvuArtifacts();
  assert.deepEqual(result.issues, []);
  const entries = result.payload.data.character_book.entries;
  const byKind = new Map(entries.map(entry => [entry.extensions?.rp_card_studio?.kind, entry]));

  assert.ok(byKind.has('mvu_initvar'));
  assert.ok(byKind.has('mvu_variable_list'));
  assert.ok(byKind.has('mvu_update_rules'));
  assert.ok(byKind.has('mvu_update_format'));
  const current = byKind.get('mvu_variable_list');
  assert.equal(current.comment, '变量列表（当前状态）');
  assert.equal(current.extensions.depth, 1);
  assert.match(current.content, /format_message_variable::stat_data/);
  assert.match(current.content, /<status_current_variable>/);

  const format = byKind.get('mvu_update_format').content;
  assert.match(format, /\/relationship\/trust/);
  assert.doesNotMatch(format, /\/declared\/path/);
  assert.match(format, /Use only these operations: replace, delta, insert, remove, move/);
  assert.doesNotMatch(format, /Use only these operations:[^\n]*\badd\b/);
});

test('generated Tavern Helper scripts use the host schema and stable id ordering', () => {
  const result = guardResult({ dependencyClass: 'remote', dependencyDelivery: MVU_IMPORT_URL });
  const { scripts } = findGuard(result);
  const allowed = new Set([
    'type', 'enabled', 'name', 'id', 'content', 'info',
    'button', 'data', 'export_with',
  ]);
  for (const script of scripts) {
    assert.deepEqual(
      Object.keys(script).filter(key => !allowed.has(key)),
      [],
      `unknown Tavern Helper script fields would be discarded: ${JSON.stringify(script)}`,
    );
    assert.equal(script.type, 'script');
    assert.equal(typeof script.name, 'string');
    assert.equal(typeof script.info, 'string');
    assert.deepEqual(script.button, { enabled: true, buttons: [] });
    assert.deepEqual(script.data, {});
    assert.deepEqual(script.export_with, { data: true, button: true });
  }
  const ids = scripts.map(script => script.id);
  assert.deepEqual(ids, [...ids].sort(), 'host executes scripts by id; generated ids must encode order');
});
