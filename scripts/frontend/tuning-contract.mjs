import fs from 'node:fs';
import { textHash } from '../production/artifact-bindings.mjs';
import { CODE_DIR, CHECK_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';

const properties = new Set(['font-size','line-height','gap','row-gap','column-gap','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-bottom','width','max-width','min-height','border-radius','color','background-color','border-color','grid-template-columns']);
export function validateTuningControls(controls = []) {
  if (!Array.isArray(controls)) throw Error('调参 controls 必须为数组');
  const ids = new Set(), destinations = new Set();
  for (const control of controls) {
    if (!/^[a-z][a-z0-9-]*$/.test(control?.id ?? '') || ids.has(control.id) || !control.label) throw Error('调参项必须有唯一 id 和名称');
    ids.add(control.id);
    if (typeof control.selector !== 'string' || !control.selector.trim() || /[{};\u0000-\u001f]/.test(control.selector)) throw Error('调参 selector 无效');
    if (!properties.has(control.property) && !/^--[a-zA-Z][\w-]*$/.test(control.property ?? '')) throw Error('不支持该 CSS 调参属性：' + control.property);
    if (!['number','color','select'].includes(control.type)) throw Error('调参控件必须是 number/color/select');
    if (control.type === 'number' && (![control.min, control.max, control.step].every(Number.isFinite) || control.min >= control.max || control.step <= 0 || !['','px','rem','em','%'].includes(control.unit ?? ''))) throw Error('数字参数必须有有效范围、步长与单位');
    if (control.type === 'select' && (!Array.isArray(control.options) || !control.options.length || control.options.some(option => !option.label || typeof option.value !== 'string' || /[{};]|url\s*\(/i.test(option.value)))) throw Error('选择参数缺少明确的 CSS 值');
    const backport = control.backport;
    if (backport) {
      requireArea(backport.path, CODE_DIR, '参数回写源');
      if (!['html','css','json'].includes(backport.format)) throw Error('回写源只能是 html/css/json');
      if (backport.format === 'json' ? typeof backport.pointer !== 'string' || !backport.pointer.startsWith('/') : !backport.selector || !backport.property || /[{};]/.test(backport.selector) || (!properties.has(backport.property) && !/^--[a-zA-Z][\w-]*$/.test(backport.property))) throw Error('回写必须定位已有字段或 CSS 声明');
      const destination = JSON.stringify([backport.path.replaceAll('\\','/'), backport.format, backport.pointer ?? backport.selector, backport.property ?? '']);
      if (destinations.has(destination)) throw Error('多个控件不能竞争同一回写位置'); destinations.add(destination);
    }
  }
  return controls;
}
export function tuningValue(control, value) {
  if (control.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max || Math.abs((value - control.min) / control.step - Math.round((value - control.min) / control.step)) > 1e-6) throw Error('参数超出范围或步长：' + control.id);
    return String(value) + (control.unit ?? '');
  }
  if (control.type === 'color') { if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) throw Error('颜色必须是六位十六进制'); return value; }
  if (!control.options.some(option => option.value === value)) throw Error('参数不属于实际选项：' + control.id);
  return value;
}
export function sourceHashes(root, controls) {
  return Object.fromEntries([...new Set(controls.flatMap(control => control.backport ? [control.backport.path] : []))].sort().map(relative => [relative, textHash(fs.readFileSync(resolveProjectPath(root, relative)))]));
}
export function loadStateSnapshot(root, snapshot) {
  requireArea(snapshot?.path, CHECK_DIR, '打磨状态快照');
  const bytes = fs.readFileSync(resolveProjectPath(root, snapshot.path));
  return { data: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), sha256: textHash(bytes) };
}
export function jsonDifference(before, after, pointer = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => jsonDifference(before[key], after[key], pointer + '/' + key.replaceAll('~','~0').replaceAll('/','~1')));
  }
  return [{ path: pointer || '/', before: before === undefined ? { missing: true } : before, after: after === undefined ? { missing: true } : after }];
}
