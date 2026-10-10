import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { collectLocalEnvironment, processHints } from './local-environment.mjs';
import { STATE_DIR, ensureProjectFolders, resolveProjectPath } from '../project-layout.mjs';

export const HOST_ENVIRONMENT_SCHEMA = 'rp-card-studio/host-environment/v1';
export const HOST_ENVIRONMENT_PATH = STATE_DIR + '/host-environment.json';
const skipped = new Set(['node_modules','.git','.codex','.agents','.cache','AppData','Library','Windows','$RECYCLE.BIN','System Volume Information','data','chats','characters','worlds']);
function boundedText(file, limit = 128 * 1024) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error('不是限定大小的配置文件');
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}
function directoryKey(value) { return process.platform === 'win32' ? value.toLowerCase() : value; }
export function inspectInstallation(directory, options = {}) {
  try {
    const real = fs.realpathSync(directory);
    const pkg = JSON.parse(boundedText(path.join(real, 'package.json')));
    if (String(pkg.name).toLowerCase() !== 'sillytavern' || !fs.existsSync(path.join(real, 'server.js')) || !fs.existsSync(path.join(real, 'public','index.html'))) return null;
    const configuration = { source: null, status: 'not_read', port: null, dataRoot: null, tls: null, accountsEnabled: null, effectiveRuntime: 'not_verified' };
    const configPath = options.configPath ? path.resolve(real, options.configPath) : path.join(real, 'config.yaml');
    try {
      const config = parseYaml(boundedText(configPath));
      configuration.source = configPath; configuration.status = 'read';
      const port = Number(options.port ?? config?.port);
      configuration.port = Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
      configuration.dataRoot = typeof (options.dataRoot ?? config?.dataRoot) === 'string' ? path.resolve(real, options.dataRoot ?? config.dataRoot) : null;
      configuration.tls = config?.ssl?.enabled === true;
      configuration.accountsEnabled = config?.enableUserAccounts === true;
    } catch { configuration.status = 'unavailable'; }
    const portOverride = Number(options.port);
    if (Number.isInteger(portOverride) && portOverride > 0 && portOverride <= 65535) configuration.port = portOverride;
    if (typeof options.dataRoot === 'string') configuration.dataRoot = path.resolve(real,options.dataRoot);
    // Configuration and installed files do not prove which account/extensions the UI is using.
    return { directory: real, version: typeof pkg.version === 'string' ? pkg.version : null, configuration };
  } catch { return null; }
}

export function scanInstallations(roots, { maxDepth = 4, maxDirectories = 3000, maxMs = 8000 } = {}) {
  for (const n of [maxDepth,maxDirectories,maxMs]) if (!Number.isInteger(n) || n < 0) throw new Error('扫描限制必须是非负整数');
  const queue = [...new Set(roots.filter(Boolean).map(r => path.resolve(r)))].map(directory => ({ directory, depth: 0 }));
  const seen = new Set(), installations = [], started = Date.now(), inaccessible = [];
  let visited = 0;
  for (let at = 0; at < queue.length; at++) {
    if (visited >= maxDirectories || Date.now() - started >= maxMs) break;
    const item = queue[at];
    let stat; try { stat = fs.lstatSync(item.directory); if (!stat.isDirectory() || stat.isSymbolicLink()) continue; } catch { inaccessible.push(item.directory); continue; }
    const key = directoryKey(item.directory); if (seen.has(key)) continue; seen.add(key); visited++;
    const installation = inspectInstallation(item.directory);
    if (installation) { installations.push(installation); continue; }
    if (item.depth >= maxDepth) continue;
    try {
      const entries = fs.readdirSync(item.directory, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink() && !skipped.has(e.name));
      entries.sort((a,b) => Number(/sillytavern/i.test(b.name)) - Number(/sillytavern/i.test(a.name)) || a.name.localeCompare(b.name));
      for (const entry of entries) queue.push({ directory: path.join(item.directory, entry.name), depth: item.depth + 1 });
    } catch { inaccessible.push(item.directory); }
  }
  return { installations, coverage: { roots: queue.filter(q => q.depth === 0).map(q => q.directory), maxDepth, maxDirectories, maxMs, visited, limitReached: visited >= maxDirectories || Date.now() - started >= maxMs, inaccessible, exhaustive: false } };
}

export function localOrigin(value) {
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol) || !(url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('发现探测只访问不带凭据的本机回环地址；不访问远程站点或任意接口');
  return url.origin;
}
export function probeLocalOrigin(value, { timeoutMs = 1500, maxBytes = 64 * 1024 } = {}) {
  const origin = localOrigin(value);
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (!settled) { settled = true; clearTimeout(timer); resolve({ origin, ...result }); } };
    const request = (origin.startsWith('https:') ? https : http).get(origin + '/', { agent: false, headers: { Accept: 'text/html' } }, response => {
      // No redirects, cookies, credentials, script execution, or extension mutation.
      if ([301,302,303,307,308,401,403].includes(response.statusCode)) { finish({ status: 'access_restricted', httpStatus: response.statusCode, identity: 'not_verified' }); response.destroy(); return; }
      let bytes = 0, chunks = [];
      response.on('data', chunk => {
        const remaining = maxBytes - bytes; if (remaining > 0) chunks.push(chunk.subarray(0,remaining)); bytes += chunk.length;
        if (bytes >= maxBytes) { evaluate(); response.destroy(); }
      });
      const evaluate = () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const identity = /<title>\s*SillyTavern\s*<\/title>/i.test(body) && /(?:manifest\.json|script\.js|css\/)/i.test(body);
        finish({ status: response.statusCode === 200 && identity ? 'sillytavern_accessible' : 'other_response', httpStatus: response.statusCode, identity: identity ? 'page_signature' : 'not_verified' });
      };
      response.on('end', evaluate); response.on('error', () => finish({ status: 'network_unavailable', identity: 'not_verified' }));
    });
    request.on('error', () => finish({ status: 'network_unavailable', identity: 'not_verified' }));
    const timer = setTimeout(() => { finish({ status: 'timeout', identity: 'not_verified' }); request.destroy(); }, timeoutMs);
  });
}

export async function discoverHost({ roots, directories = [], origins = [], preferredDirectory, preferredOrigin, collect = collectLocalEnvironment, probe = probeLocalOrigin, scanOptions, cwd = process.cwd() } = {}) {
  const environment = await collect(), hints = processHints(environment.processes || []);
  const effectiveRoots = roots ?? [cwd, path.dirname(cwd), os.homedir(), ...(environment.diskRoots || [])];
  const explicit = [...new Set([preferredDirectory, ...directories, ...hints.map(p => p.directory)].filter(Boolean))];
  const byDirectory = new Map();
  for (const directory of explicit) {
    const hint = hints.find(p => p.directory && directoryKey(p.directory) === directoryKey(directory));
    const installation = inspectInstallation(directory, hint?.options);
    if (installation) byDirectory.set(directoryKey(installation.directory), installation);
  }
  const scan = scanInstallations(effectiveRoots, scanOptions);
  for (const installation of scan.installations) if (!byDirectory.has(directoryKey(installation.directory))) byDirectory.set(directoryKey(installation.directory), installation);
  const installations = [...byDirectory.values()];
  const candidates = new Map();
  const add = (url, reason, pid = null) => {
    try { const origin = localOrigin(url); const old = candidates.get(origin); candidates.set(origin, { origin, reasons: [...new Set([...(old?.reasons || []), reason])], pids: [...new Set([...(old?.pids || []), ...(pid ? [pid] : [])])] }); } catch { /* Non-local candidates are excluded. */ }
  };
  for (const value of [preferredOrigin,...origins].filter(Boolean)) { localOrigin(value); add(value, 'explicit'); }
  for (const i of installations) if (i.configuration.port) add((i.configuration.tls ? 'https://' : 'http://') + '127.0.0.1:' + i.configuration.port, 'configuration_candidate');
  const processIds = new Set(hints.map(p => p.pid));
  for (const listener of environment.listeners || []) {
    if (!processIds.has(listener.pid)) continue;
    const host = ['::','::1'].includes(listener.address) ? '[::1]' : /^127(?:\.\d{1,3}){3}$/.test(listener.address || '') ? listener.address : '127.0.0.1';
    add('http://' + host + ':' + listener.port, 'listening_node_process', listener.pid);
    // The same known configuration can supply TLS without declaring it an effective runtime fact.
    if (installations.some(i => i.configuration.port === listener.port && i.configuration.tls)) add('https://' + host + ':' + listener.port, 'configured_tls', listener.pid);
  }

  const all = [...candidates.values()], instances = [];
  for (let offset = 0; offset < Math.min(all.length,32); offset += 4) {
    instances.push(...await Promise.all(all.slice(offset,Math.min(offset + 4,32)).map(async candidate => {
      let result; try { result = await probe(candidate.origin); } catch { result = { status: 'probe_unavailable', identity: 'not_verified' }; }
      const matches = hints.filter(p => candidate.pids.includes(p.pid) && p.directory).map(p => inspectInstallation(p.directory, p.options)).filter(Boolean);
      return { ...candidate, ...result, origin: candidate.origin, installationDirectory: matches.length === 1 ? matches[0].directory : null, association: matches.length === 1 ? 'process_script_path' : 'unresolved', account: 'not_verified', extensions: 'not_verified', testConditions: 'not_verified' };
    })));
  }
  const accessible = instances.filter(i => i.status === 'sillytavern_accessible');
  const unique = [...new Map(accessible.map(i => [(i.pids.length === 1 ? i.pids[0] + ':' + new URL(i.origin).port : i.origin), i])).values()];
  const exactOrigin = preferredOrigin ? localOrigin(preferredOrigin) : null;
  let preferredReal = null; if (preferredDirectory) { try { preferredReal = fs.realpathSync(preferredDirectory); } catch { /* Missing preference stays unresolved. */ } }
  const eligible = exactOrigin ? accessible.filter(i => i.origin === exactOrigin) : preferredDirectory ? unique.filter(i => i.installationDirectory && directoryKey(i.installationDirectory) === directoryKey(preferredReal || preferredDirectory)) : unique;
  const selected = eligible.length === 1 ? eligible[0].origin : null;
  return { schema: HOST_ENVIRONMENT_SCHEMA, capturedAt: new Date().toISOString(), visibility: environment.visibility || 'execution_environment', installations, instances,
    preference: { origin: exactOrigin, directory: preferredDirectory || null },
    selection: { status: selected ? 'selected' : exactOrigin || preferredDirectory ? 'preferred_not_verified' : unique.length > 1 ? 'needs_choice' : 'not_found_in_scope', origin: selected },
    coverage: { ...scan.coverage, explicitDirectories: explicit, candidateLimit: 32, candidates: all.length, probeLimitReached: all.length > 32 }, warnings: environment.warnings || [], runtime: 'not_run', note: '只读环境发现，不是导入/运行验收；未发现不等于本机不存在。配置、页面签名不证明账户或扩展已就绪。' };
}

export function writeHostEnvironment(projectRoot, report) {
  if (report?.schema !== HOST_ENVIRONMENT_SCHEMA || report.runtime !== 'not_run') throw new Error('环境发现不得冒充运行验收');
  const root = ensureProjectFolders(projectRoot), target = resolveProjectPath(root, HOST_ENVIRONMENT_PATH, { output: true });
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report,null,2) + '\n');
  return target;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = name => process.argv.flatMap((v,i) => v === name && process.argv[i+1] && !process.argv[i+1].startsWith('--') ? [process.argv[i+1]] : []);
  try {
    const report = await discoverHost({ roots: values('--scan-root').length ? values('--scan-root') : undefined, directories: values('--directory'), origins: values('--origin'), preferredDirectory: values('--preferred-directory')[0], preferredOrigin: values('--preferred-origin')[0] });
    const project = values('--project-root')[0]; if (project) writeHostEnvironment(project,report);
    console.log(JSON.stringify({ ok: true, ...report },null,2));
  } catch (error) { console.log(JSON.stringify({ ok:false,issues:[error.message] })); process.exitCode = 1; }
}
