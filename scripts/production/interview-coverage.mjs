import { textHash } from './artifact-bindings.mjs';
export const DEPTH_RANK = { surface: 1, structured: 2, detailed: 3, runtime: 4 };

export const INTERVIEW_PROFILES = {
  opening_frontend: {
    experience_scope: 'detailed',
    content_hierarchy: 'detailed',
    creation_scope: 'detailed',
    handoff: 'structured',
    visual: 'structured',
    host_runtime: 'runtime'
  },
  message_frontend: {
    information_architecture: 'detailed',
    state_source: 'detailed',
    lifecycle: 'runtime',
    interaction: 'detailed',
    display_policy: 'detailed',
    fallback: 'detailed',
    carrier: 'runtime',
    host_regression: 'runtime'
  },
  ejs: {
    purpose: 'detailed',
    execution_stage: 'detailed',
    scope_contract: 'detailed',
    output_channel: 'detailed',
    side_effects: 'detailed',
    runtime_settings: 'runtime',
    failure_fallback: 'detailed',
    getwi_or_preprocessing: 'structured',
    iframe_or_raw_message: 'runtime',
    mvu_bridge: 'detailed'
  },
  mvu: {
    purpose: 'detailed',
    state_roots: 'detailed',
    ownership: 'detailed',
    initialization: 'detailed',
    update_protocol: 'detailed',
    path_index: 'structured',
    variable_list: 'structured',
    consumers: 'detailed',
    migration: 'structured',
    runtime_regression: 'runtime'
  }
};

const ACCEPTED_SOURCES = new Set(['user_confirmed', 'delegated', 'material_fact']);
const COVERAGE_SOURCES = new Set([...ACCEPTED_SOURCES, 'mixed']);

export function validateInterviewCoverage(interview, profileName, { ledger } = {}) {
  const profile = INTERVIEW_PROFILES[profileName];
  const issues = [];
  if (!profile) return { ok: false, issues: [`没有定义访谈覆盖 profile：${profileName}`] };
  if (!interview || !['covered', 'accepted'].includes(interview.status)) issues.push(`访谈未达到 covered/accepted：${profileName}`);
  const coverage = interview?.coverage;
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) issues.push(`访谈缺少 coverage：${profileName}`);
  for (const [dimension, minimum] of Object.entries(profile)) {
    const item = coverage?.[dimension];
    if (!item || !COVERAGE_SOURCES.has(item.sourceKind) || !item.evidence) {
      issues.push(`访谈缺少可追溯维度：${profileName}.${dimension}`);
      continue;
    }
    const actual = DEPTH_RANK[item.depth] ?? 0;
    if (actual < DEPTH_RANK[minimum]) issues.push(`访谈深度不足：${profileName}.${dimension} 需要 ${minimum}，实际 ${item.depth ?? '未声明'}`);
    if (!['confirmed', 'delegated', 'deferred', 'not_applicable'].includes(item.status)) issues.push(`访谈维度状态无效：${profileName}.${dimension}`);
  }
  if (ledger) for (const [dimension, item] of Object.entries(coverage ?? {})) {
    issues.push(...validateDecisionRefs(item?.decisionRefs, ledger, profileName + '.' + dimension));
    if (Array.isArray(item?.decisionRefs)) {
      const kinds = new Set(item.decisionRefs.map(ref => ledger.decisions?.find(d => d.id === ref.id)?.sourceKind));
      const expected = kinds.size === 1 ? [...kinds][0] : 'mixed';
      if (item.sourceKind !== expected) issues.push('访谈来源分类与当前决定不一致，不得把代定或材料事实标为用户确认：' + dimension);
    }
    if (item?.evidence && Array.isArray(item.decisionRefs)) {
      const projection = item.decisionRefs.map(ref => ledger.decisions?.find(d => d.id === ref.id)?.text ?? '').join('\n');
      if (item.evidence !== projection) issues.push('访谈 evidence 必须逐字投影当前决定，不得另写确认摘要：' + dimension);
    }
  }
  if (['opening_frontend', 'message_frontend'].includes(profileName)) issues.push(...validateSurfaceDetails(interview?.surfaces, { ledger }));
  for (const item of interview?.blockingUnresolved ?? []) issues.push(`仍有阻断性未决项：${item}`);
  for (const item of interview?.unexpandedDependencies ?? []) issues.push(`仍有未展开的访谈依赖项：${item}`);
  return { ok: issues.length === 0, issues, profile: profileName };
}

export function renderInterviewCoverage(interview, profileName) {
  const profile = INTERVIEW_PROFILES[profileName] ?? {};
  return Object.entries(profile).map(([dimension, minimum]) => {
    const item = interview?.coverage?.[dimension];
    return {
      dimension,
      requiredDepth: minimum,
      status: item?.status ?? 'unasked',
      actualDepth: item?.depth ?? null,
      sourceKind: item?.sourceKind ?? null,
      evidence: item?.evidence ?? null
    };
  });
}


export function validateDecisionRefs(refs, ledger, label) {
  const issues = [];
  if (!Array.isArray(refs) || !refs.length) return ['缺少当前决定引用：' + label];
  const ids = new Set();
  for (const ref of refs) {
    if (!ref?.id || !/^[a-f0-9]{64}$/.test(ref.textSha256 ?? '') || ids.has(ref.id)) { issues.push('决定引用缺少 id/文本摘要或重复：' + label); continue; }
    ids.add(ref.id);
    if (!ledger) continue; // Structure-only calls do not authenticate user evidence.
    const decision = ledger.decisions?.find(d => d.id === ref.id);
    if (!decision || !ACCEPTED_SOURCES.has(decision.sourceKind)) issues.push('决定已撤回、未确认或不存在：' + label + ' -> ' + ref.id);
    else if (textHash(decision.text) !== ref.textSha256) issues.push('决定已更正，访谈引用过期：' + label + ' -> ' + ref.id);
  }
  return issues;
}

export function validateSurfaceDetails(surfaces, { ledger } = {}) {
  const issues = [], ids = new Set();
  if (!Array.isArray(surfaces) || !surfaces.length) return ['前端访谈必须展开实际页面，不得只标记大类 covered'];
  const checkChoice = (choice, label) => {
    if (typeof choice?.value !== 'string' || !choice.value.trim()) issues.push('页面缺少具体取舍：' + label);
    issues.push(...validateDecisionRefs(choice?.decisionRefs, ledger, label));
  };
  for (const surface of surfaces) {
    if (!surface?.id || ids.has(surface.id)) issues.push('页面 id 缺失或重复'); ids.add(surface?.id);
    for (const name of ['layout','visual','emptyState','failureState']) checkChoice(surface?.[name], surface?.id + '.' + name);
    for (const [kind, properties] of [['fields', ['source', 'representation']], ['actions', ['trigger', 'outcome', 'failure']]]) {
      const items = surface?.[kind];
      if (!Array.isArray(items)) { issues.push('页面必须明确 ' + kind + '：' + surface?.id); continue; }
      if (!items.length) checkChoice(surface[kind + 'Reason'], surface.id + '.' + kind + 'Reason');
      const itemIds = new Set();
      for (const item of items) {
        if (!item?.id || itemIds.has(item.id)) issues.push('页面字段/操作 id 缺失或重复：' + surface.id); itemIds.add(item?.id);
        for (const prop of properties) if (typeof item?.[prop] !== 'string' || !item[prop].trim()) issues.push('页面细项缺少 ' + prop + '：' + surface.id + '.' + item?.id);
        issues.push(...validateDecisionRefs(item?.decisionRefs, ledger, surface.id + '.' + item?.id));
      }
    }
  }
  return issues;
}
