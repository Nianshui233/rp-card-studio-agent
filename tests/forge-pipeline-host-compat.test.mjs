import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync as readTextFile, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forge = process.env.RP_CARD_FORGE ?? path.join(skillRoot, 'scripts', 'rp-card-forge.bundle.mjs');

function runForge(args, { expectSuccess = false } = {}) {
  const result = spawnSync(process.execPath, [forge, ...args, '--json'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  let report = null;
  try {
    report = JSON.parse(output);
  } catch {
    // Include raw output in the assertion when Forge did not emit JSON.
  }
  if (expectSuccess && result.status !== 0) {
    assert.fail(`Forge failed with status ${result.status}:\n${output}`);
  }
  return { ...result, output, report };
}

function createProject(t, label) {
  const root = mkdtempSync(path.join(os.tmpdir(), `rp-card-forge-pipeline-${label}-`));
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
  let project = readTextFile(projectPath, 'utf8');
  for (const [feature, enabled] of Object.entries(features)) {
    project = project.replace(`  ${feature}: false`, `  ${feature}: ${enabled ? 'true' : 'false'}`);
  }
  for (const [group, entries] of Object.entries(sources)) {
    const replacement = `  ${group}:\n${entries.map(entry => `    - ${entry}`).join('\n')}`;
    project = project.replace(`  ${group}: []`, replacement);
  }
  writeFileSync(projectPath, project, 'utf8');
}

const testCharacterPath = 'src/characters/card.yaml';
const testCharacterId = 'pipeline_anchor';
const testCharacterSource = `
schema_version: 1.0.0
id: ${testCharacterId}
display_name: 管线测试锚点
status: locked
role: primary_character
identity:
  aliases: []
  age: null
  species: ""
  occupation: ""
  appearance: []
narrative_function:
  purpose: 为管线测试提供显式人物源。
  narrative_pressure: ""
goals:
  immediate: []
  long_term: []
  hidden: []
psychology:
  needs: []
  fears: []
  weaknesses: []
  biases: []
  self_deceptions: []
value_priority: []
internal_conflicts: []
boundaries: []
behavioral_rules: []
stress_ladder: []
ooc_guardrails: []
speech:
  register: ""
  rhythm: ""
  habits: []
  avoid: []
relationships: []
knowledge:
  publicly_known: []
  gm_only: []
  model_only: []
  mistaken: []
  forbidden: []
state_bindings: []
examples: []
tags: []
source_refs: []
`;

function addTestCharacter(root) {
  write(root, testCharacterPath, testCharacterSource);
  updateProject(root, { sources: { characters: [testCharacterPath] } });
  return testCharacterId;
}

const mvuSource = `
schema_version: 1.0.0
status: locked
mvu:
  enabled: true
  implementation: tavern_helper_mvu
  update_mode: same_generation
  output_dialect: mvu_json_patch
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
      failure: Retain the previous legal state.
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
    fallback: Keep the last legal state.
  dependencies: []
  assumptions: []
  fallbacks:
    - Keep the last legal state.
`;

const assemblySource = `
schema_version: 1.0.0
status: locked
worldbook_manifest:
  display_name: Pipeline Worldbook
  entries:
    - id: pipeline_guide
      display_name: 管线测试：内联装配内容
      source:
        kind: inline
        content: Assembly content survives the full Forge pipeline.
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
        position: before_char
        order: 10
        depth: null
        role: system
      probability: 100
      scan_depth: null
      recursion:
        prevent_incoming: false
        prevent_outgoing: false
        delay_until_recursion: false
      recipient: shared
      visibility: model
      fallback: skip
    - id: primary_character
      display_name: 主叙事锚点：项目默认角色
      source:
        kind: registered_source
        source_ref: src/characters/card.yaml
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
        order: 20
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
`;

const ejsSource = (characterId) => `
schema_version: 1.1.0
status: locked
mvu:
  enabled: false
  implementation: unverified
  update_mode: disabled
  output_dialect: unverified
  storage:
    scope: message
    namespace: stat_data
    snapshot_selector: latest_message
    merge_policy: scope_only
  protocol:
    id: rp_json_patch
    version: 1.0.0
    envelope: UpdateVariable
    path_syntax: json_pointer
    operations: [replace]
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
        kind: none
        id: no_writer
        operations: []
      readers: [ejs]
      renderer: null
      cleanup: retain
      migration: use_default_if_invalid
      visibility: model
  initialization:
    defaults:
      relationship:
        trust: 10
    opening_overrides: []
  update_rules: []
  routing:
    entries: []
ejs:
  enabled: true
  entries:
    - id: trust_gate
      source_ref: character:${characterId}
      complexity: section_branch
      engine: st_prompt_template
      condition:
        runtime_path: stat_data.relationship.trust
        operator: gte
        value: 50
      reads: [stat_data.relationship.trust]
      target: prompt
      placement: after
      insertion_order: 20
      branches:
        when_true: Trusted branch.
        when_false: Guarded branch.
        fallback: Neutral fallback.
      missing_dependency: omit_dynamic
runtime_contract:
  adapter: null
  dependencies:
    - id: st_prompt_template
      class: host_required
      delivery: Install and enable ST-Prompt-Template in SillyTavern.
      version: 1.17.6.8
      readiness_probe: globalThis.EjsTemplate
      timeout_ms: 10000
      fallback: Omit dynamic content.
  assumptions: []
  fallbacks:
    - Omit dynamic content.
`;

function builtCard(root) {
  const outputPath = path.join(root, 'dist', 'character-card.json');
  assert.equal(existsSync(outputPath), true, `Forge did not write ${outputPath}`);
  return JSON.parse(readTextFile(outputPath, 'utf8'));
}

function characterBookEntries(card) {
  const raw = card.data?.character_book?.entries ?? [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

test('Forge build carries Assembly, MVU artifacts, and Tavern Helper guard through the character target', t => {
  const root = createProject(t, 'mvu');
  addTestCharacter(root);
  updateProject(root, {
    features: { mvu: true },
    sources: {
      mvu: ['src/mvu/runtime.yaml'],
      assembly: ['src/integration/assembly.yaml'],
    },
  });
  write(root, 'src/mvu/runtime.yaml', mvuSource);
  write(root, 'src/integration/assembly.yaml', assemblySource);

  const result = runForge(['build', root], { expectSuccess: true });
  const card = builtCard(root);
  const entries = characterBookEntries(card);
  const scripts = card.data?.extensions?.tavern_helper?.scripts ?? [];
  const regexScripts = card.data?.extensions?.regex_scripts ?? [];

  assert.equal(result.report?.ok, true);
  const assemblyEntry = entries.find(entry => entry.extensions?.rp_card_studio?.source_id === 'pipeline_guide');
  assert.ok(assemblyEntry, 'Assembly entry is missing');
  assert.ok(Number.isInteger(assemblyEntry.id) && assemblyEntry.id >= 0, `invalid CharacterBook id: ${assemblyEntry.id}`);
  const managedEntry = sourceKey => entries.find(entry => entry.extensions?.rp_card_studio?.source_key === sourceKey);
  assert.equal(managedEntry('mvu:initvar')?.enabled, false, 'MVU initvar entry is missing');
  assert.match(managedEntry('mvu:initvar')?.comment ?? '', /\[initvar\]/i, 'MVU host marker is missing');
  assert.equal(managedEntry('mvu:update_rules')?.comment, '变量更新规则');
  assert.equal(managedEntry('mvu:update_format')?.comment, '回复输出格式');
  assert.ok(scripts.some(script => script.id === 'rp_card_studio_runtime_guard'), 'Tavern Helper runtime guard is missing');
  assert.deepEqual(regexScripts.map(script => script.id), [
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d05',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d01',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d06',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d02',
    '0e4c7a2c-5c51-4a15-8f8e-f2a81f831d03',
  ]);
  assert.equal(entries.some(entry => /\[(?:GENERATE|RENDER)\]/.test(entry.comment)), false, 'MVU-only build emitted EJS entries');
});

test('Forge binds an embedded MVU worldbook for SillyTavern build and roundtrip artifacts', t => {
  const root = createProject(t, 'mvu-worldbook-binding');
  addTestCharacter(root);
  updateProject(root, {
    features: { mvu: true },
    sources: {
      mvu: ['src/mvu/runtime.yaml'],
      assembly: ['src/integration/assembly.yaml'],
    },
  });
  write(root, 'src/mvu/runtime.yaml', mvuSource);
  write(root, 'src/integration/assembly.yaml', assemblySource);

  runForge(['build', root], { expectSuccess: true });
  const card = builtCard(root);
  const candidatePath = path.join(root, 'roundtrip-candidate.json');
  const roundtrip = runForge(['roundtrip', root, '--output', candidatePath], { expectSuccess: true });
  const candidate = JSON.parse(readTextFile(candidatePath, 'utf8'));

  assert.equal(card.data?.character_book?.name, 'Pipeline Worldbook');
  assert.equal(card.data?.extensions?.world, card.data.character_book.name);
  assert.equal(roundtrip.report?.data?.equal, true);
  assert.equal(candidate.data?.character_book?.name, 'Pipeline Worldbook');
  assert.equal(candidate.data?.extensions?.world, candidate.data.character_book.name);
});

test('Forge build omits optional MVU, EJS, and adapter artifacts when no runtime stage is enabled', t => {
  const root = createProject(t, 'none');

  const result = runForge(['build', root], { expectSuccess: true });
  const card = builtCard(root);
  const entries = characterBookEntries(card);
  const scripts = card.data?.extensions?.tavern_helper?.scripts ?? [];

  assert.equal(result.report?.ok, true);
  assert.equal(entries.some(entry => /\[(?:initvar|mvu_update|GENERATE|RENDER)\]/i.test(entry.comment)), false);
  assert.equal(scripts.some(script => script.id === 'rp_card_studio_runtime_guard'), false);
  assert.equal(card.data?.extensions?.tavern_helper, undefined);
  assert.equal(card.data?.extensions?.regex_scripts, undefined);
});

test('Forge accepts the structured EJS source contract and emits executable CharacterBook entries', t => {
  const root = createProject(t, 'ejs');
  const characterId = addTestCharacter(root);
  updateProject(root, {
    features: { ejs: true },
    sources: { mvu: ['src/mvu/runtime.yaml'] },
  });
  write(root, 'src/mvu/runtime.yaml', ejsSource(characterId));

  const result = runForge(['build', root], { expectSuccess: true });
  const card = builtCard(root);
  const entries = characterBookEntries(card);
  assert.equal(result.report?.ok, true);
  const ejsEntry = entries.find(entry => entry.extensions?.rp_card_studio?.source_key === 'ejs:trust_gate:generate');
  assert.ok(ejsEntry);
  assert.ok(Number.isInteger(ejsEntry.id) && ejsEntry.id >= 0, `invalid CharacterBook id: ${ejsEntry.id}`);
  assert.match(ejsEntry.content, /getvar\("stat_data\.relationship\.trust",\s*\{\s*defaults:\s*10\s*\}\)/);
  assert.doesNotMatch(ejsEntry.content, /globalThis\.Mvu|waitGlobalInitialized\("Mvu"\)/);
  assert.equal(card.data?.extensions?.tavern_helper, undefined, 'EJS-only cards must not receive an MVU guard');
  assert.equal(card.data?.extensions?.regex_scripts, undefined, 'EJS-only cards must not receive MVU regex scripts');
});

test('Forge source locks the character pipeline order through Tavern Helper and SillyTavern regex adapters', () => {
  const source = readTextFile(forge, 'utf8');
  const pipelineStart = source.indexOf('async function loadProjectSource');
  const pipelineEnd = source.indexOf('async function readRegisteredSources', pipelineStart);
  assert.ok(pipelineStart >= 0 && pipelineEnd > pipelineStart, 'Forge loadProjectSource entrypoint is missing');
  const pipeline = source.slice(pipelineStart, pipelineEnd);
  const requiredCalls = [
    'applyAssemblyManifest',
    'applyMvuArtifacts',
    'applyEjsTemplates',
    'applyPreserved',
    'applyTavernHelperAdapter',
    'applySillyTavernRegexAdapter',
    'bindEmbeddedCharacterBook',
  ];
  const positions = requiredCalls.map(name => pipeline.indexOf(`${name}(`));

  assert.ok(positions.every(position => position >= 0), `Forge is missing a pipeline stage: ${JSON.stringify(positions)}`);
  assert.ok(
    positions.every((position, index) => index === 0 || position > positions[index - 1]),
    `Forge stage order is ${positions.map((position, index) => `${requiredCalls[index]}@${position}`).join(', ')}`,
  );
});
