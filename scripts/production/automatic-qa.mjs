import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_DIR, DELIVERY_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { readProjectState, applyProjectEvent } from '../continuation/ledger-transition.mjs';
import { validateStageLedger } from '../continuation/stage-ledger.mjs';
import { writeRouteLock, validateRouteLock } from '../continuation/route-lock.mjs';
import { discoverHost, writeHostEnvironment } from '../host/discover-sillytavern.mjs';
import { runCheckPlan } from './check-plan.mjs';
import { validateProductionProject } from './production-project.mjs';
import { validateDeliveryLayout } from '../delivery/project-package.mjs';
import { validateWorldbookProject } from '../worldbook/worldbook-project.mjs';

const AGENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = file => JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));

export async function runAutomaticQa({ root, scope = 'current_stage', agentRoot = AGENT_ROOT, handoff, discover = discoverHost, hostOptions = {}, skipDiscovery = false, discoveryReason, execute } = {}) {
  root = path.resolve(root);
  const initial = readProjectState(root), initialCheck = validateStageLedger(initial.ledger, initial.currentStage);
  if (!initialCheck.ok) throw new Error(initialCheck.issues.join('\n'));
  // Explicitly scoped discovery is a read-only administrative action. No app startup/import/send.
  if (skipDiscovery && !discoveryReason?.trim()) throw new Error('跳过默认环境发现必须说明用户限制或宿主能力缺失');
  const existingEnvironment = path.join(root,STATE_DIR,'host-environment.json');
  let preference = {}; try { preference = readJson(existingEnvironment).preference || {}; } catch { /* Not yet discovered. */ }
  const environment = skipDiscovery ? {schema:'rp-card-studio/host-environment/v1',capturedAt:new Date().toISOString(),runtime:'not_run',status:'explicitly_skipped',reason:discoveryReason,installations:[],instances:[],selection:{status:'not_checked'},coverage:{exhaustive:false}} : await discover({preferredOrigin:preference.origin,preferredDirectory:preference.directory,...hostOptions});
  writeHostEnvironment(root,environment);
  const { lock } = writeRouteLock(root,agentRoot,'qa_delivery');
  const route = validateRouteLock(lock,agentRoot,'qa_delivery'); if (!route.ok) throw new Error(route.issues.join('\n'));
  const entered = applyProjectEvent(root,{ type:'auto-qa',stage:'qa_delivery',scope });
  scope = entered.ledger.stages.find(s => s.id === 'qa_delivery').automaticExecution.scope;
  let reportPath = STATE_DIR + '/check-report.json';
  try {
    const productionFile = path.join(root,STATE_DIR,'production.json');
    const manifest = fs.existsSync(productionFile) ? readJson(productionFile) : null;
    if (manifest) {
      // Metadata follows the ledger; never promote runtime or human acceptance.
      if (manifest.status === 'accepted') manifest.status = 'awaiting_review';
      manifest.activeStage = 'qa_delivery'; fs.writeFileSync(productionFile,JSON.stringify(manifest,null,2) + '\n');
    } else if (entered.ledger.stages.some(s => ['mvu','ejs','runtime_bridge','opening_frontend','message_frontend'].includes(s.id) && s.enabled === 'enabled')) throw new Error('已启用运行组件，缺少 production.json，不能绕过组件终检');
    const planPath = manifest?.verification?.plan || STATE_DIR + '/check-plan.json';
    reportPath = manifest?.verification?.report || reportPath;
    requireArea(planPath,STATE_DIR,'检查计划'); requireArea(reportPath,STATE_DIR,'检查结果');
    if (planPath === reportPath) throw new Error('检查结果不能覆盖检查计划');
    const report = runCheckPlan(readJson(resolveProjectPath(root,planPath)),{ root,agentRoot,reportPath, ...(execute ? { execute } : {}) });
    const destination = resolveProjectPath(root,reportPath,{ output:true });
    fs.mkdirSync(path.dirname(destination),{ recursive:true }); fs.writeFileSync(destination,JSON.stringify(report,null,2) + '\n');
    if (!report.ok) throw new Error(report.issues.join('\n'));
    const checks = [validateDeliveryLayout(root,{ requireManifest:true })];
    if (manifest) checks.push(await validateProductionProject(manifest,{ root,final:true }));
    else checks.push(validateWorldbookProject(root,STATE_DIR + '/worldbook-routing.json',{ ledger: readProjectState(root).ledger }));
    const issues = checks.flatMap(c => c.issues || []); if (issues.length) throw new Error(issues.join('\n'));
    const actualHandoff = handoff || { id:'QA-' + Date.now(),locator:reportPath + '#automaticQa',artifacts:[DELIVERY_DIR,STATE_DIR + '/authority.md',reportPath] };
    for (const file of actualHandoff.artifacts || []) resolveProjectPath(root,file);
    const result = { ok:true,scope,handoffId:actualHandoff.id,delivery:'files_delivered',runtime:'not_run',humanReview:'pending',reportPath,checks,
      note:'本命令完成自动检查与交付整理，不执行实机导入，也不代表用户接受。' };
    // Extra result resides in the excluded check receipt itself; do not invalidate its input hashes.
    applyProjectEvent(root,{ type:'handoff',stage:'qa_delivery',handoff:actualHandoff });
    report.automaticQa = result; fs.writeFileSync(destination,JSON.stringify(report,null,2) + '\n');
    return result;
  } catch (error) {
    applyProjectEvent(root,{ type:'qa-blocked',stage:'qa_delivery',reason:error.message });
    return { ok:false,scope,delivery:'blocked',issues:[error.message],runtime:'not_run',humanReview:'not_accepted',reportPath };
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i+1]; };
  try {
    const result = await runAutomaticQa({
      root: opt('--root') || process.cwd(), scope: opt('--scope') || 'current_stage',
      handoff: opt('--handoff-file') ? readJson(opt('--handoff-file')) : undefined,
      skipDiscovery: process.argv.includes('--skip-discovery'), discoveryReason: opt('--discovery-reason'),
      hostOptions: { ...(opt('--host-origin') ? { preferredOrigin: opt('--host-origin') } : {}), ...(opt('--host-directory') ? { preferredDirectory: opt('--host-directory') } : {}) }
    });
    console.log(JSON.stringify(result,null,2)); if (!result.ok) process.exitCode = 1;
  } catch (error) { console.log(JSON.stringify({ ok:false,issues:[error.message] })); process.exitCode = 1; }
}
