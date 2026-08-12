import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forge = process.env.RP_CARD_FORGE ?? path.join(skillRoot, 'scripts', 'rp-card-forge.bundle.mjs');

function runForge(args, { expectSuccess = false } = {}) {
  const result = spawnSync(process.execPath, [forge, ...args, '--json'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  let report = null;
  try {
    report = JSON.parse(output);
  } catch {
    // Assertions below include the raw output when a report cannot be parsed.
  }
  if (expectSuccess && result.status !== 0) {
    assert.fail(`Forge failed with status ${result.status}:\n${output}`);
  }
  return { ...result, output, report };
}

function createProject(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), `rp-card-studio-${label}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  runForge(['init', root, '--nsfw', 'disabled', '--type', 'character'], { expectSuccess: true });
  return root;
}

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content.trimStart(), 'utf8');
}

function updateProject(root, { features = {}, sources = {} }) {
  const projectPath = path.join(root, 'project.yaml');
  let project = readFileSync(projectPath, 'utf8');
  for (const [feature, enabled] of Object.entries(features)) {
    project = project.replace(`  ${feature}: false`, `  ${feature}: ${enabled ? 'true' : 'false'}`);
  }
  for (const [group, entries] of Object.entries(sources)) {
    const replacement = `  ${group}:\n${entries.map(entry => `    - ${entry}`).join('\n')}`;
    if (project.includes(`  ${group}: []`)) {
      project = project.replace(`  ${group}: []`, replacement);
    } else {
      project = project.replace('  preserved_imports: []', `${replacement}\n  preserved_imports: []`);
    }
  }
  writeFileSync(projectPath, project, 'utf8');
}

const testCharacterPath = 'src/characters/test_anchor.yaml';

function registerTestCharacter(root) {
  updateProject(root, { sources: { characters: [testCharacterPath] } });
  write(root, testCharacterPath, `
schema_version: 1.0.0
id: test_anchor
display_name: 项目默认角色
status: locked
role: primary_character
identity:
  aliases: []
  age: null
  species: 人类
  occupation: 测试叙事锚点
  appearance: []
narrative_function:
  purpose: 为需要人物来源的整合测试提供显式夹具。
  pressure_on_player: ""
goals:
  immediate: []
  long_term: []
  hidden: []
value_priority: []
internal_conflicts: []
boundaries: []
behavioral_rules: []
speech:
  register: 中性
  rhythm: 简洁
  habits: []
  avoid: []
relationships: []
knowledge:
  player_visible: []
  gm_only: []
  model_only: []
state_bindings: []
examples: []
tags: []
source_refs: []
`);
}

const legacyMvu = `
schema_version: 1.0.0
status: locked
mvu:
  enabled: true
  implementation: tavern_helper_mvu
  update_mode: same_generation
  output_dialect: json_patch_subset
  variables:
    - source_path: relationship.trust
      runtime_path: stat_data.relationship.trust
      type: integer
      default: 10
      constraints:
        minimum: 0
        maximum: 100
      writer:
        kind: update_model
        id: relationship_update
        operations: [set, add, subtract]
      readers: [plot_model, status_ui]
      renderer: status_ui.relationship_trust
      cleanup: retain
      migration: clamp_to_current_range
      visibility: player
  initialization:
    defaults:
      relationship:
        trust: 10
    opening_overrides: []
  update_rules:
    - id: relationship_update
      trigger: A witnessed action changes trust.
      writer_id: relationship_update
      reads: [relationship.trust]
      writes:
        - source_path: relationship.trust
          operation: add
          value: 1
      failure: Retain the previous legal value.
  routing:
    entries: []
ejs:
  enabled: false
  entries: []
runtime_contract:
  dependencies: []
  assumptions: []
  fallbacks:
    - Continue narrative with the last legal state.
`;

const legacyStatusUiWithMissingPath = `
schema_version: 1.2.0
status: locked
status_ui:
  enabled: true
  mode: text
  read_only: true
  refresh: on_message
  text_template: "Trust: {{relationship.missing}}"
  sections:
    - id: relationship
      display_name: Relationship
      priority: 0
      collapsed: false
      fields:
        - id: missing
          source_path: relationship.missing
          label: Missing
          format: integer
          missing_value: Unknown
          visibility: player
  commands: []
  states:
    loading: Loading
    empty: Empty
    error: Error
    degraded: Text fallback
  responsive:
    narrow: single_column
    wide: grouped_columns
  visual:
    density: compact
    hierarchy: [relationship]
    motion: none
  accessibility:
    keyboard: true
    live_updates: polite
    color_independent: true
  dependencies: []
  delivery:
    level: embedded
    adapter: sillytavern_regex
    surface: message
    entrypoint: generated
    artifact: inline
    placeholder: <StatusPlaceHolderImpl/>
`;

const legacyOpeningWithMissingInit = `
schema_version: 1.0.0
status: locked
narrative:
  point_of_view: second_person_limited
  tense: present
  pacing: measured
  prose_density: medium
  dialogue_ratio: balanced
  sensory_focus: [sound]
  player_agency:
    never_decide: [player dialogue]
    npc_permissions: [react]
    handoff: End before the player's decision.
  information_policy:
    reveal: [immediate surroundings]
    withhold: [hidden motives]
openings:
  - id: start
    display_name: Start
    is_default: true
    scene_ref: scene:start
    present_character_refs: []
    visible_text: A bell rings beyond the closed door.
    immediate_change: The corridor becomes quiet.
    hook: Someone waits outside.
    player_handoff: The player chooses whether to open the door.
    initial_state_ref: mvu_init:not_defined
    established_facts: [The door is closed.]
dialogue_examples: []
source_refs: []
`;

const minimalStartScene = `
schema_version: 1.0.0
id: start
display_name: Start
status: locked
purpose: Hold the opening interaction.
context:
  world_ref: world:main
  time_window: Present
  location_ref: location:start
entrances: []
exits: []
zones: []
player_visible:
  first_impression: A closed door stands at the end of the corridor.
  sensory_cues: [A bell rings.]
  affordances: [Approach the door.]
gm_only:
  truth: Someone waits outside.
  hidden_events: []
  concealed_connections: []
risks: []
clues: []
events: []
state_bindings: []
source_refs: []
`;

const minimalWorld = `
schema_version: 1.0.0
id: main
display_name: Main World
status: locked
premise:
  summary: Runtime test world.
  scale: local
  time_scope: current
  space_scope: station
  public_reality: Stable test reality.
fundamental_rules: []
society:
  norms: []
  institutions: []
  factions: []
geography:
  locations: []
history:
  events: []
knowledge:
  player_visible: []
  conditional: []
  gm_only: []
  model_only: []
continuity:
  invariants: []
  open_questions: []
hooks: []
source_refs: []
`;

test('validate rejects unresolved MVU, UI, and opening references', t => {
  const root = createProject(t, 'graph');
  updateProject(root, {
    features: { mvu: true, status_ui: true },
    sources: {
      mvu: ['src/mvu/runtime.yaml'],
      prompts: ['src/prompts/opening.yaml'],
      ui: ['src/ui/status-ui.yaml'],
    },
  });
  write(root, 'src/mvu/runtime.yaml', legacyMvu);
  write(root, 'src/prompts/opening.yaml', legacyOpeningWithMissingInit);
  write(root, 'src/ui/status-ui.yaml', legacyStatusUiWithMissingPath);

  const result = runForge(['validate', root]);
  assert.notEqual(result.status, 0, `validation unexpectedly passed:\n${result.output}`);
  assert.match(result.output, /mvu\.reference|initialization\.reference/);
  assert.match(result.output, /ui\.source_path/);
});

test('build applies the worldbook assembly manifest instead of fixed entry defaults', t => {
  const root = createProject(t, 'assembly');
  registerTestCharacter(root);
  updateProject(root, { sources: { assembly: ['src/integration/assembly.yaml'] } });
  write(root, 'src/prompts/signal-guide.txt', 'Use the signal only after the player discovers it.');
  write(root, 'src/integration/assembly.yaml', `
schema_version: 1.0.0
status: locked
worldbook_manifest:
  entries:
    - id: signal_guide
      display_name: 线索规则：信号指南
      source:
        kind: file
        path: src/prompts/signal-guide.txt
      enabled: true
      activation:
        mode: keywords
        primary_keys: [signal]
        secondary_keys: []
        selective: false
        logic: any
        case_sensitive: false
        match_whole_words: false
      insertion:
        position: before_char
        order: 42
        depth: null
        role: system
      probability: 75
      scan_depth: 4
      recursion:
        prevent_incoming: true
        prevent_outgoing: true
        delay_until_recursion: false
      recipient: shared
      visibility: model
      token_budget: null
      fallback: skip
    - id: primary_character
      display_name: 主叙事锚点：项目默认角色
      source:
        kind: registered_source
        source_ref: ${testCharacterPath}
      enabled: true
      activation:
        mode: constant
        primary_keys: []
        secondary_keys: []
        selective: false
        logic: any
        case_sensitive: false
        match_whole_words: false
      insertion:
        position: after_char
        order: 43
        depth: null
        role: system
      probability: 100
      scan_depth: null
      recursion:
        prevent_incoming: true
        prevent_outgoing: true
        delay_until_recursion: false
      recipient: shared
      visibility: model
      ignore_budget: true
      fallback: block
media_manifest:
  enabled: false
  assets: []
`);

  const result = runForge(['build', root], { expectSuccess: true });
  const output = path.join(root, 'dist', 'character-card.json');
  assert.equal(existsSync(output), true);
  const card = JSON.parse(readFileSync(output, 'utf8'));
  const rawEntries = card.data.character_book.entries;
  const entries = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries);
  const entry = entries.find(candidate => candidate.extensions?.rp_card_studio?.source_id === 'signal_guide');
  assert.ok(entry, 'assembled worldbook entry is missing');
  assert.ok(Number.isInteger(entry.id) && entry.id >= 0, `invalid CharacterBook id: ${entry.id}`);
  assert.deepEqual(entry.keys, ['signal']);
  assert.equal(entry.constant, false);
  assert.equal(entry.insertion_order, 42);
  assert.equal(entry.extensions.rp_card_studio.probability, 75);
  assert.equal(result.report?.ok, true);
});

test('build generates a runtime state schema and self-contained Tavern Helper adapter', t => {
  const root = createProject(t, 'runtime');
  updateProject(root, {
    features: { scenes: true, mvu: true, status_ui: true },
    sources: {
      scenes: ['src/scenes/start.yaml'],
      world: ['src/world/main.yaml'],
      mvu: ['src/mvu/runtime.yaml'],
      prompts: ['src/prompts/opening.yaml'],
      ui: ['src/ui/status-ui.yaml'],
    },
  });
  write(root, 'src/scenes/start.yaml', minimalStartScene);
  write(root, 'src/world/main.yaml', minimalWorld);
  write(root, 'src/mvu/runtime.yaml', `
schema_version: 1.1.0
status: locked
mvu:
  enabled: true
  implementation: tavern_helper_mvu
  update_mode: same_generation
  output_dialect: rp_json_patch_v1
  storage:
    scope: message
    namespace: stat_data
    snapshot_selector: current_message
    merge_policy: message_over_chat
  protocol:
    id: rp_json_patch
    version: 1.0.0
    envelope: UpdateVariable
    path_syntax: json_pointer
    operations: [replace, delta, insert, remove, move]
    atomicity: batch
    precondition: validate_before_commit
  variables:
    - source_path: relationship.trust
      runtime_path: stat_data.relationship.trust
      type: integer
      default: 10
      constraints:
        minimum: 0
        maximum: 100
      writer:
        kind: update_model
        id: relationship_update
        operations: [set, add, subtract]
      readers: [plot_model, status_ui, script]
      renderer: status_ui.relationship_trust
      cleanup: retain
      migration: clamp_to_current_range
      visibility: player
  initialization:
    defaults:
      relationship:
        trust: 10
    opening_overrides: []
    profiles: []
    opening_bindings:
      - opening_ref: opening:start
        profile_ref: mvu_init:default
        strategy: complete_replace
  update_rules:
    - id: relationship_update
      trigger: A witnessed action changes trust.
      writer_id: relationship_update
      reads: [relationship.trust]
      writes:
        - source_path: relationship.trust
          operation: add
          value: 1
      failure: Retain the previous legal value.
  routing:
    entries: []
ejs:
  enabled: false
  entries: []
runtime_contract:
  adapter:
    id: tavern_helper
    version: 1.0.0
    delivery: embedded
    entrypoint: rp_card_studio_runtime_guard
    readiness_probe: globalThis.Mvu
    timeout_ms: 10000
    fallback: Keep the last legal state and render text only.
  dependencies:
    - id: mvu
      class: host_required
      delivery: Install and enable a compatible MVU runtime in SillyTavern.
      version: unverified
      load_order: 10
      readiness_probe: "globalThis.Mvu"
      timeout_ms: 10000
      fallback: Keep the last legal state and render text only.
  assumptions: []
  fallbacks:
    - Keep the last legal state and render text only.
`);
  write(root, 'src/prompts/opening.yaml', legacyOpeningWithMissingInit.replace('mvu_init:not_defined', 'mvu_init:default'));
  write(root, 'src/ui/status-ui.yaml', `
schema_version: 1.2.0
status: locked
status_ui:
  enabled: true
  mode: embedded
  read_only: true
  refresh: on_message
  text_template: "Trust: {{relationship.trust}}"
  sections:
    - id: relationship
      display_name: Relationship
      priority: 0
      collapsed: false
      fields:
        - id: trust
          source_path: relationship.trust
          label: Trust
          format: integer
          missing_value: Unknown
          visibility: player
  commands: []
  states:
    loading: Loading
    empty: Empty
    error: Error
    degraded: "Trust: {{relationship.trust}}"
  responsive:
    narrow: single_column
    wide: grouped_columns
  visual:
    density: compact
    hierarchy: [relationship]
    motion: none
  accessibility:
    keyboard: true
    live_updates: polite
    color_independent: true
  dependencies: []
  delivery:
    level: embedded
    adapter: sillytavern_regex
    surface: message
    entrypoint: generated
    artifact: inline
    placeholder: <StatusPlaceHolderImpl/>
`);

  runForge(['build', root], { expectSuccess: true });
  const stateSchemaPath = path.join(root, 'reports', 'runtime-state.schema.json');
  assert.equal(existsSync(stateSchemaPath), true, 'runtime state schema was not generated');
  const stateSchema = JSON.parse(readFileSync(stateSchemaPath, 'utf8'));
  assert.ok(stateSchema.properties.relationship.properties.trust);
  assert.ok(stateSchema['x-rp-card-studio'].mappings.some(mapping => mapping.source_path === 'relationship.trust'
    && mapping.runtime_path === 'stat_data.relationship.trust'));

  const card = JSON.parse(readFileSync(path.join(root, 'dist', 'character-card.json'), 'utf8'));
  assert.equal(card.data.extensions.rp_card_studio.opening_selection.default.opening_id, 'start');
  assert.equal(card.data.extensions.rp_card_studio.opening_selection.default.profile_id, 'default');
  assert.deepEqual(card.data.extensions.rp_card_studio.opening_selection.default.state, { relationship: { trust: 10 } });
  const scripts = card.data.extensions.tavern_helper.scripts;
  const regexScripts = card.data.extensions.regex_scripts;
  assert.deepEqual(scripts.map(script => script.id), ['rp_card_studio_runtime_guard']);
  assert.ok(regexScripts.some(script => script.id === '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d04'));
  assert.ok(card.data.first_mes.endsWith('<StatusPlaceHolderImpl/>'));
  for (const script of scripts) {
    assert.doesNotMatch(script.content, /https?:\/\//, `${script.id} contains a remote runtime dependency`);
  }
  for (const script of regexScripts) {
    assert.doesNotMatch(script.replaceString, /https?:\/\//, `${script.id} contains a remote runtime dependency`);
  }
});

test('embedded UI cannot be reported complete without a runtime delivery contract', t => {
  const root = createProject(t, 'ui-spec');
  updateProject(root, {
    features: { status_ui: true },
    sources: { ui: ['src/ui/status-ui.yaml'] },
  });
  write(root, 'src/ui/status-ui.yaml', legacyStatusUiWithMissingPath
    .replace('mode: text', 'mode: embedded')
    .replace('enabled: true', 'enabled: true')
    .replace(/  sections:[\s\S]*?  commands: \[\]/, '  sections: []\n  commands: []')
    .replace(/\n  delivery:[\s\S]*$/, ''));

  const result = runForge(['validate', root]);
  assert.notEqual(result.status, 0, `embedded UI without runtime delivery unexpectedly passed:\n${result.output}`);
  assert.match(result.output, /ui\.runtime_missing/);
});

test('embedded UI rejects entrypoint and artifact paths that are not generated', t => {
  const root = createProject(t, 'ui-artifact-path');
  updateProject(root, {
    features: { status_ui: true },
    sources: { ui: ['src/ui/status-ui.yaml'] },
  });
  write(root, 'src/ui/status-ui.yaml', `
schema_version: 1.2.0
status: locked
status_ui:
  enabled: true
  mode: embedded
  read_only: true
  refresh: on_message
  text_template: Status unavailable.
  sections: []
  commands: []
  states:
    loading: Loading
    empty: Empty
    error: Error
    degraded: Unavailable
  responsive:
    narrow: single_column
    wide: grouped_columns
  visual:
    density: compact
    hierarchy: []
    motion: none
  accessibility:
    keyboard: true
    live_updates: polite
    color_independent: true
  dependencies: []
  delivery:
    level: embedded
    adapter: sillytavern_regex
    surface: message
    entrypoint: src/adapters/status.js
    artifact: dist/status.js
    placeholder: <StatusPlaceHolderImpl/>
`);

  const result = runForge(['validate', root]);
  assert.notEqual(result.status, 0, `undeployed embedded UI paths unexpectedly passed:\n${result.output}`);
  assert.match(result.output, /const|adapter\.artifact|generated|inline/);
});

test('embedded MVU rejects an entrypoint path without a generated card script', t => {
  const root = createProject(t, 'mvu-entrypoint-path');
  updateProject(root, {
    features: { mvu: true },
    sources: { mvu: ['src/mvu/runtime.yaml'] },
  });
  const withAdapter = legacyMvu.replace('runtime_contract:\n', `runtime_contract:
  adapter:
    id: tavern_helper
    version: 1.0.0
    delivery: embedded
    entrypoint: src/adapters/runtime.js
    readiness_probe: globalThis.Mvu
    timeout_ms: 10000
    fallback: Keep the last legal state.
`);
  write(root, 'src/mvu/runtime.yaml', withAdapter);

  const result = runForge(['validate', root]);
  assert.notEqual(result.status, 0, `undeployed embedded MVU entrypoint unexpectedly passed:\n${result.output}`);
  assert.match(result.output, /const|adapter\.artifact|rp_card_studio_runtime_guard/);
});

test('media manifest accepts an explicit preload strategy', t => {
  const root = createProject(t, 'media-preload');
  registerTestCharacter(root);
  updateProject(root, { sources: { assembly: ['src/integration/assembly.yaml'] } });
  write(root, 'src/integration/assembly.yaml', `
schema_version: 1.0.0
status: locked
worldbook_manifest:
  entries:
    - id: primary_character
      display_name: 主叙事锚点：项目默认角色
      source:
        kind: registered_source
        source_ref: ${testCharacterPath}
      enabled: true
      activation:
        mode: constant
        primary_keys: []
        secondary_keys: []
        selective: false
        logic: any
        case_sensitive: false
        match_whole_words: false
      insertion:
        position: after_char
        order: 100
        depth: null
        role: system
      probability: 100
      scan_depth: null
      recursion:
        prevent_incoming: true
        prevent_outgoing: true
        delay_until_recursion: false
      recipient: shared
      visibility: model
      ignore_budget: true
      fallback: block
media_manifest:
  enabled: true
  assets:
    - id: arrival_background
      kind: background
      source:
        kind: inline
        content: embedded-placeholder
      delivery: embedded
      preload: on_opening
      consumers: []
      fallback: text
`);

  const result = runForge(['validate', root]);
  assert.equal(result.status, 0, `media preload contract was rejected:\n${result.output}`);
});

test('legacy 1.0 projects without an assembly source group remain valid', t => {
  const root = createProject(t, 'legacy-assembly');
  const projectPath = path.join(root, 'project.yaml');
  const legacyProject = readFileSync(projectPath, 'utf8').replace('  assembly: []\n', '');
  writeFileSync(projectPath, legacyProject, 'utf8');

  const result = runForge(['validate', root]);
  assert.equal(result.status, 0, `legacy project was rejected:\n${result.output}`);
  runForge(['build', root], { expectSuccess: true });
});

test('a project cannot register competing assembly manifests', t => {
  const root = createProject(t, 'assembly-owner');
  updateProject(root, {
    sources: { assembly: ['src/integration/assembly-a.yaml', 'src/integration/assembly-b.yaml'] },
  });
  const manifest = `
schema_version: 1.0.0
status: locked
worldbook_manifest:
  entries: []
media_manifest:
  enabled: false
  assets: []
`;
  write(root, 'src/integration/assembly-a.yaml', manifest);
  write(root, 'src/integration/assembly-b.yaml', manifest);

  const result = runForge(['validate', root]);
  assert.notEqual(result.status, 0, `competing assembly manifests unexpectedly passed:\n${result.output}`);
  assert.match(result.output, /assembly|source_manifest/);
});

test('remote media delivery rejects workspace-relative sources', t => {
  const root = createProject(t, 'remote-local-media');
  updateProject(root, { sources: { assembly: ['src/integration/assembly.yaml'] } });
  write(root, 'src/assets/background.txt', 'local-only');
  write(root, 'src/integration/assembly.yaml', `
schema_version: 1.0.0
status: locked
worldbook_manifest:
  entries: []
media_manifest:
  enabled: true
  assets:
    - id: local_background
      kind: background
      source:
        kind: file
        path: src/assets/background.txt
      delivery: remote
      consumers: []
      fallback: text
`);

  const result = runForge(['validate', root]);
  assert.notEqual(result.status, 0, `workspace-relative remote media unexpectedly passed:\n${result.output}`);
  assert.match(result.output, /media|delivery|const/);
});

test('build output cannot overwrite any registered project source', t => {
  const root = createProject(t, 'protected-output');
  updateProject(root, { sources: { world: ['src/world/main.yaml'] } });
  write(root, 'src/world/main.yaml', minimalWorld);
  const protectedSource = path.join(root, 'src', 'world', 'main.yaml');
  const before = readFileSync(protectedSource, 'utf8');

  const result = runForge(['build', root, '--output', protectedSource, '--force']);
  assert.notEqual(result.status, 0, `build overwrote a registered source:\n${result.output}`);
  assert.match(result.output, /conflict|维护源|输出不能覆盖/);
  assert.equal(readFileSync(protectedSource, 'utf8'), before);
});

test('generated report paths cannot overwrite registered preserved inputs', t => {
  const root = createProject(t, 'protected-report');
  updateProject(root, { sources: { preserved_imports: ['reports/build-manifest.json'] } });
  write(root, 'reports/build-manifest.json', '{"preserved":true}\n');
  const protectedReport = path.join(root, 'reports', 'build-manifest.json');
  const before = readFileSync(protectedReport, 'utf8');

  const result = runForge(['build', root, '--force']);
  assert.notEqual(result.status, 0, `build manifest overwrote a registered input:\n${result.output}`);
  assert.match(result.output, /conflict|维护源|输出不能覆盖/);
  assert.equal(readFileSync(protectedReport, 'utf8'), before);
});

test('artifact output cannot collide with generated runtime schema deletion', t => {
  const root = createProject(t, 'runtime-schema-collision');
  const runtimeSchema = path.join(root, 'reports', 'runtime-state.schema.json');
  write(root, 'reports/runtime-state.schema.json', '{"sentinel":true}\n');
  const before = readFileSync(runtimeSchema, 'utf8');

  const result = runForge(['build', root, '--output', runtimeSchema, '--force']);
  assert.notEqual(result.status, 0, `artifact and runtime-schema targets unexpectedly collided:\n${result.output}`);
  assert.match(result.output, /conflict|目标不能重复/);
  assert.equal(readFileSync(runtimeSchema, 'utf8'), before);
});

test('project roundtrip output cannot overwrite project metadata or registered sources', t => {
  const root = createProject(t, 'roundtrip-protected-output');
  const projectPath = path.join(root, 'project.yaml');
  const before = readFileSync(projectPath, 'utf8');

  const result = runForge(['roundtrip', root, '--output', projectPath, '--force']);
  assert.notEqual(result.status, 0, `roundtrip overwrote project metadata:\n${result.output}`);
  assert.match(result.output, /conflict|维护源|输出不能覆盖/);
  assert.equal(readFileSync(projectPath, 'utf8'), before);
});

test('CLI project lifecycle passes init, validate, build, and roundtrip', t => {
  const root = createProject(t, 'cli-lifecycle');
  runForge(['validate', root], { expectSuccess: true });
  runForge(['build', root], { expectSuccess: true });
  const result = runForge(['roundtrip', root], { expectSuccess: true });
  assert.equal(result.report?.data?.equal, true);
});

test('unpack and rebuild preserve unknown artifact fields', t => {
  const root = createProject(t, 'unknown-roundtrip');
  runForge(['build', root], { expectSuccess: true });
  const artifactPath = path.join(root, 'unknown-input.json');
  const artifact = JSON.parse(readFileSync(path.join(root, 'dist', 'character-card.json'), 'utf8'));
  artifact.vendor_top_level = { retained: 'top' };
  artifact.data.vendor_payload = { retained: true, nested: { value: 7 } };
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  const unpacked = path.join(root, 'unpacked');

  runForge(['unpack', artifactPath, '--output', unpacked, '--nsfw', 'disabled'], { expectSuccess: true });
  runForge(['build', unpacked], { expectSuccess: true });
  const rebuilt = JSON.parse(readFileSync(path.join(unpacked, 'dist', 'character-card.json'), 'utf8'));
  assert.deepEqual(rebuilt.vendor_top_level, { retained: 'top' });
  assert.deepEqual(rebuilt.data.vendor_payload, { retained: true, nested: { value: 7 } });
});

test('unpack build and roundtrip restore user adapters before appending managed scripts', t => {
  const root = createProject(t, 'adapter-preservation-input');
  runForge(['build', root], { expectSuccess: true });
  const artifact = JSON.parse(readFileSync(path.join(root, 'dist', 'character-card.json'), 'utf8'));
  const userRegex = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      scriptName: 'User regex A',
      findRegex: '/alpha/gi',
      replaceString: 'A',
      trimStrings: [],
      placement: [2],
      disabled: false,
      markdownOnly: true,
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      scriptName: 'User regex B',
      findRegex: '/beta/gi',
      replaceString: 'B',
      trimStrings: [],
      placement: [1],
      disabled: false,
      markdownOnly: false,
      promptOnly: true,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: 8,
    },
  ];
  const userTavernScript = {
    type: 'script',
    enabled: true,
    name: 'User runtime script',
    id: 'user_runtime_script',
    content: 'globalThis.userRuntimeLoaded = true;',
    info: 'User-owned script',
    button: { enabled: true, buttons: [] },
    data: { owner: 'user' },
    export_with: { data: true, button: true },
  };
  const legacyStatusScript = {
    type: 'script',
    enabled: true,
    name: 'RP Card Studio Status UI',
    id: 'rp_card_studio_status_ui',
    content: `const key = Symbol.for("rp_card_studio.status_ui");
const hostWindow = globalThis.parent;
hostWindow.document.getElementById("sheld");
hostWindow.document.getElementById("form_sheld");`,
    info: 'Read-only status UI; execution order is encoded by the stable script id',
    button: { enabled: true, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
  };
  artifact.data.extensions ??= {};
  artifact.data.extensions.regex_scripts = structuredClone(userRegex);
  artifact.data.extensions.tavern_helper = {
    scripts: [structuredClone(userTavernScript), structuredClone(legacyStatusScript)],
    user_metadata: { retained: true },
  };
  const inputPath = path.join(root, 'adapter-input.json');
  writeFileSync(inputPath, JSON.stringify(artifact, null, 2), 'utf8');
  const unpacked = path.join(root, 'adapter-unpacked');

  runForge(['unpack', inputPath, '--output', unpacked, '--nsfw', 'disabled'], { expectSuccess: true });
  const unpackedProject = parseYaml(readFileSync(path.join(unpacked, 'project.yaml'), 'utf8'));
  assert.deepEqual(unpackedProject.source_manifest.characters, []);
  const originalPayload = JSON.parse(readFileSync(path.join(unpacked, 'src', 'import', 'original.json'), 'utf8'));
  assert.deepEqual(originalPayload.data.extensions.regex_scripts, userRegex);
  assert.deepEqual(originalPayload.data.extensions.tavern_helper.scripts, [userTavernScript, legacyStatusScript]);
  updateProject(unpacked, {
    features: { mvu: true },
    sources: { mvu: ['src/mvu/runtime.yaml'] },
  });
  const runtimeSource = legacyMvu.replace('runtime_contract:\n', `runtime_contract:
  adapter:
    id: tavern_helper
    version: 1.0.0
    delivery: embedded
    entrypoint: rp_card_studio_runtime_guard
    readiness_probe: globalThis.Mvu
    timeout_ms: 10000
    fallback: Keep the last legal state.
`);
  write(unpacked, 'src/mvu/runtime.yaml', runtimeSource);

  runForge(['build', unpacked], { expectSuccess: true });
  const outputPath = path.join(unpacked, 'dist', 'character-card.json');
  const firstBuild = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(firstBuild.data.extensions.regex_scripts.slice(0, 2), userRegex);
  assert.deepEqual(firstBuild.data.extensions.regex_scripts.slice(2).map(script => script.id), [
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d05',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d01',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d06',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d02',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d03',
  ]);
  assert.deepEqual(firstBuild.data.extensions.tavern_helper.scripts[0], userTavernScript);
  assert.deepEqual(firstBuild.data.extensions.tavern_helper.scripts.map(script => script.id), [
    'user_runtime_script',
    'rp_card_studio_runtime_guard',
  ]);
  assert.deepEqual(firstBuild.data.extensions.tavern_helper.user_metadata, { retained: true });

  runForge(['build', unpacked, '--force'], { expectSuccess: true });
  const secondBuild = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(secondBuild.data.extensions.regex_scripts, firstBuild.data.extensions.regex_scripts);
  assert.deepEqual(secondBuild.data.extensions.tavern_helper, firstBuild.data.extensions.tavern_helper);
  const roundtrip = runForge(['roundtrip', unpacked], { expectSuccess: true });
  assert.equal(roundtrip.report?.data?.equal, true);
});
