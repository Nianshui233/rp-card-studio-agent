import fs from 'node:fs';
import path from 'node:path';

export const DELIVERY_DIR = '导入包';
export const WORK_DIR = '制作文件';
export const STATE_DIR = WORK_DIR + '/项目记录';
export const SOURCE_DIR = WORK_DIR + '/创作源';
export const CONFIG_DIR = WORK_DIR + '/配置';
export const CODE_DIR = WORK_DIR + '/运行源码';
export const CHECK_DIR = WORK_DIR + '/检查';
export const BUILD_DIR = WORK_DIR + '/构建';
export const DELIVERY_MANIFEST = STATE_DIR + '/交付清单.json';
export const IMPORT_GUIDE = '导入说明.txt';

export function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.win32.isAbsolute(value) && !path.posix.isAbsolute(value)
    && !value.split(/[\\/]/).some(part => part === '..' || part === '.' || part === '');
}
export function inArea(value, area) { return safeRelative(value) && value.replaceAll('\\', '/').startsWith(area + '/'); }
export function requireArea(value, area, label = value) {
  if (!inArea(value, area)) throw new Error(label + ' 必须位于 ' + area + '/ 内，不能跨区或越出项目');
  return value;
}
export function resolveProjectPath(root, relative, { output = false } = {}) {
  if (!root || !safeRelative(relative)) throw new Error('必须提供项目内相对路径，不能越出项目：' + relative);
  const base = fs.realpathSync(root);
  const target = path.resolve(base, relative);
  const contained = value => { const r = path.relative(base, value); return r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
  if (!contained(target) || target === base) throw new Error('路径越出项目或指向项目根：' + relative);
  let existing = target;
  while (!fs.existsSync(existing)) { if (!output) throw new Error('文件不存在：' + relative); existing = path.dirname(existing); }
  if (!contained(fs.realpathSync(existing))) throw new Error('路径经链接越出项目：' + relative);
  return target;
}
export function validateProjectLayout(root, { requireBoth = true } = {}) {
  const issues = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return { ok: false, issues: ['作品项目目录不存在'] };
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const item of entries) {
    if (![DELIVERY_DIR, WORK_DIR].includes(item.name)) issues.push('作品最外层只能有导入包和制作文件，发现：' + item.name);
    else if (!item.isDirectory() || item.isSymbolicLink()) issues.push('顶层必须是实际文件夹，不能是文件或链接：' + item.name);
  }
  if (requireBoth) for (const name of [DELIVERY_DIR, WORK_DIR]) if (!entries.some(e => e.name === name && e.isDirectory() && !e.isSymbolicLink())) issues.push('缺少 ' + name + '/');
  if (fs.existsSync(path.join(root, '.rp-card'))) issues.push('发现旧位置的制作记录；先迁移到制作文件/项目记录，禁止另建一套账本');
  return { ok: issues.length === 0, issues };
}
export function ensureProjectFolders(rootValue) {
  const root = path.resolve(rootValue);
  if (fs.existsSync(root)) {
    const result = validateProjectLayout(root, { requireBoth: false });
    if (!result.ok) throw new Error(result.issues.join('\n'));
  }
  fs.mkdirSync(root, { recursive: true });
  for (const name of [DELIVERY_DIR, WORK_DIR]) fs.mkdirSync(path.join(root, name), { recursive: true });
  return root;
}
