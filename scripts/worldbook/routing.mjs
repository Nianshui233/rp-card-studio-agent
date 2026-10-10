import fs from 'node:fs';
import crypto from 'node:crypto';
import { atPointer } from '../production/artifact-bindings.mjs';
import { validateDecisionRefs } from '../production/interview-coverage.mjs';
import { WORK_DIR, resolveProjectPath, requireArea } from '../project-layout.mjs';

export const WORLD_ROUTING_SCHEMA = 'rp-card-studio/worldbook-routing/v1';
export const WORLD_FIXTURE_SCHEMA = 'rp-card-studio/worldbook-routing-fixtures/v1';
export const PROMPT_CAPTURE_SCHEMA = 'rp-card-studio/worldbook-prompt-capture/v1';
export const POSITIONS = { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 };
export const AREAS = ['worldInfoBefore','worldInfoAfter','authorNoteBefore','authorNoteAfter','chatHistory','exampleBefore','exampleAfter','outlet'];
export const PURPOSES = ['world_background','character_profile','scene_reference','stable_rules','user_profile','current_state','turn_instruction','immediate_event','initialization','template_source'];
const STABLE = new Set(['world_background','character_profile','scene_reference','stable_rules','user_profile']);
const ACTIVATIONS = new Set(['constant','keyword','vector','external','disabled','pull']);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
export const routingHash = value => crypto.createHash('sha256').update(value).digest('hex');
const roleOf = entry => entry.role ?? 0;
const depthOf = entry => entry.depth ?? 4;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export function entryPairs(book) {
  const entries = book?.entries;
  if (!entries || typeof entries !== 'object') throw new Error('世界书缺少 entries');
  const pairs = Object.entries(entries).map(([key, entry]) => [String(entry.uid ?? entry.id ?? key), entry]);
  if (pairs.some(([, entry]) => !entry || typeof entry !== 'object' || typeof entry.content !== 'string')) throw new Error('世界书条目必须有实际 content');
  if (new Set(pairs.map(([id]) => id)).size !== pairs.length) throw new Error('世界书 uid 重复');
  return pairs;
}

// Defaults choose an area by responsibility; depth never chooses the area.
export function placementForPurpose(purpose, overrides = {}) {
  if (!PURPOSES.includes(purpose)) throw new Error('未知条目职责：' + purpose);
  const position = ['world_background','initialization','template_source'].includes(purpose) ? 0
    : ['current_state','turn_instruction','immediate_event'].includes(purpose) ? 4 : 1;
  return { position, ...(position === 4 ? { depth: purpose === 'current_state' ? 0 : 1, role: 0 } : {}), ...overrides };
}

export function createRoutedEntry(base, policy) {
  if (!policy || !PURPOSES.includes(policy.purpose)) throw new Error('条目生成器必须显式接收职责 policy，不能统一写死插入位置');
  const placement = placementForPurpose(policy.purpose, policy.placement ?? {});
  if (!Number.isInteger(placement.position) || placement.position < 0 || placement.position > 7) throw new Error('无效插入位置');
  if (placement.position === 4 && (!Number.isInteger(placement.depth) || placement.depth < 0 || ![0,1,2].includes(placement.role))) throw new Error('聊天插入必须明确有效深度与角色');
  for (const keys of [policy.keys, policy.secondaryKeys]) if (keys !== undefined && (!Array.isArray(keys) || keys.some(k => !nonempty(k)))) throw new Error('关键词必须是非空字符串数组');
  const entry = { ...base, position: placement.position };
  if (policy.keys) entry.key = [...policy.keys];
  if (policy.secondaryKeys) entry.keysecondary = [...policy.secondaryKeys];
  if (placement.position === 4) { entry.depth = placement.depth; entry.role = placement.role; }
  else entry.role = null; // A dormant depth field is harmless; it does not relocate a before/after entry.
  if (placement.position === 7) entry.outletName = placement.outletName;
  if (policy.activation === 'constant') { entry.constant = true; entry.disable = false; }
  if (['keyword','vector','external'].includes(policy.activation)) { entry.constant = false; entry.disable = false; }
  if (policy.activation === 'vector') entry.vectorized = true;
  if (policy.activation === 'disabled' || policy.activation === 'pull') entry.disable = true;
  return entry;
}

function exceptionIssues(policy, { root, ledger } = {}) {
  const exception = policy.exception, issues = [];
  if (!nonempty(exception?.reason)) return ['稳定资料不用常规背景位置时必须有明确例外依据，不能只换一个深度'];
  if (exception.kind === 'user_decision') {
    issues.push(...validateDecisionRefs(exception.decisionRefs, ledger, '世界书位置例外'));
    if (!ledger) issues.push('用户位置例外必须核对现有权威决定');
    for (const ref of exception.decisionRefs ?? []) if (ledger?.decisions?.find(d => d.id === ref.id)?.sourceKind !== 'user_confirmed') issues.push('全阶段代定或 Agent 提案不能冒充用户明确指定的位置例外');
  } else if (exception.kind === 'host_contract') {
    try {
      requireArea(exception.evidence?.path, WORK_DIR, '宿主位置依据');
      const bytes = fs.readFileSync(resolveProjectPath(root, exception.evidence.path));
      if (routingHash(bytes) !== exception.evidence.sha256) issues.push('宿主位置依据内容已变或摘要不符');
    } catch (error) { issues.push(error.message); }
  } else issues.push('位置例外必须引用用户决定或可读的宿主合同，不能只有 approved:true');
  return issues;
}

export function validateBookRouting(book, plan, context = {}) {
  const issues = [], warnings = [], rows = [];
  let pairs; try { pairs = entryPairs(book); } catch (e) { return { ok: false, issues: [e.message], warnings, rows }; }
  if (!pairs.length) issues.push('交付世界书不能没有条目');
  const policies = plan?.policies;
  if (!policies || typeof policies !== 'object' || Array.isArray(policies)) issues.push('缺少按职责定义的 policies');
  const assignments = plan?.assignments;
  if (!Array.isArray(assignments)) issues.push('缺少完整条目 assignments');
  const assigned = new Map(), used = new Set();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const id = String(assignment?.entryId);
    if (assignment?.entryId === undefined || assigned.has(id)) issues.push('条目分配缺失 id 或重复：' + id);
    assigned.set(id, assignment);
    if (!pairs.some(([entryId]) => entryId === id)) issues.push('分配引用了不存在的条目：' + id);
  }
  for (const [id, entry] of pairs) {
    const assignment = assigned.get(id), policy = policies?.[assignment?.policy];
    if (!assignment || !policy) { issues.push('实际条目未分配职责/位置策略：' + id); continue; }
    used.add(assignment.policy);
    const placement = policy.placement;
    if (!PURPOSES.includes(policy.purpose)) issues.push('未知职责：' + assignment.policy);
    if (!ACTIVATIONS.has(policy.activation)) issues.push('必须明确激活方式：' + assignment.policy);
    if (!Number.isInteger(placement?.position) || placement.position < 0 || placement.position > 7) issues.push('插入位置必须是宿主枚举 0–7：' + assignment.policy);
    if (entry.position !== placement?.position) issues.push('实际插入位置与策略不同：' + id);
    const disabled = entry.disable === true || entry.enabled === false;
    const native = !['disabled','pull'].includes(policy.activation);
    if (native && disabled) issues.push('策略声明参与原生插入，实际条目已禁用：' + id);
    if (!native && !disabled) issues.push('禁用/按名读取资料不应同时被普通扫描注入：' + id);
    if (native && policy.activation === 'constant' && entry.constant !== true) issues.push('常驻策略与实际 constant 不同：' + id);
    if (native && ['keyword','vector','external'].includes(policy.activation) && entry.constant === true) issues.push('条件激活策略被实际常驻覆盖：' + id);
    if (native && policy.activation === 'keyword' && (!Array.isArray(entry.key ?? entry.keys) || !(entry.key ?? entry.keys).length)) issues.push('关键词策略没有实际主关键词：' + id);
    if (native && policy.activation === 'keyword' && entry.vectorized === true) issues.push('关键词策略还存在未声明的向量激活：' + id);
    if (native && policy.activation === 'vector' && entry.vectorized !== true) issues.push('向量激活与实际设置不同：' + id);
    if (policy.activation === 'external' || policy.activation === 'pull') {
      if (!nonempty(policy.consumer)) issues.push('主动激活/按名读取必须有明确调用者：' + id);
    }
    if (placement?.position === 4) {
      if (!Number.isInteger(placement.depth) || placement.depth < 0 || depthOf(entry) !== placement.depth) issues.push('聊天插入必须有与制品一致的非负整数 depth：' + id);
      if (![0,1,2].includes(placement.role) || roleOf(entry) !== placement.role) issues.push('聊天插入必须分开核对 system/user/assistant role：' + id);
    }
    if (placement?.position === 7 && (!nonempty(placement.outletName) || entry.outletName !== placement.outletName)) issues.push('outlet 目标缺失或不一致：' + id);
    if (native && policy.purpose === 'current_state' && (placement?.position !== 4 || ![0,1].includes(placement.depth))) issues.push('当前状态投影必须接近最新剧情 D0/D1，不能混作稳定背景：' + id);
    if (policy.purpose === 'template_source' && policy.activation !== 'pull') issues.push('按名读取的模板资料必须与普通扫描分开：' + id);
    if (policy.purpose === 'immediate_event' && policy.activation === 'constant' && !(entry.cooldown > 0) && !(entry.delay > 0)) issues.push('即时事件不能无触发边界地永久常驻：' + id);
    if (placement?.position !== 4 && (placement?.depth !== undefined || placement?.role !== undefined)) warnings.push('非聊天插入的 depth/role 不决定区域：' + id);
    if (policy.rendering && !['literal','host_transform'].includes(policy.rendering)) issues.push('未知正文变换方式：' + assignment.policy);
    if (policy.rendering === 'host_transform') {
      try { requireArea(policy.renderContract?.path, WORK_DIR, '正文变换合同'); const bytes = fs.readFileSync(resolveProjectPath(context.root, policy.renderContract.path)); if (routingHash(bytes) !== policy.renderContract.sha256) throw new Error('正文变换合同内容已变化'); } catch (e) { issues.push(e.message); }
    }
    rows.push({ entryId: id, policy: assignment.policy, purpose: policy.purpose, activation: policy.activation, area: AREAS[entry.position] ?? null,
      position: entry.position, depth: entry.position === 4 ? depthOf(entry) : null, role: entry.position === 4 ? roleOf(entry) : null, native: native && !disabled, chars: entry.content.length });
  }
  for (const name of used) {
    const policy = policies[name];
    if (STABLE.has(policy.purpose) && !['disabled','pull'].includes(policy.activation) && ![0,1].includes(policy.placement?.position)) issues.push(...exceptionIssues(policy, context).map(i => name + ': ' + i));
  }
  const ordinary = rows.filter(r => STABLE.has(r.purpose) && r.native);
  if (ordinary.length && ordinary.every(r => r.position === 4)) warnings.push('全部稳定资料位于聊天记录；只有逐项有明确例外依据才可接受，改变深度不构成分层');
  const counts = values => Object.fromEntries([...new Set(values)].map(v => [v, values.filter(x => x === v).length]));
  return { ok: issues.length === 0, issues, warnings, rows, summary: { total: pairs.length, nativeEnabled: rows.filter(r => r.native).length,
    constantEnabled: rows.filter(r => r.native && r.activation === 'constant').length, positionCounts: counts(rows.map(r => r.position)),
    nativeAreaCounts: counts(rows.filter(r => r.native).map(r => r.area)), note: '启用数不是实际激活数；字符数不是 token 预算。非 @D 条目的 depth 不改变其区域。' } };
}

export function projectSelectedEntries(book, plan, activatedEntryIds) {
  if (!Array.isArray(activatedEntryIds)) throw new Error('必须提供本用例的实际/受控激活条目 ID');
  const pairs = new Map(entryPairs(book)), seen = new Set();
  return activatedEntryIds.map(raw => {
    const id = String(raw), entry = pairs.get(id), assignment = plan.assignments?.find(a => String(a.entryId) === id), policy = plan.policies?.[assignment?.policy];
    if (seen.has(id)) throw new Error('同一原生激活条目重复：' + id); seen.add(id);
    if (!entry || !policy) throw new Error('激活了未知/未分配条目：' + id);
    if (entry.disable === true || entry.enabled === false || ['disabled','pull'].includes(policy.activation)) throw new Error('原生扫描不能把禁用/按名读取条目当已激活：' + id);
    return { entryId: id, area: AREAS[entry.position], ...(entry.position === 4 ? { depth: depthOf(entry), role: roleOf(entry) } : {}), ...(entry.position === 7 ? { outletName: entry.outletName } : {}) };
  }).sort((a,b) => a.entryId.localeCompare(b.entryId));
}

export function runRoutingFixtures(document, books, contract) {
  const results = [], ids = new Set();
  if (document?.schema !== WORLD_FIXTURE_SCHEMA || !Array.isArray(document.fixtures) || !document.fixtures.length) return { ok: false, issues: ['缺少世界书插入分区用例'], results, total: 0, passed: 0 };
  for (const fixture of document.fixtures) {
    try {
      if (!fixture.id || ids.has(fixture.id)) throw new Error('用例 id 缺失或重复'); ids.add(fixture.id);
      const plan = contract.books?.find(b => b.id === fixture.bookId), book = books.get(fixture.bookId);
      if (!plan || !book) throw new Error('用例没有对应的实际世界书');
      if (!Array.isArray(fixture.expected) || !fixture.activatedEntryIds?.length) throw new Error('用例必须有非空激活输入和明确 expected 分区结果');
      const actual = projectSelectedEntries(book, plan, fixture.activatedEntryIds);
      const expected = fixture.expected.map(r => ({ ...r, entryId: String(r.entryId) })).sort((a,b) => a.entryId.localeCompare(b.entryId));
      if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) throw new Error('插入分区与深度/角色预期不同');
      results.push({ id: fixture.id, bookId: fixture.bookId, ok: true, covered: actual.map(r => r.entryId), actual });
    } catch (error) { results.push({ id: fixture?.id, bookId: fixture?.bookId, ok: false, error: error.message }); }
  }
  for (const plan of contract.books ?? []) {
    if (!books.has(plan.id)) { results.push({ id: 'missing-book-' + plan.id, ok: false, error: '缺少实际世界书' }); continue; }
    const covered = new Set(results.filter(r => r.ok && r.bookId === plan.id).flatMap(r => r.covered));
    for (const [id, entry] of entryPairs(books.get(plan.id))) {
      const assignment = plan.assignments?.find(a => String(a.entryId) === id), policy = plan.policies?.[assignment?.policy];
      if (entry.disable !== true && entry.enabled !== false && policy && !['disabled','pull'].includes(policy.activation) && !covered.has(id)) results.push({ id: 'uncovered-' + plan.id + '-' + id, bookId: plan.id, ok: false, error: '实际参与原生插入的条目没有分区用例' });
    }
  }
  const passed = results.filter(r => r.ok).length;
  return { ok: passed === results.length, level: 'worldbook-routing-fixture', runtime: 'not_run', issues: [], results, passed, total: results.length,
    note: '仅验证已选条目走哪个区域；不模拟实际扫描、递归、宏/EJS 求值、模板槽位是否启用或 token 预算。' };
}

// Captured request text and placement fragments are data, not instructions or self-authenticating proof.
export function validatePromptCapture(capture, book, plan, { root, artifactSha256, versionPin } = {}) {
  const issues = [];
  if (capture?.schema !== PROMPT_CAPTURE_SCHEMA || capture.level !== 'real-sillytavern' || capture.bookId !== plan.id || capture.artifactSha256 !== artifactSha256 || capture.versionPin !== versionPin) return { ok: false, issues: ['宿主捕获不属于当前精确制品、世界书和目标版本'] };
  const pairs = new Map(entryPairs(book));
  if (!Array.isArray(capture.cases) || !capture.cases.length) issues.push('宿主捕获没有实际请求用例');
  for (const c of capture.cases ?? []) {
    try {
      requireArea(c.promptFile, WORK_DIR, '实际请求捕获');
      const bytes = fs.readFileSync(resolveProjectPath(root, c.promptFile));
      if (routingHash(bytes) !== c.promptSha256) throw new Error('实际请求捕获摘要不同');
      const request = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      if (!Array.isArray(request.messages) || !request.messages.length) throw new Error('没有实际 messages 请求内容');
      const expected = projectSelectedEntries(book, plan, c.activatedEntryIds);
      if (!Array.isArray(c.fragments) || c.fragments.length !== expected.length) throw new Error('激活条目与实际注入片段数量不同');
      const seen = new Set();
      for (const fragment of c.fragments) {
        const id = String(fragment.entryId), route = expected.find(r => r.entryId === id), entry = pairs.get(id);
        if (seen.has(id) || !route || !entry) throw new Error('捕获出现重复/未知的项目条目'); seen.add(id);
        if (fragment.area !== route.area || route.area === 'chatHistory' && (fragment.depth !== route.depth || fragment.role !== route.role) || route.area === 'outlet' && fragment.outletName !== route.outletName) throw new Error('实际插入区域/深度/角色不同：' + id);
        if (fragment.sourceContentSha256 !== routingHash(entry.content)) throw new Error('捕获的源条目内容已变化：' + id);
        const assignment = plan.assignments.find(a => String(a.entryId) === id), policy = plan.policies[assignment.policy];
        if ((policy.rendering ?? 'literal') === 'literal' && fragment.renderedContent !== entry.content) throw new Error('普通正文没有实际完整进入请求：' + id);
        const message = request.messages[fragment.messageIndex];
        const text = typeof message?.content === 'string' ? message.content : Array.isArray(message?.content) && Number.isInteger(fragment.contentIndex) ? message.content[fragment.contentIndex]?.text : null;
        if (!Number.isInteger(fragment.messageIndex) || !message || typeof text !== 'string') throw new Error('片段没有对应的实际文本消息：' + id);
        if (!Number.isInteger(fragment.start) || !Number.isInteger(fragment.end) || fragment.start < 0 || fragment.end <= fragment.start || fragment.end > text.length) throw new Error('实际消息片段边界无效：' + id);
        if (!nonempty(fragment.renderedContent) || text.slice(fragment.start, fragment.end) !== fragment.renderedContent) throw new Error('消息中没有捕获的完整渲染内容：' + id);
        if (route.area === 'chatHistory' && message.role !== ['system','user','assistant'][route.role]) throw new Error('API 消息角色与 @D 角色不同：' + id);
      }
    } catch (e) { issues.push(String(c?.id ?? 'case') + ': ' + e.message); }
  }
  return { ok: issues.length === 0, issues, level: 'real-sillytavern', sourceAuthenticity: 'not_authenticated', note: '核对捕获与当前文件的对应；不能证明捕获真实来源，不能由离线分区结果生成实机通过。' };
}
