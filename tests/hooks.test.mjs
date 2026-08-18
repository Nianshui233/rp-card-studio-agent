import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { createForgeHookRunner, FORGE_HOOK_EVENTS } from '../scripts/forge/hooks.mjs';

test('formal Forge hooks expose the five lifecycle events', async () => {
  assert.deepEqual(FORGE_HOOK_EVENTS, [
    'before_stage_write',
    'before_source_write',
    'before_build',
    'after_build',
    'after_delivery',
  ]);
  const manifest = YAML.parse(await readFile(path.join(process.cwd(), 'orchestrator', 'hooks.yaml'), 'utf8'));
  assert.equal(manifest.policy.creative_scope, 'unrestricted');
  assert.deepEqual(Object.keys(manifest.events), FORGE_HOOK_EVENTS);
});

test('stage and source hooks block only broken lifecycle or path boundaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rp-hooks-'));
  try {
    const runner = createForgeHookRunner({ projectRoot: root, now: () => '2026-08-18T00:00:00.000Z' });
    const trace = await runner.run('before_stage_write', {
      stage: 'worldbuilding',
      status: 'complete',
      summary: '世界观阶段总汇',
      plannedStages: ['positioning', 'worldbuilding'],
    });
    assert.equal(trace[0].status, 'pass');

    const handoffTrace = await runner.run('before_stage_write', {
      stage: 'worldbuilding',
      status: 'complete',
      summary: '世界观阶段总汇',
      plannedStages: ['positioning', 'worldbuilding'],
      project: { handoffs: [{ id: 'ui-state-gap', source_stage: 'worldbuilding', status: 'open' }] },
    });
    assert.equal(handoffTrace.find((entry) => entry.id === 'forge.stage.handoff').status, 'warn');

    await assert.rejects(
      runner.run('before_source_write', { writes: [{ path: path.join(root, '..', 'outside.yaml') }] }),
      /阻断了当前操作/,
    );
    assert.equal(runner.snapshot().at(-1).id, 'forge.source.boundary');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('build hooks detect digest mismatches while delivery hooks remain advisory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rp-hooks-'));
  const output = path.join(root, 'dist.json');
  try {
    const runner = createForgeHookRunner({ projectRoot: root });
    await assert.rejects(
      runner.run('after_build', {
        outputBuffer: Buffer.from('{}'),
        artifactDigest: 'actual',
        manifest: { artifact_digest: 'stale' },
      }),
      /阻断了当前操作/,
    );

    await assert.rejects(
      runner.run('after_build', {
        outputBuffer: Buffer.from('{}'),
        artifactDigest: 'actual',
        manifest: { artifact_digest: 'actual', delivery_mode: 'legacy_single_file', outputs: [] },
      }),
      /固定的多文件 RP 项目包交付模式/,
    );

    const valid = await runner.run('after_build', {
      outputBuffer: Buffer.from('{}'),
      artifactDigest: 'actual',
      manifest: {
        artifact_digest: 'actual',
        delivery_mode: 'rp_project_package',
        outputs: ['dist/00_导入说明.md', 'dist/01_项目清单.json', 'dist/08_验证报告.md'],
      },
    });
    assert.equal(valid.find((entry) => entry.id === 'forge.build.delivery_contract').status, 'pass');

    await runner.run('after_delivery', { outputPath: output, dryRun: false }, { enforce: false });
    assert.equal(runner.snapshot().findLast((entry) => entry.id === 'forge.delivery.exists').status, 'warn');
    await writeFile(output, '{}');
    await runner.run('after_delivery', { outputPath: output, dryRun: false }, { enforce: false });
    assert.equal(runner.snapshot().findLast((entry) => entry.id === 'forge.delivery.exists').status, 'pass');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
