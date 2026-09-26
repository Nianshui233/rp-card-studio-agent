import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const folder = JSON.parse(fs.readFileSync(path.join(dir, '运行脚本.folder.json'), 'utf8'));
const source = folder.scripts.find(script => script.name === '雾港航站协调器').content;

function mvuData(route = '未选择', task = '等待开场登记') {
  const stat = {
      世界: { 区域: '北航站值班室', 天气: '小雨', 时段: '入夜', 潮位: '平潮后半刻' },
      玩家: { 称呼: '待登记', 来历: '待登记', 专长: '待登记', 行事倾向: '待登记' },
      角色: { 体力: 82, 当前任务: task },
      关系: { 洛檀信任: 0 },
      系统: { 路线: route, 开场状态: '未提交', 航站安全度: 72, 雾钟倒计时: '40分钟', 警报: '无' },
      物资: { 风灯: 1, 电池: 2, 灯油: 3, 绳索: 1 },
      线索: [],
      任务: { 主线: { 名称: task, 阶段: '尚未开始', 进度: 0 } },
      玩家备忘: { 最新: '' },
    };
  return {
    schema: {},
    initialized_lorebooks: { 雾港航站世界书: [] },
    stat_data: clone(stat),
    display_data: clone(stat),
    delta_data: {},

  };
}

function clone(value) {
  return structuredClone(value);
}

function setPath(object, pathText, value) {
  const parts = pathText.split('.');
  let cursor = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor[parts[i]] ||= {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function makeHarness({ input = '', incompleteMvuSnapshot = false } = {}) {
  const floor0 = {
    message_id: 0,
    role: 'assistant',
    name: '洛檀｜雾港航站',
    message: '开场\n<航站开场/>',
    is_hidden: false,
    swipe_id: 0,
    swipes: ['开场\n<航站开场/>', '巡灯\n<航站面板/>', '救援\n<航站面板/>'],
    swipes_data: [mvuData(), mvuData('例行巡灯', '核对北栈桥灯标'), mvuData('失联渡船', '寻找失联的末班渡船')],
    swipes_info: [{}, {}, {}],
    data: null,
    extra: {},
  };
  floor0.data = floor0.swipes_data[0];
  const chat = [floor0];
  const listeners = new Map();
  const inputBox = { value: input };
  const emitted = [];
  const saves = { chat: 0, metadata: 0 };
  const metadata = {};

  function normalizedMessage(message) {
    if (message.message_id === 0) {
      const swipe = Number(message.swipe_id || 0);
      return {
        ...message,
        message: message.swipes[swipe],
        data: message.swipes_data[swipe],
      };
    }
    return message;
  }

  function getChatMessages(range, options = {}) {
    let start;
    let end;
    if (typeof range === 'number') {
      const id = range < 0 ? chat.length + range : range;
      start = id;
      end = id;
    } else if (String(range).includes('-')) {
      [start, end] = String(range).split('-').map(Number);
    } else {
      start = Number(range);
      end = Number(range);
    }
    return chat.filter(message => message.message_id >= start && message.message_id <= end).map(message => {
      const normalized = normalizedMessage(message);
      if (options.include_swipes && message.message_id === 0) return clone({ ...normalized, swipes: message.swipes, swipes_data: message.swipes_data, swipes_info: message.swipes_info, swipe_id: message.swipe_id });
      return clone(normalized);
    });
  }

  const contextObject = {
    chat,
    chatId: 'mock-chat.jsonl',
    characterId: '7',
    groupId: '',
    chatMetadata: metadata,
    getCurrentChatId: () => 'mock-chat.jsonl',
    saveChat: async () => { saves.chat += 1; },
    updateChatMetadata: values => Object.assign(metadata, values),
    saveMetadata: async () => { saves.metadata += 1; },
  };

  const Mvu = {
    events: { COMMAND_PARSED: 'mag_command_parsed' },
    getMvuData: ({ message_id }) => {
      const message = chat[Number(message_id)];
      if (!message) return null;
      const data = clone(normalizedMessage(message).data);
      if (incompleteMvuSnapshot) return data ? { stat_data: data.stat_data } : data;
      return data;
    },
    replaceMvuData: (data, { message_id }) => {
      const message = chat[Number(message_id)];
      if (message.message_id === 0) {
        message.swipes_data[message.swipe_id] = clone(data);
        message.data = message.swipes_data[message.swipe_id];
      } else {
        message.data = clone(data);
      }
    },
    parseMessage: async (command, before) => {
      const matches = Array.from(command.matchAll(/_\.set\('([^']+)',\s*((?:"(?:[^"\\]|\\.)*")|(?:'[^']*'))\)/g));
      assert(matches.length, 'mock parseMessage only handles _.set');
      const next = clone(before);
      next.display_data ||= clone(next.stat_data);
      next.delta_data ||= {};
      for (const match of matches) {
        const value = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2].slice(1, -1);
        const parts = match[1].split('.');
        let old = next.stat_data;
        for (const part of parts) old = old && old[part];
        setPath(next.stat_data, match[1], value);
        setPath(next.display_data, match[1], String(old) + '->' + String(value));
        setPath(next.delta_data, match[1], String(old) + '->' + String(value));
      }
      return next;
    },
  };

  async function triggerSlash(command) {
    if (command.startsWith('/setinput ')) {
      inputBox.value = command.slice('/setinput '.length).replaceAll('{{newline}}', '\n').replaceAll('\\|', '|').replaceAll('\\\\', '\\');
      return '';
    }
    throw new Error('unexpected slash command: ' + command);
  }

  const lodash = { cloneDeep: clone, set: setPath };
  const windowObject = {
    parent: null,
    document: { querySelector: selector => selector === '#send_textarea' ? inputBox : null },
    SillyTavern: contextObject,
    toastr: { success() {}, warning() {}, error() {} },
  };
  windowObject.parent = windowObject;

  const sandbox = {
    console,
    window: windowObject,
    globalThis: null,
    document: windowObject.document,
    structuredClone,
    crypto: { randomUUID: (() => { let id = 0; return () => 'uuid-' + (++id); })() },
    setTimeout,
    clearTimeout,
    addEventListener() {},
    getChatMessages,
    getLastMessageId: () => chat.length - 1,
    waitGlobalInitialized: async () => {},
    Mvu,
    triggerSlash,
    eventOn: (name, callback) => {
      const list = listeners.get(name) || [];
      list.push(callback);
      listeners.set(name, list);
      return { stop: () => listeners.set(name, (listeners.get(name) || []).filter(item => item !== callback)) };
    },
    eventEmit: async (name, payload) => {
      emitted.push({ name, payload });
      for (const callback of listeners.get(name) || []) await callback(payload);
    },
    tavern_events: { MESSAGE_UPDATED: 'message_updated', MESSAGE_SWIPED: 'message_swiped' },
    builtin: { duringGenerating: () => false },
    _: lodash,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: '雾港航站协调器.js' });

  return {
    runtime: windowObject.MistportRuntime,
    chat,
    inputBox,
    metadata,
    saves,
    emitted,
    listeners,
  };
}

async function testPassiveOpeningContract() {
  const opening = fs.readFileSync(path.join(dir, '开场.html'), 'utf8');
  const coordinator = fs.readFileSync(path.join(dir, '运行协调器.js'), 'utf8');
  const card = JSON.parse(fs.readFileSync(path.join(dir, '雾港航站.json'), 'utf8'));
  const worldbook = JSON.parse(fs.readFileSync(path.join(dir, '雾港航站世界书.json'), 'utf8'));

  assert.match(opening, /navigator\.clipboard\.writeText/, '开场页必须优先使用 Clipboard API');
  assert.match(opening, /document\.execCommand\('copy'\)/, '开场页必须保留手动复制兼容回退');
  assert.match(opening, /亲手点击发送/, '开场页必须明确要求玩家自己发送');
  assert.match(opening, /不会修改世界书/, '开场页必须公开说明不会修改世界书');
  assert.doesNotMatch(opening, /createWorldbookEntries|updateWorldbookWith|deleteWorldbookEntries|setChatMessages|triggerSlash|MistportOpening/, '开场页不得取得持久化或自动发送能力');
  assert.doesNotMatch(coordinator, /createWorldbookEntries|updateWorldbookWith|deleteWorldbookEntries|setChatMessages|MistportOpening|\/send /, '协调器不得替开场写世界书、切 Swipe 或自动发送');

  assert.equal(card.data.alternate_greetings.length, 3, '例行、救援和自定义来意都必须有静态 Greeting');
  for (const greeting of card.data.alternate_greetings) {
    assert.match(greeting, /开场状态: 等待玩家登记/, '每个固定 Greeting 都应等待真实玩家登记消息');
  }
  assert.equal(Object.values(worldbook.entries).some(entry => entry.comment === '<user>'), false, '样本不应携带等待运行时改写的 <user> 条目');
  const rules = Object.values(worldbook.entries).find(entry => entry.comment === '[mvu_plot] 变量更新规则').content;
  assert.match(rules, /【雾港航站·开局登记】/, 'MVU 规则必须识别页面生成的登记 marker');
  assert.match(rules, /玩家\.称呼.*玩家\.来历.*玩家\.专长.*玩家\.行事倾向/s, 'MVU 规则必须声明四个玩家登记路径');
  assert.match(rules, /系统\.开场状态=已登记/, '首轮登记必须关闭等待状态');
}

async function testMemoRejectsIncompleteSnapshot() {
  const h = makeHarness({ incompleteMvuSnapshot: true });
  await assert.rejects(() => h.runtime.writeMemo(0, '先查电报发送时刻'), /完整 MVU 快照/);
  assert.equal(h.saves.chat, 0, '不完整快照不能被当作有效数据保存');
}

async function testInputAndMemo() {
  const h = makeHarness({ input: '我已经写好的草稿' });
  const conflict = await h.runtime.setInput('前往仓库核对保险丝。');
  assert.equal(conflict.status, 'conflict');
  assert.equal(h.inputBox.value, '我已经写好的草稿');
  const memo = await h.runtime.writeMemo(0, '先查电报发送时刻');
  assert.equal(memo.status, 'persisted');
  assert.equal(h.chat[0].swipes_data[0].stat_data.玩家备忘.最新, '先查电报发送时刻');
  assert(h.emitted.some(item => item.name === 'mistport_mvu_write_committed' && item.payload.message_id === 0));
}

function assertMutableCollectionContract(initText, label) {
  const inventory = initText.match(/物资:\n([\s\S]*?)(?:\n线索:)/);
  assert(inventory, label + ' 缺少物资段');
  assert.match(inventory[1], /\$meta:\n\s+extensible: true/, label + ' 的物资对象必须允许新增品类');

  const clues = initText.match(/线索:\n([\s\S]*?)(?:\n任务:)/);
  assert(clues, label + ' 缺少线索段');
  assert.match(clues[1], /\$arrayMeta: true[\s\S]*?\$meta:[\s\S]*?extensible: true/, label + ' 的线索数组必须允许 insert/remove');
}

async function testCapturedVariableRegression() {
  const card = JSON.parse(fs.readFileSync(path.join(dir, '雾港航站.json'), 'utf8'));
  const worldbook = JSON.parse(fs.readFileSync(path.join(dir, '雾港航站世界书.json'), 'utf8'));
  const baseline = Object.values(worldbook.entries).find(entry => entry.comment.includes('[initvar]')).content;
  const greetings = [card.data.first_mes, ...card.data.alternate_greetings];
  assertMutableCollectionContract(baseline, '世界书基线');
  greetings.forEach((greeting, index) => {
    const match = greeting.match(/<initvar>\s*([\s\S]*?)\s*<\/initvar>/i);
    assert(match, 'Greeting ' + index + ' 缺少 initvar');
    assertMutableCollectionContract(match[1], 'Greeting ' + index);
  });

  const rules = Object.values(worldbook.entries).find(entry => entry.comment === '[mvu_plot] 变量更新规则').content;
  assert.match(rules, /_\.add\('系统\.航站安全度', -6\)/, '更新规则必须示范完整路径 系统.航站安全度');
  assert.match(rules, /不得写成[^\n]*航站安全度/, '更新规则必须明确禁止省略 系统 前缀');
  assert.match(rules, /航站通知[^\n]*警报[^\n]*系统\.警报/, '警报通知必须与系统.警报状态同步');
  assert.match(rules, /角色\.当前任务[^\n]*任务\.主线\.阶段/, '任务焦点变化必须同步当前任务与主线阶段');
}

async function testMvuPathNormalizer() {
  const h = makeHarness();
  await new Promise(resolve => setTimeout(resolve, 0));
  const callbacks = h.listeners.get('mag_command_parsed') || [];
  assert.equal(callbacks.length, 1);
  const commands = [
    { type: 'insert', args: ['线索', '北灯标保险丝盒盒盖被撬、备用保险丝缺失、主座螺母被人为拧松'], reason: '现场证据' },
    { type: 'insert', args: ['线索', '塔基东侧撞见一名戴油布手套的外来者，持短撬棍主动袭击'], reason: '人为干预已可确认' },
    { type: 'add', args: ['航站安全度', '-6'], reason: '灯标关键部件被人为破坏且尚未处置' },
    { type: 'set', args: ['世界.区域', '北灯标塔基'], reason: '场景移动' },
  ];
  await callbacks[0]({}, commands, '');
  assert.equal(commands[0].args[0], '线索');
  assert.equal(commands[1].args[0], '线索');
  assert.equal(commands[2].args[0], '系统.航站安全度');
  assert.equal(commands[3].args[0], '世界.区域');

  const legacyCommands = [{ type: 'add', args: ['系统.雾钟倒计时', '-3'], reason: '行动耗时' }];
  await callbacks[0]({ stat_data: { 系统: { 雾钟倒计时: '20分钟' } } }, legacyCommands, '');
  assert.equal(legacyCommands[0].type, 'set');
  assert.equal(legacyCommands[0].args[0], '系统.雾钟倒计时');
  assert.equal(legacyCommands[0].args[1], '17');
}
async function testCountdownAndMetadataConsumers() {
  const card = JSON.parse(fs.readFileSync(path.join(dir, '雾港航站.json'), 'utf8'));
  const worldbook = JSON.parse(fs.readFileSync(path.join(dir, '雾港航站世界书.json'), 'utf8'));
  const initTexts = [
    Object.values(worldbook.entries).find(entry => entry.comment.includes('[initvar]')).content,
    ...[card.data.first_mes, ...card.data.alternate_greetings].map(greeting => greeting.match(/<initvar>\s*([\s\S]*?)\s*<\/initvar>/i)[1]),
  ];
  for (const initText of initTexts) {
    assert.match(initText, /^\s*雾钟倒计时: \d+$/m, '雾钟倒计时必须是可用 _.add 更新的分钟数值');
    assert.doesNotMatch(initText, /雾钟倒计时: ['"]?\d+分钟/, '初态不得把倒计时存为带单位字符串');
  }

  const rules = Object.values(worldbook.entries).find(entry => entry.comment === '[mvu_plot] 变量更新规则').content;
  assert.match(rules, /系统\.雾钟倒计时是剩余分钟数值/, '更新规则必须声明倒计时数值语义');
  assert.match(rules, /_\.add\('系统\.雾钟倒计时', -3\)/, '更新规则必须给出数值倒计时示例');

  const statusPage = fs.readFileSync(path.join(dir, '状态栏.html'), 'utf8');
  assert.match(statusPage, /\$arrayMeta/, '消息前端必须过滤数组元数据载体');
  assert.match(statusPage, /startsWith\('\$'\)|charAt\(0\).*\$/, '消息前端必须过滤对象 $meta 键');
  assert.match(statusPage, /!data\.schema/, '状态栏不能把缺少 schema 的部分对象当成有效 MVU 快照');
  const ejs = fs.readFileSync(path.join(dir, '动态上下文.ejs'), 'utf8');
  assert.match(ejs, /\$arrayMeta/, 'EJS 摘要必须过滤数组元数据载体');
}

async function testEjsBridge() {
  const h = makeHarness();
  const callbacks = h.listeners.get('prompt_template_prepare') || [];
  assert.equal(callbacks.length, 1);
  const context = {};
  await callbacks[0](context);
  assert(context.mvu && context.mvu.stat_data);
  assert.equal(context.mistport.runtime_version, '2.1.0');
}

await testPassiveOpeningContract();
await testMemoRejectsIncompleteSnapshot();
await testInputAndMemo();
await testEjsBridge();
await testMvuPathNormalizer();
await testCapturedVariableRegression();
await testCountdownAndMetadataConsumers();
console.log('runtime contract tests: 7/7');
