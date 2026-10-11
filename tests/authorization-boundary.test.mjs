import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUserReply, isBareContinue } from '../scripts/continuation/user-intent.mjs';
import { createRouteLock, validateRouteLock } from '../scripts/continuation/route-lock.mjs';
import { createStageLedger, validateStageLedger } from '../scripts/continuation/stage-ledger.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bare continue is never an acceptance or authorization signal', () => {
  for (const text of ['继续', '继续吧', '继续进行', '接着来']) {
    assert.equal(isBareContinue(text), true, text);
    assert.equal(classifyUserReply(text).kind, 'bare_continue');
  }
  assert.notEqual(classifyUserReply('接受 HANDOFF-MVU-002').kind, 'bare_continue');
});

test('natural acceptance allows a subject but rejects denials, questions and conditions', () => {
  for (const text of ['我接受这个交接', '我确认这版成果', '我们同意这次交接', '我已经接受这个交接', '接受 HANDOFF-1', '这版可以']) {
    assert.equal(classifyUserReply(text).kind, 'explicit_acceptance', text);
  }
  for (const text of ['我不接受这个交接', '不可以', '没有通过', '我接受不了', '我接受这个交接吗', '是否可以', '如果通过检查我接受', '继续']) {
    assert.notEqual(classifyUserReply(text).kind, 'explicit_acceptance', text);
  }
});

test('ledger rejects a handoff accepted only by bare continue', () => {
  const ledger = createStageLedger();
  const row = ledger.stages.find(stage => stage.id === 'positioning');
  row.enabled = 'enabled';
  row.progress = 'closed';
  row.review = 'accepted';
  row.entryEvidence = 'USR-START';
  row.handoff = { id: 'HANDOFF-POS-001', locator: '当前对话阶段报告', artifacts: ['制作文件/创作源/定位.md'] };
  row.acceptanceEvidence = 'USR-CONTINUE';
  ledger.userEvidence.push(
    { id: 'USR-START', role: 'user', locator: '当前用户消息', quote: '开始定位阶段', stage: 'positioning', action: 'start', targets: ['positioning'] },
    { id: 'USR-CONTINUE', role: 'user', locator: '当前用户消息', quote: '继续', stage: 'positioning', action: 'accept', targets: ['HANDOFF-POS-001'], responseTo: 'HANDOFF-POS-001' }
  );
  const result = validateStageLedger(ledger, 'positioning');
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /不能只引用“继续”/);
});

test('route lock covers the declared primary and supporting Skills', () => {
  const lock = createRouteLock(root, 'message_frontend');
  assert.equal(lock.primarySkill, 'st-message-frontend-authoring');
  assert.deepEqual(lock.supportingSkills, [
    'rp-interview-orchestration', 'rp-materials-research', 'st-host-capabilities', 'st-api-reference',
    'st-worldbook-regex', 'st-render-regex', 'st-tavern-helper-engineering'
  ]);
  assert.ok(lock.requiredFiles.includes('internal-skills/rp-materials-research/SKILL.md'));
  assert.equal(validateRouteLock(lock, root, 'message_frontend').ok, true);
  const tampered = { ...lock, fileSha256: { ...lock.fileSha256, [lock.requiredFiles.at(-1)]: 'tampered' } };
  assert.equal(validateRouteLock(tampered, root, 'message_frontend').ok, false);
});

test('MVU route lock includes engineering source contract and executable validation', () => {
  const lock = createRouteLock(root, 'mvu');
  for (const file of ['internal-skills/st-mvu-authoring/references/mvu-source-build.md', 'scripts/mvu/validate-mvu-zod-source-contract.mjs', 'assets/templates/mvu-zod-source-contract.json']) assert.ok(lock.requiredFiles.includes(file));
  assert.equal(validateRouteLock(lock, root, 'mvu').ok, true);
});
