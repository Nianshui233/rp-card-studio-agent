import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderLayoutPreview, inspectLayoutBlocks } from '../scripts/frontend/preview-layout.mjs';
import { validateSurfaceDetails } from '../scripts/production/interview-coverage.mjs';
import { createRouteLock } from '../scripts/continuation/route-lock.mjs';
import { fixture, interviewFixture } from './helpers/production-fixture.mjs';
import { INTERVIEW_PROFILES } from '../scripts/production/interview-coverage.mjs';
import { runBrowserCases, FRONTEND_PREVIEW_DIR } from '../scripts/frontend/run-browser-fixtures.mjs';
import { textHash } from '../scripts/production/artifact-bindings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function surface() {
  return { id: 'main', label: '技术页面', layout: { value: '顶部信息、两个分区、折叠与详情', blocks: [
    { kind: 'section', label: '常驻区', blocks: [{ kind: 'field', field: 'header' }] },
    { kind: 'tabs', id: 'pages', label: '内容分区', selected: 'form', items: [
      { id: 'form', label: '当前资料', blocks: [{ kind: 'field', field: 'name' },
        { kind: 'fold', id: 'items', label: '补充内容', blocks: [{ kind: 'field', field: 'item' }] },
        { kind: 'action', action: 'next' }, { kind: 'action', action: 'inspect' },
        { kind: 'dialog', id: 'details', label: '详细资料', action: 'inspect', blocks: [{ kind: 'field', field: 'detail' }] }] },
      { id: 'other', label: '另一分区', blocks: [{ kind: 'note', text: '此处内容待定' }, { kind: 'field', field: 'header' }] }
    ] }
  ] }, visual: { value: '视觉尚待实现' }, emptyState: { value: '没有资料时不编造' }, failureState: { value: '提供重试提示' },
    fields: [
      { id: 'header', label: '概要', source: 'mock.header', representation: '文字' },
      { id: 'name', label: '名称', source: 'mock.name', representation: '输入框' },
      { id: 'item', label: '条目', source: 'mock.item', representation: '列表', example: '演示值' },
      { id: 'detail', label: '详细信息', source: 'mock.detail', representation: '文字' }
    ], actions: [
      { id: 'next', label: '下一步', trigger: '点击', outcome: '显示下一页', failure: '留在原页', visualState: true },
      { id: 'inspect', label: '查看详情', trigger: '点击', outcome: '展开详细资料', failure: '提示无法读取', visualState: true }
    ] };
}

test('quick preview shows current content, controls, fold and popup affordances without claiming runtime or user acceptance', () => {
  const input = surface(), before = JSON.stringify(input), result = renderLayoutPreview(input);
  assert.match(result.text, /常驻区/); assert.match(result.text, /\[当前\] 当前资料/); assert.match(result.text, /名称：\[输入框/);
  assert.match(result.text, /总体排列：顶部信息、两个分区、折叠与详情/);
  assert.match(result.text, /补充内容（收起）/); assert.match(result.text, /点击「查看详情」后打开/);
  assert.doesNotMatch(result.text, /演示值|mock\.name|详细信息：/);
  assert.equal(result.level, 'layout-draft'); assert.equal(result.runtime, 'not_run'); assert.equal(result.userReview, 'not_recorded');
  assert.equal(JSON.stringify(input), before);
});
test('expanded and dialog states reveal their real declared fields, not a generic empty panel', () => {
  const expanded = renderLayoutPreview(surface(), { expand: ['items'], dialog: ['details'] });
  assert.match(expanded.text, /补充内容（展开）/); assert.match(expanded.text, /示例：演示值/); assert.match(expanded.text, /详情窗口展开/); assert.match(expanded.text, /详细信息：/);
  const switched = renderLayoutPreview(surface(), { tab: { pages: 'other' } });
  assert.match(switched.text, /\[当前\] 另一分区/); assert.doesNotMatch(switched.text, /名称：/);
  assert.throws(() => renderLayoutPreview(surface(), { tab: { pages: 'other' }, dialog: ['details'] }), /未显示的标签/);
});
test('fields and actions are derived from current records and updating them invalidates the preview source digest', () => {
  const input = surface(), old = renderLayoutPreview(input);
  input.fields.find(f => f.id === 'name').label = '新名称'; input.actions[0].outcome = '新的下一步结果';
  const current = renderLayoutPreview(input);
  assert.match(current.text, /新名称：/); assert.match(current.text, /新的下一步结果/); assert.notEqual(current.sourceSha256, old.sourceSha256);
});
test('layout refuses dangling references, missing details and invalid interactive targets', () => {
  const input = surface(); input.fields.push({ id: 'missing', label: '遗漏字段' });
  assert.match(inspectLayoutBlocks(input).issues.join(' '), /遗漏已声明字段/);
  assert.throws(() => renderLayoutPreview(surface(), { tab: { pages: 'not-a-tab' } }), /不存在的标签/);
  assert.throws(() => renderLayoutPreview(surface(), { expand: ['not-a-fold'] }), /不在当前布局/);
  const broken = surface(); broken.layout.blocks[0].blocks[0].field = 'fake';
  assert.match(inspectLayoutBlocks(broken).issues.join(' '), /不存在的字段/);
  const duplicate = surface(); duplicate.fields.push({ ...duplicate.fields[0] });
  assert.throws(() => renderLayoutPreview(duplicate), /id 重复/);
});
test('malformed and cyclic layout records fail explicitly instead of recursing forever', () => {
  const input = surface(); input.layout.blocks[0].blocks.push(input.layout.blocks[0]);
  assert.match(inspectLayoutBlocks(input).issues.join(' '), /循环引用/);
  const bad = surface(); bad.layout.blocks[1].items = {};
  assert.equal(inspectLayoutBlocks(bad).ok, false);
  const nullField = surface(); nullField.fields.push(null); assert.equal(inspectLayoutBlocks(nullField).ok, false);
});
test('legacy records remain readable but an unplaced field list cannot masquerade as an agreed layout', () => {
  const input = surface(); delete input.layout.blocks;
  const result = renderLayoutPreview(input); assert.match(result.text, /内容位置尚未展开/); assert.match(result.text, /名称：/);
});
test('untrusted names cannot escape the text fence, and source paths are not presented as player-facing labels', () => {
  const input = surface(); input.fields[1].label = '名称\n```\n外部说明';
  const result = renderLayoutPreview(input); assert.equal((result.text.match(/```/g) ?? []).length, 2);
  delete input.fields[1].label; assert.match(renderLayoutPreview(input).text, /名称待定/);
  assert.doesNotMatch(renderLayoutPreview(input).text, /mock\.name/);
});
test('layout nodes participate in the existing page gate without adding another authorization authority', () => {
  const { interview, ledger } = interviewFixture('opening_frontend', INTERVIEW_PROFILES), input = interview.surfaces[0];
  input.layout.blocks = [{ kind: 'field', field: 'name' }, { kind: 'action', action: 'open' }];
  assert.deepEqual(validateSurfaceDetails([input], { ledger }), []);
  input.layout.blocks.pop(); assert.match(validateSurfaceDetails([input], { ledger }).join(' '), /遗漏已声明操作/);
  for (const stage of ['opening_frontend', 'message_frontend', 'qa_delivery']) {
    const lock = createRouteLock(root, stage); assert.ok(lock.requiredFiles.includes('shared/frontend/layout-preview.md')); assert.ok(lock.requiredFiles.includes('scripts/frontend/preview-layout.mjs'));
  }
});
test('preview CLI reads current production records, supports states and never rewrites the project', t => {
  const f = fixture(t), record = { interviews: { message_frontend: { surfaces: [surface()] } } };
  f.write('制作文件/项目记录/production.json', record);
  const file = path.join(f.root, '制作文件/项目记录/production.json'), before = fs.readFileSync(file);
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/frontend/preview-layout.mjs'), '--root', f.root, '--stage', 'message_frontend', '--surface', 'main', ...args], { encoding: 'utf8' });
  const result = run('--expand', 'items', '--dialog', 'details', '--json'); assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).results[0].text, /详细信息：/); assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(run('--tab', 'pages=missing').status, 1);
  assert.equal(run('--dialog').status, 1);
});

test('browser preview refuses unknown capture targets before any browser or filesystem operation', async () => {
  const cases = [{ id: 'current', route: 'main', binding: 'b', surfaceId: 'main', surface: 'message_iframe', decodeEntities: 'none', steps: [{ expect: 'text', selector: '#out', value: 'ready' }] }];
  let called = false;
  const result = await runBrowserCases({ root: 'unused', fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases }, bindings: [], browser: { newContext() { called = true; } }, captureIds: ['removed-case'] });
  assert.equal(result.ok, false); assert.equal(called, false); assert.match(result.issues.join(' '), /当前实际浏览器用例/);
  assert.equal(result.runtime, 'not_run');
});

test('capture cleanup removes only indexed unchanged images and preserves unrelated user files', async t => {
  const f = fixture(t), name = FRONTEND_PREVIEW_DIR + '/preview-' + textHash('old').slice(0, 16) + '.png';
  f.write(name, 'controlled-old-capture'); f.write(FRONTEND_PREVIEW_DIR + '/user-image.png', 'user-owned');
  f.write(FRONTEND_PREVIEW_DIR + '/current.json', { schema: 'rp-card-studio/frontend-preview/v1', images: [{ path: name, sha256: textHash('controlled-old-capture') }] });
  const cases = [{ id: 'new', route: 'main', binding: 'missing-binding', surfaceId: 'main', surface: 'message_iframe', decodeEntities: 'none', steps: [{ expect: 'text', selector: '#out', value: 'ready' }] }];
  const result = await runBrowserCases({ root: f.root, fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases }, bindings: [], browser: {}, captureIds: ['new'] });
  assert.equal(result.ok, false); assert.equal(fs.existsSync(path.join(f.root, name)), false);
  assert.equal(fs.readFileSync(path.join(f.root, FRONTEND_PREVIEW_DIR, 'user-image.png'), 'utf8'), 'user-owned');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, FRONTEND_PREVIEW_DIR, 'current.json'))).images, []);
});
test('user-modified same-name image cannot be overwritten or used as a fresh screenshot', async t => {
  const f = fixture(t), name = FRONTEND_PREVIEW_DIR + '/preview-' + textHash('current').slice(0, 16) + '.png';
  f.write(name, 'user-edited');
  f.write(FRONTEND_PREVIEW_DIR + '/current.json', { schema: 'rp-card-studio/frontend-preview/v1', images: [{ path: name, sha256: textHash('old-capture') }] });
  const cases = [{ id: 'current', route: 'main', binding: 'b', surfaceId: 'main', surface: 'message_iframe', decodeEntities: 'none', steps: [{ expect: 'text', selector: '#out', value: 'ready' }] }];
  await assert.rejects(() => runBrowserCases({ root: f.root, fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases }, bindings: [], browser: {}, captureIds: ['current'] }), /外部修改/);
  assert.equal(fs.readFileSync(path.join(f.root, name), 'utf8'), 'user-edited');
});

test('a linked preview directory cannot redirect cleanup into canonical source files', async t => {
  const f = fixture(t), relative = '制作文件/创作源/preview-' + textHash('current').slice(0, 16) + '.png';
  f.write(relative, 'canonical-source');
  const link = path.join(f.root, FRONTEND_PREVIEW_DIR); fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(path.join(f.root, '制作文件/创作源'), link, process.platform === 'win32' ? 'junction' : 'dir');
  const cases = [{ id: 'current', route: 'main', binding: 'b', surfaceId: 'main', surface: 'message_iframe', decodeEntities: 'none', steps: [{ expect: 'text', selector: '#out', value: 'ready' }] }];
  await assert.rejects(() => runBrowserCases({ root: f.root, fixtures: { schema: 'rp-card-studio/frontend-fixtures/v1', cases }, bindings: [], browser: {}, captureIds: ['current'] }), /目录经过链接/);
  assert.equal(fs.readFileSync(path.join(f.root, relative), 'utf8'), 'canonical-source');
});
