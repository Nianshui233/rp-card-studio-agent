import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegexDocument } from './validate-tavern-regex.mjs';

const entry = (overrides = {}) => ({
  id: 'test-id', scriptName: 'test', findRegex: '/x/g', replaceString: 'y',
  placement: [2], trimStrings: [], disabled: false, markdownOnly: true,
  promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
  ...overrides,
});

test('rejects placement values that the SillyTavern host never dispatches', () => {
  for (const placement of [4, 99, -1]) {
    const report = validateRegexDocument([entry({ placement: [placement] })]);
    assert.equal(report.ok, false, `placement ${placement} must be rejected`);
    assert.match(report.results[0].issues.map(issue => issue.message).join(' '), /placement/);
  }
});

test('accepts current host placements and warns on deprecated display placement', () => {
  for (const placement of [1, 2, 3, 5, 6]) {
    assert.equal(validateRegexDocument([entry({ placement: [placement] })]).ok, true);
  }
  const legacy = validateRegexDocument([entry({ placement: [0] })]);
  assert.equal(legacy.ok, true);
  assert.match(legacy.results[0].warnings.map(warning => warning.message).join(' '), /已弃用/);
});


test('rejects depth values that the host silently ignores', () => {
  for (const [field, value] of [['minDepth', -2], ['maxDepth', -2]]) {
    const report = validateRegexDocument([entry({ [field]: value })]);
    assert.equal(report.ok, false, `${field} ${value} must be rejected`);
  }
  assert.equal(validateRegexDocument([entry({ minDepth: -1, maxDepth: -1 })]).ok, true);
});


test('reports malformed entries instead of throwing while validating the whole document', () => {
  const report = validateRegexDocument([null, 'not-an-entry']);
  assert.equal(report.ok, false);
  assert.equal(report.results.length, 2);
  assert(report.results.every(result => result.issues.length > 0));
});
