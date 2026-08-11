import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = path.join(skillRoot, 'scripts', 'build-forge.mjs');
const sourceEntrypoint = path.join(skillRoot, 'scripts', 'rp-card-forge.mjs');
const bundlePath = path.join(skillRoot, 'scripts', 'rp-card-forge.bundle.mjs');

test('checked-in Forge bundle is reproducible from repository source', () => {
  const result = spawnSync(process.execPath, [buildScript, '--check'], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /Forge bundle matches repository source/);
});

test('Forge bundle keeps the runtime module external', () => {
  const bundle = readFileSync(bundlePath, 'utf8');
  assert.match(bundle, /from ["']\.\/rp-card-runtime\.mjs["']/);
  assert.doesNotMatch(bundle, /(?:async\s+)?function\s+applyMvuArtifacts\s*\(/);
  assert.doesNotMatch(bundle, /(?:async\s+)?function\s+applyEjsTemplates\s*\(/);
});

test('modular Forge source runs directly after maintainer dependencies are installed', () => {
  const result = spawnSync(process.execPath, [sourceEntrypoint, 'doctor', '--json'], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, output);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.command, 'doctor');
});
