import fs from 'node:fs';
import path from 'node:path';
import { safeRelative, DELIVERY_DIR, DELIVERY_MANIFEST } from '../project-layout.mjs';
export const ACTIVE_ROUTE_SCHEMA = 'rp-card-studio/active-route/v1';
export function validateActiveRouteManifest(manifest, deliveryRoot, { requireFiles = true } = {}) {
  const issues = [];
  if (!manifest || manifest.schema !== ACTIVE_ROUTE_SCHEMA) issues.push('manifest schema 必须是 ' + ACTIVE_ROUTE_SCHEMA);
  if (!manifest?.activeRoute || typeof manifest.activeRoute !== 'string') issues.push('manifest 缺少 activeRoute');
  if (!manifest?.routes || typeof manifest.routes !== 'object' || Array.isArray(manifest.routes)) issues.push('manifest 缺少 routes 对象');
  if (!manifest?.components || typeof manifest.components !== 'object' || Array.isArray(manifest.components)) issues.push('manifest 缺少 components 对象');
  if (issues.length) return { ok: false, issues };
  const routes = Object.entries(manifest.routes);
  if (routes.length !== 1 || routes[0][1]?.status !== 'active') issues.push('必须恰好有一个当前路线；不保留 superseded、历史、备用或实验路线');
  if (manifest.routes[manifest.activeRoute]?.status !== 'active') issues.push('activeRoute 不存在或不是 active');
  const components = manifest.routes[manifest.activeRoute]?.components;
  if (!components || typeof components !== 'object' || Array.isArray(components)) issues.push('active route 缺少 components 对象');
  else {
    const paths = [];
    for (const [name, item] of Object.entries(components)) {
      const file = typeof item === 'string' ? item : item?.path;
      if (!safeRelative(file)) { issues.push('active component 路径无效：' + name); continue; }
      if (/[\\/]/.test(file) && item?.kind !== 'runtime_asset') issues.push('实际导入组件默认平铺，源码或分类目录不能混入导入包：' + file);
      paths.push(file);
      if (requireFiles && !fs.existsSync(path.join(deliveryRoot, file))) issues.push('active component 文件不存在：' + file);
      const top = manifest.components[name];
      if ((typeof top === 'string' ? top : top?.path) !== file) issues.push('顶层 components 与 active route 不一致：' + name);
    }
    if (new Set(paths).size !== paths.length) issues.push('active route 的多个组件指向同一个文件');
    if (Object.keys(manifest.components).some(name => !Object.hasOwn(components, name))) issues.push('顶层 components 含当前路线以外的组件');
  }
  return { ok: issues.length === 0, issues };
}
export function validateActiveRouteFile(file, options = {}) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const deliveryRoot = options.deliveryRoot || path.resolve(path.dirname(file), '../..', DELIVERY_DIR);
  if (!options.deliveryRoot && !file.replaceAll('\\', '/').endsWith('/' + DELIVERY_MANIFEST)) return { ok: false, issues: ['交付清单必须位于 ' + DELIVERY_MANIFEST + '，或明确提供导入包目录'] };
  return validateActiveRouteManifest(manifest, deliveryRoot, options);
}
