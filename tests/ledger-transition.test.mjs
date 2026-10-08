import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageLedger } from '../scripts/continuation/stage-ledger.mjs';
import { acceptHandoff, recordUserEvidence, startStage, submitHandoff } from '../scripts/continuation/ledger-transition.mjs';

function evidence(overrides = {}) {
  return {
    id: 'USR-1', role: 'user', origin: 'conversation', stage: 'positioning',
    action: 'start', locator: 'conversation#1', quote: '开始定位阶段', targets: ['positioning'], ...overrides
  };
}

test('transition writer rejects bare continue before it can enter the ledger', () => {
  assert.throws(() => recordUserEvidence(createStageLedger(), evidence({ action: 'start', quote: '继续' })), /不能产生阶段/);
});

test('stage handoff expires scoped authorizations and waits for review', () => {
  const ledger = createStageLedger();
  ledger.stages.find(item => item.id === 'preflight').progress = 'not_started';
  ledger.stages.find(item => item.id === 'positioning').enabled = 'enabled';
  const started = startStage(ledger, { stage: 'positioning', evidence: evidence() });
  started.authorizations.push({ id: 'AUTH-1', stage: 'positioning', mode: 'scoped_delegation', userEvidence: 'USR-1', scope: ['角色细化'], exclusions: [], expires: 'stage_handoff', status: 'active' });
  const handed = submitHandoff(started, { stage: 'positioning', handoff: { id: 'HANDOFF-1', locator: 'conversation#report', artifacts: ['创作源/定位.md'] } });
  assert.equal(handed.stages.find(item => item.id === 'positioning').progress, 'awaiting_handoff');
  assert.equal(handed.authorizations[0].status, 'expired');
});

test('accepting a handoff closes only that stage and never starts the next stage', () => {
  const ledger = createStageLedger();
  ledger.stages.find(item => item.id === 'preflight').progress = 'not_started';
  ledger.stages.find(item => item.id === 'positioning').enabled = 'enabled';
  const started = startStage(ledger, { stage: 'positioning', evidence: evidence() });
  const handed = submitHandoff(started, { stage: 'positioning', handoff: { id: 'HANDOFF-1', locator: 'conversation#report', artifacts: ['创作源/定位.md'] } });
  const accepted = acceptHandoff(handed, { stage: 'positioning', handoffId: 'HANDOFF-1', evidence: evidence({ id: 'USR-2', action: 'accept', quote: '接受这次定位阶段交接，下一阶段稍后再说', targets: ['HANDOFF-1'], responseTo: 'HANDOFF-1' }) });
  assert.equal(accepted.stages.find(item => item.id === 'positioning').progress, 'closed');
  assert.equal(accepted.stages.find(item => item.id === 'worldbuilding').progress, 'not_started');
});
