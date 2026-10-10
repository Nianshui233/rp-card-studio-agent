import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_DIR, ensureProjectFolders, validateProjectLayout, resolveProjectPath } from '../project-layout.mjs';
import { STAGES, STAGE_LABELS, PROGRESS_LABELS, REVIEW_LABELS, validateStageLedger, stageAuthorizationLabel, stageProgressLabel } from './stage-ledger.mjs';
import { writeRouteLock, validateRouteLock } from './route-lock.mjs';
import { releaseReadinessIssues } from './release-gate.mjs';
import { applyProjectEvent } from './ledger-transition.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEMPLATE_ROOT = path.join(ROOT, 'assets', 'templates', 'continuation');
const REQUIRED_DIR = STATE_DIR;
const REQUIRED_FILES = ['authority.md', 'NEXT.md', 'materials.json', 'acceptance.json'];
const REQUIRED_AUTHORITY_SECTIONS = [
  '项目目标与范围', '阶段账本', '当前授权', '授权与决定记录', '已确认创作事实', '已确认运行能力', '待决定事项', '已否决事项',
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
  // Headings embedded in quoted messages/code are not Markdown section boundaries.
  const lines = text.split(/\r?\n/);
  let fence = null, active = false; const result = [];
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (!fence && /^##\s+/.test(line)) {
      if (active) break;
      if (line.replace(/^##\s+/, '').trim() === title) active = true;
      continue;
    }
    if (active) result.push(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
    }
  }
  return result.join('\n').trim();
}
function requiredSections(text, titles) {
  return titles.filter(title => !section(text, title));
}
function projectRoot(value) { return path.resolve(value || process.cwd()); }
function stateRoot(root) { return resolveProjectPath(root, REQUIRED_DIR, { output: true }); }
function stateFiles(root) { return Object.fromEntries(REQUIRED_FILES.map(name => [name, resolveProjectPath(root, REQUIRED_DIR + '/' + name, { output: true })])); }

export function validateContinuation(rootValue) {
  const root = projectRoot(rootValue);
  const layout = validateProjectLayout(root);
  if (!layout.ok) return { ok: false, root, issues: layout.issues, warnings: [] };
  let files; try { files = stateFiles(root); } catch (error) { return { ok: false, root, issues: [error.message], warnings: [] }; }
  const issues = [];
  const warnings = [];
  if (!fs.existsSync(stateRoot(root))) issues.push(`缺少 ${REQUIRED_DIR}/`);
  for (const name of REQUIRED_FILES) if (!fs.existsSync(files[name])) issues.push(`缺少 ${REQUIRED_DIR}/${name}`);
  if (issues.length) return { ok: false, root, issues, warnings };

  const authority = read(files['authority.md']);
  const next = read(files['NEXT.md']);
  const authorityMeta = frontMatter(authority);
  const nextMeta = frontMatter(next);
  const migrationRequired = authorityMeta.schema === 'rp-card-studio/authority/v1' || nextMeta.schema === 'rp-card-studio/next/v1';
  if (authorityMeta.schema !== 'rp-card-studio/authority/v2') issues.push('authority.md schema 必须是 rp-card-studio/authority/v2；旧账本需核对来源后迁移，不自动确认');
  if (nextMeta.schema !== 'rp-card-studio/next/v2') issues.push('NEXT.md schema 必须是 rp-card-studio/next/v2');
  if (!authorityMeta.project_id) issues.push('authority.md 缺少 project_id');
  if (!authorityMeta.title) issues.push('authority.md 缺少 title');
  if (authorityMeta.project_id && nextMeta.project_id && authorityMeta.project_id !== nextMeta.project_id) issues.push('authority.md 与 NEXT.md 的 project_id 不一致');
  const allowedStatus = ['candidate', 'driver-approved-design', 'implementation-candidate', 'automated-evidence', 'real-host-evidence', 'driver-accepted'];
  if (authorityMeta.status && !allowedStatus.includes(authorityMeta.status)) issues.push(`authority.md status 无效：${authorityMeta.status}`);
  for (const title of requiredSections(authority, REQUIRED_AUTHORITY_SECTIONS)) issues.push(`authority.md 缺少区块：${title}`);
  for (const title of requiredSections(next, REQUIRED_NEXT_SECTIONS)) issues.push(`NEXT.md 缺少区块：${title}`);

  const nextStage = section(next, '当前阶段').replace(/\x60/g, '').trim();
  if (nextStage !== authorityMeta.current_stage) issues.push('authority 与 NEXT 当前阶段不一致');
  let stageLedger = null;
  const ledgerBlock = section(authority, '阶段账本');
  const block = ledgerBlock.match(/^\x60{3}json\s*\r?\n([\s\S]*?)\r?\n\x60{3}\s*$/);
  if (!block) issues.push('阶段账本必须是单个完整 JSON 代码块');
  else {
    try {
      stageLedger = JSON.parse(block[1]);
      issues.push(...validateStageLedger(stageLedger, authorityMeta.current_stage).issues);
    } catch (error) { issues.push('阶段账本不是合法 JSON：' + error.message); }
  }
  if (stageLedger && Array.isArray(stageLedger.decisions)) {
    for (const title of ['已确认创作事实', '已确认运行能力']) {
      const body = section(authority, title);
      for (const line of body.split(/\r?\n/).filter(line => /^\s*[-*]\s+/.test(line) && !/^\s*[-*]\s+暂无。?\s*$/.test(line))) {
        const id = line.match(/\[([A-Z]+-[\w-]+)\]/)?.[1];
        const decision = stageLedger.decisions.find(item => item?.id === id);
        if (!decision || !['user_confirmed', 'delegated', 'material_fact'].includes(decision.sourceKind)) issues.push(title + ' 必须引用有效决定记录，不能凭正文自行确认：' + line.trim());
        else if (line.trim() !== `- [${decision.id}] ${decision.sourceKind}：${decision.text}`) issues.push(title + ' 摘要必须逐字投影决定记录，不得借已有 ID 添加新确认：' + line.trim());
      }
    }
    const completed = section(authority, '已完成阶段');
    for (const match of completed.matchAll(/^-\s*\[x\]\s*(\w+)/gmi)) {
      if (stageLedger.stages?.find(row => row?.id === match[1])?.progress !== 'closed') issues.push('已完成阶段勾选与阶段账本冲突：' + match[1]);
    }
  }
  const capabilityStages = { mvu: 'mvu', ejs: 'ejs', bridge: 'runtime_bridge' };
  for (const [key, id] of Object.entries(capabilityStages)) {
    const stage = Array.isArray(stageLedger?.stages) ? stageLedger.stages.find(row => row?.id === id) : null;
    if (stage && ['enabled', 'disabled', 'unresolved'].includes(authorityMeta[key]) && stage.enabled !== authorityMeta[key]) issues.push('能力开关与阶段启用状态冲突：' + key);
  }
  if (authorityMeta.status === 'driver-accepted' && (!Array.isArray(stageLedger?.stages) || stageLedger.stages.find(row => row?.id === 'qa_delivery')?.progress !== 'closed')) issues.push('driver-accepted 必须有 QA 交付阶段的真实用户接受引用');
  warnings.push('仅做结构与引用范围校验；用户来源真实性未核验，语义覆盖需回读原消息。不是宿主级硬锁。');

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
      if (name === 'acceptance.json' && authorityMeta.status === 'driver-accepted') issues.push(...releaseReadinessIssues(value.summary));
    } catch (error) { issues.push(`${name} 不是合法 JSON：${error.message}`); }
  }
  if (!section(next, '下一道门')) warnings.push('NEXT.md 没有可读的下一道门内容');
  const activeStage = Array.isArray(stageLedger?.stages) ? stageLedger.stages.find(row => row?.id === authorityMeta.current_stage) : null;
  return { ok: issues.length === 0, root, issues, warnings, metadata: authorityMeta, stageLedger, migrationRequired, executionAllowed: issues.length === 0 && activeStage?.progress === 'in_progress', sourceAuthenticity: 'not_verified', enforcement: 'structural_only' };
}

export function initContinuation(rootValue, { projectId, title } = {}) {
  if (!projectId || !title) throw new Error('init 需要 projectId 和 title');
  const root = ensureProjectFolders(projectRoot(rootValue));
  const target = stateRoot(root);
  if (REQUIRED_FILES.some(name => fs.existsSync(path.join(target, name)))) throw new Error(`拒绝覆盖已有 ${REQUIRED_DIR}/`);
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
  const ledger = result.stageLedger;
  const current = ledger.stages.find(row => row.id === meta.current_stage);
  const completed = lines('已完成');
  const doing = current.progress === 'in_progress' ? lines('当前未完成').slice(0, 1) : [];
  const safe = value => String(value).replace(/[\r\n]/g, ' ').replace(/`{3}/g, '｀｀｀');
  const open = section(authority, '待决定事项').split(/\r?\n/).map(line => line.trim()).filter(line => /^[-*]\s+/.test(line));
  const parked = section(authority, '项目目标与范围').split(/\r?\n/).map(line => line.trim()).filter(line => /暂缓|停车|不做|不扩大/.test(line));
  const blocked = [...lines('当前风险'), ...section(authority, '验收摘要').split(/\r?\n/).map(line => line.trim()).filter(line => /未运行|not_run|阻断|待实测/.test(line))];
  const nextGate = lines('下一道门');
  const authorizationRows = ledger.authorizations.filter(auth => auth.stage === meta.current_stage).flatMap(auth => {
    const source = ledger.userEvidence.find(item => item.id === auth.userEvidence);
    return [`- ${safe(auth.id)}：${safe(auth.status)}；范围 ${safe(auth.scope.join('、'))}；交接到期`, `- 排除：${safe(auth.exclusions.join('、')) || '不得越阶段或推翻已确认要求'}`, `- 用户依据：${safe(source?.locator)} / ${safe(source?.quote)}`];
  });
  const row = (mark, value) => `${mark} ${safe(value || '暂无')}`;
  return [
    '```text',
    '【RP 项目进度画板】',
    `项目：${safe(meta.title || '未命名')}`,
    `阶段：${STAGE_LABELS[meta.current_stage]}（${stageProgressLabel(current)}）`,
    `用户审阅：${REVIEW_LABELS[current.review]}`,
    `后续推进：${current.automaticExecution ? '按默认规则执行技术收尾；不授予创作决定权' : current.progress === 'awaiting_handoff' ? '创作等待审阅；本次范围的 QA 与交付可自动执行' : '仅限当前阶段；NEXT 不授予下一创作阶段许可'}`,
    '校验边界：用户来源真实性未核验；非宿主硬锁',
    '',
    '阶段账本',
    ...ledger.stages.map(item => `- ${STAGE_LABELS[item.id]}：${stageProgressLabel(item)}；${stageAuthorizationLabel(ledger, item.id)}；${REVIEW_LABELS[item.review]}${item.enabled === 'unresolved' ? '（启用待定）' : ''}`),
    '',
    '当前授权',
    ...(authorizationRows.length ? authorizationRows : ['- 无生效代定授权；技术细节仅在已确定范围内处理']),
    `范围：${section(next, '本轮不扩大') ? '按 NEXT.md 当前范围' : '待确认'}`,
    '',
    '已完成（制作事项，不代表用户接受）',
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
    } else if (command === 'route-lock') {
      const stage = option('--stage');
      if (!stage) throw new Error('route-lock 必须提供 --stage <stage-id>');
      const result = writeRouteLock(root, option('--agent-root') || ROOT, stage);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (command === 'route-verify') {
      const lockPath = path.join(root, REQUIRED_DIR, 'route-lock.json');
      if (!fs.existsSync(lockPath)) throw new Error('缺少 制作文件/项目记录/route-lock.json；写入制品前必须先锁定当前阶段路由');
      const lock = JSON.parse(read(lockPath));
      const result = validateRouteLock(lock, option('--agent-root') || ROOT, option('--stage') || lock.stage);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
    } else if (command === 'ledger-event') {
      const type = option('--event');
      const stage = option('--stage');
      if (!type || !stage) throw new Error('ledger-event 必须提供 --event start|reopen|handoff|accept|skip|auto-qa|qa-blocked 与 --stage <stage-id>');
      const readJson = file => JSON.parse(read(file));
      const evidenceFile = option('--evidence-file');
      const handoffFile = option('--handoff-file');
      const result = applyProjectEvent(root, {
        type,
        stage,
        evidence: evidenceFile ? readJson(evidenceFile) : undefined,
        handoff: handoffFile ? readJson(handoffFile) : undefined,
        handoffId: option('--handoff-id'),
        scope: option('--scope'), sourceStage: option('--source-stage'), reason: option('--reason')
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      throw new Error('用法: node continuation.mjs init|validate|board|route-lock|route-verify|ledger-event --root <project-root> [--stage stage-id --agent-root agent-root --event start|reopen|handoff|accept --evidence-file file --handoff-file file --handoff-id id]');
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
