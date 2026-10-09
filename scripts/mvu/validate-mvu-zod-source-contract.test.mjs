import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildMvuZodProject, validateMvuZodSourceContract } from './validate-mvu-zod-source-contract.mjs';
import { hash } from './mvu-source-tools.mjs';
import { createSourceFixture } from './source-contract-fixture.mjs';

const check = f => validateMvuZodSourceContract(f.contract, { root: f.root });
async function bad(f, pattern) { const result = await check(f); assert.equal(result.ok, false); assert.match(result.issues.join('\n'), pattern); }
test('real TS split sources build reproducibly and import exact ESM; runtime remains not_run', async t => {
  const f = await createSourceFixture(t); const first = f.read(f.contract.paths.importArtifact);
  await buildMvuZodProject(f.contract, { root: f.root });
  assert.equal(f.read(f.contract.paths.importArtifact), first);
  const r = await check(f); assert.equal(r.ok, true, r.issues.join('\n')); assert.equal(r.runtimeStatus, 'not_run'); assert.equal(r.evidenceLevel, 'offline_only');
  assert.equal(r.offline.fixtures[1].data.世界.时间, 7);
});
test('status strings and inline source cannot forge a build result', async () => {
  const r = await validateMvuZodSourceContract({ schema: 'rp-card-studio/mvu-zod-source-contract/v1', build: { status: 'passed' }, schemaSource: 'valid' });
  assert.equal(r.ok, false); assert.match(r.issues.join(' '), /root/);
});
test('edited schema/helper invalidates source hashes even when main registration is unchanged', async t => {
  const f = await createSourceFixture(t); f.write(f.contract.paths.schemaSource, f.read(f.contract.paths.schemaSource).replace('prefault(0)', 'prefault(4)'));
  await bad(f, /source hashes|漂移/);
});
test('invalid YAML and duplicate keys are rejected by a real YAML parser', async t => {
  const f = await createSourceFixture(t); f.write(f.contract.paths.initvar, '世界: [\n'); await bad(f, /YAML/);
  f.write(f.contract.paths.initvar, '世界: {}\n世界: {}'); await bad(f, /YAML/);
});
test('actual Schema rejects invalid initvar type/enum', async t => {
  const f = await createSourceFixture(t); f.write(f.contract.paths.initvar, '世界:\n  模式: 无效'); await bad(f, /baseline/);
});
test('fixtures assert actual prefault/coerce/transform results rather than just keys', async t => {
  const f = await createSourceFixture(t); const cases = JSON.parse(f.read(f.contract.paths.fixtures)); cases[0].output.世界.时间 = 99; f.write(f.contract.paths.fixtures, cases);
  await bad(f, /转换\/default/);
});
test('source paths cannot escape the project root', async t => {
  const f = await createSourceFixture(t); f.contract.paths.initvar = '../escape.yaml'; await bad(f, /越出/);
});
test('import content drift is caught even if attacker rewrites artifactHash', async t => {
  const f = await createSourceFixture(t); const artifact = JSON.parse(f.read(f.contract.paths.importArtifact)); artifact.scripts[1].content += '\n;'; f.write(f.contract.paths.importArtifact, artifact);
  const record = JSON.parse(f.read(f.contract.paths.buildRecord)); record.artifactHash = hash(f.read(f.contract.paths.importArtifact)); f.write(f.contract.paths.buildRecord, record);
  await bad(f, /导入脚本与重建内容不一致/);
});
test('forged build outputs must match deterministic recompile', async t => {
  const f = await createSourceFixture(t); const record = JSON.parse(f.read(f.contract.paths.buildRecord)); const output = record.outputs.registration;
  const invented = f.read(output.path) + '\nconsole.log(1);'; f.write(output.path, invented); output.sha256 = hash(invented); f.write(f.contract.paths.buildRecord, record);
  await bad(f, /重建输出漂移/);
});
test('disabled, duplicate and malformed final import scripts fail before delivery', async t => {
  const f = await createSourceFixture(t); const artifact = JSON.parse(f.read(f.contract.paths.importArtifact)); artifact.scripts[1].enabled = false; artifact.scripts.push({ type: 'script', id: 'broken', name: 'broken', content: 'const =' }); f.write(f.contract.paths.importArtifact, artifact);
  await bad(f, /未启用|语法错误/);
});
test('fake runtime pass flags/evidence names cannot satisfy host evidence gate', async t => {
  const f = await createSourceFixture(t); f.contract.runtime = { status: 'pass', evidence: ['loader_registered', 'schema_registered', 'message_readback'] }; await bad(f, /运行记录/);
});
test('runtime record must belong to exact import artifact and evidence hashes', async t => {
  const f = await createSourceFixture(t); f.write('验收/runtime.json', { artifactHash: '0'.repeat(64), host: { kind: 'sillytavern' } });
  f.contract.runtime = { status: 'pass', recordPath: '验收/runtime.json', recordHash: hash(f.read('验收/runtime.json')) }; await bad(f, /精确导入制品/);
});
test('tutorial Loader is allowed without inventing a mandatory commit/CDN failure', async t => {
  const f = await createSourceFixture(t); assert.equal((await check(f)).ok, true);
  f.contract.providers.versionPolicy = 'pinned'; await bad(f, /未锁定/);
});
test('readiness-created factory is evaluated using real Zod', async t => {
  const f = await createSourceFixture(t); f.write(f.contract.paths.schemaSource, f.read(f.contract.paths.schemaSource).replace('export const Schema = ', 'export function createSchema(z) { return ').replace(/;\s*$/, '; }'));
  f.write(f.contract.paths.registrationSource, "import { registerMvuSchema } from '" + f.contract.providers.zod + "';\nimport { createSchema } from '../schema';\n$(() => { const Schema = createSchema(z); registerMvuSchema(Schema); });");
  await buildMvuZodProject(f.contract, { root: f.root }); const r = await check(f); assert.equal(r.ok, true, r.issues.join('\n'));
});
test('broken registration syntax and source-overwrite paths stop a build', async t => {
  const f = await createSourceFixture(t); f.contract.paths.importArtifact = f.contract.paths.schemaSource;
  await assert.rejects(buildMvuZodProject(f.contract, { root: f.root }), /覆盖源码/);
  f.write(f.contract.paths.registrationSource, 'const ='); await bad(f, /Expected|Unexpected/);
});
test('full Greeting overrides are validated independently through Schema', async t => {
  const f = await createSourceFixture(t); f.write('创作源/开局2.yaml', '世界:\n  模式: 无效'); f.contract.greetings = [{ kind: 'full', path: '创作源/开局2.yaml' }]; await bad(f, /greeting/);
});
test('normal CLI builds and validates actual project; no host success claim', async t => {
  const f = await createSourceFixture(t); const cli = path.join(import.meta.dirname, 'mvu-zod-project.mjs');
  for (const command of ['build', 'validate']) { const r = spawnSync(process.execPath, [cli, command, '--root', f.root], { encoding: 'utf8', windowsHide: true }); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /not_run/); }
});

test('final worldbook cannot drift from canonical prompts and baseline', async t => {
  const f = await createSourceFixture(t); const book = JSON.parse(f.read(f.contract.paths.worldbookArtifact)); book.entries[1].content = '过时的变量列表'; f.write(f.contract.paths.worldbookArtifact, book);
  await bad(f, /世界书导入内容/);
});
test('current list cannot be narrative-only and final Greeting overrides cannot escape Zod', async t => {
  const f = await createSourceFixture(t); const book = JSON.parse(f.read(f.contract.paths.worldbookArtifact)); book.entries[1].comment = '[mvu_plot]变量列表'; f.write(f.contract.paths.worldbookArtifact, book);
  await bad(f, /更新模型/);
  f.write(f.contract.paths.cardArtifact, { data: { first_mes: '<initvar>世界:\n  模式: 无效</initvar>' } }); await bad(f, /greeting:card/);
});

test('auxiliary local schema dependencies are hashed, not just the entry source', async t => {
  const f = await createSourceFixture(t); f.write('创作源/time.ts', 'export const initialTime = 0;');
  f.write(f.contract.paths.schemaSource, "import { initialTime } from './time';\n" + f.read(f.contract.paths.schemaSource).replace('prefault(0)', 'prefault(initialTime)'));
  await buildMvuZodProject(f.contract, { root: f.root }); assert.equal((await check(f)).ok, true);
  f.write('创作源/time.ts', 'export const initialTime = 2;'); await bad(f, /hashes|漂移/);
});
test('cannot mark rolling branch refs as pinned', async t => {
  const f = await createSourceFixture(t); f.contract.providers.versionPolicy = 'pinned';
  f.contract.providers.loader = f.contract.providers.loader.replace('MagVarUpdate/', 'MagVarUpdate@main/');
  f.write(f.contract.paths.loaderSource, "import '" + f.contract.providers.loader + "';"); await bad(f, /未锁定/);
});
test('runtime binding includes worldbook/card inputs, not just an unchanged ScriptFolder', async t => {
  const f = await createSourceFixture(t); const build = JSON.parse(f.read(f.contract.paths.buildRecord));
  f.write('验收/runtime.json', { artifactHash: build.artifactHash, sourceHashes: {} });
  f.contract.runtime = { status: 'pass', recordPath: '验收/runtime.json', recordHash: hash(f.read('验收/runtime.json')) };
  await bad(f, /输入已经变化/);
});
test('package CLI binds the exact requested card, worldbook and ScriptFolder', async t => {
  const f = await createSourceFixture(t); f.write('导入/不同角色卡.json', { data: { first_mes: '不同开局' } });
  const cli = path.join(import.meta.dirname, '..', 'validate-rolecard-package.mjs');
  const result = spawnSync(process.execPath, [cli, '--root', f.root, '--card', '导入/不同角色卡.json', '--worldbook', f.contract.paths.worldbookArtifact, '--script-folder', f.contract.paths.importArtifact, '--mvu-source-contract', '.rp-card/mvu-source-contract.json'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1); assert.match(result.stdout + result.stderr, /角色卡 与 sourceContract 精确制品不一致/);
});

test('output-format commands are checked, not only matched for JSONPatch tags', async t => {
  const f = await createSourceFixture(t); const invalid = '<UpdateVariable><JSONPatch>[{"op":"delta","path":"/世界/时间","value":"7"}]</JSONPatch></UpdateVariable>';
  f.write(f.contract.paths.outputFormat, invalid); const book = JSON.parse(f.read(f.contract.paths.worldbookArtifact)); book.entries[4].content = invalid; f.write(f.contract.paths.worldbookArtifact, book);
  await bad(f, /delta value 必须是 number/);
});

test('Greeting-only full initialization does not force a separate worldbook baseline', async t => {
  const f = await createSourceFixture(t); const book = JSON.parse(f.read(f.contract.paths.worldbookArtifact)); delete book.entries[0]; f.write(f.contract.paths.worldbookArtifact, book);
  f.contract.worldbookBindings = f.contract.worldbookBindings.filter(b => b.entryId !== 0);
  f.write(f.contract.paths.cardArtifact, { data: { first_mes: '<initvar>\n' + f.read(f.contract.paths.initvar) + '</initvar>\n开局。' } });
  f.write(f.contract.paths.runtimeContract, f.read(f.contract.paths.runtimeContract).replace('init_strategy: worldbook', 'init_strategy: greeting'));
  const regex = JSON.parse(f.read(f.contract.paths.regexArtifact)); regex.push({ id: 'hide-init', findRegex: '/<initvar>[\\s\\S]*?<\\/initvar>/g', replaceString: '', placement: [2], markdownOnly: true, runOnEdit: false }); f.write(f.contract.paths.regexArtifact, regex);
  await buildMvuZodProject(f.contract, { root: f.root }); const result = await check(f); assert.equal(result.ok, true, result.issues.join('\n'));
});
test('prompt responsibilities can merge without requiring fixed entry names', async t => {
  const f = await createSourceFixture(t); const book = JSON.parse(f.read(f.contract.paths.worldbookArtifact));
  book.entries[2].comment = '[mvu_update]状态变化合同'; book.entries[2].content += '\n' + book.entries[4].content; delete book.entries[4];
  f.contract.worldbookBindings.find(b => b.entryId === 2).sources.push('outputFormat'); f.contract.worldbookBindings = f.contract.worldbookBindings.filter(b => b.entryId !== 4); f.write(f.contract.paths.worldbookArtifact, book);
  await buildMvuZodProject(f.contract, { root: f.root }); assert.equal((await check(f)).ok, true);
});

test('package CLI automatically reuses validated canonical paths and passes a matching static package', async t => {
  const f = await createSourceFixture(t); const cli = path.join(import.meta.dirname, '..', 'validate-rolecard-package.mjs');
  const result = spawnSync(process.execPath, [cli, '--root', f.root, '--card', f.contract.paths.cardArtifact, '--mvu-source-contract', '.rp-card/mvu-source-contract.json'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr); assert.match(result.stdout, /static package checks passed/); assert.match(result.stdout, /does not perform SillyTavern/);
});

test('Loader defaults keep helper buttons enabled and rebuild preserves explicit script metadata', async t => {
  const f = await createSourceFixture(t); let artifact = JSON.parse(f.read(f.contract.paths.importArtifact)); assert.equal(artifact.scripts[0].button.enabled, true);
  f.contract.scriptNames = { loader: '项目框架', registration: '项目结构' }; f.contract.scriptMetadata = { loader: { button: { enabled: true, buttons: [{ name: '配置', visible: true }] }, info: '项目框架说明' } };
  await buildMvuZodProject(f.contract, { root: f.root }); artifact = JSON.parse(f.read(f.contract.paths.importArtifact));
  assert.equal(artifact.scripts[0].name, '项目框架'); assert.equal(artifact.scripts[0].button.buttons[0].name, '配置'); assert.equal((await check(f)).ok, true);
});
