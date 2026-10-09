import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initContinuation, renderProgressBoard, validateContinuation } from './continuation.mjs';
import { STAGES, createStageLedger, validateStageLedger } from './stage-ledger.mjs';
function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-continuation-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('rp-continuation-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  initContinuation(root, { projectId: 'demo', title: '示例项目' });
  return root;
}
function authority(root, fn) {
  const file = path.join(root, '制作文件/项目记录', 'authority.md');
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')), 'utf8');
}
function ledger(root, fn) {
  authority(root, text => text.replace(/(## 阶段账本\s*\n\x60{3}json\s*\n)([\s\S]*?)(\n\x60{3})/, (_, prefix, data, suffix) => {
    const value = JSON.parse(data); fn(value); return prefix + JSON.stringify(value, null, 2) + suffix;
  }));
}
function character() {
  const value = createStageLedger();
  value.stages.find(row => row.id === 'preflight').progress = 'not_started';
  const row = value.stages.find(row => row.id === 'character');
  Object.assign(row, { progress: 'in_progress', entryEvidence: 'USR-1' });
  value.userEvidence.push({ id: 'USR-1', role: 'user', stage: 'character', action: 'delegate', locator: 'chat:example#user-1', quote: '角色阶段放权给你。', targets: ['character', 'AUTH-1'] });
  value.authorizations.push({ id: 'AUTH-1', stage: 'character', mode: 'stage_delegation', status: 'active', userEvidence: 'USR-1', scope: ['角色细化'], exclusions: ['新增玩法系统'], expires: 'stage_handoff' });
  return value;
}
test('initializes v2 with every routed stage and no fabricated user authorization', t => {
  const root = project(t); const result = validateContinuation(root);
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.metadata.schema, 'rp-card-studio/authority/v2');
  assert.deepEqual(result.stageLedger.stages.map(row => row.id), STAGES);
  assert.deepEqual(result.stageLedger.authorizations, []);
  assert.equal(result.sourceAuthenticity, 'not_verified');
});
test('rejects missing NEXT sections', t => {
  const root = project(t); const file = path.join(root, '制作文件/项目记录', 'NEXT.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## 下一道门', '## 已删除'));
  assert.match(validateContinuation(root).issues.join('\n'), /NEXT\.md 缺少区块：下一道门/);
});
test('rejects prose self-confirmation even when explanatory text mentions evidence', t => {
  const root = project(t);
  authority(root, text => text.replace('## 已确认创作事实\n\n- 暂无。', '## 已确认创作事实\n\n- 用户已确认：新增永久死亡。'));
  const result = validateContinuation(root);
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /已确认创作事实.*决定记录/);
});
test('rejects per-decision missing user evidence', () => {
  const value = character();
  value.decisions.push({ id: 'DEC-1', stage: 'character', text: '三名核心角色', sourceKind: 'user_confirmed', userEvidence: 'missing' });
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /决定 DEC-1.*有效用户依据/);
});
test('rejects a user-confirmed decision backed only by stage delegation', () => {
  const value = character();
  value.decisions.push({ id: 'DEC-1', stage: 'character', text: '三名核心角色', sourceKind: 'user_confirmed', userEvidence: 'USR-1' });
  assert.equal(validateStageLedger(value, 'character').ok, false);
});
test('rejects cross-stage delegation and missing scope coverage', () => {
  const value = character();
  value.decisions.push({ id: 'DEC-1', stage: 'systems', text: '感染系统', sourceKind: 'delegated', authorization: 'AUTH-1', scope: '角色细化' });
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /跨阶段/);
  value.decisions[0].stage = 'character'; value.decisions[0].scope = '新增玩法系统';
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /超出声明范围/);
});
test('valid in-scope delegated decisions are not relabeled as user-confirmed', () => {
  const value = character();
  value.decisions.push({ id: 'DEC-1', stage: 'character', text: '三名核心角色', sourceKind: 'delegated', authorization: 'AUTH-1', scope: '角色细化' });
  assert.equal(validateStageLedger(value, 'character').ok, true);
});
test('handoff requires pending review and expires delegation', () => {
  const value = character(); const row = value.stages.find(row => row.id === 'character');
  Object.assign(row, { progress: 'awaiting_handoff', review: 'pending', handoff: { id: 'HANDOFF-1', locator: 'chat:example#report-1', artifacts: ['制作文件/创作源/角色.yaml'] } });
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /待交接后必须到期/);
  value.authorizations[0].status = 'expired';
  assert.equal(validateStageLedger(value, 'character').ok, true);
});
test('closing a stage requires user acceptance of its actual handoff', () => {
  const value = character(); const row = value.stages.find(row => row.id === 'character');
  Object.assign(row, { progress: 'closed', review: 'accepted', handoff: { id: 'HANDOFF-1', locator: 'chat:example#report-1', artifacts: ['制作文件/创作源/角色.yaml'] } });
  value.authorizations[0].status = 'expired';
  assert.equal(validateStageLedger(value, 'character').ok, false);
  value.userEvidence.push({ id: 'USR-2', role: 'user', stage: 'character', action: 'accept', locator: 'chat:example#user-2', quote: '角色这样可以，继续。', responseTo: 'HANDOFF-1', targets: ['HANDOFF-1'] });
  row.acceptanceEvidence = 'USR-2';
  assert.equal(validateStageLedger(value, 'character').ok, true);
  value.userEvidence[1].responseTo = 'other';
  assert.equal(validateStageLedger(value, 'character').ok, false);
});
test('rejects circular evidence from mutable authority/NEXT files', () => {
  const value = character(); value.userEvidence[0].locator = '制作文件/项目记录/authority.md#confirmed';
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /循环引用/);
});
test('rejects missing and duplicate stages and malformed records without throwing', () => {
  const value = createStageLedger(); value.stages.pop(); value.decisions.push(null);
  assert.equal(validateStageLedger(value, 'preflight').ok, false);
  const duplicate = createStageLedger(); duplicate.stages[1] = { ...duplicate.stages[0] };
  assert.match(validateStageLedger(duplicate, 'preflight').issues.join('\n'), /重复/);
});
test('rejects stale NEXT stage and malformed ledger JSON', t => {
  const root = project(t); const file = path.join(root, '制作文件/项目记录', 'NEXT.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('\x60preflight\x60', '\x60character\x60'));
  assert.match(validateContinuation(root).issues.join('\n'), /当前阶段不一致/);
  authority(root, text => text.replace('"authorizations": []', '"authorizations": BROKEN'));
  assert.equal(validateContinuation(root).ok, false);
});
test('legacy v1 is not silently accepted or rewritten', t => {
  const root = project(t);
  authority(root, text => text.replace('authority/v2', 'authority/v1'));
  const before = fs.readFileSync(path.join(root, '制作文件/项目记录', 'authority.md'), 'utf8');
  assert.equal(validateContinuation(root).migrationRequired, true);
  assert.equal(validateContinuation(root).ok, false);
  assert.equal(fs.readFileSync(path.join(root, '制作文件/项目记录', 'authority.md'), 'utf8'), before);
});
test('board shows every stage, review and delegation inside a single fenced block', t => {
  const root = project(t); const board = renderProgressBoard(root);
  assert.match(board, /^\x60{3}text\n/);
  assert.match(board, /世界观：未进入/);
  assert.match(board, /用户审阅/);
  assert.match(board, /当前授权/);
  assert.match(board, /来源真实性未核验/);
  assert.equal((board.match(/\x60{3}/g) || []).length, 2);
  assert.doesNotMatch(board, /┌|└|│/);
});
test('invalid continuation returns nonzero via CLI', t => {
  const root = project(t); ledger(root, value => { value.stages.pop(); });
  const run = spawnSync(process.execPath, ['scripts/continuation/continuation.mjs', 'validate', '--root', root], { cwd: path.resolve(import.meta.dirname, '../..'), encoding: 'utf8' });
  assert.equal(run.status, 1);
});


test('unresolved blocking decisions prevent closing even with an acceptance record', () => {
  const value = character(); const row = value.stages.find(item => item.id === 'character');
  Object.assign(row, { progress: 'closed', review: 'accepted', acceptanceEvidence: 'USR-2', handoff: { id: 'HANDOFF-1', locator: 'chat:example#report-1', artifacts: ['角色.yaml'] } });
  value.authorizations[0].status = 'expired';
  value.userEvidence.push({ id: 'USR-2', role: 'user', stage: 'character', action: 'accept', locator: 'chat:example#user-2', quote: '这版可以。', targets: ['HANDOFF-1'], responseTo: 'HANDOFF-1' });
  value.decisions.push({ id: 'DEC-1', stage: 'character', text: '未知承重真相', sourceKind: 'unresolved' });
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /未解决承重决定/);
  value.decisions[0].blocking = false;
  assert.equal(validateStageLedger(value, 'character').ok, true);
});
test('rejects premature later-stage authorization and reusing a revoked grant', () => {
  const value = character();
  value.userEvidence.push({ id: 'USR-3', role: 'user', stage: 'mvu', action: 'delegate', locator: 'chat:example#user-3', quote: 'MVU 阶段你定。', targets: ['AUTH-2'] });
  value.authorizations.push({ ...value.authorizations[0], id: 'AUTH-2', stage: 'mvu', userEvidence: 'USR-3' });
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /授权只能在当前/);
  value.authorizations.pop(); value.authorizations[0].status = 'revoked';
  value.decisions.push({ id: 'DEC-1', stage: 'character', text: '角色细节', sourceKind: 'delegated', authorization: 'AUTH-1', scope: '角色细化' });
  assert.match(validateStageLedger(value, 'character').issues.join('\n'), /已撤销/);
});
test('cannot silently skip unresolved MVU; not-applicable skip retains a reason', () => {
  const value = createStageLedger(); const row = value.stages.find(item => item.id === 'mvu');
  Object.assign(row, { progress: 'skipped', reason: '先不做', reasonType: 'not_applicable' });
  assert.match(validateStageLedger(value, 'preflight').issues.join('\n'), /静默跳过/);
  row.enabled = 'disabled';
  assert.equal(validateStageLedger(value, 'preflight').ok, true);
});
test('status driver-accepted and a checked completion cannot bypass stage evidence', t => {
  const root = project(t);
  authority(root, text => text.replace('status: candidate', 'status: driver-accepted').replace('仅作为阶段账本的派生视图', '- [x] character\n\n仅作为阶段账本的派生视图'));
  const result = validateContinuation(root);
  assert.match(result.issues.join('\n'), /driver-accepted/);
  assert.match(result.issues.join('\n'), /勾选与阶段账本冲突/);
});
test('integration: character-only delegation is visible, then expires at handoff', t => {
  const root = project(t); const value = character();
  value.decisions.push({ id: 'DEC-1', stage: 'character', text: '三名核心角色', sourceKind: 'delegated', authorization: 'AUTH-1', scope: '角色细化' });
  authority(root, text => text.replace('current_stage: preflight', 'current_stage: character').replace(/(## 阶段账本\s*\n\x60{3}json\s*\n)([\s\S]*?)(\n\x60{3})/, (_, prefix, data, suffix) => prefix + JSON.stringify(value, null, 2) + suffix));
  const next = path.join(root, '制作文件/项目记录', 'NEXT.md'); fs.writeFileSync(next, fs.readFileSync(next, 'utf8').replace('\x60preflight\x60', '\x60character\x60'));
  assert.equal(validateContinuation(root).executionAllowed, true);
  assert.match(renderProgressBoard(root), /角色：进行中；本阶段放权/);
  const row = value.stages.find(item => item.id === 'character');
  Object.assign(row, { progress: 'awaiting_handoff', review: 'pending', handoff: { id: 'HANDOFF-1', locator: 'chat:example#report-1', artifacts: ['角色.yaml'] } });
  value.authorizations[0].status = 'expired';
  ledger(root, data => Object.assign(data, value));
  const result = validateContinuation(root);
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.executionAllowed, false);
  assert.match(renderProgressBoard(root), /角色：待交接；已到期\/撤销；待审阅/);
  assert.match(renderProgressBoard(root), /等待用户新消息，不能自动推进/);
});
test('init refuses to overwrite existing state', t => {
  const root = project(t); const file = path.join(root, '制作文件/项目记录', 'authority.md');
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => initContinuation(root, { projectId: 'other', title: 'other' }), /拒绝覆盖/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
