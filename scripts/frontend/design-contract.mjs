import fs from 'node:fs';
import { textHash } from '../production/artifact-bindings.mjs';
import { validateDecisionRefs } from '../production/decision-refs.mjs';
import { STATE_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const REFERENCE_KINDS = new Set(['public_design', 'public_documentation', 'user_reference', 'local_project']);
export const DESIGN_SCHEMAS = {
  opening_frontend: 'rp-card-studio/opening-design/v1',
  message_frontend: 'rp-card-studio/message-design/v1'
};

function strings(record, keys, label, issues) {
  for (const key of keys) if (!nonempty(record?.[key])) issues.push('设计缺少具体内容：' + label + '.' + key);
}

function researchCheck(research, scope, issues, ledger) {
  if (!object(research) || !['reviewed', 'user_offline', 'unavailable', 'not_needed'].includes(research.status)) {
    issues.push('设计必须记录实际参考研究，不能以本地资料库代替外部研究'); return;
  }
  const references = research.references;
  if (!Array.isArray(references)) { issues.push('设计研究必须明确 references'); return; }
  if (research.status !== 'reviewed' && !nonempty(research.reason)) issues.push('设计研究未执行必须说明真实原因');
  if (research.status === 'user_offline') {
    issues.push(...validateDecisionRefs(research.decisionRefs, ledger, 'design.research.user_offline'));
    if (ledger && Array.isArray(research.decisionRefs) && research.decisionRefs.some(ref => ledger.decisions?.find(d => d.id === ref?.id)?.sourceKind !== 'user_confirmed')) issues.push('不联网必须来自用户明确要求，不能把代定或模型判断冒充用户限制');
  }
  if (research.status === 'not_needed' && scope !== 'targeted_revision') issues.push('新设计或方向重做不能默认为不需要参考研究');
  if (research.status === 'reviewed' && !references.length) issues.push('没有实际参考不能声明研究完成');
  const ids = new Set();
  for (const ref of references) {
    if (!nonempty(ref?.id) || ids.has(ref.id)) issues.push('设计参考 id 缺失或重复'); ids.add(ref?.id);
    if (!REFERENCE_KINDS.has(ref?.kind)) issues.push('本地设计索引/训练记忆不是已查看的外部参考：' + ref?.id);
    strings(ref, ['locator', 'checkedAt', 'observation', 'application'], 'research.' + ref?.id, issues);
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(ref?.checkedAt ?? '') || Number.isNaN(Date.parse(ref?.checkedAt))) issues.push('设计参考缺少有效查阅日期：' + ref?.id);
    if (typeof ref?.kind === 'string' && ref.kind.startsWith('public_')) {
      try { const url = new URL(ref.locator); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error(); }
      catch { issues.push('公开设计参考必须指向真实 HTTP(S) 来源：' + ref?.id); }
    }
  }
}

function feedbackCheck(feedback, ledger, issues) {
  if (!object(feedback) || !['none', 'open', 'resolved'].includes(feedback.status)) { issues.push('设计必须明确当前反馈状态'); return; }
  if (feedback.status === 'none') return;
  issues.push(...validateDecisionRefs(feedback.decisionRefs, ledger, 'design.feedback'));
  strings(feedback, ['diagnosis', 'changed', 'retained'], 'feedback', issues);
  if (!['content', 'interaction', 'representation', 'direction', 'local'].includes(feedback.kind)) issues.push('反馈必须区分内容、交互、表达、方向或局部问题');
  if (feedback.status === 'open') issues.push('设计反馈尚未解决，不能宣布设计覆盖完成');
  if (feedback.kind === 'direction' && !['recomposed', 'alternatives', 'retained_by_user'].includes(feedback.response)) issues.push('方向反馈需要重新构图/不同方案或真实用户保留依据，不能只追加装饰');
  if (feedback.kind === 'direction' && feedback.response === 'retained_by_user') {
    issues.push(...validateDecisionRefs(feedback.retainedByRefs, ledger, 'design.feedback.retained_by_user'));
    if (ledger && Array.isArray(feedback.retainedByRefs) && feedback.retainedByRefs.some(ref => ledger.decisions?.find(d => d.id === ref?.id)?.sourceKind !== 'user_confirmed')) issues.push('继续原方向必须有用户明确保留依据，不能拿代定替代');
  }
  if (feedback.kind === 'direction' && feedback.response === 'alternatives' && feedback.status === 'resolved') {
    if (!nonempty(feedback.selectedAlternative)) issues.push('仅展示备选不等于已解决方向，必须明确实际采用方案');
    issues.push(...validateDecisionRefs(feedback.selectionRefs, ledger, 'design.feedback.selectedAlternative'));
  }
}

export function validateFrontendDesign(design, stage, { ledger, surfaces = [] } = {}) {
  const issues = [];
  const knownSurfaces = Array.isArray(surfaces) ? surfaces : [];
  if (!DESIGN_SCHEMAS[stage] || !object(design) || design.schema !== DESIGN_SCHEMAS[stage]) return { ok: false, issues: ['缺少当前阶段独立的设计记录：' + stage] };
  if (!['new', 'redesign', 'targeted_revision'].includes(design.scope)) issues.push('设计必须声明 new/redesign/targeted_revision');
  issues.push(...validateDecisionRefs(design.directionRefs, ledger, stage + '.design.direction'));
  researchCheck(design.research, design.scope, issues, ledger);
  feedbackCheck(design.feedback, ledger, issues);
  if (stage === 'opening_frontend') {
    for (const part of ['worldIntroduction', 'playGuide', 'characterCreation']) {
      const item = design.entryPlan?.[part];
      if (!['included', 'omitted'].includes(item?.mode)) issues.push('开场必须分别说明介绍/指南/创角的采用范围：' + part);
      if (item?.mode === 'omitted') { if (!nonempty(item.reason)) issues.push('开场不制作项缺少依据：' + part); }
      else if (item?.mode === 'included') {
        if (!nonempty(item.approach) || !Array.isArray(item.surfaceIds) || !item.surfaceIds.length || item.surfaceIds.some(id => !knownSurfaces.some(s => s.id === id))) issues.push('开场内容缺少呈现方式或真实页面：' + part);
      }
    }
    strings(design.artDirection, ['composition', 'typography', 'colorRoles', 'imagery', 'motion'], 'opening.artDirection', issues);
    strings(design.pageFlow, ['orientation', 'navigation', 'creation', 'completion'], 'opening.pageFlow', issues);
    if (design.boundary !== 'page_local') issues.push('开场设计应以页面内流程和明确出口为边界，不继承持续状态栏规则');
  } else {
    if (!Array.isArray(design.playPlan?.frequentTasks) || !design.playPlan.frequentTasks.length || design.playPlan.frequentTasks.some(x => !nonempty(x))) issues.push('持续前端必须明确实际高频游玩任务');
    strings(design.playPlan, ['priority', 'readingRhythm', 'actionSemantics', 'snapshotScope'], 'message.playPlan', issues);
    strings(design.visualDirection, ['composition', 'typography', 'colorRoles', 'semanticGraphics', 'interactionStates'], 'message.visualDirection', issues);
    strings(design.comfortPlan, ['density', 'longContent', 'changeFeedback', 'repeatUse', 'mobile'], 'message.comfortPlan', issues);
  }
  return { ok: issues.length === 0, issues };
}

// Images establish current rendered evidence, not aesthetic quality or user acceptance.
export function validateDesignReview(review, stage, { root, interview, bindingResults = [], checkSteps = [] } = {}) {
  const issues = [];
  if (!object(review) || review.schema !== 'rp-card-studio/frontend-design-review/v1' || review.stage !== stage || review.status !== 'reviewed') return { ok: false, issues: ['前端尚无独立、已执行的设计复核：' + stage] };
  if (review.designSha256 !== textHash(JSON.stringify(interview?.design ?? null))) issues.push('设计方案已变化，视觉复核必须重做：' + stage);
  const dimensions = stage === 'opening_frontend'
    ? ['worldPresentation', 'guideComprehension', 'creationFlow', 'visualExecution']
    : ['readingPriority', 'actionClarity', 'longSessionComfort', 'visualExecution'];
  for (const id of dimensions) {
    const check = review.observations?.[id];
    const omitted = { worldPresentation: 'worldIntroduction', guideComprehension: 'playGuide', creationFlow: 'characterCreation' }[id];
    const mayOmit = stage === 'opening_frontend' && interview?.design?.entryPlan?.[omitted]?.mode === 'omitted';
    if (!nonempty(check?.observation) || !(check?.result === 'pass' || mayOmit && check?.result === 'not_applicable')) issues.push('设计复核缺少当前画面的具体观察：' + stage + '.' + id);
  }
  const cases = review.caseIds;
  if (!Array.isArray(cases) || !cases.length || new Set(cases).size !== cases.length) return { ok: false, issues: [...issues, '设计复核必须引用实际预览用例'] };
  const measured = checkSteps.flatMap(s => s.ok && s.payload?.level === 'browser-fixture' ? s.payload.results ?? [] : []);
  let index;
  try { index = JSON.parse(fs.readFileSync(resolveProjectPath(root, STATE_DIR + '/检查结果/前端预览/current.json'), 'utf8')); }
  catch { issues.push('缺少当前工具生成的前端预览索引'); }
  const accepted = [];
  for (const id of cases) {
    const actual = measured.find(m => m.id === id && m.ok && m.screenshot?.component === stage);
    const shot = actual?.screenshot;
    const bound = bindingResults.find(b => b.id === actual?.binding && b.component === stage && b.ok);
    const indexed = Array.isArray(index?.images) ? index.images.find(i => i.component === stage && i.caseId === id && i.sha256 === shot?.sha256 && i.targetSha256 === bound?.targetSha256) : undefined;
    if (!shot || !bound || actual.targetSha256 !== bound.targetSha256 || shot.targetSha256 !== bound.targetSha256 || !indexed || indexed.path !== shot.path) { issues.push('视觉复核没有绑定当前实际导入内容和截图：' + id); continue; }
    for (const key of ['viewport', 'frame', 'fieldIds', 'previewKind', 'resources', 'blockedResources', 'clipped']) if (JSON.stringify(indexed[key]) !== JSON.stringify(shot[key])) issues.push('截图观察元数据与当前工具索引不一致：' + id + '.' + key);
    if (shot.previewKind !== 'visual' || shot.clipped || (shot.blockedResources?.length ?? 0)) issues.push('缺资源、断网回退或截断截图不能冒充完整视觉：' + id);
    try {
      requireArea(shot.path, STATE_DIR + '/检查结果/前端预览', '视觉截图');
      const bytes = fs.readFileSync(resolveProjectPath(root, shot.path));
      if (textHash(bytes) !== shot.sha256 || bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('截图已变化或不是 PNG');
      if (!shot.frame || bytes.readUInt32BE(16) <= 0 || bytes.readUInt32BE(20) <= 0 || Math.abs(bytes.readUInt32BE(16) - shot.frame.width) > 1 || Math.abs(bytes.readUInt32BE(20) - shot.frame.height) > 1) throw Error('PNG 尺寸与实际捕获容器不一致');
    } catch (error) { issues.push('视觉截图不可核验：' + id + ': ' + error.message); }
    accepted.push(actual);
  }
  for (const surface of Array.isArray(interview?.surfaces) ? interview.surfaces : []) {
    const own = accepted.filter(a => a.surfaceId === surface.id);
    if (!own.some(a => a.screenshot.viewport?.width <= 480) || !own.some(a => a.screenshot.viewport?.width >= 900)) issues.push('页面缺少窄屏与宽屏的实际视觉复核：' + surface.id);
    for (const field of surface.fields ?? []) if (!own.some(a => a.screenshot.fieldIds?.includes(field.id))) issues.push('设计复核截图未展示实际字段：' + surface.id + '.' + field.id);
    for (const action of surface.actions ?? []) if (action.visualState && !own.some(a => a.actionId === action.id)) issues.push('设计复核缺少关键操作后的视觉状态：' + surface.id + '.' + action.id);
  }
  return { ok: issues.length === 0, issues, level: 'design-evidence', runtime: 'not_run', userAcceptance: 'not_recorded' };
}
