import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEntry } from './run-regex-fixtures.mjs';

const entry = (overrides = {}) => ({
  disabled: false, placement: [2], markdownOnly: true, promptOnly: false,
  runOnEdit: true, minDepth: null, maxDepth: null, substituteRegex: 0,
  trimStrings: [], findRegex: '/<tag>([\\s\\S]*?)<\\/tag>/g', replaceString: '$1',
  ...overrides,
});
const fixture = (overrides = {}) => ({ input: '<tag>secret-visible</tag>', placement: 2, depth: 0, channel: 'display', ...overrides });

test('matches SillyTavern trimStrings behavior on a captured match', () => {
  assert.equal(applyEntry(entry({ trimStrings: ['secret-'] }), fixture()), 'visible');
});

test('skips regexes on edits when runOnEdit is false', () => {
  assert.equal(applyEntry(entry({ runOnEdit: false }), fixture({ isEdit: true })), fixture().input);
});

test('treats negative maxDepth as the host unset sentinel', () => {
  assert.equal(applyEntry(entry({ maxDepth: -1 }), fixture()), 'secret-visible');
});

test('supports numeric and named capture replacement with the host-style match token', () => {
  assert.equal(applyEntry(entry({ findRegex: '/(?<kind>secret)-(visible)/', replaceString: '$<kind>:$1:$2:$0' }), fixture()), '<tag>secret:secret:visible:secret-visible</tag>');
  assert.equal(applyEntry(entry({ findRegex: '/secret-visible/', replaceString: 'matched' }), fixture()), '<tag>matched</tag>');
});

test('supports Tavern Regex {{match}} while refusing host-dependent macro modes', () => {
  assert.equal(applyEntry(entry({ replaceString: '[{{match}}]' }), fixture()), '[<tag>secret-visible</tag>]');
  assert.throws(() => applyEntry(entry({ substituteRegex: 1 }), fixture()), /host.*macro|macro.*host/i);
  assert.throws(() => applyEntry(entry({ replaceString: '{{char}}' }), fixture()), /host.*macro|macro.*host/i);
});
