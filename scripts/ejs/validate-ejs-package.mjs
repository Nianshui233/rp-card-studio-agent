function asEntries(worldbook) {
  const entries = worldbook?.entries;
  if (Array.isArray(entries)) return entries;
  return entries && typeof entries === 'object' ? Object.values(entries) : [];
}

function asText(value) { return String(value ?? ''); }

function entryName(entry) {
  return String(entry?.comment || entry?.name || entry?.uid || 'unnamed');
}

function sourceText(entry) {
  return asText(entry?.content ?? entry);
}

function hasEjs(source) {
  return /<%[=_~-]?|%>|@@(?:preprocessing|generate_[a-z_]+|always_enabled|activate|dont_activate)/i.test(asText(source));
}

function hasGetvar(source) {
  return /\bgetvar\s*\(/i.test(asText(source));
}

function hasMvuRead(source) {
  return /\bgetvar\s*\(\s*['"]stat_data(?:\.|['"])/i.test(asText(source))
    || /\b(?:mvu|context\.mvu)\s*\.\s*stat_data\b/i.test(asText(source));
}

function hasMvuWrite(source) {
  return /\b(?:setvar|setMessageVar|patchVariables|replaceMvuData|updateVariablesWith)\s*\(/i.test(asText(source))
    || /\bstat_data\s*\.[^\n=]+\s*=/i.test(asText(source));
}

function getwiCalls(source) {
  return [...asText(source).matchAll(/\bgetwi\s*\(([^\n]*)/gi)].map(match => match[1]);
}

function usesExplicitContext(source) {
  return /\b(?:context\.)?mvu\b[\s.[]/i.test(asText(source));
}

function usesSharedMessageVariables(source) {
  return hasMvuRead(source) && /\bgetvar\s*\(/i.test(asText(source));
}

function validateEjsSource(source, { name = 'unnamed', contract = {} } = {}) {
  const issues = [];
  const warnings = [];
  const text = asText(source);
  if (!hasEjs(text)) return { name, issues, warnings, hasEjs: false, bridge: 'none' };

  const mvuRead = hasMvuRead(text);
  const mvuWrite = hasMvuWrite(text);
  const explicit = usesExplicitContext(text);
  const shared = usesSharedMessageVariables(text);
  const bridge = explicit ? 'explicit_context' : shared ? 'shared_message_variables' : 'none';

  if (/registerMvuSchema|MagVarUpdate.*bundle\.js|<UpdateVariable>/i.test(text)) {
    issues.push('EJS 模板混入 MVU Loader、ZOD 注册或模型变量输出合同；应拆回 MVU/世界书规则层');
  }
  if (mvuWrite && contract.allow_write !== true) {
    issues.push('EJS 直接写入 MVU/stat_data；默认只允许 MVU→EJS 只读桥，必须移除写入或明确单独的双向桥合同');
  }
  if (mvuRead && contract.bridge_mode === 'none') {
    issues.push('EJS 读取 stat_data，但运行合同将 bridge_mode 声明为 none');
  }
  if (mvuRead && !contract.bridge_mode && contract.mode !== 'shared_message_variables' && contract.mode !== 'explicit_context') {
    issues.push('EJS 读取 stat_data，但没有声明 MVU→EJS bridge_mode');
  }
  if (explicit && contract.bridge_mode && contract.bridge_mode !== 'explicit_context') {
    issues.push(`EJS 使用显式 mvu context，但 bridge_mode=${contract.bridge_mode}`);
  }
  if (shared && contract.bridge_mode && contract.bridge_mode !== 'shared_message_variables') {
    issues.push(`EJS 使用 STPT message variables 读取 stat_data，但 bridge_mode=${contract.bridge_mode}`);
  }

  for (const args of getwiCalls(text)) {
    if (!/await\s+getwi\s*\(/i.test(text)) {
      issues.push('EJS 使用 getwi，但没有检测到 await getwi；异步世界书调用必须等待结果');
      break;
    }
    if (!/^\s*['"`][^'"`]+['"`]/.test(args)) {
      warnings.push('getwi 调用没有显式书名/目标名；多世界书项目应避免依赖隐式扫描上下文');
    }
  }

  if (/@@iframe/i.test(text) && !/pagehide|removeEventListener|stop\s*\(/i.test(text)) {
    warnings.push('EJS/iframe 页面未发现显式卸载清理；若注册父页事件，需要在 pagehide 中清理');
  }

  if (/@(?:preprocessing|generate_)/i.test(text) && /raw_message/i.test(text) && !/raw_message_evaluation_enabled/i.test(text)) {
    warnings.push('模板涉及消息处理但没有记录 raw_message_evaluation_enabled 设置');
  }

  return { name, issues, warnings, hasEjs: true, bridge };
}

export function validateEjsPackage(input = {}) {
  const issues = [];
  const warnings = [];
  const contract = input.ejsContract || {};
  const entries = [
    ...asEntries(input.worldbook),
    ...(Array.isArray(input.templates) ? input.templates : []),
  ];
  const seen = new Set();
  const results = [];
  for (const entry of entries) {
    const name = entryName(entry);
    const source = sourceText(entry);
    const key = `${name}\u0000${source}`;
    if (seen.has(key) || !hasEjs(source)) continue;
    seen.add(key);
    const result = validateEjsSource(source, { name, contract });
    results.push(result);
    issues.push(...result.issues.map(issue => `${name}: ${issue}`));
    warnings.push(...result.warnings.map(warning => `${name}: ${warning}`));
  }

  const enabled = contract.enabled === true || results.length > 0;
  if (enabled && !contract.mode) issues.push('EJS 项目缺少 mode（prompt_template/worldbook_template/render_template）');
  if (enabled && !contract.failure) issues.push('EJS 项目缺少失败行为/静态回退合同');
  if (enabled && results.some(result => result.bridge !== 'none') && !contract.bridge_mode) {
    issues.push('存在 MVU→EJS 数据读取，但没有 bridge_mode');
  }
  if (contract.bridge_mode === 'shared_message_variables' && contract.direction && contract.direction !== 'mvu_to_ejs_readonly') {
    issues.push('shared_message_variables bridge 必须声明 direction=mvu_to_ejs_readonly');
  }
  if (contract.bridge_mode === 'explicit_context' && !contract.snapshot) {
    issues.push('explicit_context bridge 缺少 snapshot 选择规则');
  }
  if (contract.bridge_mode === 'shared_message_variables' && !contract.snapshot) {
    issues.push('shared_message_variables bridge 缺少 message scope/快照选择规则');
  }
  if (contract.allow_write === true && contract.bridge_mode !== 'bidirectional_explicit') {
    issues.push('允许 EJS 写入 MVU 时必须使用 bidirectional_explicit，并逐字段声明唯一写者');
  }

  return { ok: issues.length === 0, issues, warnings, results, enabled };
}

if (process.argv[1] && process.argv[1].endsWith('validate-ejs-package.mjs')) {
  const fs = await import('node:fs');
  const file = process.argv[2];
  if (!file) throw new Error('用法: node validate-ejs-package.mjs <ejs-package.json>');
  const input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const report = validateEjsPackage(input);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
