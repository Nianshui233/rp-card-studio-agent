import fs from 'node:fs';
import { textHash } from '../production/artifact-bindings.mjs';
import { CHECK_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';

export function validatePreviewResources(resources = []) {
  const issues = [], urls = new Set();
  if (!Array.isArray(resources)) return { ok: false, issues: ['resources 必须是已取得资源的数组'] };
  for (const resource of resources) {
    try {
      const url = new URL(resource?.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw Error();
      if (urls.has(url.href)) issues.push('预览资源 URL 重复：' + url.origin);
      urls.add(url.href);
    } catch { issues.push('预览资源必须使用无凭据的完整 HTTP(S) URL'); }
    try { requireArea(resource?.path, CHECK_DIR, '预览资源'); } catch (error) { issues.push(error.message); }
    if (!/^[a-f0-9]{64}$/.test(resource?.sha256 ?? '')) issues.push('预览资源必须锁定实际字节摘要');
    if (typeof resource?.contentType !== 'string' || !/^[\w.+-]+\/[\w.+-]+(?:; charset=[\w-]+)?$/.test(resource.contentType)) issues.push('预览资源必须明确 contentType');
  }
  return { ok: issues.length === 0, issues };
}

export function loadPreviewResources(root, resources = []) {
  const checked = validatePreviewResources(resources);
  if (!checked.ok) throw Error(checked.issues.join('\n'));
  const mapping = new Map();
  for (const resource of resources) {
    const body = fs.readFileSync(resolveProjectPath(root, resource.path));
    if (textHash(body) !== resource.sha256) throw Error('预览资源已变化：' + resource.path);
    mapping.set(new URL(resource.url).href, { ...resource, body });
  }
  return mapping;
}

export function blockedResourceLabel(url, type) {
  try { return new URL(url).origin + ' [' + type + ']'; }
  catch { return '[unmapped ' + type + ']'; }
}
