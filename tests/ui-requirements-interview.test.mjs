import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const root = process.cwd();

function readYaml(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8').then(YAML.parse);
}

function assertRequirements(requirements, label) {
  assert.ok(requirements, `${label} should persist ui_requirements`);
  assert.ok(['draft', 'locked'].includes(requirements.interview_status), `${label} interview status`);
  assert.equal(typeof requirements.purpose, 'string', `${label} purpose`);
  assert.equal(typeof requirements.primary_journey, 'string', `${label} journey`);
  assert.ok(Array.isArray(requirements.player_tasks), `${label} player tasks`);
  for (const key of ['must_show', 'useful', 'detail_only', 'may_be_empty']) {
    assert.ok(Array.isArray(requirements.information[key]), `${label} information.${key}`);
  }
  assert.ok(Array.isArray(requirements.interactions.desired), `${label} interactions`);
  assert.equal(typeof requirements.visual.direction, 'string', `${label} visual direction`);
  assert.ok(['single', 'switchable', 'project_decided'].includes(requirements.visual.theme_mode), `${label} theme mode`);
  assert.ok(['desktop', 'mobile', 'equal'].includes(requirements.device.priority), `${label} device priority`);
  assert.ok(['message_surface', 'standalone_document', 'zero_layer'].includes(requirements.carrier.agent_choice), `${label} carrier`);
  assert.ok(['system_stack', 'design_reference', 'remote_font', 'local_font', 'embedded_subset'].includes(requirements.assets.font_strategy), `${label} font strategy`);
  assert.ok(['project_svg', 'font_awesome_svg', 'web_font', 'remote_library', 'css_only'].includes(requirements.assets.icon_strategy), `${label} icon strategy`);
  assert.ok(Array.isArray(requirements.assets.remote_dependencies), `${label} asset dependencies`);
}

test('UI interview contract covers user-facing discovery without replacing technical contracts', async () => {
  const interview = await readFile(path.join(root, 'internal-skills', 'st-frontend-authoring', 'references', 'ui-requirements-interview.md'), 'utf8');
  const assets = await readFile(path.join(root, 'internal-skills', 'st-frontend-authoring', 'references', 'ui-assets.md'), 'utf8');
  assert.match(interview, /每轮最多询问 3–4 个/);
  assert.match(interview, /字段到组件的主动建议/);
  assert.match(interview, /用户没有提供时，Agent 可以自行生成/);
  assert.match(interview, /完全放权/);
  assert.match(interview, /生产者.*模型提示词处理.*玩家显示替换.*HTML 数据读取/);
  assert.match(assets, /ZeoSeven Fonts/);
  assert.match(assets, /Font Awesome Free/);
  assert.match(assets, /远程 CDN\/Kit（仅在用户接受远程依赖时）/);
});

test('opening and status templates persist separate, reusable UI requirement ledgers', async () => {
  const opening = await readYaml('assets/templates/opening.yaml');
  const status = await readYaml('assets/templates/status-ui.yaml');
  assertRequirements(opening.opening_ui.ui_requirements, 'opening template');
  assertRequirements(status.status_ui.ui_requirements, 'status template');
  assert.equal(opening.opening_ui.ui_requirements.information.update_cadence, 'opening_only');
  assert.equal(status.status_ui.ui_requirements.carrier.agent_choice, 'message_surface');
});

test('bundled samples demonstrate separate opening/status interviews and a zero-layer decision', async () => {
  const opening = await readYaml('assets/examples/opening-ui-rp/src/opening.yaml');
  const status = await readYaml('assets/examples/opening-ui-rp/src/ui/status-ui.yaml');
  const zeroLayer = await readYaml('assets/examples/zero-layer-rp/status-ui.yaml');
  assertRequirements(opening.opening_ui.ui_requirements, 'opening sample');
  assertRequirements(status.status_ui.ui_requirements, 'status sample');
  assert.equal(opening.opening_ui.ui_requirements.carrier.agent_choice, 'message_surface');
  assert.equal(status.status_ui.ui_requirements.carrier.agent_choice, 'message_surface');
  assert.equal(zeroLayer.status_ui.ui_requirements.carrier.agent_choice, 'zero_layer');
  assert.equal(zeroLayer.status_ui.ui_requirements.information.data_scale, 'large_cross_domain');
});

test('stage boundary routes UI questions without reopening the other frontend surface', async () => {
  const boundaries = await readFile(path.join(root, 'orchestrator', 'stage-boundaries.md'), 'utf8');
  assert.match(boundaries, /ui-requirements-interview\.md/);
  assert.match(boundaries, /每轮最多询问 3–4 个/);
  assert.match(boundaries, /不要求用户发明正则触发词/);
  assert.match(boundaries, /后续状态栏\/UI阶段不得重新设计或接管该首楼应用/);
});
