import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEjsPackage } from './validate-ejs-package.mjs';

const sharedContract = {
  enabled: true,
  mode: 'worldbook_template',
  bridge_mode: 'shared_message_variables',
  direction: 'mvu_to_ejs_readonly',
  snapshot: 'current message variables after MVU update; no latest fallback for writes',
  failure: 'return an empty static section and keep the rest of the prompt',
};

test('accepts a worldbook EJS controller that reads MVU through message variables', () => {
  const report = validateEjsPackage({
    ejsContract: sharedContract,
    worldbook: { entries: {
      1: { comment: '动态内容总控', content: `@@preprocessing\n<%\nconst area = getvar('stat_data.世界.地点', { defaults: '' });\nconst city = await getwi('城市_' + getvar('stat_data.世界.城市', { defaults: '' }));\n%>\n<%- city %>` },
      2: { comment: '静态设定', content: '普通世界书内容' },
    } },
  });
  assert.equal(report.ok, true, report.issues.join('\n'));
  assert.equal(report.results[0].bridge, 'shared_message_variables');
});

test('rejects EJS that silently writes MVU state', () => {
  const report = validateEjsPackage({
    ejsContract: { ...sharedContract },
    templates: [{ name: 'bad', content: `<% setvar('stat_data.世界.时间', '10:00'); %>` }],
  });
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /直接写入 MVU/);
});

test('requires an explicit bridge contract when EJS reads stat_data', () => {
  const report = validateEjsPackage({
    ejsContract: { enabled: true, mode: 'worldbook_template', failure: 'static fallback' },
    templates: [{ name: 'needs-bridge', content: `<% const x = getvar('stat_data.世界.时间'); %>` }],
  });
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /bridge_mode/);
});

test('rejects EJS mixed with MVU output protocol', () => {
  const report = validateEjsPackage({
    ejsContract: { enabled: true, mode: 'worldbook_template', failure: 'static fallback' },
    templates: [{ name: 'mixed', content: `<%_ %><UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable><%_ %>` }],
  });
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /混入 MVU/);
});
