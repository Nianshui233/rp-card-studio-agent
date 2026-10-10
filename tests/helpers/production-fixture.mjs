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
  const write = (relative, value) => { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2)); };
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
    ...(['opening_frontend', 'message_frontend'].includes(profile) ? { design: frontendDesignFixture(profile, refs) } : {}),
    coverage: Object.fromEntries(Object.entries(profiles[profile]).map(([id, depth]) => [id, { depth, status: 'confirmed', sourceKind: 'material_fact', evidence: decision.text, decisionRefs: refs }])),
    surfaces: [{ id: 'main', layout: choice('单页分区'), visual: choice('图形与文字结合'), emptyState: choice('没有资料时不编造'), failureState: choice('显示可重试提示'), fields: [{ id: 'name', source: 'canonical.name', representation: '文字', decisionRefs: refs }], actions: [{ id: 'open', trigger: '点击详情', outcome: '打开资料', failure: '说明无法读取', visualState: true, decisionRefs: refs }] }],
  } };
}

export function frontendDesignFixture(stage, refs) {
  const basis = { scope: 'new', directionRefs: refs,
    research: { status: 'reviewed', references: [{ id: 'fixture-layout', kind: 'user_reference', locator: 'fixture-source', checkedAt: '2026-10-11', observation: '技术夹具包含摘要与资料详情两层', application: '仅核对该夹具的层级和详情操作' }] },
    feedback: { status: 'none' } };
  return stage === 'opening_frontend' ? { ...basis, schema: 'rp-card-studio/opening-design/v1', boundary: 'page_local',
    entryPlan: { worldIntroduction: { mode: 'included', approach: '一段真实资料摘要', surfaceIds: ['main'] }, playGuide: { mode: 'included', approach: '说明详情入口', surfaceIds: ['main'] }, characterCreation: { mode: 'omitted', reason: '夹具只测试信息页' } },
    artDirection: { composition: '单页摘要与详情', typography: '标题与正文分别设置字号', colorRoles: '正文与动作分色', imagery: '不需要图像，测试文本操作', motion: '不使用动画' },
    pageFlow: { orientation: '先读摘要', navigation: '打开详情后可以返回', creation: '不包含创角', completion: '只结束页面内查看，不写宿主' }
  } : { ...basis, schema: 'rp-card-studio/message-design/v1',
    playPlan: { frequentTasks: ['阅读摘要', '打开详情'], priority: '先显示当前事实', readingRhythm: '摘要常驻详情按需', actionSemantics: '打开详情只改变本地视图', snapshotScope: '当前消息测试快照' },
    visualDirection: { composition: '摘要行和详情层', typography: '标题与正文分别设置字号', colorRoles: '选中与错误分色', semanticGraphics: '此夹具不需要语义图形', interactionStates: '打开与收起明确区分' },
    comfortPlan: { density: '摘要不重复详情', longContent: '长内容正常换行', changeFeedback: '更新不抢焦点', repeatUse: '保持当前展开位置', mobile: '窄屏改为单列且主要入口不隐藏' }
  };
}

export function designReviewFixture(stage, design, caseIds) {
  const ids = stage === 'opening_frontend' ? ['worldPresentation', 'guideComprehension', 'creationFlow', 'visualExecution'] : ['readingPriority', 'actionClarity', 'longSessionComfort', 'visualExecution'];
  return { schema: 'rp-card-studio/frontend-design-review/v1', stage, status: 'reviewed', designSha256: textHash(JSON.stringify(design)), caseIds,
    observations: Object.fromEntries(ids.map(id => [id, { result: id === 'creationFlow' && design.entryPlan.characterCreation.mode === 'omitted' ? 'not_applicable' : 'pass', observation: id + '：检查技术夹具的实际摘要、详情和换行；不代表作品审美或用户接受' }])) };
}
