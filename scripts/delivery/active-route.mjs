import fs from 'node:fs';
import path from 'node:path';

export const ACTIVE_ROUTE_SCHEMA = 'rp-card-studio/active-route/v1';

function relativeSafe(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

export function validateActiveRouteManifest(manifest, deliveryRoot, { requireFiles = true } = {}) {
  const issues = [];
  if (!manifest || manifest.schema !== ACTIVE_ROUTE_SCHEMA) issues.push(`manifest schema 必须是 ${ACTIVE_ROUTE_SCHEMA}`);
  if (!manifest?.activeRoute || typeof manifest.activeRoute !== 'string') issues.push('manifest 缺少 activeRoute');
  if (!manifest?.routes || typeof manifest.routes !== 'object' || Array.isArray(manifest.routes)) issues.push('manifest 缺少 routes 对象');
  if (!manifest?.components || typeof manifest.components !== 'object' || Array.isArray(manifest.components)) issues.push('manifest 缺少 components 对象');
  if (issues.length) return { ok: false, issues };

  const routes = Object.entries(manifest.routes);
  const active = routes.filter(([, route]) => route?.status === 'active');
  if (active.length !== 1) issues.push(`active route 必须恰好有一个，实际 ${active.length} 个`);
  if (!manifest.routes[manifest.activeRoute]) issues.push(`activeRoute 不存在：${manifest.activeRoute}`);
  else if (manifest.routes[manifest.activeRoute].status !== 'active') issues.push('activeRoute 指向的路线不是 active');

  const activeComponents = manifest.routes[manifest.activeRoute]?.components;
  if (!activeComponents || typeof activeComponents !== 'object' || Array.isArray(activeComponents)) issues.push('active route 缺少 components 对象');
  else {
    const paths = [];
    for (const [name, component] of Object.entries(activeComponents)) {
      const file = typeof component === 'string' ? component : component?.path;
      if (!relativeSafe(file)) { issues.push(`active component 路径无效：${name}`); continue; }
      paths.push(file);
      if (requireFiles && !fs.existsSync(path.join(deliveryRoot, file))) issues.push(`active component 文件不存在：${file}`);
    }
    if (new Set(paths).size !== paths.length) issues.push('active route 的多个组件指向同一个文件');
    for (const [name, file] of Object.entries(manifest.components)) {
      const activePath = typeof activeComponents[name] === 'string' ? activeComponents[name] : activeComponents[name]?.path;
      const declaredPath = typeof file === 'string' ? file : file?.path;
      if (declaredPath !== activePath) issues.push(`顶层 components 与 active route 不一致：${name}`);
    }
  }

  const superseded = routes.filter(([, route]) => route?.status === 'superseded');
  for (const [id, route] of superseded) {
    for (const [name, component] of Object.entries(route?.components ?? {})) {
      const file = typeof component === 'string' ? component : component?.path;
      if (!relativeSafe(file)) issues.push(`superseded route ${id} 的组件路径无效：${name}`);
      else if (!file.startsWith('.internal/history/')) issues.push(`superseded route 仍在交付目录中：${file}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateActiveRouteFile(file, options = {}) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return validateActiveRouteManifest(manifest, options.deliveryRoot ?? path.dirname(file), options);
}
