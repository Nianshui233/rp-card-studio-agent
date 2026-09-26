import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMvuPackage } from './validate-mvu-package.mjs';

const loader = {
  type: 'script', name: 'MVU', id: 'loader',
  content: "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0a730cd4a9b99689d1135a49b542c780b977c24c/artifact/bundle.js';",
};
const zod = {
  type: 'script', name: 'ZOD', id: 'zod',
  content: `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js';
export const Schema = z.object({
  世界: z.object({ 时间: z.string().prefault('08:00') }).prefault({}),
  玩家: z.object({ 生命值: z.coerce.number().prefault(100) }).prefault({}),
  任务: z.object({ 阶段: z.string().prefault('开始') }).prefault({}),
});
$(() => { registerMvuSchema(Schema); });`,
};
const init = `世界:\n  时间: '08:00'\n玩家:\n  生命值: 100\n任务:\n  阶段: 开始`;
const entries = [
  { id: 1, comment: '[mvu_update]变量更新规则', content: `变量更新规则：
世界：更新时间只在行动耗时、休息或跳时时更新；普通对话不更新。
玩家：生命值在受伤或治疗时更新，范围0-100；没有伤害事实不得修改。背包是 Record，新增/修改使用对象键，耗尽使用 remove。
任务：阶段只在目标或现场发生实质变化时更新；重复描述不得重复结算。
现场：示例数组用于说明 Array 的 insert/remove 和去重。
只读边界：界面派生值不得由模型修改。
更新条件：先读取当前状态，再检查世界、玩家、任务；信息不足保持原值。
结算顺序：识别事实→数值变化→Record→Array→范围校验。
`.repeat(5) },
  { id: 2, comment: '变量列表', content: `<status_current_variable>
{{format_message_variable::stat_data}}
</status_current_variable>
/世界/时间
/玩家/生命值
/玩家/背包/物品名
/任务/阶段
Record 使用对象键而不是数组下标。Array 使用真实下标或末尾追加符号。所有 path 都位于 stat_data；禁止省略顶层根。`.repeat(3) },
  { id: 3, comment: '[mvu_update]变量输出格式', content: `<UpdateVariable>
<Analysis>逐字段分析当前回复真实变化；核对时间、玩家和任务，不使用旧剧情猜测。</Analysis>
<JSONPatch>
[
{"op":"replace","path":"/世界/时间","value":"09:00"},
{"op":"delta","path":"/玩家/生命值","value":-5},
{"op":"replace","path":"/玩家/背包/绷带","value":"x1"},
{"op":"replace","path":"/任务/阶段","value":"进入现场"}
]
</JSONPatch>
</UpdateVariable>
规则：只能使用 JSON Patch；Record 使用 replace/remove；Array 使用 insert/remove；路径必须来自变量列表。输出必须位于正文末尾；没有变化时仍输出 Analysis 与空数组；禁止写入 Schema 外路径；每个操作对象只能包含当前方言允许的字段。replace 用于标量和 Record；delta 只用于数值；insert/remove 只用于 Array；move 仅在目标 provider 明确支持时使用。` },
];
const regex = [
  { id: 'r1', findRegex: '/<initvar>[\\s\\S]*?<\\/initvar>/g', replaceString: '', placement: [2] },
  { id: 'r2', findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g', replaceString: '', placement: [2] },
  { id: 'r3', findRegex: '/<StatusPlaceHolderImpl\\s*\\/>/g', replaceString: '<div>status</div>', placement: [2] },
];

function fixture() {
  const scripts = [structuredClone(loader), structuredClone(zod)];
  const characterBook = entries.map(entry => ({ ...structuredClone(entry), keys: [], enabled: true }));
  return {
    card: {
      spec: 'chara_card_v3', spec_version: '3.0', data: {
        first_mes: `<initvar>\n${init}\n</initvar>\n开场\n<StatusPlaceHolderImpl/>`,
        alternate_greetings: [`<initvar>\n${init}\n</initvar>\n备用开场\n<StatusPlaceHolderImpl/>`],
        character_book: { entries: characterBook },
        extensions: { tavern_helper: { scripts }, regex_scripts: structuredClone(regex) },
      },
    },
    worldbook: { entries: Object.fromEntries(entries.map((entry, index) => [index, { uid: index, comment: entry.comment, content: entry.content, key: [] }])) },
    scriptFolder: { type: 'folder', scripts: structuredClone(scripts) },
    regex: structuredClone(regex),
    zodSource: zod.content,
    mvuContract: {
      mode: 'mvu_zod', init_strategy: 'greeting', update_dialect: 'json_patch',
      loader: { url: 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0a730cd4a9b99689d1135a49b542c780b977c24c/artifact/bundle.js' },
      zod: { provider_url: 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js' },
      requiredEntries: { update_rules: '[mvu_update]变量更新规则', variable_index: '变量列表', output_format: '[mvu_update]变量输出格式' },
    },
  };
}

test('accepts a complete pinned MVU_ZOD package contract', () => {
  const result = validateMvuPackage(fixture(), { mode: 'mvu_zod', initStrategy: 'greeting' });
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.deepEqual(result.schemaKeys, ['世界', '玩家', '任务']);
  assert.equal(result.dialect, 'json_patch');
});

test('rejects missing Zod registration instead of silently downgrading to native MVU', () => {
  const f = fixture();
  f.card.data.extensions.tavern_helper.scripts = [loader];
  f.scriptFolder.scripts = [loader];
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting' });
  assert.match(result.issues.join(' '), /registerMvuSchema/);
});

test('rejects missing rules, path index, and output format', () => {
  const f = fixture();
  f.card.data.character_book.entries = [];
  f.worldbook.entries = {};
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting' });
  assert.match(result.issues.join(' '), /更新规则/);
  assert.match(result.issues.join(' '), /路径索引/);
  assert.match(result.issues.join(' '), /输出格式/);
});

test('rejects a playable Greeting whose initvar does not cover the Schema roots', () => {
  const f = fixture();
  f.card.data.alternate_greetings[0] = '<initvar>\n世界:\n  时间: 09:00\n</initvar>\n备用开场\n<StatusPlaceHolderImpl/>';
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting' });
  assert.match(result.issues.join(' '), /缺少 Schema 顶层键：玩家、任务/);
});

test('rejects embedded/external worldbook and script drift', () => {
  const f = fixture();
  f.worldbook.entries[0].content = 'DRIFTED';
  f.scriptFolder.scripts[1].content += '\n// drift';
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting' });
  assert.match(result.issues.join(' '), /正文漂移/);
  assert.match(result.issues.join(' '), /脚本“ZOD”内容漂移/);
});

test('rejects unpinned providers and mixed update dialects', () => {
  const f = fixture();
  f.card.data.extensions.tavern_helper.scripts[0].content = "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';";
  f.scriptFolder.scripts[0].content = f.card.data.extensions.tavern_helper.scripts[0].content;
  f.worldbook.entries[2].content += "\n_.set('世界.时间', '10:00');";
  f.card.data.character_book.entries[2].content = f.worldbook.entries[2].content;
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting' });
  assert.match(result.issues.join(' '), /Loader URL 未锁定/);
  assert.match(result.issues.join(' '), /混用了 JSON Patch 与 lodash/);
});

test('rejects a missing or contradictory MVU runtime contract', () => {
  const missing = fixture();
  delete missing.mvuContract;
  const missingResult = validateMvuPackage(missing, { mode: 'mvu_zod', initStrategy: 'greeting', dialect: 'json_patch' });
  assert.match(missingResult.issues.join(' '), /缺少 配置\/MVU运行合同/);

  const wrong = fixture();
  wrong.mvuContract.mode = 'native_schema';
  wrong.mvuContract.requiredEntries.output_format = '不存在的输出条目';
  const wrongResult = validateMvuPackage(wrong, { mode: 'mvu_zod', initStrategy: 'greeting', dialect: 'json_patch' });
  assert.match(wrongResult.issues.join(' '), /mode=native_schema/);
  assert.match(wrongResult.issues.join(' '), /世界书条目缺失/);
});

test('rejects ZOD before Loader and duplicate schema registration', () => {
  const f = fixture();
  f.card.data.extensions.tavern_helper.scripts = [structuredClone(zod), structuredClone(loader)];
  f.scriptFolder.scripts = [structuredClone(zod), structuredClone(loader)];
  f.card.data.extensions.tavern_helper.scripts[0].content += '\nregisterMvuSchema(Schema);';
  f.scriptFolder.scripts[0].content = f.card.data.extensions.tavern_helper.scripts[0].content;
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting', dialect: 'json_patch' });
  assert.match(result.issues.join(' '), /Loader 必须位于 ZOD/);
  assert.match(result.issues.join(' '), /只能调用一次 registerMvuSchema/);
});

test('rejects JSON Patch examples that are not present in the variable path index', () => {
  const f = fixture();
  f.worldbook.entries[2].content = f.worldbook.entries[2].content.replace('/任务/阶段', '/玩家/不存在');
  f.card.data.character_book.entries[2].content = f.worldbook.entries[2].content;
  const result = validateMvuPackage(f, { mode: 'mvu_zod', initStrategy: 'greeting', dialect: 'json_patch' });
  assert.match(result.issues.join(' '), /示例路径不在变量索引中：\/玩家\/不存在/);
});

