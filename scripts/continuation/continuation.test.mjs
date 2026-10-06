import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initContinuation, renderProgressBoard, validateContinuation } from './continuation.mjs';

test('initializes and validates the RP continuation state bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-continuation-'));
  const report = initContinuation(root, { projectId: 'demo', title: '示例项目' });
  assert.equal(report.ok, true);
  assert.equal(validateContinuation(root).metadata.project_id, 'demo');
  assert.ok(fs.existsSync(path.join(root, '.rp-card', 'NEXT.md')));
});

test('rejects missing required continuation sections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-continuation-'));
  initContinuation(root, { projectId: 'demo', title: '示例项目' });
  const file = path.join(root, '.rp-card', 'NEXT.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## 下一道门', '## 已删除'), 'utf8');
  const report = validateContinuation(root);
  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /NEXT\.md 缺少区块：下一道门/);
});

test('renders a current-dialogue progress board from authority and NEXT', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-continuation-'));
  initContinuation(root, { projectId: 'demo', title: '示例项目' });
  const next = path.join(root, '.rp-card', 'NEXT.md');
  let text = fs.readFileSync(next, 'utf8');
  text = text.replace('## 已完成\n\n- 项目尚未开始。', '## 已完成\n\n- 世界观已完成。（创作源/世界.yaml）');
  text = text.replace('## 下一道门\n\n完成预检并写入第一批真实项目事实。', '## 下一道门\n\n完成默认 Greeting 的静态验证。');
  fs.writeFileSync(next, text, 'utf8');
  const board = renderProgressBoard(root);
  assert.match(board, /示例项目/);
  assert.match(board, /世界观已完成/);
  assert.match(board, /```text/);
  assert.match(board, /【RP 项目进度画板】/);
  assert.match(board, /默认 Greeting/);
  assert.doesNotMatch(board, /┌|└|│/);
});
