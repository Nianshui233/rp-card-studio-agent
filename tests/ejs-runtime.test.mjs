import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { validateNamedSchema } from '../scripts/forge/schema.mjs';
import { validateRuntimeSources } from '../scripts/rp-card-runtime.mjs';

const root = process.cwd();

function assembly() {
  return {
    status: 'locked',
    worldbook_manifest: { entries: [] },
    runtime_manifest: { mode: 'authored', regex_scripts: [], tavern_helper_scripts: [], extension_fields: {} },
  };
}

function ejsSource(overrides = {}) {
  return {
    schema_version: '1.0.0',
    status: 'locked',
    enabled: true,
    engine: 'st_prompt_template',
    host: { extension: 'ST-Prompt-Template', version: null, features_evidence: ['generate_before 已声明'] },
    execution: { phases: ['generate_before'], process_generation: true, process_render: false, process_raw_message: false, process_code_blocks: false },
    variable_scopes: ['local', 'cache'],
    templates: [{
      id: 'context_projection',
      file: 'src/runtime/ejs/context.ejs',
      source: { kind: 'file', file: 'src/runtime/ejs/context.ejs' },
      display_name: '生成前状态投影',
      phase: 'generate_before',
      input: 'worldbook',
      output: 'prompt',
      reads: ['variables.状态'],
      writes: [],
      side_effect: 'none',
      cache: 'none',
      decorators: ['@@generate_before'],
      invokes_entries: [],
      failure_fallback: '保留空提示并报告模板错误',
      runtime_evidence: [],
    }],
    decorators: ['@@generate_before'],
    injections: [],
    worldbook_calls: [],
    bridges: [],
    side_effects: { allow_variable_write: false, allow_raw_message_write: false, allow_prompt_injection: false, allow_worldbook_activation: false },
    diagnostics: { syntax_checked: true, runtime: 'not_run', failure_behavior: '保留原文' },
    dependencies: [],
    implementation_notes: [],
    source_refs: [],
    ...overrides,
  };
}

test('independent EJS template and schema are valid without MVU fields', async () => {
  const template = YAML.parse(await readFile(path.join(root, 'assets/templates/ejs.yaml'), 'utf8'));
  assert.deepEqual(validateNamedSchema('ejs', template), []);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'rp-ejs-only-'));
  try {
    await mkdir(path.join(projectRoot, 'src/runtime/ejs'), { recursive: true });
    await writeFile(path.join(projectRoot, 'src/runtime/ejs/context.ejs'), '<% if (variables.状态) { %>状态：<%- variables.状态 %><% } %>', 'utf8');
    const source = ejsSource();
    const validation = await validateRuntimeSources({
      project: { features: { mvu: false, ejs: true, status_ui: false } },
      sources: {
        assembly: [{ value: assembly() }],
        ejs: [{ relativePath: 'src/runtime/ejs.yaml', value: source }],
        mvu: [], prompts: [], world: [], characters: [], systems: [], scenes: [], ui: [], positioning: [],
      },
      projectRoot,
    });
    assert.deepEqual(validation.issues, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('EJS to MVU access requires an explicit bridge and does not create an MVU loader requirement', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'rp-ejs-bridge-'));
  try {
    await mkdir(path.join(projectRoot, 'src/runtime/ejs'), { recursive: true });
    await writeFile(path.join(projectRoot, 'src/runtime/ejs/context.ejs'), '<%- stat_data.关系.好感度 %>', 'utf8');
    const source = ejsSource({
      variable_scopes: ['mvu_stat_data_read'],
      templates: [{
        ...ejsSource().templates[0],
        source: { kind: 'file', file: 'src/runtime/ejs/context.ejs' },
        side_effect: 'mvu_read',
        reads: ['stat_data.关系.好感度'],
      }],
    });
    const baseSources = {
      assembly: [{ value: assembly() }],
      ejs: [{ relativePath: 'src/runtime/ejs.yaml', value: source }],
      mvu: [], prompts: [], world: [], characters: [], systems: [], scenes: [], ui: [], positioning: [],
    };
    const missing = await validateRuntimeSources({ project: { features: { mvu: false, ejs: true } }, sources: baseSources, projectRoot });
    assert.ok(missing.issues.some((entry) => entry.rule === 'ejs.mvu_bridge'));
    source.bridges = [{ from: 'ejs', to: 'mvu', access: 'read', path: 'stat_data.关系.好感度', source: 'current_message' }];
    const valid = await validateRuntimeSources({ project: { features: { mvu: false, ejs: true } }, sources: baseSources, projectRoot });
    assert.doesNotMatch(JSON.stringify(valid.issues), /mvu\.loader|mvu\.schema/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('inline worldbook EJS can consume a real entry and pair its output with a hide regex', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'rp-ejs-inline-worldbook-'));
  try {
    const inlineSource = ejsSource({
      templates: [{
        ...ejsSource().templates[0],
        source: { kind: 'worldbook_entry', entry_ref: 'relay_context' },
        side_effect: 'mvu_read',
        invokes_entries: ['relay_bulletin'],
      }],
      worldbook_calls: [{ method: 'getwi', entry: 'relay_bulletin', activation_contract: 'direct_content' }],
      output_markers: [{ open: '<霜线上下文>', close: '</霜线上下文>', prompt_visible: true, player_visible: false, consumer_regex: 'EJS上下文隐藏', producer_template: 'context_projection' }],
      bridges: [{ from: 'ejs', to: 'mvu', access: 'read', path: 'stat_data', source: 'current_message' }],
    });
    const validation = await validateRuntimeSources({
      project: { features: { mvu: false, ejs: true } },
      sources: {
        assembly: [{ value: {
          ...assembly(),
          worldbook_manifest: { entries: [
            { id: 'relay_context', display_name: '雨线动态上下文 EJS', enabled: true, activation: { mode: 'constant', primary_keys: [], secondary_keys: [], selective: false, logic: 'any', case_sensitive: false, match_whole_words: false }, insertion: { position: 'at_depth', order: 900, depth: 4, role: 'system' }, recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until_recursion: false }, probability: 100, scan_depth: null, content: '<霜线上下文><%= getvar(\'stat_data.天气\') %></霜线上下文>', source: { kind: 'inline', content: '<霜线上下文><%= getvar(\'stat_data.天气\') %></霜线上下文>' } },
            { id: 'relay_bulletin', display_name: '夜班简报', enabled: false, activation: { mode: 'manual', primary_keys: [], secondary_keys: [], selective: false, logic: 'any', case_sensitive: false, match_whole_words: false }, insertion: { position: 'at_depth', order: 910, depth: 4, role: 'system' }, recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until_recursion: false }, probability: 100, scan_depth: null, content: '简报内容', source: { kind: 'inline', content: '简报内容' } },
          ] },
          runtime_manifest: { mode: 'authored', regex_scripts: [{ id: '55555555-5555-4555-8555-555555555555', script_name: 'EJS上下文隐藏', find_regex: '/<霜线上下文>[\\s\\S]*?<\\/霜线上下文>/g', replace_string: '', placement: [2], disabled: false, markdown_only: true, prompt_only: false, run_on_edit: true, substitute_regex: 0, min_depth: null, max_depth: null }], tavern_helper_scripts: [], extension_fields: {} },
        } }],
        ejs: [{ relativePath: 'src/runtime/ejs.yaml', value: inlineSource }],
        mvu: [], prompts: [], world: [], characters: [], systems: [], scenes: [], ui: [], positioning: [],
      },
      projectRoot,
    });
    assert.deepEqual(validation.issues, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
