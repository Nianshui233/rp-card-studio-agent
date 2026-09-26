(() => {
  'use strict';

  const VERSION = '2.1.0';
  const POST_WRITE_EVENT = 'mistport_mvu_write_committed';
  const stops = [];
  const hostWindow = window.parent && window.parent !== window ? window.parent : window;

  function fail(message) {
    throw new Error(message);
  }

  function clone(value) {
    if ((typeof _ === 'object' || typeof _ === 'function') && _ && typeof _.cloneDeep === 'function') return _.cloneDeep(value);
    return JSON.parse(JSON.stringify(value));
  }

  function hasMvuSnapshot(value) {
    return Boolean(value
      && typeof value === 'object'
      && value.stat_data && typeof value.stat_data === 'object' && !Array.isArray(value.stat_data)
      && value.schema && typeof value.schema === 'object' && !Array.isArray(value.schema));
  }

  function getContext() {
    const surface = window.SillyTavern || hostWindow.SillyTavern;
    if (!surface) fail('缺少 SillyTavern 宿主接口');
    const context = typeof surface.getContext === 'function' ? surface.getContext() : surface;
    if (!context || !Array.isArray(context.chat)) fail('无法取得当前聊天上下文');
    return context;
  }

  function getChatIdentity() {
    const context = getContext();
    const chatId = typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : context.chatId;
    return {
      chat_id: String(chatId || ''),
      character_id: String(context.characterId ?? ''),
      group_id: String(context.groupId ?? ''),
    };
  }

  function getLastId() {
    if (typeof getLastMessageId === 'function') return Number(getLastMessageId());
    return getContext().chat.length - 1;
  }

  function readInput() {
    try {
      const doc = hostWindow.document || document;
      const input = doc.querySelector('#send_textarea');
      if (!input) return { available: false, value: '' };
      return { available: true, value: String(input.value || '') };
    } catch (_error) {
      return { available: false, value: '' };
    }
  }

  function normalizeText(value, max) {
    return String(value || '')
      .replace(/[<>{}|`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  async function waitForMvu(timeoutMs) {
    if (typeof Mvu === 'object' && Mvu) return;
    if (typeof waitGlobalInitialized !== 'function') fail('MVU 尚未加载，且缺少 waitGlobalInitialized');
    let timer;
    try {
      await Promise.race([
        waitGlobalInitialized('Mvu'),
        new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('等待 MVU 超时')), timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (typeof Mvu !== 'object' || !Mvu) fail('MVU 全局对象不可用');
  }

  async function saveChatVerified() {
    const context = getContext();
    if (typeof context.saveChat !== 'function') fail('宿主缺少 saveChat');
    await context.saveChat();
  }

  async function setInput(text) {
    const value = normalizeText(text, 120);
    if (!value) fail('行动文本为空');
    const current = readInput();
    if (current.available && current.value.trim() && current.value.trim() !== value) {
      return { status: 'conflict', text: value, message: '输入框已有草稿，未覆盖；请复制行动文本或清空草稿后重试。' };
    }
    if (typeof triggerSlash !== 'function') fail('缺少 triggerSlash');
    await triggerSlash('/setinput ' + value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', '{{newline}}'));
    return { status: 'filled', text: value };
  }

  async function writeMemo(messageId, text) {
    const id = Number(messageId);
    const value = normalizeText(text, 80);
    if (!Number.isInteger(id) || id < 0) fail('消息楼层 ID 无效');
    if (!value) fail('手记不能为空');
    await waitForMvu(8000);
    const before = Mvu.getMvuData({ type: 'message', message_id: id });
    if (!hasMvuSnapshot(before)) fail('本楼没有完整 MVU 快照');
    const command = "_.set('玩家备忘.最新', " + JSON.stringify(value) + ");//玩家手记";
    const next = await Mvu.parseMessage(command, before);
    if (!hasMvuSnapshot(next)) fail('MVU 没有接受完整手记快照');
    Mvu.replaceMvuData(next, { type: 'message', message_id: id });
    await saveChatVerified();
    const after = Mvu.getMvuData({ type: 'message', message_id: id });
    if (!hasMvuSnapshot(after) || String(after.stat_data?.玩家备忘?.最新 || '') !== value) fail('保存后完整 MVU 快照同楼读回校验失败');
    if (typeof eventEmit === 'function') await eventEmit(POST_WRITE_EVENT, { message_id: id, path: '玩家备忘.最新' });
    return { status: 'persisted', message_id: id, text: value, stat_data: clone(after.stat_data) };
  }

  async function bindMvuPathNormalizer() {
    await waitForMvu(8000);
    if (typeof eventOn !== 'function' || !Mvu.events || !Mvu.events.COMMAND_PARSED) return;
    const aliases = Object.freeze({
      区域: '世界.区域',
      天气: '世界.天气',
      时段: '世界.时段',
      潮位: '世界.潮位',
      称呼: '玩家.称呼',
      来历: '玩家.来历',
      专长: '玩家.专长',
      行事倾向: '玩家.行事倾向',
      体力: '角色.体力',
      当前任务: '角色.当前任务',
      洛檀信任: '关系.洛檀信任',
      路线: '系统.路线',
      开场状态: '系统.开场状态',
      航站安全度: '系统.航站安全度',
      雾钟倒计时: '系统.雾钟倒计时',
      警报: '系统.警报',
    });
    stops.push(eventOn(Mvu.events.COMMAND_PARSED, function (variables, commands) {
      if (!Array.isArray(commands)) return;
      commands.forEach(function (command) {
        if (!command || !Array.isArray(command.args) || typeof command.args[0] !== 'string') return;
        const fixed = aliases[command.args[0]];
        if (fixed) {
          console.info('[雾港航站] 修正 MVU 简写路径：' + command.args[0] + ' → ' + fixed);
          command.args[0] = fixed;
        }
        if (command.args[0] !== '系统.雾钟倒计时') return;
        const current = variables && variables.stat_data && variables.stat_data.系统 && variables.stat_data.系统.雾钟倒计时;
        if (command.type === 'add' && typeof current === 'string') {
          const currentMatch = current.match(/-?\d+(?:\.\d+)?/);
          const delta = Number(String(command.args[1]).replace(/^['"]|['"]$/g, ''));
          if (currentMatch && Number.isFinite(delta)) {
            command.type = 'set';
            command.args = ['系统.雾钟倒计时', String(Math.max(0, Number(currentMatch[0]) + delta))];
            console.info('[雾港航站] 将旧版字符串倒计时迁移为分钟数值');
          }
        } else if (command.type === 'set') {
          const last = command.args.length - 1;
          const literal = String(command.args[last]);
          const valueMatch = literal.match(/^['"](-?\d+(?:\.\d+)?)分钟['"]$/);
          if (valueMatch) command.args[last] = valueMatch[1];
        }
      });
    }));
  }

  function latestMvuData() {
    if (typeof getChatMessages !== 'function') return null;
    const last = getLastId();
    const messages = getChatMessages('0-' + Math.max(0, last));
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const data = messages[i] && messages[i].data;
      if (hasMvuSnapshot(data)) return clone(data);
    }
    return null;
  }

  bindMvuPathNormalizer().catch(function (error) { console.warn('[雾港航站] MVU 路径修正器未启用', error); });

  if (typeof eventOn === 'function') {
    stops.push(eventOn('prompt_template_prepare', context => {
      context.mvu = latestMvuData();
      context.mistport = { runtime_version: VERSION, chat: getChatIdentity() };
    }));
  }

  const runtimeApi = Object.freeze({ version: VERSION, setInput, writeMemo, post_write_event: POST_WRITE_EVENT });
  hostWindow.MistportRuntime = runtimeApi;
  window.MistportRuntime = runtimeApi;

  addEventListener('pagehide', () => {
    stops.forEach(stop => stop && typeof stop.stop === 'function' && stop.stop());
    if (hostWindow.MistportRuntime === runtimeApi) delete hostWindow.MistportRuntime;
  }, { once: true });
})();
