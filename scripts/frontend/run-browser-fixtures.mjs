import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atPointer, textHash } from '../production/artifact-bindings.mjs';
import { applyEntry } from '../regex/run-regex-fixtures.mjs';
import { CHECK_DIR, DELIVERY_DIR, STATE_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { checkFrontendScript } from './frontend-source-check.mjs';

export const FRONTEND_FIXTURE_SCHEMA = 'rp-card-studio/frontend-fixtures/v1';
export const FRONTEND_PREVIEW_DIR = STATE_DIR + '/检查结果/前端预览';
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

function preparePreviewFiles(root, captureIds) {
  const directory = resolveProjectPath(root, FRONTEND_PREVIEW_DIR, { output: true }); fs.mkdirSync(directory, { recursive: true });
  if (fs.realpathSync(directory) !== path.resolve(fs.realpathSync(root), FRONTEND_PREVIEW_DIR)) throw new Error('预览目录经过链接，不能写入或清理其他制作区域');
  const indexPath = resolveProjectPath(root, FRONTEND_PREVIEW_DIR + '/current.json', { output: true });
  if (fs.existsSync(indexPath)) {
    if (fs.lstatSync(indexPath).isSymbolicLink()) throw new Error('当前预览索引不能是链接');
    const old = readJson(indexPath);
    if (old.schema !== 'rp-card-studio/frontend-preview/v1' || !Array.isArray(old.images)) throw new Error('当前预览记录无效；保留现有文件，不猜测清理范围');
    for (const image of old.images) {
      if (!/^preview-[a-f0-9]{16}\.png$/.test(path.basename(image?.path ?? '')) || image.path !== FRONTEND_PREVIEW_DIR + '/' + path.basename(image.path)) throw new Error('预览记录包含非本工具图片，停止清理');
      const file = resolveProjectPath(root, image.path, { output: true });
      if (fs.existsSync(file) && fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && textHash(fs.readFileSync(file)) === image.sha256) fs.unlinkSync(file);
    }
  }
  for (const id of captureIds) if (fs.existsSync(path.join(directory, 'preview-' + textHash(id).slice(0, 16) + '.png'))) throw new Error('同名预览文件不属于当前记录或已被外部修改；保留文件，不覆盖');
  fs.writeFileSync(indexPath, JSON.stringify({ schema: 'rp-card-studio/frontend-preview/v1', runtime: 'not_run', images: [] }, null, 2) + '\n');
  return indexPath;
}
export function validateBrowserCases(document) {
  const issues = [], ids = new Set();
  if (document?.schema !== FRONTEND_FIXTURE_SCHEMA || !Array.isArray(document.cases) || !document.cases.length) return { ok: false, issues: ['缺少实际浏览器用例'] };
  for (const c of document.cases) {
    if (!c?.id || ids.has(c.id)) issues.push('用例 id 缺失或重复'); ids.add(c?.id);
    if (c.decodeEntities !== 'none' && c.decodeEntities !== 'once') issues.push('用例必须明确载体解码步骤：none/once');
    if (!c?.route || !c?.binding || !c?.surfaceId || !['message_iframe', 'script_iframe'].includes(c.surface)) issues.push('用例必须明确 route/binding/surfaceId/surface：' + c?.id);
    if (c.surface === 'script_iframe' && !c.resultFrame) issues.push('脚本用例必须指定实际产生的结果 iframe，不能只测后台脚本空壳');
    if (!Array.isArray(c.steps) || !c.steps.some(s => s.expect)) issues.push('用例必须检查可观察结果：' + c?.id);
    if (c.actionId && !c.steps?.some(s => ['click','fill','press','call','dispatch'].includes(s.op))) issues.push('操作用例必须实际触发操作：' + c.id);
    if (c.scenario === 'after_render' && !c.steps?.some(s => ['call','dispatch','reload_frame'].includes(s.op))) issues.push('重画后用例必须实际重画：' + c.id);
    if (c.scenario === 'reload' && !c.steps?.some(s => s.op === 'reload_frame')) issues.push('重载用例必须实际重载：' + c.id);
    if (['swipe','edit','pagehide'].includes(c.scenario) && !c.steps?.some(s => ['call','dispatch','reload_frame'].includes(s.op))) issues.push('生命周期用例必须触发对应操作：' + c.id);
    for (const [i, s] of (c.steps ?? []).entries()) {
      if (s.op && !['click','fill','press','call','dispatch','reload_frame'].includes(s.op)) issues.push('不支持的浏览器操作：' + s.op);
      if (s.expect && !['text','value','visible','attribute','count','overflow'].includes(s.expect)) issues.push('不支持的 DOM 断言：' + s.expect);
      if (!s.op && !s.expect) issues.push('步骤没有操作或断言：' + c.id);
      if (['click','fill','press','call','dispatch','reload_frame'].includes(s.op) && !c.steps.slice(i + 1).some(x => x.expect)) issues.push('操作后缺少结果断言：' + c.id);
    }
  }
  return { ok: issues.length === 0, issues };
}

function contentForCase(root, c, bindings) {
  const binding = bindings.find(b => b.id === c.binding);
  if (!binding) throw new Error('找不到该用例的实际装配绑定：' + c.binding);
  const doc = readJson(resolveProjectPath(root, DELIVERY_DIR + '/' + binding.target.path));
  if (c.surface === 'message_iframe' && !['regex', 'card_field'].includes(binding.target.kind)) throw new Error('消息载体必须测试实际替换或 Greeting 字段，不能把世界书中的 HTML 直接打开冒充消息渲染');
  let code = atPointer(doc, binding.target.pointer);
  if (binding.target.kind === 'regex') {
    const owner = atPointer(doc, binding.target.pointer.slice(0, binding.target.pointer.lastIndexOf('/')));
    if (typeof c.input !== 'string') throw new Error('替换载体用例必须提供真实 producer 输入');
    code = applyEntry(owner, { input: c.input, channel: 'display', placement: 2, depth: c.depth ?? 0, isEdit: c.isEdit ?? false });
    const fenced = code.match(/^```html\r?\n([\s\S]*)\r?\n```$/);
    if (!fenced) throw new Error('替换规则没有产生完整 fenced HTML');
    code = fenced[1];
  }
  if (binding.target.kind === 'card_field' && c.surface === 'message_iframe') { const fenced = code.match(/^```html\r?\n([\s\S]*)\r?\n```$/); if (fenced) code = fenced[1]; }
  if (typeof code !== 'string') throw new Error('导入目标不是可执行文本');
  if (c.surface === 'script_iframe') {
    if (binding.target.kind !== 'helper_script') throw new Error('脚本主路必须独立执行最终 helper_script，不得用兜底页面代测');
    const result = checkFrontendScript(code); if (!result.ok) throw new Error(result.issues.join('\n'));
  }
  return { code, binding, targetSha256: textHash(atPointer(doc, binding.target.pointer)) };
}
const fixtureCode = (root, relative) => {
  if (!relative) return '';
  requireArea(relative, CHECK_DIR, '浏览器夹具'); return fs.readFileSync(resolveProjectPath(root, relative), 'utf8');
};
function injectSetup(html, setup) {
  if (!setup) return html;
  const script = '<script>' + setup.replaceAll('</script', '<\\/script') + '</script>';
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, m => m + script) : script + html;
}
async function waitAssertion(scope, s, timeout) {
  const locator = scope.locator(s.selector);
  if (s.expect === 'visible') { if (s.value === false) await locator.waitFor({ state: 'hidden', timeout }); else await locator.waitFor({ state: 'visible', timeout }); return; }
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    let actual;
    try {
      if (s.expect === 'text') actual = await locator.textContent({ timeout: 100 });
      if (s.expect === 'value') actual = await locator.inputValue({ timeout: 100 });
      if (s.expect === 'attribute') actual = await locator.getAttribute(s.name, { timeout: 100 });
      if (s.expect === 'count') actual = await locator.count();
      if (s.expect === 'overflow') actual = await locator.evaluate(el => el.scrollWidth > el.clientWidth);
      if (s.contains !== undefined ? String(actual).includes(s.contains) : actual === s.value) return;
    } catch { /* The DOM may be replaced while waiting; use a fresh locator on every observation. */ }
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('可观察结果未满足：' + JSON.stringify(s));
}

export async function runBrowserCases({ root, fixtures, bindings, browser, captureIds = [] }) {
  const validation = validateBrowserCases(fixtures);
  const results = [], issues = [...validation.issues];
  if (!Array.isArray(captureIds) || captureIds.some(id => !fixtures?.cases?.some(c => c.id === id))) issues.push('截图必须选择当前实际浏览器用例，不能指向其他页面或旧用例');
  if (issues.length) return { ok: false, level: 'browser-fixture', runtime: 'not_run', issues, results, total: fixtures?.cases?.length ?? 0, passed: 0 };
  // Only indexed, byte-identical captures are ours to remove; user-modified files stay untouched.
  const previewIndex = captureIds.length ? preparePreviewFiles(root, captureIds) : null;
  for (const c of fixtures.cases) {
    const errors = [];
    let context, screenshot;
    try {
      const prepared = contentForCase(root, c, bindings); let code = prepared.code; const { binding, targetSha256 } = prepared;
      context = await browser.newContext({ viewport: c.viewport ?? { width: 1100, height: 800 }, serviceWorkers: 'block' });
      // Fixture runs are offline. Live-host imports, remote dependencies and persistence require a separate real-ST run.
      await context.route('**/*', route => route.abort());
      await context.routeWebSocket('**/*', socket => socket.close());
      const host = await context.newPage(); host.on('pageerror', error => errors.push(error.message));
      const timeout = c.timeoutMs ?? 5000;
      host.setDefaultTimeout(timeout);
      await host.setContent('<!doctype html><html><body><textarea id="send_textarea"></textarea><div id="chat"></div></body></html>');
      if (c.decodeEntities === 'once') code = await host.evaluate(html => { const decoder = document.createElement('textarea'); return html.replace(/&(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);/gi, entity => { decoder.innerHTML = entity; return decoder.value; }); }, code);
      const hostSetup = fixtureCode(root, c.hostSetup); if (hostSetup) await host.evaluate(code => { const s = document.createElement('script'); s.textContent = code; document.head.appendChild(s); }, hostSetup);
      await host.evaluate(({ html, name }) => new Promise(resolve => { const f = document.createElement('iframe'); f.id = name; f.name = name; f.onload = resolve; f.srcdoc = html; document.body.appendChild(f); }), {
        html: c.surface === 'script_iframe' ? injectSetup('<!doctype html><html><head></head><body></body></html>', fixtureCode(root, c.frameSetup)) : injectSetup(code, fixtureCode(root, c.frameSetup)),
        name: c.frameName ?? (c.surface === 'message_iframe' ? 'TH-message--2--0' : 'fixture-background-script'),
      });
      const sourceSelector = '#' + (c.frameName ?? (c.surface === 'message_iframe' ? 'TH-message--2--0' : 'fixture-background-script'));
      const sourceElement = await host.locator(sourceSelector).elementHandle();
      let sourceFrame;
      for (let attempt = 0; attempt < 100; attempt++) {
        sourceFrame = await sourceElement.contentFrame();
        if (sourceFrame && await sourceFrame.locator('body').count()) break;
        await new Promise(r => setTimeout(r, 10));
      }
      if (!sourceFrame) throw new Error('测试 iframe 未加载');
      if (c.surface === 'script_iframe') await sourceFrame.evaluate(code => { const s = document.createElement('script'); s.textContent = code; document.body.appendChild(s); }, code);
      const frame = c.resultFrame ? host.frameLocator(c.resultFrame) : host.frameLocator(sourceSelector);
      if (captureIds.includes(c.id)) {
        await host.locator(c.resultFrame ?? sourceSelector).waitFor({ state: 'attached' });
        await host.locator(c.resultFrame ?? sourceSelector).evaluate((el, height) => { el.style.width = '100%'; el.style.height = height + 'px'; el.style.border = '0'; }, (c.viewport ?? { height: 800 }).height);
      }
      for (const step of c.steps) {
        const scope = step.scope === 'host' ? host : frame;
        if (step.op === 'click') await scope.locator(step.selector).click();
        if (step.op === 'fill') await scope.locator(step.selector).fill(step.value);
        if (step.op === 'press') await scope.locator(step.selector).press(step.key);
        if (step.op === 'call') {
          const element = await host.locator(step.scope === 'host' ? 'html' : c.resultFrame ?? sourceSelector).elementHandle();
          const windowScope = step.scope === 'host' ? host : await element.contentFrame();
          if (!windowScope) throw new Error('调用目标 iframe 不存在');
          await windowScope.evaluate(({ name, args }) => { if (typeof window[name] !== 'function') throw new Error('刷新入口不存在：' + name); return window[name](...args); }, { name: step.name, args: step.args ?? [] });
        }
        if (step.op === 'dispatch') await scope.locator(step.selector).dispatchEvent(step.name, step.data ?? {});
        if (step.op === 'reload_frame') await host.locator(sourceSelector).evaluate(el => new Promise(resolve => { const html = el.srcdoc; el.onload = resolve; el.srcdoc = html; }));
        if (step.expect) await waitAssertion(scope, step, timeout);
      }
      if (errors.length) throw new Error('页面执行错误：' + errors.join('; '));
      if (captureIds.includes(c.id)) {
        const size = await frame.locator('body').evaluate(el => Math.ceil(Math.max(el.scrollHeight, el.ownerDocument.documentElement.scrollHeight)));
        const height = Math.max(24, Math.min(size, 16384));
        const locator = host.locator(c.resultFrame ?? sourceSelector);
        await locator.evaluate((el, value) => { el.style.height = value + 'px'; }, height);
        const relative = FRONTEND_PREVIEW_DIR + '/preview-' + textHash(c.id).slice(0, 16) + '.png';
        const bytes = await locator.screenshot({ animations: 'disabled', caret: 'hide' });
        if (errors.length) throw new Error('预览执行错误：' + errors.join('; '));
        fs.writeFileSync(resolveProjectPath(root, relative, { output: true }), bytes, { flag: 'wx' });
        screenshot = { path: relative, sha256: textHash(fs.readFileSync(resolveProjectPath(root, relative))), targetSha256,
          level: 'browser-fixture', runtime: 'not_run', viewport: host.viewportSize(), frame: await locator.boundingBox(), clipped: size > height,
          note: '当前导入内容在受控预览容器中渲染；外部网络禁用，不是酒馆实机截图或用户接受。' };
      }
      results.push({ id: c.id, route: c.route, surfaceId: c.surfaceId, binding: binding.id, actionId: c.actionId ?? null, scenario: c.scenario ?? 'load', ok: true, targetSha256, ...(screenshot ? { screenshot } : {}) });
    } catch (e) { results.push({ id: c.id, route: c.route, surfaceId: c.surfaceId, binding: c.binding, actionId: c.actionId ?? null, scenario: c.scenario ?? 'load', ok: false, error: String(e.message) }); }
    finally { if (context) await context.close(); }
  }
  const passed = results.filter(r => r.ok).length;
  if (previewIndex) fs.writeFileSync(previewIndex, JSON.stringify({ schema: 'rp-card-studio/frontend-preview/v1', runtime: 'not_run', images: results.filter(r => r.ok && r.screenshot).map(r => ({ caseId: r.id, route: r.route, surfaceId: r.surfaceId, ...r.screenshot })) }, null, 2) + '\n');
  return { ok: passed === results.length, level: 'browser-fixture', runtime: 'not_run', issues, passed, total: results.length, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
  let browser;
  try {
    const root = path.resolve(opt('--root') || process.cwd());
    const file = opt('--fixtures'); requireArea(file, CHECK_DIR, '浏览器用例');
    const production = readJson(resolveProjectPath(root, STATE_DIR + '/production.json'));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, executablePath: opt('--browser') || process.env.RP_BROWSER_EXECUTABLE || undefined });
    const captureIds = process.argv.flatMap((value, i) => {
      if (value !== '--preview') return [];
      if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('--preview 必须指定实际用例 id');
      return [process.argv[i + 1]];
    });
    const report = await runBrowserCases({ root, fixtures: readJson(resolveProjectPath(root, file)), bindings: production.bindings ?? [], browser, captureIds });
    console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1;
  } catch (e) { console.log(JSON.stringify({ ok: false, level: 'browser-fixture', runtime: 'not_run', issues: [String(e.message)] })); process.exitCode = 1; }
  finally { if (browser) await browser.close(); }
}
