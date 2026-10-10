import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { chromium } from 'playwright';
import { fixture } from './helpers/production-fixture.mjs';
import { workbenchFixture, scriptWorkbenchFixture } from './helpers/frontend-workbench-fixture.mjs';
import { renderDesignLibrary } from '../scripts/frontend/design-library.mjs';
import { DESIGN_DEMOS } from '../scripts/frontend/design-demos.mjs';
import { startFrontendWorkbench } from '../scripts/frontend/frontend-workbench.mjs';
import { createBackportPlan, applyBackportPlan } from '../scripts/frontend/tuning-backport.mjs';

const results=[], artifacts=process.env.RP_DESIGN_TEST_OUTPUT;
if(artifacts)fs.mkdirSync(path.resolve(artifacts),{recursive:true});
async function capture(page,name){const bytes=await page.screenshot({fullPage:true});assert.ok(bytes.length>2000);if(artifacts)fs.writeFileSync(path.join(path.resolve(artifacts),name+'.png'),bytes);}
const trace=message=>{if(process.env.RP_DESIGN_TEST_VERBOSE)console.error(message);};
async function check(name,fn){trace('START '+name);try{await fn();results.push({id:name,ok:true});trace('PASS '+name);}catch(error){results.push({id:name,ok:false,error:error.stack});trace('FAIL '+name+': '+error.stack);}}
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.RP_BROWSER_EXECUTABLE||undefined});
  for(const stage of ['opening_frontend','message_frontend'])await check(stage+'-offline-picker',async()=>{
    const f=fixture(),context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));await context.route(/^https?:/,route=>route.abort());
    try{
      const relative='制作文件/检查/library.html';f.write(relative,await renderDesignLibrary(stage));
      await page.setViewportSize({width:1360,height:960});await page.goto(pathToFileURL(path.join(f.root,relative)).href);
      await page.locator('#search').fill(stage==='opening_frontend'?'展陈':'物品');
      await page.locator('.reference').filter({has:page.getByText(stage==='opening_frontend'?'展陈式世界介绍':'按用途组织的物品视图',{exact:true})}).click();
      await page.locator('#pick').check();assert.match(await page.locator('#selection').innerText(),/已选 1 项/);
      const frame=page.frameLocator('#demo');assert.ok(await frame.locator('main').isVisible());
      await capture(page,stage+'-desktop');
      await page.setViewportSize({width:390,height:844});
      await page.locator('#demo').scrollIntoViewIfNeeded();
      await page.locator('footer').evaluate(el=>el.style.visibility='hidden');
      const mobileDemo=await page.locator('#demo').screenshot();assert.ok(mobileDemo.length>2000);if(artifacts)fs.writeFileSync(path.join(path.resolve(artifacts),stage+'-demo-mobile.png'),mobileDemo);
      await page.locator('footer').evaluate(el=>el.style.visibility='');
      await capture(page,stage+'-mobile');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);await page.reload();assert.match(await page.locator('#selection').innerText(),/已选 1 项/);
      await page.locator('#search').fill('not-a-reference-xyz');assert.equal(await page.locator('.reference').count(),0);
      assert.ok((await page.locator('#list').innerText()).includes('没有匹配'));
    }finally{await context.close();f.remove();}
  });
  for(const[id,demo]of Object.entries(DESIGN_DEMOS))await check(id+'-actual-interaction',async()=>{
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.setViewportSize({width:900,height:850});await page.setContent(demo.html);
      if(id==='opening-exhibit'){await page.locator('#begin').click();assert.match(await page.locator('#result').innerText(),/已打开/);}
      if(id==='opening-atlas'){await page.getByRole('button',{name:'观测站',exact:true}).click();assert.equal(await page.locator('#place-title').innerText(),'观测站');}
      if(id==='opening-guide'){await page.locator('summary').first().click();assert.equal(await page.locator('details').first().getAttribute('open'),'');}
      if(id==='opening-creation'){await page.locator('input[name=name]').fill('一个很长而且可以自由修改的来访者称呼');await page.locator('select').selectOption('研究者');await page.locator('input[name=topic]').fill('河谷观察');await page.getByRole('button',{name:'查看结果'}).click();assert.equal(await page.locator('#draft-topic').innerText(),'河谷观察');}
      if(id==='message-brief'){await page.getByRole('tab',{name:'记录',exact:true}).click();assert.equal(await page.locator('#records').isVisible(),true);}
      if(id==='message-inventory'){await page.locator('#query').fill('望远镜');await page.getByRole('button',{name:'查看详情',exact:true}).click();await page.locator('#draft-action').click();assert.match(await page.locator('#feedback').innerText(),/尚未执行/);}
      if(id==='message-map'){await page.getByRole('button',{name:'山间集市',exact:true}).click();assert.match(await page.locator('#map-result').innerText(),/当前位置仍为旧渡口/);}
      if(id==='message-intelligence'){await page.locator('#evidence').click();assert.equal(await page.locator('#source').isVisible(),true);}
      await capture(page,id+'-desktop');await page.setViewportSize({width:390,height:844});await capture(page,id+'-mobile');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
    }finally{await page.close();}
  });
  for(const stage of ['opening_frontend','message_frontend','message_script'])await check(stage+'-real-source-workbench',async()=>{
    const f=stage==='message_script'?scriptWorkbenchFixture():workbenchFixture(undefined,stage),sourceBefore=fs.readFileSync(path.join(f.root,f.source)),importFile=path.join(f.root,'导入包',f.binding.target.path),importBefore=fs.readFileSync(importFile);
    let handle;
    try{
      handle=await startFrontendWorkbench({root:f.root,fixtures:f.fixtures,fixturesPath:f.fixturesPath,bindings:[f.binding],caseId:f.c.id,browser});
      const{controller,page,frame}=await handle.ready;
      assert.equal(await frame.locator('html').evaluate(el=>el.ownerDocument.defaultView.parent===el.ownerDocument.defaultView.top),true);
      await page.locator('#rpwb-param-space').fill('24');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#script-result,iframe[id^="TH-message"]').contentDocument.querySelector('#out')).paddingTop==='24px');
      await controller.dispatch('baseline',{value:true});assert.equal(await frame.locator('#out').evaluate(el=>getComputedStyle(el).paddingTop),'12px');
      await controller.dispatch('baseline',{value:false});assert.equal(await frame.locator('#out').evaluate(el=>getComputedStyle(el).paddingTop),'24px');
      await frame.locator('html').evaluate(el=>el.ownerDocument.querySelector('style[id^="rp-tuning-"]').remove());
      const rebound=await controller.dispatch('info');assert.equal(rebound.defaults.space,'12px');assert.equal(rebound.current.space,'24px');
      const preview=await controller.dispatch('preview-state',{id:'long'});assert.equal(await frame.locator('#quantity').innerText(),'1');assert.ok(preview.pending.differences.length);
      await controller.dispatch('cancel-state');assert.equal(await frame.locator('#quantity').innerText(),'1');
      const stale=await controller.dispatch('preview-state',{id:'long'});await frame.locator('html').evaluate(el=>{const w=el.ownerDocument.defaultView; (w.fixtureState?w:w.parent).fixtureState.quantity=2;});
      await assert.rejects(controller.dispatch('apply-state',{id:stale.pending.id}),/状态或快照已变化/);
      const switched=await controller.dispatch('preview-state',{id:'long'});
      await frame.locator('html').evaluate(el=>{const w=el.ownerDocument.defaultView;(w.fixtureContext?w:w.parent).fixtureContext.swipeId=1;});
      await assert.rejects(controller.dispatch('apply-state',{id:switched.pending.id}),/聊天、楼层、分支或页面已变化/);
      assert.equal(await frame.locator('html').evaluate(el=>{const w=el.ownerDocument.defaultView;return(w.fixtureState?w:w.parent).fixtureState.quantity;}),2);
      const revised=await controller.dispatch('preview-state',{id:'long'});await controller.dispatch('tune',{id:'space',value:26});
      await assert.rejects(controller.dispatch('apply-state',{id:revised.pending.id}),/状态预览已失效/);
      await controller.dispatch('tune',{id:'space',value:24});
      const fresh=await controller.dispatch('preview-state',{id:'long'});const applied=await controller.dispatch('apply-state',{id:fresh.pending.id});assert.equal(applied.lastState.matchesExpected,true);assert.equal(await frame.locator('#quantity').innerText(),'16');
      await page.locator('#rpwb details summary').click();await page.locator('#rpwb-observe').click();
      await page.waitForFunction(()=>document.getElementById('rpwb-observations').textContent.includes('16'));
      await page.locator('#rpwb').evaluate(el=>el.scrollTop=0);await capture(page,stage+'-workbench-desktop');
      await page.setViewportSize({width:390,height:844});await controller.dispatch('width',{value:720});await capture(page,stage+'-workbench-mobile');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const exported=await controller.dispatch('export'),record=JSON.parse(fs.readFileSync(path.join(f.root,exported.path),'utf8'));
      assert.equal(record.screenshot.eligibleForDesignReview,false);assert.equal(record.values.space,24);assert.equal(fs.readFileSync(path.join(f.root,f.source)).equals(sourceBefore),true);
      const damaged=structuredClone(record);damaged.values.space=28;await assert.rejects(controller.dispatch('restore-values',{record:damaged}),/完整候选记录/);
      await controller.dispatch('reset');assert.equal(await frame.locator('#out').evaluate(el=>getComputedStyle(el).paddingTop),'12px');
      const restored=await controller.dispatch('restore-values',{record});assert.equal(restored.values.space,24);assert.equal(await frame.locator('#quantity').innerText(),'16');
      await controller.dispatch('export');
      handle.close();const done=await handle.done;assert.equal(done.level,'workbench-candidate');assert.equal(done.runtime,'not_run');assert.equal(done.ok,true);
      const plan=createBackportPlan(f.root,record);applyBackportPlan(f.root,record,plan.planSha256);assert.match(fs.readFileSync(path.join(f.root,f.source),'utf8'),/--space: 24px/);
      assert.equal(fs.readFileSync(importFile).equals(importBefore),true);
    }finally{handle?.close();if(handle)await handle.done;f.remove();}
  });
  for(const stage of ['opening_frontend','message_frontend'])await check(stage+'-existing-sample-import-workbench',async()=>{
    const f=fixture(),sampleRoot=fileURLToPath(new URL('../assets/examples/wo-fei-wo-rp/',import.meta.url)),root=path.join(f.root,'sample-project');let handle;
    try{
      const opening=stage==='opening_frontend',source='制作文件/运行源码/前端/'+(opening?'开场入口页.html':'消息状态栏.html');
      const manifestPath='制作文件/项目记录/交付清单.json',manifest=JSON.parse(fs.readFileSync(path.join(sampleRoot,manifestPath),'utf8'));
      const sampleFiles=[manifestPath,source,'制作文件/创作源/变量/01-初始化基线.yaml',...Object.values(manifest.components).map(component=>'导入包/'+component.path)];
      for(const relative of sampleFiles)f.write('sample-project/'+relative,fs.readFileSync(path.join(sampleRoot,relative)));
      const binding={id:'sample-current',component:stage,route:'main',source:{path:source,format:'text',normalize:'lf'},target:{path:'我，非我.正则.json',pointer:'/'+(opening?3:2)+'/replaceString',kind:'regex'},wrapper:'fenced_html',match:'equals'};
      const setup='制作文件/检查/workbench-sample.js';
      if(!opening){const initial=parseYaml(fs.readFileSync(path.join(root,'制作文件/创作源/变量/01-初始化基线.yaml'),'utf8'));f.write('sample-project/'+setup,'window.getCurrentMessageId=()=>2;window.Mvu={getMvuData:()=>({stat_data:'+JSON.stringify(initial)+'})};');}
      const c={id:'sample-'+stage,route:'main',binding:binding.id,surfaceId:'main',surface:'message_iframe',decodeEntities:'none',input:opening?'<我非我开场/>':'<StatusPlaceHolderImpl/>',...(opening?{}:{frameSetup:setup}),steps:opening?[{expect:'visible',selector:'#step-0',value:true}]:[{expect:'visible',selector:'#panel-overview',value:true},{expect:'text',selector:'#live',value:'已同步'},{expect:'text',selector:'#ov-place',value:'未记录'}],workbench:{controls:[{id:'ink',label:'正文颜色',selector:':root',property:'--ink',type:'color',backport:{path:source,format:'html',selector:':root',property:'--ink'}}],observations:[{id:'main',selector:opening?'#step-0':'#panel-overview'}]}};
      const fixtures={schema:'rp-card-studio/frontend-fixtures/v1',cases:[c]},fixturesPath='制作文件/检查/workbench-sample.json';
      f.write('sample-project/'+fixturesPath,fixtures);f.write('sample-project/制作文件/项目记录/production.json',{bindings:[binding]});
      const sourceBefore=fs.readFileSync(path.join(root,source));
      trace('sample files ready');
      handle=await startFrontendWorkbench({root,fixtures,fixturesPath,bindings:[binding],caseId:c.id,browser});const{controller,page,frame}=await handle.ready;
      trace('sample workbench ready');
      await controller.dispatch('tune',{id:'ink',value:'#364a45'});
      await page.locator('#rpwb-toggle').click();
      if(opening){await frame.locator('.pstep[data-goto="1"]').click();await frame.locator('#f-name').fill('真实样品的测试称呼');assert.equal(await frame.locator('#f-name').inputValue(),'真实样品的测试称呼');}
      else{await frame.locator('#tab-supply').click();assert.equal(await frame.locator('#panel-supply').isVisible(),true);await frame.locator('#su-search').fill('测试筛选');}
      trace('sample interaction done');await capture(page,stage+'-existing-sample');trace('sample captured');const exported=await controller.dispatch('export');trace('sample exported');
      const record=JSON.parse(fs.readFileSync(path.join(root,exported.path),'utf8'));assert.equal(record.screenshot.eligibleForDesignReview,false);assert.equal(fs.readFileSync(path.join(root,source)).equals(sourceBefore),true);
      handle.close();assert.equal((await handle.done).ok,true);
    }finally{handle?.close();if(handle)await handle.done;f.remove();}
  });
}catch(error){results.push({id:'setup',ok:false,error:error.stack});}
finally{if(browser)await browser.close();}
const passed=results.filter(result=>result.ok).length;console.log(JSON.stringify({ok:passed===results.length,level:'browser-fixture',runtime:'not_run',passed,total:results.length,results},null,2));if(passed!==results.length)process.exitCode=1;
