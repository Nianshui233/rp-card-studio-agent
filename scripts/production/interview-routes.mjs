import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const INTERVIEW_ROUTE_PATH = path.resolve(
  HERE,
  '../../internal-skills/rp-interview-orchestration/references/interview-routes.json',
);

export const INTERVIEW_ROUTES = JSON.parse(fs.readFileSync(INTERVIEW_ROUTE_PATH, 'utf8'));
export const FIXED_INTERVIEW_STAGES = Object.freeze(Object.keys(INTERVIEW_ROUTES.stages ?? {}));

const CLOSED_NODE_STATUSES = new Set(INTERVIEW_ROUTES.node_status_contract?.closed ?? []);

export function getInterviewRoute(stage) {
  return INTERVIEW_ROUTES.stages?.[stage] ?? null;
}

export function routeNodeIds(stage) {
  return (getInterviewRoute(stage)?.nodes ?? []).map((node) => node.id);
}

export function validateInterviewRouteDefinitions(routes = INTERVIEW_ROUTES) {
  const issues = [];
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return { ok: false, issues: ['访谈路线不是对象'] };
  if (routes.schema_version !== 1) issues.push('访谈路线 schema_version 必须为 1');
  if (!routes.route_contract?.source_prefill) issues.push('访谈路线缺少 source_prefill 规则');
  if (!routes.route_contract?.ordered_visit) issues.push('访谈路线缺少 ordered_visit 规则');
  if (!routes.route_contract?.no_silent_completion) issues.push('访谈路线缺少 no_silent_completion 规则');
  if (!routes.route_contract?.stage_handoff) issues.push('访谈路线缺少 stage_handoff 规则');
  if (!CLOSED_NODE_STATUSES.size) issues.push('访谈路线缺少 closed 节点状态');
  for (const [stage, definition] of Object.entries(routes.stages ?? {})) {
    if (!definition?.owner_skill) issues.push(stage + ' 缺少 owner_skill');
    if (!Array.isArray(definition?.nodes) || definition.nodes.length === 0) {
      issues.push(stage + ' 缺少有序 nodes');
      continue;
    }
    const ids = new Set();
    for (const [index, node] of definition.nodes.entries()) {
      const label = stage + '.' + (node?.id ?? index);
      if (!node?.id || ids.has(node.id)) issues.push(label + ' 节点 id 缺失或重复');
      ids.add(node?.id);
      if (!node?.label) issues.push(label + ' 缺少 label');
      if (!node?.purpose) issues.push(label + ' 缺少 purpose');
      if (!Array.isArray(node?.minimum) || node.minimum.length === 0) issues.push(label + ' 缺少 minimum');
      if (node?.decision_ids && (!Array.isArray(node.decision_ids) || new Set(node.decision_ids).size !== node.decision_ids.length)) {
        issues.push(label + ' decision_ids 无效');
      }
    }
  }
  for (const stage of routes.excluded_for_now ?? []) {
    if (routes.stages?.[stage]) issues.push('暂不纳入的阶段仍出现在固定路线：' + stage);
  }
  return { ok: issues.length === 0, issues };
}

export function validateInterviewRouteProgress(progress, stage) {
  const route = getInterviewRoute(stage);
  const issues = [];
  if (!route) return { ok: false, issues: ['没有固定访谈路线：' + stage] };
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return { ok: false, issues: ['访谈路线进度不是对象'] };
  if (progress.stage && progress.stage !== stage) issues.push('访谈路线进度阶段不一致：' + progress.stage + ' != ' + stage);
  const expected = route.nodes.map((node) => node.id);
  if (progress.currentNode !== null && progress.currentNode !== undefined && !expected.includes(progress.currentNode)) {
    issues.push(stage + ' 当前节点不在固定路线：' + progress.currentNode);
  }
  if (!Array.isArray(progress.visited)) issues.push(stage + ' 缺少 visited 节点列表');
  else {
    const seen = new Set();
    for (const id of progress.visited) {
      if (!expected.includes(id)) issues.push(stage + ' 访问了路线外节点：' + id);
      if (seen.has(id)) issues.push(stage + ' 重复访问节点：' + id);
      seen.add(id);
    }
    const positions = progress.visited.map((id) => expected.indexOf(id)).filter((index) => index >= 0);
    if (positions.some((position, index) => index > 0 && position < positions[index - 1])) issues.push(stage + ' 节点访问顺序错误');
  }
  if (progress.nodeStatus && typeof progress.nodeStatus === 'object') {
    for (const [id, status] of Object.entries(progress.nodeStatus)) {
      if (!expected.includes(id)) issues.push(stage + ' 为路线外节点记录状态：' + id);
      if (!CLOSED_NODE_STATUSES.has(status) && !INTERVIEW_ROUTES.node_status_contract.open.includes(status)) {
        issues.push(stage + '.' + id + ' 节点状态无效：' + status);
      }
    }
  }
  return { ok: issues.length === 0, issues, stage, expected, route };
}

export function validateInterviewRouteCompletion(progress, stage) {
  const result = validateInterviewRouteProgress(progress, stage);
  if (!result.route) return result;
  for (const id of result.expected) {
    if (!progress?.visited?.includes(id)) result.issues.push(stage + ' 尚未访问节点：' + id);
    const status = progress?.nodeStatus?.[id];
    if (!CLOSED_NODE_STATUSES.has(status)) result.issues.push(stage + '.' + id + ' 尚未以关闭状态结算：' + (status ?? '未记录'));
  }
  return { ...result, ok: result.issues.length === 0 };
}

const routeDefinitions = validateInterviewRouteDefinitions();
if (!routeDefinitions.ok) throw new Error('固定访谈路线定义无效：' + routeDefinitions.issues.join('；'));

