import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { applyTavernHelperAdapter } from '../scripts/rp-card-runtime.mjs';

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

function runtimeSources({
  scope = 'message',
  namespace = 'stat_data',
  snapshotSelector = 'latest_message',
  readOnly = true,
  commands = [],
  refresh = 'on_state_change',
} = {}) {
  return emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          storage: {
            scope,
            namespace,
            snapshot_selector: snapshotSelector,
            merge_policy: 'scope_only',
          },
          variables: [{
            source_path: 'relationship.trust',
            runtime_path: `${namespace}.relationship.trust`,
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
        ejs: { enabled: false, entries: [] },
        runtime_contract: {
          adapter: {
            id: 'tavern_helper',
            version: '1.0.0',
            delivery: 'embedded',
            entrypoint: 'rp_card_studio_runtime_guard',
            readiness_probe: 'globalThis.Mvu',
            timeout_ms: 50,
            fallback: 'Keep the last legal state.',
          },
          dependencies: [],
          assumptions: [],
          fallbacks: [],
        },
      },
    }],
    ui: [{
      relativePath: 'src/ui/status-ui.yaml',
      value: {
        status_ui: {
          enabled: true,
          mode: 'embedded',
          read_only: readOnly,
          refresh,
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
          commands,
          states: {
            loading: 'Loading',
            empty: 'Empty',
            error: 'Error',
            degraded: 'Unavailable',
          },
          responsive: { narrow: 'single_column', wide: 'grouped_columns' },
          visual: { density: 'compact', hierarchy: ['relationship'], motion: 'none' },
          accessibility: { keyboard: true, live_updates: 'polite', color_independent: true },
          delivery: {
            level: 'embedded',
            adapter: 'tavern_helper',
            entrypoint: 'generated',
            artifact: 'inline',
            mount_anchor: 'rp-card-status',
            lifecycle: {
              wait_for: [],
              cleanup: ['events', 'observers', 'timers', 'dom'],
              idempotent: true,
            },
          },
        },
      },
    }],
  });
}

function statusScript(options = {}) {
  const result = applyTavernHelperAdapter({ data: { extensions: {} } }, {
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources: runtimeSources(options),
    target: 'character',
  });
  assert.deepEqual(result.issues, []);
  const script = result.payload.data.extensions.tavern_helper?.scripts
    ?.find(candidate => candidate.id === 'rp_card_studio_status_ui');
  assert.ok(script, 'status UI script was not generated');
  return script.content;
}

function setConnected(node, isConnected) {
  node.isConnected = isConnected;
  for (const child of node.childNodes ?? []) setConnected(child, isConnected);
}

function fakeNode(tagName, realm) {
  const node = {
    tagName,
    realm,
    id: '',
    dataset: {},
    childNodes: [],
    parentNode: null,
    isConnected: false,
    _text: '',
    setAttribute() {},
    append(...children) {
      for (const child of children) {
        if (!child) continue;
        if (child.parentNode) child.parentNode.childNodes = child.parentNode.childNodes.filter(item => item !== child);
        child.parentNode = node;
        setConnected(child, node.isConnected);
        node.childNodes.push(child);
      }
    },
    appendChild(child) {
      node.append(child);
      return child;
    },
    insertBefore(child, reference) {
      const index = node.childNodes.indexOf(reference);
      if (index < 0) return node.appendChild(child);
      if (child.parentNode) child.parentNode.childNodes = child.parentNode.childNodes.filter(item => item !== child);
      child.parentNode = node;
      setConnected(child, node.isConnected);
      node.childNodes.splice(index, 0, child);
      return child;
    },
    replaceChildren(...children) {
      for (const child of node.childNodes) {
        child.parentNode = null;
        setConnected(child, false);
      }
      node.childNodes = [];
      node._text = '';
      node.append(...children);
    },
    remove() {
      setConnected(node, false);
      if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node);
      node.parentNode = null;
    },
    addEventListener() {},
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      return node._text + node.childNodes.map(child => child.textContent ?? '').join('');
    },
    set(value) {
      node._text = String(value ?? '');
      node.childNodes = [];
    },
  });
  return node;
}

function fakeDocument(realm, { withShell = false } = {}) {
  const nodesById = new Map();
  const html = fakeNode('html', realm);
  const body = fakeNode('body', realm);
  html.isConnected = true;
  html.append(body);
  const document = {
    realm,
    readyState: 'complete',
    body,
    documentElement: html,
    getElementById(id) {
      const node = nodesById.get(id);
      return node?.isConnected ? node : null;
    },
    createElement(tagName) {
      const node = fakeNode(tagName, realm);
      Object.defineProperty(node, 'id', {
        get: () => node._id ?? '',
        set: value => {
          node._id = String(value);
          nodesById.set(node._id, node);
        },
      });
      return node;
    },
  };
  let shell = null;
  let chat = null;
  let form = null;
  if (withShell) {
    shell = document.createElement('main');
    shell.id = 'sheld';
    chat = document.createElement('section');
    chat.id = 'chat';
    form = document.createElement('form');
    form.id = 'form_sheld';
    shell.append(chat, form);
    body.append(shell);
  }
  return { body, chat, document, form, html, shell };
}

async function runStatusScript(script, {
  exposeMvu = true,
  namespace = 'stat_data',
  state = { relationship: { trust: 77 } },
  waitNever = false,
  currentMessageId,
} = {}) {
  const events = new Map();
  const parentRealm = fakeDocument('parent', { withShell: true });
  const childRealm = fakeDocument('status-iframe');
  const getMvuDataCalls = [];
  const waitCalls = [];
  const onCalls = [];
  const removeCalls = [];
  const emitCalls = [];
  const observerRecords = [];
  const timers = new Set();
  const api = {
    events: {
      VARIABLE_INITIALIZED: 'host:init',
      VARIABLE_UPDATE_ENDED: 'host:update-ended',
      BEFORE_MESSAGE_UPDATE: 'host:before-message-update',
    },
    getMvuData(target) {
      getMvuDataCalls.push(JSON.parse(JSON.stringify(target)));
      return { [namespace]: state };
    },
  };
  class ParentMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      this.observed = null;
      observerRecords.push(this);
    }
    observe(target) {
      this.observed = target;
    }
    disconnect() {
      this.disconnected = true;
    }
    trigger() {
      this.callback([]);
    }
  }
  const parent = {
    document: parentRealm.document,
    MutationObserver: ParentMutationObserver,
  };
  const sandbox = {
    console,
    document: childRealm.document,
    parent,
    MutationObserver: class ChildMutationObserver {
      constructor() {
        throw new Error('status UI must observe the parent realm');
      }
    },
    addEventListener() {
      throw new Error('business events must use the shared Tavern Helper bus');
    },
    dispatchEvent() {
      throw new Error('business events must use the shared Tavern Helper bus');
    },
    setTimeout(handler, delay, ...args) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        handler(...args);
      }, delay);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      clearTimeout(timer);
      timers.delete(timer);
    },
    setInterval(handler, delay, ...args) {
      const timer = setInterval(handler, delay, ...args);
      timers.add(timer);
      return timer;
    },
    clearInterval(timer) {
      clearInterval(timer);
      timers.delete(timer);
    },
    async waitGlobalInitialized(name) {
      waitCalls.push(name);
      if (waitNever) return new Promise(() => {});
    },
    eventOn(eventName, handler) {
      onCalls.push({ eventName, handler });
      const listeners = events.get(eventName) ?? new Set();
      listeners.add(handler);
      events.set(eventName, listeners);
    },
    async eventEmit(eventName, ...args) {
      emitCalls.push({ eventName, args });
      for (const handler of [...events.get(eventName) ?? []]) await handler(...args);
    },
    eventRemoveListener(eventName, handler) {
      removeCalls.push({ eventName, handler });
      events.get(eventName)?.delete(handler);
    },
    tavern_events: {
      USER_MESSAGE_RENDERED: 'user_message_rendered',
      CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    },
  };
  if (exposeMvu) sandbox.Mvu = api;
  if (currentMessageId !== undefined) sandbox.getCurrentMessageId = () => currentMessageId;

  const completion = vm.runInNewContext(script, sandbox, { timeout: 1000 });
  if (completion && typeof completion.then === 'function') await completion;
  await new Promise(resolve => setImmediate(resolve));

  const handle = vm.runInNewContext(
    'globalThis[Symbol.for("rp_card_studio.status_ui")]',
    sandbox,
  );
  const emit = async (eventName, ...args) => {
    await sandbox.eventEmit(eventName, ...args);
    await new Promise(resolve => setImmediate(resolve));
  };
  const dispose = () => {
    handle?.cleanup?.();
    for (const timer of timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    timers.clear();
  };
  return {
    api,
    body: parentRealm.body,
    childBody: childRealm.body,
    dispose,
    document: parentRealm.document,
    emit,
    emitCalls,
    events,
    form: parentRealm.form,
    getMvuDataCalls,
    handle,
    observerRecords,
    onCalls,
    removeCalls,
    sandbox,
    shell: parentRealm.shell,
    timers,
    waitCalls,
  };
}

test('status UI reads the namespace root through Mvu.getMvuData and never uses legacy globals', () => {
  const script = statusScript();

  assert.match(script, /getMvuData\s*\(/);
  assert.match(script, /waitGlobalInitialized\s*\(/);
  assert.doesNotMatch(script, /getVariables\s*\(/);
  assert.doesNotMatch(script, /globalThis\.MVU/);
  assert.doesNotMatch(script, /globalThis\.stat_data/);
  assert.match(script, /"target":\{"type":"message","message_id":"latest"\}/);
});

test('status UI maps non-message storage scope to the same Mvu target contract', () => {
  const script = statusScript({ scope: 'chat' });

  assert.match(script, /"target":\{"type":"chat"\}/);
  assert.match(script, /getMvuData\s*\(/);
});

test('status UI mounts in the visible SillyTavern parent before form_sheld, never in its hidden iframe', async () => {
  const harness = await runStatusScript(statusScript());
  try {
    const anchor = harness.document.getElementById('rp-card-status');
    assert.ok(anchor, 'parent mount anchor was not created');
    assert.equal(anchor.realm, 'parent');
    assert.equal(anchor.parentNode, harness.shell);
    assert.deepEqual(
      harness.shell.childNodes.map(node => node.id),
      ['chat', 'rp-card-status', 'form_sheld'],
    );
    assert.equal(harness.childBody.childNodes.length, 0, 'hidden script iframe must remain empty');
    assert.equal(harness.observerRecords.length, 1);
    assert.equal(harness.observerRecords[0].observed, harness.document.documentElement);

    harness.handle.cleanup();
    assert.equal(harness.document.getElementById('rp-card-status'), null);
    assert.equal(harness.observerRecords[0].disconnected, true);
    assert.equal(harness.timers.size, 0);
    assert.doesNotThrow(() => harness.handle.cleanup());
  } finally {
    harness.dispose();
  }
});

test('a shared state event emitted from another iframe realm refreshes the parent UI', async () => {
  const state = { relationship: { trust: 77 } };
  const harness = await runStatusScript(statusScript(), { state });
  try {
    state.relationship.trust = 88;
    await vm.runInNewContext(
      'eventEmit("rp-card-state-change", { source: "runtime-iframe" })',
      { eventEmit: harness.sandbox.eventEmit },
    );
    await new Promise(resolve => setImmediate(resolve));
    assert.match(harness.body.textContent, /88/);
    assert.equal(harness.childBody.textContent, '');
  } finally {
    harness.dispose();
  }
});

test('on_message refresh listens to the real Tavern Helper rendered-message events', async () => {
  const state = { relationship: { trust: 77 } };
  const harness = await runStatusScript(statusScript({ refresh: 'on_message' }), { state });
  try {
    const subscribed = new Set(harness.onCalls.map(call => call.eventName));
    assert.ok(subscribed.has('user_message_rendered'));
    assert.ok(subscribed.has('character_message_rendered'));

    state.relationship.trust = 91;
    await vm.runInNewContext(
      'eventEmit("character_message_rendered", 12, "normal")',
      { eventEmit: harness.sandbox.eventEmit },
    );
    await new Promise(resolve => setImmediate(resolve));
    assert.match(harness.body.textContent, /91/);
  } finally {
    harness.dispose();
  }
});

test('current_message uses a numeric contextual id when available and otherwise falls back to latest', async () => {
  const script = statusScript({ snapshotSelector: 'current_message' });
  const contextual = await runStatusScript(script, { currentMessageId: 7 });
  try {
    assert.deepEqual(contextual.getMvuDataCalls, [{ type: 'message', message_id: 7 }]);
  } finally {
    contextual.dispose();
  }

  const fallback = await runStatusScript(script);
  try {
    assert.deepEqual(fallback.getMvuDataCalls, [{ type: 'message', message_id: 'latest' }]);
  } finally {
    fallback.dispose();
  }
});

test('runtime_event commands cross iframe realms with direct Tavern Helper event arguments', async () => {
  const command = {
    id: 'advance',
    label: 'Advance',
    channel: 'runtime_event',
    payload: 'rp-card-test-event',
    writer_id: 'advance_writer',
  };
  const harness = await runStatusScript(statusScript({ readOnly: false, commands: [command] }));
  let received = null;
  const externalRealm = {
    eventOn: harness.sandbox.eventOn,
  };
  vm.runInNewContext(
    'eventOn("rp-card-test-event", value => { globalThis.received = value; })',
    externalRealm,
  );
  try {
    await harness.handle.executeCommand(command);
    received = externalRealm.received;
    assert.equal(received.id, 'advance');
    assert.equal(received.writerId, 'advance_writer');
    assert.equal(received.detail, undefined, 'eventOn receives the direct argument, not CustomEvent.detail');
    const names = harness.emitCalls.map(call => call.eventName);
    assert.ok(names.indexOf('rp-card-ui-command') < names.indexOf('rp-card-test-event'));
    assert.ok(names.indexOf('rp-card-test-event') < names.indexOf('rp-card-ui-command-result'));
  } finally {
    harness.dispose();
  }
});

test('status UI reads the configured namespace instead of hard-coding stat_data', async () => {
  const namespace = 'project_state';
  const script = statusScript({ namespace });
  assert.match(script, /"namespace":"project_state"/);
  assert.match(script, /name === config\.namespace/);

  const harness = await runStatusScript(script, { namespace });
  try {
    assert.match(harness.body.textContent, /77/);
    assert.deepEqual(harness.getMvuDataCalls, [{ type: 'message', message_id: 'latest' }]);
  } finally {
    harness.dispose();
  }
});

test('status UI waits for Mvu, renders the returned stat_data namespace, and cleans host listeners', async () => {
  const state = { relationship: { trust: 77 } };
  const harness = await runStatusScript(statusScript(), { state });
  try {
    assert.deepEqual(harness.waitCalls, ['Mvu']);
    assert.deepEqual(harness.getMvuDataCalls, [{ type: 'message', message_id: 'latest' }]);
    assert.match(harness.body.textContent, /77/);

    const subscribed = new Set(harness.onCalls.map(call => call.eventName));
    assert.ok(subscribed.has(harness.api.events.VARIABLE_INITIALIZED));
    assert.ok(subscribed.has(harness.api.events.VARIABLE_UPDATE_ENDED));

    state.relationship.trust = 88;
    await harness.emit(harness.api.events.VARIABLE_UPDATE_ENDED, { stat_data: state });
    assert.match(harness.body.textContent, /88/);

    harness.handle.cleanup();
    assert.equal(harness.removeCalls.length, harness.onCalls.length);
    for (const subscription of harness.onCalls) {
      assert.ok(harness.removeCalls.some(removal => (
        removal.eventName === subscription.eventName && removal.handler === subscription.handler
      )));
    }
  } finally {
    harness.dispose();
  }
});

test('status UI degrades without Mvu and does not invent a global stat_data object', async () => {
  const harness = await runStatusScript(statusScript(), { exposeMvu: false });
  try {
    assert.deepEqual(harness.waitCalls, ['Mvu']);
    assert.equal(Object.hasOwn(harness.sandbox, 'stat_data'), false);
    assert.deepEqual(harness.getMvuDataCalls, []);
    assert.match(harness.body.textContent, /Unavailable|Loading/);
  } finally {
    harness.dispose();
  }
});

test('status UI times out cleanly when Mvu initialization never completes', async () => {
  const harness = await runStatusScript(statusScript(), { exposeMvu: false, waitNever: true });
  try {
    assert.deepEqual(harness.waitCalls, ['Mvu']);
    assert.deepEqual(harness.getMvuDataCalls, []);
    assert.equal(harness.onCalls.some(call => call.eventName.startsWith('host:')), false);
    assert.ok([...harness.events.values()].every(listeners => listeners.size === 0));
    assert.equal(Object.hasOwn(harness.sandbox, 'stat_data'), false);
    assert.match(harness.body.textContent, /Unavailable/);
  } finally {
    harness.dispose();
  }
});
