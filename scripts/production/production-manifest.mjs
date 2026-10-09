import fs from 'node:fs';
import path from 'node:path';
import { SOURCE_DIR, STATE_DIR, DELIVERY_DIR, DELIVERY_MANIFEST, WORK_DIR, ensureProjectFolders, validateProjectLayout, requireArea, resolveProjectPath } from '../project-layout.mjs';
export const PRODUCTION_SCHEMA = 'rp-card-studio/production/v1';
export const REQUIRED_MVU_COMPONENTS = ['schema','initvar','variable_list','update_rules','path_index','output_format','runtime_contract','loader','consumer','fixtures'];
const STATUS = new Set(['draft','candidate','implementation','awaiting_review','runtime_verified','accepted']);
function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function nonempty(v) { return typeof v === 'string' && v.trim().length > 0; }
export function createProductionManifest({ projectId, title }) {
  return { schema: PRODUCTION_SCHEMA, projectId, title, status: 'draft',
    source: { canonicalRoot: SOURCE_DIR, userEvidenceRequired: true, referenceOnlySamples: true },
    delivery: { directory: DELIVERY_DIR, manifest: DELIVERY_MANIFEST, activeRoute: null, runtimeHost: 'sillytavern' },
    interviews: {}, mvu: { mode: 'unresolved', components: {} }, diagnostics: { events: [], highestVerifiedLevel: 'hypothesis' } };
}
export function validateProductionManifest(manifest, { root } = {}) {
  const issues = [];
  if (!object(manifest) || manifest.schema !== PRODUCTION_SCHEMA) issues.push('production manifest schema 必须是 ' + PRODUCTION_SCHEMA);
  if (!nonempty(manifest?.projectId) || !nonempty(manifest?.title)) issues.push('production manifest 必须有 projectId 和 title');
  if (!STATUS.has(manifest?.status)) issues.push('production manifest status 无效：' + manifest?.status);
  if (['implementation','awaiting_review','runtime_verified','accepted'].includes(manifest?.status) && !nonempty(manifest?.activeStage)) issues.push('进入实现/交接/验收状态必须声明 activeStage');
  if (!object(manifest?.source) || manifest.source.canonicalRoot !== SOURCE_DIR || manifest.source.userEvidenceRequired !== true || manifest.source.referenceOnlySamples !== true) issues.push('canonical 创作源必须位于 ' + SOURCE_DIR + '，并声明用户依据和 reference-only 边界');
  if (!object(manifest?.delivery) || manifest.delivery.directory !== DELIVERY_DIR || manifest.delivery.manifest !== DELIVERY_MANIFEST || manifest.delivery.runtimeHost !== 'sillytavern') issues.push('交付必须使用导入包，机器清单保存在制作文件/项目记录中');
  if (!object(manifest?.interviews)) issues.push('production manifest 缺少 interviews');
  if (!object(manifest?.mvu) || !object(manifest.mvu.components)) issues.push('production manifest 缺少 mvu.components');
  if (!object(manifest?.diagnostics) || !Array.isArray(manifest.diagnostics.events)) issues.push('production manifest 缺少 diagnostics.events');
  for (const group of [manifest?.mvu?.components, manifest?.ejs?.components]) for (const [name, item] of Object.entries(group || {})) {
    if (item?.path) try { requireArea(item.path, WORK_DIR, '制作组件 ' + name); } catch (error) { issues.push(error.message); }
  }
  if (root) {
    issues.push(...validateProjectLayout(root).issues);
    if (manifest.source?.canonicalRoot && !fs.existsSync(path.join(root, manifest.source.canonicalRoot))) issues.push('canonical 创作源目录不存在：' + manifest.source.canonicalRoot);
  }
  return { ok: issues.length === 0, issues };
}
export function initProductionProject(rootValue, { projectId, title } = {}) {
  if (!nonempty(projectId) || !nonempty(title)) throw new Error('production init 需要 projectId 和 title');
  const root = ensureProjectFolders(rootValue);
  const state = resolveProjectPath(root, STATE_DIR, { output: true }), target = resolveProjectPath(root, STATE_DIR + '/production.json', { output: true });
  if (fs.existsSync(target)) throw new Error('拒绝覆盖已有制作文件/项目记录/production.json');
  fs.mkdirSync(path.join(root, SOURCE_DIR), { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  const manifest = createProductionManifest({ projectId, title });
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { path: target, manifest };
}
