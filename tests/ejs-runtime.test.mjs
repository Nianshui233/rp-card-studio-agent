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
