import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from '../../tests/helpers/production-fixture.mjs';
import { placementForPurpose, createRoutedEntry, validateBookRouting, projectSelectedEntries, runRoutingFixtures, validatePromptCapture, routingHash } from './routing.mjs';
import { validateWorldbookProject } from './worldbook-project.mjs';
import { buildLosslessWorldbook } from './split-yaml-lossless.mjs';
import { validateProductionProject } from '../production/production-project.mjs';

const defaultEntry = (id, overrides = {}) => ({ uid: id, content: 'content-' + id, position: 0, depth: 4, role: null, constant: true, disable: false, key: [], ...overrides });
const book = entries => ({ entries: Object.fromEntries(entries.map(e => [e.uid, e])) });
const policy = (purpose, position = 0, activation = 'constant', extra = {}) => ({ purpose, activation, placement: { position, ...(position === 4 ? { depth: 4, role: 0 } : {}) }, ...extra });
const plan = (policies, assignments) => ({ id: 'main', artifact: 'A.世界书.json', policies, assignments, runtime: { status: 'not_run' } });
const entryAssignment = (entryId, policy) => ({ entryId, policy });
const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('responsibility defaults separate stable context and current state, without rewriting content', () => {
  assert.equal(placementForPurpose('world_background').position, 0);
  assert.equal(placementForPurpose('character_profile').position, 1);
  assert.equal(placementForPurpose('scene_reference').position, 1);
  assert.equal(placementForPurpose('stable_rules').position, 1);
  assert.deepEqual(placementForPurpose('current_state'), { position: 4, depth: 0, role: 0 });
  const base = defaultEntry(1); const routed = createRoutedEntry(base, policy('character_profile', 1));
  assert.equal(routed.position, 1); assert.equal(routed.content, base.content); assert.equal(base.position, 0);
  assert.throws(() => createRoutedEntry(base, {}), /职责/);
  assert.throws(() => createRoutedEntry(base, { ...policy('character_profile'), keys: 'bad' }), /关键词/);
});
test('varying depth 3/4/9 does not make blanket chat insertion a legitimate content hierarchy', () => {
  const entries = [defaultEntry(1, { position: 4, depth: 3, role: 0 }), defaultEntry(2, { position: 4, depth: 4, role: 0 }), defaultEntry(3, { position: 4, depth: 9, role: 0 })];
  const policies = Object.fromEntries(entries.map((e,i) => ['p'+i, policy(['world_background','character_profile','scene_reference'][i], 4, 'constant', { placement: { position: 4, depth: e.depth, role: 0 } })]));
  const p = plan(policies, entries.map((e,i) => entryAssignment(e.uid, 'p'+i)));
  const r = validateBookRouting(book(entries), p);
  assert.equal(r.ok, false); assert.match(r.issues.join(' '), /明确例外依据/); assert.equal(r.summary.positionCounts[4], 3);
  assert.deepEqual(projectSelectedEntries(book(entries), p, [1,2,3]).map(r => r.area), ['chatHistory','chatHistory','chatHistory']);
});
test('system/user/assistant changes the in-chat role, not the insertion area', () => {
  const b = book([defaultEntry(1, { position: 4, depth: 1, role: 2 })]);
  const p = plan({ turn: policy('turn_instruction', 4, 'constant', { placement: { position: 4, depth: 1, role: 2 } }) }, [entryAssignment(1,'turn')]);
  assert.equal(validateBookRouting(b,p).ok, true);
  assert.deepEqual(projectSelectedEntries(b,p,[1]), [{ entryId:'1',area:'chatHistory',depth:1,role:2 }]);
});
test('dormant depth in before/after entries does not relocate stable background', () => {
  const b = book([defaultEntry(1,{depth:99,role:1}), defaultEntry(2,{position:1,depth:0,role:2})]);
  const p = plan({ a:policy('world_background'), b:policy('character_profile',1) }, [entryAssignment(1,'a'),entryAssignment(2,'b')]);
  const r = validateBookRouting(b,p); assert.equal(r.ok,true);
  assert.deepEqual(projectSelectedEntries(b,p,[1,2]), [{entryId:'1',area:'worldInfoBefore'},{entryId:'2',area:'worldInfoAfter'}]);
});
test('runtime-only books may legitimately be all at-depth and preserve null-role system defaults', () => {
  const b = book([defaultEntry(1,{position:4,depth:0}),defaultEntry(2,{position:4,depth:1})]);
  const p = plan({ state:policy('current_state',4,'constant',{placement:{position:4,depth:0,role:0}}), turn:policy('turn_instruction',4,'constant',{placement:{position:4,depth:1,role:0}}) },[entryAssignment(1,'state'),entryAssignment(2,'turn')]);
  assert.equal(validateBookRouting(b,p).ok,true);
  p.policies.state.placement.depth=4;
  assert.match(validateBookRouting(b,p).issues.join(' '),/D0\/D1/);
});
test('stable at-depth exceptions require current explicit user decisions, not delegation or approval flags', () => {
  const b=book([defaultEntry(1,{position:4,depth:4,role:0})]);
  const d={id:'D-1',sourceKind:'user_confirmed',text:'明确指定稳定资料放到聊天内部'};
  const p=plan({x:policy('world_background',4,'constant',{exception:{kind:'user_decision',reason:'用户明确要求',decisionRefs:[{id:d.id,textSha256:routingHash(d.text)}]}})},[entryAssignment(1,'x')]);
  assert.equal(validateBookRouting(b,p,{ledger:{decisions:[d]}}).ok,true);
  d.text='已经更正';assert.equal(validateBookRouting(b,p,{ledger:{decisions:[d]}}).ok,false);
  d.sourceKind='delegated';assert.equal(validateBookRouting(b,p,{ledger:{decisions:[d]}}).ok,false);
  p.policies.x.exception={reason:'Agent 觉得好',approved:true};assert.equal(validateBookRouting(b,p).ok,false);
});
test('host-contract exceptions read actual pinned evidence and expire on change', t => {
  const f=fixture(t); const source='制作文件/配置/slot-contract.txt';f.write(source,'target host requires this slot');
  const p=plan({x:policy('world_background',4,'constant',{exception:{kind:'host_contract',reason:'目标插入合同',evidence:{path:source,sha256:routingHash('target host requires this slot')}}})},[entryAssignment(1,'x')]);
  const b=book([defaultEntry(1,{position:4,depth:4,role:0})]);assert.equal(validateBookRouting(b,p,{root:f.root}).ok,true);
  f.write(source,'changed');assert.equal(validateBookRouting(b,p,{root:f.root}).ok,false);
});
test('all actual entries must be assigned once and actual positions must match the plan', () => {
  const b=book([defaultEntry(1),defaultEntry(2)]);const p=plan({x:policy('world_background')},[entryAssignment(1,'x')]);
  assert.match(validateBookRouting(b,p).issues.join(' '),/未分配/);
  p.assignments.push(entryAssignment(2,'x'),entryAssignment(2,'x'));assert.match(validateBookRouting(b,p).issues.join(' '),/重复/);
  p.assignments.pop();b.entries[2].position=1;assert.match(validateBookRouting(b,p).issues.join(' '),/位置与策略不同/);
});
test('activation is checked independently of insertion; pull and disabled entries are not native context', () => {
  const b=book([defaultEntry(1,{constant:false,key:['place']}),defaultEntry(2,{disable:true,constant:false})]);
  const p=plan({x:policy('scene_reference',0,'keyword'),y:policy('template_source',0,'pull',{consumer:'EJS getwi'})},[entryAssignment(1,'x'),entryAssignment(2,'y')]);
  assert.equal(validateBookRouting(b,p).ok,true);assert.throws(()=>projectSelectedEntries(b,p,[2]),/禁用/);
  b.entries[1].constant=true;assert.match(validateBookRouting(b,p).issues.join(' '),/常驻覆盖/);
  b.entries[2].disable=false;assert.match(validateBookRouting(b,p).issues.join(' '),/普通扫描/);
});
test('native triggered events retain cooldown boundaries and do not need a universal depth', () => {
  const b=book([defaultEntry(1,{position:4,depth:5,cooldown:2})]);const p=plan({x:policy('immediate_event',4,'constant',{placement:{position:4,depth:5,role:0}})},[entryAssignment(1,'x')]);
  assert.equal(validateBookRouting(b,p).ok,true);b.entries[1].cooldown=0;assert.equal(validateBookRouting(b,p).ok,false);
});
test('outlet route checks its actual target while before/after remain usable defaults', () => {
  const b=book([defaultEntry(1,{position:7,outletName:'scene'})]);const p=plan({x:policy('turn_instruction',7,'constant',{placement:{position:7,outletName:'scene'}})},[entryAssignment(1,'x')]);
  assert.equal(validateBookRouting(b,p).ok,true);b.entries[1].outletName='other';assert.equal(validateBookRouting(b,p).ok,false);
});
test('routing fixtures compare effective areas, tolerate object-key ordering and cover all native-enabled entries', () => {
  const b=book([defaultEntry(1),defaultEntry(2,{position:1})]);const p=plan({x:policy('world_background'),y:policy('character_profile',1)},[entryAssignment(1,'x'),entryAssignment(2,'y')]);
  const c={books:[p]},d={schema:'rp-card-studio/worldbook-routing-fixtures/v1',fixtures:[{id:'a',bookId:'main',activatedEntryIds:[1,2],expected:[{area:'worldInfoBefore',entryId:1},{area:'worldInfoAfter',entryId:2}]}]};
  assert.equal(runRoutingFixtures(d,new Map([['main',b]]),c).ok,true);
  d.fixtures[0].expected[1].area='chatHistory';assert.equal(runRoutingFixtures(d,new Map([['main',b]]),c).ok,false);
  d.fixtures[0].activatedEntryIds=[1];d.fixtures[0].expected=[{entryId:1,area:'worldInfoBefore'}];assert.equal(runRoutingFixtures(d,new Map([['main',b]]),c).ok,false);
});
test('lossless creation accepts per-slice policies without changing a single content byte', () => {
  const source='world:\n  fact: full text\ncharacter:\n  name: A\n';
  const result=buildLosslessWorldbook(source,{routing:{world:policy('world_background',0),character:policy('character_profile',1,'keyword',{keys:['A']})}});
  assert.equal(Object.values(result.entries).map(e=>e.content).join(''),source);
  assert.deepEqual(Object.values(result.entries).map(e=>e.position),[0,1]);
  assert.throws(()=>buildLosslessWorldbook(source,{routing:{world:policy('world_background')}}),/没有对应/);
});
test('project gate requires a plan for every actually delivered book, not only an optional activeStage', async t => {
  const f=fixture(t);assert.equal(validateWorldbookProject(f.root,f.manifest.worldbook.routingContract).ok,true);
  const missing=await validateProductionProject({...f.manifest,worldbook:{}},{root:f.root,final:true});assert.equal(missing.ok,false);assert.match(missing.issues.join(' '),/世界书调度合同/);
  f.write('导入包/A.世界书.json',book([defaultEntry(1,{position:4,depth:4})]));assert.equal(validateWorldbookProject(f.root,f.manifest.worldbook.routingContract).ok,false);
  const cli=spawnSync(process.execPath,[path.join(agentRoot,'scripts/worldbook/worldbook-check.mjs'),'--root',f.root],{encoding:'utf8'});assert.equal(cli.status,1);assert.equal(JSON.parse(cli.stdout).ok,false);
});
test('project discovery cannot ignore an additional standalone or legacy embedded book', t => {
  const f=fixture(t),manifestPath=path.join(f.root,'制作文件/项目记录/交付清单.json');
  const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));m.components.other={path:'B.世界书.json'};m.routes.main.components.other={path:'B.世界书.json'};
  f.write('制作文件/项目记录/交付清单.json',m);f.write('导入包/B.世界书.json',book([defaultEntry(3)]));
  assert.match(validateWorldbookProject(f.root,f.manifest.worldbook.routingContract).issues.join(' '),/未被调度合同覆盖/);
});
test('real-host flags alone cannot substitute for current captured request text and placement', t => {
  const f=fixture(t),b=book([defaultEntry(1)]),p=plan({x:policy('world_background')},[entryAssignment(1,'x')]);
  const requestPath='制作文件/检查/request.json';f.write(requestPath,{messages:[{role:'system',content:'prefix content-1 suffix'}]});
  const promptBytes=fs.readFileSync(path.join(f.root,requestPath));
  const capture={schema:'rp-card-studio/worldbook-prompt-capture/v1',level:'real-sillytavern',bookId:'main',artifactSha256:'artifact',versionPin:'fixture',cases:[{id:'observed',promptFile:requestPath,promptSha256:routingHash(promptBytes),activatedEntryIds:[1],fragments:[{entryId:1,area:'worldInfoBefore',sourceContentSha256:routingHash('content-1'),messageIndex:0,start:7,end:16,renderedContent:'content-1'}]}]};
  const context={root:f.root,artifactSha256:'artifact',versionPin:'fixture'};
  assert.equal(validatePromptCapture(capture,b,p,context).ok,true);
  assert.equal(validatePromptCapture({...capture,cases:[]},b,p,context).ok,false);
  capture.cases[0].fragments[0].area='chatHistory';assert.equal(validatePromptCapture(capture,b,p,context).ok,false);
  capture.cases[0].fragments[0].area='worldInfoBefore';capture.cases[0].fragments[0].renderedContent='prefix';capture.cases[0].fragments[0].start=0;capture.cases[0].fragments[0].end=6;
  assert.match(validatePromptCapture(capture,b,p,context).issues.join(' '),/完整进入请求/);
});
test('capture rejects stale artifact bytes, altered request bytes and mismatched chat roles', t => {
  const f=fixture(t),b=book([defaultEntry(1,{position:4,depth:0,role:0})]),p=plan({x:policy('current_state',4,'constant',{placement:{position:4,depth:0,role:0}})},[entryAssignment(1,'x')]);
  const requestPath='制作文件/检查/request.json';f.write(requestPath,{messages:[{role:'user',content:'content-1'}]});
  const capture={schema:'rp-card-studio/worldbook-prompt-capture/v1',level:'real-sillytavern',bookId:'main',artifactSha256:'a',versionPin:'v',cases:[{id:'x',promptFile:requestPath,promptSha256:routingHash(fs.readFileSync(path.join(f.root,requestPath))),activatedEntryIds:[1],fragments:[{entryId:1,area:'chatHistory',depth:0,role:0,sourceContentSha256:routingHash('content-1'),messageIndex:0,start:0,end:9,renderedContent:'content-1'}]}]};
  const context={root:f.root,artifactSha256:'a',versionPin:'v'};assert.match(validatePromptCapture(capture,b,p,context).issues.join(' '),/API 消息角色/);
  assert.equal(validatePromptCapture(capture,b,p,{...context,artifactSha256:'changed'}).ok,false);
  f.write(requestPath,{messages:[{role:'system',content:'new'}]});assert.match(validatePromptCapture(capture,b,p,context).issues.join(' '),/摘要不同/);
});
test('host_transform routes require an actual unchanged rendering contract', t => {
  const f=fixture(t),b=book([defaultEntry(1)]),p=plan({x:policy('turn_instruction',0,'constant',{rendering:'host_transform'})},[entryAssignment(1,'x')]);
  assert.equal(validateBookRouting(b,p,{root:f.root}).ok,false);
  const relative='制作文件/配置/render.txt';f.write(relative,'macro contract');p.policies.x.renderContract={path:relative,sha256:routingHash('macro contract')};
  assert.equal(validateBookRouting(b,p,{root:f.root}).ok,true);f.write(relative,'changed');assert.equal(validateBookRouting(b,p,{root:f.root}).ok,false);
});

test('legacy CharacterBook extensions are the effective routing metadata, including duplicate-ID rejection', t => {
  const f=fixture(t),p='制作文件/项目记录/交付清单.json';
  const components={card:{path:'legacy.角色卡.json'}};f.write(p,{schema:'rp-card-studio/active-route/v1',activeRoute:'main',components,routes:{main:{status:'active',components}}});
  const entry={id:3,keys:[],content:'legacy',constant:true,enabled:true,position:'before_char',extensions:{position:4,depth:1,role:2}};
  f.write('导入包/legacy.角色卡.json',{data:{character_book:{entries:[entry]}}});
  const contract={schema:'rp-card-studio/worldbook-routing/v1',versionPin:'fixture',fixtures:'制作文件/检查/legacy.fixtures.json',books:[{...plan({turn:policy('turn_instruction',4,'constant',{placement:{position:4,depth:1,role:2}})},[entryAssignment(3,'turn')]),artifact:'legacy.角色卡.json',entriesPointer:'/data/character_book/entries'}]};
  f.write(f.manifest.worldbook.routingContract,contract);f.write(contract.fixtures,{schema:'rp-card-studio/worldbook-routing-fixtures/v1',fixtures:[{id:'legacy',bookId:'main',activatedEntryIds:[3],expected:[{entryId:'3',area:'chatHistory',depth:1,role:2}]}]});
  assert.equal(validateWorldbookProject(f.root,f.manifest.worldbook.routingContract).ok,true);
  f.write('导入包/legacy.角色卡.json',{data:{character_book:{entries:[entry,entry]}}});assert.match(validateWorldbookProject(f.root,f.manifest.worldbook.routingContract).issues.join(' '),/id 重复/);
});
test('known runtime failure is not hidden by a successful static layout', t => {
  const f=fixture(t),c=JSON.parse(fs.readFileSync(path.join(f.root,f.manifest.worldbook.routingContract),'utf8'));
  c.books[0].runtime.status='failed';f.write(f.manifest.worldbook.routingContract,c);
  assert.match(validateWorldbookProject(f.root,f.manifest.worldbook.routingContract).issues.join(' '),/已有宿主插入失败/);
});
test('JSON output and required-runtime boolean flags work when placed last in package CLI arguments', t => {
  const f=fixture(t);f.write('导入包/A.世界书.json',book([defaultEntry(1)]));
  f.write('导入包/card.json',{spec:'chara_card_v3',spec_version:'3.0',data:{name:'fixture',description:'description',personality:'',scenario:'',first_mes:'hello',mes_example:'',creator_notes:'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],tags:[],creator:'',character_version:'',extensions:{world:'A.世界书'}}});
  const args=[path.join(agentRoot,'scripts/validate-rolecard-package.mjs'),'--root',f.root,'--card','导入包/card.json','--worldbook','导入包/A.世界书.json','--worldbook-routing',f.manifest.worldbook.routingContract,'--json'];
  let c=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(c.status,0,c.stderr);assert.equal(JSON.parse(c.stdout).ok,true);
  c=spawnSync(process.execPath,[...args,'--require-worldbook-runtime'],{encoding:'utf8'});assert.equal(c.status,1);assert.match(JSON.parse(c.stdout).issues.join(' '),/实机声明缺少/);
});
