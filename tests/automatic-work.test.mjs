import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { createStageLedger, validateStageLedger } from '../scripts/continuation/stage-ledger.mjs';
import { startStage, reopenStage, submitHandoff, skipStage, beginAutomaticQa, blockAutomaticQa, acceptHandoff, readProjectState } from '../scripts/continuation/ledger-transition.mjs';
import { runAutomaticQa } from '../scripts/production/automatic-qa.mjs';
import { validateCheckReceipt } from '../scripts/production/check-plan.mjs';
import { fixture } from './helpers/production-fixture.mjs';
const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence = (overrides = {}) => ({ id:'USR-C',role:'user',origin:'conversation',stage:'character',action:'start',locator:'conversation#1',quote:'开始制作角色',targets:['character'],...overrides });
function handed() {
  const ledger = createStageLedger(); ledger.stages[0].progress = 'not_started';
  return submitHandoff(startStage(ledger,{ stage:'character',evidence:evidence() }),{ stage:'character',handoff:{id:'CHAR-1',locator:'conversation#report',artifacts:['制作文件/创作源/角色.yaml']} });
}
test('narrative is optional in routing and initial ledger; skipping does not disable either frontend', () => {
  const route = YAML.parse(fs.readFileSync(path.join(agentRoot,'orchestrator/routing.yaml'),'utf8'));
  assert.equal(route.stages.narrative_opening.optional,true);
  assert.equal(route.stages.qa_delivery.execution,'automatic_within_current_task');
  const ledger = createStageLedger(); assert.equal(ledger.stages.find(s => s.id === 'narrative_opening').enabled,'unresolved');
  const skipped = skipStage(ledger,{ stage:'narrative_opening',evidence:evidence({id:'USR-S',stage:'narrative_opening',action:'skip',quote:'这次不制作叙事规则和开场',targets:['narrative_opening']}) });
  assert.equal(validateStageLedger(skipped,'preflight').ok,true);
  assert.equal(skipped.stages.find(s => s.id === 'opening_frontend').enabled,'unresolved');
  assert.equal(skipped.stages.find(s => s.id === 'message_frontend').enabled,'unresolved');
  assert.throws(() => skipStage(ledger,{ stage:'qa_delivery',evidence:evidence({stage:'qa_delivery',action:'skip',targets:['qa_delivery']}) }),/可选阶段/);
});
test('automatic QA inherits scope but never creates user evidence, acceptance, delegation or next creative work', () => {
  const old = handed(), next = beginAutomaticQa(old,{sourceStage:'character'});
  assert.equal(validateStageLedger(next,'qa_delivery').ok,true);
  assert.deepEqual(next.userEvidence,old.userEvidence); assert.deepEqual(next.authorizations,old.authorizations); assert.deepEqual(next.decisions,old.decisions);
  const source = next.stages.find(s => s.id === 'character'), qa = next.stages.find(s => s.id === 'qa_delivery');
  assert.equal(source.progress,'authored'); assert.equal(source.review,'pending'); assert.equal(source.acceptanceEvidence,null);
  assert.equal(qa.entryEvidence,null); assert.equal(qa.review,'not_reviewed'); assert.equal(qa.automaticExecution.sources[0].handoffId,'CHAR-1');
  assert.equal(next.stages.find(s => s.id === 'worldbuilding').progress,'not_started');
});
test('automatic policy cannot be used on a creative stage or detached from its real source', () => {
  const ledger = beginAutomaticQa(handed(),{sourceStage:'character'}), qa = ledger.stages.find(s => s.id === 'qa_delivery');
  const detached = structuredClone(ledger); detached.stages.find(s => s.id === 'character').handoff.id = 'CHANGED';
  assert.equal(validateStageLedger(detached,'qa_delivery').ok,false);
  const abuse = structuredClone(ledger); abuse.stages.find(s => s.id === 'systems').automaticExecution = qa.automaticExecution;
  assert.match(validateStageLedger(abuse,'qa_delivery').issues.join(' '),/只能用于 QA/);
  const fakeAccepted = structuredClone(ledger); Object.assign(fakeAccepted.stages.find(s => s.id === 'qa_delivery'),{progress:'closed',review:'accepted'});
  assert.equal(validateStageLedger(fakeAccepted,'qa_delivery').ok,false);
});
test('unsubmitted work, unresolved decisions and unresolved full-project selection block automatic delivery', () => {
  const ledger = handed(), unfinished = structuredClone(ledger); unfinished.stages.find(s => s.id === 'character').progress = 'in_progress';
  assert.throws(() => beginAutomaticQa(unfinished,{sourceStage:'character'}),/尚未制作交接/);
  ledger.decisions.push({id:'D-OPEN',stage:'character',sourceKind:'unresolved',text:'未定的核心关系'});
  assert.throws(() => beginAutomaticQa(ledger,{sourceStage:'character'}),/承重决定/);
  assert.throws(() => beginAutomaticQa(handed(),{scope:'selected_project'}),/启用待定|尚未制作交接/);
});
test('the user can accept the original creative handoff without it being accepted by the QA process', () => {
  const ledger = beginAutomaticQa(handed(),{sourceStage:'character'});
  const accepted = acceptHandoff(ledger,{stage:'character',handoffId:'CHAR-1',evidence:evidence({id:'USR-A',action:'accept',quote:'接受这次角色交接',targets:['CHAR-1'],responseTo:'CHAR-1'})});
  assert.equal(validateStageLedger(accepted,'qa_delivery').ok,true);
  assert.equal(accepted.stages.find(s => s.id === 'character').review,'accepted');
  assert.equal(accepted.stages.find(s => s.id === 'qa_delivery').review,'not_reviewed');
});
test('blocked automatic QA is explicitly retried without adding user authorization', () => {
  const ledger = beginAutomaticQa(handed(),{sourceStage:'character'}), blocked = blockAutomaticQa(ledger,'检查失败');
  assert.equal(validateStageLedger(blocked,'qa_delivery').ok,true);
  const retry = beginAutomaticQa(blocked); assert.equal(validateStageLedger(retry,'qa_delivery').ok,true);
  assert.equal(retry.userEvidence.length,1); assert.equal(retry.stages.find(s => s.id === 'qa_delivery').progress,'in_progress');
});
test('an explicit revision invalidates prior technical closure and can be automatically checked again', () => {
  let ledger = beginAutomaticQa(handed(),{sourceStage:'character'});
  ledger = submitHandoff(ledger,{stage:'qa_delivery',handoff:{id:'QA-1',locator:'technical-report',artifacts:['导入包']}});
  ledger = reopenStage(ledger,{stage:'character',evidence:evidence({id:'USR-REV',quote:'重新修改角色阶段'})});
  assert.equal(validateStageLedger(ledger,'character').ok,true);
  assert.equal(ledger.stages.find(s => s.id === 'qa_delivery').progress,'not_started');
  assert.equal(ledger.stages.find(s => s.id === 'qa_delivery').automaticExecution,undefined);
  assert.equal(ledger.stages.find(s => s.id === 'character').review,'not_reviewed');
  ledger = submitHandoff(ledger,{stage:'character',handoff:{id:'CHAR-2',locator:'conversation#revision',artifacts:['制作文件/创作源/角色.yaml']}});
  ledger = beginAutomaticQa(ledger,{sourceStage:'character'});
  assert.equal(validateStageLedger(ledger,'qa_delivery').ok,true);
  assert.equal(ledger.stages.find(s => s.id === 'qa_delivery').automaticExecution.sources[0].handoffId,'CHAR-2');
  assert.equal(ledger.userEvidence.length,2);
});
function qaFixture(t,{failed = false} = {}) {
  const f = fixture(t), ledger = handed();
  f.write('制作文件/创作源/角色.yaml','姓名: 技术夹具');
  f.write('制作文件/项目记录/authority.md','---\ncurrent_stage: character\n---\n\n## 阶段账本\n\n```json\n'+JSON.stringify(ledger)+'\n```\n');
  f.write('制作文件/项目记录/NEXT.md','## 当前阶段\n\n`character`\n');
  f.write('导入包/导入说明.txt','离线技术测试，不是实机验收。');
  f.write('制作文件/项目记录/check-plan.json',{schema:'rp-card-studio/check-plan/v1',steps:[{id:'controlled-check',kind:'check',cwd:'project',program:'node',result:'json',args:['-e','console.log(JSON.stringify({ok:'+(!failed)+',total:1,passed:'+(!failed ? 1 : 0)+'}))']}]});
  return f;
}
const discover = async () => ({schema:'rp-card-studio/host-environment/v1',runtime:'not_run',capturedAt:'controlled-fixture',installations:[],instances:[],selection:{status:'not_found_in_scope'},coverage:{exhaustive:false},warnings:[]});
test('automatic pipeline executes checks and delivers files, while keeping user and real-host acceptance pending', async t => {
  const f = qaFixture(t), result = await runAutomaticQa({root:f.root,discover});
  assert.equal(result.ok,true,result.issues?.join(' ')); assert.equal(result.runtime,'not_run'); assert.equal(result.humanReview,'pending');
  const state = readProjectState(f.root); assert.equal(state.currentStage,'qa_delivery'); assert.equal(state.ledger.userEvidence.length,1);
  assert.equal(state.ledger.stages.find(s => s.id === 'character').progress,'authored'); assert.equal(state.ledger.stages.find(s => s.id === 'qa_delivery').progress,'delivered');
  assert.equal(validateCheckReceipt(f.root,{plan:'制作文件/项目记录/check-plan.json',report:result.reportPath}).ok,true);
});
test('exit-zero JSON failure stops automatic pipeline instead of producing a successful handoff', async t => {
  const f = qaFixture(t,{failed:true}), result = await runAutomaticQa({root:f.root,discover});
  assert.equal(result.ok,false); assert.equal(result.delivery,'blocked');
  const qa = readProjectState(f.root).ledger.stages.find(s => s.id === 'qa_delivery');
  assert.equal(qa.progress,'blocked'); assert.equal(qa.acceptanceEvidence,null); assert.equal(qa.handoff,null);
  assert.match(result.issues.join(' '),/ok:true|未全部通过/);
});
test('explicit scan restriction is honored without claiming absence or reusing stale host evidence', async t => {
  const f = qaFixture(t); let calls = 0;
  const result = await runAutomaticQa({root:f.root,skipDiscovery:true,discoveryReason:'用户明确只做静态检查',discover:async () => {calls++;throw Error('must not scan');}});
  assert.equal(result.ok,true,result.issues?.join(' ')); assert.equal(calls,0);
  const host = JSON.parse(fs.readFileSync(path.join(f.root,'制作文件/项目记录/host-environment.json'),'utf8'));
  assert.equal(host.status,'explicitly_skipped'); assert.equal(host.selection.status,'not_checked'); assert.equal(host.runtime,'not_run');
});
test('scan opt-out requires an explanation instead of silently disabling the default', async t => {
  const f = qaFixture(t);
  await assert.rejects(() => runAutomaticQa({root:f.root,skipDiscovery:true}),/说明用户限制/);
  assert.equal(readProjectState(f.root).currentStage,'character');
});
test('technical delivery does not require a second QA approval to enter a newly user-authorized creative stage', () => {
  let ledger = beginAutomaticQa(handed(),{sourceStage:'character'});
  ledger = submitHandoff(ledger,{stage:'qa_delivery',handoff:{id:'QA-1',locator:'technical-report',artifacts:['导入包']}});
  assert.equal(ledger.stages.find(s => s.id === 'qa_delivery').progress,'delivered');
  assert.throws(() => beginAutomaticQa(ledger,{sourceStage:'character'}),/已经技术交付/);
  ledger = startStage(ledger,{stage:'positioning',evidence:evidence({id:'USR-NEXT',stage:'positioning',quote:'开始定位阶段',targets:['positioning']})});
  assert.equal(validateStageLedger(ledger,'positioning').ok,true);
  assert.equal(ledger.stages.find(s => s.id === 'qa_delivery').review,'pending');
  assert.equal(ledger.stages.find(s => s.id === 'character').review,'pending');
});
test('invalid technical handoff cannot leave a successful automatic-delivery record behind', async t => {
  const f = qaFixture(t), result = await runAutomaticQa({root:f.root,discover,handoff:{id:'CHAR-1',locator:'technical-report',artifacts:['导入包']}});
  assert.equal(result.ok,false); assert.match(result.issues.join(' '),/交接 id 重复/);
  const report = JSON.parse(fs.readFileSync(path.join(f.root,result.reportPath),'utf8'));
  assert.notEqual(report.automaticQa?.delivery,'files_delivered');
  assert.equal(readProjectState(f.root).ledger.stages.find(s => s.id === 'qa_delivery').progress,'blocked');
});
