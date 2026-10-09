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
  assert.doesNotMatch(read('assets/templates/mvu-zod.schema.js'), /registerMvuSchema/);
  assert.match(read('assets/templates/mvu-zod.registration.js'), /registerMvuSchema\(Schema\)/);
  assert.match(read('assets/templates/mvu-update-rules.yaml'), /Record[\s\S]*Array/);
  assert.match(read('assets/templates/mvu-variable-index.md'), /format_message_variable::stat_data/);
  assert.match(read('assets/templates/mvu-output-format.yaml'), /<JSONPatch>/);
});

test('the repository carries one authoritative complete MVU_ZOD sample with explanatory guidance', () => {
  const base = path.join('assets', 'examples', 'wo-fei-wo-rp');
  for (const file of ['导入包/我，非我.角色卡.json', '导入包/我，非我.世界书.json', '导入包/我，非我.酒馆助手脚本.json', '制作文件/运行源码/MVU/schema.js', '制作文件/项目记录/MVU源码合同.json', '制作文件/运行源码/MVU/注册入口.js', '制作文件/构建/MVU/registration.js', '制作文件/配置/MVU运行合同.yaml', '导入包/我，非我.正则.json', '制作文件/检查/regex.fixtures.json', '制作文件/运行源码/前端/消息状态栏.html', '制作文件/README.md', '制作文件/AGENT_GUIDE.md']) assert(exists(path.join(base, file)), `missing ${file}`);
  const card = JSON.parse(read(path.join(base, '导入包/我，非我.角色卡.json')));
  assert.equal(Boolean(card.data.character_book), false, '样品必须使用独立世界书路线');
  assert.equal(Object.hasOwn(card.data.extensions, 'regex_scripts'), false, '独立 Regex 样品不能保留空的卡内 Regex 路径');
  const contract = read(path.join(base, '制作文件/配置/MVU运行合同.yaml'));
  assert.match(contract, /mode: mvu_zod/);
  assert.match(contract, /init_strategy: worldbook/);
  assert.match(contract, /update_dialect: json_patch/);
  const book = JSON.parse(read(path.join(base, '导入包/我，非我.世界书.json')));
  const comments = Object.values(book.entries).map(entry => entry.comment);
  for (const comment of ['[mvu_update]变量更新规则', '变量列表', '[mvu_update]变量输出格式']) assert(comments.includes(comment));
  assert.match(read(path.join(base, '制作文件/README.md')), /原始卡是语义金标准/);
  assert.match(read(path.join(base, '制作文件/AGENT_GUIDE.md')), /自由发挥/);
});

test('sample display Regex remains non-persistent; prompt cleanup is a separate route', () => {
  const dir = 'wo-fei-wo-rp';
  const file = path.join('assets', 'examples', dir, '导入包/我，非我.正则.json');
  const rules = JSON.parse(read(file));
  for (const rule of rules) {
    const text = `${rule.findRegex || ''}\n${rule.replaceString || ''}`;
    const technical = /<\s*(?:UpdateVariable|initvar|StatusPlaceHolderImpl|status_current_variable)\b/i.test(text);
    if (!technical) continue;
    assert.notEqual(rule.promptOnly, true, `${dir}/${rule.scriptName} must not be prompt-only`);
    assert.notEqual(rule.runOnEdit, true, `${dir}/${rule.scriptName} must not run on edit`);
  }
});
