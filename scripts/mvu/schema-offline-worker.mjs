import vm from 'node:vm';
import { z } from 'zod';
import * as lodash from 'lodash-es';

// Separate bounded process: not Tavern Helper, not a simulation of provider registration or persistence.
try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { code, cases } = JSON.parse(input);
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, z, _: lodash, console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(code, context, { timeout: 3000 });
  const exported = module.exports;
  const Schema = exported.Schema || (typeof exported.createSchema === 'function' ? exported.createSchema(z) : null);
  if (!Schema || typeof Schema.safeParse !== 'function') throw new Error('canonical 模块必须导出 Schema 或 createSchema(z)');
  const results = cases.map(item => {
    const result = Schema.safeParse(item.input);
    return { name: item.name, expected: item.expected, success: result.success,
      ...(result.success ? { data: result.data } : { issues: result.error.issues }) };
  });
  const jsonSchema = z.toJSONSchema(Schema, { io: 'input', unrepresentable: 'any' });
  process.stdout.write(JSON.stringify({ ok: true, results, jsonSchema, zodVersion: [z.core.version.major, z.core.version.minor, z.core.version.patch].join('.') }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
