import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { textHash } from '../production/artifact-bindings.mjs';
import { CHECK_DIR, resolveProjectPath } from '../project-layout.mjs';
import { contentForCase } from './run-browser-fixtures.mjs';
import { loadPreviewResources } from './preview-resources.mjs';
import { validateTuningControls, tuningValue, sourceHashes, loadStateSnapshot, jsonDifference } from './tuning-contract.mjs';

export function createWorkbenchController({ root, session, bindings, fixturesSource, close }) {
  const { c, binding, targetSha256, host, frame } = session;
  if (!['opening_frontend','message_frontend'].includes(binding.component)) throw Error('打磨必须属于明确的开场或消息前端阶段');
  const spec = c.workbench ?? {}, controls = validateTuningControls(spec.controls ?? []), hashes = sourceHashes(root, controls);
  const original = contentForCase(root, c, bindings), styleId = 'rp-tuning-' + randomUUID();
  const boundSource = { [binding.source.path]: textHash(fs.readFileSync(resolveProjectPath(root, binding.source.path))) };
  const values = {}, selector = c.resultFrame ?? '#' + (c.frameName ?? (c.surface === 'message_iframe' ? 'TH-message--2--0' : 'fixture-background-script'));
  const setupHashes = Object.fromEntries([c.frameSetup, c.hostSetup].filter(Boolean).map(relative => [relative, textHash(fs.readFileSync(resolveProjectPath(root, relative)))]));
  const adapter = spec.stateAdapter;
  if (adapter) {
    if (!['host','frame'].includes(adapter.scope) || ![adapter.read,adapter.write,adapter.context].every(name=>/^[A-Za-z_$][\w$]*$/.test(name ?? '')) || !Array.isArray(adapter.snapshots) || !adapter.snapshots.length) throw Error('状态适配必须声明真实夹具的读写函数、上下文函数、窗口和快照');
    const ids = new Set(); for (const snapshot of adapter.snapshots) { if (!snapshot.id || ids.has(snapshot.id) || !snapshot.label) throw Error('状态快照必须有唯一 id 和名称'); ids.add(snapshot.id); loadStateSnapshot(root, snapshot); }
  }
  let baseline = false, revision = 0, width = 720, pending, lastState, queue = Promise.resolve();
  const originalDefaults = {};
  const windowScope = scope => scope === 'host' ? host.locator('html') : frame.locator('html');
  const readState = async () => adapter ? windowScope(adapter.scope).evaluate((el, name) => { const fn = el.ownerDocument.defaultView[name]; if (typeof fn !== 'function') throw Error('夹具读取函数不存在：' + name); return fn(); }, adapter.read) : null;
  const contextKey='rp-context-'+randomUUID();
  const readContext = async () => windowScope(adapter.scope).evaluate(async (el,{name,key,token}) => {
    const doc=el.ownerDocument,fn=doc.defaultView[name];if(typeof fn!=='function')throw Error('夹具上下文函数不存在：'+name);
    if(!Object.hasOwn(doc,key))Object.defineProperty(doc,key,{value:token});
    const context=await fn();if(!context||typeof context!=='object'||Array.isArray(context)||!Object.keys(context).length)throw Error('夹具须返回明确的聊天/楼层/分支或等价目标身份');
    return{document:doc[key],context};
  },{name:adapter.context,key:contextKey,token:randomUUID()});
  function guard() {
    const now = contentForCase(root, c, bindings);
    if (now.targetSha256 !== targetSha256 || textHash(now.code) !== textHash(original.code)) throw Error('当前导入内容已经变化，必须重开打磨');
    for (const [relative, hash] of Object.entries({ ...hashes, ...setupHashes, ...boundSource })) if (textHash(fs.readFileSync(resolveProjectPath(root, relative))) !== hash) throw Error('源码或夹具已变化：' + relative);
    if (fixturesSource && textHash(fs.readFileSync(resolveProjectPath(root, fixturesSource.path))) !== fixturesSource.sha256) throw Error('用例文件已经变化');
    loadPreviewResources(root, c.resources);
    if (session.errors.length) throw Error('前端发生执行错误：' + session.errors.join('; '));
  }
  async function applyStyles() {
    const rules = controls.filter(control => Object.hasOwn(values, control.id)).map(control => `${control.selector}{${control.property}:${tuningValue(control, values[control.id])}!important}`);
    await frame.locator('html').evaluate((el, { id, css, disabled }) => { const doc = el.ownerDocument; let style = doc.getElementById(id); if (!style) { style = doc.createElement('style'); style.id = id; doc.head.append(style); } style.textContent = css; style.disabled = disabled; }, { id: styleId, css: rules.join('\n'), disabled: baseline });
    await fit();
  }
  async function fit() {
    const maximum = await host.evaluate(() => Math.max(240, innerWidth - (innerWidth >= 1000 ? 380 : 32)));
    await host.locator(selector).evaluate((element, value) => { element.style.width = value + 'px'; element.style.maxWidth = 'calc(100% - 32px)'; element.style.border = '0'; element.style.display = 'block'; element.style.margin = '16px'; }, Math.min(width, maximum));
    const height = await frame.locator('html').evaluate(el => Math.ceil(Math.max(el.scrollHeight, el.ownerDocument.body.scrollHeight)));
    await host.locator(selector).evaluate((element, value) => { element.style.height = value + 'px'; }, Math.min(Math.max(height, 240), 16000));
  }
  async function observations() {
    const result = [];
    for (const field of spec.observations ?? []) {
      if (!field.id || !field.selector) throw Error('观察项须指向实际页面节点');
      const nodes = frame.locator(field.selector), count = await nodes.count();
      if (!count) { result.push({ id: field.id, missing: true }); continue; }
      result.push(await nodes.first().evaluate((el, id) => { const style = getComputedStyle(el), rect = el.getBoundingClientRect(); return { id, text: el.textContent, value: 'value' in el ? el.value : undefined, visible: !!el.getClientRects().length, width: rect.width, height: rect.height, overflow: el.scrollWidth > el.clientWidth, fontSize: style.fontSize, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor }; }, field.id));
    }
    return result;
  }
  async function info() {
    if (Object.keys(values).length) await applyStyles();
    const defaults = {}, current = {};
    for (const control of controls) {
      const node = frame.locator(control.selector); if (!await node.count()) throw Error('调参节点不存在：' + control.selector);
      if (!Object.hasOwn(originalDefaults, control.id)) originalDefaults[control.id] = await node.first().evaluate((el, property) => getComputedStyle(el).getPropertyValue(property).trim(), control.property);
      defaults[control.id] = originalDefaults[control.id];
      current[control.id] = await node.first().evaluate((el, property) => getComputedStyle(el).getPropertyValue(property).trim(), control.property);
    }
    return { stage: binding.component, caseId: c.id, surfaceId: c.surfaceId, targetSha256, controls, defaults, current, values: { ...values }, baseline, width, revision, stateAdapter: adapter ? { snapshots: adapter.snapshots.map(({ id, label }) => ({ id, label })), scope: adapter.scope } : null, presets: spec.presets ?? [], observations: await observations(), lastState, pending: pending ? { id: pending.id, snapshotId: pending.snapshotId, differences: pending.differences, scope: adapter.scope, context:pending.context.context,caseId: c.id } : null, level: 'workbench-candidate', runtime: 'not_run', userAcceptance: 'not_recorded', blockedResources: [...session.blockedResources] };
  }
  async function exportRecord() {
    guard(); await applyStyles(); await frame.locator('body').evaluate(el => el.ownerDocument.fonts.ready);
    const prefix = CHECK_DIR + '/前端打磨/' + binding.component + '-' + textHash(c.id).slice(0,12), relative = prefix + '.json', image = prefix + '.png';
    const recordPath = resolveProjectPath(root, relative, { output: true }), imagePath = resolveProjectPath(root, image, { output: true });
    let old;
    if (fs.existsSync(recordPath)) { if (fs.lstatSync(recordPath).isSymbolicLink()) throw Error('打磨记录不能是链接'); old = JSON.parse(fs.readFileSync(recordPath, 'utf8')); const { integrity, ...content } = old; if (old.schema !== 'rp-card-studio/frontend-tuning/v1' || old.caseId !== c.id || old.stage !== binding.component || integrity !== textHash(JSON.stringify(content))) throw Error('同名记录不属于工具或已被修改，保留原文件'); }
    if (fs.existsSync(imagePath) && (!old || fs.lstatSync(imagePath).isSymbolicLink() || textHash(fs.readFileSync(imagePath)) !== old.screenshot?.sha256)) throw Error('同名截图已被修改，不能覆盖');
    if (baseline) throw Error('当前显示原样对照，先回到候选再导出');
    const toolVisibility = await host.evaluate(() => ['rpwb','rpwb-toggle'].map(id => { const node = document.getElementById(id), visibility = node?.style.visibility; if (node) node.style.visibility = 'hidden'; return { id, visibility }; }));
    let bytes;
    try { bytes = await host.locator(selector).screenshot({ animations: 'disabled' }); }
    finally { await host.evaluate(items => items.forEach(({ id, visibility }) => { const node = document.getElementById(id); if (node) node.style.visibility = visibility; }), toolVisibility); }
    guard();
    const record = { schema: 'rp-card-studio/frontend-tuning/v1', level: 'workbench-candidate', stage: binding.component, caseId: c.id, surfaceId: c.surfaceId, binding: { id: binding.id, target: binding.target }, targetSha256, controls, values: { ...values }, sourceHashes: { ...hashes, ...boundSource }, fixtures: fixturesSource, setupHashes, resources: c.resources ?? [], observations: await observations(), stateComparison: lastState ?? null,
      screenshot: { path: image, sha256: textHash(bytes), eligibleForDesignReview: false }, temporaryOverrides: true, runtime: 'not_run', userAcceptance: 'not_recorded', blockedResources: [...session.blockedResources] };
    record.integrity = textHash(JSON.stringify(record));
    fs.mkdirSync(path.dirname(recordPath), { recursive: true }); fs.writeFileSync(imagePath, bytes); fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
    return { path: relative, sourceApplied: false, level: record.level, runtime: 'not_run', userAcceptance: 'not_recorded' };
  }
  async function dispatch(method, input = {}) {
    if (method === 'close') { close(); return { closing: true }; }
    guard();
    if (method === 'info') return info();
    if (method === 'width') { if (!Number.isInteger(input.value) || input.value < 240 || input.value > 1800) throw Error('容器宽度须在 240 到 1800 之间'); width = input.value; await fit(); }
    else if (method === 'tune') { const control = controls.find(item => item.id === input.id); if (!control) throw Error('不存在该调参项'); tuningValue(control, input.value); values[control.id] = input.value; revision++; await applyStyles(); }
    else if (method === 'baseline') { baseline = input.value === true; await applyStyles(); }
    else if (method === 'reset') { if (input.id) { if (!controls.some(item => item.id === input.id)) throw Error('不存在该调参项'); delete values[input.id]; } else for (const id of Object.keys(values)) delete values[id]; baseline = false; revision++; await applyStyles(); }
    else if (method === 'preset') {
      const preset = spec.presets?.find(item => item.id === input.id); if (!preset) throw Error('不存在该项目预设');
      for (const [id, value] of Object.entries(preset.values)) { const control = controls.find(item => item.id === id); if (!control) throw Error('预设包含未知调参项'); tuningValue(control, value); }
      Object.assign(values, preset.values); revision++; await applyStyles();
    } else if (method === 'restore-values') {
      const record = input.record, { integrity, ...content } = record ?? {};
      if (record?.schema !== 'rp-card-studio/frontend-tuning/v1' || record.stage !== binding.component || record.caseId !== c.id || record.binding?.id !== binding.id || record.targetSha256 !== targetSha256 || integrity !== textHash(JSON.stringify(content))) throw Error('不是本阶段、本用例和当前内容的完整候选记录');
      if (JSON.stringify(record.controls) !== JSON.stringify(controls) || JSON.stringify(record.fixtures) !== JSON.stringify(fixturesSource) || JSON.stringify(record.sourceHashes) !== JSON.stringify({ ...hashes, ...boundSource }) || JSON.stringify(record.setupHashes) !== JSON.stringify(setupHashes) || JSON.stringify(record.resources ?? []) !== JSON.stringify(c.resources ?? [])) throw Error('记录对应的源码、用例或参数定义已变化');
      if (!record.values || typeof record.values !== 'object' || Array.isArray(record.values)) throw Error('候选参数必须是对象');
      for (const [id, value] of Object.entries(record.values)) { const control = controls.find(item => item.id === id); if (!control) throw Error('记录包含未知参数：' + id); tuningValue(control, value); }
      for (const id of Object.keys(values)) delete values[id]; Object.assign(values,record.values); baseline=false;pending=undefined;revision++;await applyStyles();
    } else if (method === 'preview-state') {
      if (!adapter) throw Error('当前用例没有声明状态适配');
      const snapshot = adapter.snapshots.find(item => item.id === input.id); if (!snapshot) throw Error('状态快照不存在');
      const loaded = loadStateSnapshot(root, snapshot), before = await readState();
      const context=await readContext();
      pending = { id: randomUUID(), snapshotId: snapshot.id, snapshotHash: loaded.sha256, data: loaded.data, before, beforeHash: textHash(JSON.stringify(before)), context, contextHash:textHash(JSON.stringify(context)), differences: jsonDifference(before, loaded.data), revision };
    } else if (method === 'cancel-state') pending = undefined;
    else if (method === 'apply-state') {
      const plan = pending; pending = undefined;
      if (!plan || input.id !== plan.id || plan.revision !== revision) throw Error('状态预览已失效，先重新查看差异');
      const current = await readState(), loaded = loadStateSnapshot(root, adapter.snapshots.find(item => item.id === plan.snapshotId));
      if(textHash(JSON.stringify(await readContext()))!==plan.contextHash)throw Error('聊天、楼层、分支或页面已变化，原确认无效');
      if (textHash(JSON.stringify(current)) !== plan.beforeHash || loaded.sha256 !== plan.snapshotHash) throw Error('状态或快照已变化，原确认无效');
      await windowScope(adapter.scope).evaluate(async (el, { name, read, context, key, expectedDocument, expectedContext, expectedState, data }) => {
        const doc=el.ownerDocument,w=doc.defaultView;
        if(doc[key]!==expectedDocument||JSON.stringify(await w[context]())!==JSON.stringify(expectedContext)||JSON.stringify(await w[read]())!==JSON.stringify(expectedState))throw Error('写入前目标或状态已变化，原确认无效');
        const fn=w[name];if(typeof fn!=='function')throw Error('夹具写入函数不存在');return fn(data);
      }, { name: adapter.write,read:adapter.read,context:adapter.context,key:contextKey,expectedDocument:plan.context.document,expectedContext:plan.context.context,expectedState:plan.before, data: plan.data });
      const actual = await readState(), sameContext=textHash(JSON.stringify(await readContext()))===plan.contextHash; lastState = { snapshotId: plan.snapshotId, scope: adapter.scope, context:plan.context.context, before: plan.before, expected: plan.data, actual, matchesExpected: sameContext&&!jsonDifference(plan.data, actual).length, observedFields: await observations() }; revision++; await fit();
      if (!lastState.matchesExpected) throw Error('状态已提交但读回与预期不同；保留实际状态，不声称成功');
    } else if (method === 'export') return exportRecord();
    else throw Error('未知打磨操作');
    return info();
  }
  return { initialize: async () => { await fit(); return info(); }, dispatch: (method, input) => { const operation = queue.then(() => dispatch(method, input)); queue = operation.catch(() => {}); return operation; }, dispose: async () => { await frame.locator('html').evaluate((el, id) => el.ownerDocument.getElementById(id)?.remove(), styleId).catch(() => {}); } };
}
