(() => {
  'use strict';

  const VERSION = '2.0.2';
  const BOOK_NAME = '雾港航站世界书';
  const PROFILE_ENTRY_NAME = '<user>';
  const META_KEY = 'mistport_opening';
  const POST_WRITE_EVENT = 'mistport_mvu_write_committed';
  const captures = new Map();
  const activeCommits = new Map();
  const stops = [];
  const hostWindow = window.parent && window.parent !== window ? window.parent : window;

  function fail(message) {
    throw new Error(message);
  }

  function clone(value) {
    if ((typeof _ === 'object' || typeof _ === 'function') && _ && typeof _.cloneDeep === 'function') return _.cloneDeep(value);
    return JSON.parse(JSON.stringify(value));
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }

  function hash(value) {
    const text = JSON.stringify(stable(value));
    let result = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      result ^= text.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  }

  function uuid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return 'mistport-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
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

  function getFloor0() {
    if (typeof getChatMessages !== 'function') fail('缺少 getChatMessages');
    const floor = getChatMessages(0, { include_swipes: true })[0];
    if (!floor || floor.message_id !== 0) fail('当前聊天缺少第 0 楼');
    if (!Array.isArray(floor.swipes) || !Array.isArray(floor.swipes_data)) fail('第 0 楼缺少 Swipe 数据');
    return floor;
  }

  function floorFingerprint(floor) {
    const swipeId = Number(floor.swipe_id || 0);
    return hash({
      swipe_id: swipeId,
      message: floor.swipes[swipeId] || floor.message || '',
      swipe_count: floor.swipes.length,
      data_count: floor.swipes_data.length,
    });
  }

  function getLastId() {
    if (typeof getLastMessageId === 'function') return Number(getLastMessageId());
    return getContext().chat.length - 1;
  }

  function snapshot() {
    const floor = getFloor0();
    const input = readInput();
    return {
      identity: getChatIdentity(),
      last_message_id: getLastId(),
      swipe_id: Number(floor.swipe_id || 0),
      floor_fingerprint: floorFingerprint(floor),
      input_available: input.available,
      input_hash: hash(input.value),
    };
  }

  function normalizeText(value, max) {
    return String(value || '')
      .replace(/[<>{}|`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  const BACKGROUNDS = {
    clerk: { label: '港务临时抄写员', effect: '熟悉值班表、电报与港务流程' },
    deckhand: { label: '驳船学徒', effect: '熟悉河况、绳结与船上规矩' },
    mechanic: { label: '流动修械师', effect: '熟悉灯具、保险丝与临时修补' },
  };

  const SKILLS = {
    repair: { label: '机械与检修', effect: '处理设备故障时更容易发现具体原因' },
    observe: { label: '水路与观察', effect: '更容易从潮位、声音和航迹中发现异常' },
    rapport: { label: '交涉与人情', effect: '更容易获得港工、船员与洛檀的配合' },
  };

  const APPROACHES = {
    cautious: '谨慎核对风险后行动',
    direct: '先动手解决眼前问题',
    observe: '先观察现场与人物反应',
  };

  const ROUTES = {
    routine: { label: '例行巡灯', target_swipe: 1, task: '核对北栈桥灯标', pressure: '灯标连续第三晚忽明忽暗' },
    rescue: { label: '失联渡船', target_swipe: 2, task: '寻找失联的末班渡船', pressure: '雾钟已经迟到二十分钟' },
    custom: { label: '自定义来意', target_swipe: 0, task: '按玩家来意进入雾港', pressure: '雾正在加重，航站仍按自己的节奏运转' },
  };

  function normalizeDraft(raw) {
    const draft = {
      name: normalizeText(raw && raw.name, 16),
      background: normalizeText(raw && raw.background, 20),
      skill: normalizeText(raw && raw.skill, 20),
      approach: normalizeText(raw && raw.approach, 20),
      route: normalizeText(raw && raw.route, 20),
      custom_goal: normalizeText(raw && raw.custom_goal, 80),
    };
    if (draft.name.length < 1) fail('请填写玩家称呼');
    if (!BACKGROUNDS[draft.background]) fail('玩家来历不是可用选项');
    if (!SKILLS[draft.skill]) fail('玩家专长不是可用选项');
    if (!APPROACHES[draft.approach]) fail('行事倾向不是可用选项');
    if (!ROUTES[draft.route]) fail('开局路线不是可用选项');
    if (draft.route === 'custom' && draft.custom_goal.length < 4) fail('自定义来意至少写 4 个字');
    if (draft.route !== 'custom') draft.custom_goal = '';
    return draft;
  }

  function previewFor(draft) {
    const background = BACKGROUNDS[draft.background];
    const skill = SKILLS[draft.skill];
    const route = ROUTES[draft.route];
    return {
      title: draft.name + ' · ' + route.label,
      profile: draft.name + '以“' + background.label + '”的身份来到航站，擅长' + skill.label + '，通常会' + APPROACHES[draft.approach] + '。',
      route: draft.route === 'custom' ? draft.custom_goal : route.task,
      impact: background.effect + '；' + skill.effect + '；开局压力是“' + route.pressure + '”。',
      fixed_greeting: draft.route !== 'custom',
    };
  }

  async function prepare(rawDraft) {
    if (getLastId() !== 0) fail('开场页只允许在尚未发送消息的新聊天中提交');
    const draft = normalizeDraft(rawDraft);
    const base = snapshot();
    const token = uuid();
    captures.set(token, {
      token,
      created_at: Date.now(),
      base,
      draft,
      draft_hash: hash(draft),
      floor0: clone(getFloor0()),
    });
    return { token, preview: previewFor(draft), base };
  }

  function assertCapture(capture, rawDraft) {
    if (!capture) fail('提交凭证已经失效，请重新预览');
    if (Date.now() - capture.created_at > 10 * 60 * 1000) fail('预览已超过十分钟，请重新预览');
    const draft = normalizeDraft(rawDraft);
    if (hash(draft) !== capture.draft_hash) fail('预览后表单发生变化，请重新预览');
    const now = snapshot();
    if (hash(now.identity) !== hash(capture.base.identity)) fail('聊天或角色已经切换，旧提交已取消');
    if (now.last_message_id !== 0) fail('聊天已经产生新消息，不能再提交旧开场');
    if (now.swipe_id !== capture.base.swipe_id || now.floor_fingerprint !== capture.base.floor_fingerprint) {
      fail('第 0 楼 Greeting 或 Swipe 已变化，请重新预览');
    }
    if (capture.base.input_available && now.input_available && now.input_hash !== capture.base.input_hash) {
      fail('确认期间输入框草稿发生变化；已保留草稿，请重新预览');
    }
    if (typeof builtin === 'object' && builtin && typeof builtin.duringGenerating === 'function' && builtin.duringGenerating()) {
      fail('宿主正在生成，请等待结束后再提交');
    }
    return draft;
  }

  function buildProfile(draft) {
    return [
      '[玩家稳定档案]',
      '称呼：' + draft.name,
      '来历：' + BACKGROUNDS[draft.background].label,
      '专长：' + SKILLS[draft.skill].label,
      '行事倾向：' + APPROACHES[draft.approach],
      '公开来意：' + (draft.route === 'custom' ? draft.custom_goal : ROUTES[draft.route].task),
      '边界：以上是玩家主动确认的公开起点；不得替玩家决定未声明的经历、想法、台词、情感或关键行动。',
    ].join('\n');
  }

  async function readUserEntry() {
    if (typeof getWorldbook !== 'function') fail('缺少 getWorldbook，无法写入玩家档案');
    const entries = await getWorldbook(BOOK_NAME);
    const matches = entries.filter(entry => entry.name === PROFILE_ENTRY_NAME);
    if (matches.length > 1) fail('世界书中存在多个精确命名的 <user> 条目，请先解决冲突');
    return { entries, entry: matches[0] || null };
  }

  async function writeUserProfile(draft) {
    const before = await readUserEntry();
    const content = buildProfile(draft);
    if (!before.entry) {
      if (typeof createWorldbookEntries !== 'function') fail('缺少 createWorldbookEntries');
      const created = await createWorldbookEntries(BOOK_NAME, [{
        name: PROFILE_ENTRY_NAME,
        content,
        enabled: true,
        strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
      }], { render: 'immediate' });
      const entry = created.new_entries[0];
      if (!entry) fail('创建 <user> 条目失败');
      return { mode: 'created', before: null, uid: entry.uid, content };
    }
    if (typeof updateWorldbookWith !== 'function') fail('缺少 updateWorldbookWith');
    const uid = before.entry.uid;
    await updateWorldbookWith(BOOK_NAME, entries => entries.map(entry => entry.uid === uid ? {
      ...entry,
      name: PROFILE_ENTRY_NAME,
      content,
      enabled: true,
      strategy: { ...entry.strategy, type: 'constant', keys: [] },
    } : entry), { render: 'immediate' });
    const after = await readUserEntry();
    if (!after.entry || after.entry.uid !== uid || after.entry.content !== content || !after.entry.enabled) {
      fail('<user> 档案写入后读回校验失败');
    }
    return { mode: 'updated', before: clone(before.entry), uid, content };
  }

  async function restoreUserProfile(change) {
    if (!change) return;
    if (change.mode === 'created') {
      if (typeof deleteWorldbookEntries === 'function') {
        await deleteWorldbookEntries(BOOK_NAME, entry => entry.uid === change.uid && entry.name === PROFILE_ENTRY_NAME, { render: 'immediate' });
      }
      return;
    }
    if (change.mode === 'updated' && change.before && typeof updateWorldbookWith === 'function') {
      await updateWorldbookWith(BOOK_NAME, entries => entries.map(entry => entry.uid === change.uid ? change.before : entry), { render: 'immediate' });
    }
  }

  async function waitForMvu(timeoutMs) {
    if (typeof waitGlobalInitialized !== 'function') fail('缺少 waitGlobalInitialized，请升级 Tavern Helper');
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

  function setPath(object, path, value) {
    if ((typeof _ === 'object' || typeof _ === 'function') && _ && typeof _.set === 'function') {
      _.set(object, path, value);
      return;
    }
    const parts = path.split('.');
    let cursor = object;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  async function applyDraftToData(data, draft) {
    const current = clone(data || {});
    if (!current.stat_data) fail('目标 Greeting Swipe 尚未取得 MVU 初态');
    const commands = [
      "_.set('玩家.称呼', " + JSON.stringify(draft.name) + ");//开场登记",
      "_.set('玩家.来历', " + JSON.stringify(BACKGROUNDS[draft.background].label) + ");//开场登记",
      "_.set('玩家.专长', " + JSON.stringify(SKILLS[draft.skill].label) + ");//开场登记",
      "_.set('玩家.行事倾向', " + JSON.stringify(APPROACHES[draft.approach]) + ");//开场登记",
      "_.set('系统.路线', " + JSON.stringify(ROUTES[draft.route].label) + ");//开场路线",
      "_.set('系统.开场状态', '已提交');//开场事务完成",
    ];
    if (draft.route === 'custom') {
      commands.push(
        "_.set('角色.当前任务', " + JSON.stringify(draft.custom_goal) + ");//自定义来意",
        "_.set('任务.主线.名称', " + JSON.stringify(draft.custom_goal) + ");//自定义来意",
        "_.set('任务.主线.阶段', '抵达航站');//动态开场",
        "_.set('世界.区域', '北航站值班室');//动态开场",
      );
    }
    const next = await Mvu.parseMessage(commands.join('\n'), current);
    if (!next || !next.stat_data) fail('MVU 未接受开场初态更新');
    return next;
  }
  function dynamicGreeting(draft) {
    return [
      '值班室的门被河风推开一条缝。雾贴着栈桥爬进来，电报机旁的铜铃轻轻碰了一下。',
      '',
      '洛檀从水位尺记录上抬起眼，看向自称“' + draft.name + '”的来客。她没有替你下结论，只把一盏备用风灯推到桌边。',
      '',
      '“' + draft.custom_goal + '？”她复述了一遍你的来意，目光越过你望向雾里的河面。“可以谈。但先别挡着窗——今晚有东西不太对。”',
      '',
      '<航站通知 类型="线索">自定义来意已写入玩家档案；雾港的既有时刻表和人物日程仍会继续推进。</航站通知>',
      '',
      '<航站面板/>',
    ].join('\n');
  }

  async function saveChatVerified() {
    const context = getContext();
    if (typeof context.saveChat !== 'function') fail('宿主缺少 saveChat');
    await context.saveChat();
  }

  async function writeTargetSwipe(draft) {
    await waitForMvu(8000);
    const route = ROUTES[draft.route];
    const target = route.target_swipe;
    let floor = getFloor0();
    if (target < 0 || target >= floor.swipes.length) fail('目标 Greeting Swipe 不存在');

    if (Number(floor.swipe_id || 0) !== target) {
      await setChatMessages([{ message_id: 0, swipe_id: target }], { refresh: 'affected' });
      await saveChatVerified();
      floor = getFloor0();
      if (Number(floor.swipe_id || 0) !== target) fail('目标 Greeting Swipe 切换后读回失败');
    }

    const swipes = floor.swipes.slice();
    const swipesData = floor.swipes_data.slice();
    swipesData[target] = await applyDraftToData(swipesData[target], draft);
    const patch = { message_id: 0, swipes_data: swipesData };
    if (draft.route === 'custom') {
      swipes[target] = dynamicGreeting(draft);
      patch.swipes = swipes;
      patch.message = swipes[target];
    }
    await setChatMessages([patch], { refresh: 'affected' });
    await saveChatVerified();

    floor = getFloor0();
    const storedData = floor.swipes_data[target];
    const stored = storedData && storedData.stat_data;
    if (!stored || stored.玩家?.称呼 !== draft.name || stored.系统?.开场状态 !== '已提交') {
      fail('目标 Swipe 初态保存后读回失败');
    }
    if (storedData.display_data?.玩家?.称呼 === '待登记') {
      fail('目标 Swipe 的 display_data 仍停留在旧玩家档案');
    }
    if (draft.route === 'custom' && !String(floor.swipes[target] || '').includes('<航站面板/>')) {
      fail('动态 Greeting 写入后读回失败');
    }
    return { target_swipe: target, floor: clone(floor) };
  }

  async function restoreFloor0(original) {
    if (!original) return;
    await setChatMessages([{
      message_id: 0,
      swipe_id: Number(original.swipe_id || 0),
      swipes: original.swipes,
      swipes_data: original.swipes_data,
      swipes_info: original.swipes_info,
      message: original.swipes[Number(original.swipe_id || 0)] || original.message,
    }], { refresh: 'affected' });
    await saveChatVerified();
  }

  function writeMetadata(value) {
    const context = getContext();
    if (typeof context.updateChatMetadata !== 'function' || typeof context.saveMetadata !== 'function') return Promise.resolve(false);
    context.updateChatMetadata({ [META_KEY]: value }, false);
    return context.saveMetadata().then(() => true);
  }

  function notify(kind, text) {
    const surface = window.toastr || hostWindow.toastr;
    if (surface && typeof surface[kind] === 'function') surface[kind](text, '雾港航站');
    else console[kind === 'error' ? 'error' : 'log']('[雾港航站] ' + text);
  }

  function escapeSlashText(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, '{{newline}}');
  }

  function openingMessage(draft) {
    return [
      '【雾港航站开局】',
      '我叫' + draft.name + '，来历是' + BACKGROUNDS[draft.background].label + '。',
      '我擅长' + SKILLS[draft.skill].label + '，通常会' + APPROACHES[draft.approach] + '。',
      '我今晚来到这里，是为了：' + draft.custom_goal + '。',
      '请从洛檀此刻可观察到的事实继续，不替我决定行动。',
    ].join('\n');
  }

  async function waitForDynamicChain(identity, userText, timeoutMs) {
    const started = Date.now();
    let userMessage = null;
    let assistantMessage = null;
    while (Date.now() - started < timeoutMs) {
      if (hash(getChatIdentity()) !== hash(identity)) fail('生成期间聊天已切换');
      const last = getLastId();
      if (last >= 1) {
        const messages = getChatMessages('1-' + last);
        userMessage = messages.find(message => message.role === 'user' && String(message.message || '').trim() === userText.trim()) || userMessage;
        if (userMessage) {
          assistantMessage = messages.find(message => message.role === 'assistant' && message.message_id > userMessage.message_id) || assistantMessage;
        }
        if (assistantMessage) {
          try {
            const data = Mvu.getMvuData({ type: 'message', message_id: assistantMessage.message_id });
            if (data && data.stat_data) return { user: userMessage, assistant: assistantMessage };
          } catch (_error) {
            // 等待 MVU 把 assistant 楼变量写入存储。
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    return { user: userMessage, assistant: assistantMessage };
  }

  async function runDynamicChain(commitId, draft, identity) {
    if (typeof triggerSlash !== 'function') fail('缺少 triggerSlash，无法走正常发送链');
    const text = openingMessage(draft);
    await writeMetadata({ version: VERSION, commit_id: commitId, route: draft.route, phase: 'sending', committed: false });
    await triggerSlash('/send ' + escapeSlashText(text) + ' | /trigger');
    const result = await waitForDynamicChain(identity, text, 120000);
    if (!result.user) fail('未检测到真实玩家消息');
    if (!result.assistant) {
      await writeMetadata({ version: VERSION, commit_id: commitId, route: draft.route, phase: 'awaiting_ai', committed: false, user_message_id: result.user.message_id });
      notify('warning', '玩家开局消息已保存，但未检测到 AI 回复；可在酒馆中手动点击继续生成。');
      return { status: 'awaiting_ai', user_message_id: result.user.message_id };
    }
    await writeMetadata({
      version: VERSION,
      commit_id: commitId,
      route: draft.route,
      phase: 'committed',
      committed: true,
      user_message_id: result.user.message_id,
      assistant_message_id: result.assistant.message_id,
    });
    notify('success', '自定义开局已进入真实 user → AI → MVU 消息链。');
    return { status: 'committed', user_message_id: result.user.message_id, assistant_message_id: result.assistant.message_id };
  }

  async function commit(token, rawDraft) {
    if (activeCommits.has(token)) return activeCommits.get(token);
    const task = (async () => {
      const capture = captures.get(token);
      const draft = assertCapture(capture, rawDraft);
      captures.delete(token);
      const commitId = uuid();
      const originalFloor = capture.floor0;
      let profileChange = null;
      let stateWritten = false;
      try {
        profileChange = await writeUserProfile(draft);
        await writeTargetSwipe(draft);
        stateWritten = true;
        if (draft.route !== 'custom') {
          await writeMetadata({ version: VERSION, commit_id: commitId, route: draft.route, phase: 'committed', committed: true, swipe_id: ROUTES[draft.route].target_swipe });
          notify('success', '固定开局、玩家档案与目标 Swipe 初态均已保存。');
          return { status: 'committed', route: draft.route, target_swipe: ROUTES[draft.route].target_swipe };
        }
        return await runDynamicChain(commitId, draft, capture.base.identity);
      } catch (error) {
        const hasMessages = getLastId() > 0;
        if (!hasMessages) {
          try { if (stateWritten || floorFingerprint(getFloor0()) !== floorFingerprint(originalFloor)) await restoreFloor0(originalFloor); } catch (rollbackError) { console.error('[雾港航站] 第0楼回滚失败', rollbackError); }
          try { await restoreUserProfile(profileChange); } catch (rollbackError) { console.error('[雾港航站] 玩家档案回滚失败', rollbackError); }
        }
        await writeMetadata({ version: VERSION, commit_id: commitId, route: draft.route, phase: hasMessages ? 'recoverable' : 'rolled_back', committed: false, error: String(error.message || error) }).catch(() => false);
        notify('error', '开场提交失败：' + String(error.message || error));
        throw error;
      } finally {
        activeCommits.delete(token);
      }
    })();
    activeCommits.set(token, task);
    return task;
  }

  function getOpeningStatus() {
    const context = getContext();
    return clone(context.chatMetadata && context.chatMetadata[META_KEY] || null);
  }

  async function setInput(text) {
    const value = normalizeText(text, 120);
    if (!value) fail('行动文本为空');
    const current = readInput();
    if (current.available && current.value.trim() && current.value.trim() !== value) {
      return { status: 'conflict', text: value, message: '输入框已有草稿，未覆盖；请复制行动文本或清空草稿后重试。' };
    }
    if (typeof triggerSlash !== 'function') fail('缺少 triggerSlash');
    await triggerSlash('/setinput ' + escapeSlashText(value));
    return { status: 'filled', text: value };
  }

  async function writeMemo(messageId, text) {
    const id = Number(messageId);
    const value = normalizeText(text, 80);
    if (!Number.isInteger(id) || id < 0) fail('消息楼层 ID 无效');
    if (!value) fail('手记不能为空');
    await waitForMvu(8000);
    const before = Mvu.getMvuData({ type: 'message', message_id: id });
    if (!before || !before.stat_data) fail('本楼没有 MVU 快照');
    const command = "_.set('玩家备忘.最新', " + JSON.stringify(value) + ");//玩家手记";
    const next = await Mvu.parseMessage(command, before);
    if (!next || !next.stat_data) fail('MVU 没有接受本次手记更新');
    Mvu.replaceMvuData(next, { type: 'message', message_id: id });
    await saveChatVerified();
    const after = Mvu.getMvuData({ type: 'message', message_id: id });
    if (String(after?.stat_data?.玩家备忘?.最新 || '') !== value) fail('保存后同楼读回校验失败');
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
      if (data && data.stat_data && data.schema) return clone(data);
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

  const openingApi = Object.freeze({ version: VERSION, prepare, commit, getStatus: getOpeningStatus });
  const runtimeApi = Object.freeze({ version: VERSION, setInput, writeMemo, post_write_event: POST_WRITE_EVENT });
  hostWindow.MistportOpening = openingApi;
  hostWindow.MistportRuntime = runtimeApi;
  window.MistportOpening = openingApi;
  window.MistportRuntime = runtimeApi;

  addEventListener('pagehide', () => {
    stops.forEach(stop => stop && typeof stop.stop === 'function' && stop.stop());
    if (hostWindow.MistportOpening === openingApi) delete hostWindow.MistportOpening;
    if (hostWindow.MistportRuntime === runtimeApi) delete hostWindow.MistportRuntime;
  }, { once: true });
})();
