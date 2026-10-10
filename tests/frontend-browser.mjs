import { chromium } from 'playwright';
import { build } from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, interviewFixture, designReviewFixture } from './helpers/production-fixture.mjs';
import { INTERVIEW_PROFILES } from '../scripts/production/interview-coverage.mjs';
import { validateProductionProject } from '../scripts/production/production-project.mjs';
import { runCheckPlan } from '../scripts/production/check-plan.mjs';
import { runBrowserCases } from '../scripts/frontend/run-browser-fixtures.mjs';
import { textHash } from '../scripts/production/artifact-bindings.mjs';

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
const assetCSS = '#out{color:rgb(18,52,86)}', assetJS = 'window.actualAssetLoaded=true;', assetImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZZkAAAAASUVORK5CYII=', 'base64');
const assetRows = [['theme.css', assetCSS, 'text/css'], ['engine.js', assetJS, 'application/javascript'], ['image.png', assetImage, 'image/png']].map(([name, body, contentType]) => {
  const path = '制作文件/检查/资源/' + name; f.write(path, body); return { url: 'https://assets.example.test/' + name, path, sha256: textHash(body), contentType };
});
const assetPage = '<!doctype html><html><head><link rel="stylesheet" href="https://assets.example.test/theme.css"></head><body><div id="out">idle</div><img id="asset" src="https://assets.example.test/image.png"><script src="https://assets.example.test/engine.js"></script>' + code(`function show(){document.getElementById('out').textContent=getComputedStyle(document.getElementById('out')).color+'|'+document.getElementById('asset').naturalWidth+'|'+window.actualAssetLoaded;}const image=document.getElementById('asset');if(image.complete)show();else image.onload=show;`) + '</body></html>';
add('mapped-real-resources', true, assetPage, { resources: assetRows, steps: [{ expect: 'text', selector: '#out', value: 'rgb(18, 52, 86)|1|true' }] });
const missingPage = script('<img src="https://assets.example.test/missing.png">' + code(`document.getElementById('out').textContent='ready';`));
add('missing-visual-resource', false, missingPage);
add('resource-failure-preview-explicit', true, missingPage, { previewKind: 'resource_failure' });
f.write('制作文件/检查/资源/broken.woff2', 'not-a-font');
add('invalid-mapped-font', false, '<!doctype html><html><head><style>@font-face{font-family:Fixture;src:url(https://assets.example.test/broken.woff2)}body{font-family:Fixture}</style></head><body><div id="out">ready</div></body></html>', { resources: [{ url: 'https://assets.example.test/broken.woff2', path: '制作文件/检查/资源/broken.woff2', sha256: textHash('not-a-font'), contentType: 'font/woff2' }] });
add('changed-resource-bytes', false, assetPage, { resources: assetRows.map((r, i) => i ? r : { ...r, sha256: textHash('old-css') }) });
const fontFile = [process.env.RP_FONT_TEST_FILE, 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(file => file && fs.existsSync(file));
if (fontFile) {
  const font = fs.readFileSync(fontFile), fontPath = '制作文件/检查/资源/display.ttf'; f.write(fontPath, font);
  add('mapped-real-font', true, '<!doctype html><html><head><style>@font-face{font-family:FixtureFont;src:url(https://assets.example.test/display.ttf)}body{font-family:FixtureFont}</style></head><body><div id="out">font loading</div>' + code(`document.fonts.ready.then(()=>document.getElementById('out').textContent=document.fonts.check('16px FixtureFont')?'font-ready':'font-failed');`) + '</body></html>', { resources: [{ url: 'https://assets.example.test/display.ttf', path: fontPath, sha256: textHash(font), contentType: 'font/ttf' }], steps: [{ expect: 'text', selector: '#out', value: 'font-ready' }] });
}
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
    const capture = ['buttons-initial-and-redrawn', 'main-route-without-fallback', 'mapped-real-resources', 'mapped-real-font', 'missing-visual-resource', 'resource-failure-preview-explicit', 'invalid-mapped-font', 'changed-resource-bytes'].includes(spec.id);
    const beforeImports = fs.readFileSync(path.join(f.root, '导入包/fixture.正则.json'));
    const measured = await runBrowserCases({ root: f.root, bindings, browser, fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases: [spec.case] }, captureIds: capture ? [spec.id] : [] });
    results.push({ id: spec.id, ok: measured.ok === spec.expectedOk, expectedExecutionPass: spec.expectedOk, observedExecutionPass: measured.ok, errors: measured.results.filter(r => !r.ok).map(r => r.error) });
    if (capture && spec.expectedOk) {
      const record = measured.results[0]?.screenshot, bytes = record ? fs.readFileSync(path.join(f.root, record.path)) : null;
      results.push({ id: spec.id + '-actual-preview', ok: Boolean(record && bytes?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.readUInt32BE(16) > 300 && bytes.readUInt32BE(20) > 24 && record.sha256 === textHash(bytes) && record.targetSha256 === measured.results[0].targetSha256 && record.runtime === 'not_run' && fs.readFileSync(path.join(f.root, '导入包/fixture.正则.json')).equals(beforeImports)), errors: [] });
      if (record && process.env.RP_PREVIEW_TEST_OUTPUT) {
        const directory = path.resolve(process.env.RP_PREVIEW_TEST_OUTPUT); fs.mkdirSync(directory, { recursive: true });
        fs.copyFileSync(path.join(f.root, record.path), path.join(directory, spec.id + '.png'));
      }
    }
  }

  const socketTarget = http.createServer(); let upgrades = 0;
  socketTarget.on('upgrade', (_request, socket) => { upgrades++; socket.destroy(); });
  await new Promise(resolve => socketTarget.listen(0, '127.0.0.1', resolve));
  try {
    const socketPage = script(code(`document.getElementById('out').textContent='ready';const socket=new WebSocket('ws://127.0.0.1:${socketTarget.address().port}');socket.onopen=()=>{document.getElementById('out').textContent='unexpected-network';};`));
    f.write('导入包/socket.json', [{ scriptName: '技术夹具', findRegex: '/<panel>/g', replaceString: '```html\n' + socketPage + '\n```', placement: [2], disabled: false, markdownOnly: true, promptOnly: false, substituteRegex: 0, trimStrings: [] }]);
    const socketCase = { id: 'socket-offline', route: 'socket', binding: 'socket', surfaceId: 'main', surface: 'message_iframe', input: '<panel>', decodeEntities: 'none', previewKind: 'resource_failure', steps: [{ expect: 'text', selector: '#out', value: 'ready' }] };
    const checked = await runBrowserCases({ root: f.root, browser, fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases: [socketCase] }, bindings: [{ id: 'socket', target: { path: 'socket.json', pointer: '/0/replaceString', kind: 'regex' } }], captureIds: ['socket-offline'] });
    results.push({ id: 'preview-cannot-contact-live-websocket-service', ok: checked.ok && upgrades === 0 && checked.results[0]?.screenshot?.runtime === 'not_run', errors: checked.results.filter(r => !r.ok).map(r => r.error) });
  } finally { await new Promise(resolve => socketTarget.close(resolve)); }

  // Positive integration: a measured final package can satisfy the stronger gate without any real-host claim.
  const app = fixture();
  try {
    const frontInterview = interviewFixture('opening_frontend', INTERVIEW_PROFILES);
    app.ledger.decisions = frontInterview.ledger.decisions;
    app.ledger.stages.find(s => s.id === 'opening_frontend').enabled = 'enabled'; app.saveLedger();
    const source = '制作文件/构建/app.html', target = 'A.正则.json';
    const html = script('<button id="open">详情</button><section id="details" hidden>当前详细资料</section>' + code(`window.redraw=()=>{document.getElementById('out').textContent='ready';document.getElementById('details').hidden=true;document.getElementById('open').onclick=()=>document.getElementById('details').hidden=false;};window.redraw();`));
    app.write('导入包/导入说明.txt', '技术夹具的导入说明，不是作品样本');
    app.write(source, html); app.write('导入包/' + target, [{ id: 'page', scriptName: '技术夹具', findRegex: '/<entry>/g', replaceString: '```html\n' + html + '\n```', placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, trimStrings: [] }]);
    const components = { worldbook: { path: 'A.世界书.json' }, regex: { path: target } };
    app.write('制作文件/项目记录/交付清单.json', { schema: 'rp-card-studio/active-route/v1', activeRoute: 'main', components, routes: { main: { status: 'active', components } } });
    const binding = { id: 'page', component: 'opening_frontend', route: 'main', source: { path: source, format: 'text' }, target: { path: target, pointer: '/0/replaceString', kind: 'regex' }, wrapper: 'fenced_html', match: 'equals' };
    const cases = ['load','after_render','reload','pagehide','initial'].map(scenario => ({ id: scenario, route: 'main', binding: 'page', surfaceId: 'main', surface: 'message_iframe', input: '<entry>', decodeEntities: 'none', scenario, actionId: scenario === 'initial' || scenario === 'after_render' ? 'open' : undefined,
      steps: [...(scenario === 'load' ? [] : scenario === 'reload' || scenario === 'pagehide' ? [{ op: 'reload_frame' }] : [{ op: 'call', name: 'redraw' }, { op: 'click', selector: '#open' }]), { expect: 'text', selector: '#out', value: 'ready', fieldId: 'name' }, ...(scenario === 'initial' || scenario === 'after_render' ? [{ expect: 'visible', selector: '#details', value: true }] : [])] }));
    cases.push({ ...cases[0], id: 'load-narrow', viewport: { width: 390, height: 800 } });
    const document = { schema: 'rp-card-studio/frontend-fixtures/v1', cases }; app.write('制作文件/检查/frontend.json', document);
    const measured = await runBrowserCases({ root: app.root, bindings: [binding], fixtures: document, browser, captureIds: ['load', 'load-narrow', 'initial'] });
    const carrier = { mode: 'tavern_helper_message_iframe', versionPin: 'fixture-provider', highPrivilege: true, container: 'div.TH-render', sourceDetection: 'pre_isFrontend', iframeIdTemplate: 'TH-message--{message_id}--{index}', heightProtocol: 'TH_UPDATE_VIEWPORT_HEIGHT', lifecycle: ['render_started','load','swipe','edit','reload','delete','pagehide'], streaming: 'disabled', capabilityProbe: true };
    const manifest = { ...app.manifest, status: 'candidate', interviews: { opening_frontend: frontInterview.interview }, bindings: [binding], frontends: { opening_frontend: { status: 'implemented', fallbackContract: 'visible empty state', designReview: designReviewFixture('opening_frontend', frontInterview.interview.design, ['load', 'load-narrow', 'initial']), browserFixtures: '制作文件/检查/frontend.json', routes: [{ id: 'main', role: 'primary', dataSource: 'static', surfaceIds: ['main'], carrier }] } } };
    const plan = { schema: 'rp-card-studio/check-plan/v1', steps: [{ id: 'browser', kind: 'check', cwd: 'project', result: 'json', args: [] }] };
    app.write(manifest.verification.plan, plan);
    app.write(manifest.verification.report, runCheckPlan(plan, { root: app.root, agentRoot: here, execute: () => ({ status: 0, stdout: JSON.stringify(measured) }) }));
    const gate = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'final-gate-measured-browser-not-real-host', ok: measured.ok && gate.ok && gate.runtimeClaim === false, errors: gate.issues });
    const otherBinding = { ...binding, id: 'message-page', component: 'message_frontend' };
    const other = await runBrowserCases({ root: app.root, bindings: [otherBinding], fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases: [{ ...cases[0], binding: otherBinding.id }] }, browser, captureIds: ['load'] });
    const currentImages = JSON.parse(fs.readFileSync(path.join(app.root, '制作文件/项目记录/检查结果/前端预览/current.json'), 'utf8')).images;
    const afterOther = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'independent-frontends-keep-current-previews-even-with-identical-case-names', ok: other.ok && afterOther.ok && currentImages.filter(i => i.caseId === 'load').length === 2 && measured.results[0].screenshot.path !== other.results[0].screenshot.path, errors: afterOther.issues });
    manifest.frontends.opening_frontend.designReview.caseIds = ['load', 'load-narrow'];
    const missingState = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'first-screen-only-cannot-prove-key-visual-states', ok: !missingState.ok && missingState.issues.some(i => i.includes('关键操作后的视觉状态')), errors: [] });
    manifest.frontends.opening_frontend.designReview.caseIds.push('initial');
    frontInterview.interview.design.artDirection.composition += ' changed';
    const stale = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'stale-design-cannot-borrow-old-visual-review', ok: !stale.ok && stale.issues.some(i => i.includes('视觉复核必须重做')), errors: [] });
    frontInterview.interview.design.artDirection.composition = frontInterview.interview.design.artDirection.composition.replace(' changed', '');
    const imagePath = path.join(app.root, measured.results.find(r => r.id === 'load').screenshot.path), imageBytes = fs.readFileSync(imagePath);
    fs.appendFileSync(imagePath, 'changed');
    const edited = await validateProductionProject(manifest, { root: app.root, final: true });
    results.push({ id: 'edited-image-cannot-prove-current-design', ok: !edited.ok && edited.issues.some(i => i.includes('视觉截图不可核验')), errors: [] });
    fs.writeFileSync(imagePath, imageBytes);
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
