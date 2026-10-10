import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DESIGN_GUIDES = {
  opening_frontend: 'internal-skills/st-opening-frontend-authoring/references/opening-design',
  message_frontend: 'internal-skills/st-message-frontend-authoring/references/message-design'
};

export function loadDesignGuide(stage) {
  const base = DESIGN_GUIDES[stage];
  if (!base) throw Error('必须选择 opening_frontend 或 message_frontend，不能使用统一前端设计 profile');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, base + '.json'), 'utf8'));
  if (catalog.stage !== stage || catalog.schema !== 'rp-card-studio/design-catalog/v1') throw Error('设计资料与阶段不匹配');
  return { base, catalog };
}

export function designEntries(catalog) {
  return [['pattern', catalog.patterns], ['concern', catalog.concerns], ['reference', catalog.references]].flatMap(([kind, entries]) => (entries ?? []).map(entry => ({ ...entry, kind })));
}

export function searchDesignGuide(stage, query = '', limit = 4, { category, kind } = {}) {
  const { base, catalog } = loadDesignGuide(stage);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('limit 必须是 1 到 20 的整数');
  const pool = designEntries(catalog);
  if (kind && !['pattern', 'concern', 'reference'].includes(kind)) throw Error('未知资料种类');
  if (category && !pool.some(entry => entry.category === category)) throw Error('当前阶段没有这个资料分类：' + category);
  const normalized = String(query).toLowerCase().trim();
  const terms = new Set(normalized.split(/[\s,，;；]+/).filter(Boolean));
  // Recognize known topic phrases inside natural Chinese requests, not arbitrary single characters.
  for (const entry of pool) for (const tag of entry.tags ?? []) if (tag.length >= 2 && normalized.includes(tag.toLowerCase())) terms.add(tag.toLowerCase());
  const ranked = pool.filter(entry => (!kind || entry.kind === kind) && (!category || entry.category === category)).map((entry, order) => {
    const title = entry.title.toLowerCase(), tags = (entry.tags ?? []).join(' ').toLowerCase();
    const text = [entry.id, entry.intent, entry.outcome, entry.question, entry.application].filter(Boolean).join(' ').toLowerCase();
    return { entry, order, score: [...terms].reduce((score, term) => score + (title.includes(term) ? 6 : 0) + (tags.includes(term) ? 4 : 0) + (text.includes(term) ? 1 : 0), 0) };
  }).filter(row => !terms.size || row.score).sort((a, b) => b.score - a.score || a.order - b.order);
  return { stage, guide: base + '.md', referenceOnly: true, research: 'not_performed', userAcceptance: 'not_recorded', matched: ranked.length > 0,
    results: ranked.slice(0, limit).map(row => row.entry), researchTargets: catalog.researchTargets,
    total: pool.length, matchedCount: ranked.length, categories: [...new Set(pool.map(entry => entry.category).filter(Boolean))],
    note: '本地资料只启发设计，不是已查阅的当前外部参考，不决定作品字段、布局、风格或用户授权。无匹配时自行提出项目方案，不套用通用页面。' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opt = name => { const index = process.argv.indexOf(name); if (index < 0) return undefined; const value = process.argv[index + 1]; if (!value || value.startsWith('--')) throw Error(name + ' 缺少值'); return value; };
    const result = searchDesignGuide(opt('--stage'), opt('--query') ?? '', Number(opt('--limit') ?? 4), { category: opt('--category'), kind: opt('--kind') });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) { console.log(JSON.stringify({ ok: false, issues: [error.message] })); process.exitCode = 1; }
}
