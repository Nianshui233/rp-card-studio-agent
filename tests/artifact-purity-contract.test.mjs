import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('artifact purity treats the original card as semantic authority and samples as reference-only', () => {
  const contract = read('orchestrator/artifact-purity.md');
  const agent = read('AGENT.md');
  const opening = read('internal-skills/st-opening-frontend-authoring/SKILL.md');
  const message = read('internal-skills/st-message-frontend-authoring/SKILL.md');
  const materials = read('internal-skills/rp-materials-research/SKILL.md');
  for (const text of [contract, agent, opening, message, materials]) {
    assert.match(text, /原始卡/);
    assert.match(text, /reference_only/);
    assert.match(text, /样本/);
  }
  assert.match(contract, /来源审计/);
  assert.match(contract, /状态来源审计/);
  assert.match(opening, /不是通用表单生成器/);
  assert.match(opening, /不得直接复制字段/);
  assert.match(message, /不能直接决定本项目展示哪些/);
  assert.match(materials, /authoritative_source/);
  assert.match(materials, /reference_only/);
});

test('frontend runtime contract accepts a real MVU stat_data snapshot without schema object coupling', () => {
  const contract = read('orchestrator/artifact-purity.md');
  const message = read('internal-skills/st-message-frontend-authoring/SKILL.md');
  assert.match(contract, /`stat_data` 是前端渲染所需的状态载荷/);
  assert.match(contract, /schema.*对象或字符串/);
  assert.match(message, /schema.*对象或字符串/);
  assert.match(message, /schema.*字符串/);
});

test('state writes require evidence and cannot be inferred from a copied form field', () => {
  const contract = read('orchestrator/artifact-purity.md');
  const mvu = read('internal-skills/st-mvu-authoring/SKILL.md');
  assert.match(contract, /Agent 推测不得直接落库/);
  assert.match(mvu, /当前目标/);
  assert.match(mvu, /用户明确声明/);
  assert.match(mvu, /样本默认值/);
});


test('iframe frontends treat the host canvas separately from the content surface', () => {
  const contract = read('orchestrator/artifact-purity.md');
  const agent = read('AGENT.md');
  const opening = read('internal-skills/st-opening-frontend-authoring/SKILL.md');
  const message = read('internal-skills/st-message-frontend-authoring/SKILL.md');
  for (const text of [contract, agent, opening, message]) {
    assert.match(text, /宿主消息背景/);
    assert.match(text, /透明/);
    assert.match(text, /黑边/);
    assert.match(text, /模拟父页面|模拟父容器/);
  }
});
