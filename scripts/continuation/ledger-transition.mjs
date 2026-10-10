import fs from 'node:fs';
import { STATE_DIR, validateProjectLayout, resolveProjectPath } from '../project-layout.mjs';
import path from 'node:path';
import { STAGES, validateStageLedger } from './stage-ledger.mjs';
import { classifyUserReply, isBareContinue } from './user-intent.mjs';

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

export function startStage(ledger, { stage, evidence }) {
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
  row.acceptanceEvidence = null;
  row.handoff = null;
  row.reason = null;
  return next;
}

export function submitHandoff(ledger, { stage, handoff }) {
  const next = clone(ledger);
  const row = stageOf(next, stage);
  if (row.progress !== 'in_progress') throw new Error(`只有进行中的阶段可以提交交接：${stage}`);
  if (!handoff?.id || !handoff?.locator || !Array.isArray(handoff.artifacts) || handoff.artifacts.length === 0) throw new Error('交接必须包含 id、报告定位和实际制品');
  row.progress = 'awaiting_handoff';
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
  if (row.progress !== 'awaiting_handoff' || row.review !== 'pending' || row.handoff?.id !== handoffId) throw new Error('只能接受当前待审阅交接');
  row.progress = 'closed';
  row.review = 'accepted';
  row.acceptanceEvidence = evidence.id;
  // Accepting a handoff never silently starts the next stage.
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

export function applyProjectEvent(projectRoot, event) {
  const state = readProjectState(projectRoot);
  let ledger = state.ledger;
  if (event.type === 'start') {
    ledger = startStage(ledger, { stage: event.stage, evidence: event.evidence });
    state.authority = replaceCurrentStage(state.authority, event.stage);
    state.next = replaceNextStage(state.next, event.stage);
  } else if (event.type === 'handoff') {
    ledger = submitHandoff(ledger, { stage: event.stage, handoff: event.handoff });
  } else if (event.type === 'accept') {
    ledger = acceptHandoff(ledger, { stage: event.stage, handoffId: event.handoffId, evidence: event.evidence });
  } else {
    throw new Error(`未知账本事件：${event.type}`);
  }
  const currentStage = event.type === 'start' ? event.stage : state.currentStage;
  const checked = validateStageLedger(ledger, currentStage);
  if (!checked.ok) throw new Error(checked.issues.join('\n'));
  const json = JSON.stringify(ledger, null, 2);
  state.authority = state.authority.replace(state.block[0], `${state.block[1]}${json}${state.block[3]}`);
  fs.writeFileSync(state.authorityPath, state.authority, 'utf8');
  fs.writeFileSync(state.nextPath, state.next, 'utf8');
  return { root: state.root, event: event.type, stage: event.stage, currentStage, ledger };
}
