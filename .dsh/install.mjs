// 把仓库生成的 DSH bundle 装进指定 profile：
//
//   node .dsh/install.mjs                          # 默认 profile：$DSH_PROFILE 或 web
//   node .dsh/install.mjs --profile my --dry-run
//   node .dsh/install.mjs --out <目录>             # 换个输出目录（默认 .dsh/build）
//   node .dsh/install.mjs --repo-dir <路径>        # 换仓库位置（生成清单里的技能根目录）
//
// 做三件事，全部幂等：
//   1. 跑一次构建，把清单写进 --out；
//   2. 在 profiles/<profile>/package.json 里登记依赖 "@local/dsh-rp-card-studio": "link:<out>"；
//   3. 把 "@local/dsh-rp-card-studio" 追加进 dsh.profile.bundles。
//
// 只动这两处，不创建 __dirname/node_modules 的软链（dsh 自己按 link: 覆盖安装），
// 也不碰 profile 的 cordis.patch.yml 与 $DSH_HOME/cordis.patch.yml。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLE_NAME, DEFAULT_OUT, REPO_ROOT, dshAnchorCandidates, renderPreset, toPosix } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function resolveDshHome() {
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '') return path.resolve(process.env.DSH_HOME);
  const profileDir = process.env.DSH_PROFILE_DIR;
  if (profileDir && profileDir.trim() !== '') return path.resolve(profileDir, '..', '..');
  return path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
}

/** 只重写 bundles 数组里的条目文本，保留文件原有的缩进与键序，不整体重新序列化。 */
function patchBundles(raw, bundleName) {
  const arrayMatch = /("bundles"\s*:\s*\[)([\s\S]*?)(\n(\s*)\])/.exec(raw);
  if (arrayMatch === null) return { raw, changed: false, reason: 'missing-bundles-array' };
  const [whole, open, body, close, indent] = arrayMatch;
  const entries = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
  if (entries.includes(bundleName)) return { raw, changed: false, reason: 'already-registered' };
  const nextBody = `${body.replace(/,\s*$/, '')},\n${indent}  ${JSON.stringify(bundleName)}`;
  return { raw: raw.replace(whole, `${open}${nextBody}${close}`), changed: true, reason: 'appended' };
}

/** 只重写 dependencies 里这一条，其它依赖原样保留。 */
function patchDependency(raw, bundleName, linkTarget) {
  const value = `link:${toPosix(linkTarget)}`;
  const depsMatch = /("dependencies"\s*:\s*\{)([\s\S]*?)(\n(\s*)\})/.exec(raw);
  if (depsMatch === null) return { raw, changed: false, reason: 'missing-dependencies' };
  const [whole, open, body, close, indent] = depsMatch;
  const existing = new RegExp(`"${bundleName.replace(/[/\\]/g, '\\$&')}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(body);
  const line = `${indent}  ${JSON.stringify(bundleName)}: ${JSON.stringify(value)}`;
  if (existing !== null) {
    if (existing[1] === value) return { raw, changed: false, reason: 'already-linked' };
    return { raw: raw.replace(whole, `${open}${body.replace(existing[0], line.trim())}${close}`), changed: true, reason: 'relinked' };
  }
  const entries = [...body.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map((match) => match[1]);
  const firstEntry = entries[0];
  const inserted = firstEntry === undefined
    ? `\n${line}`
    : `\n${line},`;
  return { raw: raw.replace(whole, `${open}${inserted}${body}${close}`), changed: true, reason: 'added' };
}

/** dsh 版本优先从已安装包读，避免为了探测版本去 spawn 一个 shell。 */
function detectDshVersion() {
  for (const anchor of dshAnchorCandidates()) {
    try {
      const pkg = JSON.parse(readUtf8(anchor));
      if (pkg.name === '@deepseek-ai/dsh') return { source: anchor, version: pkg.version };
    } catch {
      // 下一个锚点
    }
  }
  return { source: null, version: 'unknown' };
}

/** Windows 上 --out 可能来自 TEMP 的 8.3 短路径；写进清单前解析成长路径，避免两处写法不一致。 */
function canonicalize(target) {
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function emit(report) {
  const target = option('--report', undefined);
  if (target !== undefined) writeJson(path.resolve(target), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function main() {
  const dshHome = resolveDshHome();
  const profile = option('--profile', process.env.DSH_PROFILE ?? 'web');
  const out = canonicalize(option('--out', DEFAULT_OUT));
  const dryRun = hasFlag('--dry-run');
  const profileDir = path.join(dshHome, 'profiles', profile);
  const manifestPath = path.join(profileDir, 'package.json');

  const report = { dshHome, profile, profileDir, out, dryRun, steps: [], warnings: [], next: [] };
  report.dsh = detectDshVersion();

  const rendered = renderPreset({ repoRoot: REPO_ROOT });
  const targets = [
    [path.join(out, 'package.json'), `${JSON.stringify(rendered.pkg, null, 2)}\n`],
    [path.join(out, 'cordis.patch.yml'), rendered.patch],
    [path.join(out, 'skills', 'rp-card-studio-workflow', 'SKILL.md'), rendered.workflowSkill],
  ];
  if (!dryRun) {
    for (const [file, content] of targets) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    }
  }
  report.steps.push({
    step: 'build',
    out,
    files: targets.map(([file]) => file),
    written: !dryRun,
    personaBytes: Buffer.byteLength(rendered.persona, 'utf8'),
    stages: rendered.routing.stages.length,
  });

  if (!fs.existsSync(manifestPath)) {
    report.warnings.push(`找不到 profile 清单：${manifestPath}；跳过注册步骤。`);
    emit(report);
    process.exitCode = 1;
    return;
  }

  const original = readUtf8(manifestPath);
  const dep = patchDependency(original, BUNDLE_NAME, out);
  const bundles = patchBundles(dep.raw, BUNDLE_NAME);
  const changed = dep.changed || bundles.changed;
  if (changed && !dryRun) fs.writeFileSync(manifestPath, bundles.raw, 'utf8');
  report.steps.push({
    step: 'register-profile-bundle',
    manifest: manifestPath,
    dependency: { value: `link:${toPosix(out)}`, result: dep.reason },
    bundles: { result: bundles.reason },
    written: changed && !dryRun,
  });

  report.steps.push({
    step: 'install-deps',
    command: `cd "${dshHome}" && npm install --install-links`,
    ran: false,
    note: 'npm 按 link: 把 out 覆盖安装到 node_modules；离线也可用，因为源就是本地目录。',
  });
  report.next.push(`cd "${dshHome}" && npm install --install-links`);
  report.next.push(`node "${path.join(HERE, 'verify.mjs')}" --profile ${profile}`);
  report.next.push('重启 dsh web：profile bundle 清单改动不被 HMR 监视，新会话才会加载新的 persona。');
  emit(report);
}

main();
