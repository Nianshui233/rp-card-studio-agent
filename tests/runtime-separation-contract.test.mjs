import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('routing keeps MVU, EJS, and their bridge as separate stages and skills', () => {
  const routing = read('orchestrator/routing.yaml');
  assert.match(routing, /^  mvu:\r?$/m);
  assert.match(routing, /^  ejs:\r?$/m);
  assert.match(routing, /^  runtime_bridge:\r?$/m);
  assert.match(routing, /primary_skill: st-mvu-authoring/);
  assert.match(routing, /primary_skill: st-ejs-authoring/);
  assert.match(routing, /primary_skill: st-mvu-ejs-bridge/);
  assert.doesNotMatch(routing, /\bmvu_ejs:/);
  assert.doesNotMatch(routing, /st-runtime-authoring/);
});

test('MVU skill does not author EJS and EJS skill does not author MVU', () => {
  const mvu = read('internal-skills/st-mvu-authoring/SKILL.md');
  const ejs = read('internal-skills/st-ejs-authoring/SKILL.md');
  const bridge = read('internal-skills/st-mvu-ejs-bridge/SKILL.md');
  assert.match(mvu, /不生成 `.ejs`/);
  assert.match(mvu, /不因为用户需要状态栏就自动加入 EJS/);
  assert.match(ejs, /不生成 MagVarUpdate Loader/);
  assert.match(ejs, /不把 EJS 变量称为 MVU 状态/);
  assert.match(bridge, /仅当 `st-mvu-authoring` 与 `st-ejs-authoring` 已分别完成/);
  assert.match(bridge, /默认只允许[\s\S]*MVU 持有权威状态[\s\S]*EJS 只读/);
});

test('user-facing contracts describe outcomes separately instead of offering one combined option', () => {
  const agent = read('AGENT.md');
  const loop = read('orchestrator/stage-loop.md');
  const readme = read('README.md');
  assert.match(agent, /跨消息持久状态/);
  assert.match(agent, /动态 Prompt.*模板/);
  assert.match(loop, /是否需要让任务、关系、物品、时间地点等在后续消息中持续变化/);
  assert.match(loop, /是否需要让 Prompt、世界书内容或 STPT 页面根据当前上下文自动变化/);
  assert.match(readme, /MVU 持久状态、EJS 动态模板、可选 MVU→EJS bridge/);
  assert.doesNotMatch(agent, /MVU\/EJS/);
  assert.doesNotMatch(readme, /MVU\/EJS/);
});

test('preflight always exposes EJS separately and does not disable it when only MVU is selected', () => {
  const mainSkill = read('SKILL.md');
  const agent = read('AGENT.md');
  const loop = read('orchestrator/stage-loop.md');
  const routing = read('orchestrator/routing.yaml');
  const coverage = JSON.parse(read('internal-skills/rp-interview-orchestration/references/stage-coverage.json'));
  assert.match(mainSkill, /跨消息持久状态（MVU）[\s\S]*动态 Prompt\/世界书模板\/条件渲染（EJS）/);
  assert.match(mainSkill, /选择 MVU 不代表拒绝 EJS/);
  assert.match(agent, /不得只列 MVU 而遗漏 EJS/);
  assert.match(agent, /用户没有提到 EJS，不等于 EJS=`disabled`/);
  assert.match(loop, /用户只回答“要 MVU”：MVU=`enabled`，EJS 仍为 `unresolved`/);
  assert.match(loop, /用户只选择 EJS：EJS=`enabled`，MVU 仍为 `unresolved`/);
  assert.match(routing, /mvu:[\s\S]*enable_when: mvu_enabled[\s\S]*ejs:[\s\S]*enable_when: ejs_enabled/);
  assert.equal(coverage.preflight_runtime_capabilities.options.mvu.does_not_imply, 'EJS');
  assert.equal(coverage.preflight_runtime_capabilities.options.ejs.does_not_imply, 'MVU');
  assert.match(coverage.preflight_runtime_capabilities.partial_answer_rule, /Silence about EJS never means EJS is disabled/);
});


