import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(skillRoot, 'tests', 'fixtures', 'mvu_zod-v0.3.449.js');
const expectedSha256 = '1e4c6a613ae310a03bfc8e87dd9749bb89efac321fe7afef7b0c6284526128f1';

function pinnedRegistrarHarness() {
  const original = readFileSync(fixturePath, 'utf8');
  const callbacks = new Map();
  const schema = { safeParse: value => ({ success: true, data: value }) };
  const ZodObject = class {};
  const lodash = {
    get(target, key, fallback) { return target?.[key] ?? fallback; },
    set(target, key, value) { target[key] = value; return target; },
    unset(target, key) { return delete target[key]; },
  };
  const context = vm.createContext({
    z: {
      z: {
        ZodObject,
        looseObject: value => value,
        object: () => schema,
        prettifyError: error => String(error),
      },
    },
    registerVariableSchema() {},
    eventOn(name, callback) { callbacks.set(name, callback); },
    _: lodash,
    $: () => ({ prop: () => false }),
    toastr: { warning() {}, error() {} },
    YAML: { parse: value => value },
    console: { info() {}, warn() {}, error() {} },
  });
  const executable = original
    .slice(original.indexOf('const r=z;'))
    .replace(/export\{n as registerMvuSchema\};/, 'globalThis.registerMvuSchema=n;')
    .replace(/\/\/# sourceMappingURL=.*$/m, '');
  vm.runInContext(executable, context);
  context.registerMvuSchema(() => schema);
  return { callbacks, original };
}

test('the vendored mvu_zod v0.3.449 fixture is byte-pinned', () => {
  const normalized = readFileSync(fixturePath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
  assert.equal(createHash('sha256').update(normalized, 'utf8').digest('hex'), expectedSha256);
});

test('the pinned registrar removes display_data and delta_data after every MVU update', () => {
  const { callbacks } = pinnedRegistrarHarness();
  const onUpdateEnded = callbacks.get('mag_variable_update_ended_for_zod');
  assert.equal(typeof onUpdateEnded, 'function');

  const state = {
    stat_data: { relationship: { trust: 42 } },
    display_data: { relationship: { trust: 5 } },
    delta_data: { relationship: { trust: 5 } },
  };
  onUpdateEnded(state);

  assert.deepEqual(state.stat_data, { relationship: { trust: 42 } });
  assert.equal(Object.hasOwn(state, 'display_data'), false);
  assert.equal(Object.hasOwn(state, 'delta_data'), false);
  assert.equal(state.schema, '没有用别管这个');
});
