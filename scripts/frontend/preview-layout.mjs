import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textHash } from '../production/artifact-bindings.mjs';
import { STATE_DIR, resolveProjectPath } from '../project-layout.mjs';

const kinds = new Set(['section', 'tabs', 'fold', 'dialog', 'field', 'action', 'note']);
const clean = value => String(value ?? '').replace(/[\r\n\t\u0000-\u001f]/g, ' ').replaceAll('```', "'''").trim();
const items = value => Array.isArray(value) ? value : [];

export function inspectLayoutBlocks(surface) {
  const issues = [], fields = new Set(), actions = new Set(), containers = new Map(), tabs = new Map();
  for (const name of ['fields', 'actions']) if (surface?.[name] !== undefined && !Array.isArray(surface[name])) issues.push('预览的 ' + name + ' 必须是数组');
  const declaredFields = new Set(items(surface?.fields).map(f => f?.id));
  const declaredActions = new Set(items(surface?.actions).map(a => a?.id));
  if (declaredFields.size !== items(surface?.fields).length || declaredActions.size !== items(surface?.actions).length) issues.push('预览字段/操作 id 重复，不能合并成一个控件');
  for (const id of [...declaredFields, ...declaredActions]) if (typeof id !== 'string' || !id.trim()) issues.push('布局字段/操作必须有实际字符串 id');
  if (surface?.layout?.blocks === undefined) return { ok: issues.length === 0, issues, containers, tabs };
  const stack = new WeakSet();
  const visit = blocks => {
    if (!Array.isArray(blocks)) { issues.push('布局 blocks 必须是数组'); return; }
    for (const node of blocks) {
      if (!node || typeof node !== 'object' || !kinds.has(node.kind)) { issues.push('布局节点类型无效'); continue; }
      if (stack.has(node)) { issues.push('布局不能循环引用'); continue; }
      stack.add(node);
      if (node.kind === 'field') {
        if (!declaredFields.has(node.field)) issues.push('布局引用不存在的字段：' + node.field);
        fields.add(node.field);
      } else if (node.kind === 'action') {
        if (!declaredActions.has(node.action)) issues.push('布局引用不存在的操作：' + node.action);
        actions.add(node.action);
      } else if (node.kind === 'note') {
        if (!clean(node.text)) issues.push('布局说明不能为空');
      } else {
        if (!clean(node.label)) issues.push('布局分区缺少可读名称');
        if (['tabs', 'fold', 'dialog'].includes(node.kind)) {
          if (typeof node.id !== 'string' || !node.id.trim() || containers.has(node.id)) issues.push('可切换布局节点缺少唯一 id');
          containers.set(node.id, node);
        }
        if (node.kind === 'dialog') {
          if (!declaredActions.has(node.action)) issues.push('详情窗口缺少实际打开操作：' + node.action);
          actions.add(node.action);
        }
        if (node.kind === 'tabs') {
          const ids = new Set();
          if (!Array.isArray(node.items) || !node.items.length) issues.push('标签区缺少实际页面');
          for (const item of items(node.items)) {
            if (typeof item?.id !== 'string' || !item.id.trim() || ids.has(item.id) || !clean(item.label)) issues.push('标签页缺少唯一 id 或名称');
            ids.add(item?.id); visit(item?.blocks);
          }
          if (node.selected && !ids.has(node.selected)) issues.push('默认标签不在当前页面中');
          tabs.set(node.id, ids);
        } else visit(node.blocks);
      }
      stack.delete(node);
    }
  };
  if (surface?.layout?.blocks !== undefined) {
    visit(surface.layout.blocks);
    for (const id of declaredFields) if (!fields.has(id)) issues.push('布局遗漏已声明字段：' + id);
    for (const id of declaredActions) if (!actions.has(id)) issues.push('布局遗漏已声明操作：' + id);
  }
  return { ok: issues.length === 0, issues, containers, tabs };
}

export function renderLayoutPreview(surface, { tab = {}, expand = [], dialog = [] } = {}) {
  if (!surface?.id) throw new Error('预览缺少实际页面 id');
  const inspected = inspectLayoutBlocks(surface);
  const issues = [...inspected.issues];
  for (const [id, selected] of Object.entries(tab)) if (!inspected.tabs.get(id)?.has(selected)) issues.push('预览选择了不存在的标签：' + id + '=' + selected);
  for (const [kind, ids] of [['fold', expand], ['dialog', dialog]]) for (const id of ids) if (inspected.containers.get(id)?.kind !== kind) issues.push('预览状态不在当前布局中：' + id);
  if (issues.length) throw new Error(issues.join('\n'));
  const fields = new Map(items(surface.fields).map((f, i) => [f.id, { ...f, name: clean(f.label) || '字段 ' + (i + 1) + '（名称待定）' }]));
  const actions = new Map(items(surface.actions).map((a, i) => [a.id, { ...a, name: clean(a.label) || '操作 ' + (i + 1) + '（名称待定）' }]));
  const lines = ['【界面结构草图：' + clean(surface.label || '当前页面') + '】', '结构示意；不是成品截图，未接真实数据，未验证酒馆运行。'];
  lines.push('总体排列：' + clean(surface.layout?.value || '待定'));
  const visibleStates = new Set();
  const put = (depth, value) => lines.push('  '.repeat(depth) + value);
  const render = (blocks, depth = 0) => {
    for (const node of blocks) {
      if (node.kind === 'field') {
        const f = fields.get(node.field), example = f.example !== undefined ? '示例：' + clean(f.example) : '数据/选项待接入';
        put(depth, f.name + '：[' + clean(f.representation || '呈现方式待定') + '；' + example + ']');
      } else if (node.kind === 'action') {
        const a = actions.get(node.action);
        put(depth, '[' + a.name + '] -> ' + clean(a.outcome || '结果待定'));
      } else if (node.kind === 'note') put(depth, '（' + clean(node.text) + '）');
      else if (node.kind === 'tabs') {
        const selected = Object.hasOwn(tab, node.id) ? tab[node.id] : node.selected || node.items[0].id;
        if (Object.hasOwn(tab, node.id)) visibleStates.add('tabs:' + node.id);
        put(depth, '标签区：');
        for (const item of node.items) put(depth + 1, (item.id === selected ? '[当前] ' : '[切换] ') + clean(item.label));
        put(depth, '当前内容：' + clean(node.items.find(i => i.id === selected).label));
        render(node.items.find(i => i.id === selected).blocks, depth + 1);
      } else if (node.kind === 'fold') {
        const open = expand.includes(node.id) || node.open === true;
        if (expand.includes(node.id)) visibleStates.add('fold:' + node.id);
        put(depth, (open ? 'v ' : '> ') + clean(node.label) + (open ? '（展开）' : '（收起）'));
        if (open) render(node.blocks, depth + 1);
      } else if (node.kind === 'dialog') {
        const open = dialog.includes(node.id);
        if (open) visibleStates.add('dialog:' + node.id);
        put(depth, clean(node.label) + (open ? '（详情窗口展开）' : '（点击「' + actions.get(node.action).name + '」后打开）'));
        if (open) render(node.blocks, depth + 1);
      } else { put(depth, clean(node.label)); render(node.blocks, depth + 1); }
    }
  };
  if (surface.layout?.blocks) render(surface.layout.blocks);
  else {
    lines.push('内容位置尚未展开，以下只是字段与操作清单，不冒充布局已确定。');
    render([...fields.keys()].map(field => ({ kind: 'field', field })).concat([...actions.keys()].map(action => ({ kind: 'action', action }))));
  }
  for (const [kind, ids] of [['tabs', Object.keys(tab)], ['fold', expand], ['dialog', dialog]]) for (const id of ids) {
    if (!visibleStates.has(kind + ':' + id)) throw new Error('所选状态位于未显示的标签或收起区，请先选择/展开对应页面：' + id);
  }
  lines.push('空白/未接入：' + clean(surface.emptyState?.value || '待定'));
  lines.push('加载失败：' + clean(surface.failureState?.value || '待定'));
  return { ok: true, level: 'layout-draft', runtime: 'not_run', userReview: 'not_recorded', surfaceId: surface.id,
    sourceSha256: textHash(JSON.stringify(surface)), text: '```text\n' + lines.join('\n') + '\n```' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = name => process.argv.flatMap((value, i) => {
    if (value !== name) return [];
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(name + ' 必须提供明确值');
    return [process.argv[i + 1]];
  });
  try {
    const root = path.resolve(values('--root')[0] || process.cwd()), stage = values('--stage')[0];
    if (!['opening_frontend', 'message_frontend'].includes(stage)) throw new Error('预览必须选择开场或消息前端阶段');
    const production = JSON.parse(fs.readFileSync(resolveProjectPath(root, STATE_DIR + '/production.json'), 'utf8').replace(/^\uFEFF/, ''));
    const id = values('--surface')[0], surfaces = production.interviews?.[stage]?.surfaces?.filter(s => !id || s.id === id);
    if (!surfaces?.length) throw new Error('没有找到当前项目的页面需求，不能拿样本替代');
    const tab = Object.fromEntries(values('--tab').map(value => { const at = value.indexOf('='); if (at < 1) throw new Error('--tab 必须是标签区id=标签页id'); return [value.slice(0, at), value.slice(at + 1)]; }));
    if (!id && surfaces.length > 1 && (Object.keys(tab).length || values('--expand').length || values('--dialog').length)) throw new Error('切换状态时必须明确 --surface，不能跨页面套用状态');
    const results = surfaces.map(surface => renderLayoutPreview(surface, { tab, expand: values('--expand'), dialog: values('--dialog') }));
    console.log(process.argv.includes('--json') ? JSON.stringify({ ok: true, level: 'layout-draft', runtime: 'not_run', results }, null, 2) : results.map(r => r.text).join('\n\n'));
  } catch (error) { console.error(JSON.stringify({ ok: false, issues: [error.message] })); process.exitCode = 1; }
}
