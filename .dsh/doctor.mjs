// DSH 适配层诊断：一次把「为什么预设不见了 / 为什么改了没生效」查清楚。
//
//   node .dsh/doctor.mjs                  # 人类可读（默认检查正在运行的 dsh web）
//   node .dsh/doctor.mjs --json           # 机器可读，供 AI 或 CI 解析
//   node .dsh/doctor.mjs --offline        # 只做静态检查，不碰运行中的实例
//   node .dsh/doctor.mjs --profile my     # 指定 profile（默认 $DSH_PROFILE 或 web）
//   node .dsh/doctor.mjs --report out.json
//
// 七段检查，每段给出 status / detail / hint：
//   1. repo       仓库关键文件是否齐全（AGENT.md、模板、routing.yaml）
//   2. dsh        能否定位到已安装的 dsh 及其版本
//   3. build      生成物（.dsh/build）是否与模板/AGENT.md 一致，是否用当前 dsh 版本构建
//   4. profile    profile 的依赖、dsh.profile.bundles 与 node_modules 软链是否指向本仓库
//   5. compat     包/子路径能否解析、config 键是否还在、与内置 standard 的差异
//   6. dump       dsh --dump-config 能否真实加载出本预设行
//   7. runtime    正在运行的 dsh web 实例里，本预设是否健康（broken 即被选择器隐藏）
//
// 只读：不写仓库、不改 profile、不重启进程。修复动作都写在 hint 里，由人或 AI 决定。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_NAME,
  DEFAULT_OUT,
  PRESET_ID,
  PRESET_SLUG,
  REPO_ROOT,
  SKILL_DIR_NAME,
  dshAnchorCandidates,
  renderPreset,
  toPosix,
} from './build.mjs';
import { findDshInstall, resolveDshHome, resolveProfileDir, runCompatibility } from './compat.mjs';

/* ------------------------------------------------------------------ */
/* 命令行与输出                                                        */
/* ------------------------------------------------------------------ */

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const checks = [];
function addCheck(id, title, status, detail, hint) {
  checks.push({ id, title, status, ...(detail === undefined ? {} : { detail }), ...(hint === undefined ? {} : { hint }) });
}

const SYMBOL = { ok: '✔', warn: '!', error: '✖', skip: '·' };

/* ------------------------------------------------------------------ */
/* 各段检查                                                            */
/* ------------------------------------------------------------------ */

function checkRepo() {
  const required = [
    ['AGENT.md', path.join(REPO_ROOT, 'AGENT.md')],
    ['preset 模板', path.join(REPO_ROOT, '.dsh', 'preset.template.yml')],
    ['阶段路由', path.join(REPO_ROOT, 'orchestrator', 'routing.yaml')],
  ];
  const missing = required.filter(([, file]) => !fs.existsSync(file)).map(([label]) => label);
  if (missing.length > 0) {
    addCheck('repo', '仓库关键文件', 'error', `缺少 ${missing.join('、')}`, '确认在 rp-card-studio-agent 仓库里执行；文件被移动时同步修改 .dsh/*.mjs 的相对路径');
    return;
  }
  addCheck('repo', '仓库关键文件', 'ok', `AGENT.md、preset.template.yml、routing.yaml 齐全（${toPosix(REPO_ROOT)}）`);
}

function checkDsh() {
  const dsh = findDshInstall(dshAnchorCandidates());
  if (dsh === undefined) {
    addCheck('dsh', '已安装 dsh', 'warn', '找不到 @deepseek-ai/dsh 的 package.json', '设置 DSH_HOME，或在安装 dsh 的同一 Node 环境里运行；静态结构仍可校验，但 specifier/配置键检查会被跳过');
    return undefined;
  }
  const entry = dsh.entry === undefined ? '缺少 lib/bin.js，无法真实加载' : dsh.entry;
  addCheck('dsh', '已安装 dsh', 'ok', `${dsh.version}（${dsh.root}）`, entry === dsh.entry ? undefined : entry);
  return dsh;
}

function checkBuild(dsh) {
  let rendered;
  try {
    rendered = renderPreset({ repoRoot: REPO_ROOT, dshVersion: dsh?.version ?? 'unknown' });
  } catch (error) {
    addCheck('build', '生成物', 'error', `按模板渲染失败：${error instanceof Error ? error.message : String(error)}`, '先修模板或 AGENT.md，再运行 node .dsh/build.mjs');
    return;
  }
  const files = {
    patch: path.join(DEFAULT_OUT, 'cordis.patch.yml'),
    pkg: path.join(DEFAULT_OUT, 'package.json'),
    skill: path.join(DEFAULT_OUT, 'skills', SKILL_DIR_NAME, 'SKILL.md'),
  };
  const missing = Object.entries(files).filter(([, file]) => !fs.existsSync(file)).map(([label]) => label);
  if (missing.length > 0) {
    addCheck('build', '生成物', 'error', `.dsh/build 缺少 ${missing.join('、')}`, '运行 node .dsh/build.mjs（或 node .dsh/install.mjs）重新生成');
    return;
  }

  const stale = [];
  if (readText(files.patch) !== rendered.patch) stale.push('cordis.patch.yml');
  if (readText(files.skill) !== rendered.workflowSkill) stale.push('技能 SKILL.md');
  let builtVersion = 'unknown';
  try {
    const pkg = JSON.parse(readText(files.pkg));
    builtVersion = pkg?.generated?.dshVersion ?? 'unknown';
    if (pkg?.name !== BUNDLE_NAME) stale.push('package.json 包名');
    if (pkg?.dsh?.bundle?.patch !== './cordis.patch.yml') stale.push('package.json dsh.bundle.patch');
  } catch {
    stale.push('package.json 无法解析');
  }

  if (stale.length > 0) {
    addCheck(
      'build',
      '生成物新鲜度',
      'error',
      `与模板/AGENT.md 不一致：${stale.join('、')}`,
      '运行 node .dsh/build.mjs 重新生成；dsh 加载的是生成物，直接改模板不会生效',
    );
  } else {
    addCheck('build', '生成物新鲜度', 'ok', `与模板/AGENT.md 一致（构建时 dsh ${builtVersion}）`);
  }

  if (dsh !== undefined && builtVersion !== 'unknown' && builtVersion !== dsh.version) {
    addCheck(
      'build-version',
      '生成物与当前 dsh 版本',
      'warn',
      `生成物构建于 dsh ${builtVersion}，当前安装的是 ${dsh.version}`,
      '升级 dsh 后应重跑 node .dsh/build.mjs + node .dsh/verify.mjs，让 compat 按新版本复查一遍',
    );
  } else if (dsh !== undefined) {
    addCheck('build-version', '生成物与当前 dsh 版本', 'ok', `均为 dsh ${dsh.version}`);
  }
  return rendered;
}

function checkProfile(profile, profileDir) {
  const manifest = path.join(profileDir, 'package.json');
  if (!fs.existsSync(manifest)) {
    addCheck('profile', 'profile 注册', 'warn', `找不到 ${manifest}`, `profile 可能不叫 ${profile}：用 --profile 指定；还没装过就运行 node .dsh/install.mjs --profile ${profile}`);
    return;
  }
  let pkg;
  try {
    pkg = JSON.parse(readText(manifest));
  } catch (error) {
    addCheck('profile', 'profile 注册', 'error', `profile 清单不是合法 JSON：${error instanceof Error ? error.message : String(error)}`, `手工修复 ${manifest}，或重新生成 profile`);
    return;
  }

  const problems = [];
  const dependency = pkg?.dependencies?.[BUNDLE_NAME];
  if (typeof dependency !== 'string') {
    problems.push(`dependencies 里没有 ${BUNDLE_NAME}`);
  } else if (!dependency.startsWith('link:')) {
    problems.push(`依赖不是 link:（当前 ${dependency}）`);
  } else {
    const target = dependency.slice('link:'.length);
    if (path.resolve(target) !== path.resolve(DEFAULT_OUT)) {
      problems.push(`依赖指向 ${target}，不是仓库生成目录 ${DEFAULT_OUT}`);
    }
  }
  const bundles = Array.isArray(pkg?.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : [];
  if (!bundles.includes(BUNDLE_NAME)) problems.push(`dsh.profile.bundles 里没有 ${BUNDLE_NAME}`);

  if (problems.length > 0) {
    addCheck('profile', 'profile 注册', 'error', problems.join('；'), `运行 node .dsh/install.mjs --profile ${profile} 重新登记，然后重启 dsh web`);
  } else {
    addCheck('profile', 'profile 注册', 'ok', `依赖 ${dependency}；dsh.profile.bundles 已登记 ${BUNDLE_NAME}`);
  }

  // node_modules 里的实体：软链必须指向本仓库生成目录；若是拷贝，内容必须与刚渲染的结果一致。
  const linked = path.join(profileDir, 'node_modules', ...BUNDLE_NAME.split('/'));
  if (!fs.existsSync(linked)) {
    addCheck(
      'profile-link',
      'profile 里的 bundle 实体',
      problems.length > 0 ? 'warn' : 'error',
      `${linked} 不存在：dsh 可能仍按旧清单加载，或 npm install 还未执行`,
      `cd "${resolveDshHome()}" && npm install --install-links；随后重启 dsh web`,
    );
    return;
  }
  let stat;
  try {
    stat = fs.lstatSync(linked);
  } catch {
    stat = undefined;
  }
  if (stat?.isSymbolicLink()) {
    const target = fs.realpathSync.native(linked);
    const expected = fs.existsSync(DEFAULT_OUT) ? fs.realpathSync.native(DEFAULT_OUT) : path.resolve(DEFAULT_OUT);
    const same = path.resolve(target).toLowerCase() === path.resolve(expected).toLowerCase();
    addCheck(
      'profile-link',
      'profile 里的 bundle 实体',
      same ? 'ok' : 'error',
      same ? `软链指向 ${toPosix(expected)}` : `软链指向 ${toPosix(target)}，不是 ${toPosix(expected)}`,
      same ? undefined : '重跑 node .dsh/install.mjs；或删除该软链后 cd $DSH_HOME && npm install --install-links',
    );
    return;
  }
  // 拷贝安装：内容可能过期，比路径更值得检查。
  const installedPatch = path.join(linked, 'cordis.patch.yml');
  const fresh = fs.existsSync(installedPatch) && readText(installedPatch) === renderPreset({}).patch;
  addCheck(
    'profile-link',
    'profile 里的 bundle 实体',
    fresh ? 'warn' : 'error',
    fresh ? '是拷贝安装且内容较新；改动生成物后仍需 npm install --install-links 才会同步' : '是拷贝安装且 cordis.patch.yml 已过期（dsh 加载的仍是旧清单）',
    fresh ? '若想让重建立即生效，改用软链，或每次重建后执行 npm install --install-links' : '执行 npm install --install-links 或 node .dsh/install.mjs，然后重启 dsh web',
  );
}

function checkCompat(profile, profileDir) {
  const report = runCompatibility({ profile, profileDir });
  const errors = report.findings.filter((finding) => finding.severity === 'error');
  const warns = report.findings.filter((finding) => finding.severity === 'warn');
  if (errors.length > 0) {
    addCheck(
      'compat',
      'dsh 兼容性',
      'error',
      errors.map((finding) => `[${finding.rowId ?? '?'}] ${finding.message}`).join('；'),
      errors[0].hint,
    );
  } else if (warns.length > 0) {
    addCheck('compat', 'dsh 兼容性', 'warn', warns.map((finding) => `[${finding.rowId ?? '?'}] ${finding.message}`).join('；'), warns[0].hint);
  } else {
    addCheck('compat', 'dsh 兼容性', 'ok', `${report.rows} 行全部可解析、配置键存在、与内置 standard 无冲突`);
  }
  return report;
}

function checkDump(profile, profileDir, dsh) {
  if (dsh === undefined || dsh.entry === undefined) {
    addCheck('dump', 'dsh --dump-config', 'warn', '没有可用的 dsh 入口，跳过真实加载检查', '设置 DSH_HOME 后重试');
    return;
  }
  const probe = spawnSync(process.execPath, [dsh.entry, '--profile', profile, '--dump-config'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    windowsHide: true,
  });
  const dump = probe.stdout ?? '';
  const stderr = String(probe.stderr ?? '');
  const ownFailures = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('dsh: '))
    .filter((line) => line.includes(PRESET_SLUG) || line.includes(profile) || line.includes(BUNDLE_NAME));
  if (probe.status !== 0) {
    addCheck('dump', 'dsh --dump-config', 'error', `退出码 ${probe.status}：${stderr.split('\n')[0]?.slice(0, 300) ?? ''}`, '先修 profile/清单；需要更多细节时手工运行同一命令看完整 stderr');
    return;
  }
  const hasRow = dump.includes(`preset-${PRESET_SLUG}`) && dump.includes(`id: ${PRESET_ID}`);
  if (!hasRow) {
    addCheck(
      'dump',
      'dsh --dump-config',
      'error',
      `配置里没有本预设行（preset-${PRESET_SLUG} / id: ${PRESET_ID}）`,
      '检查 profile 的 dsh.profile.bundles 是否登记，node .dsh/install.mjs --dry-run 看注册结果',
    );
    return;
  }
  addCheck(
    'dump',
    'dsh --dump-config',
    ownFailures.length === 0 ? 'ok' : 'error',
    ownFailures.length === 0 ? `本预设行已加载（dump ${(dump.length / 1024).toFixed(0)} KiB）` : ownFailures.join(' | '),
    ownFailures.length === 0 ? undefined : '这些错误来自本适配层：按 compat / build 的提示修复后重跑',
  );
}

/* ------------------------------------------------------------------ */
/* 运行中的实例：预设是否被标记 broken                                  */
/* ------------------------------------------------------------------ */

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** dsh-launch.instance.json 的 startTicks 来自 .NET `DateTime.Ticks`（0001 年起、100ns 刻度），不是 FILETIME。 */
function fileTimeToMs(ticks) {
  if (!Number.isFinite(ticks) || ticks <= 0) return undefined;
  return Math.round(ticks / 10_000 - 62_135_596_800_000);
}

function decryptProtectedUrl(blob) {
  if (process.platform !== 'win32') return undefined;
  const script = [
    '$s = ConvertTo-SecureString $env:DSH_PROTECTED_URL',
    '$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)',
    '[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
    env: { ...process.env, DSH_PROTECTED_URL: blob },
  });
  const url = String(result.stdout ?? '').trim();
  return result.status === 0 && /^https?:\/\//.test(url) ? url : undefined;
}

async function readPresetRoster(url) {
  const timeout = AbortSignal.timeout(8_000);
  const probe = await fetch(url, { redirect: 'manual', signal: timeout });
  const setCookies = typeof probe.headers.getSetCookie === 'function' ? probe.headers.getSetCookie() : [];
  const cookieHeader = setCookies.map((value) => value.split(';')[0]).join('; ');
  await probe.text().catch(() => '');
  const body = {
    type: 'client-request',
    rpcId: `doctor-${Date.now()}`,
    method: 'agentPresets/list',
    payload: { args: {} },
  };
  const response = await fetch(new URL('/api/agentPresets/list', url).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookieHeader === '' ? {} : { cookie: cookieHeader }) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`返回的不是 JSON（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }
  const presets = parsed?.result?.value?.presets;
  if (!Array.isArray(presets)) {
    throw new Error(`接口返回异常（HTTP ${response.status}）：${text.slice(0, 300)}`);
  }
  return presets;
}

async function checkRuntime(profile) {
  const instancePath = path.join(resolveDshHome(), 'dsh-launch.instance.json');
  if (!fs.existsSync(instancePath)) {
    addCheck('runtime', '运行中的实例', 'skip', `没有 ${instancePath}：当前不是 dsh web 启动的会话`, '先启动 dsh web，或加 --offline 跳过');
    return;
  }
  let instance;
  try {
    instance = JSON.parse(readText(instancePath));
  } catch (error) {
    addCheck('runtime', '运行中的实例', 'warn', `启动实例文件无法解析：${error instanceof Error ? error.message : String(error)}`, '重启 dsh web 会重写该文件');
    return;
  }
  if (Number.isInteger(instance?.processId) && !isProcessAlive(instance.processId)) {
    addCheck('runtime', '运行中的实例', 'skip', `实例文件存在但进程 ${instance.processId} 已退出（文件已过期）`, '重新启动 dsh web；用新进程复查本预设');
    return;
  }
  if (typeof instance?.protectedUrl !== 'string' || instance.protectedUrl === '') {
    addCheck('runtime', '运行中的实例', 'skip', '实例文件里没有 protectedUrl，无法鉴权', '重启 dsh web 会重写该文件');
    return;
  }

  // 实例启动后是否又重建过：生成物比实例新，说明运行中的实例仍是旧内容（HMR 不监视 bundle）。
  const startedAt = fileTimeToMs(instance.startTicks);
  const patchFile = path.join(DEFAULT_OUT, 'cordis.patch.yml');
  const builtAt = fs.existsSync(patchFile) ? fs.statSync(patchFile).mtimeMs : undefined;
  if (startedAt !== undefined && builtAt !== undefined) {
    const started = new Date(startedAt).toLocaleString();
    const built = new Date(builtAt).toLocaleString();
    addCheck(
      'runtime-freshness',
      '运行实例与生成物',
      builtAt > startedAt ? 'warn' : 'ok',
      builtAt > startedAt
        ? `生成物在实例启动之后重建（构建 ${built} > 启动 ${started}），运行中的实例仍加载旧内容`
        : `实例启动于 ${started}，晚于生成物（构建 ${built}）`,
      builtAt > startedAt ? '重启 dsh web 后新生成物才会生效' : undefined,
    );
  }
  const url = decryptProtectedUrl(instance.protectedUrl);
  if (url === undefined) {
    addCheck('runtime', '运行中的实例', 'warn', 'protectedUrl 解密失败（DPAPI 只能由启动它的 Windows 用户解密）', '用启动 dsh web 的同一用户运行 doctor；或加 --offline 跳过运行时检查');
    return;
  }

  let presets;
  try {
    presets = await readPresetRoster(url);
  } catch (error) {
    addCheck(
      'runtime',
      '运行中的实例',
      'warn',
      `查询 ${new URL(url).host} 的预设清单失败：${error instanceof Error ? error.message : String(error)}`,
      '实例可能正在重启或端口已变；稍后重试，或加 --offline 只看静态部分',
    );
    return;
  }
  const mine = presets.find((preset) => preset?.id === PRESET_ID);
  if (mine === undefined) {
    addCheck(
      'runtime',
      '运行中的实例',
      'warn',
      `${new URL(url).host} 没有列出本预设（profile 可能未加载本 bundle）`,
      `确认运行实例用的 profile 是否已登记本 bundle；profile 变更后必须重启 dsh web`,
    );
    return;
  }
  if (mine.broken !== undefined) {
    addCheck(
      'runtime',
      '运行中的实例',
      'error',
      `预设被标记 broken（因此不出现在选择器里）：${mine.broken}`,
      '该标记是实例启动时的挂载结果；若上面的 build/compat 都已通过，重启 dsh web 后它会消失。重启后仍在，再按 compat 的行级提示排查',
    );
    return;
  }
  const brokenOthers = presets.filter((preset) => preset?.broken !== undefined && preset.id !== PRESET_ID).map((preset) => preset.id);
  addCheck(
    'runtime',
    '运行中的实例',
    'ok',
    `${new URL(url).host} 共 ${presets.length} 个预设，本预设「${mine.name ?? PRESET_ID}」健康${brokenOthers.length > 0 ? `；其它 broken：${brokenOthers.join('、')}` : ''}`,
  );
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

async function main() {
  const profile = option('--profile', process.env.DSH_PROFILE ?? 'web');
  const profileDir = resolveProfileDir(profile);
  const offline = hasFlag('--offline');
  const dshHome = resolveDshHome();

  checkRepo();
  const dsh = checkDsh();
  checkBuild(dsh);
  checkProfile(profile, profileDir);
  const compat = checkCompat(profile, profileDir);
  if (offline) {
    addCheck('dump', 'dsh --dump-config', 'skip', '--offline：按要求跳过真实加载检查');
    addCheck('runtime', '运行中的实例', 'skip', '--offline：按要求跳过运行中实例检查');
  } else {
    checkDump(profile, profileDir, dsh);
    await checkRuntime(profile);
  }

  const counts = { ok: 0, warn: 0, error: 0, skip: 0 };
  for (const check of checks) counts[check.status] += 1;
  const hints = [...new Set(checks.filter((check) => check.status === 'error' && check.hint !== undefined).map((check) => check.hint))];
  const report = {
    repo: REPO_ROOT,
    dshHome,
    profile,
    profileDir,
    offline,
    dsh: dsh ?? null,
    checks,
    compat: { counts: compat.counts, ok: compat.ok },
    counts,
    conclusion: counts.error === 0 ? 'healthy' : 'needs-attention',
    hints,
  };

  const target = option('--report', undefined);
  if (target !== undefined) {
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    fs.writeFileSync(path.resolve(target), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (hasFlag('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(report)}\n`);
  }
  if (counts.error > 0) process.exitCode = 1;
}

function formatReport(report) {
  const lines = [`rp-card-studio 适配层诊断（只读）`, `  仓库    ${toPosix(report.repo)}`, `  profile ${report.profile}（${toPosix(report.profileDir)}）`];
  lines.push(`  dsh     ${report.dsh === null ? '未找到已安装的 dsh' : `${report.dsh.version}（${toPosix(report.dsh.root)}）`}`);
  lines.push('');
  for (const check of report.checks) {
    lines.push(`${SYMBOL[check.status]} ${check.id.padEnd(14)} ${check.title}`);
    if (check.detail !== undefined && check.detail !== '') lines.push(`  ${check.detail}`);
    if (check.hint !== undefined) lines.push(`        → ${check.hint}`);
  }
  lines.push('');
  if (report.counts.error === 0) {
    lines.push(report.counts.warn === 0 ? '结论：健康（✔，可以新建会话使用本预设）' : `结论：可用，但有 ${report.counts.warn} 个提醒`);
  } else {
    lines.push(`结论：${report.counts.error} 个错误 / ${report.counts.warn} 个警告，按上面的 → 逐条处理`);
    if (report.hints.length > 0) {
      lines.push('下一步：');
      for (const hint of report.hints) lines.push(`  - ${hint}`);
    }
  }
  if (report.compat !== undefined && report.compat.counts !== undefined) {
    lines.push('');
    lines.push(
      `兼容性细节：${report.compat.counts.error} 错误 / ${report.compat.counts.warn} 警告 / ${report.compat.counts.info} 提示（node .dsh/compat.mjs 可看全文）`,
    );
  }
  return lines.join('\n');
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
