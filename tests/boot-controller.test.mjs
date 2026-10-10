import test from 'node:test';
import assert from 'node:assert/strict';
import { createBootController } from '../shared/frontend/boot-controller.mjs';
const pause = n => new Promise(r => setTimeout(r, n));
test('delayed provider and snapshot wait until actual rendering succeeds and then stop', async () => {
  let attempts = 0, renders = 0; const states = [];
  const boot = createBootController({ intervalMs: 2, timeoutMs: 1000,
    attempt: async () => ++attempts === 1 ? { status: 'waiting_provider' } : attempts === 2 ? { status: 'waiting_snapshot' } : { status: 'ready', data: 7 },
    render: async data => { assert.equal(data, 7); renders++; }, onState: s => states.push(s.status) });
  assert.equal((await boot.start()).status, 'ready'); await pause(15);
  assert.equal(attempts, 3); assert.equal(renders, 1); assert(states.includes('waiting_snapshot')); assert(boot.state.lastSuccess);
});
test('success is not recorded before render; render errors are visible', async () => {
  const boot = createBootController({ attempt: () => ({ status: 'ready' }), render: () => { throw new Error('render failed'); } });
  assert.equal((await boot.start()).status, 'failed'); assert.equal(boot.state.lastSuccess, null);
});
test('hung provider still times out; timeout is not interpreted as empty game state', async () => {
  const boot = createBootController({ timeoutMs: 20, intervalMs: 2, attempt: () => new Promise(() => {}), render: () => {} });
  assert.equal((await boot.start()).status, 'timed_out'); assert.match(boot.state.error, /重试/);
});
test('stop fences late work and a retry replaces the previous generation', async () => {
  let release, attempts = 0, renders = 0;
  const boot = createBootController({ timeoutMs: 1000, intervalMs: 2, attempt: () => ++attempts === 1 ? new Promise(r => release = r) : { status: 'ready', data: 'new' }, render: () => { renders++; } });
  const old = boot.start(); assert.equal((await boot.retry()).status, 'ready'); release({ status: 'ready', data: 'old' }); await old; await pause(5); assert.equal(renders, 1);
  boot.stop(); assert.equal(boot.state.status, 'stopped'); assert(boot.state.lastSuccess);
});
test('multiple start calls share one active run and cleanup cancels scheduled attempts', async () => {
  let attempts = 0; const boot = createBootController({ timeoutMs: 1000, intervalMs: 2, attempt: () => { attempts++; return { status: 'waiting_provider' }; }, render: () => {} });
  const a = boot.start(), b = boot.start(); assert.equal(a, b); boot.stop(); await a; const count = attempts; await pause(10); assert.equal(attempts, count);
});
