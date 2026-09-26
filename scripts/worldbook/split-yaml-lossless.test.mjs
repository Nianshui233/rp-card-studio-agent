import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLosslessWorldbook, splitYamlTextLosslessly } from './split-yaml-lossless.mjs';

const source = `项目名:\n  世界规则:\n    硬设定:\n      - 不可改写\n    例子: \"保留完整解释\"\n  角色档案:\n    姓名: \"林岚\"\n    行为规则:\n      - 触发: \"被拒绝\"\n        行动: \"先核对事实\"\n  场景:\n    名称: \"旧站台\"\n`;

test('splits nested YAML mapping blocks without rewriting content', () => {
  const sections = splitYamlTextLosslessly(source, { indent: 2 });
  assert.deepEqual(sections.map(item => item.key), ['世界规则', '角色档案', '场景']);
  assert.equal(sections.map(item => item.content).join(''), source);
  assert.match(sections[0].content, /^项目名:\n  世界规则:/);
  assert.match(sections[1].content, /行为规则:[\s\S]*先核对事实/);
});

test('builds a SillyTavern worldbook whose contents reconstruct the canonical YAML exactly', () => {
  const book = buildLosslessWorldbook(source, { indent: 2, startUid: 10 });
  const entries = Object.values(book.entries);
  assert.deepEqual(entries.map(entry => entry.uid), [10, 11, 12]);
  assert.deepEqual(entries.map(entry => entry.comment), ['世界规则', '角色档案', '场景']);
  assert.equal(entries.map(entry => entry.content).join(''), source);
  assert.match(entries[0].content, /例子: "保留完整解释"/);
});

test('rejects ambiguous indentation inputs instead of silently reserializing YAML', () => {
  assert.throws(() => splitYamlTextLosslessly('root:\n\tchild: 1\n', { indent: 2 }), /不能含 Tab/);
  assert.throws(() => splitYamlTextLosslessly('root:\n  child: 1\n', { indent: 6 }), /找不到/);
});
