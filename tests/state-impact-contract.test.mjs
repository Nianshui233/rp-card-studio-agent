import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coveragePath = path.join(root, 'internal-skills', 'rp-interview-orchestration', 'references', 'stage-coverage.json');
const controllerPath = path.join(root, 'internal-skills', 'rp-interview-orchestration', 'SKILL.md');
const loopPath = path.join(root, 'orchestrator', 'stage-loop.md');
const messageSkillPath = path.join(root, 'internal-skills', 'st-message-frontend-authoring', 'SKILL.md');
const mvuSkillPath = path.join(root, 'internal-skills', 'st-mvu-authoring', 'SKILL.md');

const read = file => fs.readFileSync(file, 'utf8');
const coverage = () => JSON.parse(read(coveragePath));

test('late frontend requests must classify state ownership before implementation', () => {
  const data = coverage();
  const message = data.stages.message_frontend;
  const item = message.decisions.find(decision => decision.id === 'state-impact');
  assert(coverage().stages.mvu.decisions.some(decision => decision.id === 'state-ownership'), 'runtime stage must own canonical state extension decisions');
  assert(item, 'message frontend needs a state-impact decision');
  assert.equal(item.policy, 'ask_or_explicitly_delegate');
  assert.match(item.player_language, /只是展示|会影响|记住|派生|状态/);
  assert.match(item.skip_when, /already|explicit|read-only|已由|不需要新增|只读/i);
});

test('cross-stage state changes route back to the owning stage and forbid hidden frontend state', () => {
  const controller = read(controllerPath);
  const loop = read(loopPath);
  const message = read(messageSkillPath);
  const mvu = read(mvuSkillPath);
  assert.match(controller, /existing_state/);
  assert.match(controller, /derived_view/);
  assert.match(controller, /transient_ui_state/);
  assert.match(controller, /new_persistent_state/);
  assert.match(controller, /reopen_routes/);
  assert.match(controller, /`mvu`/);
  assert.match(controller, /时间.*地点.*天气/);
  assert.match(controller, /可前往地点/);
  assert.match(controller, /人物属性/);
  assert.match(loop, /跨阶段|前置|状态模型|返回/);
  assert.match(message, /不得.*影子状态|state-impact|状态归属/);
  assert.match(mvu, /唯一状态合同|状态.*权威|派生/);
});

test('coverage declares the state-owning stages that a late UI request can reopen', () => {
  const data = coverage();
  for (const name of ['systems', 'scenes', 'character', 'mvu']) {
    assert(data.stages[name], `missing ${name} stage`);
    assert(data.stages[name].owner_skill, `${name} must own state semantics`);
  }
  assert(data.reopen_routes, 'coverage must define cross-stage reopen routes');
  assert.equal(data.reopen_routes.message_frontend_new_persistent_state, 'mvu');
  assert.deepEqual(data.reopen_routes.message_frontend_new_character_attribute_semantics, ['character', 'mvu']);
  assert.deepEqual(data.reopen_routes.message_frontend_new_gameplay_mechanic, ['systems', 'mvu']);
  assert.equal(data.reopen_routes.message_frontend_new_dynamic_template, 'ejs');
  assert.deepEqual(data.reopen_routes.ejs_needs_mvu_state, ['mvu', 'ejs', 'runtime_bridge']);
  assert(data.stages.opening_frontend.decisions.some(decision => decision.id === 'state-impact'), 'opening creation fields also need a state-ownership check');
});
