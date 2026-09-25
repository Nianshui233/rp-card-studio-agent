import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRolecardPackage } from './validate-rolecard-package.mjs';

const regexEntry = (overrides = {}) => ({
  id: 'regex-1', scriptName: 'test', findRegex: '/<x>/g', replaceString: '',
  placement: [2], trimStrings: [], disabled: false, markdownOnly: true,
  promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
  ...overrides,
});
const packageInput = () => ({
  cardPath: 'card.json',
  card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { world: 'book' }, character_book: null } },
  worldbookPath: 'book.json',
  worldbook: { entries: { a: { uid: 1, comment: 'entry', content: 'content' } } },
});

test('accepts a structurally consistent card-to-worldbook package', () => {
  const report = validateRolecardPackage(packageInput());
  assert.equal(report.ok, true, JSON.stringify(report.issues));
});

test('rejects a card worldbook binding that does not match the delivered filename', () => {
  const input = packageInput();
  input.worldbookPath = 'other-book.json';
  input.worldbookName = 'other-book';
  const report = validateRolecardPackage(input);
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /world|世界书/i);
});

test('rejects regex placements unknown to SillyTavern', () => {
  const report = validateRolecardPackage({ ...packageInput(), regex: [regexEntry({ placement: [99] })] });
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /placement/);
});


test('rejects drift between embedded and separately delivered Regex', () => {
  const input = packageInput();
  input.card.data.extensions.regex_scripts = [regexEntry()];
  input.regex = [regexEntry({ replaceString: 'drifted' })];
  input.regexMode = 'alternative';
  const report = validateRolecardPackage(input);
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /alternative|不同步|不一致/);
});

test('warns when identical embedded and external Regex are alternatives, not two imports', () => {
  const entry = regexEntry();
  const input = packageInput();
  input.card.data.extensions.regex_scripts = [entry];
  input.regex = [entry];
  const report = validateRolecardPackage(input);
  assert.equal(report.ok, true);
  assert.match(report.warnings.join(' '), /二选一/);
});

test('rejects duplicate Tavern Helper ScriptFolder IDs and multiple MVU loaders', () => {
  const script = { type: 'script', id: 'same-id', name: 'Loader A', content: "import 'https://cdn.invalid/MagVarUpdate@1234567890123456789012345678901234567890/artifact/bundle.js';" };
  const folder = { type: 'folder', id: 'folder-id', name: 'scripts', scripts: [script, { ...script, name: 'Loader B' }] };
  const report = validateRolecardPackage({ ...packageInput(), scriptFolder: folder });
  assert.equal(report.ok, false);
  assert.match(report.issues.join(' '), /重复脚本 ID/);
  assert.match(report.issues.join(' '), /Loader/);
});


test('allows a separate additional Regex with a different ID beside card-scoped Regex', () => {
  const input = packageInput();
  input.card.data.extensions.regex_scripts = [regexEntry()];
  input.regex = [regexEntry({ id: 'global-regex-2', scriptName: 'additional' })];
  const report = validateRolecardPackage(input);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
});


test('accepts a stable custom SillyTavern worldbook name when explicitly confirmed', () => {
  const input = packageInput();
  input.worldbookPath = 'W-我当系统？世界书.json';
  input.worldbookName = 'book';
  const report = validateRolecardPackage(input);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
});
