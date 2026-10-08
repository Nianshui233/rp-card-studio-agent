import { validateEjsPackage } from '../ejs/validate-ejs-package.mjs';

export const REQUIRED_EJS_COMPONENTS = ['template_source', 'execution_contract', 'scope_contract', 'output_contract', 'side_effect_contract', 'runtime_settings', 'failure_fallback', 'version_pin', 'fixtures', 'host_regression'];

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }

export function validateEjsCompleteness(ejs = {}) {
  const issues = [];
  if (!ejs.enabled || ejs.mode === 'none') return { ok: true, issues: [], enabled: false };
  if (!['prompt_template', 'worldbook_template', 'render_template', 'existing'].includes(ejs.mode)) issues.push('EJS mode 无效或缺失');
  if (!Array.isArray(ejs.executionStages) || ejs.executionStages.length === 0) issues.push('EJS 缺少 executionStages');
  if (!object(ejs.contract)) issues.push('EJS 缺少 contract');
  if (!object(ejs.components)) issues.push('EJS 缺少 components');
  for (const component of REQUIRED_EJS_COMPONENTS) {
    const item = ejs.components?.[component];
    if (!item || item.status !== 'passed' || !item.path) issues.push(`EJS 缺少已通过组件：${component}`);
  }
  const sources = [...(Array.isArray(ejs.templates) ? ejs.templates : []), ...(Array.isArray(ejs.worldbook?.entries) ? ejs.worldbook.entries : Object.values(ejs.worldbook?.entries ?? {}))];
  const allText = sources.map(item => String(item?.content ?? item ?? '')).join('\n');
  const packageReport = validateEjsPackage({ ejsContract: ejs.contract, templates: ejs.templates, worldbook: ejs.worldbook });
  issues.push(...packageReport.issues);
  // In a correctness-first production route warnings are unresolved evidence, not harmless noise.
  issues.push(...packageReport.warnings.map(warning => `EJS warning 必须处理：${warning}`));
  if (packageReport.enabled && !nonempty(ejs.contract.failure)) issues.push('EJS 缺少失败回退合同');
  if (/\bgetwi\s*\(/i.test(allText) && !ejs.components?.getwi_contract?.path) issues.push('EJS 使用 getwi 但缺少 getwi_contract');
  if (/@@iframe/i.test(allText) && !ejs.components?.iframe_carrier?.path) issues.push('EJS 使用 @@iframe 但缺少 iframe_carrier');
  if (/@(?:preprocessing|generate_)/i.test(allText) && !ejs.components?.raw_message_contract?.path) issues.push('EJS 使用 preprocessing/generate 路径但缺少 raw_message_contract');
  if (packageReport.results.some(result => result.bridge !== 'none') && !ejs.components?.mvu_bridge?.path) issues.push('EJS 读取 MVU 但缺少 mvu_bridge');
  return { ok: issues.length === 0, issues, enabled: true, packageReport };
}
