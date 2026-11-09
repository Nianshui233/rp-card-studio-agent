// 兼容性探针的合同测试：`node --test .dsh`
//
// 这些测试锁定 compat.mjs 最难被人工发现的行为：子路径解析、配置键存在性、
// 模板占位符解析，以及"坏行必须被报成 error"——正是这些让 0.2.2 的
// broken preset 在升级当天就被定位出来。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkRows,
  exportsAllowsSubpath,
  findDshInstall,
  flattenPresetRows,
  readTemplateRows,
  runCompatibility,
  splitSpecifier,
} from './compat.mjs';

const dsh = findDshInstall();

test('splitSpecifier 区分包根与子路径（含 scoped 包）', () => {
  assert.deepEqual(splitSpecifier('@deepseek-ai/dsh-tool-web'), { name: '@deepseek-ai/dsh-tool-web', subpath: '.' });
  assert.deepEqual(splitSpecifier('@deepseek-ai/dsh-tool-subagent-control/list-agents'), {
    name: '@deepseek-ai/dsh-tool-subagent-control',
    subpath: './list-agents',
  });
  assert.deepEqual(splitSpecifier('yaml'), { name: 'yaml', subpath: '.' });
});

test('exportsAllowsSubpath 只接受真正导出的键与通配键', () => {
  const onlyRoot = { exports: { '.': './lib/index.js', './package.json': './package.json' } };
  assert.equal(exportsAllowsSubpath(onlyRoot, '.').ok, true);
  assert.equal(exportsAllowsSubpath(onlyRoot, './list-agents').ok, false);
  assert.equal(exportsAllowsSubpath(onlyRoot, './package.json').ok, true);

  const wildcard = { exports: { '.': './lib/index.js', './src/*': './src/*' } };
  assert.equal(exportsAllowsSubpath(wildcard, './src/foo.js').ok, true);
  assert.equal(exportsAllowsSubpath(wildcard, './lib/foo.js').ok, false);

  // 条件导出对象（只有 types/import/default）等价于主入口，不存在子路径。
  const conditional = { exports: { types: './a.d.ts', default: './a.js' } };
  assert.equal(exportsAllowsSubpath(conditional, '.').ok, true);
  assert.equal(exportsAllowsSubpath(conditional, './x').ok, false);

  // 没有 exports 字段的老包：按"有主入口、无受限子路径"处理。
  assert.equal(exportsAllowsSubpath({}, '.').ok, true);
});

test('flattenPresetRows 摊平组并继承 disabled', () => {
  const rows = flattenPresetRows([
    { id: 'a', name: 'pkg-a' },
    { id: 'g', name: 'cordis:group', group: true, config: [{ id: 'b', name: 'pkg-b', config: { x: 1 } }] },
    { id: 'c', name: 'pkg-c', disabled: true },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['a', 'b', 'c']);
  assert.equal(rows[1].config.x, 1);
  assert.equal(rows[2].disabled, true);
});

test('readTemplateRows 能解析含 __PERSONA__ 占位符的模板', () => {
  // 模板源文件里 __PERSONA__ 顶格书写；若 compat 忘了按块标量缩进，这里会拿到 template-invalid。
  const template = readTemplateRows();
  assert.equal(template.error, undefined, JSON.stringify(template));
  assert.equal(template.presetId, 'rp-card-studio');
  assert.equal(template.rows.length, 27);
});

test('本仓库模板对已安装的 dsh 无兼容性错误', { skip: dsh === undefined ? '本机未安装 dsh，跳过' : false }, () => {
  const report = runCompatibility({});
  const errors = report.findings.filter((finding) => finding.severity === 'error');
  assert.equal(errors.length, 0, errors.map((finding) => `${finding.code}: ${finding.message}`).join('\n'));
  assert.equal(report.ok, true);
  assert.ok(report.rows > 0);
  assert.ok(report.standard !== null, '应能找到内置 standard preset 做对照');
});

function tempTemplate(t, pluginsYaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-card-compat-'));
  t.after(() => {
    assert.equal(fs.realpathSync(path.dirname(dir)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('rp-card-compat-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, 'preset.template.yml');
  fs.writeFileSync(
    file,
    [
      '- insert:',
      '    - id: preset-rp-card-studio',
      "      name: '@deepseek-ai/dsh-agent-preset'",
      '      config:',
      '        id: rp-card-studio',
      '        plugins:',
      pluginsYaml,
      '',
    ].join('\n'),
    'utf8',
  );
  return file;
}

test('未导出的子路径被报成 error（0.2.2 的 list-agents 回归）', { skip: dsh === undefined ? '本机未安装 dsh，跳过' : false }, (t) => {
  const file = tempTemplate(
    t,
    ["          - id: bogus", "            name: '@deepseek-ai/dsh-tool-web/list-agents'"].join('\n'),
  );
  const report = runCompatibility({ templateFile: file });
  assert.equal(report.ok, false);
  const finding = report.findings.find((entry) => entry.code === 'specifier-not-exported');
  assert.ok(finding, report.findings.map((entry) => entry.code).join(','));
  assert.equal(finding.severity, 'error');
  assert.equal(finding.rowId, 'bogus');
});

test('源码里不存在的 config 键被报成 warn（modelSelectionSettings 回归）', { skip: dsh === undefined ? '本机未安装 dsh，跳过' : false }, (t) => {
  const file = tempTemplate(
    t,
    [
      '          - id: tool-subagent',
      "            name: '@deepseek-ai/dsh-tool-subagent'",
      '            config:',
      '              provider: spawn',
      '              modelSelectionSettings: true',
    ].join('\n'),
  );
  const report = runCompatibility({ templateFile: file });
  const finding = report.findings.find((entry) => entry.code === 'config-key-unknown');
  assert.ok(finding, report.findings.map((entry) => entry.code).join(','));
  assert.equal(finding.severity, 'warn');
  assert.match(finding.hint ?? '', /modelSelection/);
});

test('checkRows 把已禁用行的问题降级为 warn，不阻塞 verify', { skip: dsh === undefined ? '本机未安装 dsh，跳过' : false }, () => {
  const findings = checkRows(
    [
      { id: 'off', spec: '@deepseek-ai/dsh-tool-web/list-agents', config: {}, disabled: true, conditional: false },
    ],
    { searchDirs: [dsh.root] },
  );
  assert.equal(findings[0].code, 'specifier-not-exported');
  assert.equal(findings[0].severity, 'warn');
});
