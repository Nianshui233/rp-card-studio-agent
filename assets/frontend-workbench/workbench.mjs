import { paintIcons } from '../frontend-tools/icons.mjs';
const $ = id => document.getElementById('rpwb-' + id);
let info, serial = Promise.resolve();
const pendingValues = new Map();
const timers = new Map();
function cancelPending(id) { for (const [key, timer] of timers) if (!id || key === id) { clearTimeout(timer); timers.delete(key); pendingValues.delete(key); } }
function call(method, payload = {}) {
  const result = serial.then(async () => {
    try { const value = await window.__rpWorkbenchCall(method, payload); if (method === 'export') $('status').textContent = '已保存候选：' + value.path + '；源码未改动。'; else if (method !== 'close') { info = value; render(false); $('status').textContent = '当前是测试预览，不代表正式制品或酒馆验收。'; } return value; }
    catch (error) { $('status').textContent = error.message; throw error; }
  }); serial = result.catch(() => {}); return result;
}
function render(buildControls) {
  $('identity').textContent = (info.stage === 'opening_frontend' ? '开场 / 创角' : '持续消息') + ' · ' + info.caseId;
  $('baseline').checked = info.baseline; $('width').value = info.width;
  $('observations').textContent = JSON.stringify(info.observations, null, 2);
  $('state-section').hidden = !info.stateAdapter;
  $('state-diff').textContent = info.pending ? JSON.stringify(info.pending, null, 2) : '没有待确认批次。';
  $('state-actions').hidden = !info.pending;
  $('readback').textContent = info.lastState ? JSON.stringify(info.lastState, null, 2) : '';
  for (const control of info.controls) { const current = document.getElementById('rpwb-current-' + control.id); if (current) current.textContent = '当前计算值：' + info.current[control.id]; }
  if (!buildControls) return;
  $('controls').replaceChildren();
  for (const control of info.controls) {
    const row = document.createElement('div'); row.className = 'rpwb-control'; const label = document.createElement('label'); label.textContent = control.label;
    const node = document.createElement(control.type === 'select' ? 'select' : 'input'); node.id = 'rpwb-param-' + control.id; label.htmlFor = node.id;
    if (control.type === 'select') for (const option of control.options) { const child = document.createElement('option'); child.value = option.value; child.textContent = option.label; node.append(child); }
    else node.type = control.type === 'number' ? 'number' : 'color';
    if (control.type === 'number') { node.min = control.min; node.max = control.max; node.step = control.step; }
    const color = value => /^#[a-f\d]{6}$/i.test(value) ? value : '#' + ((value.match(/\d+(?:\.\d+)?/g) || ['49','95','75']).slice(0,3).map(channel => Math.round(Number(channel)).toString(16).padStart(2,'0')).join(''));
    if (control.type === 'select' && !Object.hasOwn(info.values,control.id) && !control.options.some(option => option.value === info.defaults[control.id])) { const untouched = new Option('原样：' + info.defaults[control.id], ''); untouched.disabled = true; node.prepend(untouched); }
    const raw=info.defaults[control.id], numeric=raw.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]*)$/i);
    const originalNumber=numeric && numeric[2]===(control.unit??'') && Number(numeric[1])>=control.min && Number(numeric[1])<=control.max && Math.abs((Number(numeric[1])-control.min)/control.step-Math.round((Number(numeric[1])-control.min)/control.step))<1e-6 ? Number(numeric[1]) : '';
    const initial = info.values[control.id] ?? (control.type === 'number' ? originalNumber : control.type === 'color' ? color(raw) : control.options.some(option => option.value === raw) ? raw : '');
    node.value=initial;if(control.type==='number'&&initial==='')node.placeholder='未设置';
    const read = () => control.type === 'number' ? Number(node.value) : node.value;
    node.oninput = () => { cancelPending(control.id); const value = read(); pendingValues.set(control.id, value); timers.set(control.id, setTimeout(() => { timers.delete(control.id); call('tune', { id: control.id, value }).catch(() => {}).finally(() => { if (pendingValues.get(control.id) === value) pendingValues.delete(control.id); }); }, 90)); };
    label.append(node); row.append(label);
    if (control.type === 'number') { const slider = document.createElement('input'); slider.type = 'range'; slider.min = control.min; slider.max = control.max; slider.step = control.step; slider.value = node.value; slider.setAttribute('aria-label', control.label); slider.oninput = () => { node.value = slider.value; node.dispatchEvent(new Event('input')); }; node.addEventListener('input', () => { slider.value = node.value; }); row.append(slider); }
    const base = document.createElement('small'); base.textContent = '原样：' + info.defaults[control.id] + (control.backport ? ' · 可回写源码' : ' · 仅预览'); row.append(base);
    const current = document.createElement('small'); current.id = 'rpwb-current-' + control.id; current.textContent = '当前计算值：' + info.current[control.id]; row.append(current);
    const reset = document.createElement('button'); reset.title = '复位 ' + control.label; reset.setAttribute('aria-label', reset.title); reset.innerHTML = '<i data-lucide="rotate-ccw"></i>'; reset.onclick = () => { cancelPending(control.id); call('reset', { id: control.id }).then(() => render(true)).catch(() => {}); }; row.append(reset); $('controls').append(row);
  }
  if (!info.controls.length) $('controls').textContent = '此用例尚未声明可调样式；仍可查看实际前端及字段。';
  $('presets-label').hidden = !info.presets.length; $('presets').replaceChildren(new Option('选择预设', '')); for (const preset of info.presets) $('presets').append(new Option(preset.label, preset.id));
  if (info.stateAdapter) { $('snapshots').replaceChildren(); for (const snapshot of info.stateAdapter.snapshots) $('snapshots').append(new Option(snapshot.label, snapshot.id)); }
  paintIcons();
}
document.getElementById('rpwb-toggle').onclick = () => { const panel = document.getElementById('rpwb'); panel.hidden = !panel.hidden; document.getElementById('rpwb-toggle').setAttribute('aria-expanded', String(!panel.hidden)); };
$('width').onchange = () => call('width', { value: Number($('width').value) }).catch(() => {});
$('baseline').onchange = () => call('baseline', { value: $('baseline').checked }).catch(() => {});
$('reset').onclick = () => { cancelPending(); call('reset').then(() => render(true)).catch(() => {}); };
$('presets').onchange = () => { if ($('presets').value) { cancelPending(); call('preset', { id: $('presets').value }).then(() => render(true)).catch(() => {}); } };
$('preview-state').onclick = () => call('preview-state', { id: $('snapshots').value }).catch(() => {});
$('snapshots').onchange = () => call('cancel-state').catch(() => {});
$('apply-state').onclick = () => call('apply-state', { id: info.pending?.id }).catch(() => {});
$('cancel-state').onclick = () => call('cancel-state').catch(() => {});
$('observe').onclick = () => call('info').catch(() => {});
$('export').onclick = () => { if (pendingValues.size) { $('status').textContent = '参数尚在更新，请稍后保存。'; return; } call('export').catch(() => {}); };
$('import').onchange = async () => { const file = $('import').files[0]; if (!file) return; try { if (file.size > 2 * 1024 * 1024) throw Error('候选文件过大'); const record = JSON.parse(await file.text()); cancelPending(); await call('restore-values',{record});render(true); } catch(error) { $('status').textContent=error.message; } finally { $('import').value=''; } };
$('close').onclick = () => call('close').catch(() => {});
window.addEventListener('resize', () => { if (info) call('width', { value: info.width }).catch(() => {}); });
window.addEventListener('rp-workbench-ready', () => call('info').then(() => { render(true); if (innerWidth < 1000) document.getElementById('rpwb-toggle').click(); }).catch(() => {}));
paintIcons();
