import { acceptanceEvidenceIssue, isBareContinue } from './user-intent.mjs';
import { AUTOMATIC_QA_POLICY, automaticQaIssues } from './automatic-qa-policy.mjs';
// Portable structural checks. This is not a host hook or an authenticity verifier.
export const STAGES = ['preflight', 'continuation', 'materials', 'brainstorm', 'positioning', 'worldbuilding', 'character', 'systems', 'scenes', 'mvu', 'ejs', 'runtime_bridge', 'narrative_opening', 'opening_frontend', 'message_frontend', 'qa_delivery'];
export const STAGE_LABELS = Object.fromEntries(STAGES.map((id, i) => [id, ['预检', '续接检查', '材料与研究', '脑暴', '定位', '世界观', '角色', '系统', '场景', 'MVU', 'EJS', '运行桥接', '叙事与开场', '开场前端', '消息前端', 'QA 与交付'][i]]));
export const PROGRESS_LABELS = { not_started: '未进入', in_progress: '进行中', awaiting_handoff: '待交接', authored: '制作已提交，待审阅', delivered: '技术收尾已提交，待验收', closed: '已关闭', blocked: '阻断', deferred: '暂缓', skipped: '跳过' };
export const REVIEW_LABELS = { not_reviewed: '未审阅', pending: '待审阅', accepted: '用户已接受', rejected: '用户已否决', evidence_missing: '接受依据不足' };
export const OPTIONAL = new Set(['materials', 'brainstorm', 'systems', 'scenes', 'mvu', 'ejs', 'runtime_bridge', 'narrative_opening', 'opening_frontend', 'message_frontend']);
export function createStageLedger() {
  return {
    schema: 'rp-card-studio/stage-ledger/v1',
    stages: STAGES.map(id => ({ id, enabled: OPTIONAL.has(id) ? 'unresolved' : 'enabled', progress: id === 'preflight' ? 'in_progress' : 'not_started', review: 'not_reviewed', entryEvidence: null, acceptanceEvidence: null, handoff: null, reason: null })),
    userEvidence: [], authorizations: [], decisions: []
  };
}
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function validateStageLedger(ledger, currentStage) {
  const issues = [];
  if (!record(ledger) || ledger.schema !== 'rp-card-studio/stage-ledger/v1') return { ok: false, issues: ['阶段账本 schema 必须是 rp-card-studio/stage-ledger/v1'] };
  const arrays = ['stages', 'userEvidence', 'authorizations', 'decisions'];
  for (const key of arrays) if (!Array.isArray(ledger[key])) issues.push('阶段账本缺少数组：' + key);
  if (issues.length) return { ok: false, issues };
  const maps = {};
  for (const key of arrays) {
    maps[key] = new Map();
    for (const value of ledger[key]) {
      if (!record(value) || !nonempty(value.id)) { issues.push(key + ' 含无效记录或缺少 id'); continue; }
      if (maps[key].has(value.id)) issues.push(key + ' 重复 id：' + value.id);
      maps[key].set(value.id, value);
    }
  }
  if (ledger.stages.length !== STAGES.length || STAGES.some(id => !maps.stages.has(id))) issues.push('阶段账本必须完整列出 routing 的全部 ' + STAGES.length + ' 个阶段');
  const evidenceFor = (ref, stage, actions, context, target) => {
    const item = maps.userEvidence.get(ref);
    if (!item || item.role !== 'user' || item.stage !== stage || !actions.includes(item.action) || !nonempty(item.quote) || !nonempty(item.locator) || !Array.isArray(item.targets) || (target && !item.targets.includes(target))) {
      issues.push(context + ' 缺少有效用户依据或引用阶段/动作/目标不匹配：' + String(ref)); return null;
    }
    return item;
  };
  for (const value of maps.userEvidence.values()) {
    if (value.role !== 'user' || !STAGES.includes(value.stage) || !['start', 'delegate', 'confirm', 'accept', 'reject', 'skip'].includes(value.action) || !nonempty(value.quote) || !nonempty(value.locator) || !Array.isArray(value.targets) || value.targets.some(id => !nonempty(id))) issues.push('用户依据字段无效：' + value.id);
    // A locator to our own mutable state is not an independent user source.
    if (typeof value.locator === 'string' && /(?:^|[\\/])(?:authority\.md|NEXT\.md|acceptance\.json)(?:$|[#:\s])/i.test(value.locator)) issues.push('用户依据不能循环引用 Agent 账本：' + value.id);
    if (isBareContinue(value.quote) && ['start', 'delegate', 'confirm', 'accept', 'skip'].includes(value.action)) issues.push('单独的“继续”不能产生阶段/决定/授权依据：' + value.id);
  }
  let activeCount = 0;
  const handoffIds = new Set();
  for (const row of maps.stages.values()) {
    if (!STAGES.includes(row.id)) issues.push('未知阶段：' + row.id);
    if (!['enabled', 'unresolved', 'disabled'].includes(row.enabled)) issues.push('阶段启用状态无效：' + row.id);
    if (!Object.hasOwn(PROGRESS_LABELS, row.progress)) issues.push('阶段进度无效：' + row.id);
    if (!Object.hasOwn(REVIEW_LABELS, row.review)) issues.push('阶段用户审阅状态无效：' + row.id);
    if (['in_progress', 'awaiting_handoff', 'blocked'].includes(row.progress)) {
      activeCount++;
      if (row.id !== currentStage) issues.push('非当前阶段不得处于活动状态：' + row.id);
    }
    if (!['not_started', 'skipped', 'deferred'].includes(row.progress) && row.enabled !== 'enabled') issues.push('未启用阶段不能制作或关闭：' + row.id);
    if (row.entryEvidence !== null && row.entryEvidence !== undefined) evidenceFor(row.entryEvidence, row.id, ['start', 'delegate'], row.id + ' 进入阶段', row.id);
    // preflight/continuation only permit administrative setup without an entry grant.
    if (!['not_started', 'skipped', 'deferred', 'blocked'].includes(row.progress) && !['preflight', 'continuation'].includes(row.id) && !row.entryEvidence && !row.automaticExecution) issues.push('阶段缺少执行许可依据：' + row.id);
    issues.push(...automaticQaIssues(ledger, row));
    if (row.progress === 'delivered' && row.id !== 'qa_delivery') issues.push('技术交付状态只能用于 QA，不代表创作接受：' + row.id);
    if (row.progress === 'authored' && (row.id === 'qa_delivery' || row.technicalContinuation?.policy !== AUTOMATIC_QA_POLICY || row.technicalContinuation.entryEvidence !== row.entryEvidence || row.technicalContinuation.handoffId !== row.handoff?.id)) issues.push('制作待审阅状态必须由自动 QA 承接，不能用它绕过交接：' + row.id);
    if (row.review === 'accepted' && row.progress !== 'closed') issues.push('用户接受仅对应已关闭的精确阶段成果，修改后必须重开审阅：' + row.id);
    if (row.review === 'accepted' || row.progress === 'closed') {
      if (row.review !== 'accepted') issues.push('已关闭阶段必须有用户接受：' + row.id);
      const evidence = evidenceFor(row.acceptanceEvidence, row.id, ['accept'], row.id + ' 用户接受', row.handoff?.id || '__missing_handoff__');
      if (evidence && evidence.responseTo !== row.handoff?.id) issues.push('用户接受必须回应本阶段交接：' + row.id);
      if (evidence) {
        const intentIssue = acceptanceEvidenceIssue(evidence, row.handoff?.id);
        if (intentIssue) issues.push(intentIssue);
      }
    } else if (row.acceptanceEvidence) issues.push('未接受阶段不能保留生效的接受依据：' + row.id);
    if (['awaiting_handoff', 'authored', 'delivered', 'closed'].includes(row.progress)) {
      if (!record(row.handoff) || !nonempty(row.handoff.id) || !nonempty(row.handoff.locator) || !Array.isArray(row.handoff.artifacts) || !row.handoff.artifacts.length || row.handoff.artifacts.some(item => !nonempty(item))) issues.push('阶段交接缺少报告定位或实际成果：' + row.id);
      if (['awaiting_handoff', 'authored', 'delivered'].includes(row.progress) && row.review !== 'pending') issues.push('待交接阶段必须保留用户待审阅状态：' + row.id);
    }
    if (record(row.handoff) && nonempty(row.handoff.id)) {
      if (handoffIds.has(row.handoff.id)) issues.push('交接 id 重复：' + row.handoff.id);
      handoffIds.add(row.handoff.id);
    }
    if (row.review === 'rejected' && ['closed', 'awaiting_handoff', 'authored', 'delivered', 'in_progress'].includes(row.progress)) issues.push('已否决阶段必须先重开/阻断并处理否决依据：' + row.id);
    if (row.progress === 'skipped') {
      if (row.reasonType === 'user_choice') evidenceFor(row.skipEvidence, row.id, ['skip'], row.id + ' 跳过', row.id);
      else if (row.reasonType !== 'not_applicable' || row.enabled !== 'disabled') issues.push('跳过必须有用户明确依据或明确不适用，不能静默跳过未回答阶段：' + row.id);
    }
    if (row.progress === 'not_started' && (row.review !== 'not_reviewed' || row.entryEvidence || row.acceptanceEvidence || row.handoff || row.automaticExecution)) issues.push('未进入阶段不得预填审阅、执行或完成状态：' + row.id);
    if (['skipped', 'deferred', 'blocked'].includes(row.progress) && !nonempty(row.reason)) issues.push('阶段跳过/暂缓/阻断必须记录原因：' + row.id);
  }
  if (!STAGES.includes(currentStage) || !maps.stages.has(currentStage)) issues.push('当前阶段无效：' + currentStage);
  else if (!['in_progress', 'awaiting_handoff', 'delivered', 'blocked', 'closed'].includes(maps.stages.get(currentStage).progress)) issues.push('当前阶段进度不能是未进入/跳过/暂缓');
  if (activeCount > 1) issues.push('同时只能有一个当前活动阶段');
  for (const auth of maps.authorizations.values()) {
    if (!STAGES.includes(auth.stage) || !['stage_delegation', 'scoped_delegation'].includes(auth.mode) || !['active', 'expired', 'revoked'].includes(auth.status) || auth.expires !== 'stage_handoff' || !Array.isArray(auth.scope) || !auth.scope.length || auth.scope.some(item => !nonempty(item)) || !Array.isArray(auth.exclusions) || auth.exclusions.some(item => !nonempty(item))) issues.push('授权字段不完整或无效：' + auth.id);
    evidenceFor(auth.userEvidence, auth.stage, ['delegate'], '授权 ' + auth.id, auth.id);
    if (auth.status === 'active' && (auth.stage !== currentStage || maps.stages.get(auth.stage)?.progress !== 'in_progress')) issues.push('授权只能在当前进行中阶段有效，待交接后必须到期：' + auth.id);
  }
  for (const decision of maps.decisions.values()) {
    if (!STAGES.includes(decision.stage) || !nonempty(decision.text) || !['user_confirmed', 'delegated', 'proposed', 'material_fact', 'unresolved', 'rejected'].includes(decision.sourceKind)) issues.push('决定记录无效：' + decision.id);
    if (decision.sourceKind === 'user_confirmed') {
      evidenceFor(decision.userEvidence, decision.stage, ['confirm'], '决定 ' + decision.id, decision.id);
      if (decision.authorization) issues.push('授权代定不能直接伪装为用户逐项确认：' + decision.id);
    } else if (decision.sourceKind === 'delegated') {
      const auth = maps.authorizations.get(decision.authorization);
      if (!auth || auth.stage !== decision.stage || auth.status === 'revoked' || !Array.isArray(auth.scope) || !auth.scope.includes(decision.scope)) issues.push('决定授权引用无效、跨阶段、已撤销或超出声明范围：' + decision.id);
      if (decision.userEvidence) issues.push('代定记录不能同时标为用户逐项确认：' + decision.id);
    } else if (decision.sourceKind === 'material_fact') {
      if (!nonempty(decision.materialSource)) issues.push('材料事实缺少来源定位：' + decision.id);
    } else if (decision.userEvidence || decision.authorization) issues.push('未确认/已否决提案不得保留生效的确认或授权引用：' + decision.id);
  }
  for (const row of maps.stages.values()) {
    if (row.progress === 'closed' && ledger.decisions.some(item => item && item.stage === row.id && ['proposed', 'unresolved'].includes(item.sourceKind) && item.blocking !== false)) issues.push('已关闭阶段仍有未解决承重决定：' + row.id);
  }
  return { ok: issues.length === 0, issues };
}
export function stageProgressLabel(row) {
  return row.id === 'qa_delivery' && row.automaticExecution && ['awaiting_handoff','delivered'].includes(row.progress) ? '技术收尾已提交，待验收' : PROGRESS_LABELS[row.progress];
}
export function stageAuthorizationLabel(ledger, id) {
  if (ledger.stages.find(s => s.id === id)?.automaticExecution) return '默认技术收尾（无创作放权）';
  const active = ledger.authorizations.filter(item => item.stage === id && item.status === 'active');
  if (active.some(item => item.mode === 'stage_delegation')) return '本阶段放权';
  if (active.length) return '限定授权';
  return ledger.authorizations.some(item => item.stage === id && item.status !== 'active') ? '已到期/撤销' : '未放权';
}
