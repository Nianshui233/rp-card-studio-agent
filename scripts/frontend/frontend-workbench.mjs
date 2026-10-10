import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { textHash, validateArtifactBindings } from '../production/artifact-bindings.mjs';
import { CHECK_DIR, STATE_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { runBrowserCases, validateBrowserCases } from './run-browser-fixtures.mjs';
import { createWorkbenchController } from './workbench-controller.mjs';

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
async function renderWorkbench() {
  const asset = name => path.join(agentRoot, 'assets/frontend-workbench', name);
  const built = await build({ entryPoints: [asset('workbench.mjs')], bundle: true, write: false, format: 'iife', target: 'es2022', legalComments: 'inline' });
  const notice = fs.readFileSync(path.join(agentRoot,'assets/frontend-tools/THIRD_PARTY_NOTICES.md'),'utf8');
  return fs.readFileSync(asset('index.html'), 'utf8').replace('</head>', () => '<!--\n' + notice.replaceAll('-->', '-- >') + '\n--></head>').replace('/* RP_WORKBENCH_CSS */', () => fs.readFileSync(asset('workbench.css'), 'utf8')).replace('/* RP_WORKBENCH_JS */', () => built.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
}
export async function startFrontendWorkbench({ root, fixtures, bindings, caseId, browser, fixturesPath }) {
  const checked = validateBrowserCases(fixtures); if (!checked.ok) throw Error(checked.issues.join('\n'));
  const c = fixtures.cases.find(item => item.id === caseId); if (!c) throw Error('必须选择当前实际用例');
  const binding = bindings.find(item => item.id === c.binding);
  if (!binding || !['opening_frontend','message_frontend'].includes(binding.component)) throw Error('用例没有明确的前端阶段绑定');
  const parity = validateArtifactBindings(root, [binding], { requiredComponents: [binding.component] }); if (!parity.ok) throw Error(parity.issues.join('\n'));
  const fixturesSource = fixturesPath ? { path: requireArea(fixturesPath, CHECK_DIR, '用例来源'), sha256: textHash(fs.readFileSync(resolveProjectPath(root, fixturesPath))) } : undefined;
  const html = await renderWorkbench();
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); response.end(html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  let finish, resolveReady, rejectReady, controller;
  const closed = new Promise(resolve => { finish = resolve; }), ready = new Promise((resolve,reject) => { resolveReady = resolve; rejectReady = reject; });
  const close = () => finish();
  const disconnected = () => close(); browser.on('disconnected', disconnected);
  const done = runBrowserCases({ root, fixtures: { ...fixtures, cases: [c] }, bindings, browser, hostDocumentUrl: url, onCaseReady: async session => {
    try {
      controller = createWorkbenchController({ root, session, bindings, fixturesSource, close });
      await session.host.exposeFunction('__rpWorkbenchCall', (method, input) => controller.dispatch(method, input));
      await controller.initialize();
      await session.host.evaluate(() => dispatchEvent(new Event('rp-workbench-ready')));
      session.host.once('close', close);
      resolveReady({ controller, page: session.host, frame: session.frame, url, stage: binding.component, caseId });
      await closed;
    } finally { await controller?.dispose(); }
  } }).then(report => { if (!report.ok) rejectReady(Error(report.results.find(item => !item.ok)?.error || report.issues.join('\n'))); return report; })
    .finally(async () => { browser.off('disconnected', disconnected); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { ready, done, close, url };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let browser, workbench;
  const stop = () => workbench?.close();
  try {
    const opt = flag => { const i = process.argv.indexOf(flag); if (i < 0) return undefined; const value = process.argv[i+1]; if (!value || value.startsWith('--')) throw Error(flag + ' 缺少值'); return value; };
    const root = path.resolve(opt('--root') || process.cwd()), relative = opt('--fixtures'); requireArea(relative, CHECK_DIR, '浏览器用例');
    const production = readJSON(resolveProjectPath(root, STATE_DIR + '/production.json'));
    const { chromium } = await import('playwright'); browser = await chromium.launch({ headless: process.argv.includes('--headless'), executablePath: opt('--browser') || process.env.RP_BROWSER_EXECUTABLE || undefined });
    workbench = await startFrontendWorkbench({ root, fixtures: readJSON(resolveProjectPath(root, relative)), fixturesPath: relative, bindings: production.bindings ?? [], caseId: opt('--case'), browser });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const active = await workbench.ready;
    console.log(JSON.stringify({ ok: true, url: active.url, stage: active.stage, caseId: active.caseId, level: 'workbench-candidate', runtime: 'not_run', note: '在已打开的受控浏览器中操作；其他浏览器窗口没有本次夹具会话。结束按钮或 Ctrl+C 关闭工具。' }, null, 2));
    const report = await workbench.done; if (!report.ok) { console.error(JSON.stringify(report)); process.exitCode = 1; }
  } catch (error) { console.error(JSON.stringify({ ok: false, runtime: 'not_run', issues: [error.message] })); process.exitCode = 1; }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); workbench?.close(); if (workbench) await workbench.done; if (browser) await browser.close(); }
}
