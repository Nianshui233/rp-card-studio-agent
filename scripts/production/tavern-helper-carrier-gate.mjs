import { validateActiveRouteManifest } from '../delivery/active-route.mjs';

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

export function validateFrontendManifest(frontend, { activeStage = null } = {}) {
  const issues = [];
  if (!object(frontend)) return { ok: false, issues: ['当前前端阶段缺少 frontend manifest'] };
  const carrier = validateTavernHelperCarrier(frontend.carrier, { activeStage });
  issues.push(...carrier.issues);
  if (!frontend.runtimeRegression || frontend.runtimeRegression.status !== 'passed') issues.push('前端缺少已通过的真实宿主回归');
  if (!frontend.fallbackContract) issues.push('前端缺少失败/空态回退合同');
  return { ok: issues.length === 0, issues, carrier };
}
