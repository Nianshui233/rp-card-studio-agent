import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workbenchFixture } from './helpers/frontend-workbench-fixture.mjs';
import { textHash } from '../scripts/production/artifact-bindings.mjs';
import { sourceHashes, validateTuningControls, tuningValue, jsonDifference } from '../scripts/frontend/tuning-contract.mjs';
import { createBackportPlan, applyBackportPlan } from '../scripts/frontend/tuning-backport.mjs';

function recordFor(f, values = { space:24 }) {
  const artifact = JSON.parse(fs.readFileSync(path.join(f.root,'导入包/panel.正则.json'),'utf8'));
  return { schema:'rp-card-studio/frontend-tuning/v1',level:'workbench-candidate',stage:f.binding.component,caseId:f.c.id,binding:{id:f.binding.id,target:f.binding.target},targetSha256:textHash(artifact[0].replaceString),controls:f.c.workbench.controls,values,sourceHashes:sourceHashes(f.root,f.c.workbench.controls),fixtures:{path:f.fixturesPath,sha256:textHash(fs.readFileSync(path.join(f.root,f.fixturesPath)))}};
}
test('HTML backport uses actual CSS declarations, previews without writes and preserves scripts and surrounding markup', t => {
  const f=workbenchFixture(t), record=recordFor(f,{space:24,accent:'#a34160',columns:'1fr 1fr'}), before=fs.readFileSync(path.join(f.root,f.source));
  const plan=createBackportPlan(f.root,record);
  assert.equal(fs.readFileSync(path.join(f.root,f.source)).equals(before),true);
  assert.match(plan.files[0].after.toString(),/--space: 24px/); assert.match(plan.files[0].after.toString(),/--accent: #a34160/);
  assert.match(plan.files[0].after.toString(),/grid-template-columns:1fr 1fr/);
  assert.equal(plan.files[0].after.toString().split('<script>')[1],f.html.split('<script>')[1]);
  const result=applyBackportPlan(f.root,record,plan.planSha256);
  assert.equal(result.rebuildRequired,true); assert.equal(result.runtime,'not_run');
  assert.equal(fs.readFileSync(path.join(f.root,'导入包/panel.正则.json'),'utf8').includes('--space: 24px'),false);
  assert.throws(()=>createBackportPlan(f.root,record),/维护源码.*已改变/);
});
test('stale source, stale target, stale fixture and changed plans fail without changing files', t => {
  for (const kind of ['source','target','fixture','plan']) {
    const f=workbenchFixture(t), record=recordFor(f), plan=createBackportPlan(f.root,record);
    if(kind==='source')fs.appendFileSync(path.join(f.root,f.source),'<!-- user edit -->');
    if(kind==='target') {const file=path.join(f.root,'导入包/panel.正则.json'),data=JSON.parse(fs.readFileSync(file));data[0].replaceString+=' changed';fs.writeFileSync(file,JSON.stringify(data));}
    if(kind==='fixture')fs.appendFileSync(path.join(f.root,f.fixturesPath),' ');
    if(kind==='plan')record.values.space=28;
    const before=fs.readFileSync(path.join(f.root,f.source));
    assert.throws(()=>applyBackportPlan(f.root,record,plan.planSha256));
    assert.equal(fs.readFileSync(path.join(f.root,f.source)).equals(before),true);
  }
});
test('ambiguous CSS, undeclared backports and non-source destinations are rejected', t => {
  const f=workbenchFixture(t), record=recordFor(f);
  f.write(f.source,f.html.replace('</style>',' :root { --space: 14px; }</style>'));record.sourceHashes=sourceHashes(f.root,record.controls);
  assert.throws(()=>createBackportPlan(f.root,record),/不唯一/);
  const unbound=structuredClone(record);delete unbound.controls[0].backport;assert.throws(()=>createBackportPlan(f.root,unbound),/没有已声明/);
  const escaped=structuredClone(record);escaped.controls[0].backport.path='导入包/panel.正则.json';assert.throws(()=>createBackportPlan(f.root,escaped),/回写源/);
});
test('CSS and JSON token sources preserve unrelated declarations and fields', t => {
  const f=workbenchFixture(t), record=recordFor(f);
  for (const format of ['css','json']) {
    const relative='制作文件/运行源码/tokens.'+format;
    f.write(relative,format==='css'?'/* retained */ :root { --space: 12px; --other: 7px; }':{space:12,untouched:{name:'保留'}});
    const copy=structuredClone(record);copy.controls=[{...copy.controls[0],backport:format==='css'?{path:relative,format,selector:':root',property:'--space'}:{path:relative,format,pointer:'/space'}}];copy.sourceHashes=sourceHashes(f.root,copy.controls);
    const plan=createBackportPlan(f.root,copy);applyBackportPlan(f.root,copy,plan.planSha256);
    const actual=fs.readFileSync(path.join(f.root,relative),'utf8');
    if(format==='css')assert.match(actual,/\/\* retained \*\/.*--other: 7px/);else assert.deepEqual(JSON.parse(actual),{space:24,untouched:{name:'保留'}});
  }
});
test('tuning values and differences have explicit types, ranges and missing-value semantics', () => {
  const control={id:'space',label:'间距',selector:':root',property:'--space',type:'number',min:0,max:40,step:2,unit:'px'};
  assert.equal(tuningValue(control,24),'24px');for(const value of [23,41,'24',NaN])assert.throws(()=>tuningValue(control,value));
  assert.throws(()=>validateTuningControls([{...control,property:'background-image'}]));
  const backport={path:'制作文件/运行源码/styles.css',format:'css',selector:':root',property:'--space'};
  assert.throws(()=>validateTuningControls([{...control,backport},{...control,id:'other',backport:{property:'--space',selector:':root',format:'css',path:backport.path}}]),/竞争同一/);
  assert.deepEqual(jsonDifference({name:'旧',known:null},{name:'新'}),[{path:'/name',before:'旧',after:'新'},{path:'/known',before:null,after:{missing:true}}]);
});
