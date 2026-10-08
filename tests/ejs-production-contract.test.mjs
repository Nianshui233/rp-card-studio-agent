import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEjsCompleteness, REQUIRED_EJS_COMPONENTS } from '../scripts/production/ejs-completeness-gate.mjs';

test('EJS production gate requires execution, scope, settings, fallback, fixtures, and host regression contracts', () => {
  const bad = validateEjsCompleteness({ enabled: true, mode: 'worldbook_template', executionStages: ['preparation'], contract: {}, components: {} });
  assert.match(bad.issues.join('\n'), /runtime_settings/);
  assert.match(bad.issues.join('\n'), /host_regression/);
});

test('EJS production gate rejects getwi, iframe, preprocessing, and MVU bridge without conditional contracts', () => {
  const components = Object.fromEntries(REQUIRED_EJS_COMPONENTS.map(id => [id, { status: 'passed', path: `配置/EJS/${id}` }]));
  const result = validateEjsCompleteness({
    enabled: true, mode: 'worldbook_template', executionStages: ['preparation'],
    contract: { enabled: true, mode: 'worldbook_template', failure: 'static fallback', bridge_mode: 'shared_message_variables', direction: 'mvu_to_ejs_readonly', snapshot: 'current message variables' },
    components, templates: [{ name: 'control', content: '@@preprocessing\n<% const x = getvar(\'stat_data.世界.时间\'); const y = await getwi(\'书\', \'条目\'); %>\n@@iframe' }]
  });
  assert.match(result.issues.join('\n'), /getwi_contract/);
  assert.match(result.issues.join('\n'), /iframe_carrier/);
  assert.match(result.issues.join('\n'), /raw_message_contract/);
  assert.match(result.issues.join('\n'), /mvu_bridge/);
});
