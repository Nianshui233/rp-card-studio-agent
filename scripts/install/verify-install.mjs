import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const defaultSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const roots = ['SKILL.md','AGENT.md','agent.yaml','README.md','package.json','package-lock.json','orchestrator','internal-skills','scripts','shared','assets','agents','.dsh'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fingerprint(bytes) {
  const text = bytes.toString('utf8');
  return digest(Buffer.from(text, 'utf8').equals(bytes) ? Buffer.from(text.replace(/\r\n?/g,'\n')) : bytes);
}
function treeFiles(root, relative = '') {
  const file = path.join(root, relative), result = [];
  if (fs.lstatSync(file).isSymbolicLink()) throw Error('安装资源不能经过链接：' + relative);
  if (fs.statSync(file).isDirectory()) for (const entry of fs.readdirSync(file, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name,'en'))) {
    if (['node_modules','__pycache__','tests'].includes(entry.name) || relative === '.dsh' && entry.name === 'build' || entry.name.endsWith('.test.mjs') || entry.name.endsWith('.pyc')) continue;
    result.push(...treeFiles(root, relative ? relative + '/' + entry.name : entry.name));
  }
  else if (fs.statSync(file).isFile()) result.push(relative);
  return result;
}
export function installationManifest(source = defaultSource) {
  source = fs.realpathSync(source);
  for (const file of ['SKILL.md','AGENT.md','agent.yaml','package.json','internal-skills','orchestrator/routing.yaml']) if (!fs.existsSync(path.join(source,file))) throw Error('不是完整的 Agent 源目录：' + file);
  const files = roots.filter(relative => fs.existsSync(path.join(source,relative))).flatMap(relative => treeFiles(source,relative)).sort();
  const entries = files.map(relative => { const bytes = fs.readFileSync(path.join(source,relative)); return { path: relative, portableSha256: fingerprint(bytes), byteSha256: digest(bytes), bytes: bytes.length }; });
  const packageData = JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  return { schema: 'rp-card-studio/install-manifest/v1', package: packageData.name, version: packageData.version, fingerprintMode: 'utf8-newline-normalized-otherwise-byte-exact', files: entries, skills: files.filter(file => file === 'SKILL.md' || file.endsWith('/SKILL.md')), manifestSha256: digest(JSON.stringify(entries.map(({path,portableSha256}) => ({path,portableSha256})))) };
}
export function verifyInstallation({ source = defaultSource, target, host = 'generic', checkDependencies = false } = {}) {
  if (!target || !path.isAbsolute(target)) throw Error('必须明确实际安装根目录的绝对路径');
  if (!['generic','codex','claude','opencode','openclaw','dsh'].includes(host)) throw Error('未知宿主；未专门适配的宿主请使用 generic');
  source = fs.realpathSync(source); target = path.resolve(target);
  if (fs.existsSync(target)) { if (!fs.statSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink()) throw Error('安装根必须是实际目录'); target = fs.realpathSync(target); }
  const relative = path.relative(source,target);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('源码仓库不能冒充实际安装目录');
  const manifest = installationManifest(source), missing = [], changed = [], unexpectedManaged = [], invalid = [], matched = [];
  const expected = new Set(manifest.files.map(file => file.path));
  for (const entry of manifest.files) {
    const file = path.join(target,entry.path);
    if (!fs.existsSync(file)) { missing.push(entry.path); continue; }
    try {
      const actual = fs.realpathSync(file), contained = path.relative(target,actual);
      if (fs.lstatSync(file).isSymbolicLink() || contained.startsWith('..' + path.sep) || path.isAbsolute(contained) || !fs.statSync(file).isFile()) throw Error('文件经链接越出安装目录或不是普通文件');
      if (fingerprint(fs.readFileSync(file)) === entry.portableSha256) matched.push(entry.path); else changed.push(entry.path);
    } catch (error) { invalid.push({ path: entry.path, issue: error.message }); }
  }
  if (fs.existsSync(target)) for (const relativeRoot of roots) if (fs.existsSync(path.join(target,relativeRoot))) {
    try { for (const file of treeFiles(target,relativeRoot)) if (!expected.has(file)) unexpectedManaged.push(file); }
    catch (error) { invalid.push({ path: relativeRoot, issue: error.message }); }
  }
  const dependencies = { checked: checkDependencies, status: 'not_checked', missing: [], mismatched: [] };
  if (checkDependencies) {
    const require = createRequire(path.join(target,'package.json')), pkg = JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      try {
        let current = path.dirname(require.resolve(name)), found;
        while (true) { const file = path.join(current,'package.json'); if (fs.existsSync(file)) { const data = JSON.parse(fs.readFileSync(file,'utf8')); if (data.name === name) { found = data; break; } } const parent = path.dirname(current); if (parent === current) break; current = parent; }
        if (!found) throw Error('package identity unavailable'); if (found.version !== version) dependencies.mismatched.push({ name, expected: version, actual: found.version });
      } catch { dependencies.missing.push(name); }
    }
    dependencies.status = dependencies.missing.length || dependencies.mismatched.length ? 'unavailable' : 'matched';
  }
  const filesMatched = !missing.length && !changed.length && !unexpectedManaged.length && !invalid.length;
  return { ok: filesMatched && (!checkDependencies || dependencies.status === 'matched'), source, target, host, version: manifest.version, sourceManifestSha256: manifest.manifestSha256,
    files: { expected: manifest.files.length, matched: matched.length, missing, changed, unexpectedManaged, invalid },
    skills: { expected: manifest.skills.length, matched: manifest.skills.filter(file => matched.includes(file)).length, paths: manifest.skills },
    fileInstallation: filesMatched ? 'matched' : 'not_matched', toolDependencies: dependencies, hostDiscovery: 'not_verified', runtime: 'not_run', written: false,
    note: '只核对当前源与指定安装目录，不证明该目录被宿主扫描、当前会话已加载或酒馆制品可运行；不修改全局规则，不删除旧文件。' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opt = flag => { const i = process.argv.indexOf(flag); if (i < 0) return undefined; const value = process.argv[i+1]; if (!value || value.startsWith('--')) throw Error(flag + ' 缺少值'); return value; };
    const result = process.argv.includes('--manifest') ? installationManifest(opt('--source') || defaultSource) : verifyInstallation({ source: opt('--source') || defaultSource, target: opt('--target'), host: opt('--host') || 'generic', checkDependencies: process.argv.includes('--check-dependencies') });
    console.log(JSON.stringify(result,null,2)); if (result.ok === false) process.exitCode = 1;
  } catch (error) { console.error(JSON.stringify({ ok: false, written: false, issues: [error.message] })); process.exitCode = 1; }
}
