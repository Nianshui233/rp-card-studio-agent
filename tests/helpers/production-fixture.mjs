import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProductionManifest } from '../../scripts/production/production-manifest.mjs';
import { createStageLedger } from '../../scripts/continuation/stage-ledger.mjs';
import { textHash } from '../../scripts/production/artifact-bindings.mjs';

export function fixture(t) {
  const base = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(base, 'rp-verification-'));
  const exact = fs.realpathSync(root);
  const remove = () => { if (!fs.existsSync(root)) return; if (fs.realpathSync(root) !== exact || path.dirname(exact) !== base || !path.basename(exact).startsWith('rp-verification-')) throw Error('拒绝清理未经核对的目录'); fs.rmSync(exact, { recursive: true, force: true }); };
  t?.after(remove);
  const write = (relative, value) => { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
  write('制作文件/创作源/core.txt', 'canonical');
  write('导入包/A.世界书.json', { entries: { 1: { uid: 1, content: '<% const a = 1; %>', position: 0, depth: 4, role: null, constant: true, disable: false } } });
  write('制作文件/项目记录/交付清单.json', { schema: 'rp-card-studio/active-route/v1', activeRoute: 'main', components: { worldbook: { path: 'A.世界书.json' } }, routes: { main: { status: 'active', components: { worldbook: { path: 'A.世界书.json' } } } } });
  const manifest = createProductionManifest({ projectId: 'fixture', title: '技术夹具' });
  manifest.worldbook.routingContract = '制作文件/项目记录/worldbook-routing.json';
  write(manifest.worldbook.routingContract, { schema: 'rp-card-studio/worldbook-routing/v1', versionPin: 'technical-fixture', fixtures: '制作文件/检查/worldbook-routing.fixtures.json', books: [{ id: 'main', artifact: 'A.世界书.json', policies: { body: { purpose: 'turn_instruction', activation: 'constant', placement: { position: 0 } } }, assignments: [{ entryId: 1, policy: 'body' }], runtime: { status: 'not_run' } }] });
  write('制作文件/检查/worldbook-routing.fixtures.json', { schema: 'rp-card-studio/worldbook-routing-fixtures/v1', fixtures: [{ id: 'main-before', bookId: 'main', activatedEntryIds: [1], expected: [{ entryId: '1', area: 'worldInfoBefore' }] }] });
  const ledger = createStageLedger();
  const saveLedger = () => { write('制作文件/项目记录/authority.md', '---\ncurrent_stage: preflight\n---\n\n## 阶段账本\n\n```json\n' + JSON.stringify(ledger) + '\n```\n'); write('制作文件/项目记录/NEXT.md', ''); };
  saveLedger();
  return { root, write, remove, manifest, ledger, saveLedger };
}
export function interviewFixture(profile, profiles) {
  const decision = { id: 'D-1', stage: profile, text: '用户选定的页面方案', sourceKind: 'material_fact', materialSource: 'fixture-source' };
  const refs = [{ id: decision.id, textSha256: textHash(decision.text) }];
  const choice = value => ({ value, decisionRefs: refs });
  return { ledger: { decisions: [decision] }, interview: {
    status: 'covered', profile,
    coverage: Object.fromEntries(Object.entries(profiles[profile]).map(([id, depth]) => [id, { depth, status: 'confirmed', sourceKind: 'material_fact', evidence: decision.text, decisionRefs: refs }])),
    surfaces: [{ id: 'main', layout: choice('单页分区'), visual: choice('图形与文字结合'), emptyState: choice('没有资料时不编造'), failureState: choice('显示可重试提示'), fields: [{ id: 'name', source: 'canonical.name', representation: '文字', decisionRefs: refs }], actions: [{ id: 'open', trigger: '点击详情', outcome: '打开资料', failure: '说明无法读取', decisionRefs: refs }] }],
  } };
}
