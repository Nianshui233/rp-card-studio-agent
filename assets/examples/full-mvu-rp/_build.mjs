import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(dir, '状态栏.html'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const fenced = '```html\n' + page + '\n```';

// 校验页面脚本不含会被正则替换或宏误食的序列
for (const bad of ['${', '{{', '`']) {
  if (page.includes(bad)) throw new Error('状态栏页面含有危险序列: ' + bad);
}
if (/\$\d/.test(page)) throw new Error('状态栏页面含有 $数字 捕获组引用');
if (page.includes('Mvu.events.VARIABLE_UPDATE_ENDED')) throw new Error('状态栏不得在 VARIABLE_UPDATE_ENDED 中重读消息存储');
if (!page.includes('await context.saveChat();')) throw new Error('状态栏写入必须显式等待 saveChat');
// 页面内脚本语法检查
const m = page.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('未找到页面脚本');
new Function(m[1]);

const rules = [
  {
    id: 'b1f0b6d1-2f3a-4c58-9d10-6f2a1b7e01a1',
    scriptName: 'MVU更新块显示隐藏（流式安全）',
    findRegex: '/<UpdateVariable>(?:[\\s\\S]*?<\\/UpdateVariable>|[\\s\\S]*)/g',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
  },
  {
    id: 'b1f0b6d1-2f3a-4c58-9d10-6f2a1b7e01a2',
    scriptName: '航站面板渲染',
    findRegex: '/<(?:StatusPlaceHolderImpl|航站面板)\\s*\\/>/g',
    replaceString: fenced,
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
  },
  {
    id: 'b1f0b6d1-2f3a-4c58-9d10-6f2a1b7e01a3',
    scriptName: 'MVU载荷提示词清理',
    findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>\\n*|<(?:StatusPlaceHolderImpl|航站面板)\\s*\\/>/g',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false,
    promptOnly: true,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
  },
];

const fixtures = [
  {
    id: 'display-complete-update-and-placeholder',
    input: '洛檀把风灯别回腰间，指向栈桥尽头。\n<UpdateVariable>\n<Analysis>巡桥消耗体力</Analysis>\n_.add(\'角色.体力\', -3);//巡桥消耗\n</UpdateVariable>\n\n<StatusPlaceHolderImpl/>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected_contains: '洛檀把风灯别回腰间，指向栈桥尽头。\n\n\n```html\n<!doctype html>',
  },
  {
    id: 'display-streaming-half-block',
    input: '洛檀把风灯别回腰间，指向栈桥尽头。\n<UpdateVariable>\n<Analysis>巡桥消耗',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected: '洛檀把风灯别回腰间，指向栈桥尽头。\n',
  },
  {
    id: 'display-floor0-greeting-marker',
    input: '雾从河面漫上栈桥，航站的灯一盏盏亮起来。\n<航站面板/>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected_contains: '雾从河面漫上栈桥，航站的灯一盏盏亮起来。\n```html\n<!doctype html>',
  },
  {
    id: 'prompt-full-cleanup',
    input: '洛檀把风灯别回腰间，指向栈桥尽头。\n<UpdateVariable>\n<Analysis>巡桥消耗体力</Analysis>\n_.add(\'角色.体力\', -3);//巡桥消耗\n</UpdateVariable>\n\n<StatusPlaceHolderImpl/>',
    placement: 2,
    depth: 0,
    channel: 'prompt',
    expected: '洛檀把风灯别回腰间，指向栈桥尽头。\n',
  },
  {
    id: 'display-user-input-untouched',
    input: '我先去仓库领备用保险丝。\n<航站面板/>',
    placement: 1,
    depth: 0,
    channel: 'display',
    expected: '我先去仓库领备用保险丝。\n<航站面板/>',
  },
];

const initvar = [
  '$meta:',
  '  extensible: false',
  '世界:',
  '  区域: 北航站',
  '  天气: 小雨',
  '  时段: 入夜',
  '角色:',
  '  体力: 80',
  '  当前任务: 核对北栈桥灯标',
  '物资:',
  '  电池: 2',
  '  灯油: 3',
  '玩家备忘:',
  "  最新: ''",
].join('\n');

const updateRules = [
  '[变量更新规则]',
  '每轮回复末尾按「输出格式」给出一次 <UpdateVariable>。命令必须以分号结尾，分号后用 // 注明原因。',
  "- 数值增减用 _.add，旧值无需精确：_.add('角色.体力', -3);//巡桥消耗",
  "- 文本与状态变化用 _.set 两参数：_.set('世界.天气', '小雨转大');//雨势增强",
  "- 物资增减：_.assign('物资', '备用保险丝', 1);//领取备用件 / _.unset('物资.灯油');//整罐耗尽",
  "- 首次记录线索前先 _.set('线索', []);//建立清单；随后 _.insert('线索', '灯丝发黑');//新发现 / _.remove('线索', '灯丝发黑');//已排除",
  '- 禁止改写 玩家备忘 下的任何字段，那是玩家手记。',
  '- 体力范围 0-100；没有明确的行动消耗时，不要为改而改。',
].join('\n');

const outputFormat = [
  '[输出格式]',
  '正文写完剧情后，另起一行输出一次更新块；不要在正文里输出数值面板、状态表格或变量值。',
  '<UpdateVariable>',
  '<Analysis>一行以内：本轮哪些变量需要变化、为什么</Analysis>',
  '（更新命令，每条以分号结束并带 // 原因）',
  '</UpdateVariable>',
].join('\n');

const worldLore = [
  '[雾港航站]',
  '雾港是河湾尽头的驳船港，航站建在北岸木桩上：值班室、仓库、灯标塔由一条会晃的栈桥连起来。渡船每天两班，末班在子夜前后；过了末班，河上只剩灯标和雾。',
  '洛檀是航站唯一的常驻看守：傍晚巡一次栈桥，入夜校灯，子夜记录水位。她正攒钱换一根新桅杆灯的灯丝，也想在月底前查清最近灯标忽明忽暗的原因——她的日程不因任何人停转。',
  '港务所每周用电报送来值班表；仓库钥匙挂在值班室门后；北栈桥第三块踏板松动。雾大时，能听见渡船的雾钟从上游传来。',
].join('\n');

const manual = [
  '[灯标检修手册]',
  '标准流程：断开雾灯电源 → 检查灯丝是否发黑 → 发黑则更换（消耗 1 电池或 1 灯油）→ 记录水位与风向 → 合闸试灯三次。',
  '北栈桥灯标的保险丝盒在塔基东侧；备用保险丝通常存于仓库 B 架。',
].join('\n');

function entry(uid, comment, content, opts) {
  return {
    uid,
    key: opts.key || [],
    keysecondary: opts.keysecondary || [],
    comment,
    content,
    constant: !!opts.constant,
    vectorized: false,
    selective: opts.selective !== undefined ? opts.selective : true,
    selectiveLogic: 0,
    addMemo: true,
    order: opts.order || 100,
    position: 0,
    disable: !!opts.disable,
    excludeRecursion: false,
    preventRecursion: true,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: null,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    displayIndex: uid,
  };
}

const worldbook = {
  entries: {
    0: entry(0, '[initvar] 雾港基线', initvar, { disable: true, order: 10 }),
    1: entry(1, '[config_override]', '{"更新方式":"随AI输出"}', { disable: true, order: 20 }),
    2: entry(2, '[mvu_plot] 变量更新规则', updateRules, { constant: true, order: 30 }),
    3: entry(3, '[mvu_plot] 输出格式', outputFormat, { constant: true, order: 40 }),
    4: entry(4, '世界设定·雾港航站', worldLore, { constant: true, order: 50 }),
    5: entry(5, '灯标检修手册', manual, { key: ['灯标', '检修', '保险丝', '灯丝', '灯油'], order: 60 }),
  },
};

const firstMes = [
  '子夜的雾比预报的更早。你在北航站的值班室里醒来，桌上的水位记录还差最后一行，窗外灯标的光在雾里晕成一团模糊的橙。',
  '',
  '洛檀推门进来，肩上还带着河风的潮气。她把风灯搁在图纸旁，指了指墙上的值班表——今晚轮到核对北栈桥灯标，而那盏灯已经连续两晚忽明忽暗。',
  '',
  '“先说好，”她把仓库钥匙推到你手边，“第三块踏板是松的，别踩外沿。要现在动身，还是先翻翻检修手册？”',
  '',
  '<航站面板/>',
].join('\n');

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: '洛檀',
    description: '{{char}} 是雾港航站的看守，二十七岁，话不多但记性好。她的世界里有一张值班表、一条末班渡船和一盏需要修好的灯标。',
    personality: '沉稳、务实、对航站的每个部件都有感情；不喜欢空话，喜欢把事情做完再谈别的。',
    scenario: '雾港航站，入夜。你是今晚临时搭班的助手，和 {{char}} 一起核对北栈桥灯标。',
    first_mes: firstMes,
    mes_example: '<START>\n{{user}}: 灯标的情况怎么样？\n{{char}}: 她拧亮手电照了照河面。“第三晚了。灯丝要是再黑下去，就得换整根。”',
    creator_notes: '完整变量+前端综合样本（MVU 原生 Schema + Tavern Helper 消息 iframe 状态栏）。导入顺序与玩法见仓库 assets/examples/full-mvu-rp/README.md。',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: ['雾港航站', 'MVU', '综合样本'],
    creator: 'rp-card-studio',
    character_version: '1.0.0',
    extensions: {
      world: '雾港航站世界书',
      regex_scripts: rules,
    },
  },
};

const folder = {
  type: 'folder',
  enabled: false,
  name: '雾港航站·运行脚本',
  id: '6f4c2a91-8b17-4e5d-9a30-5c8e2f7a11c4',
  icon: 'fa-solid fa-lightbulb',
  color: '#7de3ff',
  scripts: [
    {
      type: 'script',
      enabled: false,
      name: 'MVU变量框架',
      id: '9d5a3f72-1c64-48be-8f2a-7b90c4d5e6f1',
      content: "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0a730cd4a9b99689d1135a49b542c780b977c24c/artifact/bundle.js';\n",
      info: '锁定到本次源码核对 commit 的 MagVarUpdate Loader；需要网络和 Tavern Helper。',
      button: { enabled: true, buttons: [] },
      data: {},
      export_with: { data: true, button: true },
    },
  ],
};

const write = (name, value) => {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
  console.log('OK', name);
};
write('regex.json', rules);
write('regex.fixtures.json', fixtures);
write('雾港航站世界书.json', worldbook);
write('雾港航站.json', card);
write('运行脚本.folder.json', folder);
console.log('done');
