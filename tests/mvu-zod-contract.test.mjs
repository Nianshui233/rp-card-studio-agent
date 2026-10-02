import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

test('MVU_ZOD is a complete route, not a downgradable optional schema add-on', () => {
  const agent = read('AGENT.md');
  const skill = read('internal-skills/st-mvu-authoring/SKILL.md');
  const ref = read('internal-skills/st-mvu-authoring/references/mvu-zod.md');
  assert.match(agent, /不得静默降级为 native/);
  assert.match(skill, /不能把错误实现改名为“轻量版”/);
  assert.match(ref, /不可拆散的完整制品/);
  for (const token of ['Zod Schema', '变量更新规则', '变量路径索引', '变量输出格式', 'Regex', '真实消费者']) assert.match(ref, new RegExp(token));
});

test('MVU_ZOD templates cover schema, runtime contract, update rules, paths, and one output dialect', () => {
  for (const file of ['mvu-zod.schema.js', 'mvu-runtime-contract.yaml', 'mvu-update-rules.yaml', 'mvu-variable-index.md', 'mvu-output-format.yaml', 'ejs-runtime-contract.yaml', 'mvu-ejs-bridge.yaml']) assert(exists(path.join('assets', 'templates', file)), `missing ${file}`);
  assert.match(read('assets/templates/mvu-zod.schema.js'), /registerMvuSchema\(Schema\)/);
  assert.match(read('assets/templates/mvu-update-rules.yaml'), /Record[\s\S]*Array/);
  assert.match(read('assets/templates/mvu-variable-index.md'), /format_message_variable::stat_data/);
  assert.match(read('assets/templates/mvu-output-format.yaml'), /<JSONPatch>/);
});

test('the repository carries an authoritative complete MVU_ZOD example', () => {
  const base = path.join('assets', 'examples', 'mvu-zod-rp');
  for (const file of ['灰港避难所.json', '灰港避难所世界书.json', '运行脚本.folder.json', 'schema.js', 'MVU运行合同.yaml', 'regex.json', 'regex.fixtures.json', '状态栏.html', 'README.md']) assert(exists(path.join(base, file)), `missing ${file}`);
  const card = JSON.parse(read(path.join(base, '灰港避难所.json')));
  assert.equal(Boolean(card.data.character_book), false, 'MVU_ZOD 样品必须使用独立世界书路线');
  const contract = read(path.join(base, 'MVU运行合同.yaml'));
  assert.match(contract, /mode: mvu_zod/);
  assert.match(contract, /init_strategy: greeting/);
  assert.match(contract, /update_dialect: json_patch/);
  const book = JSON.parse(read(path.join(base, '灰港避难所世界书.json')));
  const comments = Object.values(book.entries).map(entry => entry.comment);
  for (const comment of ['[mvu_update]变量更新规则', '变量列表', '[mvu_update]变量输出格式']) assert(comments.includes(comment));
});


test('the repository carries an MVU_ZOD plus EJS shared-message bridge sample', () => {
  const base = path.join('assets', 'examples', 'mvu-ejs-rp');
  for (const file of ['灰港避难所.json', '灰港避难所世界书.json', '运行脚本.folder.json', 'schema.js', 'MVU运行合同.yaml', 'EJS运行合同.yaml', 'regex.json', 'regex.fixtures.json', 'README.md']) assert(exists(path.join(base, file)), `missing ${file}`);
  const ejs = read(path.join(base, 'EJS运行合同.yaml'));
  assert.match(ejs, /bridge_mode: shared_message_variables/);
  const mvu = read(path.join(base, 'MVU运行合同.yaml'));
  assert.match(mvu, /init_strategy: worldbook/);
  const card = JSON.parse(read(path.join(base, '灰港避难所.json')));
  assert.equal(Boolean(card.data.character_book), false, 'EJS 样品必须使用独立世界书路线');
  assert.doesNotMatch(card.data.first_mes, /<initvar>/i);
  const book = JSON.parse(read(path.join(base, '灰港避难所世界书.json')));
  const dynamic = Object.values(book.entries).find(entry => entry.comment === '动态内容总控');
  assert(dynamic);
  assert.match(dynamic.content, /getvar\(['"]stat_data\./);
  assert.match(dynamic.content, /await getwi/);
  assert.doesNotMatch(dynamic.content, /replaceMvuData|registerMvuSchema|<UpdateVariable>/i);
});

test('technical MVU Regex stays display-only and does not persist on edit', () => {
  for (const dir of ['mvu-zod-rp', 'mvu-ejs-rp', 'mvu-ejs-bridge-rp', 'full-mvu-rp']) {
    const file = path.join('assets', 'examples', dir, 'regex.json');
    const rules = JSON.parse(read(file));
    for (const rule of rules) {
      const text = `${rule.findRegex || ''}
${rule.replaceString || ''}`;
      const technical = /<\s*(?:UpdateVariable|initvar|StatusPlaceHolderImpl|status_current_variable)\b/i.test(text);
      if (!technical) continue;
      assert.notEqual(rule.promptOnly, true, `${dir}/${rule.scriptName} must not be prompt-only`);
      assert.notEqual(rule.runOnEdit, true, `${dir}/${rule.scriptName} must not run on edit`);
    }
  }
});
