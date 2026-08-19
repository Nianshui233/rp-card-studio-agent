import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterPath = path.join(repoRoot, 'assets', 'templates', 'ui-app', 'scripts', 'host-adapter.js');

async function loadHost({ parent = {}, windowOverrides = {} } = {}) {
  const listeners = new Map();
  const windowObject = {
    parent,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    ...windowOverrides,
  };
  const sandbox = {
    window: windowObject,
    setTimeout,
    clearTimeout,
    Promise,
    Event: class Event {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = Boolean(init.bubbles);
      }
    },
    document: undefined,
    navigator: undefined,
  };
  vm.runInNewContext(`${await readFile(adapterPath, 'utf8')}
;globalThis.__Host = Host;`, sandbox, { filename: adapterPath });
  return { Host: sandbox.__Host, listeners };
}

test('host adapter exposes the real runtime contract', async () => {
  const source = await readFile(adapterPath, 'utf8');
  for (const marker of ['waitGlobalInitialized', 'getVariables', 'getCurrentMessageId', 'triggerSlash', 'dispatchEvent', 'pagehide', 'formatAsTavernRegexedString']) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `missing ${marker}`);
  }
});

test('host adapter waits for MVU and reads the current message rather than hard-coded floor zero', async () => {
  const calls = [];
  const mvu = {
    getMvuData(options) {
      calls.push(options);
      return { stat_data: { 世界: { 时间: '雨夜' } } };
    },
  };
  const { Host } = await loadHost({
    parent: {
      getCurrentMessageId: () => 12,
      waitGlobalInitialized: async (name) => {
        assert.equal(name, 'Mvu');
        return mvu;
      },
    },
  });

  assert.deepEqual(await Host.readState(), { 世界: { 时间: '雨夜' } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ type: 'message', message_id: 12 }]);
});

test('host adapter falls back to Tavern Helper message variables for non-MVU cards', async () => {
  const calls = [];
  const { Host } = await loadHost({
    parent: {
      getCurrentMessageId: () => 7,
      getVariables: (options) => {
        calls.push(options);
        return { stat_data: { 地点: { 名称: '旧码头' } } };
      },
    },
  });

  assert.deepEqual(await Host.readState(), { 地点: { 名称: '旧码头' } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ type: 'message', message_id: 7 }]);
});

test('host adapter uses Tavern Helper setinput first', async () => {
  const calls = [];
  const { Host } = await loadHost({
    parent: {
      TavernHelper: {
        triggerSlash: async (command) => calls.push(command),
      },
      document: {
        getElementById: () => null,
      },
    },
  });

  const result = await Host.writeInput('我使用了钥匙');
  assert.equal(result.ok, true);
  assert.equal(result.route, 'tavern-helper-slash');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /setinput/);
});

test('host adapter dispatches input/change events on direct textarea fallback', async () => {
  const events = [];
  const input = {
    value: '',
    focus() {},
    dispatchEvent(event) { events.push(event.type); },
  };
  const { Host } = await loadHost({
    parent: {
      document: {
        getElementById: () => input,
      },
    },
  });

  const result = await Host.writeInput('测试输入');
  assert.equal(result.ok, true);
  assert.equal(result.route, 'textarea');
  assert.equal(input.value, '测试输入');
  assert.deepEqual(events, ['input', 'change']);
});

test('host adapter cleans event subscriptions on pagehide', async () => {
  const calls = [];
  const { Host, listeners } = await loadHost({
    parent: {
      eventOn: (event, listener) => {
        calls.push(['on', event, listener]);
        return () => calls.push(['off', event, listener]);
      },
    },
  });

  Host.on('message_updated', () => {});
  assert.equal(calls.filter(([type]) => type === 'on').length, 1);
  listeners.get('pagehide')();
  assert.equal(calls.filter(([type]) => type === 'off').length, 1);
});
