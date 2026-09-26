function listEntries(worldbook) {
  const entries = worldbook?.entries;
  return Array.isArray(entries) ? entries : entries && typeof entries === 'object' ? Object.values(entries) : [];
}

function cardData(card) { return card?.data && typeof card.data === 'object' ? card.data : card || {}; }

function embeddedScripts(card) {
  const scripts = cardData(card)?.extensions?.tavern_helper?.scripts;
  return Array.isArray(scripts) ? scripts : [];
}

function folderScripts(folder) { return folder?.type === 'folder' && Array.isArray(folder.scripts) ? folder.scripts : []; }

function dedupeByContent(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item?.name || ''}\u0000${item?.content || ''}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}


function dedupeRegex(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item?.id ?? item?.script_id ?? ''}\u0000${item?.findRegex || ''}\u0000${item?.replaceString || ''}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function embeddedRegex(card) {
  const rules = cardData(card)?.extensions?.regex_scripts;
  return Array.isArray(rules) ? rules : [];
}

function externalRegex(regex) { return Array.isArray(regex) ? regex : regex ? [regex] : []; }

function isPinnedGithubUrl(source, repoName) {
  const urls = String(source || '').match(/https?:\/\/[^'"\s]+/g) || [];
  const relevant = urls.filter(url => url.includes(repoName));
  return relevant.length > 0 && relevant.every(url => {
    const ref = url.match(/@([^/]+)\//)?.[1];
    if (!ref || /^(?:main|master|head|latest|dev|develop)$/i.test(ref)) return false;
    return /^[0-9a-f]{40}$/i.test(ref) || /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref);
  });
}

function extractSchemaObjectBody(source) {
  const marker = 'export const Schema = z.object({';
  const start = source.indexOf(marker);
  if (start < 0) return null;
  let depth = 1;
  let quote = null;
  let escaped = false;
  const bodyStart = start + marker.length;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, i);
    }
  }
  return null;
}

export function extractZodTopLevelKeys(source) {
  const body = extractSchemaObjectBody(String(source || ''));
  if (body == null) return [];
  const keys = [];
  let depth = 0;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (depth === 0 && trimmed && !trimmed.startsWith('//')) {
      const match = trimmed.match(/^(?:"([^"]+)"|'([^']+)'|([\p{L}_$][\p{L}\p{N}_$]*))\s*:/u);
      if (match) keys.push(match[1] || match[2] || match[3]);
    }
    let quote = null; let escaped = false;
    for (const ch of line) {
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{' || ch === '(' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    }
  }
  return [...new Set(keys)];
}

export function extractYamlTopLevelKeys(text) {
  const keys = [];
  for (const line of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.trimStart().startsWith('#') || line.trimStart().startsWith('- ')) continue;
    const match = line.match(/^(?:"([^"]+)"|'([^']+)'|([^:#][^:]*?)):\s*(?:.*)$/);
    if (match) keys.push((match[1] || match[2] || match[3]).trim());
  }
  return [...new Set(keys)];
}

function greetingTexts(card) {
  const data = cardData(card);
  return [data.first_mes, ...(Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [])]
    .filter(value => typeof value === 'string');
}

function isPureCarrier(text) { return /^\s*<[\p{L}\p{N}_-]+\s*\/?>(?:\s*)$/u.test(text); }
function playableGreetings(card) { return greetingTexts(card).filter(text => !isPureCarrier(text)); }
function initvarBody(text) { return String(text).match(/<initvar>([\s\S]*?)<\/initvar>/i)?.[1] ?? null; }

function entryText(entry) { return `${entry?.comment || ''}\n${entry?.content || ''}`; }
function findEntry(entries, pattern) { return entries.find(entry => pattern.test(entryText(entry))); }
function allKeysMentioned(text, keys) { return keys.filter(key => !String(text).includes(key)); }


export function extractIndexedPaths(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim().match(/^(\/[^\s；;]+)/)?.[1]).filter(Boolean);
}

export function pathPattern(indexedPath) {
  const placeholders = new Set(['角色姓名', '物品名', '物品名称', '技能名称', '区域名称', '防御措施名称', '载具名称', '改装方案名', '装备名称', '势力名称', '情报键名', '频道号', '地点编号', '丧尸命名']);
  const parts = indexedPath.split('/').slice(1).map(part => {
    if (part === '0') return '(?:\d+|-)';
    if (placeholders.has(part)) return '[^/]+';
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp('^/' + parts.join('/') + '$');
}

export function extractOutputPaths(text) {
  return [...String(text || '').matchAll(/"(?:path|from|to)"\s*:\s*"([^"]+)"/g)].map(match => match[1]);
}

function findDialect(outputText) {
  const jsonPatch = /<JSONPatch>|"op"\s*:\s*"(?:replace|delta|insert|remove|move)"/i.test(outputText);
  const lodash = /_\.(?:set|add|assign|insert|remove|unset|delete|replace|push|pop|shift|inc|dec|toggle)\s*\(/.test(outputText);
  if (jsonPatch && lodash) return 'mixed';
  if (jsonPatch) return 'json_patch';
  if (lodash) return 'lodash';
  return 'unknown';
}

function compareEmbeddedExternalWorldbook(card, worldbook, issues) {
  const embedded = cardData(card)?.character_book?.entries;
  const external = listEntries(worldbook);
  if (!Array.isArray(embedded) || !external.length) return;
  const externalByComment = new Map(external.map(entry => [entry.comment, entry]));
  for (const entry of embedded) {
    const other = externalByComment.get(entry.comment);
    if (!other) { issues.push(`卡内 CharacterBook 条目“${entry.comment}”在独立世界书中缺失`); continue; }
    if (String(entry.content || '') !== String(other.content || '')) issues.push(`卡内与独立世界书条目“${entry.comment}”正文漂移`);
    const embeddedKeys = entry.keys ?? entry.key ?? [];
    const externalKeys = other.key ?? other.keys ?? [];
    if (JSON.stringify(embeddedKeys) !== JSON.stringify(externalKeys)) issues.push(`卡内与独立世界书条目“${entry.comment}”关键词漂移`);
  }
}

function compareEmbeddedExternalScripts(card, folder, issues) {
  const embedded = embeddedScripts(card);
  const external = folderScripts(folder);
  if (!embedded.length || !external.length) return;
  const byName = new Map(external.map(script => [script.name, script]));
  for (const script of embedded) {
    const other = byName.get(script.name);
    if (!other) { issues.push(`卡内 Tavern Helper 脚本“${script.name}”在 ScriptFolder 中缺失`); continue; }
    if (String(script.content || '') !== String(other.content || '')) issues.push(`卡内与 ScriptFolder 脚本“${script.name}”内容漂移`);
  }
}


export function parseMvuContract(text) {
  const result = { requiredEntries: {} };
  let section = null;
  for (const raw of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const rootValue = line.match(/^  (mode|init_strategy|update_dialect):\s*["']?([^"'\s]+)["']?\s*$/);
    if (rootValue) { result[rootValue[1]] = rootValue[2]; section = null; continue; }
    const sectionLine = line.match(/^  ([A-Za-z_]+):\s*$/);
    if (sectionLine) { section = ['loader', 'zod', 'required_worldbook_entries'].includes(sectionLine[1]) ? sectionLine[1] : null; continue; }
    const nested = line.match(/^    ([A-Za-z_]+):\s*["']?(.*?)["']?\s*$/);
    if (!nested || !section) continue;
    const [, key, value] = nested;
    if (section === 'required_worldbook_entries') result.requiredEntries[key] = value;
    else {
      result[section] ||= {};
      result[section][key] = value;
    }
  }
  return result;
}

export function detectMvuMode(input) {
  const scripts = [...embeddedScripts(input.card), ...folderScripts(input.scriptFolder)];
  if (scripts.some(script => /registerMvuSchema\s*\(/.test(script.content || ''))) return 'mvu_zod';
  if (scripts.some(script => /MagVarUpdate(?:@[^/\s]+)?\/artifact\/bundle\.js/i.test(script.content || ''))) return 'native_schema';
  const entries = listEntries(input.worldbook);
  if (entries.some(entry => /\[mvu_(?:plot|update)\]|\[initvar\]/i.test(entryText(entry))) || greetingTexts(input.card).some(text => /<initvar>/i.test(text))) return 'native_schema';
  return 'none';
}

export function validateMvuPackage(input, options = {}) {
  const issues = [];
  const warnings = [];
  const mode = options.mode || input.mvuMode || detectMvuMode(input);
  const initStrategy = options.initStrategy || input.mvuInitStrategy || 'auto';
  const expectedDialect = options.dialect || input.mvuDialect || null;
  if (!['none', 'native_schema', 'mvu_zod'].includes(mode)) issues.push(`未知 MVU mode: ${mode}`);
  if (mode === 'none') return { ok: issues.length === 0, issues, warnings, mode, initStrategy: 'not_applicable' };
  const contract = input.mvuContract || null;
  if (!contract) issues.push('MVU 项目缺少 配置/MVU运行合同.yaml');
  if (contract?.mode && contract.mode !== mode) issues.push(`MVU运行合同 mode=${contract.mode} 与验证 mode=${mode} 不一致`);
  if (contract?.init_strategy && initStrategy !== 'auto' && contract.init_strategy !== initStrategy) issues.push(`MVU运行合同 init_strategy=${contract.init_strategy} 与验证参数 ${initStrategy} 不一致`);
  if (contract?.update_dialect && expectedDialect && contract.update_dialect !== expectedDialect) issues.push(`MVU运行合同 update_dialect=${contract.update_dialect} 与验证参数 ${expectedDialect} 不一致`);

  const scripts = dedupeByContent([...embeddedScripts(input.card), ...folderScripts(input.scriptFolder)]);
  const loaders = scripts.filter(script => /MagVarUpdate(?:@[^/\s]+)?\/artifact\/bundle\.js/i.test(script.content || ''));
  const zodScripts = scripts.filter(script => /registerMvuSchema\s*\(/.test(script.content || ''));
  if (loaders.length !== 1) issues.push(`MVU 制品必须且只能有 1 个 Loader，实际 ${loaders.length}`);
  if (contract?.loader?.url && loaders[0] && !String(loaders[0].content || '').includes(contract.loader.url)) issues.push('MVU Loader 与运行合同锁定 URL 不一致');
  if (loaders[0] && !isPinnedGithubUrl(loaders[0].content, 'MagVarUpdate')) issues.push('MagVarUpdate Loader URL 未锁定 tag/commit');

  if (mode === 'mvu_zod') {
    if (zodScripts.length !== 1) issues.push(`MVU_ZOD 必须且只能有 1 个 registerMvuSchema 脚本，实际 ${zodScripts.length}`);
    if (typeof input.zodSource !== 'string' || !input.zodSource.trim()) issues.push('MVU_ZOD 缺少可读 Zod Schema 源文件');
    else if (zodScripts[0] && input.zodSource.trim().replace(/\r\n/g, '\n') !== String(zodScripts[0].content || '').trim().replace(/\r\n/g, '\n')) issues.push('可读 Zod Schema 源与可导入 ZOD 脚本内容漂移');
  } else if (zodScripts.length) warnings.push(`${mode} 路线检测到 Zod 注册脚本；请确认不是误装或把 mode 改为 mvu_zod`);

  for (const collection of [embeddedScripts(input.card), folderScripts(input.scriptFolder)]) {
    if (!collection.length) continue;
    const loaderIndex = collection.findIndex(script => /MagVarUpdate(?:@[^/\s]+)?\/artifact\/bundle\.js/i.test(script.content || ''));
    const zodIndex = collection.findIndex(script => /registerMvuSchema\s*\(/.test(script.content || ''));
    if (loaderIndex >= 0 && zodIndex >= 0 && loaderIndex > zodIndex) issues.push('Script 顺序错误：MVU Loader 必须位于 ZOD 注册脚本之前');
  }

  let schemaKeys = [];
  if (contract?.zod?.provider_url && zodScripts[0] && !String(zodScripts[0].content || '').includes(contract.zod.provider_url)) issues.push('ZOD provider URL 与运行合同不一致');

  if (zodScripts[0]) {
    const source = String(zodScripts[0].content || '');
    if (!/import\s*\{\s*registerMvuSchema\s*\}/.test(source)) issues.push('Zod 脚本缺少 registerMvuSchema import');
    if ((source.match(/registerMvuSchema\s*\(\s*Schema\s*\)/g) || []).length !== 1) issues.push('Zod 脚本必须且只能调用一次 registerMvuSchema(Schema)');
    if (!/export\s+const\s+Schema\s*=\s*z\.object\s*\(/.test(source)) issues.push('Zod 脚本缺少 export const Schema = z.object(...)');
    if (!/\$\s*\(\s*\(\)\s*=>[\s\S]*registerMvuSchema\s*\(\s*Schema\s*\)/.test(source) && !/waitGlobalInitialized[\s\S]*registerMvuSchema\s*\(\s*Schema\s*\)/.test(source)) issues.push('Zod Schema 未在宿主 Ready 后注册');
    if (!isPinnedGithubUrl(source, 'tavern_resource')) issues.push('mvu_zod.js URL 未锁定 tag/commit');
    schemaKeys = extractZodTopLevelKeys(source);
    if (!schemaKeys.length) issues.push('无法从 Zod 脚本提取顶层 Schema 键');
  }

  const entries = listEntries(input.worldbook);
  for (const [key, comment] of Object.entries(contract?.requiredEntries || {})) {
    if (comment && !entries.some(entry => String(entry.comment || '') === comment)) issues.push(`MVU运行合同要求的世界书条目缺失：${key}=${comment}`);
  }
  const baseline = findEntry(entries, /\[initvar\]/i);
  const greetings = playableGreetings(input.card);
  const greetingsWithInit = greetings.filter(text => initvarBody(text) != null);
  const resolvedStrategy = initStrategy === 'auto' ? (greetings.length && greetingsWithInit.length === greetings.length ? 'greeting' : baseline ? 'worldbook' : 'missing') : initStrategy;
  if (resolvedStrategy === 'greeting') {
    if (!greetings.length) issues.push('greeting 初始化策略没有可游玩 Greeting');
    greetings.forEach((text, index) => {
      const body = initvarBody(text);
      if (body == null) { issues.push(`可游玩 Greeting ${index} 缺少完整 <initvar>`); return; }
      const keys = extractYamlTopLevelKeys(body);
      if (!keys.length) issues.push(`Greeting ${index} 的 <initvar> 无法提取顶层键`);
      if (schemaKeys.length) {
        const missing = schemaKeys.filter(key => !keys.includes(key));
        const extra = keys.filter(key => !schemaKeys.includes(key));
        if (missing.length) issues.push(`Greeting ${index} initvar 缺少 Schema 顶层键：${missing.join('、')}`);
        if (extra.length) issues.push(`Greeting ${index} initvar 含 Schema 外顶层键：${extra.join('、')}`);
      }
    });
  } else if (resolvedStrategy === 'worldbook') {
    if (!baseline) issues.push('worldbook 初始化策略缺少 [initvar] 条目');
    const keys = extractYamlTopLevelKeys(baseline?.content || '');
    if (schemaKeys.length) {
      const missing = schemaKeys.filter(key => !keys.includes(key));
      if (missing.length) issues.push(`[initvar] 基线缺少 Schema 顶层键：${missing.join('、')}`);
    }
    for (const [index, text] of greetings.entries()) {
      const body = initvarBody(text);
      if (body == null) continue;
      const keys2 = extractYamlTopLevelKeys(body);
      const missing = schemaKeys.filter(key => !keys2.includes(key));
      if (missing.length) issues.push(`Greeting ${index} 提供了部分 initvar 覆盖但缺少：${missing.join('、')}`);
    }
  } else issues.push('MVU 项目没有确定、完整的初始化策略');

  const rulesEntry = findEntry(entries, /\[mvu_update\][\s\S]*变量更新规则|变量更新规则[\s\S]*\[mvu_update\]/i) || findEntry(entries, /变量更新规则/i);
  const indexEntry = findEntry(entries, /format_message_variable::stat_data/i);
  const outputEntry = findEntry(entries, /变量输出格式[\s\S]*<UpdateVariable>/i);
  if (!rulesEntry) issues.push('世界书缺少详细的变量更新规则条目');
  if ((mode === 'mvu_zod') && !indexEntry) issues.push('MVU_ZOD 世界书缺少当前 stat_data 注入与变量路径索引条目');
  if (!outputEntry) issues.push('世界书缺少精确的变量输出格式条目');

  if (schemaKeys.length && rulesEntry) {
    const rulesText = String(rulesEntry.content || '');
    const missing = allKeysMentioned(rulesText, schemaKeys);
    if (missing.length) issues.push(`变量更新规则未覆盖 Schema 顶层键：${missing.join('、')}`);
    if ((mode === 'mvu_zod') && rulesText.length < Math.max(1000, schemaKeys.length * 120)) issues.push('MVU_ZOD 变量更新规则过于简略，未达到逐状态根指导所需的信息量');
    if ((mode === 'mvu_zod') && !/更新条件|check/i.test(rulesText)) issues.push('MVU_ZOD 变量更新规则缺少明确更新条件');
    if ((mode === 'mvu_zod') && !/不更新|禁止|只读|不得/.test(rulesText)) issues.push('MVU_ZOD 变量更新规则缺少不更新/只读边界');
    if ((mode === 'mvu_zod') && !/Record/.test(rulesText)) issues.push('MVU_ZOD 变量更新规则缺少 Record 更新语义');
    if ((mode === 'mvu_zod') && !/Array|数组/.test(rulesText)) issues.push('MVU_ZOD 变量更新规则缺少 Array 更新语义');
  }
  if (schemaKeys.length && indexEntry) {
    const indexText = String(indexEntry.content || '');
    const missing = allKeysMentioned(indexText, schemaKeys);
    if (missing.length) issues.push(`变量路径索引未覆盖 Schema 顶层键：${missing.join('、')}`);
    if (!/format_message_variable::stat_data/.test(indexText)) issues.push('变量路径索引缺少当前 stat_data 注入');
    if ((mode === 'mvu_zod') && indexText.length < Math.max(400, schemaKeys.length * 60)) issues.push('MVU_ZOD 变量路径索引过于简略');
  }

  const outputText = String(outputEntry?.content || '');
  const dialect = findDialect(outputText);
  if ((mode === 'mvu_zod') && outputText.length < 500) issues.push('MVU_ZOD 变量输出格式过于简略，缺少操作和路径示例');
  if (!/<Analysis>[\s\S]*<\/Analysis>/i.test(outputText)) issues.push('变量输出格式缺少 <Analysis> 合同');
  if ((mode === 'mvu_zod') && !/变量列表|路径索引|path/i.test(outputText)) issues.push('MVU_ZOD 输出格式没有引用变量路径索引/合法 path 合同');
  if (dialect === 'unknown') issues.push('变量输出格式没有声明可识别的 JSON Patch 或 lodash 方言');
  if (dialect === 'mixed') issues.push('变量输出格式混用了 JSON Patch 与 lodash 命令方言');
  if (expectedDialect && dialect !== expectedDialect) issues.push(`变量输出方言与运行合同不一致：合同 ${expectedDialect}，实际 ${dialect}`);
  if (dialect === 'json_patch' && indexEntry) {
    const patterns = extractIndexedPaths(indexEntry.content).map(pathPattern);
    for (const outputPath of extractOutputPaths(outputText)) {
      if (!patterns.some(pattern => pattern.test(outputPath))) issues.push(`变量输出格式示例路径不在变量索引中：${outputPath}`);
    }
  }

  const regex = dedupeRegex([...embeddedRegex(input.card), ...externalRegex(input.regex)]);
  const findTexts = regex.map(rule => String(rule.findRegex || '')).join('\n');
  if (!/UpdateVariable/.test(findTexts)) issues.push('Regex 缺少 <UpdateVariable> 的 display/prompt 清理消费者');
  if ((greetingsWithInit.length || baseline) && !/initvar/i.test(findTexts)) issues.push('Regex 缺少 <initvar> 显示隐藏规则');
  if (greetings.some(text => /<StatusPlaceHolderImpl\s*\/>/.test(text)) && !/StatusPlaceHolderImpl/.test(findTexts)) issues.push('存在状态栏占位符但 Regex 没有对应消费者');

  compareEmbeddedExternalWorldbook(input.card, input.worldbook, issues);
  compareEmbeddedExternalScripts(input.card, input.scriptFolder, issues);

  return { ok: issues.length === 0, issues, warnings, mode, initStrategy: resolvedStrategy, schemaKeys, dialect, expectedDialect };
}

