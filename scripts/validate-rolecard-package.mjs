import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeRegexDocument, validateRegexDocument } from './regex/validate-tavern-regex.mjs';
import { runFixtures } from './regex/run-regex-fixtures.mjs';

export function validateRolecardPackage(input) {
  const issues = [];
  const warnings = [];
  const add = (target, message) => target.push(message);
  const card = input.card;
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    add(issues, '角色卡必须是 JSON 对象');
    return { ok: false, issues, warnings };
  }

  const spec = card.spec;
  const data = card.data;
  const v2 = spec === 'chara_card_v2';
  const v3 = spec === 'chara_card_v3';
  const legacyV1 = !spec && ['name', 'description', 'first_mes', 'mes_example'].every(key => Object.hasOwn(card, key));
  if (!v2 && !v3 && !legacyV1) add(issues, '角色卡必须符合已知 V1/V2/V3 外形');
  if ((v2 || v3) && (!data || typeof data !== 'object' || Array.isArray(data))) add(issues, 'V2/V3 角色卡缺少 data 对象');
  if (v3 && (!Number.isFinite(Number(card.spec_version)) || Number(card.spec_version) < 3 || Number(card.spec_version) >= 4)) {
    add(issues, `V3 spec_version 无效：${card.spec_version}`);
  }

  const extensions = data?.extensions;
  const boundWorld = extensions && typeof extensions.world === 'string' ? extensions.world.trim() : '';
  if (input.worldbook) {
    const worldbookPath = String(input.worldbookPath || '');
    const fileStem = path.basename(worldbookPath).replace(/\.json$/i, '');
    const actualName = String(input.worldbookName || input.worldbook.name || fileStem).trim();
    if (!boundWorld) add(issues, '提供了独立世界书，但角色卡未声明 data.extensions.world 绑定名');
    else if (boundWorld !== actualName) {
      const hint = !input.worldbookName && !input.worldbook.name ? '；若 SillyTavern 中会以自定义名称导入，请传 --worldbook-name 核验该名称' : '';
      add(issues, `角色卡世界书绑定名“${boundWorld}”与世界书实际名称“${actualName}”不一致${hint}`);
    }
    const entries = input.worldbook.entries;
    const entryList = Array.isArray(entries) ? entries : entries && typeof entries === 'object' ? Object.values(entries) : [];
    if (entryList.length === 0) add(issues, '独立世界书 entries 缺失或为空');
  } else if (boundWorld) {
    add(warnings, `角色卡引用主世界书“${boundWorld}”，本次未提供独立世界书制品，绑定未核验`);
  }

  let regexEntries = [];
  if (input.regex !== undefined) {
    try {
      const report = validateRegexDocument(input.regex);
      regexEntries = normalizeRegexDocument(input.regex);
      for (const result of report.results) {
        for (const issue of result.issues) add(issues, `${issue.path}: ${issue.message}`);
        for (const warning of result.warnings || []) add(warnings, `${warning.path}: ${warning.message}`);
      }
      if (input.fixtures !== undefined) {
        const fixtureReport = runFixtures(input.regex, input.fixtures);
        for (const result of fixtureReport.results.filter(item => !item.passed)) {
          add(issues, `Regex fixture ${result.id} 未通过`);
        }
      }
    } catch (error) {
      add(issues, `Regex 文档/夹具检查失败：${error.message}`);
    }
  } else if (input.fixtures !== undefined) {
    add(issues, '提供了 Regex fixtures，但没有对应 Regex 文档');
  }

  const embeddedRegex = data?.extensions?.regex_scripts;
  if (input.regex !== undefined && Array.isArray(embeddedRegex)) {
    const sameEntries = JSON.stringify(embeddedRegex) === JSON.stringify(regexEntries);
    const embeddedIds = new Map(embeddedRegex.map(entry => [entry?.id, entry]).filter(([id]) => typeof id === 'string'));
    const externalById = new Map(regexEntries.map(entry => [entry?.id ?? entry?.script_id, entry]).filter(([id]) => typeof id === 'string'));
    const overlappingIds = [...embeddedIds.keys()].filter(id => externalById.has(id));
    if (input.regexMode === 'alternative' && !sameEntries) {
      add(issues, 'regex-mode=alternative 时，卡内与独立 Regex 必须完全一致');
    } else if (sameEntries) {
      add(warnings, '卡内与独立 Regex 是相同规则的两份导入途径；导入时必须二选一');
    } else if (overlappingIds.some(id => JSON.stringify(embeddedIds.get(id)) !== JSON.stringify(externalById.get(id)))) {
      add(issues, '卡内与独立 Regex 存在同 ID 不同内容，存在维护漂移风险');
    }
  }

  if (input.scriptFolder !== undefined) {
    const folder = input.scriptFolder;
    if (!folder || typeof folder !== 'object' || folder.type !== 'folder' || !Array.isArray(folder.scripts)) {
      add(issues, 'Tavern Helper ScriptFolder 必须有 type="folder" 和 scripts 数组');
    } else {
      const names = [];
      const ids = [];
      for (const [index, script] of folder.scripts.entries()) {
        if (!script || script.type !== 'script' || typeof script.name !== 'string' || typeof script.id !== 'string' || typeof script.content !== 'string') {
          add(issues, `ScriptFolder scripts[${index}] 缺少 script 类型、name、id 或 content`);
          continue;
        }
        names.push(script.name);
        ids.push(script.id);
      }
      if (new Set(names).size !== names.length) add(issues, 'ScriptFolder 中存在重复脚本名');
      if (new Set(ids).size !== ids.length) add(issues, 'ScriptFolder 中存在重复脚本 ID');
      const loaders = folder.scripts.filter(script => /MagVarUpdate(?:@[^/\s]+)?\/artifact\/bundle\.js/i.test(script.content || ''));
      if (loaders.length > 1) add(issues, `ScriptFolder 有 ${loaders.length} 个 MagVarUpdate Loader；每个运行环境只应加载一个`);
      for (const script of folder.scripts) {
        if (script?.type === 'script' && typeof script.content === 'string') {
          const result = syntaxCheck(script.content);
          if (result) add(issues, `${script.name} JavaScript 语法错误：${result}`);
        }
      }
    }
  }

  if (input.hostCardValidation) {
    if (!input.hostCardValidation.valid) {
      add(issues, `目标 SillyTavern CardValidator 拒绝角色卡：${input.hostCardValidation.error || 'unknown error'}`);
    }
  }

  return { ok: issues.length === 0, issues, warnings };
}

function syntaxCheck(source) {
  // Syntax-only parse. Never evaluate user-provided script contents.
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
  return result.status === 0 ? null : (result.stderr || result.stdout).trim();
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

async function runCli() {
  const root = path.resolve(option('--root') || process.cwd());
  const cardRelative = option('--card');
  if (!cardRelative) throw new Error('用法: node validate-rolecard-package.mjs --root <package-dir> --card <card.json> [--worldbook <book.json> --worldbook-name <actual-name>] [--regex <regex.json> [--regex-mode additional|alternative] --fixtures <fixtures.json>] [--script-folder <folder.json>] [--host-root <SillyTavern-source>]');
  const readFile = relative => {
    const resolved = path.resolve(root, relative);
    const rel = path.relative(root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`路径超出 package root: ${relative}`);
    const bytes = fs.readFileSync(resolved);
    artifactHashes.push({ path: relative, sha256: createHash('sha256').update(bytes).digest('hex') });
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  };
  const artifactHashes = [];
  const input = { cardPath: cardRelative, card: readFile(cardRelative) };
  const worldbookPath = option('--worldbook');
  if (worldbookPath) Object.assign(input, { worldbookPath, worldbook: readFile(worldbookPath) });
  const worldbookName = option('--worldbook-name');
  if (worldbookName) input.worldbookName = worldbookName;
  const regexPath = option('--regex');
  const fixturesPath = option('--fixtures');
  if (regexPath) input.regex = readFile(regexPath);
  input.regexMode = option('--regex-mode') || 'additional';
  if (!['additional', 'alternative'].includes(input.regexMode)) throw new Error('--regex-mode 必须是 additional 或 alternative');
  if (fixturesPath) input.fixtures = readFile(fixturesPath);
  const scriptFolderPath = option('--script-folder');
  if (scriptFolderPath) input.scriptFolder = readFile(scriptFolderPath);
  const hostRoot = option('--host-root');
  if (hostRoot) {
    const validatorFile = path.join(path.resolve(hostRoot), 'src', 'validator', 'TavernCardValidator.js');
    if (!fs.existsSync(validatorFile)) throw new Error(`未找到 SillyTavern CardValidator: ${validatorFile}`);
    const { TavernCardValidator } = await import(pathToFileURL(validatorFile).href);
    const hostManifest = JSON.parse(fs.readFileSync(path.join(path.resolve(hostRoot), 'package.json'), 'utf8'));
    const validator = new TavernCardValidator(input.card);
    const cardSpecVersion = validator.validate();
    input.hostCardValidation = {
      valid: Boolean(cardSpecVersion),
      error: validator.lastValidationError,
      cardSpecVersion,
      hostVersion: hostManifest.version || 'unknown',
    };
  }
  const report = validateRolecardPackage(input);
  for (const artifact of artifactHashes) console.log(`ARTIFACT sha256 ${artifact.sha256}  ${artifact.path}`);
  if (input.hostCardValidation) console.log(`HOST SillyTavern ${input.hostCardValidation.hostVersion} CardValidator: ${input.hostCardValidation.valid ? `card spec V${input.hostCardValidation.cardSpecVersion} passed` : 'failed'}`);
  for (const warning of report.warnings) console.warn(`WARN ${warning}`);
  for (const issue of report.issues) console.error(`FAIL ${issue}`);
  if (!report.issues.length) console.log(`PASS ${cardRelative}: static package checks passed; this does not perform SillyTavern UI import/runtime acceptance`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  // Imported scripts are syntax-checked only; no script body is executed.
  await runCli();
}
