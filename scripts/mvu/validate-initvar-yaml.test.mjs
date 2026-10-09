import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts', 'mvu', 'validate-initvar-yaml.py');
const base = path.join(root, 'assets', 'examples', 'wo-fei-wo-rp');
const cardPath = path.join(base, '导入包/我，非我.角色卡.json');
const worldbookPath = path.join(base, '导入包/我，非我.世界书.json');
const schemaPath = path.join(base, '制作文件/运行源码/MVU/schema.js');

function run(card, worldbook = worldbookPath) {
  const args = ['-X', 'utf8', script, '--card', card, '--zod-script', schemaPath, '--worldbook', worldbook, '--init-strategy', 'worldbook'];
  return spawnSync('python', args, { encoding: 'utf8' });
}

test('accepts the worldbook baseline used by the complete sample', () => {
  const result = run(cardPath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /worldbook/);
});

test('rejects a partial Greeting initvar that does not cover the sample Schema roots', () => {
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  card.data.alternate_greetings[0] = '<initvar>\n世界:\n  日期: 爆发初期\n</initvar>\n坏开场';
  const temp = path.join(os.tmpdir(), `rp-card-studio-bad-init-${process.pid}.json`);
  fs.writeFileSync(temp, JSON.stringify(card), 'utf8');
  try {
    const result = run(temp);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing roots/);
  } finally {
    fs.rmSync(temp, { force: true });
  }
});

test('accepts a disabled worldbook initvar baseline without forcing Greeting initvar', () => {
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  card.data.first_mes = '开场\n<StatusPlaceHolderImpl/>';
  card.data.alternate_greetings = [];
  const tempCard = path.join(os.tmpdir(), `rp-card-studio-worldbook-card-${process.pid}.json`);
  const tempBook = path.join(os.tmpdir(), `rp-card-studio-worldbook-${process.pid}.json`);
  const book = JSON.parse(fs.readFileSync(worldbookPath, 'utf8'));
  const baseline = Object.values(book.entries).find(entry => /\[initvar\]/i.test(entry.comment));
  fs.writeFileSync(tempCard, JSON.stringify(card), 'utf8');
  fs.writeFileSync(tempBook, JSON.stringify({ entries: { 0: { comment: '[initvar]样品基线', content: baseline.content, disable: true } } }), 'utf8');
  try {
    const result = run(tempCard, tempBook);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /worldbook/);
  } finally {
    fs.rmSync(tempCard, { force: true });
    fs.rmSync(tempBook, { force: true });
  }
});
