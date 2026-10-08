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

test('ledger rejects a handoff accepted only by bare continue', () => {
  const ledger = createStageLedger();
  const row = ledger.stages.find(stage => stage.id === 'positioning');
  row.enabled = 'enabled';
  row.progress = 'closed';
  row.review = 'accepted';
  row.entryEvidence = 'USR-START';
  row.handoff = { id: 'HANDOFF-POS-001', locator: '当前对话阶段报告', artifacts: ['创作源/定位.md'] };
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
    'rp-interview-orchestration', 'st-host-capabilities', 'st-api-reference',
    'st-worldbook-regex', 'st-render-regex', 'st-tavern-helper-engineering'
  ]);
  assert.equal(validateRouteLock(lock, root, 'message_frontend').ok, true);
  const tampered = { ...lock, fileSha256: { ...lock.fileSha256, [lock.requiredFiles.at(-1)]: 'tampered' } };
  assert.equal(validateRouteLock(tampered, root, 'message_frontend').ok, false);
});
