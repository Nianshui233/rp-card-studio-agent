import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initContinuation, validateContinuation } from '../scripts/continuation/continuation.mjs';
import { readProjectState, recordInterviewNode } from '../scripts/continuation/ledger-transition.mjs';
import { getInterviewRoute } from '../scripts/production/interview-routes.mjs';

const agentRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(agentRoot, 'scripts/continuation/continuation.mjs');
const nodeTarget = id => `positioning.${id}`;
const evidence = (id, action, targets, quote, stage = 'positioning') => ({
  id, role: 'user', origin: 'conversation', stage, action, targets, quote, locator: `conversation#${id}`,
});

function fixture(t, startEvidence) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'rp-continuation-cli-'));
  const exact = fs.realpathSync(root);
  t.after(() => {
    assert.equal(fs.realpathSync(root), exact);
    assert.equal(path.dirname(exact), parent);
    assert.ok(path.basename(exact).startsWith('rp-continuation-cli-'));
    fs.rmSync(exact, { recursive: true, force: true });
  });
  initContinuation(root, { projectId: 'cli-fixture', title: '技术测试项目' });
  const write = (id, value) => {
    const target = path.join(root, '制作文件/项目记录', `${id}.json`);
    fs.writeFileSync(target, JSON.stringify(value, null, 2));
    return target;
  };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, '--root', root], { cwd: agentRoot, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const pass = (...args) => {
    const result = run(...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  const snapshot = () => ['authority.md', 'NEXT.md'].map(name => fs.readFileSync(path.join(root, '制作文件/项目记录', name), 'utf8'));
  const failWithoutWrites = (...args) => {
    const before = snapshot(), result = run(...args);
    assert.notEqual(result.status, 0, result.stdout);
    assert.deepEqual(snapshot(), before);
    return result.stderr;
  };
  pass('handoff-stage', '--stage', 'preflight', '--handoff-file', write('preflight-handoff', { id: 'HO-PRE', locator: 'conversation#report-preflight', artifacts: ['制作文件/项目记录/authority.md'] }));
  pass('accept-handoff', '--stage', 'preflight', '--handoff-id', 'HO-PRE', '--evidence-file', write('preflight-accept', { ...evidence('UE-PRE', 'accept', ['HO-PRE'], '我接受预检交接', 'preflight'), responseTo: 'HO-PRE' }));
  pass('start-stage', '--stage', 'positioning', '--evidence-file', write('start', startEvidence ?? evidence('UE-START', 'start', ['positioning'], '开始定位阶段')));
  return { root, write, run, pass, snapshot, failWithoutWrites };
}

function confirmNode(f, node, id = `UE-${node}`) {
  const answer = f.write(id, evidence(id, 'confirm', [nodeTarget(node)], `确认已展示的${node}方案`));
  const registered = f.pass('record-answer', '--stage', 'positioning', '--evidence-file', answer);
  assert.equal(registered.evidenceId, id);
  assert.ok(registered.context.basisInputs.evidence.some(item => item.id === id));
  assert.equal('ledger' in registered, false);
  f.pass('close-node', '--stage', 'positioning', '--node', node, '--node-status', 'confirmed', '--basis-file', f.write(`basis-${node}`, {
    kind: 'user_confirmed', evidence: [id], coverage: getInterviewRoute('positioning').nodes.find(item => item.id === node).minimum,
  }));
}

test('CLI completes confirmed and delegated nodes, handoff and natural acceptance without manual ledger edits', t => {
  const f = fixture(t);
  confirmNode(f, 'player_promise');
  const auth = { id: 'AUTH-CONTROL', stage: 'positioning', mode: 'scoped_delegation', scope: ['玩家控制'], exclusions: [] };
  f.pass('delegate', '--stage', 'positioning', '--evidence-file', f.write('delegate', evidence('UE-DEL', 'delegate', ['AUTH-CONTROL'], '玩家控制的这项方案由你决定')),
    '--authorization-file', f.write('authorization', auth));
  f.pass('record-decision', '--stage', 'positioning', '--decision-file', f.write('decision', { id: 'DEC-CONTROL', stage: 'positioning', node: 'player_control', text: '依据当前范围细化玩家控制', sourceKind: 'delegated', authorization: auth.id, scope: '玩家控制' }));
  f.pass('close-node', '--stage', 'positioning', '--node', 'player_control', '--node-status', 'delegated', '--basis-file', f.write('delegated-basis', {
    kind: 'delegated', authorization: auth.id, scope: '玩家控制', coverage: ['玩家控制'],
  }));
  confirmNode(f, 'ownership_mode');
  confirmNode(f, 'scope_and_source_policy');
  const state = readProjectState(f.root);
  assert.equal(state.ledger.decisions[0].sourceKind, 'delegated');
  assert.equal(state.ledger.userEvidence.find(item => item.id === 'UE-DEL').action, 'delegate');
  assert.equal(state.ledger.stages.find(item => item.id === 'positioning').interviewRoute.status, 'complete');
  f.pass('handoff-stage', '--stage', 'positioning', '--handoff-file', f.write('handoff', { id: 'HO-POS', locator: 'conversation#report', artifacts: ['制作文件/项目记录/authority.md'] }));
  assert.equal(readProjectState(f.root).ledger.authorizations[0].status, 'expired');
  assert.equal(readProjectState(f.root).ledger.stages.find(item => item.id === 'positioning').review, 'pending');
  f.pass('accept-handoff', '--stage', 'positioning', '--handoff-id', 'HO-POS', '--evidence-file', f.write('accept', {
    ...evidence('UE-ACCEPT', 'accept', ['HO-POS'], '我接受这个交接'), responseTo: 'HO-POS',
  }));
  const accepted = readProjectState(f.root).ledger;
  assert.equal(accepted.stages.find(item => item.id === 'positioning').progress, 'closed');
  assert.equal(accepted.stages.find(item => item.id === 'worldbuilding').progress, 'not_started');
  const checked = validateContinuation(f.root);
  assert.equal(checked.ok, true, checked.issues.join('\n'));
});

test('confirm event registers a decision and its evidence but does not silently close a node', t => {
  const f = fixture(t), id = 'UE-CONFIRM';
  const result = f.pass('ledger-event', '--event', 'confirm', '--stage', 'positioning', '--evidence-file', f.write('confirm', evidence(id, 'confirm', ['DEC-1'], '这项玩家承诺按建议')),
    '--decision-file', f.write('confirmed-decision', { id: 'DEC-1', stage: 'positioning', node: 'player_promise', text: '本轮用户确认的玩家承诺', sourceKind: 'user_confirmed', userEvidence: id }));
  assert.equal(result.ledger.stages.find(item => item.id === 'positioning').interviewRoute.visited.length, 0);
  f.pass('close-node', '--stage', 'positioning', '--node', 'player_promise', '--node-status', 'confirmed', '--basis-file', f.write('basis', { kind: 'user_confirmed', evidence: [id], coverage: ['玩家承诺'] }));
});

test('a delegation used to enter a stage can be referenced without duplicating or rewriting user evidence', t => {
  const grant = evidence('UE-ENTRY-DEL', 'delegate', ['positioning', 'AUTH-ENTRY'], '开始定位阶段，玩家控制权由你代定');
  const f = fixture(t, grant);
  const file = f.write('entry-grant', grant), auth = f.write('entry-auth', { id: 'AUTH-ENTRY', stage: 'positioning', mode: 'scoped_delegation', scope: ['玩家控制权'], exclusions: [] });
  f.pass('delegate', '--stage', 'positioning', '--evidence-file', file, '--authorization-file', auth);
  assert.equal(readProjectState(f.root).ledger.userEvidence.filter(item => item.id === grant.id).length, 1);
  assert.match(f.failWithoutWrites('delegate', '--stage', 'positioning', '--evidence-file', file, '--authorization-file', auth), /授权 id 已存在/);
  const different = f.write('changed-grant', { ...grant, quote: '并不存在的另一条授权', targets: [...grant.targets, 'AUTH-OTHER'] });
  assert.match(f.failWithoutWrites('delegate', '--stage', 'positioning', '--evidence-file', different,
    '--authorization-file', f.write('other-auth', { id: 'AUTH-OTHER', stage: 'positioning', mode: 'scoped_delegation', scope: ['范围'], exclusions: [] })), /内容不同/);
});

test('registration rejects missing origin, bare continue, cross-stage evidence and duplicate ids without writes', t => {
  const f = fixture(t);
  for (const [id, changes] of [['origin', { origin: 'agent' }], ['continue', { quote: '继续' }], ['cross-stage', { stage: 'character' }], ['empty-targets', { targets: [] }]]) {
    const file = f.write(id, { ...evidence(`UE-${id}`, 'confirm', [nodeTarget('player_promise')], '按建议'), ...changes });
    f.failWithoutWrites('record-answer', '--stage', 'positioning', '--evidence-file', file);
  }
  const file = f.write('good', evidence('UE-ONE', 'confirm', [nodeTarget('player_promise')], '按建议'));
  f.pass('record-answer', '--stage', 'positioning', '--evidence-file', file);
  assert.match(f.failWithoutWrites('record-answer', '--stage', 'positioning', '--evidence-file', file), /已存在/);
});

test('a confirmation for another node cannot close the current node', t => {
  const f = fixture(t);
  f.pass('record-answer', '--stage', 'positioning', '--evidence-file', f.write('other', evidence('UE-OTHER', 'confirm', [nodeTarget('ownership_mode')], '开放世界')));
  assert.match(f.failWithoutWrites('close-node', '--stage', 'positioning', '--node', 'player_promise', '--node-status', 'confirmed', '--basis-file', f.write('other-basis', {
    kind: 'user_confirmed', evidence: ['UE-OTHER'], coverage: ['玩家承诺'],
  })), /未指向该节点/);
});

test('delegation checks scope, expiry and source kind without converting it into user confirmation', t => {
  const f = fixture(t);
  const auth = { id: 'AUTH-ONE', stage: 'positioning', mode: 'scoped_delegation', scope: ['玩家控制'], exclusions: [] };
  f.pass('delegate', '--stage', 'positioning', '--evidence-file', f.write('delegate', evidence('UE-DEL', 'delegate', ['AUTH-ONE'], '只放权玩家控制')),
    '--authorization-file', f.write('auth', auth));
  const basis = { kind: 'delegated', authorization: 'AUTH-ONE', scope: '玩家承诺', coverage: ['玩家承诺'] };
  assert.match(f.failWithoutWrites('close-node', '--stage', 'positioning', '--node', 'player_promise', '--node-status', 'delegated', '--basis-file', f.write('wrong-scope', basis)), /超出授权/);
  const expired = readProjectState(f.root).ledger;
  expired.authorizations[0].status = 'expired';
  assert.throws(() => recordInterviewNode(expired, { stage: 'positioning', node: 'player_promise', status: 'delegated', basis: { ...basis, scope: '玩家控制' } }), /到期/);
  assert.match(f.failWithoutWrites('record-decision', '--stage', 'positioning', '--decision-file', f.write('fake-confirmed', {
    id: 'DEC-FAKE', stage: 'positioning', text: '授权不等于逐项确认', sourceKind: 'user_confirmed', userEvidence: 'UE-DEL',
  })), /有效用户依据/);
});

test('skip answer closes only its node and cannot advance past an unresolved prior node', t => {
  const f = fixture(t);
  f.pass('close-node', '--stage', 'positioning', '--node', 'player_promise', '--node-status', 'unresolved');
  assert.match(f.failWithoutWrites('close-node', '--stage', 'positioning', '--node', 'player_control', '--node-status', 'not_applicable', '--basis-file', f.write('na', {
    kind: 'not_applicable', reason: '仅技术夹具', coverage: ['玩家控制'],
  })), /前置访谈节点/);
  f.pass('record-answer', '--stage', 'positioning', '--evidence-file', f.write('skip', evidence('UE-SKIP', 'skip', [nodeTarget('player_promise')], '不定义固定核心体验')));
  f.pass('close-node', '--stage', 'positioning', '--node', 'player_promise', '--node-status', 'explicit_skip', '--basis-file', f.write('skip-basis', {
    kind: 'explicit_skip', evidence: ['UE-SKIP'], coverage: ['玩家承诺'],
  }));
  assert.equal(readProjectState(f.root).ledger.stages.find(item => item.id === 'positioning').enabled, 'enabled');
});

test('CLI help succeeds and advertises the registration commands', () => {
  const run = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0);
  for (const name of ['record-answer', 'delegate', '--authorization-file', 'record-decision', '--decision-file', 'close-node']) assert.ok(run.stdout.includes(name), name);
});
