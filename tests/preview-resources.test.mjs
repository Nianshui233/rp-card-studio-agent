import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers/production-fixture.mjs';
import { textHash } from '../scripts/production/artifact-bindings.mjs';
import { validatePreviewResources, loadPreviewResources, blockedResourceLabel } from '../scripts/frontend/preview-resources.mjs';
import { validateBrowserCases } from '../scripts/frontend/run-browser-fixtures.mjs';

const resource = (body = 'body{color:#123456}') => ({ url: 'https://assets.example.test/style.css', path: '制作文件/检查/资源/style.css', sha256: textHash(body), contentType: 'text/css' });
test('real resource bytes are replayed under their original URL without rewriting source or contacting services', t => {
  const f = fixture(t), body = 'body{color:#123456}', spec = resource(body); f.write(spec.path, body);
  const before = fs.readFileSync(path.join(f.root, spec.path));
  const actual = loadPreviewResources(f.root, [spec]);
  assert.deepEqual(actual.get(spec.url).body, before);
  assert.deepEqual(fs.readFileSync(path.join(f.root, spec.path)), before);
  f.write(spec.path, 'changed'); assert.throws(() => loadPreviewResources(f.root, [spec]), /已变化/);
});
test('resource mappings reject missing hashes, invalid MIME, duplicate URLs and source-directory substitutions', () => {
  for (const values of [[{ ...resource(), sha256: '' }], [{ ...resource(), contentType: '' }], [resource(), resource()], [{ ...resource(), url: 'file:///secret' }], [{ ...resource(), path: '制作文件/创作源/core.txt' }], [{ ...resource(), url: 'https://name:password@assets.example.test/x' }]]) assert.equal(validatePreviewResources(values).ok, false);
  assert.equal(validatePreviewResources({}).ok, false);
  assert.equal(validatePreviewResources([]).ok, true);
});
test('resource and failure-mode declarations are validated before browser execution', () => {
  const c = { id: 'a', route: 'main', binding: 'a', surfaceId: 'main', surface: 'message_iframe', decodeEntities: 'none', steps: [{ expect: 'text', selector: '#out', value: 'ready' }] };
  assert.equal(validateBrowserCases({ schema: 'rp-card-studio/frontend-fixtures/v1', cases: [c] }).ok, true);
  c.resources = [{ ...resource(), sha256: 'unverified' }];
  assert.equal(validateBrowserCases({ schema: 'rp-card-studio/frontend-fixtures/v1', cases: [c] }).ok, false);
  delete c.resources; c.previewKind = 'resource_failure';
  assert.equal(validateBrowserCases({ schema: 'rp-card-studio/frontend-fixtures/v1', cases: [c] }).ok, true);
  c.previewKind = 'real-sillytavern';
  assert.equal(validateBrowserCases({ schema: 'rp-card-studio/frontend-fixtures/v1', cases: [c] }).ok, false);
});
test('unmapped request diagnostics never persist query strings or credentials', () => {
  const label = blockedResourceLabel('https://example.test/private/path?token=secret', 'image');
  assert.equal(label, 'https://example.test [image]');
  assert.doesNotMatch(label, /secret|private|token/);
});
