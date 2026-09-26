import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n$/, '');
const schema = read('schema.js');
const status = read('状态栏.html');
const runtimeContract = `mvu:
  mode: mvu_zod
  init_strategy: greeting
  update_dialect: json_patch
  loader:
    url: "https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0a730cd4a9b99689d1135a49b542c780b977c24c/artifact/bundle.js"
    script_name: "MVU变量框架"
  zod:
    enabled: true
    source: "schema.js"
    script_name: "灰港避难所ZOD"
    provider_url: "https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource@523b1f0d82d3debbc2435ec35530f02e8d388219/dist/util/mvu_zod.js"
  required_worldbook_entries:
    update_rules: "[mvu_update]变量更新规则"
    variable_index: "变量列表"
    output_format: "[mvu_update]变量输出格式"
  consumers:
    status_ui: true
    ejs_bridge: false
  acceptance:
    target_sillytavern: "1.19.0"
    target_tavern_helper: "待实机确认"
    target_mvu_commit: "0a730cd4a9b99689d1135a49b542c780b977c24c"
    runtime: not_run
`;
const initRoutine = `世界:\n  日期: '2026-09-26'\n  时间: '06:30'\n  地点: 灰港公寓一层大厅\n  天气: 雾\n玩家:\n  姓名: 待登记\n  生命值: 100\n  体力: 100\n  感染风险: 0\n  背包:\n    手电筒: 电量约一半\n    矿泉水: x1\n同伴:\n  许岚:\n    关系: 戒备\n    好感度: 0\n    当前地点: 一层消防门内侧\n    当前行动: 监听楼道动静\n任务:\n  主线:\n    名称: 确认楼内幸存者\n    阶段: 封锁大厅\n    进度: 0\n现场:\n  敌对单位: []\n  可调查目标:\n    - 值班台抽屉\n    - 卡住的电梯门`;
const initRoof = `世界:\n  日期: '2026-09-26'\n  时间: '17:40'\n  地点: 灰港公寓天台\n  天气: 雨\n玩家:\n  姓名: 待登记\n  生命值: 92\n  体力: 68\n  感染风险: 0\n  背包:\n    撬棍: 完好\n    绷带: x2\n同伴:\n  许岚:\n    关系: 合作\n    好感度: 12\n    当前地点: 天台水箱旁\n    当前行动: 尝试修复短波电台\n任务:\n  主线:\n    名称: 恢复短波联络\n    阶段: 寻找备用电池\n    进度: 25\n现场:\n  敌对单位:\n    - 楼梯间感染者 x2\n  可调查目标:\n    - 水箱检修口\n    - 邻楼晾衣架`;

const updateRules = `变量更新规则:\n  总则:\n    - 只更新当前回复中真实发生的变化，不因字段存在就机械改值。\n    - 更新前读取当前 stat_data；禁止猜测不存在的路径。\n    - 世界、玩家、同伴、任务、现场五个状态根都必须按各自规则检查。\n    - 每个字段只有一个权威写者；状态栏只读。\n  世界:\n    日期:\n      check: 跨日、明确跳日时更新。\n    时间:\n      check: 行动耗时、休息或场景推进后更新；普通对话不无因推进。\n    地点:\n      check: 玩家真实完成移动后更新。\n    天气:\n      check: 叙事明确变化或跨越足够时间后更新。\n  玩家:\n    姓名:\n      check: 只在开局登记或玩家明确更正时修改。\n    生命值:\n      type: number 0-100\n      check: 受伤、治疗和长期恢复；单次变化与正文伤势一致。\n    体力:\n      type: number 0-100\n      check: 奔跑、攀爬、战斗、搬运和休息。\n    感染风险:\n      type: number 0-100\n      check: 暴露、清创、隔离和检测后更新；没有暴露事实不增加。\n    背包:\n      type: Record<string,string>\n      check: 取得时 replace 新键；数量/状态变化时 replace；耗尽或遗失时 remove。\n  同伴:\n    type: Record<string,Object>\n    check:\n      - 新核心同伴确认后创建完整对象。\n      - 关系与好感度只在有可观察互动后更新。\n      - 当前地点和当前行动在同伴行动变化时更新。\n  任务:\n    主线:\n      check:\n        - 目标改变时同步名称、阶段和进度。\n        - 失败可以改变阶段或产生补救路线，不把未完成任务直接删除。\n  现场:\n    敌对单位:\n      type: Array<string>\n      check: 敌人进入、离开或被击败时 insert/remove，并去重。\n    可调查目标:\n      type: Array<string>\n      check: 新目标出现时 insert；调查完毕或离开场景时 remove。\n  结算顺序:\n    - 识别本轮事实\n    - 计算时间与确定性消耗\n    - 更新玩家/同伴/任务\n    - 更新现场集合\n    - 检查范围、类型和重复结算`;
const variableIndex = `---\n<status_current_variable>\n{{format_message_variable::stat_data}}\n</status_current_variable>\n\n【灰港避难所 · stat_data 路径索引】\n一、世界\n  /世界/日期\n  /世界/时间\n  /世界/地点\n  /世界/天气\n二、玩家\n  /玩家/姓名\n  /玩家/生命值\n  /玩家/体力\n  /玩家/感染风险\n  /玩家/背包/物品名称\n三、同伴\n  /同伴/角色姓名/关系\n  /同伴/角色姓名/好感度\n  /同伴/角色姓名/当前地点\n  /同伴/角色姓名/当前行动\n四、任务\n  /任务/主线/名称\n  /任务/主线/阶段\n  /任务/主线/进度\n五、现场\n  /现场/敌对单位/0\n  /现场/可调查目标/0\nRecord 使用对象键；例如新增背包物品使用 /玩家/背包/止血带，不使用数组下标。
Array 使用下标；追加敌对单位或可调查目标时使用 -，删除时使用当前实际下标。
世界、玩家、同伴、任务、现场之外的根路径均非法。`;
const outputFormat = `变量输出格式:\n  rule:\n    - 回复正文结束后输出一次完整更新块。\n    - Analysis 只依据当前回复和当前 stat_data。\n    - 使用 JSON Patch 方言；不得混入 _.set 等 lodash 命令。\n    - path 必须存在于路径索引，或是允许新增的 Record 键。\n  format: |-\n    <UpdateVariable>\n    <Analysis>说明时间、玩家、同伴、任务和现场中哪些发生变化以及原因。</Analysis>\n    <JSONPatch>\n    [\n      { "op": "replace", "path": "/世界/时间", "value": "06:40" },\n      { "op": "delta", "path": "/玩家/体力", "value": -6 },\n      { "op": "replace", "path": "/玩家/背包/止血带", "value": "x1" },\n      { "op": "insert", "path": "/现场/可调查目标/-", "value": "消防柜" }\n    ]\n    </JSONPatch>\n    </UpdateVariable>`;

function externalEntry(uid, comment, content, order) {
  return { uid, key: [], keysecondary: [], comment, content, constant: true, vectorized: false, selective: true, selectiveLogic: 0, addMemo: true, order, position: 4, disable: false, excludeRecursion: false, preventRecursion: true, delayUntilRecursion: 0, probability: 100, useProbability: true, depth: 0, group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: false, automationId: '', role: 0, sticky: 0, cooldown: 0, delay: 0, displayIndex: uid };
}
function embeddedEntry(entry) { return { id: entry.uid, keys: entry.key, secondary_keys: [], comment: entry.comment, content: entry.content, constant: entry.constant, selective: true, insertion_order: entry.order, enabled: !entry.disable, position: 'after_char', use_regex: true, extensions: { position: entry.position, depth: entry.depth, role: entry.role } }; }

const worldEntries = {
  0: externalEntry(0, '[mvu_update]变量更新规则', updateRules, 10),
  1: externalEntry(1, '变量列表', variableIndex, 20),
  2: externalEntry(2, '[mvu_update]变量输出格式', outputFormat, 30),
  3: { ...externalEntry(3, '[mvu_plot]叙事与世界规则', '灰港公寓与外界失联。感染者被声音吸引；NPC按自己的目标行动。不要替玩家决定想法、台词或关键动作。每轮以可观察变化收束。', 40), position: 0, depth: 4 },
};
const worldbook = { name: '灰港避难所世界书', entries: worldEntries };

const loader = { type: 'script', enabled: false, name: 'MVU变量框架', id: '55555555-0000-4000-8000-000000000001', content: "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0a730cd4a9b99689d1135a49b542c780b977c24c/artifact/bundle.js';\n", info: '唯一 MVU Loader，锁定 commit。', button: { enabled: true, buttons: [] }, data: {}, export_with: { data: true, button: true } };
const zodScript = { type: 'script', enabled: false, name: '灰港避难所ZOD', id: '55555555-0000-4000-8000-000000000002', content: schema + '\n', info: '完整 MVU_ZOD Schema；必须与 initvar、更新规则、变量列表和状态栏同步。', button: { enabled: true, buttons: [] }, data: {}, export_with: { data: true, button: true } };
const folder = { type: 'folder', enabled: false, name: '灰港避难所·MVU_ZOD', id: '55555555-0000-4000-8000-000000000000', icon: 'fa-solid fa-shield-virus', color: '#7fc8a9', scripts: [loader, zodScript] };

const fence = html => '```html\n' + html + '\n```';
const rules = [
  { id: '66666666-0000-4000-8000-000000000001', scriptName: '隐藏 Greeting initvar', findRegex: '/<initvar>[\\s\\S]*?<\\/initvar>\\s*/gi', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null },
  { id: '66666666-0000-4000-8000-000000000002', scriptName: '隐藏 MVU 更新块（流式安全）', findRegex: '/<UpdateVariable>(?:[\\s\\S]*?<\\/UpdateVariable>|[\\s\\S]*)/g', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null },
  { id: '66666666-0000-4000-8000-000000000003', scriptName: '灰港状态栏', findRegex: '/<StatusPlaceHolderImpl\\s*\\/>/g', replaceString: fence(status), trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null },
];
const fixtures = [
  { id: 'hide-initvar', input: '<initvar>\n世界:\n  时间: 08:00\n</initvar>\n正文', placement: 2, depth: 0, channel: 'display', expected: '正文' },
  { id: 'hide-update', input: '正文\n<UpdateVariable>\n<Analysis>x</Analysis>\n<JSONPatch>[]</JSONPatch>\n</UpdateVariable>', placement: 2, depth: 0, channel: 'display', expected: '正文\n' },
  { id: 'stream-update', input: '正文\n<UpdateVariable>\n<Analysis>x', placement: 2, depth: 0, channel: 'display', expected: '正文\n' },
];

const greeting = (init, text) => `<initvar>\n${init}\n</initvar>\n\n${text}\n\n<StatusPlaceHolderImpl/>`;
const card = { spec: 'chara_card_v3', spec_version: '3.0', data: { name: '许岚｜灰港避难所', description: '灰港公寓在感染爆发后的第一天与外界失联。许岚试图维持封锁、确认幸存者并恢复短波联络。', personality: '许岚谨慎、直接、重视可核对事实，不替玩家做决定。', scenario: '玩家与许岚在灰港公寓中处理感染风险、物资、同伴与逐层探索。', first_mes: greeting(initRoutine, '铁链绕过大厅门把。许岚压低声音：“先确认楼里还有谁，再决定是否开门。”'), mes_example: '', creator_notes: '完整 MVU_ZOD 参考包；不使用 EJS。', system_prompt: '保持世界因果和 NPC 自主行动；严格遵守 MVU 更新规则与输出格式。', post_history_instructions: '只更新本轮真实变化；正文后输出一次 UpdateVariable。', alternate_greetings: [greeting(initRoof, '雨水扫过天台。许岚拍了拍失去电源的短波机：“备用电池可能还在楼下配电室。”')], tags: ['MVU_ZOD', '完整制品参考'], creator: 'rp-card-studio', character_version: '1.0.0', character_book: { name: '灰港避难所世界书', entries: Object.values(worldEntries).map(embeddedEntry) }, extensions: { world: '灰港避难所世界书', tavern_helper: { scripts: [loader, zodScript] }, regex_scripts: rules } } };

for (const [name, value] of [['regex.json', rules], ['regex.fixtures.json', fixtures], ['灰港避难所世界书.json', worldbook], ['灰港避难所.json', card], ['运行脚本.folder.json', folder]]) fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'MVU运行合同.yaml'), runtimeContract, 'utf8');
console.log('built mvu-zod-rp');
