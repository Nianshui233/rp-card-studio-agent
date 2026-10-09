import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProductionProject, validateProductionManifest } from '../scripts/production/production-manifest.mjs';
import { initContinuation, validateContinuation } from '../scripts/continuation/continuation.mjs';
import { STATE_DIR, DELIVERY_DIR, WORK_DIR, validateProjectLayout } from '../scripts/project-layout.mjs';

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-layout-'));
  t.after(() => { assert.equal(fs.realpathSync(path.dirname(root)), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(root).startsWith('rp-layout-')); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
test('production init creates exactly two outer folders with source and control files inside work', t => {
  const root = project(t); const result = initProductionProject(root, { projectId: 'p', title: '项目' });
  assert.deepEqual(fs.readdirSync(root).sort(), [WORK_DIR, DELIVERY_DIR].sort());
  assert.equal(result.path, path.join(root, STATE_DIR, 'production.json'));
  assert.equal(validateProductionManifest(result.manifest, { root }).ok, true);
  assert.equal(validateProjectLayout(root).ok, true);
});
test('production and continuation share one project-record folder without overriding each other', t => {
  const root = project(t); initProductionProject(root, { projectId: 'p', title: '项目' });
  assert.equal(initContinuation(root, { projectId: 'p', title: '项目' }).ok, true);
  assert.equal(validateContinuation(root).ok, true);
  assert.deepEqual(fs.readdirSync(root).sort(), [WORK_DIR, DELIVERY_DIR].sort());
  assert.throws(() => initContinuation(root, { projectId: 'p', title: '项目' }), /拒绝覆盖/);
});
test('new initialization cannot silently abandon a legacy ledger or create a parallel authority', t => {
  const root = project(t); fs.mkdirSync(path.join(root, '.rp-card')); fs.writeFileSync(path.join(root, '.rp-card', 'authority.md'), '原有用户记录');
  assert.throws(() => initContinuation(root, { projectId: 'p', title: '项目' }), /先迁移|禁止另建/);
  assert.equal(fs.existsSync(path.join(root, STATE_DIR)), false);
  assert.equal(fs.readFileSync(path.join(root, '.rp-card', 'authority.md'), 'utf8'), '原有用户记录');
});
test('top-level stray files/third folders are rejected rather than hidden under a wrapper', t => {
  const root = project(t); initContinuation(root, { projectId: 'p', title: '项目' });
  fs.writeFileSync(path.join(root, 'README.md'), '散落说明'); fs.mkdirSync(path.join(root, '配置'));
  const result = validateProjectLayout(root); assert.equal(result.ok, false); assert.match(result.issues.join(' '), /README\.md/); assert.match(result.issues.join(' '), /配置/);
});
test('layout movement does not fabricate a user acceptance or delegation', t => {
  const root = project(t); initContinuation(root, { projectId: 'p', title: '项目' });
  const result = validateContinuation(root); assert.equal(result.ok, true); assert.deepEqual(result.stageLedger.userEvidence, []); assert.deepEqual(result.stageLedger.authorizations, []);
});
