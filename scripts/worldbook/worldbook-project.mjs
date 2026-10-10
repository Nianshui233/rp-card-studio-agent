import fs from 'node:fs';
import { atPointer } from '../production/artifact-bindings.mjs';
import { DELIVERY_DIR, DELIVERY_MANIFEST, STATE_DIR, CHECK_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { validateActiveRouteManifest } from '../delivery/active-route.mjs';
import { WORLD_ROUTING_SCHEMA, validateBookRouting, runRoutingFixtures, validatePromptCapture, routingHash, entryPairs } from './routing.mjs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function discoverWorldbooks(root) {
  const manifest = json(resolveProjectPath(root, DELIVERY_MANIFEST));
  const checked = validateActiveRouteManifest(manifest, resolveProjectPath(root, DELIVERY_DIR));
  if (!checked.ok) throw new Error(checked.issues.join('\n'));
  const found = [], seen = new Set();
  for (const component of Object.values(manifest.routes[manifest.activeRoute].components)) {
    const relative = typeof component === 'string' ? component : component.path;
    if (!relative.endsWith('.json') || component?.kind === 'runtime_asset') continue;
    const artifactPath = resolveProjectPath(root, DELIVERY_DIR + '/' + relative);
    const bytes = fs.readFileSync(artifactPath), document = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    for (const pointer of ['/entries','/data/character_book/entries','/character_book/entries']) {
      let entries; try { entries = atPointer(document, pointer); } catch { continue; }
      const key = relative + '#' + pointer; if (seen.has(key)) continue; seen.add(key);
      if (!entries || typeof entries !== 'object') throw new Error('世界书 entries 不是对象/数组：' + key);
      if (pointer !== '/entries') {
        if (!Array.isArray(entries)) throw new Error('CharacterBook entries 必须是数组');
        const ids = entries.map((e,i) => String(e.id ?? i)); if (new Set(ids).size !== ids.length) throw new Error('CharacterBook id 重复');
        entries = Object.fromEntries(entries.map((e, i) => { const id = e.id ?? i; return [id, { ...e, uid: id, key: e.keys, position: e.extensions?.position ?? (e.position === 'before_char' ? 0 : 1), depth: e.extensions?.depth ?? 4, role: e.extensions?.role ?? 0, disable: !e.enabled, outletName: e.extensions?.outlet_name ?? '', vectorized: e.extensions?.vectorized ?? false, cooldown: e.extensions?.cooldown ?? null, delay: e.extensions?.delay ?? null }]; }));
      }
      found.push({ artifact: relative, entriesPointer: pointer, book: { entries }, artifactSha256: routingHash(bytes) });
    }
  }
  return found;
}

export function validateWorldbookProject(root, contractPath, { ledger, requireRuntime = false } = {}) {
  const issues = [], warnings = [], reports = [];
  let fixtureReport = null;
  try {
    const found = discoverWorldbooks(root);
    if (!found.length) return { ok: true, issues, warnings, enabled: false, reports, runtime: 'not_run' };
    requireArea(contractPath, STATE_DIR, '世界书调度合同');
    const contract = json(resolveProjectPath(root, contractPath));
    if (contract.schema !== WORLD_ROUTING_SCHEMA || !contract.versionPin || !Array.isArray(contract.books) || !contract.books.length) throw new Error('缺少世界书调度 schema、目标版本或完整 books');
    const books = new Map(), ids = new Set(), targets = new Set();
    for (const plan of contract.books) {
      if (!plan?.id || ids.has(plan.id)) { issues.push('世界书合同 id 缺失或重复'); continue; } ids.add(plan.id);
      const pointer = plan.entriesPointer ?? '/entries', key = plan.artifact + '#' + pointer;
      if (targets.has(key)) issues.push('重复声明同一实际世界书：' + key); targets.add(key);
      const actual = found.find(f => f.artifact === plan.artifact && f.entriesPointer === pointer);
      if (!actual) { issues.push('合同目标不在当前实际导入包：' + key); continue; }
      const result = validateBookRouting(actual.book, plan, { root, ledger });
      books.set(plan.id, actual.book); reports.push({ kind: 'book', id: plan.id, artifact: plan.artifact, artifactSha256: actual.artifactSha256, ...result });
      issues.push(...result.issues.map(i => plan.id + ': ' + i)); warnings.push(...result.warnings.map(i => plan.id + ': ' + i));
      if (!['not_run','passed','failed'].includes(plan.runtime?.status)) issues.push('世界书必须明确实机边界 runtime:not_run/passed/failed：' + plan.id);
      if (plan.runtime?.status === 'passed') {
        try {
          requireArea(plan.runtime.evidenceFile, STATE_DIR, '世界书实机捕获');
          const capture = json(resolveProjectPath(root, plan.runtime.evidenceFile));
          const runtime = validatePromptCapture(capture, actual.book, plan, { root, artifactSha256: actual.artifactSha256, versionPin: contract.versionPin });
          reports.push({ kind: 'runtime', bookId: plan.id, id: plan.id + '-runtime', ...runtime }); issues.push(...runtime.issues);
          const captured = new Set((capture.cases ?? []).flatMap(c => c.activatedEntryIds ?? []).map(String));
          const nativePolicies = new Set(result.rows.filter(r => r.native).map(r => r.policy));
          for (const policy of nativePolicies) if (!result.rows.some(r => r.native && r.policy === policy && captured.has(r.entryId))) issues.push('实机通过记录未覆盖原生插入策略：' + plan.id + '.' + policy);
        } catch (e) { issues.push(e.message); }
      } else if (plan.runtime?.status === 'failed') issues.push('已有宿主插入失败，不能用静态分区通过覆盖：' + plan.id);
      else if (requireRuntime && result.rows.some(r => r.native)) issues.push('最终实机声明缺少世界书请求捕获：' + plan.id);
    }
    for (const actual of found) if (!targets.has(actual.artifact + '#' + actual.entriesPointer)) issues.push('实际世界书未被调度合同覆盖：' + actual.artifact + '#' + actual.entriesPointer);
    if (books.size === contract.books.length) {
      requireArea(contract.fixtures, CHECK_DIR, '世界书分区用例');
      fixtureReport = runRoutingFixtures(json(resolveProjectPath(root, contract.fixtures)), books, contract);
      if (!fixtureReport.ok) issues.push(...(fixtureReport.issues ?? []), ...fixtureReport.results.filter(r => !r.ok).map(r => r.id + ': ' + r.error));
    }
  } catch (error) { issues.push(error.message); }
  return { ok: issues.length === 0, issues, warnings, enabled: true, reports, fixtureReport, level: 'static-worldbook-routing',
    runtime: reports.filter(r => r.kind === 'book').length && reports.filter(r => r.kind === 'book').every(r => reports.some(x => x.kind === 'runtime' && x.bookId === r.id && x.ok)) ? 'passed' : 'not_run' };
}
