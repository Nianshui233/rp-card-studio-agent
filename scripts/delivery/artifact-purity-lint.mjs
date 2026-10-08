const RULES = [
  ['local_path', /(?:[A-Za-z]:[\\/]|\\\\\\\\|codex:\/\/)/g, '作品层出现本机路径或 Codex 深链接'],
  ['runtime_not_run', /runtime\s*:\s*not_run/i, '作品层出现未运行状态说明'],
  ['maintenance_instruction', /(?:请|需要)\s*(?:导入|启用|停用|打开|绑定).{0,40}(?:世界书|正则|脚本|酒馆助手|世界书编辑器)/g, '作品层出现工程导入/维护指令'],
  ['agent_ledger', /(?:Agent|Skill|当前阶段|阶段账本|阶段交接|用户授权|route-lock|handoff)/g, '作品层出现 Agent/账本/工程阶段语义']
];

export function scanRpFacingText(text, file = '<memory>', { allowRules = [] } = {}) {
  const findings = [];
  for (const [id, pattern, message] of RULES) {
    if (allowRules.includes(id)) continue;
    pattern.lastIndex = 0;
    const match = pattern.exec(String(text));
    if (match) findings.push({ rule: id, file, message, excerpt: match[0].slice(0, 120) });
  }
  return findings;
}

export function scanRpFacingFiles(files, options = {}) {
  return files.flatMap(file => scanRpFacingText(file.text, file.path, { allowRules: file.allowRules ?? options.allowRules ?? [] }));
}

export { RULES };
