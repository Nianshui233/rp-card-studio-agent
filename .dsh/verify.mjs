// 校验 DSH 适配：静态结构检查 + 能用真实 dsh 加载时的一致性检查。
//
//   node .dsh/verify.mjs                    # 结构检查 + 尝试 dsh --dump-config
//   node .dsh/verify.mjs --profile my       # 指定 profile
//   node .dsh/verify.mjs --offline          # 只做结构检查
//
// 结论只有两种：`verified`（真实 dsh 加载过，含本 bundle 与本 preset）或
// `structural-only`（没跑真实加载，必须按“未验证”报告，不能声称已通过）。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BUNDLE_NAME, PRESET_ID, REPO_ROOT, SKILL_DIR_NAME, dshAnchorCandidates, renderPreset, toPosix } from './build.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
}

function resolveDshCommand() {
  for (const anchor of dshAnchorCandidates()) {
    try {
      const pkg = JSON.parse(readUtf8(anchor));
      if (pkg.name !== '@deepseek-ai/dsh') continue;
      const entry = path.join(path.dirname(anchor), 'lib', 'bin.js');
      if (fs.existsSync(entry)) return { kind: 'node-script', entry, version: pkg.version, anchor };
    } catch {
      // 下一个锚点
    }
  }
  return { kind: 'absent' };
}

function loadYamlModule() {
  for (const anchor of dshAnchorCandidates()) {
    try {
      return createRequire(anchor)('yaml');
    } catch {
      // 下一个锚点
    }
  }
  return undefined;
}

function main() {
  const rendered = renderPreset({ repoRoot: REPO_ROOT });
  const out = path.resolve(option('--out', path.join(REPO_ROOT, '.dsh', 'build')));
  const yaml = loadYamlModule();
  const report = { repoRoot: REPO_ROOT, out, checks, conclusion: null, remaining: [], dsh: resolveDshCommand() };

  check('persona 包含运行环境前言', rendered.persona.startsWith('# 运行环境（DeepSeek Harness）'));
  check('persona 包含 AGENT.md 全文', rendered.persona.includes('# SillyTavern制卡工坊') && rendered.persona.includes('## 最终检验与交付'));
  check('宏已用零宽空格转义且无残留', rendered.residual === 0 && rendered.patched.length > 0, `${rendered.patched.length} 处`);
  check('阶段数与 routing.yaml 一致', rendered.routing.stages.length > 0, `${rendered.routing.stages.length} 阶段 / ${rendered.routing.skillPaths.length} 技能`);
  check('生成清单不含绝对路径', !/[A-Za-z]:[\\/]/.test(rendered.patch));
  check('生成清单包含仓库技能根目录', rendered.patch.includes("dshHomePath('workspace', 'rp-card-studio-agent', 'internal-skills')"));
  check('生成清单包含预设技能根目录', rendered.patch.includes("dshHomePath('presets', 'rp-card-studio', 'skills')"));

  if (yaml === undefined) {
    check('YAML 解析器可用', false, '找不到 yaml 模块：跳过结构解析检查');
  } else {
    const doc = yaml.parseDocument(rendered.patch, { customTags: [{ tag: '!!js', resolve: (value) => value }] });
    check('清单 YAML 可解析', doc.errors.length === 0, doc.errors.map((error) => String(error.message).split('\n')[0]).join(' | '));
    const rows = doc.toJS() ?? [];
    check('顶层是 patch 数组且含本 preset', rows[0]?.insert?.[0]?.config?.id === PRESET_ID);
  }

  const built = {
    package: path.join(out, 'package.json'),
    patch: path.join(out, 'cordis.patch.yml'),
    skill: path.join(out, 'skills', SKILL_DIR_NAME, 'SKILL.md'),
  };
  for (const [name, file] of Object.entries(built)) {
    check(`生成物存在：${name}`, fs.existsSync(file), file);
  }
  if (fs.existsSync(built.package)) {
    const pkg = JSON.parse(readUtf8(built.package));
    check('生成清单声明 dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml');
    check('生成清单包名正确', pkg.name === BUNDLE_NAME);
  }
  if (fs.existsSync(built.skill)) {
    const skill = readUtf8(built.skill);
    check('入口技能含契约根目录', skill.includes(toPosix(REPO_ROOT)));
    check('入口技能含阶段表与脚本表', skill.includes('## 阶段路由') && skill.includes('continuation.mjs'));
  }
  check('仓库技能目录存在', fs.existsSync(path.join(REPO_ROOT, 'internal-skills')));

  const profile = option('--profile', process.env.DSH_PROFILE ?? 'web');
  const dshHome = process.env.DSH_HOME ?? path.dirname(path.dirname(process.env.DSH_PROFILE_DIR ?? ''));
  const profileManifest = path.join(dshHome, 'profiles', profile, 'package.json');
  if (!hasFlag('--offline') && report.dsh.kind === 'node-script' && fs.existsSync(profileManifest)) {
    const probe = spawnSync(process.execPath, [report.dsh.entry, '--profile', profile, '--dump-config'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const dump = probe.stdout ?? '';
    const stderr = String(probe.stderr ?? '');
    check('dsh --dump-config 退出码为 0', probe.status === 0, `status=${probe.status} ${stderr.slice(0, 400)}`);
    check('dump 包含本 bundle 层', dump.includes(BUNDLE_NAME));
    check('dump 包含本 preset 行', dump.includes('preset-rp-card-studio'));
    check('dump 已还原 dshHomePath 路径', dump.includes('internal-skills'));
    // dsh 对其它 bundle 的容忍性警告走 stderr；只把指向本适配层的失败当成本次回归。
    const ownFailures = stderr
      .split('\n')
      .filter((line) => /^dsh: /.test(line))
      .filter((line) => line.includes('rp-card-studio') || line.includes(profile));
    check('本次加载未报本适配层错误', ownFailures.length === 0, ownFailures.join(' | '));
    report.stderrNotices = stderr.split('\n').filter((line) => line.trim() !== '').slice(0, 8);
    report.dumpBytes = dump.length;
    report.conclusion = checks.every((entry) => entry.ok) ? 'verified' : 'failed';
  } else {
    report.conclusion = checks.every((entry) => entry.ok) ? 'structural-only' : 'failed';
    if (report.dsh.kind === 'absent') report.remaining.push('未找到 dsh 安装：真实加载检查未执行（runtime: not_run）');
    if (!fs.existsSync(profileManifest)) report.remaining.push(`未找到 profile 清单 ${profileManifest}：跳过真实加载检查`);
    if (hasFlag('--offline')) report.remaining.push('--offline：按要求跳过真实加载检查');
  }
  report.failed = checks.filter((entry) => !entry.ok).map((entry) => entry.name);
  const target = option('--report', undefined);
  if (target !== undefined) {
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    fs.writeFileSync(path.resolve(target), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failed.length > 0) process.exitCode = 1;
}

main();
