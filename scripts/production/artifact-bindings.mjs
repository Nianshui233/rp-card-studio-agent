import fs from 'node:fs';
import crypto from 'node:crypto';
import { DELIVERY_DIR, DELIVERY_MANIFEST, WORK_DIR, requireArea, safeRelative, resolveProjectPath } from '../project-layout.mjs';
import { validateActiveRouteManifest } from '../delivery/active-route.mjs';

export const textHash = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function atPointer(document, pointer) {
  if (pointer === '') return document;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new Error('必须提供 JSON Pointer');
  let value = document;
  for (const raw of pointer.slice(1).split('/')) {
    if (/~(?![01])/u.test(raw)) throw new Error('无效 JSON Pointer 转义');
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('目标字段不存在：' + pointer);
    value = value[key];
  }
  return value;
}

export function inspectBinding(root, binding, activePaths) {
  const issues = [];
  try {
    if (!binding?.id || !binding.component) throw new Error('装配绑定缺少 id/component');
    requireArea(binding.source?.path, WORK_DIR, '装配源');
    if (!safeRelative(binding.target?.path) || !activePaths.has(binding.target.path)) throw new Error('目标不属于当前实际导入路线：' + binding.target?.path);
    const sourceFile = resolveProjectPath(root, binding.source.path);
    let expected = binding.source.format === 'json' ? atPointer(json(sourceFile), binding.source.pointer) : fs.readFileSync(sourceFile, 'utf8');
    if (!['text', 'json'].includes(binding.source.format)) throw new Error('装配源必须声明 format:text/json');
    if (typeof expected !== 'string' || expected.trim().length === 0) throw new Error('装配源必须是非空的实际运行文本');
    const runtimeText = expected;
    if (binding.source.normalize && binding.source.normalize !== 'lf') throw new Error('装配源 normalize 只支持 lf');
    if (binding.component === 'ejs' && binding.runtimeKind !== 'provider_script' && !/<%|@@(?:preprocessing|generate_|iframe)/.test(expected)) throw new Error('EJS 绑定没有实际模板内容；静态兜底不能代替动态模板');
    if (binding.source.normalize === 'lf') expected = expected.replace(/\r\n?/g, '\n');
    if (binding.wrapper === 'fenced_html') expected = '```html\n' + expected + '\n```';
    else if (binding.wrapper && binding.wrapper !== 'none') throw new Error('未知装配 wrapper');
    const document = json(resolveProjectPath(root, DELIVERY_DIR + '/' + binding.target.path));
    const actual = atPointer(document, binding.target.pointer);
    const parentPointer = binding.target.pointer.slice(0, binding.target.pointer.lastIndexOf('/'));
    const owner = atPointer(document, parentPointer);
    const field = binding.target.pointer.slice(binding.target.pointer.lastIndexOf('/') + 1);
    const kind = binding.target.kind;
    if (!['worldbook_entry', 'regex', 'helper_script', 'card_field', 'config'].includes(kind)) throw new Error('必须声明实际目标种类');
    if (kind === 'worldbook_entry' && (field !== 'content' || owner.disable === true && binding.target.activation !== 'pull')) issues.push('世界书模板未位于有效 content，或实际条目禁用且未声明按名调用');
    if (kind === 'regex' && (field !== 'replaceString' || owner.disabled === true)) issues.push('替换载体未位于有效 replaceString 或规则禁用');
    if (kind === 'helper_script' && (field !== 'content' || owner.enabled !== true)) issues.push('脚本未位于启用的 content');
    if (typeof actual !== 'string') throw new Error('目标字段不是运行文本');
    if (!['equals', 'contains'].includes(binding.match)) throw new Error('装配 match 必须明确 equals/contains');
    if (binding.match === 'equals' ? actual !== expected : !actual.includes(expected)) issues.push('实际导入内容缺失或与当前装配源不同');
    return { id: binding.id, component: binding.component, route: binding.route ?? null, ok: !issues.length, issues, sourceSha256: textHash(runtimeText), targetSha256: textHash(actual) };
  } catch (error) { issues.push(error.message); return { id: binding?.id, component: binding?.component, route: binding?.route ?? null, ok: false, issues }; }
}

export function validateArtifactBindings(root, bindings, { requiredComponents = [] } = {}) {
  const issues = [], results = [], ids = new Set();
  try {
    const manifest = json(resolveProjectPath(root, DELIVERY_MANIFEST));
    const route = validateActiveRouteManifest(manifest, resolveProjectPath(root, DELIVERY_DIR)); issues.push(...route.issues);
    const components = manifest.routes?.[manifest.activeRoute]?.components ?? {};
    const paths = new Set(Object.values(components).map(v => typeof v === 'string' ? v : v?.path));
    if (!Array.isArray(bindings)) issues.push('缺少最终装配 bindings 数组');
    for (const binding of Array.isArray(bindings) ? bindings : []) {
      if (ids.has(binding?.id)) issues.push('重复装配绑定 id：' + binding?.id); ids.add(binding?.id);
      const result = inspectBinding(root, binding, paths); results.push(result); issues.push(...result.issues.map(i => String(binding?.id) + ': ' + i));
    }
    for (const component of requiredComponents) if (!results.some(r => r.component === component && r.ok)) issues.push('已启用组件没有有效的最终装配绑定：' + component);
  } catch (error) { issues.push(error.message); }
  return { ok: issues.length === 0, issues, results };
}


// The runtime index is generated from every instantiated template, not from a hand-written success summary.
export function validateEjsInstallations(root, ejs, bindings, results) {
  const issues = [];
  try {
    const index = ejs.runtimeIndex;
    requireArea(index?.path, WORK_DIR, 'EJS 运行实例索引');
    const entries = atPointer(json(resolveProjectPath(root, index.path)), index.pointer);
    if (!Array.isArray(entries) || !entries.length || !index.idField || !index.contentField) throw new Error('EJS 缺少非空运行实例索引及 idField/contentField');
    const ids = new Set();
    for (const [i, entry] of entries.entries()) {
      const id = entry[index.idField];
      if (!id || ids.has(id)) issues.push('EJS 运行实例 id 缺失或重复'); ids.add(id);
      const pointer = index.pointer + '/' + i + '/' + index.contentField.replaceAll('~','~0').replaceAll('/','~1');
      const found = (bindings ?? []).filter(b => b.component === 'ejs' && b.source?.path === index.path && b.source?.format === 'json' && b.source?.pointer === pointer);
      if (!found.length || found.some(b => !results.some(r => r.id === b.id && r.ok))) issues.push('EJS 运行实例未装进实际导入内容：' + id);
    }
  } catch (e) { issues.push(e.message); }
  return { ok: issues.length === 0, issues };
}
