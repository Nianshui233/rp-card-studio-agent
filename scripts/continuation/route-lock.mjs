import fs from 'node:fs';
import { STATE_DIR, ensureProjectFolders, resolveProjectPath } from '../project-layout.mjs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROUTE_LOCK_SCHEMA = 'rp-card-studio/route-lock/v1';
const ORCHESTRATOR_FILES = [
  'orchestrator/routing.yaml',
  'orchestrator/project-layout.md',
  'scripts/project-layout.mjs',
  'orchestrator/stage-loop.md',
  'orchestrator/stage-authorization.md',
  'orchestrator/automatic-work.md',
  'scripts/continuation/automatic-qa-policy.mjs',
  'orchestrator/interview-playbook.md',
  'orchestrator/artifact-purity.md',
  'internal-skills/rp-interview-orchestration/references/interview-routes.json',
  'internal-skills/rp-interview-orchestration/references/stage-coverage.json',
  'scripts/production/interview-routes.mjs'
];

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseList(value) {
  const match = String(value ?? '').match(/\[([^\]]*)\]/);
  if (!match) return [];
  return match[1].split(',').map(item => item.trim()).filter(Boolean);
}

export function parseRouting(text) {
  const lines = String(text).split(/\r?\n/);
  const stages = {};
  let current = null;
  for (const line of lines) {
    const stage = line.match(/^  ([A-Za-z0-9_]+):\s*$/);
    if (stage) {
      current = stage[1];
      stages[current] = { primary: null, supporting: [], requiredFiles: [] };
      continue;
    }
    if (!current) continue;
    const primary = line.match(/^    primary_skill:\s*([^\s#]+)\s*$/);
    if (primary) stages[current].primary = primary[1] === 'null' ? null : primary[1];
    const supporting = line.match(/^    supporting_skills:\s*(\[[^\]]*\])\s*$/);
    if (supporting) stages[current].supporting = parseList(supporting[1]);
    const requiredFiles = line.match(/^    required_files:\s*(\[[^\]]*\])\s*$/);
    if (requiredFiles) stages[current].requiredFiles = parseList(requiredFiles[1]);
    if (line === 'skill_paths:') current = null;
  }
  const skillPaths = {};
  let inSkillPaths = false;
  for (const line of lines) {
    if (line === 'skill_paths:') { inSkillPaths = true; continue; }
    if (!inSkillPaths) continue;
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*(\S+)\s*$/);
    if (match) skillPaths[match[1]] = match[2];
  }
  return { stages, skillPaths };
}

export function createRouteLock(rootValue, stage) {
  const root = path.resolve(rootValue);
  const routingPath = path.join(root, 'orchestrator', 'routing.yaml');
  const routingText = fs.readFileSync(routingPath, 'utf8');
  const routing = parseRouting(routingText);
  const route = routing.stages[stage];
  if (!route) throw new Error(`routing.yaml 未声明阶段：${stage}`);
  const skillNames = [route.primary, ...route.supporting].filter(Boolean);
  const files = [...ORCHESTRATOR_FILES, ...(route.requiredFiles || []), ...skillNames.map(name => routing.skillPaths[name])];
  const uniqueFiles = [...new Set(files)];
  const fileHashes = Object.fromEntries(uniqueFiles.map(relative => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) throw new Error(`路由要求的 Skill/合同不存在：${relative}`);
    return [relative, hashFile(absolute)];
  }));
  return {
    schema: ROUTE_LOCK_SCHEMA,
    stage,
    primarySkill: route.primary,
    supportingSkills: route.supporting,
    requiredFiles: uniqueFiles,
    routingSha256: hashFile(routingPath),
    fileSha256: fileHashes,
    createdAt: new Date().toISOString()
  };
}

export function validateRouteLock(lock, rootValue, currentStage = lock?.stage) {
  const root = path.resolve(rootValue);
  const issues = [];
  if (!lock || lock.schema !== ROUTE_LOCK_SCHEMA) issues.push('route-lock schema 无效');
  if (!lock?.stage || lock.stage !== currentStage) issues.push('route-lock 阶段与当前阶段不一致');
  let expected;
  try { expected = createRouteLock(root, currentStage); }
  catch (error) { return { ok: false, issues: [...issues, error.message] }; }
  if (lock.routingSha256 !== expected.routingSha256) issues.push('routing.yaml 已变化，route-lock 失效');
  if (lock.primarySkill !== expected.primarySkill) issues.push('route-lock primary Skill 不匹配');
  if (JSON.stringify(lock.supportingSkills ?? []) !== JSON.stringify(expected.supportingSkills)) issues.push('route-lock supporting Skills 不匹配');
  if (JSON.stringify(lock.requiredFiles ?? []) !== JSON.stringify(expected.requiredFiles)) issues.push('route-lock 文件清单不匹配');
  for (const [relative, hash] of Object.entries(expected.fileSha256)) {
    if (lock.fileSha256?.[relative] !== hash) issues.push(`route-lock 文件未被读取或已变化：${relative}`);
  }
  return { ok: issues.length === 0, issues, expected };
}

export function writeRouteLock(projectRoot, agentRoot, stage) {
  const lock = createRouteLock(agentRoot, stage);
  const directory = path.join(ensureProjectFolders(projectRoot), STATE_DIR);
  fs.mkdirSync(directory, { recursive: true });
  const target = resolveProjectPath(projectRoot, STATE_DIR + '/route-lock.json', { output: true });
  fs.writeFileSync(target, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  return { path: target, lock };
}
