import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n$/, '');
const page = read('terminal.html');
const bridge = read('input-bridge.js');
const fence = '```html\n' + page + '\n```';

if (page.includes('```')) throw new Error('terminal.html 不能包含 Markdown fence 终止序列');
const script = page.match(/<script>([\s\S]*?)<\/script>/);
if (!script) throw new Error('terminal.html 缺少页面脚本');
new Function(script[1]);
new Function(bridge);
for (const required of ['PROTOCOL_VERSION', 'getCurrentMessageId', 'include_swipes: true', 'JSON.parse', 'textContent', 'aria-live="polite"', ':focus-visible', '__TH_PAYLOAD_TEST__']) {
  if (!page.includes(required)) throw new Error('terminal.html 缺少合同：' + required);
}
if (!bridge.includes(".replaceAll('|', '\\\\|')") || !bridge.includes("'{{newline}}'")) throw new Error('输入桥缺少 slash 文本转义');

const rules = [
  {
    id: 'b4470bd4-1f55-4627-b79a-606fd9b7f001',
    scriptName: '航站状态 v1 与终端显示',
    findRegex: '/<航站状态\\s+v="1">[\\s\\S]*?<\\/航站状态>\\s*<航站终端\\s*\\/>/g',
    replaceString: fence,
    trimStrings: [], placement: [2], disabled: false, runOnEdit: false, substituteRegex: 0,
    minDepth: null, maxDepth: null, markdownOnly: true, promptOnly: false,
  },
  {
    id: '29b5cc40-477d-4c2e-b880-70a1d7c3ff6f',
    scriptName: '航站状态流式半块隐藏',
    findRegex: '/<航站状态(?:\\s+v="[^"]*")?>(?:(?!<\\/航站状态>)[\\s\\S])*$/g',
    replaceString: '',
    trimStrings: [], placement: [2], disabled: false, runOnEdit: false, substituteRegex: 0,
    minDepth: null, maxDepth: null, markdownOnly: true, promptOnly: false,
  },
  {
    id: 'c93e0434-24ca-4722-8551-638392837c83',
    scriptName: '航站状态闭合待终端标记隐藏',
    findRegex: '/<航站状态\\s+v="1">[\\s\\S]*?<\\/航站状态>\\s*$/g',
    replaceString: '',
    trimStrings: [], placement: [2], disabled: false, runOnEdit: false, substituteRegex: 0,
    minDepth: null, maxDepth: null, markdownOnly: true, promptOnly: false,
  },
  {
    id: 'fae3d694-c8ff-4cd3-9f36-e9916251d926',
    scriptName: '航站终端提示词清理',
    findRegex: '/<航站终端\\s*\\/>/g',
    replaceString: '',
    trimStrings: [], placement: [2], disabled: false, runOnEdit: false, substituteRegex: 0,
    minDepth: null, maxDepth: null, markdownOnly: false, promptOnly: true,
  },
];

const valid = '<航站状态 v="1">\n{"区域":"北栈桥","天气":"小雨","任务":"核对灯标","提示":"外栈桥踏板松动","行动":[{"label":"核对灯标","text":"前往北栈桥核对灯标。"}]}\n</航站状态>\n<航站终端/>';
const fixtures = [
  { id: 'display-complete-v1', input: '正文\n' + valid, placement: 2, depth: 0, channel: 'display', expected_contains: '正文\n```html\n<!doctype html>' },
  { id: 'display-encoded-special-values', input: '正文\n<航站状态 v="1">\n{"区域":"北\\u003C栈桥\\u003E","天气":"小雨\\\\阵风","任务":"核对 \\"旧灯\\"","提示":"包含 \\u0026、$1 与 \\u0060\\u0060\\u0060","行动":[]}\n</航站状态>\n<航站终端/>', placement: 2, depth: 0, channel: 'display', expected_contains: '正文\n```html\n<!doctype html>' },
  { id: 'display-streaming-v1', input: '正文\n<航站状态 v="1">\n{"区域":"北栈桥"', placement: 2, depth: 0, channel: 'display', expected: '正文\n' },
  { id: 'display-closed-before-marker', input: '正文\n<航站状态 v="1">\n{"区域":"北栈桥","天气":"小雨","任务":"核对灯标","行动":[]}\n</航站状态>\n', placement: 2, depth: 0, channel: 'display', expected: '正文\n' },
  { id: 'prompt-preserves-versioned-snapshot', input: '正文\n' + valid, placement: 2, depth: 0, channel: 'prompt', expected: '正文\n<航站状态 v="1">\n{"区域":"北栈桥","天气":"小雨","任务":"核对灯标","提示":"外栈桥踏板松动","行动":[{"label":"核对灯标","text":"前往北栈桥核对灯标。"}]}\n</航站状态>\n' },
  { id: 'display-wrong-version-fails-closed', input: '<航站状态 v="2">{"区域":"旧协议"}</航站状态>\n<航站终端/>', placement: 2, depth: 0, channel: 'display', expected: '<航站状态 v="2">{"区域":"旧协议"}</航站状态>\n<航站终端/>' },
  { id: 'display-similar-marker-untouched', input: '<航站状态旧 v="1">{"区域":"旧"}</航站状态旧>\n<航站终端旧/>', placement: 2, depth: 0, channel: 'display', expected: '<航站状态旧 v="1">{"区域":"旧"}</航站状态旧>\n<航站终端旧/>' },
  { id: 'user-message-untouched', input: valid, placement: 1, depth: 0, channel: 'display', expected: valid },
];

const producer = [
  '[航站终端非变量输出合同 v1]',
  '每条正式 assistant 回复先写自然 RP 正文；需要显示当楼快照时，在正文末尾输出一次且仅一次下列协议，然后停止本次技术载荷：',
  '<航站状态 v="1">',
  '{"区域":"当前可观察区域","天气":"当前可观察天气","任务":"当前可行动任务","提示":"可选的一句当楼提示","行动":[{"label":"按钮短标题","text":"写入玩家输入框、可继续编辑的完整行动文本"}]}',
  '</航站状态>',
  '<航站终端/>',
  'JSON Schema：区域、天气、任务为必填字符串；提示为可选字符串；行动为 0-8 项数组，每项必须含 label 与 text 字符串。不要输出未知字段。',
  '序列化：标签体内只能有一个合法 JSON object；禁止 Markdown fence、注释和尾逗号。字符串中的双引号、反斜线和换行使用标准 JSON 转义。字符串中的小于号、大于号和 & 必须写成 \\u003C、\\u003E、\\u0026，避免形成外层闭合或 HTML。',
  '语义：只写本楼正文已发生或可观察的事实；缺失时使用“未记录”，不得沿用未在本楼确认的旧消息值。行动只是可编辑建议，不代表玩家已经执行。',
  '边界：一条消息最多一个航站状态块；技术 marker 紧跟闭合标签。不要在载荷后追加第二个状态块、变量命令或代码围栏。',
].join('\n');

function entry(uid, comment, content) {
  return {
    uid, key: [], keysecondary: [], comment, content, constant: true, vectorized: false,
    selective: false, selectiveLogic: 0, addMemo: true, order: 100, position: 0, disable: false,
    excludeRecursion: false, preventRecursion: true, delayUntilRecursion: 0, probability: 100,
    useProbability: true, depth: 4, group: '', groupOverride: false, groupWeight: 100,
    scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null,
    automationId: '', role: null, sticky: 0, cooldown: 0, delay: 0, displayIndex: uid,
  };
}

for (const token of ['<航站状态 v="1">', '\\u003C', '区域、天气、任务为必填', '一条消息最多一个航站状态块']) {
  if (!producer.includes(token)) throw new Error('producer 缺少合同：' + token);
}

const worldbook = { entries: { 0: entry(0, '航站终端·非变量消息输出合同', producer) } };
const scriptJson = {
  type: 'script', enabled: false, name: '航站输入桥', id: '8d645d1a-504c-4c2e-8768-f2d698539852',
  content: bridge + '\n', info: '为航站终端提供安全的输入框写入；转义 slash 管线字符，不自动发送。',
  button: { enabled: true, buttons: [] }, data: {}, export_with: { data: true, button: true },
};

const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
write('regex.json', rules);
write('regex.fixtures.json', fixtures);
write('航站终端世界书.json', worldbook);
write('input-bridge.script.json', scriptJson);
console.log('TH non-MVU sample build: 4 files');
