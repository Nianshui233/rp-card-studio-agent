import { paintIcons } from '../frontend-tools/icons.mjs';
const data = window.RP_DESIGN_LIBRARY, $ = id => document.getElementById(id);
const storageKey = 'rp-design-candidates:v1:' + data.stage;
let selected = new Set();
try { selected = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]').filter(id => data.entries.some(entry => entry.id === id))); } catch { /* Storage is optional, not acceptance evidence. */ }
let current;
$('title').textContent = data.stage === 'opening_frontend' ? '开场与创角 · 设计参考' : '持续游玩 · 设计参考';
$('intro').textContent = data.stage === 'opening_frontend' ? '世界呈现、游玩指南与页面内角色创建。' : '观察、查询、行动与长期阅读舒适度。';
$('total').textContent = data.entries.length;
for (const category of [...new Set(data.entries.map(entry => entry.category).filter(Boolean))]) { const option = document.createElement('option'); option.value = category; option.textContent = category; $('category').append(option); }
function payload() { return { schema: 'rp-card-studio/design-selection/v1', stage: data.stage, state: 'proposed', research: 'not_performed', userAcceptance: 'not_recorded', catalogSha256: data.catalogSha256, entries: [...selected].sort() }; }
function save() { try { localStorage.setItem(storageKey, JSON.stringify([...selected])); } catch { $('feedback').textContent = '浏览器未保存候选，可直接导出。'; } $('selection').textContent = selected.size ? `已选 ${selected.size} 项，仍为候选` : '尚未选择参考'; }
function showDemo() {
  const demo = data.demos[current?.preview]; $('demo-section').hidden = !demo;
  if (!demo) { $('demo').removeAttribute('srcdoc'); return; }
  $('demo-title').textContent = demo.title; $('demo-note').textContent = demo.description; $('demo').srcdoc = demo.html;
}
function inspect(entry) {
  current = entry; $('detail-title').textContent = entry.title; $('question').textContent = entry.question || entry.intent || '';
  $('application').textContent = entry.application || entry.outcome || ''; $('avoid').textContent = entry.avoid || '仅参考方法，不决定当前作品内容。';
  $('pick').checked = selected.has(entry.id); $('source').hidden = !entry.source;
  if (entry.source) $('source').href = entry.source; else $('source').removeAttribute('href');
  showDemo(); render(false);
}
function render(autoSelect = true) {
  const query = $('search').value.trim().toLowerCase();
  const entries = data.entries.filter(entry => (!$('category').value || entry.category === $('category').value) && (!$('kind').value || entry.kind === $('kind').value) && (!$('selected-only').checked || selected.has(entry.id)) && (!query || [entry.title, entry.question, entry.application, entry.outcome, ...(entry.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(query)));
  $('list').replaceChildren(); $('count').textContent = `${entries.length} / ${data.entries.length} 项`;
  for (const entry of entries) {
    const button = document.createElement('button'); button.className = 'reference'; button.type = 'button'; button.setAttribute('aria-pressed', String(current?.id === entry.id));
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = entry.category || ({ pattern: '任务模式', concern: '检查关注点' })[entry.kind];
    const title = document.createElement('strong'); title.textContent = entry.title;
    const summary = document.createElement('small'); summary.textContent = entry.question || entry.intent || entry.outcome;
    button.append(meta, title, summary); if (selected.has(entry.id)) { const mark = document.createElement('small'); mark.className = 'selected'; mark.textContent = '已加入候选'; button.append(mark); }
    button.onclick = () => { inspect(entry); if (innerWidth <= 760) $('inspector').scrollIntoView({ block: 'start' }); }; $('list').append(button);
  }
  $('inspector').hidden = !entries.length;
  if (autoSelect && entries.length && !entries.some(entry => entry.id === current?.id)) inspect(entries.find(entry => entry.preview) || entries[0]);
  if (!entries.length) { const empty = document.createElement('p'); empty.textContent = '没有匹配项。不自动替换成通用模板。'; $('list').append(empty); }
}
$('pick').onchange = () => { if (!current) return; $('pick').checked ? selected.add(current.id) : selected.delete(current.id); save(); render(); };
for (const id of ['search', 'category', 'kind', 'selected-only']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => render());
$('demo-width').onchange = () => { $('demo').style.width = $('demo-width').value; };
$('reset-demo').onclick = showDemo;
$('clear').onclick = () => { selected.clear(); save(); $('pick').checked = false; render(); };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(payload(), null, 2)); $('feedback').textContent = '候选清单已复制，未改变项目决定。'; } catch { $('feedback').textContent = '无法复制，请使用导出。'; } };
$('download').onclick = () => { const blob = new Blob([JSON.stringify(payload(), null, 2) + '\n'], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = data.stage + '.design-selection.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
save(); render(); paintIcons();
