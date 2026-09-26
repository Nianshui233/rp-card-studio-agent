import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('default project layout separates creative sources, real configuration, and import artifacts', () => {
  const agent = read('AGENT.md');
  const integration = read('internal-skills/st-integration-qa/references/integration.md');
  for (const text of [agent, integration]) {
    assert.match(text, /创作源\//);
    assert.match(text, /配置\//);
    assert.match(text, /导入：项目名\//);
    assert.match(text, /角色卡\//);
    assert.match(text, /世界书\//);
    assert.match(text, /正则\//);
    assert.match(text, /酒馆助手脚本\//);
    assert.match(text, /原始HTML\//);
  }
});

test('process logs are not treated as normal project artifacts', () => {
  const agent = read('AGENT.md');
  const integration = read('internal-skills/st-integration-qa/references/integration.md');
  assert.match(agent, /不得要求[\s\S]*访谈记录[\s\S]*QA 日志/);
  assert.match(integration, /不创建“制作记录”“访谈记录”“阶段进度”“QA 日志”/);
  assert.match(agent, /只创建项目实际使用的子目录/);
});

test('canonical YAML stays in creative sources while import-ready files are grouped by component', () => {
  const agent = read('AGENT.md');
  assert.match(agent, /`创作源\/`：完整 canonical 世界观、角色、系统、场景 YAML/);
  assert.match(agent, /`世界书\/`：由 canonical YAML 无损切片生成/);
  assert.match(agent, /用户明确只要导入包时，可以只交付 `导入：项目名\/`/);
});
