import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture, interviewFixture } from './helpers/production-fixture.mjs';
import { assessCommand, runCheckPlan, validateCheckPlan, validateCheckReceipt } from '../scripts/production/check-plan.mjs';
import { inspectBinding, validateArtifactBindings, validateEjsInstallations, textHash } from '../scripts/production/artifact-bindings.mjs';
import { checkFrontendScript } from '../scripts/frontend/frontend-source-check.mjs';
import { validateBrowserCases } from '../scripts/frontend/run-browser-fixtures.mjs';
import { INTERVIEW_PROFILES, validateInterviewCoverage } from '../scripts/production/interview-coverage.mjs';
import { validateProductionProject } from '../scripts/production/production-project.mjs';

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const goodStep = { id: 'check', kind: 'check', cwd: 'project', program: 'node', result: 'json', args: ['-e', 'console.log(JSON.stringify({ok:true,passed:1,total:1}))'] };
const plan = steps => ({ schema: 'rp-card-studio/check-plan/v1', steps });

test('exit zero cannot turn JSON failure or failed subchecks into a pass', () => {
  for (const output of [{ ok: false }, { ok: true, results: [{ ok: false }] }, { ok: true, checks: [{ ok: false }] }, { ok: true, passed: 0, total: 0 }, { ok: true, passed: 1, total: 2 }, { ok: true, issues: ['unresolved'] }]) assert.equal(assessCommand({ status: 0, stdout: JSON.stringify(output) }, goodStep).ok, false);
  assert.equal(assessCommand({ status: 1, stdout: '{"ok":true}' }, goodStep).ok, false);
  assert.equal(assessCommand({ status: 0, stdout: '全部通过' }, goodStep).ok, false);
  assert.equal(assessCommand({ status: 0, stdout: '{"ok":true}' }, goodStep).ok, true);
});
test('checks cannot opt into exit-only success or rebuild after checking', () => {
  assert.equal(validateCheckPlan(plan([{ ...goodStep, result: 'exit' }])).ok, false);
  assert.equal(validateCheckPlan(plan([goodStep, { id: 'late', kind: 'build', cwd: 'project', result: 'exit', args: [] }])).ok, false);
  assert.equal(validateCheckPlan(plan([{ ...goodStep, dependsOn: ['missing'] }])).ok, false);
});
test('real subprocess JSON failure stops the plan and CLI returns nonzero', t => {
  const f = fixture(t); const p = plan([{ ...goodStep, args: ['-e', 'console.log(JSON.stringify({ok:false}))'] }, { ...goodStep, id: 'never' }]);
  const r = runCheckPlan(p, { root: f.root, agentRoot }); assert.equal(r.ok, false); assert.equal(r.steps.length, 1);
  f.write('制作文件/项目记录/check-plan.json', p);
  const cli = spawnSync(process.execPath, [path.join(agentRoot, 'scripts/production/check-plan.mjs'), '--root', f.root], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.equal(JSON.parse(cli.stdout).ok, false);
});
test('checks are read-only and receipts expire when source or imported content changes', t => {
  const f = fixture(t), p = plan([goodStep]);
  f.write('制作文件/项目记录/check-plan.json', p);
  const r = runCheckPlan(p, { root: f.root, agentRoot }); assert.equal(r.ok, true);
  const verification = { plan: '制作文件/项目记录/check-plan.json', report: '制作文件/项目记录/check-report.json' };
  f.write(verification.plan, p); f.write(verification.report, r);
  assert.equal(validateCheckReceipt(f.root, verification).ok, true);
  f.write('制作文件/创作源/core.txt', 'changed'); assert.equal(validateCheckReceipt(f.root, verification).ok, false);
  const mutation = runCheckPlan(p, { root: f.root, agentRoot, execute: () => { f.write('制作文件/创作源/core.txt', 'changed-again'); return { status: 0, stdout: '{"ok":true}' }; } });
  assert.match(mutation.issues.join(' '), /检查期间/);
});
test('receipts cannot drop failed steps or alter their measured payloads', t => {
  const f = fixture(t), p = plan([goodStep]); f.write('制作文件/项目记录/check-plan.json', p); const r = runCheckPlan(p, { root: f.root, agentRoot });
  const verification = { plan: '制作文件/项目记录/check-plan.json', report: '制作文件/项目记录/check-report.json' };
  f.write(verification.plan, p); r.steps[0].payload.ok = false; f.write(verification.report, r);
  assert.equal(validateCheckReceipt(f.root, verification).ok, false);
});
test('binding compares current runtime source against a precise active imported field', t => {
  const f = fixture(t); f.write('制作文件/构建/template.ejs', '<% const a = 1; %>');
  const b = { id: 'e1', component: 'ejs', source: { path: '制作文件/构建/template.ejs', format: 'text' }, target: { path: 'A.世界书.json', pointer: '/entries/1/content', kind: 'worldbook_entry' }, match: 'equals' };
  assert.equal(validateArtifactBindings(f.root, [b], { requiredComponents: ['ejs'] }).ok, true);
  f.write('导入包/A.世界书.json', { entries: { 1: { content: '只有静态内容', disable: false } } });
  assert.equal(validateArtifactBindings(f.root, [b], { requiredComponents: ['ejs'] }).ok, false);
  assert.equal(inspectBinding(f.root, { ...b, target: { ...b.target, path: '../source.json' } }, new Set()).ok, false);
});
test('disabled target or blank/static source cannot masquerade as an installed dynamic template', t => {
  const f = fixture(t); const b = { id: 'e1', component: 'ejs', source: { path: '制作文件/构建/template.ejs', format: 'text' }, target: { path: 'A.世界书.json', pointer: '/entries/1/content', kind: 'worldbook_entry' }, match: 'equals' };
  f.write(b.source.path, ''); assert.equal(validateArtifactBindings(f.root, [b]).ok, false);
  f.write(b.source.path, '静态兜底'); assert.equal(validateArtifactBindings(f.root, [b]).ok, false);
  f.write(b.source.path, '<% const a = 1; %>'); f.write('导入包/A.世界书.json', { entries: { 1: { content: '<% const a = 1; %>', disable: true } } });
  assert.equal(validateArtifactBindings(f.root, [b]).ok, false);
  assert.equal(validateArtifactBindings(f.root, [{ ...b, target: { ...b.target, activation: 'pull' } }]).ok, true);
});
test('every instantiated EJS template must have a real binding, not only one representative', t => {
  const f = fixture(t); const source = '制作文件/构建/instances.json';
  f.write(source, { instances: [{ id: 'a', body: '<% 1 %>' }, { id: 'b', body: '<% 2 %>' }] });
  const ejs = { runtimeIndex: { path: source, pointer: '/instances', idField: 'id', contentField: 'body' } };
  const bindings = [{ id: 'a', component: 'ejs', source: { path: source, format: 'json', pointer: '/instances/0/body' } }];
  assert.match(validateEjsInstallations(f.root, ejs, bindings, [{ id: 'a', ok: true }]).issues.join(' '), /实例未装.*b/);
});
test('source checks parse syntax and lexical utility bindings, ignoring explanatory comments', () => {
  assert.equal(checkFrontendScript('// createScriptIdDiv();\nconst text = "createScriptIdIframe()";').ok, true);
  assert.equal(checkFrontendScript('if(typeof createScriptIdIframe === "function") createScriptIdIframe();').ok, false);
  assert.equal(checkFrontendScript('import {createScriptIdIframe} from "./util.js"; createScriptIdIframe();').ok, true);
  assert.equal(checkFrontendScript('function a(){const createScriptIdDiv=()=>{};createScriptIdDiv();} function b(){createScriptIdDiv();}').ok, false);
  assert.equal(checkFrontendScript('const util={createScriptIdDiv(){}}; util.createScriptIdDiv();').ok, true);
});
test('browser cases require producer, route isolation and observable postconditions', () => {
  const c = { id: 'a', route: 'primary', binding: 'b', surfaceId: 'main', surface: 'message_iframe', decodeEntities: 'none', steps: [{ op: 'click', selector: '#x' }] };
  assert.equal(validateBrowserCases({ schema: 'rp-card-studio/frontend-fixtures/v1', cases: [c] }).ok, false);
  c.steps.push({ expect: 'text', selector: '#result', value: 'done' });
  assert.equal(validateBrowserCases({ schema: 'rp-card-studio/frontend-fixtures/v1', cases: [c] }).ok, true);
});
test('specific page details and current decision hashes are required for frontend coverage', () => {
  const f = interviewFixture('opening_frontend', INTERVIEW_PROFILES);
  assert.equal(validateInterviewCoverage(f.interview, 'opening_frontend', { ledger: f.ledger }).ok, true);
  const shallow = structuredClone(f.interview); delete shallow.surfaces;
  assert.equal(validateInterviewCoverage(shallow, 'opening_frontend', { ledger: f.ledger }).ok, false);
  f.ledger.decisions[0].text = '已经更正的选择';
  assert.match(validateInterviewCoverage(f.interview, 'opening_frontend', { ledger: f.ledger }).issues.join(' '), /引用过期/);
});
test('rejected decisions and paraphrased confirmation summaries cannot reopen a withdrawn interpretation', () => {
  const f = interviewFixture('message_frontend', INTERVIEW_PROFILES);
  f.interview.coverage.interaction.evidence = 'Agent 自行扩大的确认';
  assert.match(validateInterviewCoverage(f.interview, 'message_frontend', { ledger: f.ledger }).issues.join(' '), /逐字投影/);
  f.ledger.decisions[0].sourceKind = 'rejected';
  assert.match(validateInterviewCoverage(f.interview, 'message_frontend', { ledger: f.ledger }).issues.join(' '), /撤回/);
});
test('QA checks all enabled frontends and EJS even after leaving their authoring stages', async t => {
  const f = fixture(t); f.ledger.stages.find(s => s.id === 'opening_frontend').enabled = 'enabled'; f.ledger.stages.find(s => s.id === 'ejs').enabled = 'enabled'; f.saveLedger();
  f.manifest.status = 'implementation'; f.manifest.activeStage = 'qa_delivery';
  f.manifest.ejs = { enabled: false, mode: 'none' };
  const r = await validateProductionProject(f.manifest, { root: f.root });
  assert.equal(r.ok, false); assert.match(r.issues.join(' '), /已启用 EJS/); assert.match(r.issues.join(' '), /opening_frontend/); assert.match(r.issues.join(' '), /activeStage/);
});

test('future enabled stages do not require their implementation during preflight', async t => {
  const f = fixture(t); f.ledger.stages.find(s => s.id === 'ejs').enabled = 'enabled'; f.ledger.stages.find(s => s.id === 'mvu').enabled = 'enabled';
  const r = await validateProductionProject(f.manifest, { ledger: f.ledger, currentStage: 'preflight' });
  assert.equal(r.ok, true, r.issues.join('\n'));
});

test('source checks allow imported aliases but reject a helper scoped only to a loop', () => {
  assert.equal(checkFrontendScript('import {createScriptIdIframe as frame} from "./util.js"; frame();').ok, true);
  assert.equal(checkFrontendScript('for(let createScriptIdDiv=()=>{}; false;){} createScriptIdDiv();').ok, false);
});

test('machine production contracts cannot change after the checks while keeping the same imported bytes', t => {
  const f = fixture(t), p = plan([goodStep]);
  f.write('制作文件/项目记录/check-plan.json', p); f.write('制作文件/项目记录/production.json', f.manifest);
  const r = runCheckPlan(p, { root: f.root, agentRoot });
  const verification = f.manifest.verification; f.write(verification.report, r);
  assert.equal(validateCheckReceipt(f.root, verification).ok, true);
  f.manifest.bindings.push({ id: 'changed' }); f.write('制作文件/项目记录/production.json', f.manifest);
  assert.equal(validateCheckReceipt(f.root, verification).ok, false);
});

test('a production map cannot self-enable an unselected frontend or manufacture QA acceptance', async t => {
  const f = fixture(t); f.manifest.frontends.message_frontend = { status: 'implemented' };
  const r = await validateProductionProject(f.manifest, { root: f.root, final: true });
  assert.match(r.issues.join(' '), /对应启用依据/);
  f.manifest.status = 'accepted'; f.manifest.activeStage = 'preflight';
  const accepted = await validateProductionProject(f.manifest, { root: f.root });
  assert.match(accepted.issues.join(' '), /真实用户接受/);
});

test('utility method names and export aliases are not mistaken for unbound global references', () => {
  assert.equal(checkFrontendScript('class Factory {createScriptIdIframe(){ return null; }} new Factory().createScriptIdIframe();').ok, true);
  assert.equal(checkFrontendScript('const factory=()=>{};export {factory as createScriptIdDiv};').ok, true);
});

test('material or delegated decisions cannot be relabeled as per-item user confirmation', () => {
  const f = interviewFixture('opening_frontend', INTERVIEW_PROFILES);
  f.interview.coverage.visual.sourceKind = 'user_confirmed';
  assert.match(validateInterviewCoverage(f.interview, 'opening_frontend', { ledger: f.ledger }).issues.join(' '), /标为用户确认/);
});
