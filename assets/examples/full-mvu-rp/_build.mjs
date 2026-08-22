import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n$/, '');
const openingPage = read('开场.html');
const statusPage = read('状态栏.html');
const coordinator = read('运行协调器.js');
const ejsContext = read('动态上下文.ejs');
const PROFILE_ENTRY_NAME = '<user>';
const fence = page => '```html\n' + page + '\n```';

for (const [name, page] of [['开场.html', openingPage], ['状态栏.html', statusPage]]) {
  for (const bad of ['${', '{{', '`']) {
    if (page.includes(bad)) throw new Error(name + ' 含有会破坏正则载体的序列: ' + bad);
  }
  if (/\$\d/.test(page)) throw new Error(name + ' 含有 $数字 捕获组引用');
  const script = page.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error(name + ' 缺少页面脚本');
  new Function(script[1]);
}
new Function(coordinator);
if (openingPage.includes('Mvu.getMvuData') || openingPage.includes('MistportRuntime')) throw new Error('开场前端越界读取持续运行状态');
if (statusPage.includes('MistportOpening') || statusPage.includes('custom_goal')) throw new Error('消息前端混入开场/创角职责');
if (!statusPage.includes('$arrayMeta') || !statusPage.includes("startsWith('$')")) throw new Error('消息前端必须过滤 MVU 初始化元数据载体');
if (!coordinator.includes("entry.name === PROFILE_ENTRY_NAME")) throw new Error('协调器缺少 canonical <user> 精确匹配');
if (!coordinator.includes("'/send ' + escapeSlashText(text) + ' | /trigger'")) throw new Error('动态开局缺少真实 /send → /trigger 链');
if (!coordinator.includes("Mvu.replaceMvuData(next, { type: 'message', message_id: id })")) throw new Error('玩家手记缺少显式数值楼层写入');
if (!coordinator.includes('await saveChatVerified()')) throw new Error('关键写入缺少 saveChat');
if (coordinator.includes("message_id: 'latest'")) throw new Error('关键代码不得使用 latest 写入');
if (coordinator.includes('VARIABLE_UPDATE_ENDED')) throw new Error('不得把 VARIABLE_UPDATE_ENDED 当持久化完成事件');
if (!ejsContext.includes('@@generate_before') || !ejsContext.includes("await getwi('雾港航站世界书', '航站共识简报')")) {
  throw new Error('EJS 动态上下文缺少 generate-stage 与按名世界书调用');
}
if (!ejsContext.includes('$arrayMeta')) throw new Error('EJS 动态上下文必须过滤数组元数据载体');
if (!coordinator.includes("Mvu.parseMessage(commands.join('\\n'), current)")) throw new Error('开场初态必须通过 Mvu.parseMessage 同步 stat/display/delta');
if (!coordinator.includes("航站安全度: '系统.航站安全度'")) throw new Error('协调器缺少 MVU 简写路径修正');
if (!coordinator.includes('将旧版字符串倒计时迁移为分钟数值')) throw new Error('协调器缺少旧版倒计时迁移');

const rules = [
  {
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1001',
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
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1002',
    scriptName: 'Greeting initvar 显示隐藏',
    findRegex: '/<initvar>[\\s\\S]*?<\\/initvar>\\s*/gi',
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
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1003',
    scriptName: '航站通知流式半块隐藏',
    findRegex: '/<航站通知(?:\\s+类型="(?:例行|警报|线索|后果)")?>(?:(?!<\\/航站通知>)[\\s\\S])*$/g',
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
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1004',
    scriptName: '航站通知静态显示',
    findRegex: '/<航站通知\\s+类型="(例行|警报|线索|后果)">([\\s\\S]*?)<\\/航站通知>/g',
    replaceString: '> **航站通知 · $1**\n>\n> $2',
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
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1005',
    scriptName: '一次性开场前端渲染',
    findRegex: '/<航站开场\\s*\\/>/g',
    replaceString: fence(openingPage),
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
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1006',
    scriptName: '持续消息状态前端渲染',
    findRegex: '/<(?:StatusPlaceHolderImpl|航站面板)\\s*\\/>/g',
    replaceString: fence(statusPage),
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
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1007',
    scriptName: '航站通知提示词摘要',
    findRegex: '/<航站通知\\s+类型="(例行|警报|线索|后果)">([\\s\\S]*?)<\\/航站通知>/g',
    replaceString: '[航站通知·$1：$2]',
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
  {
    id: '970fbf6e-31ba-4fc5-aa45-ae7b690a1008',
    scriptName: '运行载荷提示词清理',
    findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>\\n*|<initvar>[\\s\\S]*?<\\/initvar>\\s*|<(?:StatusPlaceHolderImpl|航站面板|航站开场)\\s*\\/>/gi',
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
    id: 'display-complete-update-and-status',
    input: '洛檀合上保险丝盒。\n<UpdateVariable>\n<Analysis>检修消耗</Analysis>\n_.add(\'角色.体力\', -3);//检修消耗\n</UpdateVariable>\n\n<StatusPlaceHolderImpl/>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected_contains: '洛檀合上保险丝盒。\n\n\n```html\n<!doctype html>',
  },
  {
    id: 'display-streaming-update-half',
    input: '洛檀合上保险丝盒。\n<UpdateVariable>\n<Analysis>检修',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected: '洛檀合上保险丝盒。\n',
  },
  {
    id: 'display-opening-frontend',
    input: '雾贴着玻璃。\n<航站开场/>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected_contains: '雾贴着玻璃。\n```html\n<!doctype html>',
  },
  {
    id: 'display-status-frontend',
    input: '洛檀递来一盏灯。\n<航站面板/>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected_contains: '洛檀递来一盏灯。\n```html\n<!doctype html>',
  },
  {
    id: 'display-initvar-hidden',
    input: '<initvar>\n世界:\n  区域: 北航站\n</initvar>\n正文',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected: '正文',
  },
  {
    id: 'display-static-notice',
    input: '<航站通知 类型="警报">雾钟从下游响了两次。</航站通知>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected: '> **航站通知 · 警报**\n>\n> 雾钟从下游响了两次。',
  },
  {
    id: 'display-static-notice-half',
    input: '洛檀抬头。\n<航站通知 类型="线索">第三盏灯',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected: '洛檀抬头。\n',
  },
  {
    id: 'prompt-notice-keeps-semantics',
    input: '<航站通知 类型="线索">灯罩内侧有盐霜。</航站通知>',
    placement: 2,
    depth: 0,
    channel: 'prompt',
    expected: '[航站通知·线索：灯罩内侧有盐霜。]',
  },
  {
    id: 'prompt-runtime-cleanup',
    input: '<initvar>\n世界:\n  区域: 北航站\n</initvar>\n正文\n<UpdateVariable>\n_.set(\'世界.天气\', \'大雾\');//天气变化\n</UpdateVariable>\n<航站面板/>',
    placement: 2,
    depth: 0,
    channel: 'prompt',
    expected: '正文\n',
  },
  {
    id: 'display-user-message-untouched',
    input: '我想先看面板。\n<航站面板/>',
    placement: 1,
    depth: 0,
    channel: 'display',
    expected: '我想先看面板。\n<航站面板/>',
  },
  {
    id: 'display-similar-marker-untouched',
    input: '<航站面板 状态="旧"/>',
    placement: 2,
    depth: 0,
    channel: 'display',
    expected: '<航站面板 状态="旧"/>',
  },
];

const baselineInit = [
  '$meta:',
  '  extensible: false',
  '世界:',
  '  区域: 北航站值班室',
  '  天气: 小雨',
  '  时段: 入夜',
  '  潮位: 平潮后半刻',
  '玩家:',
  '  称呼: 待登记',
  '  来历: 待登记',
  '  专长: 待登记',
  '  行事倾向: 待登记',
  '角色:',
  '  体力: 82',
  '  当前任务: 等待开场登记',
  '关系:',
  '  洛檀信任: 0',
  '系统:',
  '  路线: 未选择',
  '  开场状态: 未提交',
  '  航站安全度: 72',
  '  雾钟倒计时: 40',
  '  警报: 无',
  '物资:',
  '  $meta:',
  '    extensible: true',
  '  风灯: 1',
  '  电池: 2',
  '  灯油: 3',
  '  绳索: 1',
  '线索:',
  '  - $arrayMeta: true',
  '    $meta:',
  '      extensible: true',
  '任务:',
  '  主线:',
  '    名称: 等待开场登记',
  '    阶段: 尚未开始',
  '    进度: 0',
  '玩家备忘:',
  "  最新: ''",
].join('\n');

function routeInit({ route, area, weather, phase, tide, task, stage, safety, countdown, alert, supplies, clues }) {
  const lines = [
    '$meta:',
    '  extensible: false',
    '世界:',
    '  区域: ' + area,
    '  天气: ' + weather,
    '  时段: ' + phase,
    '  潮位: ' + tide,
    '玩家:',
    '  称呼: 待登记',
    '  来历: 待登记',
    '  专长: 待登记',
    '  行事倾向: 待登记',
    '角色:',
    '  体力: 82',
    '  当前任务: ' + task,
    '关系:',
    '  洛檀信任: 0',
    '系统:',
    '  路线: ' + route,
    '  开场状态: 已选择固定Greeting',
    '  航站安全度: ' + safety,
    '  雾钟倒计时: ' + countdown,
    '  警报: ' + alert,
    '物资:',
    '  $meta:',
    '    extensible: true',
  ];
  for (const [key, value] of Object.entries(supplies)) lines.push('  ' + key + ': ' + value);
  lines.push('线索:');
  clues.forEach(item => lines.push('  - ' + item));
  lines.push('  - $arrayMeta: true', '    $meta:', '      extensible: true');
  lines.push(
    '任务:',
    '  主线:',
    '    名称: ' + task,
    '    阶段: ' + stage,
    '    进度: 0',
    '玩家备忘:',
    "  最新: ''",
  );
  return lines.join('\n');
}

function assertNumericCountdown(name, initText) {
  if (!/^\s*雾钟倒计时: \d+$/m.test(initText) || /雾钟倒计时: ['"]?\d+分钟/.test(initText)) {
    throw new Error(name + ' 的系统.雾钟倒计时必须是分钟数值');
  }
}

function assertMutableCollections(name, initText) {
  const inventory = initText.match(/物资:\n([\s\S]*?)\n线索:/);
  const clues = initText.match(/线索:\n([\s\S]*?)\n任务:/);
  if (!inventory || !/\$meta:\n\s+extensible: true/.test(inventory[1])) throw new Error(name + ' 的物资对象必须可扩展');
  if (!clues || !/\$arrayMeta: true[\s\S]*?\$meta:[\s\S]*?extensible: true/.test(clues[1])) throw new Error(name + ' 的线索数组必须可扩展');
}

const routineInit = routeInit({
  route: '例行巡灯', area: '北航站值班室', weather: '小雨转雾', phase: '入夜', tide: '平潮后半刻',
  task: '核对北栈桥灯标', stage: '领取钥匙与检修手册', safety: 72, countdown: 40, alert: '灯标异常',
  supplies: { 风灯: 1, 电池: 2, 灯油: 3, 绳索: 1 }, clues: ['灯标连续第三晚忽明忽暗'],
});

const rescueInit = routeInit({
  route: '失联渡船', area: '北航站栈桥口', weather: '浓雾', phase: '子夜前', tide: '涨潮转急',
  task: '寻找失联的末班渡船', stage: '辨认错误方向的雾钟', safety: 58, countdown: 20, alert: '末班渡船迟到',
  supplies: { 风灯: 2, 电池: 2, 灯油: 2, 绳索: 2, 保暖毯: 1 }, clues: ['雾钟从下游传来', '末班渡船迟到二十分钟'],
});

assertMutableCollections('世界书基线', baselineInit);
assertMutableCollections('例行巡灯初态', routineInit);
assertMutableCollections('失联渡船初态', rescueInit);
assertNumericCountdown('世界书基线', baselineInit);
assertNumericCountdown('例行巡灯初态', routineInit);
assertNumericCountdown('失联渡船初态', rescueInit);

const updateRules = [
  '[MVU变量更新规则]',
  '每轮只修改剧情中真实发生变化的字段，不为“看起来完整”而机械更新。玩家备忘.最新是界面单写者字段，模型永远不得改写。',
  '每条命令的第一个参数必须使用下面列出的完整路径，不得省略父级，也不得根据中文标签猜根路径。',
  "- 世界路径：世界.区域、世界.天气、世界.时段、世界.潮位。",
  "- 角色与关系路径：角色.体力、角色.当前任务、关系.洛檀信任。",
  "- 系统路径：系统.路线、系统.开场状态、系统.航站安全度、系统.雾钟倒计时、系统.警报。航站安全度必须写成 _.add('系统.航站安全度', -6);//安全风险上升；不得写成 _.add('航站安全度', -6)。",
  "- 系统.雾钟倒计时是剩余分钟数值，例如 20；耗时三分钟使用 _.add('系统.雾钟倒计时', -3);//行动耗时。不得写成带单位的 20分钟，也不得对字符串执行 _.add。",
  "- 任务路径：任务.主线.名称、任务.主线.阶段、任务.主线.进度。",
  "- 集合路径：物资、线索。物资对象和线索数组已在 Schema 中声明为可扩展。",
  '数值增减用 _.add；文本状态用 _.set；物资新增/改量用 _.assign；耗尽并移除用 _.unset；线索列表用 _.insert 与 _.remove。每条命令以分号结束，分号后写 // 原因。',
  "- 体力保持 0-100；洛檀信任保持 -100 到 100；系统.航站安全度保持 0-100；任务.主线.进度保持 0-100。",
  "- 场景移动时更新 世界.区域；跨越栈桥、等待、检修或救援消耗了可感知时间时，同步更新 系统.雾钟倒计时。",
  "- 玩家取得、消耗、遗失物资时使用完整集合路径，例如 _.assign('物资', '备用保险丝', 1);//取得备用件。",
  "- 新线索必须是可复述的具体事实，例如 _.insert('线索', '保险丝盒有新撬痕');//现场证据；删除误判线索用 _.remove('线索', '原线索文本')。",
  "- 任务焦点发生实质变化时，同时更新 角色.当前任务 与 任务.主线.阶段，避免状态栏仍显示旧行动。",
  "- 输出 <航站通知 类型=\"警报\"> 时，同一更新块必须把 系统.警报 改成当前最紧迫威胁；威胁解除时改为 无 或下一项活动警报。",
  "- 任务阶段应描述当前可行动的现场，不写菜单；失败可以降低系统.航站安全度、消耗时间、改变关系或制造新的场外后果。",
  "- 输出前逐条检查路径是否存在于上述清单。玩家公开档案只在开场协调器写入；模型不得擅自改写 玩家 下的字段。",
].join('\n');

if (!updateRules.includes("_.add('系统.航站安全度', -6)") || !updateRules.includes("不得写成 _.add('航站安全度', -6)")) {
  throw new Error('变量规则缺少系统.航站安全度完整路径约束');
}
if (!updateRules.includes("_.add('系统.雾钟倒计时', -3)") || !updateRules.includes('不得写成带单位的 20分钟')) {
  throw new Error('变量规则缺少倒计时数值合同');
}

const outputFormat = [
  '[回复输出合同]',
  '先写自然 RP 正文。发生明确警报、线索、例行提醒或长期后果时，可在正文中额外输出至多一次：',
  '<航站通知 类型="例行|警报|线索|后果">一到两句可读事实；不要放 HTML、代码围栏或变量命令。</航站通知>',
  '正文结束后另起一行，固定输出一次变量更新块：',
  '<UpdateVariable>',
  '<Analysis>一行内说明本轮哪些状态真正变化、为什么</Analysis>',
  '（零条或多条 MVU lodash 命令；每条以分号结束并带 // 原因）',
  '</UpdateVariable>',
  '不要手写 <StatusPlaceHolderImpl/>；MVU 会在 assistant 消息持久追加。不要在正文中复述完整数值面板。',
].join('\n');

const narrativeRules = [
  '[叙事规则]',
  '使用第三人称有限视角与近距离环境描写；不读取当前视角无法获得的信息。',
  '洛檀、渡船工、港务所与天气按自己的日程行动。玩家拒绝、沉默或改换目标时，世界继续推进，但不要用强制事件剥夺选择。',
  '不替 <user> 决定关键行动、想法、台词、情感或身体反应；可以描写可感知的环境后果与 NPC 反应。',
  '每轮优先提供 2-4 个可操作事实，避免百科倾倒；以正在发生的变化、人物动作或可回应压力收束，不列菜单式选项。',
  '专业信息通过工具、现场痕迹、人物经验与失败后果呈现，不用旁白直接公布谜底。',
].join('\n');

const worldLore = [
  '[雾港与航站]',
  '雾港位于河湾尽头，北岸木桩上的航站由值班室、仓库、信号台、灯标塔和两条栈桥组成。每天两班渡船连接上游盐镇与下游旧船坞；末班通常在子夜前靠岸。',
  '港务所通过电报和值班表维持秩序，却长期压低维修预算。看守人必须在坏天气里用旧零件维持航标，船户则靠熟人消息判断是否冒险开航。谁都知道规章必要，但规章无法替人修灯、拖船或承担错过航班的损失。',
  '最近一周，北灯标出现无规律闪烁，末班船员声称在下游看见本应报废的旧引航灯。若无人介入，港务所会先归咎设备老化；渡船行会会私下减班；黑市摆渡人会趁信息混乱抬价。',
  '普通人通过雾钟、电报、码头告示和值班员口耳相传获得消息。浓雾会截断视线，却让声音传得更远也更容易误判方向。',
].join('\n');

const systemLore = [
  '[玩法循环与后果]',
  '核心循环：观察现场 → 向人物或记录求证 → 选择时间/物资/关系成本 → 执行动作 → 得到可见后果 → 世界日程继续。',
  '航站安全度不是抽象血条：下降时出现封锁、停航、设备损坏或人员受伤风险；回升必须来自真实修复、调度、救援或可信信息。',
  '雾钟倒计时按剧情中实际经过的时间变化。错过窗口不会立刻结束游戏，而会把问题转成迟到、搁浅、误导航向、港务追责或更昂贵的补救。',
  '信任表示洛檀愿意共享多少判断、钥匙与个人风险，不等于好感或服从。她会拒绝轻率命令，也会记住玩家是否承担后果。',
  '检修、调查和救援不使用隐藏骰点；成败由准备、工具、时间、环境、信息与角色选择共同决定，并在正文中给出足够因果。',
].join('\n');

const luotan = [
  '[洛檀]',
  '二十七岁，北航站常驻看守。沉稳、务实、记性极好，习惯先把工具归位再谈情绪。她对航站每一处响声都有经验，但不会把经验包装成神秘直觉。',
  '公开目标：让今晚的灯、船和值班记录都能交班。私人压力：维修预算连续被驳回；她怀疑有人利用旧引航灯制造错误航向，却没有足够证据。',
  '日程：傍晚巡栈桥，入夜校灯，子夜记水位，末班靠岸后清点仓库。玩家不介入时，她会先完成最紧急的一项，再把失败写进电报并承担追责。',
  '压力下她会缩短句子、亲自检查关键部件，并要求别人说清楚看见了什么。她不喜欢夸口，但会尊重准备充分、愿意承担代价的人。',
].join('\n');

const npcLore = [
  '[航站相关人物]',
  '周栎：末班渡船“灰鹭号”舵手，谨慎但有赌徒式的时间观，常为赶潮窗口晚报故障。他欠旧船坞一笔维修款，不等于他会拿乘客冒险。',
  '闻苇：港务所电报员，按章办事，擅长从发送时刻和措辞看出谁在掩饰。她愿意提供记录，但要求有人对用途签名负责。',
  '裴九：下游黑市摆渡人，熟悉废弃灯位和浅滩，靠信息不对称赚钱。他会救人，也会把救援变成债。',
  '三人都有自己的信息、义务和代价，不应被写成只等玩家点击的线索容器。',
].join('\n');

const stationScene = [
  '[北航站场景]',
  '值班室通往内栈桥；内栈桥连接仓库和信号台；外栈桥第三块踏板松动，继续向前才到北灯标塔。涨潮时外栈桥下方水流加急，落潮时会露出旧缆桩和淤泥脚印。',
  '仓库 B 架存保险丝、灯油和工具，但钥匙通常在洛檀手中或值班室门后。信号台可发电报；线路受潮时会吞字，需要重发或人工核对。',
  '失败与离开都会留下痕迹：未处理的松动踏板可能伤人；擅自取用物资会造成交班缺口；错报航向会让渡船偏离安全水道。',
].join('\n');

const manual = [
  '[灯标检修手册]',
  '标准流程：断开雾灯电源 → 检查灯丝、触点与保险丝盒 → 擦除盐雾冷凝 → 更换损坏件 → 记录水位与风向 → 合闸试灯三次。',
  '北灯标保险丝盒在塔基东侧；备用保险丝通常存于仓库 B 架。灯罩内侧若出现不合季节的盐霜，说明可能有河水倒灌、密封破损或人为开启。',
  '检修时必须有一人留在安全位置看守总闸。浓雾中单靠灯光判断距离不可靠，应同时核对雾钟、潮流和固定桩位。',
].join('\n');

const routeEvents = [
  '[路线推进]',
  '例行巡灯：先由灯标闪烁提供设备问题，再通过不合季节的盐霜、旧式铜线或错误引航灯把问题扩展到人为干预。不要第一轮就公布幕后者。',
  '失联渡船：先确认迟到、错误方向雾钟和潮流，再让登记记录、船员关系或下游灯位形成多条可执行路线。渡船可能搁浅、绕行、被误导或主动熄灯，依据玩家调查与时间推进决定。',
  '自定义来意：先正面回应玩家来意，再让雾港既有事件在一到三轮内自然进入；不要把自定义目标吞没，也不要让世界停摆等玩家。',
].join('\n');

const commonBrief = [
  '[航站共识简报]',
  '世界会自行推进；状态只在可观察变化时更新；玩家档案只描述已确认的公开起点；洛檀有独立日程与判断；失败应留下可继续处理的具体后果。',
].join('\n');

function entry(uid, comment, content, opts = {}) {
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
    position: opts.position ?? 0,
    disable: !!opts.disable,
    excludeRecursion: false,
    preventRecursion: true,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: opts.depth ?? 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: null,
    sticky: opts.sticky || 0,
    cooldown: opts.cooldown || 0,
    delay: opts.delay || 0,
    displayIndex: uid,
  };
}

const worldbook = {
  entries: {
    0: entry(0, '[initvar] 雾港综合基线', baselineInit, { disable: true, order: 10 }),
    1: entry(1, '[config_override]', JSON.stringify({ 更新方式: '随AI输出', 兼容性: { 更新到聊天变量: false } }), { disable: true, order: 20 }),
    2: entry(2, PROFILE_ENTRY_NAME, '[玩家稳定档案]\n尚未通过开场页登记。', { disable: true, constant: true, order: 25 }),
    3: entry(3, '[mvu_plot] 变量更新规则', updateRules, { constant: true, order: 30 }),
    4: entry(4, '[mvu_plot] 回复输出合同', outputFormat, { constant: true, order: 40 }),
    5: entry(5, '叙事规则', narrativeRules, { constant: true, order: 50 }),
    6: entry(6, '世界设定·雾港与航站', worldLore, { constant: true, order: 60 }),
    7: entry(7, '玩法循环与后果', systemLore, { constant: true, order: 70 }),
    8: entry(8, '角色·洛檀', luotan, { constant: true, order: 80 }),
    9: entry(9, '航站相关人物', npcLore, { key: ['周栎', '灰鹭号', '闻苇', '港务所', '裴九', '黑市摆渡'], order: 90 }),
    10: entry(10, '场景·北航站', stationScene, { key: ['值班室', '栈桥', '仓库', '信号台', '灯标塔', '北航站'], order: 100, sticky: 1 }),
    11: entry(11, '灯标检修手册', manual, { key: ['灯标', '检修', '保险丝', '灯丝', '灯油', '盐霜'], order: 110 }),
    12: entry(12, '路线推进', routeEvents, { key: ['例行巡灯', '失联渡船', '自定义来意', '错误方向', '旧引航灯'], order: 120 }),
    13: entry(13, '航站共识简报', commonBrief, { disable: true, order: 130 }),
    14: entry(14, 'STPT·MVU动态上下文', ejsContext, { disable: true, order: 140 }),
  },
};

function greeting(init, paragraphs) {
  return ['<initvar>', init, '</initvar>', '', ...paragraphs].join('\n');
}

const firstMes = greeting(baselineInit, [
  '雨点敲在值班室的铅框玻璃上。桌边摊着今晚的值班表、一本受潮的检修手册和一把尚未交给任何人的仓库钥匙。',
  '',
  '洛檀把电报纸压在铜镇纸下，没有替来客安排身份，只指了指桌前空着的登记格。窗外，北灯标在雾里亮了一下，又灭得太早。',
  '',
  '“先把别人需要知道的写清楚。”她说，“剩下的，等事情真的发生再说。”',
  '',
  '若交互页面没有出现：请启用 Tavern Helper、导入并启用“雾港航站·运行脚本”，或手动左右滑动到固定 Greeting 直接开始。',
  '',
  '<航站开场/>',
]);

const routineGreeting = greeting(routineInit, [
  '子夜前的雾比预报更早漫上北栈桥。值班室里，水位记录还差最后一行，北灯标的光隔着玻璃忽明忽暗。',
  '',
  '洛檀推门进来，把风灯放在图纸旁，又把仓库钥匙推到你面前。',
  '',
  '“第三晚了。”她指向墙上的值班表，“先领备用件，还是先站远一点看它怎么闪？第三块踏板松了，别踩外沿。”',
  '',
  '<航站通知 类型="例行">例行巡灯路线已就绪；固定 Greeting 不会自动替玩家发言。</航站通知>',
  '',
  '<航站面板/>',
]);

const rescueGreeting = greeting(rescueInit, [
  '末班渡船应该在二十分钟前靠岸。现在栈桥外只有浓雾，原本从上游传来的雾钟却在下游响了两次。',
  '',
  '洛檀已经把第二盏风灯点亮，绳索和保暖毯堆在门边。她没有宣布船出了事，只把一张被雨打湿的靠岸时刻表递给你。',
  '',
  '“灰鹭号不会无缘无故错过潮口。”她扣紧雨衣，“先辨方向，还是先查它今晚载了谁？”',
  '',
  '<航站通知 类型="警报">末班渡船迟到；错误方向的雾钟正在消耗救援窗口。</航站通知>',
  '',
  '<航站面板/>',
]);

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: '洛檀｜雾港航站',
    description: '以北航站看守洛檀为核心的长期雾港 RP。玩家会在潮位、渡船、维修预算、物资和人物日程持续推进的河港中处理检修、调查、救援与关系后果。',
    personality: '洛檀沉稳、务实、记性好，尊重具体证据和愿意承担后果的人。她不围着玩家停转，不用谜语代替事实，也不会因为被拒绝就失去自己的日程与判断。',
    scenario: '雾港北航站入夜。北灯标连续第三晚异常，末班渡船也可能偏离时刻表。玩家的公开起点由一次性开场页写入，随后从固定 Greeting 或动态真实消息链进入游戏。',
    first_mes: firstMes,
    mes_example: [
      '<START>',
      '{{user}}: 我不急着上栈桥。先告诉我前两晚它分别在什么时候闪坏。',
      '{{char}}: 洛檀看了你一眼，像是在确认这不是拖延。她抽出水位记录，在两处时刻旁各点了一下。“第一晚是落潮前，第二晚是灰鹭号离岸后。都不是刚合闸的时候。”窗外的灯又暗了一次，这回持续了整整三息。',
      '<航站通知 类型="线索">两次异常都与航行时刻相邻，却不发生在灯具刚启动时。</航站通知>',
      '<UpdateVariable>',
      '<Analysis>玩家获得可复述的新线索，任务进入比对时刻阶段</Analysis>',
      "_.insert('线索', '灯标异常与航行时刻相邻');//洛檀提供两晚记录",
      "_.set('任务.主线.阶段', '比对灯标与渡船时刻');//调查方向明确",
      '</UpdateVariable>',
    ].join('\n'),
    creator_notes: '全功能综合样本：角色卡、独立世界书、固定/动态开局、独立开场前端、独立持续消息前端、MVU、STPT EJS只读桥、Tavern Helper协调器、静态通知正则、持久化与失败回退。导入顺序见同目录 README.md。',
    system_prompt: '你负责扮演洛檀及雾港世界。保持世界自主运行、因果可观察、NPC有自己的目标与日程；不得替玩家决定关键行动、想法、台词或情感。严格遵守世界书中的叙事规则、路线推进与MVU输出合同。',
    post_history_instructions: '继续当前可见情境，不把状态面板写进正文。只更新本轮真实变化的MVU字段；玩家档案与玩家备忘是非模型写入区。',
    alternate_greetings: [routineGreeting, rescueGreeting],
    tags: ['雾港航站', 'MVU', 'EJS', '开场前端', '消息前端', '综合样本'],
    creator: 'rp-card-studio',
    character_version: '2.0.2',
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
  id: 'a36c0d50-0a49-49d8-bc7e-2d2c0e84a001',
  icon: 'fa-solid fa-water',
  color: '#7de3ff',
  scripts: [
    {
      type: 'script',
      enabled: false,
      name: 'MVU变量框架',
      id: 'a36c0d50-0a49-49d8-bc7e-2d2c0e84a002',
      content: "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@0a730cd4a9b99689d1135a49b542c780b977c24c/artifact/bundle.js';\n",
      info: '锁定到源码核对 commit 0a730cd；需要联网和 Tavern Helper。一个聊天只启用这一份 MVU Loader。',
      button: { enabled: true, buttons: [] },
      data: {},
      export_with: { data: true, button: true },
    },
    {
      type: 'script',
      enabled: false,
      name: '雾港航站协调器',
      id: 'a36c0d50-0a49-49d8-bc7e-2d2c0e84a003',
      content: coordinator + '\n',
      info: '为一次性开场与持续消息前端分别提供窄接口；负责 canonical <user>、目标 Swipe 初态、真实发送链、saveChat、同楼读回、输入仲裁、post-write 信号和 MVU→EJS 只读桥。',
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
