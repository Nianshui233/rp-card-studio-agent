import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOST_PLACEMENT_VALUES, validateRegexDocument } from './regex/validate-tavern-regex.mjs';
import { runFixtures } from './regex/run-regex-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examples = path.join(root, 'assets', 'examples');
const hostRootIndex = process.argv.indexOf('--host-root');
const hostRoot = hostRootIndex >= 0 ? path.resolve(process.argv[hostRootIndex + 1] || '') : process.env.SILLYTAVERN_ROOT;
const failures = [];
let jsonCount = 0;
let regexCount = 0;
let fixtureCount = 0;
let sourceCount = 0;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function fail(label, error) {
  failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
}
function checkJavaScript(label, source) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
  if (result.status !== 0) fail(label, (result.stderr || result.stdout).trim());
  else sourceCount += 1;
}

for (const file of walk(examples)) {
  const relative = path.relative(root, file);
  const extension = path.extname(file).toLowerCase();
  if (extension === '.json') {
    try {
      JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      jsonCount += 1;
    } catch (error) { fail(relative, error); }
  }
  if (extension === '.js' || extension === '.mjs') checkJavaScript(relative, fs.readFileSync(file, 'utf8'));
  if (extension === '.html') {
    const html = fs.readFileSync(file, 'utf8');
    for (const [index, match] of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].entries()) {
      if (match[1].trim()) checkJavaScript(`${relative} inline script ${index + 1}`, match[1]);
    }
  }
  if (path.basename(file).toLowerCase() === 'regex.json') {
    try {
      const regexDocument = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const validation = validateRegexDocument(regexDocument);
      regexCount += validation.count;
      for (const result of validation.results.filter(item => item.issues.length)) {
        fail(`${relative} / ${result.name}`, result.issues.map(issue => issue.message).join('; '));
      }
      const fixtureFile = path.join(path.dirname(file), 'regex.fixtures.json');
      if (!fs.existsSync(fixtureFile)) fail(relative, '缺少同目录 regex.fixtures.json');
      else {
        const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf8').replace(/^\uFEFF/, ''));
        const report = runFixtures(regexDocument, fixtures);
        fixtureCount += report.total;
        for (const result of report.results.filter(item => !item.passed)) {
          fail(`${relative} fixture ${result.id}`, `期望 ${JSON.stringify(result.expected)}，实际 ${JSON.stringify(result.actual)}`);
        }
      }
    } catch (error) { fail(`${relative} fixtures`, error); }
  }
}

for (const [relative, args] of [
  ['scripts/regex/validate-tavern-regex.test.mjs', ['--test', 'scripts/regex/validate-tavern-regex.test.mjs']],
  ['scripts/regex/run-regex-fixtures.test.mjs', ['--test', 'scripts/regex/run-regex-fixtures.test.mjs']],
  ['scripts/validate-rolecard-package.test.mjs', ['--test', 'scripts/validate-rolecard-package.test.mjs']],
  ['scripts/mvu/validate-mvu-package.test.mjs', ['--test', 'scripts/mvu/validate-mvu-package.test.mjs']],
  ['scripts/mvu/validate-initvar-yaml.test.mjs', ['--test', 'scripts/mvu/validate-initvar-yaml.test.mjs']],
  ['tests/interview-contract.test.mjs', ['--test', 'tests/interview-contract.test.mjs']],
  ['tests/state-impact-contract.test.mjs', ['--test', 'tests/state-impact-contract.test.mjs']],
  ['tests/runtime-separation-contract.test.mjs', ['--test', 'tests/runtime-separation-contract.test.mjs']],
  ['tests/mvu-zod-contract.test.mjs', ['--test', 'tests/mvu-zod-contract.test.mjs']],
  ['tests/lossless-authoring-contract.test.mjs', ['--test', 'tests/lossless-authoring-contract.test.mjs']],
  ['tests/project-structure-contract.test.mjs', ['--test', 'tests/project-structure-contract.test.mjs']],
  ['scripts/worldbook/split-yaml-lossless.test.mjs', ['--test', 'scripts/worldbook/split-yaml-lossless.test.mjs']],
  ['assets/examples/full-mvu-rp/runtime.contract.test.mjs', ['assets/examples/full-mvu-rp/runtime.contract.test.mjs']],
  ['assets/examples/mvu-zod-rp/runtime.contract.test.mjs', ['assets/examples/mvu-zod-rp/runtime.contract.test.mjs']],
  ['assets/examples/tavern-helper-iframe-rp/payload.contract.test.mjs', ['assets/examples/tavern-helper-iframe-rp/payload.contract.test.mjs']],
  ['mvu-zod-rp delivery package', [
    'scripts/validate-rolecard-package.mjs',
    '--root', 'assets/examples/mvu-zod-rp',
    '--card', '灰港避难所.json',
    '--worldbook', '灰港避难所世界书.json',
    '--worldbook-name', '灰港避难所世界书',
    '--regex', 'regex.json',
    '--regex-mode', 'alternative',
    '--fixtures', 'regex.fixtures.json',
    '--script-folder', '运行脚本.folder.json',
    '--zod-source', 'schema.js',
    '--mvu-contract', 'MVU运行合同.yaml',
    ...(hostRoot ? ['--host-root', hostRoot] : []),
  ]],
  ['full-mvu-rp delivery package', [
    'scripts/validate-rolecard-package.mjs',
    '--root', 'assets/examples/full-mvu-rp',
    '--card', '雾港航站.json',
    '--worldbook', '雾港航站世界书.json',
    '--regex', 'regex.json',
    '--regex-mode', 'alternative',
    '--fixtures', 'regex.fixtures.json',
    '--script-folder', '运行脚本.folder.json',
    '--mvu-contract', 'MVU运行合同.yaml',
    ...(hostRoot ? ['--host-root', hostRoot] : []),
  ]],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(relative, (result.stderr || result.stdout).trim());
  else {
    if (result.stdout) process.stdout.write(result.stdout.trim() + '\n');
    if (result.stderr) process.stderr.write(result.stderr.trim() + '\n');
  }
}

try {
  const full = path.join(examples, 'full-mvu-rp');
  const card = JSON.parse(fs.readFileSync(path.join(full, '雾港航站.json'), 'utf8'));
  const regex = JSON.parse(fs.readFileSync(path.join(full, 'regex.json'), 'utf8'));
  const worldbook = JSON.parse(fs.readFileSync(path.join(full, '雾港航站世界书.json'), 'utf8'));
  const folder = JSON.parse(fs.readFileSync(path.join(full, '运行脚本.folder.json'), 'utf8'));
  const coordinator = fs.readFileSync(path.join(full, '运行协调器.js'), 'utf8').trim();
  const scopedRegex = card.data?.extensions?.regex_scripts;
  if (card.spec !== 'chara_card_v3') fail('full-mvu-rp package', '角色卡必须是 V3');
  if (!card.data?.extensions?.world || !Object.keys(worldbook.entries || {}).length) fail('full-mvu-rp package', '角色卡主世界书绑定或世界书条目缺失');
  if (JSON.stringify(scopedRegex) !== JSON.stringify(regex)) fail('full-mvu-rp package', '卡内 Regex 与独立 regex.json 不一致');
  const boundBook = path.join(full, `${card.data.extensions.world}.json`);
  if (!fs.existsSync(boundBook) || path.resolve(boundBook) !== path.resolve(path.join(full, '雾港航站世界书.json'))) fail('full-mvu-rp package', '角色卡主世界书绑定没有指向交付的同名世界书');
  const scripts = folder.scripts || [];
  const names = scripts.map(script => script.name);
  if (new Set(names).size !== names.length) fail('full-mvu-rp package', 'ScriptFolder 中存在重复脚本名');
  const ids = scripts.map(script => script.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) fail('full-mvu-rp package', 'ScriptFolder 中存在重复脚本 ID');
  const embeddedCoordinator = scripts.find(script => script.name === '雾港航站协调器')?.content?.trim().replace(/\r\n/g, '\n');
  if (embeddedCoordinator !== coordinator.replace(/\r\n/g, '\n')) fail('full-mvu-rp package', 'ScriptFolder 协调器与可读源码不同步');
  const loaders = scripts.filter(script => /MagVarUpdate@[0-9a-f]{40}\/artifact\/bundle\.js/i.test(script.content || ''));
  if (loaders.length !== 1) fail('full-mvu-rp package', `预期唯一锁定 commit 的 MagVarUpdate Loader，实际 ${loaders.length}`);
} catch (error) { fail('full-mvu-rp package', error); }

if (hostRoot) {
  const engineFile = path.join(hostRoot, 'public', 'scripts', 'extensions', 'regex', 'engine.js');
  try {
    const engine = fs.readFileSync(engineFile, 'utf8');
    const block = engine.match(/export const regex_placement\s*=\s*\{([\s\S]*?)^\};/m)?.[1];
    if (!block) throw new Error('无法从 Regex engine.js 读取 regex_placement');
    const hostValues = [...block.matchAll(/^\s*[A-Z_]+:\s*(\d+)\s*,?/gm)].map(match => Number(match[1]));
    const expected = [...HOST_PLACEMENT_VALUES].sort((a, b) => a - b);
    const actual = [...new Set(hostValues)].sort((a, b) => a - b);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail('host compatibility', `本机 Regex placement ${actual.join(',')} 与校验器映射 ${expected.join(',')} 不一致`);
    }
    const packageFile = path.join(hostRoot, 'package.json');
    const hostVersion = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version || 'unknown';
    let validatedCards = 0;
    const validatorFile = path.join(hostRoot, 'src', 'validator', 'TavernCardValidator.js');
    if (fs.existsSync(validatorFile)) {
      const { TavernCardValidator } = await import(pathToFileURL(validatorFile).href);
      for (const file of walk(examples).filter(candidate => candidate.toLowerCase().endsWith('.json'))) {
        const card = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
        if (!String(card?.spec || '').startsWith('chara_card_')) continue;
        const validator = new TavernCardValidator(card);
        if (!validator.validate()) fail(path.relative(root, file), `SillyTavern ${hostVersion} TavernCardValidator 拒绝角色卡：${validator.lastValidationError}`);
        else validatedCards += 1;
      }
    }
    console.log(`host source cross-check: SillyTavern ${hostVersion}, Regex placement ${actual.join(',')}, V3/V2 cards ${validatedCards}; source-only, not runtime acceptance`);
  } catch (error) { fail('host compatibility', error); }
}

console.log(`example check: ${jsonCount} JSON, ${regexCount} Regex entries, ${fixtureCount} Regex fixtures, ${sourceCount} JavaScript sources`);
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else console.log('PASS: example files, Regex contracts, build mirrors, and regression tests');
