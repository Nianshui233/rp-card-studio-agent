import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { validateRuntimeSources } from '../scripts/rp-card-runtime.mjs';

const root = process.cwd();

function readYaml(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8').then(YAML.parse);
}

function assertRequirements(requirements, label) {
  assert.ok(requirements, `${label} should persist ui_requirements`);
  if (requirements.interview_mode !== undefined) {
    assert.equal(requirements.interview_mode, 'create', `${label} interview mode`);
    assert.equal(requirements.retrofit_audit.complete, false, `${label} retrofit audit default`);
    assert.ok(Array.isArray(requirements.retrofit_audit.preserve), `${label} retrofit preserve`);
    assert.ok(Array.isArray(requirements.retrofit_audit.revise), `${label} retrofit revise`);
    assert.ok(Array.isArray(requirements.retrofit_audit.remove), `${label} retrofit remove`);
  }
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
  assert.match(interview, /旧卡改造专用访谈门槛/);
  assert.match(interview, /现状审查轮/);
  assert.match(interview, /目标体验轮/);
  assert.match(interview, /ui_requirements\.retrofit_audit\.complete/);
  assert.match(interview, /只能算方向预检，不能算完成 UI 访谈/);
  assert.match(interview, /空态、未知态、错误态和过期态/);
  assert.match(interview, /重型.*稀疏变量/);
  assert.match(interview, /`authoritative`/);
  assert.match(interview, /presentation_model/);
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
  assert.equal(opening.opening_ui.ui_requirements.interview_mode, 'create');
  assert.equal(status.status_ui.ui_requirements.interview_mode, 'create');
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

test('legacy UI retrofit cannot enter implementation after only the four direction questions', async () => {
  const sources = {
    positioning: [], world: [], characters: [], user_character: [], systems: [], scenes: [], prompts: [], mvu: [],
    ui: [{ relativePath: 'src/ui/status-ui.yaml', value: {
      status: 'locked',
      status_ui: {
        enabled: true,
        ui_requirements: {
          interview_status: 'locked',
          purpose: '状态查看',
          primary_journey: '总览→人物',
        },
      },
    } }],
    assembly: [{ relativePath: 'src/assembly.yaml', value: {
      status: 'locked',
      worldbook_manifest: { entries: [] },
      runtime_manifest: { mode: 'authored', regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} },
    } }],
  };
  const report = await validateRuntimeSources({
    project: { project: { operation: 'edit', target: 'character_card' }, features: { status_ui: true }, deliverables: ['rp_project_package'] },
    state: { stages: { status_ui: { status: 'complete' } } },
    sources,
    projectRoot: process.cwd(),
  });
  assert.ok(report.issues.some((candidate) => candidate.rule === 'ui.retrofit_interview'));
});
