// doctor.mjs 的合同测试：只测不依赖运行实例的部分（--offline），保证 CLI 契约稳定。
//
//   node --test ".dsh/*.test.mjs"
//
// 运行中实例的检查（DPAPI 解密、/api/agentPresets/list）不适合放进单元测试，
// 由 `node .dsh/doctor.mjs` 在真实机器上验证。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DOCTOR = path.join(import.meta.dirname, 'doctor.mjs');

test('doctor --offline --json 输出结构化 checks，缺 profile 时只 warn 不 error', (t) => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-card-doctor-'));
  t.after(() => {
    assert.equal(fs.realpathSync(path.dirname(dshHome)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dshHome).startsWith('rp-card-doctor-'));
    fs.rmSync(dshHome, { recursive: true, force: true });
  });
  const profileDir = path.join(dshHome, 'profiles', 'probe');
  const result = spawnSync(process.execPath, [DOCTOR, '--offline', '--json', '--profile', 'probe'], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, DSH_HOME: dshHome, DSH_PROFILE: 'probe', DSH_PROFILE_DIR: profileDir },
  });
  const report = JSON.parse(result.stdout);
  assert.equal(report.offline, true);
  assert.equal(report.profile, 'probe');
  assert.ok(Array.isArray(report.checks) && report.checks.length > 0);
  const ids = report.checks.map((check) => check.id);
  for (const required of ['repo', 'build', 'profile', 'compat', 'dump', 'runtime']) {
    assert.ok(ids.includes(required), `缺少检查段 ${required}（当前：${ids.join(',')}）`);
  }
  const skipped = report.checks.filter((check) => check.status === 'skip').map((check) => check.id);
  assert.deepEqual(skipped.sort(), ['dump', 'runtime']);
  // 隔离环境里 profile 不存在只应是 warn（提示用 --profile / install.mjs），不能误判为 error。
  const profile = report.checks.find((check) => check.id === 'profile');
  assert.equal(profile.status, 'warn');
  assert.equal(report.counts.error, 0, JSON.stringify(report.checks.filter((check) => check.status === 'error')));
  assert.equal(report.conclusion, 'healthy');
  assert.equal(result.status, 0);
});

test('doctor 拒绝在参数不完整时静默通过：--report 写出的 JSON 与 stdout 一致', (t) => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-card-doctor-'));
  const reportFile = path.join(dshHome, 'out', 'doctor.json');
  t.after(() => {
    assert.equal(fs.realpathSync(path.dirname(dshHome)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dshHome).startsWith('rp-card-doctor-'));
    fs.rmSync(dshHome, { recursive: true, force: true });
  });
  const result = spawnSync(process.execPath, [DOCTOR, '--offline', '--json', '--report', reportFile], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, DSH_HOME: dshHome, DSH_PROFILE: 'probe', DSH_PROFILE_DIR: path.join(dshHome, 'profiles', 'probe') },
  });
  assert.ok(fs.existsSync(reportFile));
  const written = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const printed = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(written).sort(), Object.keys(printed).sort());
  assert.equal(written.conclusion, printed.conclusion);
});
