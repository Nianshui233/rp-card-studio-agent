import { chromium } from 'playwright';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, interviewFixture } from './helpers/production-fixture.mjs';
import { INTERVIEW_PROFILES } from '../scripts/production/interview-coverage.mjs';
import { validateProductionProject } from '../scripts/production/production-project.mjs';
import { runCheckPlan } from '../scripts/production/check-plan.mjs';
import { runBrowserCases } from '../scripts/frontend/run-browser-fixtures.mjs';

const f = fixture(), specs = [], bindings = [], rules = [];
process.once('exit', () => f.remove());
const here = path.dirname(fileURLToPath(import.meta.url));
const script = code => '<!doctype html><html><head></head><body><div id="out">idle</div>' + code + '</body></html>';
const code = s => '<script>' + s + '</script>';
const widget = String.raw`
<div id="pane"><button id="open">详情</button><button id="use">使用</button></div><div id="modal" hidden>details</div>
<script>
function bind(){document.getElementById('open').onclick=()=>document.getElementById('modal').hidden=false;
document.getElementById('use').onclick=()=>{const input=parent.document.getElementById('send_textarea');input.value+=(input.value?'\n':'')+'使用【道具】';};}
window.redraw=()=>{document.getElementById('modal').hidden=true;document.getElementById('pane').innerHTML='<button id="open">详情</button><button id="use">使用</button>';bind();};bind();
</script>`;
function add(id, expectedOk, html, options = {}) {
  const source = '制作文件/构建/' + id + '.html'; f.write(source, html);
  const i = rules.length; rules.push({ id, findRegex: '/<panel>/g', replaceString: '```html\n' + html + '\n```', placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, trimStrings: [] });
  bindings.push({ id, component: 'message_frontend', route: id, source: { path: source, format: 'text' }, target: { path: 'fixture.正则.json', pointer: '/' + i + '/replaceString', kind: 'regex' }, wrapper: 'fenced_html', match: 'equals' });
  specs.push({ id, expectedOk, case: { id, route: id, binding: id, surfaceId: 'main', surface: 'message_iframe', input: '<panel>', decodeEntities: 'none', timeoutMs: 350, steps: [{ expect: 'text', selector: '#out', value: 'ready' }], ...options } });
}
add('buttons-initial-and-redrawn', true, script(widget), { steps: [
  { op: 'click', selector: '#open' }, { expect: 'visible', selector: '#modal', value: true },
  { op: 'call', name: 'redraw' }, { expect: 'visible', selector: '#modal', value: false },
  { op: 'click', selector: '#open' }, { expect: 'visible', selector: '#modal', value: true },
] });
add('draft-appends-not-overwrites', true, script(widget), { steps: [
  { op: 'fill', scope: 'host', selector: '#send_textarea', value: '已有草稿' }, { expect: 'value', scope: 'host', selector: '#send_textarea', value: '已有草稿' },
  { op: 'click', selector: '#use' }, { expect: 'value', scope: 'host', selector: '#send_textarea', value: '已有草稿\n使用【道具】' },
] });
add('dom-rewrite-destroys-handlers', false, script(widget + code(`document.getElementById('pane').innerHTML += '<footer>foot</footer>';`)), { steps: [{ op: 'click', selector: '#open' }, { expect: 'visible', selector: '#modal', value: true }] });
add('cross-function-reference-error', false, script(code(`function local(){var ONLY_LOCAL=1;}document.getElementById('out').textContent=String(ONLY_LOCAL);`)));
add('replacement-group-corrupts-source', false, script(code(`const x=RegExp.$1;document.getElementById('out').textContent='ready';`)));
add('entity-decoding-changes-script', false, script(code(`const esc={"'":'&#39;'};document.getElementById('out').textContent='ready';`)), { decodeEntities: 'once' });
add('inert-comment-is-not-an-error', true, script(code(`// el('pane').innerHTML += foot; createScriptIdIframe();
document.getElementById('out').textContent='ready';`)));
const built = await build({ stdin: { resolveDir: here, contents: `import {createBootController} from '../shared/frontend/boot-controller.mjs';
window.boot=createBootController({intervalMs:10,timeoutMs:1000,attempt(){const p=parent.provider;if(!p)return {status:'waiting_provider'};if(!p.data)return {status:'waiting_snapshot'};return {status:'ready',data:p.data};},render(data){document.getElementById('out').textContent=data;},onState(s){document.body.setAttribute('data-boot',s.status);}});
window.addEventListener('pagehide',()=>window.boot.stop());window.boot.start();` }, bundle: true, write: false, format: 'iife' });
f.write('制作文件/检查/provider-delayed.js', `setTimeout(()=>window.provider={data:'ready'},70);`);
f.write('制作文件/检查/provider-empty.js', `window.provider={data:null};`);
add('delayed-provider-reaches-ready', true, script(code(built.outputFiles[0].text)), { hostSetup: '制作文件/检查/provider-delayed.js', steps: [{ expect: 'attribute', selector: 'body', name: 'data-boot', value: 'ready' }, { expect: 'text', selector: '#out', value: 'ready' }] });
add('missing-snapshot-is-not-demo-data', true, script(code(built.outputFiles[0].text)), { hostSetup: '制作文件/检查/provider-empty.js', steps: [{ expect: 'attribute', selector: 'body', name: 'data-boot', value: 'waiting_snapshot' }, { expect: 'text', selector: '#out', value: 'idle' }] });
add('frame-reload-renders-and-rebinds', true, script(widget), { steps: [{ op: 'reload_frame' }, { expect: 'count', selector: '#open', value: 1 }, { op: 'click', selector: '#open' }, { expect: 'visible', selector: '#modal', value: true }] });
f.write('导入包/fixture.正则.json', rules);
function helper(id, expectedOk, source) {
  f.write('导入包/' + id + '.脚本.json', { scripts: [{ content: source, enabled: true }] });
  bindings.push({ id, component: 'message_frontend', route: id, target: { path: id + '.脚本.json', pointer: '/scripts/0/content', kind: 'helper_script' } });
  specs.push({ id, expectedOk, case: { id, route: id, binding: id, surfaceId: 'main', surface: 'script_iframe', decodeEntities: 'none', resultFrame: '#mounted-result', timeoutMs: 350, steps: [{ expect: 'text', selector: '#out', value: 'ready' }] } });
}
const actualPage = script(code(`document.getElementById('out').textContent='ready';`));
helper('main-route-without-fallback', true, `const host=parent.document.getElementById('chat');const f=parent.document.createElement('iframe');f.id='mounted-result';f.srcdoc=${JSON.stringify(actualPage)};host.appendChild(f);`);
helper('wrong-document-has-no-chat', false, `const host=document.getElementById('chat');if(host){const f=document.createElement('iframe');f.id='mounted-result';f.srcdoc=${JSON.stringify(actualPage)};host.appendChild(f);}`);
helper('missing-template-utility', false, `if(typeof createScriptIdIframe==='function')createScriptIdIframe();`);

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.RP_BROWSER_EXECUTABLE || undefined });
  const results = [];
  for (const spec of specs) {
    const measured = await runBrowserCases({ root: f.root, bindings, browser, fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases: [spec.case] } });
    results.push({ id: spec.id, ok: measured.ok === spec.expectedOk, expectedExecutionPass: spec.expectedOk, observedExecutionPass: measured.ok, errors: measured.results.filter(r => !r.ok).map(r => r.error) });
  }

  // Positive integration: a measured final package can satisfy the stronger gate without any real-host claim.
  const app = fixture();
  try {
    const frontInterview = interviewFixture('opening_frontend', INTERVIEW_PROFILES);
    app.ledger.decisions = frontInterview.ledger.decisions;
    app.ledger.stages.find(s => s.id === 'opening_frontend').enabled = 'enabled'; app.saveLedger();
    const source = '制作文件/构建/app.html', target = 'A.正则.json';
    const html = script(code(`window.redraw=()=>{document.getElementById('out').textContent='ready';};window.redraw();`));
    app.write('导入包/导入说明.txt', '技术夹具的导入说明，不是作品样本');
    app.write(source, html); app.write('导入包/' + target, [{ id: 'page', scriptName: '技术夹具', findRegex: '/<entry>/g', replaceString: '```html\n' + html + '\n```', placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, trimStrings: [] }]);
    const components = { worldbook: { path: 'A.世界书.json' }, regex: { path: target } };
    app.write('制作文件/项目记录/交付清单.json', { schema: 'rp-card-studio/active-route/v1', activeRoute: 'main', components, routes: { main: { status: 'active', components } } });
    const binding = { id: 'page', component: 'opening_frontend', route: 'main', source: { path: source, format: 'text' }, target: { path: target, pointer: '/0/replaceString', kind: 'regex' }, wrapper: 'fenced_html', match: 'equals' };
    const cases = ['load','after_render','reload','pagehide','initial'].map(scenario => ({ id: scenario, route: 'main', binding: 'page', surfaceId: 'main', surface: 'message_iframe', input: '<entry>', decodeEntities: 'none', scenario, actionId: scenario === 'initial' || scenario === 'after_render' ? 'open' : undefined,
      steps: [...(scenario === 'load' ? [] : scenario === 'reload' || scenario === 'pagehide' ? [{ op: 'reload_frame' }] : [{ op: 'call', name: 'redraw' }]), { expect: 'text', selector: '#out', value: 'ready', fieldId: 'name' }] }));
    const document = { schema: 'rp-card-studio/frontend-fixtures/v1', cases }; app.write('制作文件/检查/frontend.json', document);
    const measured = await runBrowserCases({ root: app.root, bindings: [binding], fixtures: document, browser });
    const carrier = { mode: 'tavern_helper_message_iframe', versionPin: 'fixture-provider', highPrivilege: true, container: 'div.TH-render', sourceDetection: 'pre_isFrontend', iframeIdTemplate: 'TH-message--{message_id}--{index}', heightProtocol: 'TH_UPDATE_VIEWPORT_HEIGHT', lifecycle: ['render_started','load','swipe','edit','reload','delete','pagehide'], streaming: 'disabled', capabilityProbe: true };
    const manifest = { ...app.manifest, status: 'candidate', interviews: { opening_frontend: frontInterview.interview }, bindings: [binding], frontends: { opening_frontend: { status: 'implemented', fallbackContract: 'visible empty state', prototype: { level: 'browser-fixture', status: 'passed' }, browserFixtures: '制作文件/检查/frontend.json', routes: [{ id: 'main', role: 'primary', dataSource: 'static', surfaceIds: ['main'], carrier }] } } };
    const plan = { schema: 'rp-card-studio/check-plan/v1', steps: [{ id: 'browser', kind: 'check', cwd: 'project', result: 'json', args: [] }] };
    app.write(manifest.verification.plan, plan);
    app.write(manifest.verification.report, runCheckPlan(plan, { root: app.root, agentRoot: here, execute: () => ({ status: 0, stdout: JSON.stringify(measured) }) }));
    const gate = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'final-gate-measured-browser-not-real-host', ok: measured.ok && gate.ok && gate.runtimeClaim === false, errors: gate.issues });
    const front = manifest.frontends.opening_frontend;
    front.routes.push({ ...front.routes[0], id: 'unmeasured-fallback', role: 'fallback' });
    const missing = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'fallback-cannot-borrow-primary-evidence', ok: !missing.ok, errors: [] });
  } finally { app.remove(); }
  const passed = results.filter(r => r.ok).length;
  const report = { ok: passed === results.length, level: 'browser-fixture', runtime: 'not_run', passed, total: results.length, results };
  console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1;
} catch (e) { console.log(JSON.stringify({ ok: false, runtime: 'not_run', issues: [e.message] })); process.exitCode = 1; }
finally { if (browser) await browser.close(); f.remove(); }
