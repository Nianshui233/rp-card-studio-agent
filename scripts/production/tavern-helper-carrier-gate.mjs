import fs from 'node:fs';
import { CHECK_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { validateBrowserCases } from '../frontend/run-browser-fixtures.mjs';

const MESSAGE_LIFECYCLE = new Set(['render_started','load','swipe','edit','reload','delete','pagehide']);
const SCRIPT_LIFECYCLE = new Set(['load','reload','pagehide']);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function requireIncludes(array, values, issues, label) { for (const value of values) if (!Array.isArray(array) || !array.includes(value)) issues.push(`${label} 缺少 ${value}`); }

export function validateTavernHelperCarrier(carrier, { activeStage = null } = {}) {
  const issues = [];
  if (!object(carrier)) return { ok: false, issues: ['缺少 Tavern Helper frontend carrier 合同'] };
  const mode = carrier.mode;
  if (!['tavern_helper_message_iframe','tavern_helper_script_iframe','stpt_ejs_iframe'].includes(mode)) issues.push(`未知前端 carrier：${mode}`);
  if (!nonempty(carrier.versionPin)) issues.push('Tavern Helper carrier 缺少 versionPin/source pin');
  if (carrier.highPrivilege !== true) issues.push('Tavern Helper iframe 必须明确 highPrivilege=true 并完成安全审计');
  if (mode === 'tavern_helper_message_iframe') {
    if (carrier.container !== 'div.TH-render') issues.push('消息前端 container 必须是 div.TH-render');
    if (carrier.sourceDetection !== 'pre_isFrontend') issues.push('消息前端必须使用 pre/isFrontend 识别路线');
    if (carrier.iframeIdTemplate !== 'TH-message--{message_id}--{index}') issues.push('消息前端 iframe ID 模板必须锁定为 TH-message--{message_id}--{index}');
    if (carrier.heightProtocol !== 'TH_UPDATE_VIEWPORT_HEIGHT') issues.push('消息前端必须声明 TH_UPDATE_VIEWPORT_HEIGHT 高度协议');
    requireIncludes(carrier.lifecycle, [...MESSAGE_LIFECYCLE], issues, '消息前端 lifecycle');
    if (!['disabled','enabled'].includes(carrier.streaming)) issues.push('消息前端必须明确 streaming=disabled/enabled');
    if (carrier.streaming === 'enabled' && !carrier.streamingFixture) issues.push('启用 streaming 时必须提供 streamingFixture');
    if (carrier.capabilityProbe !== true) issues.push('消息 iframe 必须声明 parent/TavernHelper/Mvu 能力探测');
  } else if (mode === 'tavern_helper_script_iframe') {
    if (carrier.sourceDetection !== 'script_folder') issues.push('脚本 iframe 必须声明 script_folder 载体');
    requireIncludes(carrier.lifecycle, [...SCRIPT_LIFECYCLE], issues, '脚本 iframe lifecycle');
    if (!carrier.capabilityProbe) issues.push('脚本 iframe 必须声明宿主能力探测');
  } else if (mode === 'stpt_ejs_iframe') {
    if (activeStage !== 'ejs' && activeStage !== 'runtime_bridge') issues.push('STPT EJS iframe 只能由 EJS/bridge 阶段声明，不能冒充 Tavern Helper 消息前端');
    if (carrier.messageCarrier === true) issues.push('STPT EJS iframe 不得声明为 Tavern Helper message carrier');
    if (!carrier.pagehideCleanup) issues.push('STPT EJS iframe 必须声明 pagehide 清理');
  }
  return { ok: issues.length === 0, issues };
}

export function validateFrontendManifest(frontend, { activeStage = null, requireRuntime = false, requireArtifacts = false, root, interview, bindingResults = [], checkSteps = [] } = {}) {
  const issues = [];
  if (!object(frontend)) return { ok: false, issues: ['缺少 frontend manifest：' + activeStage] };
  const routes = Array.isArray(frontend.routes) ? frontend.routes : [];
  const carriers = routes.length ? routes.map(r => r.carrier) : [frontend.carrier];
  for (const carrier of carriers) issues.push(...validateTavernHelperCarrier(carrier, { activeStage }).issues);
  if (!frontend.fallbackContract) issues.push('前端缺少失败/空态回退合同');
  // Implementing a page cannot require a real-host pass before it exists. Strong runtime claims still require it.
  if (requireRuntime && (!frontend.runtimeRegression || frontend.runtimeRegression.status !== 'passed' || frontend.runtimeRegression.level !== 'real-sillytavern')) issues.push('前端缺少已通过的真实宿主回归：' + activeStage);
  if (requireArtifacts) {
    if (frontend.status !== 'implemented') issues.push('最终前端仍处于计划/未实现状态：' + activeStage);
    if (!routes.length) issues.push('最终前端必须明确各条实际运行路线');
    if (!frontend.prototype || !['static', 'browser-fixture', 'real-sillytavern'].includes(frontend.prototype.level) || !['passed', 'not_run'].includes(frontend.prototype.status)) issues.push('缺少最小载体原型的检查边界');
    let cases = [];
    try {
      requireArea(frontend.browserFixtures, CHECK_DIR, '前端浏览器用例');
      const fixtures = JSON.parse(fs.readFileSync(resolveProjectPath(root, frontend.browserFixtures), 'utf8'));
      issues.push(...validateBrowserCases(fixtures).issues); cases = fixtures.cases ?? [];
    } catch (e) { issues.push(e.message); }
    const routeIds = new Set();
    const surfaces = interview?.surfaces ?? [];
    const measured = checkSteps.flatMap(s => s.payload?.level === 'browser-fixture' && s.ok ? s.payload.results ?? [] : []);
    for (const route of routes) {
      if (!route.id || routeIds.has(route.id) || !['primary', 'fallback'].includes(route.role)) issues.push('前端 route 缺少唯一 id 或 primary/fallback 角色'); routeIds.add(route.id);
      const bound = bindingResults.filter(b => b.component === activeStage && b.route === route.id && b.ok);
      if (!bound.length) issues.push('前端路线未绑定实际导入内容：' + route.id);
      if (!Array.isArray(route.surfaceIds) || !route.surfaceIds.length || route.surfaceIds.some(id => !surfaces.some(s => s.id === id))) issues.push('前端路线未对应具体页面访谈：' + route.id);
      const ownCases = cases.filter(c => c.route === route.id);
      if (!['static', 'host'].includes(route.dataSource)) issues.push('前端路线必须明确 dataSource:static/host：' + route.id);
      for (const scenario of ['load', ...(route.dataSource === 'host' ? ['provider_delayed','snapshot_missing'] : []), 'after_render','reload','pagehide', ...(activeStage === 'message_frontend' ? ['swipe','edit'] : [])]) {
        if (!ownCases.some(c => c.scenario === scenario)) issues.push('缺少独立路线用例：' + route.id + '.' + scenario);
      }
      const fields = surfaces.filter(s => route.surfaceIds?.includes(s.id)).flatMap(s => (s.fields ?? []).map(f => ({ ...f, surfaceId: s.id })));
      for (const field of fields) if (!ownCases.some(c => c.surfaceId === field.surfaceId && c.steps?.some(s => s.expect && s.fieldId === field.id))) issues.push('页面字段缺少实际显示结果断言：' + route.id + '.' + field.id);
      const actions = surfaces.filter(s => route.surfaceIds?.includes(s.id)).flatMap(s => (s.actions ?? []).map(a => ({ ...a, surfaceId: s.id })));
      for (const action of actions) for (const scenario of ['initial', 'after_render']) if (!ownCases.some(c => c.surfaceId === action.surfaceId && c.actionId === action.id && c.scenario === scenario)) issues.push('操作必须在首次显示和重画后分别验证：' + route.id + '.' + action.id + '.' + scenario);
      for (const c of ownCases) {
        if (!route.surfaceIds?.includes(c.surfaceId)) issues.push('用例指向其它页面：' + c.id);
        const b = bound.find(b => b.id === c.binding);
        const actual = measured.find(m => m.id === c.id && m.route === c.route && m.surfaceId === c.surfaceId && m.binding === c.binding && m.ok === true && m.targetSha256 === b?.targetSha256);
        if (!b || !actual) issues.push('没有针对当前精确导入内容的浏览器操作结果：' + c.id);
      }
      if (requireRuntime) {
        const runtime = route.runtimeRegression;
        if (runtime?.status !== 'passed' || runtime?.level !== 'real-sillytavern' || !runtime.evidenceFile) issues.push('主路/兜底必须分别有真实宿主证据：' + route.id);
        else {
          try { requireArea(runtime.evidenceFile, '制作文件', '宿主证据'); resolveProjectPath(root, runtime.evidenceFile); } catch (e) { issues.push(e.message); }
          for (const c of ownCases) if (!runtime.cases?.some(r => r.id === c.id && r.status === 'passed' && r.targetSha256 === bound.find(b => b.id === c.binding)?.targetSha256)) issues.push('宿主回归没有覆盖当前导入内容的操作：' + c.id);
        }
      }
    }
    if (routes.length && routes.filter(r => r.role === 'primary').length !== 1) issues.push('每个前端必须恰好声明一个实际主路');
    for (const surface of surfaces) if (!routes.some(r => r.surfaceIds?.includes(surface.id))) issues.push('已访谈页面未进入运行路线：' + surface.id);
    for (const c of cases) if (!routeIds.has(c.route)) issues.push('浏览器用例指向未声明路线：' + c.route);
  }
  return { ok: issues.length === 0, issues };
}
