// DSH 兼容性探针：把「新版 dsh 改了什么」变成机器可读的结论。
//
//   node .dsh/compat.mjs            # 人类可读摘要
//   node .dsh/compat.mjs --json     # 机器可读（CI / AI 代理使用）
//
// 它检查四件事：
//   1. 预设每一行引用的包与子路径，在已安装的 dsh 里真的能被解析。
//      0.2.2 删掉了 `@deepseek-ai/dsh-tool-subagent-control/list-agents`
//      这个子路径，就是在这一步暴露的：该行 never started，整个预设随后
//      被新任务选择器过滤掉（broken preset 不显示）。
//   2. 行的 config 键在该包源码里存在。宿主对未知键是静默忽略、不报错的，
//      `modelSelectionSettings` 被 `modelSelection` 取代就是这样悄悄失效的。
//   3. 与 dsh 内置 standard preset 的行集合做 diff：改名、新增、缺失的行
//      都能看见，升级 dsh 后先跑这里，就知道适配层要跟哪些改动。
//   4. 子路径引用单独告警：子路径（`/list-agents`、`/tools`）是版本间
//      最容易消失的一种引用。
//
// 本文件不修改任何东西：只读仓库模板与已安装的 dsh（含其内置 preset 文件）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, dshAnchorCandidates, indentBlock, loadYamlModule, readUtf8 } from './build.mjs';

/** 模板里的 `__PERSONA__` 在源文件里不缩进，构建时才按块标量规则缩进；解析前先补上。 */
const PERSONA_PLACEHOLDER = '__PERSONA__';
const PERSONA_INDENT_WIDTH = 24;

const TEMPLATE_FILE = path.join(REPO_ROOT, '.dsh', 'preset.template.yml');
const PRESET_ROW_NAME = '@deepseek-ai/dsh-agent-preset';

/** 把一行 `name: '@scope/pkg/sub/path'` 拆成包名与 exports 子路径（`'.'` 表示包根）。 */
export function splitSpecifier(spec) {
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const rest = spec.slice(name.length);
  return { name, subpath: rest === '' ? '.' : `.${rest}` };
}

/**
 * 判断 package.json 的 `exports` 是否允许某个子路径。
 * 只做静态键匹配（含 `*` 通配），不执行宿主加载：它回答的是"这个 spec
 * 在 node 解析器眼里是否合法"，不回答"插件启动后是否正常"。
 */
export function exportsAllowsSubpath(pkg, subpath = '.') {
  const field = pkg.exports;
  if (field === undefined || field === null) return { ok: true, available: [] };
  if (typeof field === 'string' || Array.isArray(field)) return { ok: subpath === '.', available: ['.'] };
  if (typeof field !== 'object') return { ok: true, available: [] };
  let map = field;
  let keys = Object.keys(map);
  // 条件导出对象（{ types, import, default }）没有子路径键，整体就是主入口。
  if (!keys.some((key) => key === '.' || key.startsWith('./'))) {
    map = { '.': map };
    keys = ['.'];
  }
  if (keys.includes(subpath)) return { ok: true, available: keys };
  for (const key of keys) {
    if (!key.includes('*')) continue;
    const star = key.indexOf('*');
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.length >= prefix.length + suffix.length && subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
      return { ok: true, available: keys };
    }
  }
  return { ok: false, available: keys };
}

function combineDisabled(outer, own) {
  if (outer === true || own === true) return true;
  if (outer === 'conditional' || own === 'conditional') return 'conditional';
  return false;
}

/**
 * 把 preset 的 plugins 数组摊平成"真正会挂载的插件行"。
 * 组行（`group: true` + `config: [...]`）只作为结构，子行继承组的 disabled。
 * 与 `@deepseek-ai/dsh-agent-preset-registry` 的 flattenRows 保持同一语义。
 */
export function flattenPresetRows(plugins, outerDisabled = false) {
  const rows = [];
  for (const row of plugins ?? []) {
    if (row === null || typeof row !== 'object') continue;
    const disabled = combineDisabled(outerDisabled, row.disabled);
    if (row.group === true) {
      rows.push(...flattenPresetRows(row.config, disabled === true));
      continue;
    }
    rows.push({
      id: typeof row.id === 'string' && row.id !== '' ? row.id : undefined,
      spec: typeof row.name === 'string' && row.name !== '' ? row.name : undefined,
      config: row.config !== null && typeof row.config === 'object' && !Array.isArray(row.config) ? row.config : {},
      disabled: disabled === true,
      conditional: disabled === 'conditional',
    });
  }
  return rows;
}

/** 已安装 dsh 的根目录、版本与启动入口；找不到返回 undefined（适配层允许在没有 dsh 的机器上运行）。 */
export function findDshInstall(anchors = dshAnchorCandidates()) {
  for (const anchor of anchors) {
    try {
      const pkg = JSON.parse(readUtf8(anchor));
      if (pkg.name !== '@deepseek-ai/dsh') continue;
      const root = path.dirname(anchor);
      const entry = path.join(root, 'lib', 'bin.js');
      return { root, version: pkg.version, manifest: anchor, entry: fs.existsSync(entry) ? entry : undefined };
    } catch {
      // 试下一个锚点
    }
  }
  return undefined;
}

/** $DSH_HOME：显式环境变量优先，其次 DSH_PROFILE_DIR 的上两级，最后是 ~/.dsh。 */
export function resolveDshHome() {
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '') return path.resolve(process.env.DSH_HOME);
  const profileDir = process.env.DSH_PROFILE_DIR;
  if (profileDir && profileDir.trim() !== '') return path.resolve(profileDir, '..', '..');
  return path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh');
}

/** 目标 profile 目录：显式 --profile 优先，其次 $DSH_PROFILE_DIR。 */
export function resolveProfileDir(profile = process.env.DSH_PROFILE ?? 'web') {
  const explicit = process.env.DSH_PROFILE_DIR;
  if (explicit && explicit.trim() !== '') return path.resolve(explicit);
  return path.join(resolveDshHome(), 'profiles', profile);
}

/** 在若干 node_modules 根里定位包目录（不做 exports 校验）。 */
export function resolvePackageRoot(name, searchDirs) {
  for (const dir of searchDirs) {
    const root = path.join(dir, 'node_modules', ...name.split('/'));
    const manifest = path.join(root, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    try {
      return { root, pkg: JSON.parse(readUtf8(manifest)) };
    } catch {
      // 清单损坏：当作没找到，交给上层报告
    }
  }
  return undefined;
}

/** 解析一个 specifier：先在 profile 的 node_modules，再在 dsh 自己的 node_modules。 */
export function resolveSpecifier(spec, searchDirs) {
  const { name, subpath } = splitSpecifier(spec);
  let failure;
  for (const dir of searchDirs) {
    const found = resolvePackageRoot(name, [dir]);
    if (found === undefined) continue;
    const allow = exportsAllowsSubpath(found.pkg, subpath);
    if (allow.ok) return { ok: true, root: found.root, pkg: found.pkg };
    failure = { ok: false, reason: 'not-exported', root: found.root, pkg: found.pkg, available: allow.available };
  }
  return failure ?? { ok: false, reason: 'not-found' };
}

/* ------------------------------------------------------------------ */
/* 配置键：宿主对未知键静默忽略，必须查源码里到底有没有这个键           */
/* ------------------------------------------------------------------ */

const sourceCache = new Map();
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

function packageSourceText(root) {
  if (sourceCache.has(root)) return sourceCache.get(root);
  const chunks = [];
  let total = 0;
  const walk = (dir, depth) => {
    if (depth > 4 || total > MAX_SOURCE_BYTES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (/\.(?:js|mjs|cjs|ts)$/.test(entry.name)) {
        try {
          const text = readUtf8(full);
          total += text.length;
          chunks.push(text);
        } catch {
          // 读不了就跳过
        }
      }
    }
  };
  walk(path.join(root, 'lib'), 0);
  const joined = chunks.join('\n');
  sourceCache.set(root, joined);
  return joined;
}

/** 键是否真的出现在包的实现/类型里（作为标识符，边界匹配，避免子串误判）。 */
export function packageDeclaresKey(root, key) {
  const text = packageSourceText(root);
  if (text === '') return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(text);
}

/** 编辑距离：给"这个键是不是改名了"一个可操作的猜测。 */
export function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j += 1) table[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost);
    }
  }
  return table[rows - 1][cols - 1];
}

/** 为一个"源码里不存在"的键给出最可能的改名目标。 */
export function suggestKeyRename(key, candidates = []) {
  const list = [...candidates].filter((candidate) => typeof candidate === 'string' && candidate !== key);
  if (list.length === 0) return undefined;
  const base = /^(.+?)Settings$/i.exec(key)?.[1] ?? key;
  const ranked = list
    .map((candidate) => ({ candidate, distance: editDistance(base, candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));
  const best = ranked[0];
  const threshold = Math.max(2, Math.floor(base.length / 3));
  return best.distance <= threshold ? best.candidate : undefined;
}

/* ------------------------------------------------------------------ */
/* 读取内置 preset：dsh 自己怎么用这些插件，是最可靠的"现行写法"参照   */
/* ------------------------------------------------------------------ */

/** 读 profile 的 dsh.profile.bundles，得到按加载顺序排列的 bundle 名。 */
export function readBundleNames(profileDir) {
  try {
    const pkg = JSON.parse(readUtf8(path.join(profileDir, 'package.json')));
    const bundles = pkg?.dsh?.profile?.bundles;
    return Array.isArray(bundles) ? bundles.filter((name) => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 找到带 `presets/*.patch.yml` 的 app bundle（web 上是 `@deepseek-ai/dsh-web-app`）。
 * 先按 profile 的 bundles 顺序找，找不到再扫 dsh 自带的 @deepseek-ai/*。
 */
export function findShippedPresetBundle({ profileDir, dshRoot }) {
  const candidates = [];
  if (profileDir) {
    for (const name of readBundleNames(profileDir)) {
      if (!name.startsWith('@deepseek-ai/')) continue;
      const found = resolvePackageRoot(name, [profileDir]);
      if (found !== undefined) candidates.push({ bundle: name, root: found.root });
    }
  }
  if (dshRoot) {
    const scopeDir = path.join(dshRoot, 'node_modules', '@deepseek-ai');
    let entries = [];
    try {
      entries = fs.readdirSync(scopeDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries.filter((value) => value.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      candidates.push({ bundle: `@deepseek-ai/${entry.name}`, root: path.join(scopeDir, entry.name) });
    }
  }
  for (const candidate of candidates) {
    const dir = path.join(candidate.root, 'presets');
    let files;
    try {
      files = fs.readdirSync(dir).filter((file) => file.endsWith('.patch.yml')).sort().map((file) => path.join(dir, file));
    } catch {
      continue;
    }
    if (files.length > 0) return { ...candidate, files };
  }
  return undefined;
}

/** 解析一个 patch 文件里所有 `- insert: [preset 声明]`，返回 {id, plugins, file}。 */
export function readPatchDeclarations(file) {
  const yaml = loadYamlModule();
  if (yaml === undefined) return [];
  const doc = yaml.parseDocument(readUtf8(file), { customTags: [{ tag: '!!js', resolve: (value) => value }] });
  if (doc.errors.length > 0) return [];
  const declarations = [];
  for (const row of doc.toJS() ?? []) {
    for (const inserted of row?.insert ?? []) {
      if (inserted?.name !== PRESET_ROW_NAME || !Array.isArray(inserted?.config?.plugins)) continue;
      declarations.push({ id: inserted.config.id, plugins: inserted.config.plugins, file });
    }
  }
  return declarations;
}

/** 汇总内置 preset 的插件用法：spec → 出现过的 config 键；id → spec。 */
export function collectShippedUsage(declarations) {
  const keysBySpec = new Map();
  const specById = new Map();
  for (const declaration of declarations) {
    for (const row of flattenPresetRows(declaration.plugins)) {
      if (row.spec === undefined) continue;
      const keys = keysBySpec.get(row.spec) ?? new Set();
      for (const key of Object.keys(row.config)) keys.add(key);
      keysBySpec.set(row.spec, keys);
      if (row.id !== undefined) specById.set(row.id, row.spec);
    }
  }
  return { keysBySpec, specById };
}

/* ------------------------------------------------------------------ */
/* 检查与报告                                                          */
/* ------------------------------------------------------------------ */

/** 逐行检查 specifier 与 config 键；返回结构化 findings。 */
export function checkRows(rows, { searchDirs, shippedKeys = new Map() } = {}) {
  const findings = [];
  for (const row of rows) {
    if (row.spec === undefined) continue;
    const resolved = resolveSpecifier(row.spec, searchDirs);
    if (!resolved.ok) {
      findings.push({
        severity: row.disabled ? 'warn' : 'error',
        code: resolved.reason === 'not-found' ? 'specifier-missing' : 'specifier-not-exported',
        rowId: row.id,
        spec: row.spec,
        message:
          resolved.reason === 'not-found'
            ? `行 ${row.id} 引用的 ${row.spec} 在已安装的 dsh 里找不到`
            : `行 ${row.id} 引用的 ${row.spec} 未导出：包存在，但 exports 不允许这个子路径`,
        hint:
          resolved.reason === 'not-exported'
            ? `该包当前导出：${(resolved.available ?? []).join('、') || '（无）'}。删掉这一行，或改用包根名，或查明新版把该能力并入了哪个插件`
            : '检查包名拼写，或确认新版 dsh 是否改名、合并、移除了该插件',
      });
      continue;
    }
    if (splitSpecifier(row.spec).subpath !== '.') {
      findings.push({
        severity: 'warn',
        code: 'subpath-specifier',
        rowId: row.id,
        spec: row.spec,
        message: `行 ${row.id} 用子路径引用 ${row.spec}`,
        hint: '子路径在 dsh 版本间最容易消失（0.2.2 删过 list-agents）；能换包根名就换，换不了就让它每次升级后接受 compat 复查',
      });
    }
    for (const key of Object.keys(row.config)) {
      if (packageDeclaresKey(resolved.root, key)) continue;
      if ((shippedKeys.get(row.spec) ?? new Set()).has(key)) continue;
      const rename = suggestKeyRename(key, [...(shippedKeys.get(row.spec) ?? [])]);
      findings.push({
        severity: row.disabled ? 'info' : 'warn',
        code: 'config-key-unknown',
        rowId: row.id,
        spec: row.spec,
        message: `行 ${row.id} 的配置键 ${key} 在 ${resolved.pkg.name}@${resolved.pkg.version} 的源码里不存在（宿主会静默忽略它，行为会悄悄失效）`,
        hint: rename === undefined
          ? '对照 dsh 内置 preset 里同 id 行的 config 键；或删掉该键，用新版本的默认行为'
          : `疑似改名：${key} → ${rename}（依据内置 preset 的现行写法）`,
      });
    }
  }
  return findings;
}

/** 与内置 standard preset 的行集合对比：改名、新增、缺失。 */
export function compareStandard(rows, standardRows, standardFile) {
  const findings = [];
  const theirs = new Map();
  for (const row of standardRows) if (row.id !== undefined) theirs.set(row.id, row);
  const ours = new Map();
  for (const row of rows) if (row.id !== undefined) ours.set(row.id, row);
  for (const [id, row] of ours) {
    const other = theirs.get(id);
    if (other === undefined) {
      findings.push({
        severity: 'info',
        code: 'row-not-in-standard',
        rowId: id,
        spec: row.spec,
        message: `行 ${id}（${row.spec ?? '组'}）不在内置 standard 中，是本预设自有行`,
      });
      continue;
    }
    if (other.spec !== row.spec) {
      findings.push({
        severity: 'warn',
        code: 'row-spec-changed',
        rowId: id,
        spec: row.spec,
        message: `行 ${id} 在 dsh 内置 standard 中已改用 ${other.spec}，本预设仍是 ${row.spec}`,
        hint: `升级后请确认旧 spec 仍可解析（见 specifier 检查），并考虑改成 ${other.spec}`,
      });
    }
  }
  for (const [id, row] of theirs) {
    if (ours.has(id)) continue;
    findings.push({
      severity: 'info',
      code: 'row-not-in-preset',
      rowId: id,
      spec: row.spec,
      message: `dsh 内置 standard 有行 ${id}（${row.spec}），本预设未收录`,
      hint: '升级 dsh 后复查：新增能力如果本工坊需要，补进 .dsh/preset.template.yml 再重建',
    });
  }
  return findings;
}

/** 读模板里真正会挂载的行。 */
export function readTemplateRows(file = TEMPLATE_FILE) {
  const yaml = loadYamlModule();
  if (yaml === undefined) return { error: 'yaml-unavailable' };
  let raw;
  try {
    raw = readUtf8(file);
  } catch {
    return { error: 'template-missing', file };
  }
  // 模板源文件里 __PERSONA__ 顶格书写（构建时才缩进），直接喂给 YAML 会解析失败。
  const normalized = raw
    .split(PERSONA_PLACEHOLDER)
    .join(indentBlock(PERSONA_PLACEHOLDER, ' '.repeat(PERSONA_INDENT_WIDTH)));
  const doc = yaml.parseDocument(normalized, { customTags: [{ tag: '!!js', resolve: (value) => value }] });
  if (doc.errors.length > 0) {
    return { error: 'template-invalid', file, detail: doc.errors.map((error) => String(error.message).split('\n')[0]).join(' | ') };
  }
  const declaration = (doc.toJS() ?? [])[0]?.insert?.[0];
  if (!declaration?.config?.plugins) return { error: 'preset-row-missing', file };
  return {
    file,
    presetId: declaration.config.id,
    rows: flattenPresetRows(declaration.config.plugins),
  };
}

/**
 * 完整兼容性检查（不修改任何文件）。
 * @param {{profile?: string, profileDir?: string, dshRoot?: string, anchors?: string[]}} [options]
 * @returns 结构化报告：{dsh, rows, standard, findings, counts, ok}
 */
export function runCompatibility(options = {}) {
  const profile = options.profile ?? process.env.DSH_PROFILE ?? 'web';
  const profileDir = options.profileDir ?? resolveProfileDir(profile);
  const dsh = options.dshRoot !== undefined ? { root: options.dshRoot, version: 'unknown' } : findDshInstall(options.anchors);
  const template = readTemplateRows(options.templateFile);

  const report = {
    profile,
    profileDir,
    dsh: dsh ?? null,
    template: template.file ?? null,
    presetId: template.presetId ?? null,
    rows: 0,
    enabledRows: 0,
    standard: null,
    findings: [],
    counts: { error: 0, warn: 0, info: 0 },
    ok: true,
  };

  if (template.error !== undefined) {
    report.findings.push({
      severity: template.error === 'yaml-unavailable' ? 'info' : 'error',
      code: 'template-unreadable',
      message:
        template.error === 'yaml-unavailable'
          ? '找不到 yaml 解析器，跳过兼容性检查（设置 DSH_HOME 或安装 dsh 后重试）'
          : `模板无法解析（${template.error}${template.detail === undefined ? '' : `：${template.detail}`}）`,
    });
  } else {
    const rows = template.rows;
    report.rows = rows.length;
    report.enabledRows = rows.filter((row) => !row.disabled).length;
    if (dsh === undefined) {
      report.findings.push({
        severity: 'info',
        code: 'dsh-not-found',
        message: '未找到已安装的 dsh，跳过 specifier / 配置键 / 内置 preset 对比',
      });
    } else {
      const searchDirs = [profileDir, dsh.root].filter((dir) => typeof dir === 'string' && dir !== '');
      const shipped = findShippedPresetBundle({ profileDir, dshRoot: dsh.root });
      let shippedKeys = new Map();
      if (shipped !== undefined) {
        const declarations = shipped.files.flatMap((file) => readPatchDeclarations(file));
        shippedKeys = collectShippedUsage(declarations).keysBySpec;
        const standard = declarations.find((declaration) => declaration.id === 'standard');
        const standardRows = standard === undefined ? [] : flattenPresetRows(standard.plugins);
        report.standard = {
          bundle: shipped.bundle,
          file: standard === undefined ? null : path.relative(REPO_ROOT, standard.file) || standard.file,
          rowCount: standardRows.length,
        };
        report.findings.push(...compareStandard(rows, standardRows));
      } else {
        report.findings.push({
          severity: 'info',
          code: 'shipped-presets-unavailable',
          message: '找不到 dsh 内置的 presets/*.patch.yml，跳过与 standard 的对比（specifier 与配置键检查仍然执行）',
        });
      }
      report.findings.push(...checkRows(rows, { searchDirs, shippedKeys }));
    }
  }

  report.findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || String(a.rowId ?? '').localeCompare(String(b.rowId ?? '')));
  for (const finding of report.findings) report.counts[finding.severity] += 1;
  report.ok = report.counts.error === 0;
  return report;
}

function severityRank(severity) {
  return severity === 'error' ? 0 : severity === 'warn' ? 1 : 2;
}

const SEVERITY_LABEL = { error: '✖ 错误', warn: '! 警告', info: '· 提示' };

/** 人类可读摘要（doctor.mjs 复用）。 */
export function formatCompatibility(report) {
  const lines = [];
  lines.push(`dsh：${report.dsh === null ? '未找到已安装的 dsh（跳过解析检查）' : `${report.dsh.version}（${report.dsh.root}）`}`);
  lines.push(
    `模板：${report.rows} 行（启用 ${report.enabledRows}）；` +
      `内置 standard：${report.standard === null ? '不可用' : `${report.standard.rowCount} 行`}`,
  );
  if (report.findings.length === 0) {
    lines.push('✔ 兼容性检查通过');
    return lines.join('\n');
  }
  lines.push(`兼容性：${report.counts.error} 错误 / ${report.counts.warn} 警告 / ${report.counts.info} 提示`);
  for (const finding of report.findings) {
    const where = finding.rowId === undefined ? '' : ` [${finding.rowId}]`;
    lines.push(`  ${SEVERITY_LABEL[finding.severity]}${where} ${finding.message}`);
    if (finding.hint !== undefined) lines.push(`      → ${finding.hint}`);
  }
  return lines.join('\n');
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function main() {
  const report = runCompatibility({ profile: option('--profile', process.env.DSH_PROFILE ?? 'web') });
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${formatCompatibility(report)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
