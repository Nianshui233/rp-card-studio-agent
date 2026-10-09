import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOST_PLACEMENT_VALUES, validateRegexDocument } from './regex/validate-tavern-regex.mjs';
import { runFixtures } from './regex/run-regex-fixtures.mjs';
import { validateDeliveryLayout } from './delivery/project-package.mjs';

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
  if (path.basename(file).toLowerCase() === '我，非我.正则.json') {
    try {
      const regexDocument = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const validation = validateRegexDocument(regexDocument);
      regexCount += validation.count;
      for (const result of validation.results.filter(item => item.issues.length)) {
        fail(`${relative} / ${result.name}`, result.issues.map(issue => issue.message).join('; '));
      }
      const fixtureFile = path.join(path.dirname(file), '..', '制作文件', '检查', 'regex.fixtures.json');
      if (!fs.existsSync(fixtureFile)) fail(relative, '缺少制作文件/检查/regex.fixtures.json');
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
  ['scripts/mvu/validate-mvu-zod-source-contract.test.mjs', ['--test', 'scripts/mvu/validate-mvu-zod-source-contract.test.mjs']],
  ['scripts/mvu/validate-mvu-package.test.mjs', ['--test', 'scripts/mvu/validate-mvu-package.test.mjs']],
  ['scripts/ejs/validate-ejs-package.test.mjs', ['--test', 'scripts/ejs/validate-ejs-package.test.mjs']],
  ['scripts/mvu/validate-initvar-yaml.test.mjs', ['--test', 'scripts/mvu/validate-initvar-yaml.test.mjs']],
  ['tests/interview-contract.test.mjs', ['--test', 'tests/interview-contract.test.mjs']],
  ['tests/frontend-graphics-contract.test.mjs', ['--test', 'tests/frontend-graphics-contract.test.mjs']],
  ['tests/state-impact-contract.test.mjs', ['--test', 'tests/state-impact-contract.test.mjs']],
  ['tests/runtime-separation-contract.test.mjs', ['--test', 'tests/runtime-separation-contract.test.mjs']],
  ['tests/player-neutrality-capability-contract.test.mjs', ['--test', 'tests/player-neutrality-capability-contract.test.mjs']],
  ['tests/lossless-authoring-contract.test.mjs', ['--test', 'tests/lossless-authoring-contract.test.mjs']],
  ['scripts/materials/validate-materials.test.mjs', ['--test', 'scripts/materials/validate-materials.test.mjs']],
  ['tests/materials-research-contract.test.mjs', ['--test', 'tests/materials-research-contract.test.mjs']],
  ['scripts/continuation/continuation.test.mjs', ['--test', 'scripts/continuation/continuation.test.mjs']],
  ['tests/continuation-contract.test.mjs', ['--test', 'tests/continuation-contract.test.mjs']],
  ['tests/artifact-purity-contract.test.mjs', ['--test', 'tests/artifact-purity-contract.test.mjs']],
  ['scripts/delivery/project-package.test.mjs', ['--test', 'scripts/delivery/project-package.test.mjs']],
  ['tests/project-structure-contract.test.mjs', ['--test', 'tests/project-structure-contract.test.mjs']],
  ['scripts/worldbook/split-yaml-lossless.test.mjs', ['--test', 'scripts/worldbook/split-yaml-lossless.test.mjs']],
  ['tests/mvu-zod-contract.test.mjs', ['--test', 'tests/mvu-zod-contract.test.mjs']],
  ['wo-fei-wo-rp delivery package', [
    'scripts/validate-rolecard-package.mjs',
    '--root', 'assets/examples/wo-fei-wo-rp',
    '--card', '导入包/我，非我.角色卡.json',
    '--worldbook', '导入包/我，非我.世界书.json',
    '--worldbook-name', '我，非我',
    '--regex', '导入包/我，非我.正则.json',
    '--regex-mode', 'alternative',
    '--fixtures', '制作文件/检查/regex.fixtures.json',
    '--script-folder', '导入包/我，非我.酒馆助手脚本.json',
    '--mvu-source-contract', '制作文件/项目记录/MVU源码合同.json',
    '--mvu-contract', '制作文件/配置/MVU运行合同.yaml',
    '--mvu-mode', 'mvu_zod',
    '--mvu-init-strategy', 'worldbook',
    ...(hostRoot ? ['--host-root', hostRoot] : []),
  ]]]) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(relative, (result.stderr || result.stdout).trim());
  else {
    if (result.stdout) process.stdout.write(result.stdout.trim() + '\n');
    if (result.stderr) process.stderr.write(result.stderr.trim() + '\n');
  }
}

try {
  const sample = path.join(examples, 'wo-fei-wo-rp');
  const card = JSON.parse(fs.readFileSync(path.join(sample, '导入包/我，非我.角色卡.json'), 'utf8'));
  const regex = JSON.parse(fs.readFileSync(path.join(sample, '导入包/我，非我.正则.json'), 'utf8'));
  const worldbook = JSON.parse(fs.readFileSync(path.join(sample, '导入包/我，非我.世界书.json'), 'utf8'));
  const folder = JSON.parse(fs.readFileSync(path.join(sample, '导入包/我，非我.酒馆助手脚本.json'), 'utf8'));
  const guide = fs.readFileSync(path.join(sample, '制作文件/AGENT_GUIDE.md'), 'utf8');
  const readme = fs.readFileSync(path.join(sample, '制作文件/README.md'), 'utf8');
  const layout = validateDeliveryLayout(sample, { requireManifest: true }); if (!layout.ok) fail('wo-fei-wo-rp layout', layout.issues.join('; '));
  if (card.spec !== 'chara_card_v3') fail('wo-fei-wo-rp package', '角色卡必须是 V3');
  if (!card.data?.extensions?.world || !Object.keys(worldbook.entries || {}).length) fail('wo-fei-wo-rp package', '角色卡主世界书绑定或世界书条目缺失');
  if (Object.hasOwn(card.data?.extensions || {}, 'regex_scripts')) fail('wo-fei-wo-rp package', '独立 Regex 路线不应保留卡内 regex_scripts 字段');
  if (!Array.isArray(regex) || regex.length === 0) fail('wo-fei-wo-rp package', '独立 regex.json 缺失或为空');
  if (worldbook.name !== card.data.extensions.world) fail('wo-fei-wo-rp package', '角色卡主世界书绑定名与样品世界书名称不一致');
  if (!fs.existsSync(path.join(sample, '导入包/我，非我.世界书.json'))) fail('wo-fei-wo-rp package', '样品世界书文件缺失');
  const scripts = folder.scripts || [];
  const names = scripts.map(script => script.name);
  if (new Set(names).size !== names.length) fail('wo-fei-wo-rp package', 'ScriptFolder 中存在重复脚本名');
  const ids = scripts.map(script => script.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) fail('wo-fei-wo-rp package', 'ScriptFolder 中存在重复脚本 ID');
  const loaders = scripts.filter(script => /MagVarUpdate@[0-9a-f]{40}\/artifact\/bundle\.js/i.test(script.content || ''));
  if (loaders.length !== 1) fail('wo-fei-wo-rp package', `预期唯一锁定 commit 的 MagVarUpdate Loader，实际 ${loaders.length}`);
  if (!/原始卡是(?:\*\*)?语义金标准/.test(readme) || !/自由发挥/.test(guide)) fail('wo-fei-wo-rp package', '样品缺少面向 Agent 的来源/自由度解释');
} catch (error) { fail('wo-fei-wo-rp package', error); }

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
