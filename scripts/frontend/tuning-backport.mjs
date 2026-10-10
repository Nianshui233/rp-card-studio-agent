import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { parse } from 'parse5';
import { atPointer, textHash } from '../production/artifact-bindings.mjs';
import { CHECK_DIR, DELIVERY_DIR, STATE_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { validateTuningControls, tuningValue } from './tuning-contract.mjs';
import { loadPreviewResources } from './preview-resources.mjs';

function replaceCss(text, edits) {
  const ast = postcss.parse(text);
  for (const edit of edits) {
    const found = [];
    ast.walkDecls(edit.property, declaration => { if (declaration.parent.type === 'rule' && declaration.parent.selector === edit.selector) found.push(declaration); });
    if (found.length !== 1) throw Error('CSS 回写目标缺失或不唯一：' + edit.selector + ' / ' + edit.property);
    found[0].value = edit.value;
  }
  return ast.toString();
}
function replaceHtml(text, edits) {
  const ast = parse(text, { sourceCodeLocationInfo: true }), styles = [];
  const walk = node => { if (node.tagName === 'style' && node.sourceCodeLocation?.startTag && node.sourceCodeLocation?.endTag) styles.push(node.sourceCodeLocation); for (const child of node.childNodes ?? []) walk(child); if (node.content) walk(node.content); };
  walk(ast);
  const groups = new Map();
  for (const edit of edits) {
    const matches = styles.filter(location => {
      let count = 0; postcss.parse(text.slice(location.startTag.endOffset, location.endTag.startOffset)).walkDecls(edit.property, declaration => { if (declaration.parent.type === 'rule' && declaration.parent.selector === edit.selector) count++; });
      return count > 0;
    });
    if (matches.length !== 1) throw Error('HTML 中的样式声明缺失或分布在多个 style 中：' + edit.selector + ' / ' + edit.property);
    const location = matches[0]; if (!groups.has(location)) groups.set(location, []); groups.get(location).push(edit);
  }
  for (const [location, group] of [...groups].sort((a,b) => b[0].startTag.endOffset - a[0].startTag.endOffset)) {
    const start = location.startTag.endOffset, end = location.endTag.startOffset;
    text = text.slice(0, start) + replaceCss(text.slice(start, end), group) + text.slice(end);
  }
  return text;
}
function replaceJson(text, edits) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  for (const edit of edits) {
    atPointer(data, edit.pointer);
    const parts = edit.pointer.slice(1).split('/').map(part => part.replaceAll('~1','/').replaceAll('~0','~'));
    if (parts.some(part => ['__proto__','prototype','constructor'].includes(part))) throw Error('不允许回写原型相关字段');
    let owner = data; for (const key of parts.slice(0,-1)) owner = owner[key]; owner[parts.at(-1)] = edit.value;
  }
  return (text.startsWith('\uFEFF') ? '\uFEFF' : '') + JSON.stringify(data, null, 2) + '\n';
}

export function createBackportPlan(root, record) {
  if (record?.schema !== 'rp-card-studio/frontend-tuning/v1' || !['opening_frontend','message_frontend'].includes(record.stage) || record.level !== 'workbench-candidate') throw Error('不是有效的当前调参记录');
  const controls = validateTuningControls(record.controls), production = JSON.parse(fs.readFileSync(resolveProjectPath(root, STATE_DIR + '/production.json'), 'utf8').replace(/^\uFEFF/, ''));
  const binding = production.bindings?.find(item => item.id === record.binding.id && item.component === record.stage);
  if (!binding || JSON.stringify(binding.target) !== JSON.stringify(record.binding.target)) throw Error('当前装配绑定已改变');
  const actual = atPointer(JSON.parse(fs.readFileSync(resolveProjectPath(root, DELIVERY_DIR + '/' + binding.target.path), 'utf8').replace(/^\uFEFF/, '')), binding.target.pointer);
  if (textHash(actual) !== record.targetSha256) throw Error('导入目标已改变，不能回写旧预览参数');
  if (record.fixtures) { requireArea(record.fixtures.path, CHECK_DIR, '用例来源'); if (textHash(fs.readFileSync(resolveProjectPath(root, record.fixtures.path))) !== record.fixtures.sha256) throw Error('用例已改变，旧调参记录失效'); }
  for (const [relative, expected] of Object.entries({ ...record.sourceHashes, ...record.setupHashes })) {
    requireArea(relative, relative in (record.setupHashes ?? {}) ? CHECK_DIR : '制作文件', '打磨来源');
    if (textHash(fs.readFileSync(resolveProjectPath(root, relative))) !== expected) throw Error('维护源码或夹具已改变：' + relative);
  }
  loadPreviewResources(root, record.resources);
  const groups = new Map();
  for (const [id, value] of Object.entries(record.values ?? {})) {
    const control = controls.find(item => item.id === id); if (!control) throw Error('记录包含未知调参项：' + id);
    const css = tuningValue(control, value); if (!control.backport) throw Error('参数没有已声明的源码回写位置：' + id);
    const backport = control.backport;
    if (!groups.has(backport.path)) groups.set(backport.path, []);
    groups.get(backport.path).push({ ...backport, id, value: backport.format === 'json' && control.type === 'number' ? value : css });
  }
  if (!groups.size) throw Error('没有待回写的参数');
  const files = [];
  for (const [relative, edits] of groups) {
    const file = resolveProjectPath(root, relative), before = fs.readFileSync(file), beforeHash = textHash(before);
    if (record.sourceHashes?.[relative] !== beforeHash) throw Error('维护源码已改变：' + relative);
    if (new Set(edits.map(edit => edit.format)).size !== 1) throw Error('同一文件的回写格式不一致');
    const text = before.toString('utf8'); if (!Buffer.from(text, 'utf8').equals(before)) throw Error('维护源码不是有效 UTF-8：' + relative);
    const afterText = edits[0].format === 'html' ? replaceHtml(text, edits) : edits[0].format === 'css' ? replaceCss(text, edits) : replaceJson(text, edits);
    const after = Buffer.from(afterText);
    files.push({ path: relative, beforeHash, afterHash: textHash(after), before, after, changes: edits.map(({ id, selector, property, pointer, value }) => ({ id, selector, property, pointer, value })) });
  }
  const receipt = { schema: 'rp-card-studio/tuning-plan/v1', stage: record.stage, caseId: record.caseId, recordSha256: textHash(JSON.stringify(record)), files: files.map(({ path, beforeHash, afterHash, changes }) => ({ path, beforeHash, afterHash, changes })), rebuildRequired: true, runtime: 'not_run', userAcceptance: 'not_recorded' };
  return { ...receipt, planSha256: textHash(JSON.stringify(receipt)), files };
}

export function applyBackportPlan(root, record, expectedPlan) {
  const plan = createBackportPlan(root, record);
  if (!expectedPlan || expectedPlan !== plan.planSha256) throw Error('回写计划缺失或已变化，必须先查看当前差异');
  const lockPath = resolveProjectPath(root, CHECK_DIR + '/.frontend-tuning.lock', { output: true }); fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const lock = fs.openSync(lockPath, 'wx'), staged = [], committed = [];
  try {
    for (const file of plan.files) {
      const target = resolveProjectPath(root, file.path), temp = target + '.rp-tune-' + randomUUID();
      if (textHash(fs.readFileSync(target)) !== file.beforeHash) throw Error('回写前源码发生变化：' + file.path);
      fs.writeFileSync(temp, file.after, { flag: 'wx', mode: fs.statSync(target).mode }); staged.push({ file, target, temp });
    }
    for (const item of staged) { if (textHash(fs.readFileSync(item.target)) !== item.file.beforeHash) throw Error('提交时源码发生变化：' + item.file.path); fs.renameSync(item.temp, item.target); committed.push(item); }
    for (const item of committed) if (textHash(fs.readFileSync(item.target)) !== item.file.afterHash) throw Error('回写读回不一致：' + item.file.path);
  } catch (error) {
    const conflicts = [];
    for (const item of committed.reverse()) { if (textHash(fs.readFileSync(item.target)) === item.file.afterHash) fs.writeFileSync(item.target, item.file.before); else conflicts.push(item.file.path); }
    throw Error(error.message + (conflicts.length ? '；部分文件被外部改动，未覆盖：' + conflicts.join(', ') : '；本工具已提交的改动已撤回'));
  } finally { for (const item of staged) if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp); fs.closeSync(lock); fs.unlinkSync(lockPath); }
  return { ok: true, planSha256: plan.planSha256, files: plan.files.map(file => ({ path: file.path, sha256: file.afterHash })), rebuildRequired: true, temporaryOverridesMustBeRemoved: true, runtime: 'not_run', userAcceptance: 'not_recorded' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opt = flag => { const i = process.argv.indexOf(flag); if (i < 0) return undefined; const value = process.argv[i + 1]; if (!value || value.startsWith('--')) throw Error(flag + ' 缺少值'); return value; };
    const root = path.resolve(opt('--root') || process.cwd()), recordPath = opt('--record'); requireArea(recordPath, CHECK_DIR, '调参记录');
    const record = JSON.parse(fs.readFileSync(resolveProjectPath(root, recordPath), 'utf8'));
    if (process.argv.includes('--apply')) console.log(JSON.stringify(applyBackportPlan(root, record, opt('--expected-plan')), null, 2));
    else { const plan = createBackportPlan(root, record); console.log(JSON.stringify({ ...plan, files: plan.files.map(({ before, after, ...rest }) => rest), written: false }, null, 2)); }
  } catch (error) { console.error(JSON.stringify({ ok: false, issues: [error.message] })); process.exitCode = 1; }
}
