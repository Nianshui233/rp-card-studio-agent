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

export function validateInterviewCoverage(interview, profileName) {
  const profile = INTERVIEW_PROFILES[profileName];
  const issues = [];
  if (!profile) return { ok: false, issues: [`没有定义访谈覆盖 profile：${profileName}`] };
  if (!interview || !['covered', 'accepted'].includes(interview.status)) issues.push(`访谈未达到 covered/accepted：${profileName}`);
  const coverage = interview?.coverage;
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) issues.push(`访谈缺少 coverage：${profileName}`);
  for (const [dimension, minimum] of Object.entries(profile)) {
    const item = coverage?.[dimension];
    if (!item || !ACCEPTED_SOURCES.has(item.sourceKind) || !item.evidence) {
      issues.push(`访谈缺少可追溯维度：${profileName}.${dimension}`);
      continue;
    }
    const actual = DEPTH_RANK[item.depth] ?? 0;
    if (actual < DEPTH_RANK[minimum]) issues.push(`访谈深度不足：${profileName}.${dimension} 需要 ${minimum}，实际 ${item.depth ?? '未声明'}`);
    if (!['confirmed', 'delegated', 'deferred', 'not_applicable'].includes(item.status)) issues.push(`访谈维度状态无效：${profileName}.${dimension}`);
  }
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
