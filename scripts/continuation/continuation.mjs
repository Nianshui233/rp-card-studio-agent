import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEMPLATE_ROOT = path.join(ROOT, 'assets', 'templates', 'continuation');
const REQUIRED_DIR = '.rp-card';
const REQUIRED_FILES = ['authority.md', 'NEXT.md', 'materials.json', 'acceptance.json'];
const REQUIRED_AUTHORITY_SECTIONS = [
  '项目目标与范围', '已确认创作事实', '已确认运行能力', '待决定事项', '已否决事项',
  '玩家中立性合同', '创作源映射', '角色卡与组件映射', '运行依赖', '已完成阶段',
  '当前风险', '验收摘要', '下一道门'
];
const REQUIRED_NEXT_SECTIONS = ['当前阶段', '已完成', '当前未完成', '当前风险', '本轮允许修改', '本轮不扩大', '下一道门', '下一次续接指令'];

function read(file) { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function frontMatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  const values = {};
  if (!match) return values;
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*$/);
    if (item) values[item[1]] = item[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}
function section(text, title) {
  const headings = [...text.matchAll(/^##\s+(.+?)\s*$/gmi)];
  const target = headings.find(match => match[1].trim() === title);
  if (!target) return '';
  const start = target.index + target[0].length;
  const next = headings.find(match => match.index > target.index);
  return text.slice(start, next ? next.index : text.length).trim();
}
function requiredSections(text, titles) {
  return titles.filter(title => !section(text, title));
}
function projectRoot(value) { return path.resolve(value || process.cwd()); }
function stateRoot(root) { return path.join(root, REQUIRED_DIR); }
function stateFiles(root) { return Object.fromEntries(REQUIRED_FILES.map(name => [name, path.join(stateRoot(root), name)])); }

export function validateContinuation(rootValue) {
  const root = projectRoot(rootValue);
  const files = stateFiles(root);
  const issues = [];
  const warnings = [];
  if (!fs.existsSync(stateRoot(root))) issues.push(`缺少 ${REQUIRED_DIR}/`);
  for (const name of REQUIRED_FILES) if (!fs.existsSync(files[name])) issues.push(`缺少 ${REQUIRED_DIR}/${name}`);
  if (issues.length) return { ok: false, root, issues, warnings };

  const authority = read(files['authority.md']);
  const next = read(files['NEXT.md']);
  const authorityMeta = frontMatter(authority);
  const nextMeta = frontMatter(next);
  if (authorityMeta.schema !== 'rp-card-studio/authority/v1') issues.push('authority.md schema 必须是 rp-card-studio/authority/v1');
  if (nextMeta.schema !== 'rp-card-studio/next/v1') issues.push('NEXT.md schema 必须是 rp-card-studio/next/v1');
  if (!authorityMeta.project_id) issues.push('authority.md 缺少 project_id');
  if (!authorityMeta.title) issues.push('authority.md 缺少 title');
  if (authorityMeta.project_id && nextMeta.project_id && authorityMeta.project_id !== nextMeta.project_id) issues.push('authority.md 与 NEXT.md 的 project_id 不一致');
  const allowedStatus = ['candidate', 'driver-approved-design', 'implementation-candidate', 'automated-evidence', 'real-host-evidence', 'driver-accepted'];
  if (authorityMeta.status && !allowedStatus.includes(authorityMeta.status)) issues.push(`authority.md status 无效：${authorityMeta.status}`);
  for (const title of requiredSections(authority, REQUIRED_AUTHORITY_SECTIONS)) issues.push(`authority.md 缺少区块：${title}`);
  for (const title of requiredSections(next, REQUIRED_NEXT_SECTIONS)) issues.push(`NEXT.md 缺少区块：${title}`);
  for (const name of ['materials.json', 'acceptance.json']) {
    try {
      const value = JSON.parse(read(files[name]));
      if (value.projectId && authorityMeta.project_id && value.projectId !== authorityMeta.project_id) issues.push(`${name} 的 projectId 与 authority.md 不一致`);
      if (name === 'materials.json' && value.schema !== 'rp-card-studio/materials/v2') issues.push('materials.json schema 无效');
      if (name === 'acceptance.json' && value.schema !== 'rp-card-studio/acceptance/v1') issues.push('acceptance.json schema 无效');
      if (name === 'materials.json' && (!value.processing || !value.research || !Array.isArray(value.sources) || !Array.isArray(value.facts) || !Array.isArray(value.researchQuestions) || !Array.isArray(value.conflicts) || !value.synthesis || typeof value.synthesis !== 'object')) issues.push('materials.json 必须包含 processing、research、sources、facts、researchQuestions、conflicts 和 synthesis');
      if (name === 'materials.json' && value.processing && !['absent', 'received', 'organizing', 'organized', 'user_review_needed', 'accepted', 'explicitly_skipped'].includes(value.processing.status)) issues.push(`materials processing 状态无效：${value.processing.status}`);
      if (name === 'materials.json' && value.research && !['not_required', 'required', 'active', 'complete', 'blocked', 'skipped'].includes(value.research.status)) issues.push(`materials research 状态无效：${value.research.status}`);
      if (name === 'acceptance.json' && (!Array.isArray(value.items) || !value.summary || typeof value.summary !== 'object')) issues.push('acceptance.json 必须包含 items 数组和 summary 对象');
    } catch (error) { issues.push(`${name} 不是合法 JSON：${error.message}`); }
  }
  if (!section(next, '下一道门')) warnings.push('NEXT.md 没有可读的下一道门内容');
  return { ok: issues.length === 0, root, issues, warnings, metadata: authorityMeta };
}

export function initContinuation(rootValue, { projectId, title } = {}) {
  const root = projectRoot(rootValue);
  const target = stateRoot(root);
  if (fs.existsSync(target)) throw new Error(`拒绝覆盖已有 ${REQUIRED_DIR}/`);
  if (!projectId || !title) throw new Error('init 需要 projectId 和 title');
  fs.mkdirSync(target, { recursive: true });
  for (const name of REQUIRED_FILES) {
    let content = read(path.join(TEMPLATE_ROOT, name));
    content = content.replaceAll('replace-me', String(projectId)).replaceAll('待命名项目', String(title));
    fs.writeFileSync(path.join(target, name), content, 'utf8');
  }
  return validateContinuation(root);
}

export function renderProgressBoard(rootValue) {
  const root = projectRoot(rootValue);
  const result = validateContinuation(root);
  if (!result.ok) throw new Error(result.issues.join('\n'));
  const files = stateFiles(root);
  const authority = read(files['authority.md']);
  const next = read(files['NEXT.md']);
  const meta = frontMatter(authority);
  const lines = title => section(next, title).split(/\r?\n/).map(line => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean).filter(line => !/^暂无|^项目尚未/.test(line));
  const completed = lines('已完成');
  const doing = lines('当前未完成').slice(0, 1);
  const open = section(authority, '待决定事项').split(/\r?\n/).map(line => line.trim()).filter(line => /^[-*]\s+/.test(line));
  const parked = section(authority, '项目目标与范围').split(/\r?\n/).map(line => line.trim()).filter(line => /暂缓|停车|不做|不扩大/.test(line));
  const blocked = [...lines('当前风险'), ...section(authority, '验收摘要').split(/\r?\n/).map(line => line.trim()).filter(line => /未运行|not_run|阻断|待实测/.test(line))];
  const nextGate = lines('下一道门');
  const row = (mark, value) => `${mark} ${value || '暂无'}`;
  return [
    '```text',
    '【RP 项目进度画板】',
    `项目：${meta.title || '未命名'}`,
    `阶段：${meta.current_stage || '未确定'}`,
    `范围：${section(next, '本轮不扩大') ? '按 NEXT.md 当前范围' : '待确认'}`,
    '',
    '已完成',
    ...(completed.length ? completed.map(value => `- ${row('✓', value)}`) : ['- ✓ 暂无已完成事项']),
    '',
    '进行中',
    ...(doing.length ? doing.map(value => `- ${row('→', value)}`) : ['- → 暂无进行中事项']),
    '',
    '待决定',
    ...(open.length ? open.map(value => `- ${row('?', value.replace(/^[-*]\s+/, ''))}`) : ['- ? 暂无待决定事项']),
    '',
    '暂缓',
    ...(parked.length ? parked.map(value => `- ${row('·', value)}`) : ['- · 暂无暂缓事项']),
    '',
    '阻断/待实测',
    ...(blocked.length ? blocked.map(value => `- ${row('!', value)}`) : ['- ! 暂无阻断或待实测事项']),
    '',
    '下一道门',
    ...(nextGate.length ? nextGate.map(value => `- ${row('⇒', value)}`) : ['- ⇒ 尚未定义']),
    '```'
  ].join('\n');
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const command = process.argv[2];
  const root = option('--root') || process.cwd();
  try {
    if (command === 'init') {
      const result = initContinuation(root, { projectId: option('--project-id'), title: option('--title') });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
    } else if (command === 'validate') {
      const result = validateContinuation(root);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
    } else if (command === 'board') {
      process.stdout.write(`${renderProgressBoard(root)}\n`);
    } else {
      throw new Error('用法: node continuation.mjs init|validate|board --root <project-root> [--project-id id --title title]');
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
