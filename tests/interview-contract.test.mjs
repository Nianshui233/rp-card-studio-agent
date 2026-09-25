import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrixPath = path.join(root, 'internal-skills', 'rp-interview-orchestration', 'references', 'stage-coverage.json');
const skillPath = path.join(root, 'internal-skills', 'rp-interview-orchestration', 'SKILL.md');
const routingPath = path.join(root, 'orchestrator', 'routing.yaml');

function coverage() { return JSON.parse(fs.readFileSync(matrixPath, 'utf8')); }

test('every user-facing creation stage has interview coverage and ownership boundaries', () => {
  const data = coverage();
  const routing = fs.readFileSync(routingPath, 'utf8');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const stageNames = ['brainstorm', 'positioning', 'materials', 'worldbuilding', 'character', 'systems', 'scenes', 'mvu_ejs', 'narrative_opening', 'opening_frontend', 'message_frontend'];
  for (const name of stageNames) {
    const stage = data.stages[name];
    assert(stage, `missing interview coverage for ${name}`);
    assert(stage.owner_skill, `${name} must preserve domain ownership`);
    assert(stage.decisions.length >= 2, `${name} needs concrete decision coverage`);
    const block = routing.match(new RegExp(`^  ${name}:\\r?\\n([\\s\\S]*?)(?=^  [a-z_]+:\\r?\\n|^skill_paths:)`, 'm'))?.[1];
    assert(block?.includes('rp-interview-orchestration'), `${name} must route through the interview controller`);
  }
  assert.match(routing, /rp-interview-orchestration:\s*internal-skills\/rp-interview-orchestration\/SKILL\.md/);
  assert.match(skill, /高影响.*不得静默|不得静默.*高影响/s);
});

test('decision entries distinguish source-resolved, user decisions, delegated choices, and explicit skips', () => {
  const data = coverage();
  const allowed = new Set(['ask_if_unknown', 'resolve_from_material', 'agent_default_if_low_risk', 'ask_or_explicitly_delegate']);
  for (const [stageName, stage] of Object.entries(data.stages)) {
    for (const item of stage.decisions) {
      assert(item.id, `${stageName} decision needs a stable local ID`);
      assert(item.trigger, `${stageName}.${item.id} needs a trigger`);
      assert(item.player_language, `${stageName}.${item.id} must be phrased in player language`);
      assert(allowed.has(item.policy), `${stageName}.${item.id} has an unknown decision policy`);
      assert(item.skip_when, `${stageName}.${item.id} must say when it is already answered or irrelevant`);
    }
  }
});


test('frontend interviews elicit user-specific visual and content preferences before implementation', () => {
  const data = coverage();
  const controller = fs.readFileSync(skillPath, 'utf8');
  const openingSkill = fs.readFileSync(path.join(root, 'internal-skills', 'st-opening-frontend-authoring', 'SKILL.md'), 'utf8');
  const openingRef = fs.readFileSync(path.join(root, 'internal-skills', 'st-opening-frontend-authoring', 'references', 'opening-ui.md'), 'utf8');
  const messageSkill = fs.readFileSync(path.join(root, 'internal-skills', 'st-message-frontend-authoring', 'SKILL.md'), 'utf8');
  const messageRef = fs.readFileSync(path.join(root, 'internal-skills', 'st-message-frontend-authoring', 'references', 'message-ui.md'), 'utf8');
  for (const name of ['opening_frontend', 'message_frontend']) {
    const stage = data.stages[name];
    assert.equal(stage.personalization_gate?.required_before_implementation, true, `${name} must gate visual implementation on elicited preferences or explicit delegation`);
    assert(stage.personalization_gate?.ask_unless_explicitly_delegated, `${name} must not silently choose the look and feel`);
    const ids = new Set(stage.decisions.map(item => item.id));
    for (const requiredId of ['visual-direction', 'layout-and-information', 'interaction-feel']) {
      assert(ids.has(requiredId), `${name} must ask about ${requiredId}`);
    }
    const personalization = stage.decisions.filter(item => ['visual-direction', 'layout-and-information', 'interaction-feel'].includes(item.id));
    for (const item of personalization) {
      assert(['ask_or_explicitly_delegate', 'ask_if_unknown'].includes(item.policy), `${name}.${item.id} must ask, not silently default`);
      assert.doesNotMatch(item.player_language, /CSS|iframe|API|breakpoint|React|DOM|变量|Schema/);
    }
  }
  assert.match(controller, /主题气质.*高影响创作决定/s);
  assert.match(openingSkill, /开始视觉实现前/);
  assert.match(openingRef, /个性化设计访谈（实现前必经）/);
  assert.match(messageSkill, /视觉风格、排版偏好、要展示的信息和交互感受是第一优先级/);
  assert.match(messageRef, /个性化视觉与交互访谈（实现前必经）/);
  assert.doesNotMatch(messageRef, /不要先问颜色、框架或组件清单。先提出信息优先级/);
 });
