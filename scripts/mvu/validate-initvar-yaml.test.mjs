import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts', 'mvu', 'validate-initvar-yaml.py');
const cardPath = path.join(root, 'assets', 'examples', 'mvu-zod-rp', '灰港避难所.json');
const schemaPath = path.join(root, 'assets', 'examples', 'mvu-zod-rp', 'schema.js');

function run(card) {
  return spawnSync('python', ['-X', 'utf8', script, '--card', card, '--zod-script', schemaPath], { encoding: 'utf8' });
}

test('accepts every playable Greeting in the complete MVU_ZOD example', () => {
  const result = run(cardPath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /2 playable greetings/);
});

test('rejects a Greeting with invalid or incomplete initvar YAML', () => {
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  card.data.alternate_greetings[0] = '<initvar>\n世界:\n  时间: [broken\n</initvar>\n坏开场';
  const temp = path.join(os.tmpdir(), `rp-card-studio-bad-init-${process.pid}.json`);
  fs.writeFileSync(temp, JSON.stringify(card), 'utf8');
  try {
    const result = run(temp);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid YAML|missing roots/);
  } finally {
    fs.rmSync(temp, { force: true });
  }
});
