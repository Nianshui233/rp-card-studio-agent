// DSH 适配层合同测试：`node --test .dsh`
//
// 只断言生成物的结构与可移植性，不重复 dsh 自身的加载行为（那是 verify.mjs 的活）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  BUNDLE_NAME,
  DEFAULT_OUT,
  PRESET_ID,
  REPO_ROOT,
  SKILL_DIR_NAME,
  dshAnchorCandidates,
  escapeMacros,
  renderPreset,
  toPosix,
} from './build.mjs';

const rendered = renderPreset({});

function yamlModule() {
  for (const anchor of dshAnchorCandidates()) {
    try {
      return createRequire(anchor)('yaml');
    } catch {
      // 下一个锚点
    }
  }
  return undefined;
}

function runScript(script, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, '.dsh', script), ...args], { encoding: 'utf8' });
}

test('生成清单是可解析的 patch 数组，且只含本 preset 一行', () => {
  const yaml = yamlModule();
  assert.ok(yaml, '应能从 dsh 安装处解析到 yaml 模块');
  const doc = yaml.parseDocument(rendered.patch, { customTags: [{ tag: '!!js', resolve: (value) => value }] });
  assert.equal(doc.errors.length, 0, `清单不应有 YAML 错误：${doc.errors.map((error) => error.message).join('; ')}`);
  const rows = doc.toJS();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].insert.length, 1);
  assert.equal(rows[0].insert[0].config.id, PRESET_ID);
  assert.equal(rows[0].insert[0].name, '@deepseek-ai/dsh-agent-preset');
});

test('preset 覆盖 persona、技能根目录与关键工具', () => {
  const yaml = yamlModule();
  const config = yaml
    .parseDocument(rendered.patch, { customTags: [{ tag: '!!js', resolve: (value) => value }] })
    .toJS()[0].insert[0].config;
  const ids = config.plugins.map((row) => row.id);
  for (const required of [
    'persona',
    'agent-instructions',
    'skill-filesystem',
    'tool-skill',
    'tool-fs',
    'tool-fs-search',
    'tool-web',
    'tool-ask-user',
    'tool-todo',
    'planning',
    'compaction',
    'delegation',
  ]) {
    assert.ok(ids.includes(required), `缺少插件行 ${required}`);
  }
  const personaRow = config.plugins.find((row) => row.id === 'persona');
  assert.equal(personaRow.config.prefix.slice(0, '# 运行环境（DeepSeek Harness）'.length), '# 运行环境（DeepSeek Harness）');
  const skillRow = config.plugins.find((row) => row.id === 'skill-filesystem');
  // 解析器已把 `!!js` 解析成表达式字符串，这里断言表达式本身。
  assert.deepEqual(skillRow.config.customSkillDirs, [
    "dshHomePath('workspace', 'rp-card-studio-agent', 'internal-skills')",
    "dshHomePath('presets', 'rp-card-studio', 'skills')",
  ]);
});

test('persona 是 DSH 前言 + AGENT.md 全文，且未超出上下文预算', () => {
  const agent = fs.readFileSync(path.join(REPO_ROOT, 'AGENT.md'), 'utf8').replace(/\r\n?/g, '\n');
  assert.ok(rendered.persona.includes('# 运行环境（DeepSeek Harness）'));
  assert.ok(rendered.persona.includes('契约根目录'));
  const body = rendered.persona.slice(rendered.persona.indexOf('---') + 3);
  // 零宽空格是刻意的转义，比对前去掉它。
  assert.equal(body.replaceAll('\u200B', '').trim(), agent.replace(/\t/g, '  ').trim());
  assert.ok(Buffer.byteLength(rendered.persona, 'utf8') < 65536);
});

test('SillyTavern 宏被逐处转义且没有残留双花括号', () => {
  assert.equal(rendered.residual, 0);
  assert.ok(rendered.patched.length >= 5);
  const personaRow = rendered.patch.slice(rendered.patch.indexOf('prefix: |-'));
  assert.ok(personaRow.includes('{​{user}​}'));
  assert.ok(!personaRow.includes('{{'));
});

test('每种花括号都被补齐，不产生孤立定界符', () => {
  const count = (text, token) => text.split(token).length - 1;
  for (const token of ['{​{', '}​}', '{{', '}}']) {
    // 转义后 `}}` 与 `{{` 应为 0；非零即说明模板或正文里混进了未转义分组。
    if (token === '{{' || token === '}}') assert.equal(count(rendered.patch, token), 0, `残留 ${token}`);
  }
  assert.ok(count(rendered.patch, '{​{') > 0);
});

test('清单不写死机器路径，路径一律交给 dshHomePath 在加载时解析', () => {
  assert.ok(!/[A-Za-z]:[\\/]/.test(rendered.patch));
  assert.ok(!rendered.patch.includes('Administrator'));
});

test('入口技能覆盖阶段表、续接脚本与验收口径', () => {
  const skill = rendered.workflowSkill;
  assert.ok(skill.startsWith('---\nname: rp-card-studio-workflow'));
  assert.ok(skill.includes(`| \`${rendered.routing.stages[0].name}\` |`));
  for (const stage of rendered.routing.stages) {
    assert.ok(skill.includes(`| \`${stage.name}\` |`), `阶段表缺少 ${stage.name}`);
    assert.ok(skill.includes(`\`${stage.name}\``));
  }
  for (const name of rendered.routing.skillPaths) {
    assert.ok(skill.includes(`\`${name}\``), `技能清单缺少 ${name}`);
  }
  for (const token of ['continuation.mjs init', 'validate-materials.mjs', 'stage-authorization.md', 'runtime: not_run', toPosix(REPO_ROOT)]) {
    assert.ok(skill.includes(token), `入口技能缺少 ${token}`);
  }
  assert.equal(rendered.routing.stages.length, 16);
  assert.equal(rendered.routing.skillPaths.length, 19);
});

test('阶段表里的技能名与仓库 internal-skills 目录一致', () => {
  const dirs = fs
    .readdirSync(path.join(REPO_ROOT, 'internal-skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const declared = [...rendered.routing.skillPaths].sort();
  assert.deepEqual(declared, dirs);
  assert.match(rendered.routing.schemaVersion, /^\d+\.\d+\.\d+$/);
});

test('重复安装不产生重复条目：注册结果对同一 profile 是幂等的', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-card-adapter-'));
  const manifest = path.join(tmp, 'package.json');
  const base = {
    name: 'dsh-profile-probe',
    dependencies: { 'some-dep': '1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  };
  fs.writeFileSync(manifest, `${JSON.stringify(base, null, 2)}\n`, 'utf8');
  // 用同一个 out 连续注册两次：第二次必须识别为已登记，不再追加。
  const first = runScript('install.mjs', ['--dry-run', '--out', DEFAULT_OUT]);
  const second = runScript('install.mjs', ['--dry-run', '--out', DEFAULT_OUT]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const firstReport = JSON.parse(first.stdout);
  const secondReport = JSON.parse(second.stdout);
  const read = (report) => report.steps.find((step) => step.step === 'register-profile-bundle');
  assert.equal(read(secondReport).dependency.result, 'already-linked');
  assert.equal(read(secondReport).bundles.result, 'already-registered');
  assert.equal(read(secondReport).written, false);
  // dry-run 绝不动真实 profile：清单内容必须与注册前完全一致。
  const probe = JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'profiles', 'web', 'package.json'), 'utf8'));
  assert.equal(new Set(probe.dsh.profile.bundles).size, probe.dsh.profile.bundles.length);
  assert.equal(probe.dsh.profile.bundles.filter((name) => name === BUNDLE_NAME).length, 1);
  assert.equal(read(firstReport).dependency.value, read(secondReport).dependency.value);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('build / install / verify 三个入口都能以 --check 或 --dry-run 无副作用运行', () => {
  const check = runScript('build.mjs', ['--check', '--report', path.join(os.tmpdir(), 'rp-card-build-check.json')]);
  assert.equal(check.status, 0, check.stderr);
  const install = runScript('install.mjs', ['--dry-run', '--out', DEFAULT_OUT]);
  assert.equal(install.status, 0, install.stderr);
  const installReport = JSON.parse(install.stdout);
  assert.equal(installReport.dryRun, true);
  assert.equal(installReport.out, fs.realpathSync.native(DEFAULT_OUT));
  assert.ok(installReport.steps.some((step) => step.step === 'build'));
  const verify = runScript('verify.mjs', ['--offline']);
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).conclusion, 'structural-only');
  assert.equal(JSON.parse(verify.stdout).failed.length, 0);
});

test('生成的 package.json 声明 dsh.bundle.patch，且只把仓库路径放在 generated 元数据里', () => {
  assert.equal(rendered.pkg.name, BUNDLE_NAME);
  assert.equal(rendered.pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(rendered.pkg.generated.by, '.dsh/build.mjs');
  // generated 只是构建溯源，不参与加载；真正进 dsh 的字段里不允许出现绝对路径。
  const loaded = { ...rendered.pkg };
  delete loaded.generated;
  assert.ok(!/[A-Za-z]:[\\/]/.test(JSON.stringify(loaded)));
});

test('escapeMacros 只拆花括号对，不改变可见文字', () => {
  const { text, patched, residual } = escapeMacros('a {{user}} b {{char}} c');
  assert.equal(text.replaceAll('\u200B', ''), 'a {{user}} b {{char}} c');
  assert.deepEqual(patched, ['user', 'char']);
  assert.equal(residual, 0);
  // 嵌套写法只会被拆掉最内层的一对，剩下的仍是未转义分组，必须如实报告。
  assert.equal(escapeMacros('{{{{double}}}}').residual, 1);
});

test('入口技能文件名与技能目录名一致', () => {
  assert.equal(SKILL_DIR_NAME, 'rp-card-studio-workflow');
  assert.ok(rendered.workflowSkill.includes(`name: ${SKILL_DIR_NAME}`));
});
