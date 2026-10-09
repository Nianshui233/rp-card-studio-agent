import { WORK_DIR, requireArea } from '../project-layout.mjs';
import { validateMvuZodSourceContract } from '../mvu/validate-mvu-zod-source-contract.mjs';
import { readProject } from '../mvu/mvu-source-tools.mjs';
import { REQUIRED_MVU_COMPONENTS } from './production-manifest.mjs';

export async function validateMvuCompleteness(mvu, { root = null } = {}) {
  const issues = [];
  if (!mvu || ['none', 'unresolved'].includes(mvu.mode)) return { ok: true, issues };
  if (!['mvu', 'native_schema', 'mvu_zod'].includes(mvu.mode)) return { ok: false, issues: ['未知 MVU mode：' + mvu.mode] };
  if (!['covered', 'accepted'].includes(mvu.interviewStatus)) issues.push('MVU 访谈未完成，禁止进入实现/交接');
  for (const component of REQUIRED_MVU_COMPONENTS) {
    const item = mvu.components?.[component];
    if (!item?.path) { issues.push('MVU 缺少组件：' + component); continue; }
    try { requireArea(item.path, WORK_DIR, '制作组件 ' + component); if (!readProject(root, item.path).toString('utf8').trim()) throw new Error('空文件'); }
    catch (error) { issues.push('MVU 组件无法读取：' + component + '：' + error.message); }
  }
  let sourceResult;
  if (mvu.mode === 'mvu_zod') {
    if (!mvu.sourceContract) issues.push('MVU_ZOD 缺少 canonical source→build→import sourceContract');
    else {
      sourceResult = await validateMvuZodSourceContract(mvu.sourceContract, { root });
      issues.push(...sourceResult.issues);
      const required = { schema: 'schemaSource', initvar: 'initvar', variable_list: 'variableList', update_rules: 'updateRules', path_index: 'pathIndex', output_format: 'outputFormat', fixtures: 'fixtures', runtime_contract: 'runtimeContract', loader: 'loaderSource' };
      for (const [component, source] of Object.entries(required)) if (mvu.components?.[component]?.path !== mvu.sourceContract.paths?.[source]) issues.push('组件指针与 canonical source contract 不一致：' + component);
    }
  }
  return { ok: issues.length === 0, issues, ...(sourceResult ? { sourceResult } : {}) };
}
