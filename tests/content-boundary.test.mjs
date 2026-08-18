import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const root = process.cwd();

async function text(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('Agent separates authoring-time cleanup from runtime neutrality', async () => {
  const agent = await text('AGENT.md');
  assert.match(agent, /制作期内容边界与成品中立性/);
  assert.match(agent, /original\.json.*preserved\.json/);
  assert.match(agent, /不得因此向最终项目加入/);
  assert.match(agent, /成品交付后如何修改和游玩不由卡内代码继续管理/);
  assert.match(agent, /年龄仍可作为普通角色事实/);
});

test('runtime and integration modules reject smuggling authoring cleanup into the card', async () => {
  const runtime = await text('internal-skills/st-runtime-authoring/SKILL.md');
  const runtimeReference = await text('internal-skills/st-runtime-authoring/references/mvu-ejs.md');
  const integration = await text('internal-skills/st-integration-qa/SKILL.md');
  const validation = await text('internal-skills/st-integration-qa/references/validation.md');
  assert.match(runtime, /年龄门禁|成年门禁/);
  assert.match(runtimeReference, /年龄门禁|成年门禁/);
  assert.match(integration, /年龄\/成年门禁/);
  assert.match(validation, /年龄\/成年门禁/);
  assert.match(runtime, /交付后.*玩法/);
  assert.match(integration, /运行时.*年龄\/成年门禁/);
  assert.match(runtimeReference, /adult_intimacy_without_adult_gate/);
  assert.match(integration, /original\.json.*preserved\.json/);
});

test('retrofit sample records clean-and-omit without a runtime gate', async () => {
  const assembly = YAML.parse(await text('assets/examples/retrofit-rp/assembly.yaml'));
  assert.equal(assembly.content_boundary.authoring_action, 'clean_and_omit');
  assert.equal(assembly.content_boundary.runtime_gate, 'none');
  assert.match(assembly.content_boundary.source_fidelity, /original\.json/);
  assert.match(assembly.content_boundary.source_fidelity, /preserved\.json/);
  assert.match(assembly.content_boundary.maintained_sources, /不写入/);
});

test('evaluation set covers the no-runtime-gate correction from the legacy retrofit session', async () => {
  const evals = JSON.parse(await text('evals/evals.json'));
  const item = evals.evals.find((entry) => entry.id === 10);
  assert.ok(item);
  assert.match(item.prompt, /未成年人的成人性旧档案/);
  assert.match(item.prompt, /不要.*年龄门禁/);
  assert.ok(item.expectations.some((expectation) => /年龄门禁/.test(expectation)));
});
