import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const agent = () => read('AGENT.md');
const coverage = () => JSON.parse(read('internal-skills/rp-interview-orchestration/references/stage-coverage.json'));

test('默认内容模型保持玩家中立，并把固定主控关系隔离为可选预设', () => {
  const text = [
    agent(),
    read('internal-skills/rp-project-foundation/SKILL.md'),
    read('internal-skills/rp-cast-authoring/SKILL.md'),
    read('internal-skills/rp-experience-authoring/SKILL.md'),
    read('internal-skills/st-opening-frontend-authoring/SKILL.md'),
    read('internal-skills/st-message-frontend-authoring/SKILL.md'),
  ].join('\n');
  assert.match(text, /开放世界/);
  assert.match(text, /固定主角/);
  assert.match(text, /可选.*主控|主控.*预设|固定.*预设/s);
  assert.match(text, /玩家中立|角色中立|对外部主控.*不.*预绑定|不.*绑定.*主控/s);
  assert.match(text, /<user>/i);
  assert.match(text, /多个主控|多主控|切换.*主控/s);
  assert.match(text, /世界.*没有.*主控|没有.*<user>.*运行|不依赖.*玩家/s);
});

test('运行能力由用户明确选择，执行 Agent 不得静默关闭', () => {
  const data = coverage();
  const options = data.preflight_runtime_capabilities.options;
  for (const key of ['mvu', 'mvu_zod', 'ejs', 'tavern_helper']) {
    assert(options[key], `missing preflight capability option: ${key}`);
    assert(options[key].player_label, `${key} needs a user-facing label`);
    assert(options[key].player_question, `${key} needs a user-facing question`);
  }
  assert.match(data.preflight_runtime_capabilities.display_rule, /独立.*多选|独立.*选项/);
  assert.match(data.preflight_runtime_capabilities.partial_answer_rule, /沉默.*disabled|不能.*静默/);

  const runtimeDocs = [
    read('internal-skills/st-mvu-authoring/SKILL.md'),
    read('internal-skills/st-ejs-authoring/SKILL.md'),
    read('internal-skills/st-mvu-ejs-bridge/SKILL.md'),
    read('internal-skills/st-tavern-helper-engineering/SKILL.md'),
    read('internal-skills/st-integration-qa/SKILL.md'),
  ].join('\n');
  assert.match(runtimeDocs, /用户明确选择/);
  assert.match(runtimeDocs, /静默关闭|静默降级/);
  assert.match(runtimeDocs, /MVU_ZOD|mvu_zod/);
  assert.match(runtimeDocs, /EJS.*MVU|MVU.*EJS/s);
});

test('前端能力选择与玩家身份授权保持分离', () => {
  const text = [
    read('internal-skills/st-opening-frontend-authoring/SKILL.md'),
    read('internal-skills/st-message-frontend-authoring/SKILL.md'),
    read('internal-skills/st-tavern-helper-engineering/SKILL.md'),
    read('internal-skills/st-mvu-authoring/SKILL.md'),
    read('internal-skills/st-ejs-authoring/SKILL.md'),
  ].join('\n');
  assert.match(text, /不.*默认.*主控|不得.*创建.*默认主控|不.*固定.*外部主控关系/s);
  assert.match(text, /只.*展示|只读|状态.*投影/s);
  assert.match(text, /交互.*不.*身份|权限.*不.*主控|主控.*关系/s);
});


test('默认开场交接由用户维护或导入主控，不把资料直接发送给 AI', () => {
  const docs = [
    read('AGENT.md'),
    read('README.md'),
    read('orchestrator/interview-playbook.md'),
    read('internal-skills/st-opening-frontend-authoring/SKILL.md'),
    read('internal-skills/st-opening-frontend-authoring/references/creation-flow.md'),
    read('internal-skills/st-integration-qa/references/integration.md'),
    read('internal-skills/st-integration-qa/references/validation.md'),
  ].join('\n');
  assert.match(docs, /用户.*维护.*导入.*主控|用户自己维护.*主控/s);
  assert.match(docs, /不.*直接.*发送.*AI|不.*主控资料.*发送/s);
  assert.match(docs, /<user>/i);
  assert.doesNotMatch(docs, /粘贴并亲手发送|作为新聊天第一条玩家消息亲手发送/);
});
