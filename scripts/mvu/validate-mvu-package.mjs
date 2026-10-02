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
function findEntry(entries, pattern) {
  return entries
    .filter(entry => pattern.test(entryText(entry)))
    .sort((a, b) => entryText(b).length - entryText(a).length)[0];
}


function allKeysMentioned(text, keys) { return keys.filter(key => !String(text).includes(key)); }
function hasDynamicStateInjection(text) {
  return /format_message_variable::stat_data|<status_current_variables[\s\S]*stat_data/i.test(String(text || ''));
}
function hasRecordSemantics(text) {
  return /\bRecord\b|动态键|对象键|编号或代号|数量归零|归入.*分类|键下|字典/i.test(String(text || ''));
}
function hasArraySemantics(text) {
  return /\bArray\b|数组|列表|索引|末尾追加|\binsert\b|\bremove\b|\bmove\b/i.test(String(text || ''));
}


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

function validateJsonPatchExamples(text, issues) {
  const blocks = [...String(text || '').matchAll(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/gi)];
  for (const match of blocks) {
    let operations;
    try { operations = JSON.parse(match[1]); } catch { issues.push('JSON Patch 示例不是合法 JSON 数组'); continue; }
    if (!Array.isArray(operations)) { issues.push('JSON Patch 示例必须是数组'); continue; }
    for (const [index, operation] of operations.entries()) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) { issues.push(`JSON Patch 操作 ${index} 不是对象`); continue; }
      if (!['replace', 'delta', 'insert', 'add', 'remove', 'move'].includes(operation.op)) issues.push(`JSON Patch 操作 ${index} 使用未知 op：${operation.op}`);
      if (typeof operation.path !== 'string' && operation.op !== 'move') issues.push(`JSON Patch 操作 ${index} 缺少 path`);
      if (operation.op === 'move' && (typeof operation.from !== 'string' || typeof operation.path !== 'string')) issues.push(`JSON Patch 操作 ${index} 的 move 必须同时提供 from/path`);
      if (operation.op === 'delta' && typeof operation.value !== 'number') issues.push(`JSON Patch 操作 ${index} 的 delta value 必须是 number`);
      if (['replace', 'delta', 'insert', 'add'].includes(operation.op) && !Object.prototype.hasOwnProperty.call(operation, 'value')) issues.push(`JSON Patch 操作 ${index} 缺少 value`);
    }
  }
}

function findDialect(outputText) {
  const jsonPatch = /<JSONPatch>[\s\S]*?<\/JSONPatch>/i.test(outputText);
  const lodash = /_\.(?:set|add|assign|insert|remove|unset|delete|replace|push|pop|shift|inc|dec|toggle)\s*\(/.test(outputText);
  if (jsonPatch && lodash) return 'mixed';
  if (jsonPatch) return 'json_patch';
  if (lodash) return 'lodash';
  return 'unknown';
}

function regexField(rule, camel, snake) {
  return rule?.[camel] ?? rule?.[snake];
}

function validateMvuRegexBoundaries(regexes, issues) {
  for (const rule of regexes) {
    const find = String(rule?.findRegex ?? rule?.find_regex ?? '');
    const replace = String(rule?.replaceString ?? rule?.replace_string ?? '');
    const technicalMarker = /<\s*(?:UpdateVariable|initvar|StatusPlaceHolderImpl|status_current_variable)\b/i.test(`${find}\n${replace}`);
    const promptOnly = regexField(rule, 'promptOnly', 'prompt_only') === true
      || (rule?.destination?.prompt === true && rule?.destination?.display !== true);
    const runOnEdit = regexField(rule, 'runOnEdit', 'run_on_edit') === true;
    if (technicalMarker && promptOnly) {
      issues.push(`MVU 技术载荷 Regex“${rule?.scriptName ?? rule?.script_name ?? rule?.id ?? '未命名'}”禁止默认 prompt-only；它可能在下一轮 Prompt 中删除变量合同或当前状态`);
    }
    if (technicalMarker && runOnEdit) {
      issues.push(`MVU 技术载荷 Regex“${rule?.scriptName ?? rule?.script_name ?? rule?.id ?? '未命名'}”不得 runOnEdit=true；编辑保存不能把 initvar、更新块或状态占位符永久写回原消息`);
    }
    if (/<\s*UpdateVariable\b/i.test(find) && /\|\s*\/?\[?\\sS|\|\s*\[\\sS\]/i.test(find) && !/\$[/'"]?\s*[,)]?$/i.test(find)) {
      issues.push(`MVU 更新块 Regex“${rule?.scriptName ?? rule?.script_name ?? rule?.id ?? '未命名'}”存在未闭合分支却没有消息末尾边界；可能吞掉更新块后的正文`);
    }
  }
}

function validateWorldbookGroups(entries, issues) {
  for (const entry of entries) {
    const group = String(entry?.group ?? entry?.extensions?.group ?? '').trim();
    const groupOverride = entry?.groupOverride === true || entry?.extensions?.group_override === true;
    const groupScoring = entry?.useGroupScoring === true || entry?.extensions?.use_group_scoring === true;
    if (group || groupOverride || groupScoring) {
      issues.push(`世界书条目“${entry?.comment || '未命名'}”启用了包含组/组评分；默认 RP 制品必须禁用 group、groupOverride 和 useGroupScoring`);
    }
  }
}

function validateWorldbookRouting(entries, issues, mode) {
  for (const entry of entries) {
    const comment = String(entry?.comment ?? entry?.name ?? '');
    const content = String(entry?.content ?? '');
    const position = Number(entry?.position);
    const depth = Number(entry?.depth);
    const hasKeys = Array.isArray(entry?.key) ? entry.key.length > 0 : Array.isArray(entry?.keys) ? entry.keys.length > 0 : false;
    const sticky = Number(entry?.sticky ?? 0) > 0 || Number(entry?.effect?.sticky ?? 0) > 0;
    const cooldown = Number(entry?.cooldown ?? 0) > 0 || Number(entry?.effect?.cooldown ?? 0) > 0;
    const isVariableContract = /(?:\[mvu_update\]|变量列表|变量输出格式|变量更新规则)/i.test(comment);
    const isNarrativeOrContent = /(?:\[mvu_plot\]|世界|角色|场景|叙事|动态内容)/i.test(comment);
    const isImmediateEvent = /(?:立即|事件|event)/i.test(comment);

    if (/format_message_variable::stat_data|status_current_variables?/i.test(content) && (position !== 4 || depth !== 0)) {
      issues.push(`变量当前状态投影条目“${comment || '未命名'}”必须使用 atDepth(position=4) depth=0，实际 position=${entry?.position} depth=${entry?.depth}`);
    }
    if (mode === 'mvu_zod' && isVariableContract && position !== 4 && !/initvar/i.test(comment)) {
      issues.push(`MVU_ZOD 变量合同条目“${comment || '未命名'}”必须进入 atDepth(position=4) 或明确的变量初始化路线，实际 position=${entry?.position}`);
    }
    if (mode === 'mvu_zod' && isNarrativeOrContent && position === 4 && depth === 0 && !isVariableContract && !isImmediateEvent) {
      issues.push(`MVU_ZOD 普通世界/角色/场景条目“${comment || '未命名'}”不应无条件堆在 atDepth depth=0`);
    }
    if (position === 4 && depth === 0 && isImmediateEvent && !hasKeys && !sticky && !cooldown) {
      issues.push(`立即事件条目“${comment || '未命名'}”位于 atDepth depth=0 但没有关键词、sticky 或 cooldown 触发边界`);
    }
    if (position === 4 && depth === 0 && !isVariableContract && !isImmediateEvent && !isNarrativeOrContent && !hasKeys && !sticky && !cooldown) {
      issues.push(`普通世界/角色/场景条目“${comment || '未命名'}”不应无条件堆在 atDepth depth=0；请按职责使用角色定义后、角色定义前或明确的 atDepth/depth 路由`);
    }
  }
}

function validateMvuBudgetPriority(entries, issues, mode) {
  if (mode !== 'mvu_zod') return;
  const ordered = entries.filter(entry => Number.isFinite(Number(entry?.order)));
  if (!ordered.length) return;
  const protocol = ordered.filter(entry => /(?:\[mvu_update\]|变量列表|变量输出格式|变量更新规则)/i.test(String(entry?.comment ?? '')));
  const ordinary = ordered.filter(entry => !/(?:\[mvu_update\]|变量列表|变量输出格式|变量更新规则|initvar|EJS|mvu_plot)/i.test(String(entry?.comment ?? '')));
  const maxOrdinaryOrder = ordinary.length ? Math.max(...ordinary.map(entry => Number(entry.order))) : -Infinity;
  for (const entry of protocol) {
    const ignoresBudget = entry.ignoreBudget === true || entry.ignore_budget === true || entry.extensions?.ignore_budget === true;
    if (!ignoresBudget && Number(entry.order) <= maxOrdinaryOrder) {
      issues.push(`MVU_ZOD 条目“${entry.comment || '未命名'}”的 order=${entry.order} 不高于普通世界/角色/场景最高 order=${maxOrdinaryOrder}；预算截断时可能先丢失变量合同`);
    }
  }
}

function rejectEmbeddedCharacterBook(card, worldbook, issues, allowEmbeddedCharacterBook = false) {
  const embedded = cardData(card)?.character_book?.entries;
  if (!allowEmbeddedCharacterBook && Array.isArray(embedded) && embedded.length > 0 && listEntries(worldbook).length > 0) {
    issues.push('独立世界书路线禁止角色卡同时嵌入 CharacterBook；否则会产生重复注入和版本漂移');
  }
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
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(raw => raw.replace(/\s+#.*$/, ''));
  const wrapped = lines.some(line => /^mvu:\s*$/.test(line.trim()));
  const baseIndent = '  ';
  const nestedIndent = `${baseIndent}  `;
  let section = null;
  for (const line of lines) {
    const rootValue = line.match(new RegExp(`^${baseIndent}(mode|init_strategy|update_dialect):\\s*["']?([^"'\\s]+)["']?\\s*$`));
    if (rootValue) { result[rootValue[1]] = rootValue[2]; section = null; continue; }
    const sectionLine = line.match(new RegExp(`^${baseIndent}(loader|zod|required_worldbook_entries|producers|consumers|acceptance):\\s*$`));
    if (sectionLine) { section = sectionLine[1]; result[section] ||= {}; continue; }
    const nested = line.match(new RegExp(`^${nestedIndent}([A-Za-z_]+):\\s*["']?(.*?)["']?\\s*$`));
    if (!nested || !section) continue;
    const [, key, value] = nested;
    if (section === 'required_worldbook_entries') result.requiredEntries[key] = value;
    else result[section][key] = value;
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
  const directWriters = scripts.filter(script => /(?:Mvu\.replaceMvuData|updateVariablesWith|setMessageVar|setvar)\s*\(/i.test(script.content || ''));
  if (directWriters.length) {
    const declared = String(contract?.producers?.direct_scripts || '');
    if (!declared.trim()) issues.push('MVU 存在 Tavern Helper 直接写入脚本，但运行合同没有声明 producers.direct_scripts');
    for (const script of directWriters) {
      if (declared && !declared.includes(String(script.name || ''))) issues.push(`直接写入脚本“${script.name}”未列入 producers.direct_scripts`);
      if (/Mvu\.replaceMvuData[\s\S]{0,800}message_id\s*:\s*['"]latest['"]/i.test(script.content || '')) issues.push(`直接写入脚本“${script.name}”使用 latest 作为关键写入楼层`);
      if (!/saveChat\s*\(/i.test(script.content || '')) issues.push(`直接写入脚本“${script.name}”没有发现 saveChat 保存与同面读回合同`);
    }
  }
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
    if ((mode === 'mvu_zod') && !hasRecordSemantics(rulesText)) issues.push('MVU_ZOD 变量更新规则缺少 Record/动态键更新语义');
    if ((mode === 'mvu_zod') && !hasArraySemantics(rulesText)) issues.push('MVU_ZOD 变量更新规则缺少 Array/数组更新语义');
  }
  if (schemaKeys.length && indexEntry) {
    const indexText = String(indexEntry.content || '');
    const dynamicIndex = hasDynamicStateInjection(indexText);
    const missing = dynamicIndex ? [] : allKeysMentioned(indexText, schemaKeys);
    if (missing.length) issues.push(`变量路径索引未覆盖 Schema 顶层键：${missing.join('、')}`);
    if (!dynamicIndex && !/format_message_variable::stat_data/i.test(indexText)) issues.push('变量路径索引缺少当前 stat_data 注入');
    if ((mode === 'mvu_zod') && !dynamicIndex && indexText.length < Math.max(400, schemaKeys.length * 60)) issues.push('MVU_ZOD 变量路径索引过于简略');
  }

  const outputText = String(outputEntry?.content || '');
  const dialect = findDialect(outputText);
  if (dialect === 'json_patch') validateJsonPatchExamples(outputText, issues);
  if ((mode === 'mvu_zod') && outputText.length < 500) issues.push('MVU_ZOD 变量输出格式过于简略，缺少操作和路径示例');
  if (!/<Analysis>[\s\S]*<\/Analysis>/i.test(outputText)) issues.push('变量输出格式缺少 <Analysis> 合同');
  if ((mode === 'mvu_zod') && !/变量列表|路径索引|path/i.test(outputText)) issues.push('MVU_ZOD 输出格式没有引用变量路径索引/合法 path 合同');
  if (dialect === 'unknown') issues.push('变量输出格式没有声明可识别的 JSON Patch 或 lodash 方言');
  if (dialect === 'mixed') issues.push('变量输出格式混用了 JSON Patch 与 lodash 命令方言');
  if (expectedDialect && dialect !== expectedDialect) issues.push(`变量输出方言与运行合同不一致：合同 ${expectedDialect}，实际 ${dialect}`);
  if (dialect === 'json_patch' && indexEntry) {
    const indexedPaths = extractIndexedPaths(indexEntry.content);
    const patterns = indexedPaths.map(pathPattern);
    if (indexedPaths.length) {
      for (const outputPath of extractOutputPaths(outputText)) {
        if (/^\$\{\/path\//.test(outputPath)) continue;
        if (!patterns.some(pattern => pattern.test(outputPath))) issues.push(`变量输出格式示例路径不在变量索引中：${outputPath}`);
      }
    }
  }

  const regex = dedupeRegex([...embeddedRegex(input.card), ...externalRegex(input.regex)]);
  validateMvuRegexBoundaries(regex, issues);
  validateWorldbookGroups(entries, issues);
  validateWorldbookRouting(entries, issues, mode);
  validateMvuBudgetPriority(entries, issues, mode);
  rejectEmbeddedCharacterBook(input.card, input.worldbook, issues, options.allowEmbeddedCharacterBook === true || input.allowEmbeddedCharacterBook === true);
  const findTexts = regex.map(rule => `${String(rule.findRegex || rule.find_regex || '')}\n${String(rule.replaceString || rule.replace_string || '')}`).join('\n');
  if (!/<\s*\(?update(?:variable)?/i.test(findTexts)) issues.push('Regex 缺少 <UpdateVariable> 的 display/prompt 清理消费者');
  if (greetingsWithInit.length && !/initvar/i.test(findTexts)) issues.push('Greeting 含 <initvar>，但 Regex 没有对应显示隐藏规则');
  if (greetings.some(text => /<StatusPlaceHolderImpl\s*\/>/i.test(text)) && !/statusplaceholderimpl/i.test(findTexts)) issues.push('存在状态栏占位符但 Regex 没有对应消费者');

  compareEmbeddedExternalWorldbook(input.card, input.worldbook, issues);
  compareEmbeddedExternalScripts(input.card, input.scriptFolder, issues);

  return { ok: issues.length === 0, issues, warnings, mode, initStrategy: resolvedStrategy, schemaKeys, dialect, expectedDialect };
}

