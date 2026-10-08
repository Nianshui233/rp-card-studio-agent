import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActiveRouteManifest } from '../scripts/delivery/active-route.mjs';
import { scanRpFacingFiles } from '../scripts/delivery/artifact-purity-lint.mjs';

test('active route manifest allows one route and keeps superseded files outside delivery', () => {
  const manifest = {
    schema: 'rp-card-studio/active-route/v1', activeRoute: 'route-2',
    routes: {
      'route-2': { status: 'active', components: { card: { path: 'card.json', layer: 'creative' } } },
      'route-1': { status: 'superseded', components: { card: { path: '.internal/history/route-1/card.json' } } }
    },
    components: { card: 'card.json' }
  };
  assert.equal(validateActiveRouteManifest(manifest, 'D:/delivery', { requireFiles: false }).ok, true);
  const duplicate = { ...manifest, routes: { ...manifest.routes, 'route-3': { status: 'active', components: { card: 'other.json' } } } };
  assert.match(validateActiveRouteManifest(duplicate, 'D:/delivery', { requireFiles: false }).issues.join('\n'), /恰好有一个/);
});

test('active route rejects superseded files left in delivery and component drift', () => {
  const manifest = {
    schema: 'rp-card-studio/active-route/v1', activeRoute: 'route-2',
    routes: {
      'route-2': { status: 'active', components: { card: 'card.json' } },
      'route-1': { status: 'superseded', components: { card: 'old-card.json' } }
    }, components: { card: 'wrong.json' }
  };
  const result = validateActiveRouteManifest(manifest, 'D:/delivery', { requireFiles: false });
  assert.match(result.issues.join('\n'), /components 与 active route/);
  assert.match(result.issues.join('\n'), /superseded route 仍在交付目录/);
});

test('RP-facing purity lint rejects maintenance pollution but allows clean content', () => {
  assert.deepEqual(scanRpFacingFiles([{ path: 'opening.html', text: '<h1>天玄录</h1><p>进入山门。</p>' }]), []);
  const findings = scanRpFacingFiles([{ path: 'opening.html', text: '<p>请导入世界书后启用 Regex。runtime: not_run</p>' }]);
  assert.deepEqual(findings.map(item => item.rule).sort(), ['maintenance_instruction', 'runtime_not_run']);
});
