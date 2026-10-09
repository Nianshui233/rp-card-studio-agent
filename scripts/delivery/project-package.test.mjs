import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureProjectFolders, DELIVERY_MANIFEST, STATE_DIR } from '../project-layout.mjs';
import { validateDeliveryLayout } from './project-package.mjs';
import { validateActiveRouteFile } from './active-route.mjs';
function fixture(t) {
  const root = ensureProjectFolders(fs.mkdtempSync(path.join(os.tmpdir(), 'rp-delivery-')));
  t.after(() => { assert.equal(fs.realpathSync(path.dirname(root)), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(root).startsWith('rp-delivery-')); fs.rmSync(root, { recursive: true, force: true }); });
  const write = (file, value) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value)); };
  const manifest = { schema: 'rp-card-studio/active-route/v1', activeRoute: 'current', routes: { current: { status: 'active', components: { card: { path: '角色卡.json', kind: 'character_card' } } } }, components: { card: { path: '角色卡.json', kind: 'character_card' } } };
  write('导入包/角色卡.json', { spec: 'chara_card_v3', spec_version: '3.0', data: { name: '场景' } });
  write('导入包/导入说明.txt', '导入角色卡。'); write(DELIVERY_MANIFEST, manifest);
  return { root, write, manifest };
}
test('delivery contains only current import files and one guide; manifest is in work', t => {
  const f = fixture(t); assert.equal(validateDeliveryLayout(f.root, { requireManifest: true }).ok, true);
  assert.equal(validateActiveRouteFile(path.join(f.root, DELIVERY_MANIFEST)).ok, true);
  assert.deepEqual(fs.readdirSync(path.join(f.root, '导入包')).sort(), ['导入说明.txt','角色卡.json'].sort());
});
test('raw HTML, source JS, Schema/config/record JSON cannot be mixed into delivery', t => {
  const f = fixture(t); f.write('导入包/page.html', '<html>源码</html>'); f.write('导入包/schema.js', 'export const Schema = 1;'); f.write('导入包/record.json', { schema: 'rp-card-studio/mvu-zod-build/v1' });
  const result = validateDeliveryLayout(f.root); assert.equal(result.ok, false); for (const name of ['page.html','schema.js','record.json']) assert.match(result.issues.join(' '), new RegExp(name.replace('.', '\\.')));
});
test('another import candidate and empty category folders are rejected', t => {
  const f = fixture(t); f.write('导入包/另一份角色卡.json', { spec: 'chara_card_v3', data: {} }); fs.mkdirSync(path.join(f.root, '导入包', '原始HTML'));
  const result = validateDeliveryLayout(f.root); assert.match(result.issues.join(' '), /清单以外/); assert.match(result.issues.join(' '), /空目录/);
});
test('moving old routes to history is not accepted as cleanup', t => {
  const f = fixture(t); f.manifest.routes.old = { status: 'superseded', components: { card: '制作文件/历史/旧卡.json' } }; f.write(DELIVERY_MANIFEST, f.manifest);
  assert.match(validateDeliveryLayout(f.root).issues.join(' '), /不保留 superseded/);
});
test('only declared resources actually referenced by import files can be nested', t => {
  const f = fixture(t); f.write('导入包/资源/背景.png', '资源内容'); f.write('导入包/角色卡.json', { spec: 'chara_card_v3', data: { image: '资源/背景.png' } });
  const asset = { path: '资源/背景.png', kind: 'runtime_asset', referencedBy: '角色卡.json' }; f.manifest.routes.current.components.background = asset; f.manifest.components.background = asset; f.write(DELIVERY_MANIFEST, f.manifest);
  assert.equal(validateDeliveryLayout(f.root).ok, true);
  f.write('导入包/角色卡.json', { spec: 'chara_card_v3', data: {} }); assert.match(validateDeliveryLayout(f.root).issues.join(' '), /实际引用/);
});
test('isolated import folder can be copied away without taking work records or source', t => {
  const f = fixture(t); f.write('制作文件/运行源码/说明.md', '只给制作者看');
  const isolated = path.join(f.root, '制作文件', '检查', '独立复制'); fs.mkdirSync(isolated, { recursive: true });
  for (const name of fs.readdirSync(path.join(f.root, '导入包'))) fs.copyFileSync(path.join(f.root, '导入包', name), path.join(isolated, name));
  assert.deepEqual(fs.readdirSync(isolated).sort(), ['导入说明.txt','角色卡.json'].sort());
  assert.equal(fs.existsSync(path.join(isolated, '项目记录')), false);
});
test('layout CLI checks actual two-folder package and returns nonzero on pollution', t => {
  const f = fixture(t); const cli = path.join(import.meta.dirname, 'deliverable-check.mjs');
  const run = () => spawnSync(process.execPath, [cli, 'layout', '--root', f.root, '--final'], { encoding: 'utf8', windowsHide: true });
  assert.equal(run().status, 0); f.write('导入包/检查.json', { status: 'passed' }); assert.equal(run().status, 1);
});

test('tool records cannot be relabeled as runtime assets even if a card mentions them', t => {
  const f = fixture(t); f.write('导入包/记录.json', { schema: 'rp-card-studio/production/v1' }); f.write('导入包/角色卡.json', { spec: 'chara_card_v3', data: { description: '记录.json' } });
  const item = { path: '记录.json', kind: 'runtime_asset', referencedBy: '角色卡.json' }; f.manifest.components.record = item; f.manifest.routes.current.components.record = item; f.write(DELIVERY_MANIFEST, f.manifest);
  assert.match(validateDeliveryLayout(f.root).issues.join(' '), /不能改标签/);
});
test('import package cannot use a link back into production files', t => {
  const f = fixture(t); const source = path.join(f.root, '制作文件', '资源'); fs.mkdirSync(source); fs.symlinkSync(source, path.join(f.root, '导入包', '资源'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(validateDeliveryLayout(f.root).issues.join(' '), /不能借链接/);
});
