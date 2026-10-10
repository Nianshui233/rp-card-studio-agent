import { validateWorldbookProject } from '../worldbook/worldbook-project.mjs';
import { validateProductionManifest } from './production-manifest.mjs';
import { validateDeliveryLayout } from '../delivery/project-package.mjs';
import { validateMvuCompleteness } from './mvu-completeness-gate.mjs';
import { validateEjsCompleteness } from './ejs-completeness-gate.mjs';
import { INTERVIEW_PROFILES, validateInterviewCoverage } from './interview-coverage.mjs';
import { validateInterviewGate } from './interview-gate.mjs';
import { validateFrontendManifest } from './tavern-helper-carrier-gate.mjs';
import { validateDiagnosticEvents } from './diagnostic-evidence.mjs';
import { validateArtifactBindings, validateEjsInstallations } from './artifact-bindings.mjs';
import { validateCheckReceipt } from './check-plan.mjs';
import { readProjectState } from '../continuation/ledger-transition.mjs';
import { validateStageLedger } from '../continuation/stage-ledger.mjs';

export async function validateProductionProject(manifest, { root, ledger, currentStage, final = false } = {}) {
  const checks = [], issues = [];
  const implemented = ['implementation','awaiting_review','runtime_verified','accepted'].includes(manifest?.status);
  const finalGate = final || implemented && manifest?.activeStage === 'qa_delivery';
  const runtimeClaim = ['runtime_verified','accepted'].includes(manifest?.status);
  if (!ledger && root) {
    try { const state = readProjectState(root); ledger = state.ledger; currentStage = state.currentStage; }
    catch (e) { issues.push(e.message); }
  }
  if (ledger) {
    checks.push(validateStageLedger(ledger, currentStage));
    if (finalGate && currentStage === 'qa_delivery' && ledger.stages.find(s => s.id === 'qa_delivery')?.progress === 'blocked') issues.push('当前 QA 仍被阻断，不能用其他静态检查覆盖；修复后重新执行');
    if (implemented && currentStage && manifest.activeStage !== currentStage) issues.push('production.activeStage 与真实阶段账本不一致；不得滞留旧阶段绕过门禁');
  } else if (implemented || finalGate) issues.push('制作/最终检查必须读取现有权威账本，不能另造能力开关');
  const enabled = id => ledger?.stages?.some(s => s.id === id && s.enabled === 'enabled');
  const reached = id => finalGate || manifest.activeStage === id || ledger?.stages?.some(s => s.id === id && !['not_started', 'skipped', 'deferred'].includes(s.progress));
  if (reached('ejs') && enabled('ejs') && manifest.ejs?.enabled !== true) issues.push('用户已启用 EJS，production 不得静默关闭');
  if (reached('mvu') && enabled('mvu') && ['none','unresolved',undefined].includes(manifest.mvu?.mode)) issues.push('用户已启用 MVU，production 不能使用 none/unresolved');
  checks.push(validateProductionManifest(manifest, { root }));
  if (root) checks.push(validateDeliveryLayout(root, { requireManifest: finalGate }));
  if (reached('mvu')) checks.push(await validateMvuCompleteness(manifest.mvu, { root }));
  if (reached('ejs')) checks.push(validateEjsCompleteness(manifest.ejs));
  checks.push(validateDiagnosticEvents(manifest.diagnostics?.events));
  if (runtimeClaim && manifest.mvu?.mode === 'mvu_zod' && manifest.mvu.sourceContract?.runtime?.status !== 'pass') issues.push('runtime_verified/accepted 不能使用 MVU runtime:not_run/failed');
  const frontStages = ['opening_frontend','message_frontend'].filter(id => finalGate ? enabled(id) || manifest.frontends?.[id]
    : (manifest.activeStage === id || currentStage === id) && (implemented || manifest.frontends?.[id]?.status === 'implemented'));
  if (finalGate) {
    for (const stage of frontStages) if (!enabled(stage)) issues.push('最终前端没有对应启用依据，不能用制作记录自行授权：' + stage);
    if (manifest.ejs?.enabled && !enabled('ejs')) issues.push('最终 EJS 没有对应启用依据');
  }
  if (manifest.status === 'accepted' && !ledger?.stages?.some(s => s.id === 'qa_delivery' && s.progress === 'closed' && s.review === 'accepted')) issues.push('accepted 必须有 QA 阶段的真实用户接受引用');
  const required = [...frontStages, ...(finalGate && manifest.ejs?.enabled ? ['ejs'] : [])];
  let bindings = { results: [], issues: [], ok: true }, receipt = { steps: [], issues: [], ok: true };
  const readyFrontend = frontStages.some(stage => manifest.frontends?.[stage]?.status === 'implemented');
  if ((finalGate || readyFrontend) && root) {
    if (finalGate) checks.push(validateWorldbookProject(root, manifest.worldbook?.routingContract, { ledger, requireRuntime: runtimeClaim }));
    bindings = validateArtifactBindings(root, manifest.bindings, { requiredComponents: required }); checks.push(bindings);
    receipt = validateCheckReceipt(root, manifest.verification); checks.push(receipt);
    if (finalGate && manifest.ejs?.enabled) checks.push(validateEjsInstallations(root, manifest.ejs, manifest.bindings, bindings.results));
  }
  for (const stage of frontStages) {
    const front = manifest.frontends?.[stage] ?? (!finalGate ? manifest.frontend : null);
    if (!manifest.interviews?.[stage]) issues.push('缺少具体页面访谈：' + stage);
    checks.push(validateFrontendManifest(front, { activeStage: stage, requireRuntime: runtimeClaim, requireArtifacts: finalGate || front?.status === 'implemented', root,
      interview: manifest.interviews?.[stage], bindingResults: bindings.results, checkSteps: receipt.steps }));
  }
  if (implemented && ['mvu','native_schema','mvu_zod'].includes(manifest.activeStage) && !manifest.interviews?.[manifest.activeStage]) issues.push('MVU 当前阶段缺少访谈覆盖');
  for (const [stage, interview] of Object.entries(manifest.interviews ?? {})) {
    const isFrontend = ['opening_frontend', 'message_frontend'].includes(stage);
    if (isFrontend && interview?.profile && interview.profile !== stage) issues.push('前端访谈不能更名 profile 绕过独立设计：' + stage);
    const profile = isFrontend ? stage : interview?.profile ?? stage;
    checks.push({ stage, ...(INTERVIEW_PROFILES[profile] ? validateInterviewCoverage(interview, profile, { ledger }) : validateInterviewGate(interview, interview?.required ?? undefined)) });
  }
  issues.push(...checks.flatMap(c => c.issues ?? []));
  return { ok: issues.length === 0, finalGate, runtimeClaim, issues, checks };
}
