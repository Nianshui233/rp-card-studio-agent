import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DESIGN_GUIDES = {
  opening_frontend: 'internal-skills/st-opening-frontend-authoring/references/opening-design',
  message_frontend: 'internal-skills/st-message-frontend-authoring/references/message-design'
};

export function searchDesignGuide(stage, query = '', limit = 4) {
  const base = DESIGN_GUIDES[stage];
  if (!base) throw Error('必须选择 opening_frontend 或 message_frontend，不能使用统一前端设计 profile');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('limit 必须是 1 到 20 的整数');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, base + '.json'), 'utf8'));
  if (catalog.stage !== stage || catalog.schema !== 'rp-card-studio/design-catalog/v1') throw Error('设计资料与阶段不匹配');
  const terms = String(query).toLowerCase().split(/[\s,，;；]+/).filter(Boolean);
  const ranked = [...catalog.patterns, ...catalog.concerns].map((entry, order) => {
    const text = [entry.id, entry.title, ...(entry.tags ?? []), entry.intent, entry.outcome].filter(Boolean).join(' ').toLowerCase();
    return { entry, order, score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) };
  }).filter(row => !terms.length || row.score).sort((a, b) => b.score - a.score || a.order - b.order);
  return { stage, guide: base + '.md', referenceOnly: true, research: 'not_performed', userAcceptance: 'not_recorded', matched: ranked.length > 0,
    results: ranked.slice(0, limit).map(row => row.entry), researchTargets: catalog.researchTargets,
    note: '本地资料只启发设计，不是已查阅的当前外部参考，不决定作品字段、布局、风格或用户授权。无匹配时自行提出项目方案，不套用通用页面。' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opt = name => { const index = process.argv.indexOf(name); if (index < 0) return undefined; const value = process.argv[index + 1]; if (!value || value.startsWith('--')) throw Error(name + ' 缺少值'); return value; };
    const result = searchDesignGuide(opt('--stage'), opt('--query') ?? '', Number(opt('--limit') ?? 4));
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) { console.log(JSON.stringify({ ok: false, issues: [error.message] })); process.exitCode = 1; }
}
