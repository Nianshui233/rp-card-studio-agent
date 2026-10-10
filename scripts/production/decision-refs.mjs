import { textHash } from './artifact-bindings.mjs';

const ACCEPTED_SOURCES = new Set(['user_confirmed', 'delegated', 'material_fact']);

export function validateDecisionRefs(refs, ledger, label) {
  const issues = [];
  if (!Array.isArray(refs) || !refs.length) return ['缺少当前决定引用：' + label];
  const ids = new Set();
  for (const ref of refs) {
    if (!ref?.id || !/^[a-f0-9]{64}$/.test(ref.textSha256 ?? '') || ids.has(ref.id)) { issues.push('决定引用缺少 id/文本摘要或重复：' + label); continue; }
    ids.add(ref.id);
    if (!ledger) continue;
    const decision = ledger.decisions?.find(d => d.id === ref.id);
    if (!decision || !ACCEPTED_SOURCES.has(decision.sourceKind)) issues.push('决定已撤回、未确认或不存在：' + label + ' -> ' + ref.id);
    else if (textHash(decision.text) !== ref.textSha256) issues.push('决定已更正，访谈引用过期：' + label + ' -> ' + ref.id);
  }
  return issues;
}
