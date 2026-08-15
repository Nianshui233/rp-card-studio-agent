import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { projectModelSource } from '../scripts/forge/projection.mjs';
import { makeProject, makeState, validateProjectModel } from '../scripts/forge/project.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceForge = path.join(skillRoot, 'scripts', 'rp-card-forge.mjs');

const sourcePaths = Object.freeze({
  positioning: 'src/positioning.yaml',
  primary: 'src/characters/card.yaml',
  npcOne: 'src/characters/lin_zhou.yaml',
  npcTwo: 'src/characters/zhou_mi.yaml',
  world: 'src/world/mist_harbor.yaml',
  system: 'src/systems/night_shift.yaml',
  scene: 'src/scenes/last_platform.yaml',
  prompt: 'src/prompts/narrative-opening.yaml',
  userCharacter: 'src/user-character.yaml',
  assembly: 'src/integration/assembly.yaml',
});

function runForge(args, { expectSuccess = false } = {}) {
  const result = spawnSync(process.execPath, [sourceForge, ...args, '--json'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  let report = null;
  try {
    report = JSON.parse(output);
  } catch {
    // Assertions include raw output when Forge does not return JSON.
  }
  if (expectSuccess && result.status !== 0) {
    assert.fail(`Forge failed with status ${result.status}:\n${output}`);
  }
  return { ...result, output, report };
}

function tempRoot(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), `rp-card-projection-${label}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeYaml(root, relativePath, value) {
  const target = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, stringifyYaml(value), 'utf8');
}

function readYaml(root, relativePath) {
  return parseYaml(readFileSync(path.join(root, ...relativePath.split('/')), 'utf8'));
}

function readBuiltCard(root) {
  return JSON.parse(readFileSync(path.join(root, 'dist', 'character-card.json'), 'utf8'));
}

test('model projections retain RP package identities and every non-empty scene semantic', () => {
  const world = projectModelSource('world', {
    schema_version: '1.0.0',
    id: 'mist_harbor',
    display_name: 'Mist Harbor',
    status: 'locked',
    premise: { summary: 'World premise' },
    source_refs: ['notes/world.md'],
    extensions: { authoring_only: true },
  });
  assert.deepEqual(world, {
    id: 'mist_harbor',
    display_name: 'Mist Harbor',
    premise: { summary: 'World premise' },
  });

  const character = projectModelSource('character', {
    schema_version: '1.0.0',
    id: 'shen_huai',
    display_name: 'Shen Huai',
    status: 'locked',
    role: 'primary_character',
    relationships: [{ target_ref: 'character:lin_zhou' }],
    tags: ['authoring-only'],
  });
  assert.deepEqual(character, {
    id: 'shen_huai',
    display_name: 'Shen Huai',
    role: 'primary_character',
    relationships: [{ target_ref: 'character:lin_zhou' }],
  });

  const system = projectModelSource('system', {
    schema_version: '1.0.0',
    id: 'night_shift',
    display_name: 'Night Shift',
    status: 'locked',
    purpose: 'Resolve the night patrol loop.',
    axes: [{ id: 'tide', display_name: 'Tide' }],
    source_refs: [],
  });
  assert.deepEqual(system, {
    id: 'night_shift',
    display_name: 'Night Shift',
    purpose: 'Resolve the night patrol loop.',
    axes: [{ id: 'tide', display_name: 'Tide' }],
  });

  const scene = projectModelSource('scene', {
    schema_version: '1.0.0',
    id: 'last_platform',
    display_name: 'Last Platform',
    status: 'locked',
    purpose: 'Default arrival scene.',
    context: { world_ref: 'world:mist_harbor' },
    entrances: [{ id: 'street_gate', from_ref: 'location:street', access: 'open' }],
    exits: [{ id: 'service_tunnel', to_ref: 'scene:tunnel', condition: 'Gate unlocked', fallback: 'Remain here' }],
    zones: [{ id: 'ticket_office', display_name: 'Ticket Office', description: 'A sealed booth.', connections: [] }],
    surface_layer: { first_impression: 'The platform is empty.' },
    gm_only: { truth: 'The broadcast comes from the tunnel.' },
    risks: [{ id: 'memory_loss', trigger: 'Answer the broadcast', consequence: 'Lose a name', escape: 'Hang up' }],
    clues: [{ id: 'wet_ticket', discovery: 'Inspect the booth', surface_information: 'A fresh ticket', gm_meaning: 'Someone passed through', leads_to: ['scene:tunnel'] }],
    events: [{ id: 'bell', trigger: 'Midnight', result: 'The bell rings', writes: [] }],
    state_bindings: [{ source_path: 'world.tide', access: 'read', purpose: 'Gate tunnel access' }],
    media_slots: [{
      id: 'platform_ambience',
      kind_hint: 'audio',
      purpose: 'Establish the empty platform without carrying unique evidence.',
      trigger: 'First arrival at the platform.',
      required: false,
      text_fallback: 'A distant rail hum passes under the locked booth.',
    }],
    source_refs: ['notes/scene.md'],
    extensions: { authoring_only: true },
  });
  assert.deepEqual(scene, {
    id: 'last_platform',
    display_name: 'Last Platform',
    purpose: 'Default arrival scene.',
    context: { world_ref: 'world:mist_harbor' },
    entrances: [{ id: 'street_gate', from_ref: 'location:street', access: 'open' }],
    exits: [{ id: 'service_tunnel', to_ref: 'scene:tunnel', condition: 'Gate unlocked', fallback: 'Remain here' }],
    zones: [{ id: 'ticket_office', display_name: 'Ticket Office', description: 'A sealed booth.' }],
    surface_layer: { first_impression: 'The platform is empty.' },
    gm_only: { truth: 'The broadcast comes from the tunnel.' },
    risks: [{ id: 'memory_loss', trigger: 'Answer the broadcast', consequence: 'Lose a name', escape: 'Hang up' }],
    clues: [{ id: 'wet_ticket', discovery: 'Inspect the booth', surface_information: 'A fresh ticket', gm_meaning: 'Someone passed through', leads_to: ['scene:tunnel'] }],
    events: [{ id: 'bell', trigger: 'Midnight', result: 'The bell rings' }],
    state_bindings: [{ source_path: 'world.tide', access: 'read', purpose: 'Gate tunnel access' }],
    media_slots: [{
      id: 'platform_ambience',
      kind_hint: 'audio',
      purpose: 'Establish the empty platform without carrying unique evidence.',
      trigger: 'First arrival at the platform.',
      required: false,
      text_fallback: 'A distant rail hum passes under the locked booth.',
    }],
  });

  const migratedScene = projectModelSource('scene', {
    id: 'legacy_scene',
    display_name: 'Legacy Scene',
    extensions: {
      media_slots: [{
        id: 'legacy_tone',
        kind_hint: 'audio',
        purpose: 'Preserve a legacy authored presentation contract.',
        trigger: 'Enter the scene.',
        required: false,
        text_fallback: 'The ventilation hum changes pitch.',
      }],
    },
  });
  assert.deepEqual(migratedScene.media_slots, [{
    id: 'legacy_tone',
    kind_hint: 'audio',
    purpose: 'Preserve a legacy authored presentation contract.',
    trigger: 'Enter the scene.',
    required: false,
    text_fallback: 'The ventilation hum changes pitch.',
  }]);
});

test('new RP package initialization creates no placeholder character source', t => {
  const root = tempRoot(t, 'empty-character-inventory');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });

  const project = readYaml(root, 'project.yaml');
  assert.deepEqual(project.source_manifest.characters, []);
  assert.equal(existsSync(path.join(root, 'src', 'characters', 'card.yaml')), false);
  assert.deepEqual(project.source_manifest.positioning, [sourcePaths.positioning]);
});

test('state operation transactionally refreshes the current work run', t => {
  const root = tempRoot(t, 'operation-refresh');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const statePath = path.join(root, '.rp-card-state.json');
  const initialState = JSON.parse(readFileSync(statePath, 'utf8'));

  runForge(['state', root, 'operation', 'continue', '--dry-run'], { expectSuccess: true });
  assert.equal(readYaml(root, 'project.yaml').project.operation, 'create');
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).revision, initialState.revision);

  runForge(['state', root, 'operation', 'continue'], { expectSuccess: true });
  assert.equal(readYaml(root, 'project.yaml').project.operation, 'continue');
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).revision, initialState.revision + 1);

  const forbidden = runForge(['state', root, 'operation', 'create']);
  assert.notEqual(forbidden.status, 0);
  assert.match(forbidden.output, /create.*init|init.*create/);
});

test('MVU lifecycle distinguishes a genuine create run from a resumed run', () => {
  const project = makeProject({ name: '生命周期测试', nsfw: false });
  const state = makeState(project);
  project.features.mvu = true;
  project.source_manifest.mvu = ['src/mvu/existing.yaml'];
  state.stages.mvu_ejs.status = 'skipped';
  state.stages.mvu_ejs.summary = '续作本轮不修改，保留既有 MVU 实现';

  const createRun = validateProjectModel(project, state, process.cwd());
  assert.ok(createRun.issues.some(issue => issue.rule === 'lifecycle' && issue.path === '/features'));
  assert.ok(createRun.issues.some(issue => issue.rule === 'lifecycle' && issue.path === '/source_manifest/mvu'));

  project.project.operation = 'continue';
  const resumedRun = validateProjectModel(project, state, process.cwd());
  assert.deepEqual(resumedRun.issues, []);
});

test('NSFW-enabled initialization adds the status template without inventing a character', t => {
  const root = tempRoot(t, 'nsfw-empty-character-inventory');
  runForge(['init', root, '--nsfw', 'enabled', '--type', 'character'], { expectSuccess: true });

  const project = readYaml(root, 'project.yaml');
  assert.deepEqual(project.source_manifest.characters, []);
  assert.deepEqual(project.source_manifest.ui, ['src/ui/status-ui.yaml']);
  assert.equal(existsSync(path.join(root, 'src', 'characters', 'card.yaml')), false);
  assert.equal(existsSync(path.join(root, 'src', 'ui', 'status-ui.yaml')), true);
});

function characterSource({ id, displayName, role, marker, aliases = [] }) {
  return {
    schema_version: '1.0.0',
    id,
    display_name: displayName,
    status: 'locked',
    role,
    identity: {
      aliases,
      age: 29,
      species: '人类',
      occupation: `${marker}-职业`,
      appearance: [`${marker}-外貌`],
    },
    narrative_function: {
      purpose: `${marker}-叙事功能`,
      narrative_pressure: `${marker}-叙事压力`,
    },
    goals: {
      immediate: [`${marker}-即时目标`],
      long_term: [`${marker}-长期目标`],
      hidden: [`${marker}-隐藏目标`],
    },
    psychology: {
      needs: [`${marker}-需求`],
      fears: [`${marker}-恐惧`],
      weaknesses: [`${marker}-弱点`],
      biases: [`${marker}-偏见`],
      self_deceptions: [`${marker}-自我欺骗`],
    },
    value_priority: [{ id: `${id}_value`, value: `${marker}-价值`, rank: 1 }],
    internal_conflicts: [`${marker}-内在冲突`],
    boundaries: [`${marker}-边界`],
    behavioral_rules: [{
      id: `${id}_rule`,
      when: `${marker}-触发条件`,
      assessment: `${marker}-判断`,
      response: `${marker}-反应`,
      never: [`${marker}-禁止行为`],
      visibility: 'model',
    }],
    stress_ladder: [{
      id: `${id}_stress`,
      rank: 1,
      behavior: `${marker}-压力表现`,
      escalation_triggers: [`${marker}-升级触发`],
      deescalation: `${marker}-降压方式`,
    }],
    ooc_guardrails: [`${marker}-防出戏规则`],
    speech: {
      register: `${marker}-语域`,
      rhythm: `${marker}-节奏`,
      address: `${marker}-称呼`,
      habits: [`${marker}-口头习惯`],
      avoid: [`${marker}-禁用表达`],
    },
    relationships: [],
    knowledge: {
      publicly_known: [`${marker}-公开知识`],
      gm_only: [`${marker}-幕后知识`],
      model_only: [`${marker}-模型知识`],
      mistaken: [`${marker}-错误认知`],
      forbidden: [`${marker}-禁知`],
    },
    state_bindings: [],
    examples: [{
      context: `${marker}-示例语境`,
      line: `${marker}-角色台词`,
      demonstrates: `${marker}-示范目标`,
    }],
    tags: [`${marker}-标签`],
    source_refs: [],
    nsfw: { note: `${marker}-成人边界占位` },
  };
}

function minimalCharacterSource({ id, displayName, role = 'npc' }) {
  return {
    schema_version: '1.0.0',
    id,
    display_name: displayName,
    status: 'locked',
    role,
    identity: { aliases: [], age: null, species: '', occupation: '', appearance: [] },
    narrative_function: { purpose: '', narrative_pressure: '' },
    goals: { immediate: [], long_term: [], hidden: [] },
    psychology: { needs: [], fears: [], weaknesses: [], biases: [], self_deceptions: [] },
    value_priority: [],
    internal_conflicts: [],
    boundaries: [],
    behavioral_rules: [],
    stress_ladder: [],
    ooc_guardrails: [],
    speech: { register: '', rhythm: '', habits: [], avoid: [] },
    relationships: [],
    knowledge: { publicly_known: [], gm_only: [], model_only: [], mistaken: [], forbidden: [] },
    state_bindings: [],
    examples: [],
    tags: [],
    source_refs: [],
  };
}

function richSources() {
  return {
    positioning: {
      schema_version: '1.0.0',
      id: 'project_positioning',
      status: 'locked',
      card_entry: '整卡入口唯一标记：雾港夜班以受规则约束的调查、关系变化与长期后果为核心。角色、地点与规则由绑定世界书按当前上下文装载。',
      premise: '会吞掉错误记忆的海雾正在改变雾港夜班秩序。',
      target_users: ['偏好主动调查的用户'],
      card_mode: 'world_scenario_with_anchor_character',
      experience_pillars: [{ id: 'investigation', priority: 1, description: '通过证据推进调查。' }],
      tone: { primary: '悬疑', secondary: '克制' },
      expected_span: 'medium_form',
      scope_notes: ['本入口不承载任何角色档案。'],
      source_refs: [],
    },
    primary: characterSource({
      id: 'shen_huai',
      displayName: '沈槐',
      role: 'primary_character',
      marker: '主角唯一标记',
      aliases: ['阿槐'],
    }),
    npcOne: characterSource({
      id: 'lin_zhou',
      displayName: '林舟',
      role: 'npc',
      marker: '林舟唯一标记',
      aliases: ['小舟'],
    }),
    npcTwo: characterSource({
      id: 'zhou_mi',
      displayName: '周弥',
      role: 'antagonist',
      marker: '周弥唯一标记',
      aliases: ['老周'],
    }),
    world: {
      schema_version: '1.0.0',
      id: 'mist_harbor',
      display_name: '雾港世界',
      status: 'locked',
      premise: {
        summary: '世界唯一标记：海雾会吞掉错误的记忆。',
        scale: 'local',
        time_scope: '连续七夜',
        space_scope: '雾港市',
        public_reality: '港口仍在正常营业。',
      },
      fundamental_rules: [{
        id: 'name_taboo',
        statement: '潮钟响起后不能直呼失踪者姓名。',
        scope: '雾港夜间公共区域',
        exceptions: [],
        consequences: ['海雾会记录呼名者。'],
        visibility: 'model',
      }],
      society: { norms: [], institutions: [], factions: [] },
      geography: { locations: [] },
      history: { events: [] },
      knowledge: { publicly_known: [], conditional: [], gm_only: [], model_only: [] },
      continuity: { invariants: ['海雾不进入亮灯的值班室。'], open_questions: [] },
      hooks: ['寻找上一任夜班员。'],
      source_refs: [],
    },
    system: {
      schema_version: '1.0.0',
      id: 'night_shift',
      display_name: '夜班规则',
      status: 'locked',
      purpose: '系统唯一标记：约束每夜巡检流程。',
      axes: [],
      rules: [],
      state_machines: [],
      settlement_order: ['先结算巡检，再推进潮钟。'],
      invariants: ['不能跳过已经触发的警报。'],
      failure_modes: [],
      source_refs: [],
    },
    scene: {
      schema_version: '1.0.0',
      id: 'last_platform',
      display_name: '末班站台',
      status: 'locked',
      purpose: '场景唯一标记：默认开场发生地。',
      context: {
        world_ref: 'world:mist_harbor',
        time_window: '午夜前十分钟',
        location_ref: 'location:last_platform',
      },
      entrances: [],
      exits: [],
      zones: [],
      surface_layer: {
        first_impression: '空站台上只有一盏绿灯。',
        sensory_cues: ['咸湿铁锈味'],
        affordances: ['检查值班簿'],
      },
      gm_only: { truth: '广播来自封闭隧道。', hidden_events: [], concealed_connections: [] },
      risks: [],
      clues: [],
      events: [],
      state_bindings: [],
      media_slots: [{
        id: 'last_platform_ambience',
        kind_hint: 'audio',
        purpose: '场景媒体唯一标记：强化空站台压迫感，不承载线索。',
        trigger: '首次进入末班站台。',
        required: false,
        text_fallback: '轨道下方传来一阵低沉的钢轮余响。',
      }],
      source_refs: [],
    },
    prompt: {
      schema_version: '1.0.0',
      status: 'locked',
      narrative: {
        point_of_view: 'second_person_limited',
        tense: 'present',
        pacing: '叙事唯一标记：缓慢累积压力。',
        prose_density: 'medium',
        dialogue_ratio: 'balanced',
        sensory_focus: ['声音', '触感'],
        information_policy: { reveal: ['现场可感知事实'], withhold: ['幕后真相'] },
      },
      openings: [
        {
          id: 'night_arrival',
          display_name: '夜班报到',
          is_default: true,
          scene_ref: 'scene:last_platform',
          present_character_refs: ['character:shen_huai', 'character:lin_zhou'],
          visible_text: '默认开场唯一文本',
          immediate_change: '潮钟开始倒计时。',
          hook: '值班簿上出现了一个已被注销十年的名字。',
          initial_state_ref: null,
          established_facts: ['夜班员名册正在被未知力量改写。'],
        },
        {
          id: 'tunnel_call',
          display_name: '隧道来电',
          is_default: false,
          scene_ref: 'scene:last_platform',
          present_character_refs: ['character:shen_huai', 'character:zhou_mi'],
          visible_text: '备选开场唯一文本',
          immediate_change: '封闭隧道的电话响起。',
          hook: '听筒里传来上一任夜班员的声音。',
          initial_state_ref: null,
          established_facts: ['隧道已封闭十年。'],
        },
      ],
      dialogue_examples: [{
        character_ref: 'character:shen_huai',
        context: '林舟想跳过巡检。',
        line: '对白示例唯一标记：灯可以晚开，名字不能晚记。',
        demonstrates: '克制而明确的警告。',
      }],
      source_refs: [],
    },
  };
}

function configureRichProject(root, { assembly = null } = {}) {
  const sources = richSources();
  for (const [key, relativePath] of Object.entries(sourcePaths)) {
    if (key === 'assembly' || key === 'userCharacter') continue;
    writeYaml(root, relativePath, sources[key]);
  }

  const project = readYaml(root, 'project.yaml');
  project.features.systems = true;
  project.features.scenes = true;
  project.project.display_name = '雾港夜班';
  project.source_manifest.characters = [sourcePaths.primary, sourcePaths.npcOne, sourcePaths.npcTwo];
  project.source_manifest.world = [sourcePaths.world];
  project.source_manifest.systems = [sourcePaths.system];
  project.source_manifest.scenes = [sourcePaths.scene];
  project.source_manifest.prompts = [sourcePaths.prompt];
  project.source_manifest.assembly = assembly ? [sourcePaths.assembly] : [];
  writeYaml(root, 'project.yaml', project);
  if (assembly) writeYaml(root, sourcePaths.assembly, assembly);
  return sources;
}

function manifestEntry({ id, displayName, sourceRef, selector = null, mode, keys, position, order, scanDepth, ignoreBudget = false }) {
  return {
    id,
    display_name: displayName,
    source: {
      kind: 'registered_source',
      source_ref: sourceRef,
      ...(selector ? { selector } : {}),
    },
    enabled: true,
    activation: {
      mode,
      primary_keys: keys,
      secondary_keys: [],
      selective: false,
      logic: 'any',
      case_sensitive: false,
      match_whole_words: false,
    },
    insertion: { position, order, depth: null, role: 'system' },
    probability: 100,
    scan_depth: scanDepth,
    recursion: {
      prevent_incoming: true,
      prevent_outgoing: true,
      delay_until_recursion: false,
    },
    recipient: 'shared',
    visibility: 'model',
    ignore_budget: ignoreBudget,
    token_budget: null,
    fallback: 'block',
  };
}

function completeAssembly() {
  const records = [
    ['positioning', '项目定位：雾港夜班', sourcePaths.positioning, null, 'constant', [], 'after_char', 50, null, false],
    ['world', '世界设定：雾港世界', sourcePaths.world, null, 'constant', [], 'before_char', 100, null, false],
    ['primary', '人物档案：沈槐', sourcePaths.primary, null, 'constant', [], 'after_char', 300, null, true],
    ['npc_one', '人物档案：林舟', sourcePaths.npcOne, null, 'keywords', ['林舟', '小舟'], 'before_char', 310, 4],
    ['npc_two', '人物档案：周弥', sourcePaths.npcTwo, null, 'keywords', ['周弥', '老周'], 'before_char', 320, 4],
    ['system', '系统规则：夜班规则', sourcePaths.system, null, 'constant', [], 'after_char', 500, null],
    ['scene', '场景资料：末班站台', sourcePaths.scene, null, 'keywords', ['末班站台'], 'before_char', 400, 4],
    ['prompt_narrative', '叙事规则：夜班叙事', sourcePaths.prompt, '/narrative', 'constant', [], 'after_char', 600, null],
    ['prompt_examples', '对话示例：沈槐的回应方式', sourcePaths.prompt, '/dialogue_examples', 'constant', [], 'after_example', 610, null],
  ];
  return {
    schema_version: '1.0.0',
    status: 'locked',
    card_entry: {
      mode: 'core_world_contract',
      content: '雾港夜班核心入口合同：海雾、潮钟与被吞没的记忆共同约束这座港城。公开信息、调查所得与幕后秘密必须分层；世界、人物与夜班秩序在视角之外继续运行。',
      source_refs: ['world:mist_harbor'],
    },
    worldbook_manifest: {
      id: 'mist_harbor_book',
      display_name: '雾港夜班世界书',
      description: '完整装配测试。',
      preserve_imported_entries: true,
      duplicate_policy: 'error',
      entries: records.map(([id, displayName, sourceRef, selector, mode, keys, position, order, scanDepth, ignoreBudget]) => (
        manifestEntry({ id, displayName, sourceRef, selector, mode, keys, position, order, scanDepth, ignoreBudget })
      )),
    },
    media_manifest: { enabled: false, assets: [] },
  };
}

function assertOwn(object, key, message) {
  assert.ok(Object.hasOwn(object, key), message ?? `missing own property ${key}`);
}

function assertCompleteAutomaticSchedule(entry) {
  assert.match(entry.comment, /[\u3400-\u9fff]/u, `entry name is not Chinese-facing: ${entry.comment}`);
  for (const key of [
    'keys', 'secondary_keys', 'constant', 'selective', 'insertion_order', 'enabled', 'position',
    'useProbability', 'probability', 'excludeRecursion', 'preventRecursion',
    'delayUntilRecursion', 'depth', 'role', 'selectiveLogic', 'caseSensitive', 'matchWholeWords',
  ]) {
    assertOwn(entry, key, `${entry.comment} missing SillyTavern host field ${key}`);
  }
  assert.ok(Array.isArray(entry.keys));
  assert.ok(Array.isArray(entry.secondary_keys));
  assert.equal(entry.enabled, true);
  assert.equal(entry.useProbability, true);
  assert.equal(typeof entry.insertion_order, 'number');
  assert.equal(typeof entry.probability, 'number');

  const host = entry.extensions;
  for (const key of [
    'position', 'useProbability', 'probability', 'exclude_recursion', 'prevent_recursion',
    'delay_until_recursion', 'depth', 'role', 'selectiveLogic', 'case_sensitive',
    'match_whole_words', 'scan_depth',
  ]) {
    assertOwn(host, key, `${entry.comment} missing extension host field ${key}`);
  }

  const schedule = host.rp_card_studio;
  assert.equal(schedule.generated, true);
  assert.equal(schedule.kind, 'character_book_source');
  assert.deepEqual(Object.keys(schedule.activation).sort(), [
    'case_sensitive', 'logic', 'match_whole_words', 'mode', 'primary_keys', 'secondary_keys', 'selective',
  ]);
  assert.deepEqual(Object.keys(schedule.insertion).sort(), ['depth', 'order', 'position', 'role']);
  assertOwn(schedule, 'probability');
  assertOwn(schedule, 'scan_depth');
  assert.deepEqual(Object.keys(schedule.recursion).sort(), [
    'delay_until_recursion', 'prevent_incoming', 'prevent_outgoing',
  ]);
  if (schedule.activation.mode === 'constant') {
    assert.equal(entry.constant, true);
  } else {
    assert.equal(schedule.activation.mode, 'keywords');
    assert.equal(entry.constant, false);
    assert.ok(schedule.activation.primary_keys.length > 0, `${entry.comment} has no trigger keywords`);
  }
}

test('NSFW character mixin exposes the restored authoring fields without a runtime gate', () => {
  const mixin = parseYaml(readFileSync(path.join(skillRoot, 'assets', 'templates', 'nsfw', 'character.mixin.yaml'), 'utf8'));
  assert.deepEqual(Object.keys(mixin.nsfw), [
    'sexual_orientation',
    'standing',
    'fetish',
    'preference',
    'sex_organs',
    'sensitive_areas',
    'contrast',
  ]);
  assert.match(mixin.nsfw.sex_organs, /一线天/);
  assert.match(mixin.nsfw.sex_organs, /12cm/);
  assert.equal(Object.hasOwn(mixin.nsfw, 'enabled'), false);
  assert.equal(Object.hasOwn(mixin.nsfw, 'gate'), false);
});

test('new character cards use a card-level entry on-card and project every character into scheduled Chinese CharacterBook entries', t => {
  const root = tempRoot(t, 'new-card');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  configureRichProject(root);

  runForge(['build', root], { expectSuccess: true });
  const card = readBuiltCard(root);
  const data = card.data;

  assert.equal(data.name, '雾港夜班');
  for (const field of ['personality', 'scenario', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions']) {
    assert.equal(data[field], '', `new card unexpectedly populated data.${field}`);
  }
  assert.equal(data.first_mes, '默认开场唯一文本');
  assert.deepEqual(data.alternate_greetings, ['备选开场唯一文本']);

  assert.match(data.description, /整卡入口唯一标记/);
  for (const forbidden of [
    '主角唯一标记',
    '林舟唯一标记',
    '周弥唯一标记',
    '世界唯一标记',
    '系统唯一标记',
    '场景唯一标记',
    '叙事唯一标记',
    '对白示例唯一标记',
    '默认开场唯一文本',
  ]) {
    assert.doesNotMatch(data.description, new RegExp(forbidden), `module source leaked into card entry: ${forbidden}`);
  }

  const entries = data.character_book.entries;
  assert.equal(entries.length, 8);
  assert.deepEqual(entries.map(entry => entry.comment), [
    '项目定位：雾港夜班',
    '世界设定：雾港世界',
    '人物档案：沈槐',
    '人物档案：林舟',
    '人物档案：周弥',
    '系统规则：夜班规则',
    '场景资料：末班站台',
    '叙事规则：夜班报到',
  ]);
  assert.equal(entries.filter(entry => entry.comment.startsWith('人物档案：')).length, 3);

  const expectedContent = new Map([
    ['项目定位：雾港夜班', '海雾正在改变雾港夜班秩序'],
    ['世界设定：雾港世界', '世界唯一标记'],
    ['人物档案：沈槐', '主角唯一标记'],
    ['人物档案：林舟', '林舟唯一标记'],
    ['人物档案：周弥', '周弥唯一标记'],
    ['系统规则：夜班规则', '系统唯一标记'],
    ['场景资料：末班站台', '场景唯一标记'],
    ['叙事规则：夜班报到', '叙事唯一标记'],
  ]);
  for (const entry of entries) {
    assert.match(entry.content, new RegExp(expectedContent.get(entry.comment)), `${entry.comment} contains the wrong source`);
    assert.doesNotMatch(entry.content, /^\s*\{/, `${entry.comment} was serialized as JSON instead of YAML`);
    assertCompleteAutomaticSchedule(entry);
  }
  const promptEntry = entries.find(entry => entry.comment === '叙事规则：夜班报到');
  assert.match(promptEntry.content, /对白示例唯一标记/);
  const positioningEntry = entries.find(entry => entry.comment === '项目定位：雾港夜班');
  assert.doesNotMatch(positioningEntry.content, /整卡入口唯一标记/);
  assert.doesNotMatch(positioningEntry.content, /card_mode/);
  assert.doesNotMatch(positioningEntry.content, /夜班员/);
  const primaryEntry = entries.find(entry => entry.comment === '人物档案：沈槐');
  assert.equal(primaryEntry.constant, false);
  assert.deepEqual(primaryEntry.keys, ['沈槐', '阿槐']);
  assert.equal(primaryEntry.position, 'before_char');
  assert.equal(primaryEntry.extensions.ignore_budget, false);
  assert.equal(data.extensions.world, data.character_book.name);
  const buildManifest = JSON.parse(readFileSync(path.join(root, 'reports', 'build-manifest.json'), 'utf8'));
  assert.equal(buildManifest.source, sourcePaths.positioning);
});

test('assembly card_fields can intentionally populate advanced-definition host slots', t => {
  const root = tempRoot(t, 'explicit-advanced-card-fields');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  assembly.card_fields = {
    personality: '始终保持克制而敏锐。',
    scenario: '雾港夜班期间的持续场景合同。',
    mes_example: '<START>\n{{char}}: 潮钟刚响。',
    creator_notes: '个人自用构建备注。',
    system_prompt: '保持项目既有叙事协议。',
    post_history_instructions: '优先维护已锁定的连续性。',
  };
  configureRichProject(root, { assembly });
  runForge(['build', root], { expectSuccess: true });
  const data = readBuiltCard(root).data;
  assert.equal(data.description, assembly.card_entry.content);
  for (const [field, value] of Object.entries(assembly.card_fields)) assert.equal(data[field], value);
});

test('a locked world-package assembly requires a final core card entry', t => {
  const root = tempRoot(t, 'required-final-card-entry');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  delete assembly.card_entry;
  configureRichProject(root, { assembly });

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /assembly\.card_entry/);
});

test('a true single-character card uses the sole primary character name', t => {
  const root = tempRoot(t, 'single-character-name');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const sources = richSources();
  sources.positioning.card_mode = 'single_character_card';
  writeYaml(root, sourcePaths.positioning, sources.positioning);
  writeYaml(root, sourcePaths.primary, sources.primary);

  const project = readYaml(root, 'project.yaml');
  project.project.display_name = '并非最终卡名的项目标题';
  project.source_manifest.characters = [sourcePaths.primary];
  writeYaml(root, 'project.yaml', project);

  runForge(['build', root], { expectSuccess: true });
  const card = readBuiltCard(root);
  assert.equal(card.data.name, '沈槐');
  const characterEntry = card.data.character_book.entries.find(entry => entry.comment === '人物档案：沈槐');
  assert.equal(characterEntry.constant, true);
  assert.deepEqual(characterEntry.keys, []);
  assert.equal(characterEntry.position, 'after_char');
  assert.equal(characterEntry.extensions.ignore_budget, true);
});

test('a world-shaped RP package can have no fixed character and still uses its project title', t => {
  const root = tempRoot(t, 'world-package-name');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const sources = richSources();
  sources.positioning.card_mode = 'world_package';
  writeYaml(root, sourcePaths.positioning, sources.positioning);
  writeYaml(root, sourcePaths.world, sources.world);

  const project = readYaml(root, 'project.yaml');
  project.project.display_name = '雾港夜班';
  project.source_manifest.characters = [];
  project.source_manifest.world = [sourcePaths.world];
  project.source_manifest.systems = [];
  project.source_manifest.scenes = [];
  project.source_manifest.prompts = [];
  project.source_manifest.assembly = [];
  writeYaml(root, 'project.yaml', project);
  runForge([
    'state', root, 'lock', 'integration.delivery_format', 'character_card_v3_json',
    '--source', 'delegated',
    '--rationale', '卡版本属于项目交付合同，不属于任何角色。',
  ], { expectSuccess: true });

  runForge(['build', root], { expectSuccess: true });
  const card = readBuiltCard(root);
  assert.equal(card.spec, 'chara_card_v3');
  assert.equal(card.spec_version, '3.0');
  assert.equal(card.data.name, '雾港夜班');
  assert.equal(card.data.description, sources.positioning.card_entry);
  assert.ok(card.data.character_book.entries.some(entry => entry.comment === '项目定位：雾港夜班'));
  assert.equal(card.data.character_book.entries.some(entry => entry.comment.startsWith('人物档案：')), false);
});

test('optional user-character source becomes a disabled Chinese CharacterBook template', t => {
  const root = tempRoot(t, 'user-character-template');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const sources = richSources();
  sources.positioning.card_mode = 'world_package';
  writeYaml(root, sourcePaths.positioning, sources.positioning);
  writeYaml(root, sourcePaths.world, sources.world);
  const template = parseYaml(readFileSync(path.join(skillRoot, 'assets', 'templates', 'user-character.yaml'), 'utf8'));
  template.status = 'locked';
  template.profile.name = '林默';
  writeYaml(root, sourcePaths.userCharacter, template);

  const project = readYaml(root, 'project.yaml');
  project.project.display_name = '雾港夜班';
  project.source_manifest.world = [sourcePaths.world];
  project.source_manifest.user_character = [sourcePaths.userCharacter];
  writeYaml(root, 'project.yaml', project);

  runForge(['build', root], { expectSuccess: true });
  const entry = readBuiltCard(root).data.character_book.entries.find(candidate => candidate.comment === '用户角色模板：用户角色定义模板');
  assert.ok(entry);
  assert.equal(entry.enabled, false);
  assert.equal(entry.constant, true);
  assert.deepEqual(entry.keys, ['<user>', 'user']);
  assert.equal(entry.position, 'after_char');
  assert.equal(entry.depth, 4);
  assert.equal(entry.insertion_order, 9995);
  assert.equal(entry.probability, 100);
  assert.match(entry.content, /林默/);
  assert.doesNotMatch(entry.content, /enabled_by_default|insertion_order|9995/);
});
test('locked positioning requires a non-empty RP package entry', t => {
  const root = tempRoot(t, 'required-card-entry');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const positioning = richSources().positioning;
  positioning.card_entry = '   \t';
  writeYaml(root, sourcePaths.positioning, positioning);

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /card_entry/);
  assert.match(result.output, /pattern/);
});

test('positioning rejects unknown card modes instead of guessing their naming semantics', t => {
  const root = tempRoot(t, 'unknown-card-mode');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const positioning = richSources().positioning;
  positioning.card_mode = 'single_charcter_card';
  writeYaml(root, sourcePaths.positioning, positioning);

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /card_mode/);
  assert.match(result.output, /enum/);
});

test('locked positioning cannot retain the pending card mode', t => {
  const root = tempRoot(t, 'pending-card-mode');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const positioning = richSources().positioning;
  positioning.card_mode = 'pending';
  writeYaml(root, sourcePaths.positioning, positioning);

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /card_mode/);
  assert.match(result.output, /not/);
});

test('locking the positioning project title synchronizes project metadata and completed positioning validates it', t => {
  const root = tempRoot(t, 'project-title-lock');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const positioning = richSources().positioning;
  positioning.card_mode = 'world_package';
  writeYaml(root, sourcePaths.positioning, positioning);

  runForge([
    'state', root, 'lock', 'positioning.project_title', '雾港夜班',
    '--source', 'user',
  ], { expectSuccess: true });
  runForge([
    'state', root, 'stage', 'positioning', 'complete',
    '--summary', '项目标题、入口与承载模式已锁定',
  ], { expectSuccess: true });

  const project = readYaml(root, 'project.yaml');
  assert.equal(project.project.display_name, '雾港夜班');
  assert.equal(project.decisions.find(decision => decision.id === 'positioning.project_title')?.value, '雾港夜班');
  runForge(['validate', root], { expectSuccess: true });

  project.project.display_name = '被误改的标题';
  writeYaml(root, 'project.yaml', project);
  const mismatch = runForge(['validate', root, '--force']);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.output, /positioning\.project_title/);
  assert.match(mismatch.output, /display_name/);
});

test('conflicting active project-title locks cannot complete positioning', t => {
  const root = tempRoot(t, 'project-title-conflict');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const positioning = richSources().positioning;
  positioning.card_mode = 'world_package';
  writeYaml(root, sourcePaths.positioning, positioning);

  runForge([
    'state', root, 'lock', 'positioning.card_title', '旧项目标题',
    '--source', 'user',
  ], { expectSuccess: true });
  const conflict = runForge([
    'state', root, 'lock', 'positioning.project_title', '雾港夜班',
    '--source', 'user',
  ]);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.output, /positioning\.project_title_conflict/);
  assert.match(conflict.output, /positioning\.card_title/);

  runForge([
    'state', root, 'lock', 'positioning.project_title', '旧项目标题',
    '--source', 'user',
  ], { expectSuccess: true });
  runForge([
    'state', root, 'stage', 'positioning', 'complete',
    '--summary', '同值兼容标题锁可安全收敛到唯一项目标题',
  ], { expectSuccess: true });
  runForge(['validate', root], { expectSuccess: true });
});

test('a locked authored character cannot retain the imported pending role', t => {
  const root = tempRoot(t, 'locked-pending-character');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const sources = richSources();
  sources.positioning.card_mode = 'world_package';
  sources.primary.role = 'pending';
  writeYaml(root, sourcePaths.positioning, sources.positioning);
  writeYaml(root, sourcePaths.primary, sources.primary);

  const project = readYaml(root, 'project.yaml');
  project.source_manifest.characters = [sourcePaths.primary];
  writeYaml(root, 'project.yaml', project);

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /role/);
  assert.match(result.output, /pending/);
});

test('unpack and rebuild preserve imported advanced-definition fields byte-for-byte', t => {
  const root = tempRoot(t, 'imported-card');
  const input = path.join(root, 'legacy-card.json');
  const project = path.join(root, 'project');
  const advanced = {
    personality: '旧卡人格定义\n  保留前导空格',
    scenario: '旧卡场景定义\n第二行',
    mes_example: '<START>\n{{char}}: 旧卡示例对话',
    creator_notes: '旧卡作者备注',
    system_prompt: '旧卡系统提示，不得改写。',
    post_history_instructions: '旧卡历史后指令，不得改写。',
  };
  const card = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: '旧卡保真测试',
      description: '旧卡角色描述',
      ...advanced,
      first_mes: '旧卡默认开场',
      alternate_greetings: ['旧卡备选开场甲', '旧卡备选开场乙'],
      tags: ['导入测试'],
      creator: '原作者',
      character_version: '7.3',
      extensions: { user_extension: { retained: true } },
    },
  };
  writeFileSync(input, `${JSON.stringify(card, null, 2)}\n`, 'utf8');

  runForge(['unpack', input, '--output', project, '--nsfw', 'disabled'], { expectSuccess: true });
  const unpackedProject = readYaml(project, 'project.yaml');
  assert.deepEqual(unpackedProject.source_manifest.characters, [], 'an imported card name does not prove a fixed authored character exists');
  assert.equal(existsSync(path.join(project, sourcePaths.primary)), false);
  assert.deepEqual(JSON.parse(readFileSync(path.join(project, 'src', 'import', 'original.json'), 'utf8')), card);
  runForge(['build', project], { expectSuccess: true });
  const rebuilt = readBuiltCard(project);

  assert.equal(rebuilt.data.name, card.data.name);
  assert.equal(rebuilt.data.description, card.data.description);
  for (const [field, expected] of Object.entries(advanced)) {
    assert.equal(rebuilt.data[field], expected, `imported data.${field} changed during rebuild`);
  }
  assert.equal(rebuilt.data.first_mes, card.data.first_mes);
  assert.deepEqual(rebuilt.data.alternate_greetings, card.data.alternate_greetings);
});

test('locked project positioning takes ownership after imported projects are repositioned', t => {
  for (const operation of ['convert', 'continue', 'edit']) {
    const root = tempRoot(t, `repositioned-${operation}`);
    const input = path.join(root, 'legacy-card.json');
    const projectRoot = path.join(root, 'project');
    const advancedFields = [
      'personality',
      'scenario',
      'mes_example',
      'creator_notes',
      'system_prompt',
      'post_history_instructions',
    ];
    const card = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: `${operation} 旧人物名`,
        description: `${operation} 旧人物描述`,
        personality: '旧人格定义',
        scenario: '旧人物场景',
        first_mes: '仍可使用的原始开场',
        mes_example: '旧高级示例',
        creator_notes: '旧作者备注',
        system_prompt: '旧系统提示',
        post_history_instructions: '旧历史后指令',
        alternate_greetings: [],
        tags: ['导入'],
        creator: '原作者',
        character_version: '1.0',
        extensions: {},
      },
    };
    writeFileSync(input, `${JSON.stringify(card, null, 2)}\n`, 'utf8');
    runForge(['unpack', input, '--output', projectRoot, '--nsfw', 'disabled'], { expectSuccess: true });

    const project = readYaml(projectRoot, 'project.yaml');
    project.project.operation = operation;
    writeYaml(projectRoot, 'project.yaml', project);
    const positioning = richSources().positioning;
    positioning.card_mode = 'world_package';
    writeYaml(projectRoot, sourcePaths.positioning, positioning);
    runForge([
      'state', projectRoot, 'lock', 'positioning.project_title', '雾港夜班',
      '--source', 'user',
    ], { expectSuccess: true });
    runForge([
      'state', projectRoot, 'stage', 'positioning', 'complete',
      '--summary', '导入制品已完成项目级重新定位',
    ], { expectSuccess: true });

    runForge(['build', projectRoot], { expectSuccess: true });
    const rebuilt = readBuiltCard(projectRoot);
    assert.equal(rebuilt.data.name, '雾港夜班');
    assert.equal(rebuilt.data.description, positioning.card_entry);
    assert.equal(rebuilt.data.first_mes, '仍可使用的原始开场');
    for (const field of advancedFields) {
      assert.equal(rebuilt.data[field], card.data[field], `${operation} cleared data.${field} before migration was locked`);
    }
    assert.ok(rebuilt.data.character_book.entries.some(entry => entry.comment === '项目定位：雾港夜班'));
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(projectRoot, 'src', 'import', 'original.json'), 'utf8')),
      card,
      `${operation} mutated the preserved import`,
    );

    runForge([
      'state', projectRoot, 'lock', 'integration.advanced_definition_policy', 'clear_after_migration',
      '--source', 'delegated',
      '--rationale', '高级定义内容已迁入项目源码和 CharacterBook，可以清理宿主槽位。',
    ], { expectSuccess: true });
    runForge(['build', projectRoot, '--force'], { expectSuccess: true });
    const migrated = readBuiltCard(projectRoot);
    assert.equal(migrated.data.name, '雾港夜班');
    assert.equal(migrated.data.description, positioning.card_entry);
    for (const field of advancedFields) assert.equal(migrated.data[field], '', `${operation} retained migrated data.${field}`);
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(projectRoot, 'src', 'import', 'original.json'), 'utf8')),
      card,
      `${operation} mutated the preserved import after migration`,
    );
  }
});

test('a registered minimal NPC remains a CharacterBook module in a converted project', t => {
  const root = tempRoot(t, 'converted-minimal-npc');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const positioning = richSources().positioning;
  positioning.card_mode = 'world_package';
  const npc = minimalCharacterSource({ id: 'gatekeeper', displayName: '守门人' });
  writeYaml(root, sourcePaths.positioning, positioning);
  writeYaml(root, sourcePaths.npcOne, npc);

  const project = readYaml(root, 'project.yaml');
  project.project.operation = 'convert';
  project.project.display_name = '无名城门';
  project.source_manifest.characters = [sourcePaths.npcOne];
  writeYaml(root, 'project.yaml', project);

  runForge(['build', root], { expectSuccess: true });
  const entry = readBuiltCard(root).data.character_book.entries.find(candidate => candidate.comment === '人物档案：守门人');
  assert.ok(entry, 'registered minimal NPC was silently omitted');
  assert.match(entry.content, /守门人/);
  assert.match(entry.content, /role: npc/);
});

test('character extensions cannot become the project card payload', t => {
  const root = tempRoot(t, 'character-extension-ownership');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const sources = richSources();
  sources.positioning.card_mode = 'world_package';
  sources.primary.extensions = {
    character_card: {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: '人物扩展伪装卡名',
        description: '人物扩展伪装入口',
        personality: '不应接管项目',
        scenario: '',
        first_mes: '人物扩展伪装开场',
        mes_example: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags: [],
        creator: '',
        character_version: '1.0',
        extensions: { rogue_character_owner: true },
      },
    },
  };
  writeYaml(root, sourcePaths.positioning, sources.positioning);
  writeYaml(root, sourcePaths.primary, sources.primary);

  const project = readYaml(root, 'project.yaml');
  project.project.display_name = '雾港夜班';
  project.source_manifest.characters = [sourcePaths.primary];
  writeYaml(root, 'project.yaml', project);
  runForge([
    'state', root, 'lock', 'integration.delivery_format', 'character_card_v3_json',
    '--source', 'delegated',
    '--rationale', '项目交付格式由项目级决定拥有。',
  ], { expectSuccess: true });

  runForge(['build', root], { expectSuccess: true });
  const card = readBuiltCard(root);
  assert.equal(card.spec, 'chara_card_v3');
  assert.equal(card.data.name, '雾港夜班');
  assert.equal(card.data.description, sources.positioning.card_entry);
  assert.equal(card.data.first_mes, '');
  assert.equal(card.data.extensions.rogue_character_owner, undefined);
});

test('a character source cannot replace the required positioning source', t => {
  const root = tempRoot(t, 'positioning-canonical-source');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const source = richSources().primary;
  writeYaml(root, sourcePaths.primary, source);
  const project = readYaml(root, 'project.yaml');
  project.source_manifest.positioning = [];
  project.source_manifest.characters = [sourcePaths.primary];
  writeYaml(root, 'project.yaml', project);

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /source_manifest\.positioning/);
  assert.match(result.output, /YAML 维护源/);
});

test('an RP package has exactly one canonical positioning source', t => {
  const root = tempRoot(t, 'single-positioning-source');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const duplicatePath = 'src/positioning-alternate.yaml';
  writeYaml(root, duplicatePath, {
    ...richSources().positioning,
    id: 'alternate_positioning',
    card_entry: 'Competing card-level entry.',
    card_mode: 'world_package',
  });
  const project = readYaml(root, 'project.yaml');
  project.source_manifest.positioning = [sourcePaths.positioning, duplicatePath];
  writeYaml(root, 'project.yaml', project);

  const result = runForge(['validate', root, '--force']);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /source_manifest[./]positioning/);
  assert.match(result.output, /cardinality|canonical|maxItems/);
});

test('standalone worldbook coverage omissions are reported without monopolizing projection', t => {
  const emptyRoot = tempRoot(t, 'worldbook-empty-assembly');
  runForge(['init', emptyRoot, '--nsfw', 'disabled', '--type', 'worldbook'], { expectSuccess: true });
  const emptyAssembly = completeAssembly();
  emptyAssembly.worldbook_manifest.entries = [];
  configureRichProject(emptyRoot, { assembly: emptyAssembly });
  const emptyResult = runForge(['build', emptyRoot], { expectSuccess: true });
  assert.equal(emptyResult.status, 0);
  assert.match(emptyResult.output, /assembly\.coverage/);
  assert.match(emptyResult.output, /src\/world\/mist_harbor\.yaml/);

  const missingRoot = tempRoot(t, 'worldbook-missing-module');
  runForge(['init', missingRoot, '--nsfw', 'disabled', '--type', 'worldbook'], { expectSuccess: true });
  const incompleteAssembly = completeAssembly();
  incompleteAssembly.worldbook_manifest.entries = incompleteAssembly.worldbook_manifest.entries
    .filter(entry => entry.id !== 'system');
  configureRichProject(missingRoot, { assembly: incompleteAssembly });
  const missingResult = runForge(['build', missingRoot], { expectSuccess: true });
  assert.equal(missingResult.status, 0);
  assert.match(missingResult.output, /assembly\.coverage/);
  assert.match(missingResult.output, /src\/systems\/night_shift\.yaml/);

  const completeRoot = tempRoot(t, 'worldbook-complete-assembly');
  runForge(['init', completeRoot, '--nsfw', 'disabled', '--type', 'worldbook'], { expectSuccess: true });
  configureRichProject(completeRoot, { assembly: completeAssembly() });
  runForge(['build', completeRoot], { expectSuccess: true });
  const worldbook = JSON.parse(readFileSync(path.join(completeRoot, 'dist', 'worldbook.json'), 'utf8'));
  const sourceIds = new Set(Object.values(worldbook.entries)
    .map(entry => entry.extensions?.rp_card_studio?.source_id)
    .filter(Boolean));
  assert.ok(sourceIds.has('world'));
  assert.ok(sourceIds.has('system'));
  assert.ok(sourceIds.has('scene'));
});

test('a zero-probability CharacterBook entry produces a projection warning', t => {
  const root = tempRoot(t, 'zero-probability-coverage');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  assembly.worldbook_manifest.entries.find(entry => entry.id === 'system').probability = 0;
  configureRichProject(root, { assembly });

  const result = runForge(['build', root], { expectSuccess: true });
  assert.equal(result.status, 0);
  assert.match(result.output, /assembly\.coverage/);
  assert.match(result.output, /src\/systems\/night_shift\.yaml/);
});

test('scene media contracts stay in the RP package and assembly consumers must bind declared slots', t => {
  const root = tempRoot(t, 'scene-media-contract');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  assembly.media_manifest = {
    enabled: true,
    assets: [{
      id: 'platform_audio',
      kind: 'audio',
      source: { kind: 'inline', content: 'embedded audio placeholder' },
      delivery: 'embedded',
      consumers: [{ ref: 'scene:last_platform', slot: 'undeclared_slot' }],
      fallback: 'text',
    }],
  };
  configureRichProject(root, { assembly });
  const scene = readYaml(root, sourcePaths.scene);
  scene.media_slots[0].required = true;
  writeYaml(root, sourcePaths.scene, scene);

  const invalid = runForge(['build', root]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.output, /media\.slot/);
  assert.match(invalid.output, /media\.required/);

  assembly.media_manifest.assets[0].consumers[0].slot = 'last_platform_ambience';
  writeYaml(root, sourcePaths.assembly, assembly);
  runForge(['build', root], { expectSuccess: true });
  const sceneEntry = readBuiltCard(root).data.character_book.entries
    .find(entry => entry.comment === '场景资料：末班站台');
  const sceneContent = parseYaml(sceneEntry.content);
  assert.equal(sceneContent.media_slots[0].id, 'last_platform_ambience');
  assert.match(sceneContent.media_slots[0].text_fallback, /钢轮余响/);
});

test('explicit assembly reports CharacterBook omissions while allowing other projection destinations', t => {
  const root = tempRoot(t, 'assembly-coverage');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  configureRichProject(root, { assembly });

  const omissions = [
    ['positioning', sourcePaths.positioning],
    ['world', sourcePaths.world],
    ['primary', sourcePaths.primary],
    ['npc_one', sourcePaths.npcOne],
    ['system', sourcePaths.system],
    ['scene', sourcePaths.scene],
    ['prompt_narrative', `${sourcePaths.prompt}#/narrative`],
    ['prompt_examples', `${sourcePaths.prompt}#/dialogue_examples`],
  ];
  for (const [entryId, missingPath] of omissions) {
    const incomplete = structuredClone(assembly);
    incomplete.worldbook_manifest.entries = incomplete.worldbook_manifest.entries.filter(entry => entry.id !== entryId);
    writeYaml(root, sourcePaths.assembly, incomplete);

    const result = runForge(['validate', root, '--force']);
    assert.ok([0, 5].includes(result.status), `unexpected validation status for advisory CharacterBook omission ${missingPath}: ${result.status}`);
    assert.match(result.output, /assembly\.coverage/, `coverage failure did not identify its rule:\n${result.output}`);
    assert.match(result.output, new RegExp(missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `coverage failure did not identify ${missingPath}`);
  }

  for (const operation of ['convert', 'continue', 'edit', 'audit', 'ui']) {
    const project = readYaml(root, 'project.yaml');
    project.project.operation = operation;
    writeYaml(root, 'project.yaml', project);
    const incomplete = structuredClone(assembly);
    incomplete.worldbook_manifest.entries = incomplete.worldbook_manifest.entries.filter(entry => entry.id !== 'system');
    writeYaml(root, sourcePaths.assembly, incomplete);

    const result = runForge(['validate', root, '--force']);
    assert.ok([0, 5].includes(result.status), `${operation} project returned an unexpected validation status: ${result.status}`);
    assert.match(result.output, /assembly\.coverage/);
  }

  const project = readYaml(root, 'project.yaml');
  project.project.operation = 'create';
  writeYaml(root, 'project.yaml', project);
  writeYaml(root, sourcePaths.assembly, assembly);
  runForge(['build', root], { expectSuccess: true });
  const card = readBuiltCard(root);
  const contents = card.data.character_book.entries.map(entry => entry.content);
  assert.ok(contents.some(content => /叙事唯一标记/.test(content)), 'narrative contract was not assembled');
  assert.ok(contents.some(content => /对白示例唯一标记/.test(content)), 'dialogue examples were not assembled');
  assert.ok(contents.every(content => !/默认开场唯一文本|备选开场唯一文本/.test(content)), 'opening text leaked into CharacterBook');
  const primaryContent = parseYaml(card.data.character_book.entries.find(entry => entry.comment === '人物档案：沈槐').content);
  for (const maintenanceKey of ['schema_version', 'status', 'source_refs', 'extensions', 'tags']) {
    assert.equal(Object.hasOwn(primaryContent, maintenanceKey), false, `explicit character projection leaked ${maintenanceKey}`);
  }
});

test('multiple world selectors may jointly cover one maintained source', t => {
  const root = tempRoot(t, 'selector-union');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  assembly.worldbook_manifest.entries = assembly.worldbook_manifest.entries.filter(entry => entry.id !== 'world');
  const worldParts = [
    ['world_premise', '世界基线：雾港夜班', '/premise'],
    ['world_rules', '世界硬规则：潮钟呼名', '/fundamental_rules'],
    ['world_continuity', '连续性约束：雾港夜班', '/continuity'],
    ['world_hooks', '剧情钩子：上一任夜班员', '/hooks'],
  ];
  assembly.worldbook_manifest.entries.push(...worldParts.map(([id, displayName, selector], index) => manifestEntry({
    id,
    displayName,
    sourceRef: sourcePaths.world,
    selector,
    mode: 'constant',
    keys: [],
    position: 'before_char',
    order: 100 + index,
    scanDepth: null,
  })));
  configureRichProject(root, { assembly });

  runForge(['build', root], { expectSuccess: true });
  const entries = readBuiltCard(root).data.character_book.entries;
  for (const [, displayName, selector] of worldParts) {
    const entry = entries.find(candidate => candidate.comment === displayName);
    assert.ok(entry, `missing selected world entry ${displayName}`);
    const content = parseYaml(entry.content);
    assert.deepEqual(content.module, {
      type: 'world',
      id: 'mist_harbor',
      display_name: '雾港世界',
      entry_name: displayName,
      selection: selector,
    });
  }
});

test('an anchor character in a larger RP project may be keyword-gated', t => {
  const root = tempRoot(t, 'primary-schedule');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  const primary = assembly.worldbook_manifest.entries.find(entry => entry.id === 'primary');
  primary.activation.mode = 'keywords';
  primary.activation.primary_keys = ['沈槐'];
  configureRichProject(root, { assembly });

  runForge(['build', root], { expectSuccess: true });
  const entry = readBuiltCard(root).data.character_book.entries.find(candidate => candidate.comment === '人物档案：沈槐');
  assert.equal(entry.constant, false);
  assert.deepEqual(entry.keys, ['沈槐']);
});

test('a true single-character project keeps its sole character definition constant', t => {
  const root = tempRoot(t, 'single-character-schedule');
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  const assembly = completeAssembly();
  assembly.worldbook_manifest.entries = assembly.worldbook_manifest.entries.filter(entry => !['npc_one', 'npc_two'].includes(entry.id));
  const primary = assembly.worldbook_manifest.entries.find(entry => entry.id === 'primary');
  primary.activation.mode = 'keywords';
  primary.activation.primary_keys = ['沈槐'];
  configureRichProject(root, { assembly });

  const positioning = readYaml(root, sourcePaths.positioning);
  positioning.card_mode = 'single_character_card';
  writeYaml(root, sourcePaths.positioning, positioning);
  const project = readYaml(root, 'project.yaml');
  project.source_manifest.characters = [sourcePaths.primary];
  writeYaml(root, 'project.yaml', project);

  const result = runForge(['build', root]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /assembly\.single_character/);
});
