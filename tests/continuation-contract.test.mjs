import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES } from '../scripts/continuation/stage-ledger.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('continuation is a mandatory project-aware stage before creative stages', () => {
  const routing = read('orchestrator/routing.yaml');
  assert.match(routing, /state_persistence: project_files_and_conversation/);
  assert.match(routing, /^  continuation:\r?$/m);
  assert.match(routing, /primary_skill: rp-project-continuation/);
  assert.match(routing, /continuation:[\s\S]*next: materials/);
  assert.match(routing, /materials:[\s\S]*primary_skill: rp-materials-research/);
});

test('continuation contracts define authority, NEXT, materials, acceptance, and board', () => {
  const skill = read('internal-skills/rp-project-continuation/SKILL.md');
  const template = read('assets/templates/continuation/authority.md');
  const next = read('assets/templates/continuation/NEXT.md');
  const board = read('assets/templates/continuation/progress-board.md');
  for (const token of ['authority.md', 'NEXT.md', 'materials.json', 'acceptance.json', '当前对话进度画板', '暂缓', '阻断/待实测']) assert.match(skill, new RegExp(token));
  for (const token of ['已确认创作事实', '待决定事项', '当前风险', '下一道门']) assert.match(template, new RegExp(token));
  for (const token of ['当前阶段', '本轮不扩大', '下一次续接指令']) assert.match(next, new RegExp(token));
  assert.match(board, /RP 项目进度画板/);
  assert.match(board, /fenced code block|代码块/);
  assert.doesNotMatch(board, /┌─ RP 项目进度画板/);
});

test('old conversation-only and anti-state rules are removed', () => {
  const agent = read('AGENT.md');
  const loop = read('orchestrator/stage-loop.md');
  const brainstorm = read('internal-skills/rp-concept-brainstorm/SKILL.md');
  for (const text of [agent, loop, brainstorm]) {
    assert.doesNotMatch(text, /conversation_only/);
    assert.doesNotMatch(text, /阶段状态只存在于当前对话/);
    assert.doesNotMatch(text, /不得创建脑暴状态/);
  }
  assert.match(agent, /制作文件\/项目记录\/authority\.md/);
  assert.match(loop, /当前对话进度画板/);
});


test('portable authorization policy is loaded and preserves existing stage contracts', () => {
  const loop = read('orchestrator/stage-loop.md');
  const policy = read('orchestrator/stage-authorization.md');
  const continuation = read('internal-skills/rp-project-continuation/SKILL.md');
  for (const file of ['AGENT.md', 'SKILL.md', 'orchestrator/stage-loop.md', 'internal-skills/rp-project-continuation/SKILL.md', 'internal-skills/rp-interview-orchestration/SKILL.md']) assert.match(read(file), /stage-authorization\.md/);
  assert.match(loop, /待交接/);
  assert.doesNotMatch(loop, /→ 进入下一个启用阶段/);
  assert.match(loop, /玩家中立性与主控切换 QA/);
  assert.match(loop, /预检/);
  assert.match(continuation, /materials\/v2/);
  assert.match(continuation, /sourceAuthenticity/);
  for (const word of ['entryEvidence', 'userEvidence', 'authorizations', 'decisions', 'responseTo', 'migrationRequired', '真实用户', '结束本轮', '不是宿主']) assert.ok(policy.includes(word), word);
});
test('ledger stage list exactly matches routing stage ids', () => {
  const routing = read('orchestrator/routing.yaml');
  const body = routing.split('stages:\n')[1].split('\nskill_paths:')[0];
  const ids = [...body.matchAll(/^  (\w+):\s*$/gm)].map(match => match[1]);
  assert.deepEqual(STAGES, ids);
});

test('production layer is a mandatory correctness gate for runtime projects', () => {
  const contract = read('orchestrator/production-contract.md');
  const agent = read('AGENT.md');
  for (const text of [contract, agent]) {
    assert.match(text, /production.json/);
    assert.match(text, /变量列表/);
    assert.match(text, /user_observation/);
    assert.match(text, /hypothesis/);
  }
});
