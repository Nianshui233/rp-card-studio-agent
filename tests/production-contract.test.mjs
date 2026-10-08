import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionManifest, validateProductionManifest, REQUIRED_MVU_COMPONENTS } from '../scripts/production/production-manifest.mjs';
import { validateInterviewGate } from '../scripts/production/interview-gate.mjs';
import { validateMvuCompleteness } from '../scripts/production/mvu-completeness-gate.mjs';
import { validateDiagnosticEvents, validateReportClaim } from '../scripts/production/diagnostic-evidence.mjs';

test('production manifest establishes canonical source and reference-only sample boundaries', () => {
  const manifest = createProductionManifest({ projectId: 'p', title: '项目' });
  assert.equal(validateProductionManifest(manifest).ok, true);
  assert.equal(manifest.source.referenceOnlySamples, true);
});

test('frontend implementation requires interview coverage before production', () => {
  const bad = validateInterviewGate({ status: 'unresolved', decisions: {} });
  assert.equal(bad.ok, false);
  const good = validateInterviewGate({ status: 'covered', decisions: Object.fromEntries(['experience_scope','state_source','lifecycle','interaction','fallback','host_regression'].map(id => [id, { sourceKind: 'user_confirmed', evidence: 'USR-1' }])) });
  assert.equal(good.ok, true);
});

test('MVU_ZOD production requires every runtime component including variable list', () => {
  const bad = validateMvuCompleteness({ mode: 'mvu_zod', interviewStatus: 'covered', components: {} });
  assert.match(bad.issues.join('\n'), /variable_list/);
  const components = Object.fromEntries(REQUIRED_MVU_COMPONENTS.map(name => [name, { status: 'passed', path: `配置/MVU/${name}` }]));
  assert.equal(validateMvuCompleteness({ mode: 'mvu_zod', interviewStatus: 'covered', components }).ok, true);
});

test('diagnostics preserve user operation observations and block unsupported challenges', () => {
  assert.equal(validateDiagnosticEvents([{ kind: 'user_observation', level: 'observed', claim: '用户已完成导入', source: 'user-message' }]).ok, true);
  const bad = validateDiagnosticEvents([{ kind: 'challenge_user_operation', level: 'hypothesis', claim: '用户没有导入', source: 'agent' }]);
  assert.match(bad.issues.join('\n'), /不得质疑/);
});

test('strong report claims require evidence level', () => {
  assert.equal(validateReportClaim('可能是 iframe 脚本错误', 'hypothesis').ok, true);
  assert.equal(validateReportClaim('已经修复', 'hypothesis').ok, false);
  assert.equal(validateReportClaim('已经修复', 'verified').ok, true);
});
