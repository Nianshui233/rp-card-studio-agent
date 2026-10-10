import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { interviewFixture, fixture as projectFixture } from './helpers/production-fixture.mjs';
import { INTERVIEW_PROFILES, validateInterviewCoverage } from '../scripts/production/interview-coverage.mjs';
import { validateFrontendDesign, validateDesignReview } from '../scripts/frontend/design-contract.mjs';
import { searchDesignGuide } from '../scripts/frontend/design-guide.mjs';
import { createRouteLock } from '../scripts/continuation/route-lock.mjs';
import { textHash } from '../scripts/production/artifact-bindings.mjs';
import { validateProductionProject } from '../scripts/production/production-project.mjs';

const fixture = stage => interviewFixture(stage, INTERVIEW_PROFILES);
const validate = (f, stage) => validateFrontendDesign(f.interview.design, stage, { ledger: f.ledger, surfaces: f.interview.surfaces });

test('opening and sustained-play designs have separate schemas and actual obligations', () => {
  const opening = fixture('opening_frontend'), message = fixture('message_frontend');
  assert.equal(validate(opening, 'opening_frontend').ok, true);
  assert.equal(validate(message, 'message_frontend').ok, true);
  assert.equal(validate(opening, 'message_frontend').ok, false);
  assert.equal(validate(message, 'opening_frontend').ok, false);
  assert.equal(opening.interview.design.playPlan, undefined);
  assert.equal(message.interview.design.entryPlan, undefined);
  delete message.interview.design.comfortPlan;
  assert.match(validate(message, 'message_frontend').issues.join(' '), /repeatUse|density/);
});
test('an emotional first impression does not satisfy a concrete design or close the interview', () => {
  const f = fixture('opening_frontend');
  f.interview.design = { schema: 'rp-card-studio/opening-design/v1', mood: '神秘压迫' };
  assert.equal(validateInterviewCoverage(f.interview, 'opening_frontend', { ledger: f.ledger }).ok, false);
  assert.match(validate(f, 'opening_frontend').issues.join(' '), /composition|pageFlow/);
});
test('opening modules can be omitted with an actual reason without inheriting persistent-play requirements', () => {
  const f = fixture('opening_frontend');
  f.interview.design.entryPlan.playGuide = { mode: 'omitted', reason: '用户只需要介绍页' };
  assert.equal(validate(f, 'opening_frontend').ok, true);
  f.interview.design.boundary = 'persistent_controller';
  assert.equal(validate(f, 'opening_frontend').ok, false);
  delete f.interview.design.entryPlan.playGuide.reason;
  assert.match(validate(f, 'opening_frontend').issues.join(' '), /缺少依据/);
});
test('reference search never fabricates external research, product requirements or a generic fallback', () => {
  const opening = searchDesignGuide('opening_frontend', '创角');
  const message = searchDesignGuide('message_frontend', '人物 关系');
  assert.equal(opening.referenceOnly, true); assert.equal(opening.research, 'not_performed');
  assert.notEqual(opening.guide, message.guide);
  assert.ok(opening.results.some(r => r.id === 'branching-creation'));
  assert.ok(message.results.some(r => r.id === 'social-intelligence'));
  assert.equal(searchDesignGuide('message_frontend', 'no-such-design-zz').matched, false);
  assert.deepEqual(searchDesignGuide('message_frontend', 'no-such-design-zz').results, []);
  assert.throws(() => searchDesignGuide('frontend'), /不能使用统一/);
});
test('research cannot claim reviewed with no sources, internal recommendations or invented public locators', () => {
  const f = fixture('message_frontend');
  f.interview.design.research.references = [];
  assert.match(validate(f, 'message_frontend').issues.join(' '), /不能声明研究完成/);
  f.interview.design.research = { status: 'not_needed', reason: '模型认为足够', references: [] };
  assert.equal(validate(f, 'message_frontend').ok, false);
  f.interview.design.scope = 'targeted_revision';
  assert.equal(validate(f, 'message_frontend').ok, true);
  f.interview.design.research = { status: 'reviewed', references: [{ id: 'x', kind: 'local_pattern', locator: 'knowledge', checkedAt: '2026-10-11', observation: '看到本地索引', application: '候选' }] };
  assert.equal(validate(f, 'message_frontend').ok, false);
  f.interview.design.research.references[0].kind = 'public_design';
  assert.match(validate(f, 'message_frontend').issues.join(' '), /HTTP/);
});
test('offline or unavailable research is disclosed rather than masquerading as current knowledge', () => {
  for (const status of ['user_offline', 'unavailable']) {
    const f = fixture('opening_frontend'); f.interview.design.research = { status, reason: '当前实际网络限制，继续使用用户给定参考并明确未查证', references: [] };
    if (status === 'user_offline') {
      assert.equal(validate(f, 'opening_frontend').ok, false);
      f.ledger.decisions[0].sourceKind = 'user_confirmed'; f.ledger.decisions[0].text = '用户明确要求本阶段不联网';
      const refs = [{ id: f.ledger.decisions[0].id, textSha256: textHash(f.ledger.decisions[0].text) }];
      f.interview.design.directionRefs = refs; f.interview.design.research.decisionRefs = refs;
    }
    assert.equal(validate(f, 'opening_frontend').ok, true);
    delete f.interview.design.research.reason;
    assert.equal(validate(f, 'opening_frontend').ok, false);
  }
});
test('an agent cannot use delegation to claim the user prohibited external research or retained a rejected direction', () => {
  const f = fixture('message_frontend'); f.ledger.decisions[0].sourceKind = 'delegated';
  f.interview.design.research = { status: 'user_offline', reason: 'AI 认为离线安全', references: [], decisionRefs: f.interview.design.directionRefs };
  assert.match(validate(f, 'message_frontend').issues.join(' '), /不能把代定/);
  f.interview.design.research.status = 'unavailable';
  f.interview.design.feedback = { status: 'resolved', kind: 'direction', diagnosis: '方向不满意', changed: '保留原样', retained: '整个方案', response: 'retained_by_user', decisionRefs: f.interview.design.directionRefs, retainedByRefs: f.interview.design.directionRefs };
  assert.match(validate(f, 'message_frontend').issues.join(' '), /用户明确保留/);
  f.interview.design.feedback.response = 'alternatives';
  assert.match(validate(f, 'message_frontend').issues.join(' '), /实际采用方案/);
});
test('direction feedback requires actual reconsideration and never manufactures user acceptance', () => {
  const f = fixture('message_frontend');
  f.interview.design.feedback = { status: 'resolved', kind: 'direction', diagnosis: '表达方式不合适', changed: '只加花线', retained: '所有构图', response: 'decorated', decisionRefs: f.interview.design.directionRefs };
  assert.match(validate(f, 'message_frontend').issues.join(' '), /不能只追加装饰/);
  f.interview.design.feedback.response = 'recomposed'; f.interview.design.feedback.changed = '重排信息结构并替换表达';
  assert.equal(validate(f, 'message_frontend').ok, true);
  f.interview.design.feedback.status = 'open';
  assert.match(validate(f, 'message_frontend').issues.join(' '), /尚未解决/);
  f.ledger.decisions[0].text = '已更正的实际授权';
  assert.match(validate(f, 'message_frontend').issues.join(' '), /引用过期/);
});
test('design review is independent of runtime, code counts and prototype status', () => {
  const result = validateDesignReview({ prototype: { status: 'passed' }, lineCount: 9000 }, 'opening_frontend');
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /独立/);
});
test('portable design lookup CLI needs no installed external skill and rejects incomplete arguments', () => {
  const cli = fileURLToPath(new URL('../scripts/frontend/design-guide.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const ok = run('--stage', 'opening_frontend', '--query', '创角', '--limit', '2');
  assert.equal(ok.status, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).results.length, 2);
  assert.equal(run('--stage').status, 1); assert.equal(run('--stage', 'message_frontend', '--limit', '0').status, 1);
});

test('host routes lock their own design instructions instead of inheriting the other frontend profile', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const opening = createRouteLock(root, 'opening_frontend'), message = createRouteLock(root, 'message_frontend');
  const openPath = 'internal-skills/st-opening-frontend-authoring/references/opening-design.md';
  const messagePath = 'internal-skills/st-message-frontend-authoring/references/message-design.md';
  assert.ok(opening.requiredFiles.includes(openPath)); assert.ok(!opening.requiredFiles.includes(messagePath));
  assert.ok(message.requiredFiles.includes(messagePath)); assert.ok(!message.requiredFiles.includes(openPath));
});

test('a renamed interview profile cannot bypass the opening-specific design contract', async t => {
  const p = projectFixture(t), f = fixture('message_frontend');
  p.ledger.decisions = f.ledger.decisions;
  p.manifest.interviews.opening_frontend = f.interview;
  const result = await validateProductionProject(p.manifest, { ledger: p.ledger, currentStage: 'preflight' });
  assert.equal(result.ok, false); assert.match(result.issues.join(' '), /更名 profile/);
  assert.match(result.issues.join(' '), /当前阶段独立的设计/);
});
test('candidate status cannot hide a frontend already marked implemented from design review', async t => {
  const p = projectFixture(t), f = fixture('opening_frontend'); p.ledger.decisions = f.ledger.decisions; p.saveLedger();
  p.manifest.status = 'candidate'; p.manifest.activeStage = 'opening_frontend';
  p.manifest.interviews.opening_frontend = f.interview;
  p.manifest.frontends.opening_frontend = { status: 'implemented' };
  const result = await validateProductionProject(p.manifest, { root: p.root });
  assert.equal(result.ok, false); assert.match(result.issues.join(' '), /独立、已执行的设计复核/);
});
