import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('materials stage runs before brainstorm and positioning when source or research is present', () => {
  const routing = read('orchestrator/routing.yaml');
  assert.match(routing, /continuation:[\s\S]*next: materials[\s\S]*materials:[\s\S]*primary_skill: rp-materials-research/);
  assert.match(routing, /enable_when: source_material_present_or_external_research_required/);
  assert.match(routing, /materials:[\s\S]*next: brainstorm[\s\S]*brainstorm:[\s\S]*next: positioning/);
});

test('material processing is unconditional for any supplied source size', () => {
  const skill = read('internal-skills/rp-materials-research/SKILL.md');
  const materials = read('internal-skills/rp-project-foundation/references/materials.md');
  for (const text of [skill, materials]) {
    assert.match(text, /任何|任何用户提供/);
    assert.match(text, /资料大小不影响|不按字数|不按资料大小/);
    assert.match(text, /短资料/);
  }
  assert.match(skill, /source_material_processing/);
});

test('external research is proactive but can be explicitly disabled or blocked honestly', () => {
  const agent = read('AGENT.md');
  const skill = read('internal-skills/rp-materials-research/SKILL.md');
  assert.match(agent, /proactive_external_research/);
  assert.match(skill, /不要求用户额外说“可以搜索”/);
  assert.match(skill, /research\.status.*blocked/);
  assert.match(skill, /明确要求“不联网”/);
});

test('materials v2 template carries processing and research states', () => {
  const template = read('assets/templates/continuation/materials.json');
  assert.match(template, /rp-card-studio\/materials\/v2/);
  assert.match(template, /"processing"/);
  assert.match(template, /"research"/);
  assert.match(template, /"synthesis"/);
});
