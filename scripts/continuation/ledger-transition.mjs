import fs from 'node:fs';
import { STATE_DIR, validateProjectLayout, resolveProjectPath } from '../project-layout.mjs';
import path from 'node:path';
import { STAGES, OPTIONAL, createInterviewRouteProgress, validateInterviewRouteCompletion, validateStageLedger } from './stage-ledger.mjs';
import { getInterviewRoute, INTERVIEW_ROUTES } from '../production/interview-routes.mjs';
import { classifyUserReply, isBareContinue } from './user-intent.mjs';
import { AUTOMATIC_QA_POLICY, createAutomaticQaPolicy } from './automatic-qa-policy.mjs';

const HIGH_IMPACT_ACTIONS = new Set(['start', 'delegate', 'confirm', 'accept', 'skip']);

function clone(value) {
  return structuredClone(value);
}

function requireEvidence(evidence, expectedActions = []) {
  if (!evidence || evidence.role !== 'user' || !evidence.id || !evidence.stage || !evidence.locator || !evidence.quote || !Array.isArray(evidence.targets)) {
    throw new Error('用户依据必须来自带定位的真实用户消息');
  }
  if (evidence.origin !== 'conversation') throw new Error('用户依据必须标记 origin=conversation；账本和 Agent 总结不是用户来源');
  if (expectedActions.length && !expectedActions.includes(evidence.action)) throw new Error(`用户依据动作必须是：${expectedActions.join(' / ')}`);
  if (isBareContinue(evidence.quote) && HIGH_IMPACT_ACTIONS.has(evidence.action)) throw new Error('单独的“继续”不能产生阶段/决定/授权依据');
  if (evidence.action === 'accept' && classifyUserReply(evidence.quote).kind !== 'explicit_acceptance') throw new Error('接受交接必须包含明确的接受/确认语义');
}

export function recordUserEvidence(ledger, evidence) {
  requireEvidence(evidence);
  const next = clone(ledger);
  if (!Array.isArray(next.userEvidence)) throw new Error('阶段账本缺少 userEvidence 数组');
  if (next.userEvidence.some(item => item?.id === evidence.id)) throw new Error(`用户依据 id 已存在：${evidence.id}`);
  next.userEvidence.push(clone(evidence));
  return next;
}

function stageOf(ledger, stage) {
  const row = ledger.stages?.find(item => item?.id === stage);
  if (!row || !STAGES.includes(stage)) throw new Error(`未知阶段：${stage}`);
  return row;
}

export function recordInterviewNode(ledger, { stage, node, status }) {
  const next = clone(ledger), row = stageOf(next, stage), route = getInterviewRoute(stage);
  if (!route || !row.interviewRoute) throw new Error(`阶段没有启用固定访谈路线：${stage}`);
  if (row.progress !== 'in_progress') throw new Error(`只有进行中的阶段可以记录访谈节点：${stage}`);
  const definition = route.nodes.find(item => item.id === node);
  if (!definition) throw new Error(`节点不在固定访谈路线：${stage}.${node}`);
  const allowed = new Set([
    ...(INTERVIEW_ROUTES.node_status_contract?.closed ?? []),
    ...(INTERVIEW_ROUTES.node_status_contract?.open ?? []),
  ]);
  if (!allowed.has(status) || status === 'not_started') throw new Error(`访谈节点状态无效：${status}`);
  const visited = row.interviewRoute.visited;
  const position = route.nodes.findIndex(item => item.id === node);
  const nextPosition = visited.length;
  if (!visited.includes(node) && position !== nextPosition) throw new Error(`访谈节点必须按顺序记录：${stage}.${node}`);
  if (!visited.includes(node)) visited.push(node);
  row.interviewRoute.nodeStatus[node] = status;
  row.interviewRoute.lastUpdated = new Date().toISOString();
  if (INTERVIEW_ROUTES.node_status_contract.closed.includes(status)) {
    const nextNode = route.nodes.find(item => !visited.includes(item.id));
    row.interviewRoute.currentNode = nextNode?.id ?? null;
    row.interviewRoute.status = nextNode ? 'tracking' : 'complete';
  } else {
    row.interviewRoute.currentNode = node;
    row.interviewRoute.status = 'tracking';
  }
  return next;
}

export function startStage(ledger, { stage, evidence, trackInterviewRoute = false }) {
  requireEvidence(evidence, ['start', 'delegate']);
  if (evidence.stage !== stage || !evidence.targets.includes(stage)) throw new Error('阶段进入依据必须指向同一阶段');
  const next = recordUserEvidence(ledger, evidence);
  const row = stageOf(next, stage);
  if (row.enabled !== 'enabled') throw new Error(`阶段尚未启用：${stage}`);
  if (!['not_started', 'deferred', 'blocked'].includes(row.progress)) throw new Error(`阶段当前不能开始：${stage}`);
  if (next.stages.some(item => item.id !== stage && ['in_progress', 'awaiting_handoff', 'blocked'].includes(item.progress))) throw new Error('已有其他活动阶段，不能并行进入新阶段');
  row.progress = 'in_progress';
  row.review = 'not_reviewed';
  row.entryEvidence = evidence.id;
  delete row.automaticExecution;
  row.acceptanceEvidence = null;
  row.handoff = null;
  delete row.technicalContinuation;
  row.reason = null;
  if (trackInterviewRoute && getInterviewRoute(stage)) {
    row.interviewRoute = createInterviewRouteProgress(stage);
    row.interviewRoute.status = 'tracking';
    row.interviewRoute.currentNode = getInterviewRoute(stage)?.nodes?.[0]?.id ?? null;
  }
  return next;
}

export function submitHandoff(ledger, { stage, handoff }) {
  const next = clone(ledger);
  const row = stageOf(next, stage);
  if (row.progress !== 'in_progress') throw new Error(`只有进行中的阶段可以提交交接：${stage}`);
  if (row.interviewRoute) {
    const route = validateInterviewRouteCompletion(row.interviewRoute, stage);
    if (!route.ok || row.interviewRoute.status !== 'complete') throw new Error(`固定访谈路线尚未结算，不能提交阶段交接：${stage}`);
  }
  if (!handoff?.id || !handoff?.locator || !Array.isArray(handoff.artifacts) || handoff.artifacts.length === 0) throw new Error('交接必须包含 id、报告定位和实际制品');
  row.progress = stage === 'qa_delivery' ? 'delivered' : 'awaiting_handoff';
  row.review = 'pending';
  row.handoff = clone(handoff);
  row.acceptanceEvidence = null;
  for (const auth of next.authorizations ?? []) if (auth.stage === stage && auth.status === 'active') auth.status = 'expired';
  return next;
}

export function acceptHandoff(ledger, { stage, handoffId, evidence }) {
  requireEvidence(evidence, ['accept']);
  if (evidence.stage !== stage || evidence.responseTo !== handoffId || !evidence.targets.includes(handoffId)) throw new Error('接受依据必须明确回应当前交接');
  const next = recordUserEvidence(ledger, evidence);
  const row = stageOf(next, stage);
  if (!['awaiting_handoff', 'authored', 'delivered'].includes(row.progress) || row.review !== 'pending' || row.handoff?.id !== handoffId) throw new Error('只能接受当前待审阅交接');
  row.progress = 'closed';
  row.review = 'accepted';
  row.acceptanceEvidence = evidence.id;
  delete row.technicalContinuation;
  // Accepting a handoff never silently starts the next stage.
  return next;
}


export function reopenStage(ledger, { stage, evidence, trackInterviewRoute = false }) {
  requireEvidence(evidence, ['start','delegate']);
  if (evidence.stage !== stage || !evidence.targets.includes(stage)) throw new Error('重新制作必须有同阶段真实许可');
  const next = clone(ledger), row = stageOf(next,stage);
  if (row.enabled !== 'enabled' || !['closed','authored','awaiting_handoff','delivered','blocked'].includes(row.progress)) throw new Error('只有已有成果或阻断阶段可以重新制作');
  if (next.stages.some(s => s.id !== stage && s.id !== 'qa_delivery' && ['in_progress','blocked','awaiting_handoff'].includes(s.progress))) throw new Error('存在其他未处理的创作活动阶段');
  const qa = stageOf(next,'qa_delivery');
  if (stage !== 'qa_delivery' && qa.progress !== 'not_started') {
    Object.assign(qa,{progress:'not_started',review:'not_reviewed',entryEvidence:null,acceptanceEvidence:null,handoff:null,reason:null});
    delete qa.automaticExecution;
  }
  for (const auth of next.authorizations) if (auth.stage === stage && auth.status === 'active') auth.status = 'expired';
  row.progress = 'blocked'; row.review = 'not_reviewed'; row.acceptanceEvidence = null; row.reason = '用户要求本次范围重新制作';
  return startStage(next,{stage,evidence,trackInterviewRoute});
}

export function skipStage(ledger, { stage, evidence, reason }) {
  requireEvidence(evidence, ['skip']);
  if (!OPTIONAL.has(stage) || evidence.stage !== stage || !evidence.targets.includes(stage)) throw new Error('跳过只适用于明确选择不做的可选阶段');
  const next = recordUserEvidence(ledger, evidence), row = stageOf(next, stage);
  if (!['not_started','deferred'].includes(row.progress)) throw new Error('不能用跳过抹掉已经制作或待审阅的成果');
  row.enabled = 'disabled'; row.progress = 'skipped'; row.reasonType = 'user_choice';
  row.skipEvidence = evidence.id; row.reason = reason || evidence.quote;
  return next;
}

export function beginAutomaticQa(ledger, { sourceStage, scope = 'current_stage' } = {}) {
  const next = clone(ledger), qa = stageOf(next, 'qa_delivery');
  if (qa.progress === 'blocked' && qa.automaticExecution) {
    const old = qa.automaticExecution;
    qa.automaticExecution = createAutomaticQaPolicy(next, { sourceStage: old.sources[0]?.stage, scope: old.scope });
    qa.progress = 'in_progress'; qa.reason = null;
    return next;
  }
  if (qa.enabled !== 'enabled' || !['not_started','deferred','delivered','closed'].includes(qa.progress)) throw new Error('QA 阶段不能重复进入或被静默覆盖');
  const policy = createAutomaticQaPolicy(next, { sourceStage, scope });
  if (['delivered','closed'].includes(qa.progress) && qa.automaticExecution && JSON.stringify(policy.sources) === JSON.stringify(qa.automaticExecution.sources)) throw new Error('同一交接已经技术交付，不能无限重复自动收尾；新修订须有真实许可和新交接');
  const ids = new Set(policy.sources.map(s => s.stage));
  if (next.stages.some(s => ['in_progress','blocked'].includes(s.progress) || s.progress === 'awaiting_handoff' && !ids.has(s.id))) throw new Error('制作尚未提交或存在其他活动阶段，不能自动收尾');
  for (const row of next.stages) if (ids.has(row.id) && row.progress === 'awaiting_handoff') {
    row.progress = 'authored';
    row.technicalContinuation = { policy: AUTOMATIC_QA_POLICY, entryEvidence: row.entryEvidence, handoffId: row.handoff.id };
  }
  qa.progress = 'in_progress'; qa.review = 'not_reviewed'; qa.entryEvidence = null;
  qa.acceptanceEvidence = null; qa.handoff = null; qa.reason = null; qa.automaticExecution = policy;
  return next;
}

export function blockAutomaticQa(ledger, reason) {
  const next = clone(ledger), row = stageOf(next, 'qa_delivery');
  if (!['in_progress','delivered'].includes(row.progress) || !row.automaticExecution || !reason?.trim()) throw new Error('自动 QA 阻断必须来自当前检查且说明原因');
  row.progress = 'blocked'; row.reason = reason; row.handoff = null; row.acceptanceEvidence = null; row.review = 'not_reviewed';
  return next;
}

export function validateTransitionResult(ledger, currentStage) {
  const result = validateStageLedger(ledger, currentStage);
  if (!result.ok) throw new Error(result.issues.join('\n'));
  return ledger;
}


export function readProjectState(projectRoot) {
  const root = path.resolve(projectRoot);
  const layout = validateProjectLayout(root); if (!layout.ok) throw new Error(layout.issues.join('\n'));
  const authorityPath = resolveProjectPath(root, STATE_DIR + '/authority.md');
  const nextPath = path.join(root, '制作文件/项目记录', 'NEXT.md');
  if (!fs.existsSync(authorityPath) || !fs.existsSync(nextPath)) throw new Error('缺少 制作文件/项目记录/authority.md 或 制作文件/项目记录/NEXT.md');
  const authority = fs.readFileSync(authorityPath, 'utf8');
  const next = fs.readFileSync(nextPath, 'utf8');
  const currentStage = authority.match(/^current_stage:\s*([^\r\n]+)$/m)?.[1]?.replace(/[`'"\s]/g, '');
  const match = authority.match(/(## 阶段账本\s*\r?\n\s*```json\s*\r?\n)([\s\S]*?)(\r?\n\s*```)/);
  if (!match) throw new Error('authority.md 缺少阶段账本 JSON 代码块');
  return { root, authorityPath, nextPath, authority, next, currentStage, ledger: JSON.parse(match[2]), block: match };
}

function replaceCurrentStage(text, stage) {
  return text.replace(/^(current_stage:\s*)[^\r\n]+$/m, `$1${stage}`);
}

function replaceNextStage(text, stage) {
  return text.replace(/(## 当前阶段\s*\r?\n\s*\r?\n\s*`)[^`]+(`)/, `$1${stage}$2`);
}

function replaceNextSection(text, title, body) {
  const lines = text.split(/\r?\n/); let fence = null, start = -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (!fence && /^##\s+/.test(lines[i])) {
      if (start >= 0) { end = i; break; }
      if (lines[i].replace(/^##\s+/,'').trim() === title) start = i;
    }
    if (marker) { if (!fence) fence = marker[1][0]; else if (fence === marker[1][0]) fence = null; }
  }
  const section = '## ' + title + '\n\n' + body + '\n';
  return start < 0 ? text.trimEnd() + '\n\n' + section : [...lines.slice(0,start),section,...lines.slice(end)].join('\n');
}

export function applyProjectEvent(projectRoot, event) {
  const state = readProjectState(projectRoot);
  let ledger = state.ledger;
  if (event.type === 'start' || event.type === 'reopen') {
    ledger = (event.type === 'reopen' ? reopenStage : startStage)(ledger, { stage: event.stage, evidence: event.evidence, trackInterviewRoute: true });
    state.authority = replaceCurrentStage(state.authority, event.stage);
    state.next = replaceNextStage(state.next, event.stage);
  } else if (event.type === 'interview-node') {
    ledger = recordInterviewNode(ledger, { stage: event.stage, node: event.node, status: event.nodeStatus });
  } else if (event.type === 'auto-qa') {
    if (event.stage !== 'qa_delivery') throw new Error('auto-qa 只能进入 QA 与交付');
    const sourceStage = event.sourceStage || state.currentStage;
    if (state.currentStage !== 'qa_delivery' && sourceStage !== state.currentStage) throw new Error('自动 QA 只能承接本次当前制作范围');
    ledger = beginAutomaticQa(ledger, { sourceStage, scope: event.scope });
    state.authority = replaceCurrentStage(state.authority, 'qa_delivery');
    state.next = replaceNextStage(state.next, 'qa_delivery');
    const policy = ledger.stages.find(s => s.id === 'qa_delivery').automaticExecution;
    state.next = replaceNextSection(state.next,'本轮允许修改','- 已授权制作范围的技术检查、构建和两目录交付：' + policy.sources.map(s => s.stage).join('、') + '。');
    state.next = replaceNextSection(state.next,'本轮不扩大','- 不新增创作取舍，不替用户验收，不启动/导入/发送未授权测试消息。');
    state.next = replaceNextSection(state.next,'当前未完成','- 默认执行本次范围 QA 与交付；用户创作审阅仍待完成。');
    state.next = replaceNextSection(state.next,'下一道门','完成本次范围检查并提交技术交付，不单独报备、不开启下一创作阶段。');
  } else if (event.type === 'qa-blocked') {
    if (event.stage !== 'qa_delivery' || state.currentStage !== 'qa_delivery') throw new Error('不是当前 QA 阶段');
    ledger = blockAutomaticQa(ledger, event.reason);
    state.next = replaceNextSection(state.next,'当前风险','- 当前 QA 检查失败（诊断数据）：' + JSON.stringify(event.reason));
    state.next = replaceNextSection(state.next,'下一道门','处理当前检查失败并重新运行自动 QA；不宣称已经交付成功。');
  } else if (event.type === 'skip') {
    ledger = skipStage(ledger, { stage: event.stage, evidence: event.evidence, reason: event.reason });
  } else if (event.type === 'handoff') {
    ledger = submitHandoff(ledger, { stage: event.stage, handoff: event.handoff });
    if (event.stage === 'qa_delivery') {
      state.next = replaceNextSection(state.next,'已完成','- 本次范围技术成果已提交，用户验收未被自动完成。');
      state.next = replaceNextSection(state.next,'当前未完成','- 用户审阅与实际尚未执行的宿主验收，查看当前 acceptance.json。');
      state.next = replaceNextSection(state.next,'当前风险','- 技术交付不替代实机运行和用户接受。');
      state.next = replaceNextSection(state.next,'下一道门','展示本次交付结果与验证限制，等待用户审阅，不自动开启下一创作阶段。');
    }
  } else if (event.type === 'accept') {
    ledger = acceptHandoff(ledger, { stage: event.stage, handoffId: event.handoffId, evidence: event.evidence });
  } else {
    throw new Error(`未知账本事件：${event.type}`);
  }
  const currentStage = ['start','reopen'].includes(event.type) ? event.stage : event.type === 'auto-qa' ? 'qa_delivery' : state.currentStage;
  const checked = validateStageLedger(ledger, currentStage);
  if (!checked.ok) throw new Error(checked.issues.join('\n'));
  const json = JSON.stringify(ledger, null, 2);
  state.authority = state.authority.replace(state.block[0], `${state.block[1]}${json}${state.block[3]}`);
  fs.writeFileSync(state.authorityPath, state.authority, 'utf8');
  fs.writeFileSync(state.nextPath, state.next, 'utf8');
  return { root: state.root, event: event.type, stage: event.stage, currentStage, ledger };
}
