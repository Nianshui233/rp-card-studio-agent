import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTavernHelperCarrier, validateFrontendManifest } from '../scripts/production/tavern-helper-carrier-gate.mjs';

const messageCarrier = {
  mode: 'tavern_helper_message_iframe', versionPin: 'JS-Slash-Runner@4.11.3', highPrivilege: true,
  container: 'div.TH-render', sourceDetection: 'pre_isFrontend', iframeIdTemplate: 'TH-message--{message_id}--{index}',
  heightProtocol: 'TH_UPDATE_VIEWPORT_HEIGHT', lifecycle: ['render_started','load','swipe','edit','reload','delete','pagehide'],
  streaming: 'disabled', capabilityProbe: true
};

test('Tavern Helper message carrier is explicit and lifecycle-complete', () => {
  assert.equal(validateTavernHelperCarrier(messageCarrier, { activeStage: 'message_frontend' }).ok, true);
  assert.equal(validateFrontendManifest({ carrier: messageCarrier, runtimeRegression: { status: 'passed' }, fallbackContract: 'static empty state' }, { activeStage: 'message_frontend' }).ok, true);
});

test('generic HTML and STPT iframe cannot pass as Tavern Helper message carrier', () => {
  const result = validateTavernHelperCarrier({ mode: 'stpt_ejs_iframe', versionPin: 'STPT@1.17.9', highPrivilege: true, pagehideCleanup: true }, { activeStage: 'message_frontend' });
  assert.match(result.issues.join('\n'), /只能由 EJS/);
});

test('streaming requires its own fixture', () => {
  const result = validateTavernHelperCarrier({ ...messageCarrier, streaming: 'enabled' }, { activeStage: 'message_frontend' });
  assert.match(result.issues.join('\n'), /streamingFixture/);
});
