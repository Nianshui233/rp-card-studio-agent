import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, 'terminal.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script, 'terminal.html script missing');
let api;
const context = {
  console,
  __TH_PAYLOAD_TEST__: { skipBoot: true, register(value) { api = value; } },
};
vm.runInNewContext(script, context, { filename: 'terminal-inline.js' });
assert(api, 'parser test hook missing');

const wrap = (json, version = '1') => `<航站状态 v="${version}">\n${json}\n</航站状态>`;
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };

await test('valid payload', () => {
  const data = api.extractPayload(wrap('{"区域":"北栈桥","天气":"小雨","任务":"核对灯标","行动":[]}'));
  assert.equal(data.area, '北栈桥'); assert.equal(data.missing.length, 0);
});
await test('unicode termination escapes decode after JSON parse', () => {
  const data = api.extractPayload(wrap('{"区域":"北\\u003C栈桥\\u003E","天气":"小雨","任务":"核对\\u0026记录","行动":[]}'));
  assert.equal(data.area, '北<栈桥>'); assert.equal(data.task, '核对&记录');
});
await test('last complete payload wins', () => {
  const text = wrap('{"区域":"旧","天气":"旧","任务":"旧","行动":[]}') + '\n' + wrap('{"区域":"新","天气":"新","任务":"新","行动":[]}');
  assert.equal(api.extractPayload(text).area, '新');
});
await test('unsupported version rejects', () => {
  assert.throws(() => api.extractPayload(wrap('{"区域":"旧"}', '2')), /不支持的载荷版本/);
});
await test('malformed json rejects', () => {
  assert.throws(() => api.extractPayload(wrap('{"区域":}')), /JSON 解析失败/);
});
await test('missing required fields do not borrow old values', () => {
  const data = api.extractPayload(wrap('{"区域":"北栈桥","行动":[]}'));
  assert.deepEqual(Array.from(data.missing), ['天气', '任务']); assert.equal(data.weather, '未记录');
});
await test('invalid and excessive actions are dropped', () => {
  const actions = [{label:'可用',text:'行动'}, null, {label:'',text:'坏'}];
  for (let i = 0; i < 10; i += 1) actions.push({label:'动作'+i,text:'内容'+i});
  const data = api.normalizePayload({区域:'A',天气:'B',任务:'C',行动:actions});
  assert.equal(data.actions.length, 8); assert.equal(data.dropped, 5);
});
await test('duplicate json keys use documented last value', () => {
  const data = api.extractPayload(wrap('{"区域":"旧","区域":"新","天气":"雨","任务":"巡灯","行动":[]}'));
  assert.equal(data.area, '新');
});
await test('literal outer terminator fails safely', () => {
  const raw = '<航站状态 v="1">\n{"区域":"</航站状态>","天气":"雨","任务":"巡灯","行动":[]}\n</航站状态>';
  assert.throws(() => api.extractPayload(raw), /JSON 解析失败/);
});

const bridgeSource = fs.readFileSync(path.join(dir, 'input-bridge.js'), 'utf8');
let bridgeApi;
let slashCommand = '';
vm.runInNewContext(bridgeSource, {
  console,
  triggerSlash: async command => { slashCommand = command; },
  initializeGlobal: (_name, value) => { bridgeApi = value; },
  addEventListener: () => {},
  window: { parent: {} },
  Event,
}, { filename: 'input-bridge.js' });
await test('slash pipeline and newline are escaped', async () => {
  await bridgeApi.setInput('前往|/危险命令\n检查\\路径');
  assert.equal(slashCommand, '/setinput 前往\\|/危险命令{{newline}}检查\\\\路径');
});

console.log(`payload contract tests: ${passed}/10`);
