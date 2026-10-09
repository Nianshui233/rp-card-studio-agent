import fs from 'node:fs';
import path from 'node:path';
import { DELIVERY_DIR, DELIVERY_MANIFEST, IMPORT_GUIDE, validateProjectLayout, resolveProjectPath } from '../project-layout.mjs';
import { validateActiveRouteManifest } from './active-route.mjs';

function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function importKind(file, bytes) {
  if (path.extname(file).toLowerCase() === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'character_card';
  if (path.extname(file).toLowerCase() !== '.json') return null;
  let v; try { v = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { return null; }
  if (object(v) && typeof v.schema === 'string' && v.schema.startsWith('rp-card-studio/')) return null;
  if (object(v) && (/^chara_card_v[23]$/.test(v.spec || '') || (!v.spec && ['name','description','first_mes','mes_example'].every(k => Object.hasOwn(v, k))))) return 'character_card';
  if (object(v) && (Array.isArray(v.entries) || object(v.entries))) return 'worldbook';
  if (Array.isArray(v) && v.length && v.every(item => object(item) && typeof (item.findRegex ?? item.find_regex) === 'string')) return 'regex';
  if (object(v) && (v.type === 'script' || (v.type === 'folder' && Array.isArray(v.scripts)))) return 'helper_script';
  return null;
}
export function validateDeliveryLayout(root, { requireManifest = false, manifest: given } = {}) {
  const issues = [...validateProjectLayout(root).issues];
  if (issues.length) return { ok: false, issues };
  let manifest = given;
  const manifestFile = path.join(root, DELIVERY_MANIFEST);
  if (!manifest && fs.existsSync(manifestFile)) try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (error) { issues.push('交付清单不是合法 JSON：' + error.message); }
  if (!manifest && requireManifest) issues.push('缺少制作文件/项目记录/交付清单.json');
  const declared = new Map();
  if (manifest) {
    issues.push(...validateActiveRouteManifest(manifest, path.join(root, DELIVERY_DIR)).issues);
    for (const item of Object.values(manifest.routes?.[manifest.activeRoute]?.components || {})) { const file = typeof item === 'string' ? item : item?.path; if (file) declared.set(file.replaceAll('\\', '/'), item); }
  }
  const files = [], directories = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) { issues.push('导入包不能借链接依赖制作目录或外部文件：' + relative); continue; }
      if (entry.isDirectory()) { directories.push(relative); walk(path.join(dir, entry.name), relative + '/'); }
      else if (entry.isFile()) files.push(relative);
      else issues.push('导入包包含非普通文件：' + relative);
    }
  }
  walk(path.join(root, DELIVERY_DIR));
  for (const file of files) {
    if (file === IMPORT_GUIDE) continue;
    let bytes; try { bytes = fs.readFileSync(resolveProjectPath(root, DELIVERY_DIR + '/' + file)); } catch (error) { issues.push(error.message); continue; }
    const item = declared.get(file);
    if (item?.kind === 'runtime_asset') {
      if (path.extname(file).toLowerCase() === '.json') {
        let resource; try { resource = JSON.parse(bytes.toString('utf8')); } catch { resource = null; }
        if (typeof resource?.schema === 'string' && resource.schema.startsWith('rp-card-studio/')) { issues.push('机器清单/制作记录不能改标签冒充运行资源：' + file); continue; }
      }
      const owner = item.referencedBy;
      if (!owner || !declared.has(owner) || owner === file || !files.includes(owner)) { issues.push('运行资源必须由实际导入组件引用：' + file); continue; }
      const ownerBytes = fs.readFileSync(resolveProjectPath(root, DELIVERY_DIR + '/' + owner));
      if (!ownerBytes.toString('utf8').includes(file) && !ownerBytes.toString('utf8').includes(encodeURI(file))) issues.push('运行资源未在所属组件中找到实际引用：' + file);
      continue;
    }
    if (file.includes('/') || !importKind(file, bytes)) issues.push('导入包只放实际导入文件，源码、配置、记录和检查材料应移到制作文件：' + file);
    if (manifest && !declared.has(file)) issues.push('导入包存在当前清单以外的文件，不保留另一版本或路线：' + file);
  }
  for (const dir of directories) if (!files.some(file => file.startsWith(dir + '/') && declared.get(file)?.kind === 'runtime_asset')) issues.push('导入包不创建分类、源码或空目录：' + dir);
  if (requireManifest && !files.includes(IMPORT_GUIDE)) issues.push('最终导入包缺少唯一的导入说明.txt');
  return { ok: issues.length === 0, issues, files, manifestPath: DELIVERY_MANIFEST };
}
