export const AUTOMATIC_QA_POLICY = 'rp-card-studio/automatic-qa/v1';
const administrative = new Set(['preflight', 'continuation', 'qa_delivery']);
const ready = new Set(['awaiting_handoff', 'authored', 'closed']);

// This validates scope inheritance, not the authenticity of conversation evidence.
export function automaticQaIssues(ledger, row) {
  const issues = [], policy = row?.automaticExecution;
  if (!policy) return issues;
  if (row.id !== 'qa_delivery' || policy.policy !== AUTOMATIC_QA_POLICY || !['current_stage', 'selected_project'].includes(policy.scope)) return ['自动执行依据只能用于 QA 与交付，且必须声明范围'];
  if (row.entryEvidence) issues.push('自动 QA 不得同时制造用户进入阶段依据');
  if (!Array.isArray(policy.sources) || !policy.sources.length) return [...issues, '自动 QA 缺少已授权制作范围'];
  const seen = new Set();
  for (const source of policy.sources) {
    const stage = ledger.stages.find(s => s.id === source?.stage);
    const evidence = ledger.userEvidence.find(e => e.id === source?.entryEvidence);
    if (!stage || administrative.has(stage.id) || seen.has(stage.id)) { issues.push('自动 QA 来源阶段无效或重复'); continue; }
    seen.add(stage.id);
    if (stage.enabled !== 'enabled' || !ready.has(stage.progress) || stage.review === 'rejected') issues.push('自动 QA 来源尚未制作交接或已被否决：' + stage.id);
    if (!source.handoffId || stage.handoff?.id !== source.handoffId || stage.entryEvidence !== source.entryEvidence) issues.push('自动 QA 来源交接或许可已经变化：' + stage.id);
    if (!evidence || evidence.role !== 'user' || evidence.stage !== stage.id || !['start','delegate'].includes(evidence.action) || !evidence.targets?.includes(stage.id)) issues.push('自动 QA 必须继承真实制作许可：' + stage.id);
    if (ledger.decisions.some(d => d.stage === stage.id && ['proposed','unresolved','rejected'].includes(d.sourceKind) && d.blocking !== false)) issues.push('自动 QA 范围仍有未解决的承重决定：' + stage.id);
  }
  if (policy.scope === 'selected_project') for (const stage of ledger.stages) {
    if (administrative.has(stage.id)) continue;
    if (stage.enabled === 'unresolved') issues.push('整包收尾仍有启用待定阶段：' + stage.id);
    if (stage.enabled === 'enabled' && !seen.has(stage.id)) issues.push('整包收尾缺少已启用阶段：' + stage.id);
  }
  return issues;
}

export function createAutomaticQaPolicy(ledger, { sourceStage, scope = 'current_stage' } = {}) {
  const sources = scope === 'selected_project'
    ? ledger.stages.filter(s => !administrative.has(s.id) && s.enabled === 'enabled')
    : ledger.stages.filter(s => s.id === sourceStage);
  const policy = { policy: AUTOMATIC_QA_POLICY, scope, sources: sources.map(s => ({ stage: s.id, entryEvidence: s.entryEvidence, handoffId: s.handoff?.id })) };
  const issues = automaticQaIssues(ledger, { id: 'qa_delivery', entryEvidence: null, automaticExecution: policy });
  if (issues.length) throw new Error(issues.join('\n'));
  return policy;
}
