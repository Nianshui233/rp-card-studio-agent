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
