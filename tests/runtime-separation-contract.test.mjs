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
  assert.match(bridge, /两种合法的只读桥/);
  assert.match(bridge, /MVU 是唯一状态权威/);
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




test('bridge docs preserve the stable shared-message-variable EJS route', () => {
  const bridge = read('internal-skills/st-mvu-ejs-bridge/SKILL.md');
  const reference = read('internal-skills/st-mvu-ejs-bridge/references/bridge.md');
  assert.match(bridge, /shared_message_variables/);
  assert.match(bridge, /explicit_context/);
  assert.match(bridge, /getvar\('stat_data/);
  assert.match(reference, /shared_message_variables/);
  assert.match(reference, /当前消息/);
  assert.match(reference, /只读/);
});


test('API references match the refreshed local core and extension surfaces', () => {
  const api = read('internal-skills/st-api-reference/references/api-contract.md');
  const helper = read('internal-skills/st-api-reference/references/tavern-helper-runtime.md');
  const ejsRuntime = read('internal-skills/st-ejs-authoring/references/ejs-runtime.md');
  const mvuRuntime = read('internal-skills/st-mvu-authoring/references/mvu-runtime.md');
  const host = read('internal-skills/st-host-capabilities/references/host-capability-matrix.md');
  for (const token of ['1.19.0', 'generateRawData', 'getWorldInfoNames', 'variables.local/global', 'writeExtensionFieldBulk', 'getContext()']) assert.match(api, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const token of ['4.11.2', 'GENERATION_REQUESTED', 'custom_api', 'json_schema', 'reasoning_signature', 'script', 'extension']) assert.match(helper, new RegExp(token));
  assert.match(ejsRuntime, /1\.17\.9/);
  assert.match(ejsRuntime, /getwi\('书名'/);
  assert.match(mvuRuntime, /b13b43b/);
  assert.match(mvuRuntime, /MvuData \| undefined/);
  assert.match(host, /1\.19\.0/);
  assert.match(host, /1\.17\.9/);
});


test('Tavern Helper engineering surface is routed separately from message semantics', () => {
  const routing = read('orchestrator/routing.yaml');
  const skill = read('internal-skills/st-tavern-helper-engineering/SKILL.md');
  assert.match(routing, /st-tavern-helper-engineering/);
  assert.match(skill, /createScriptIdDiv/);
  assert.match(skill, /createScriptIdIframe/);
  assert.match(skill, /mountStreamingMessages/);
  assert.match(skill, /pagehide/);
  assert.match(skill, /DOMContentLoaded.*唯一入口/);
});


test('runtime debugging follows the human tutorial evidence order', () => {
  const runtime = read('internal-skills/st-runtime-debug/SKILL.md');
  const matrix = read('internal-skills/st-runtime-debug/references/acceptance-matrix.md');
  for (const token of ['变量管理器', '日志查看器/Console', 'Prompt 查看器', '原始 assistant 回复', '保存与重载']) assert.match(runtime, new RegExp(token));
  assert.match(runtime, /制作阶段可以暂时关闭提示词模板和酒馆助手宏/);
  assert.match(matrix, /原始世界书文本/);
  assert.match(matrix, /宏替换后的最终 Prompt/);
});


test('MVU_ZOD bridge accepts the current schema marker shape', () => {
  const runtime = read('internal-skills/st-mvu-authoring/references/mvu-runtime.md');
  const bridge = read('internal-skills/st-mvu-ejs-bridge/references/bridge.md');
  const agent = read('AGENT.md');
  assert.match(runtime, /schema: ObjectSchemaNode \| "没有用别管这个"/);
  assert.match(runtime, /不能把 ZOD 标记字符串误判成缺少快照/);
  assert.match(bridge, /没有用别管这个/);
  assert.match(agent, /schema: "没有用别管这个"/);
});
