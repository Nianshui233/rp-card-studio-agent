import { fixture } from './production-fixture.mjs';

export function workbenchFixture(t, stage = 'message_frontend') {
  const f = fixture(t);
  const source = '制作文件/运行源码/panel.html';
  const html = '<!doctype html><html lang="zh-CN"><head><style>:root { --space: 12px; --accent: #17664f; } body { margin: 0; background: transparent; font-family: system-ui; } #out { padding: var(--space); color: var(--accent); font-size: 18px; } #grid { display:grid; grid-template-columns:1fr; gap:12px; }</style></head><body><main id="out"><h1>当前资料</h1><div id="grid"><p id="name"></p><p id="quantity"></p></div><button id="details">查看详情</button><div id="detail" hidden>这里是当前对象的实际详情。</div></main><script>window.redraw=()=>{const s=window.readSnapshot();document.getElementById("name").textContent=s.name;document.getElementById("quantity").textContent=String(s.quantity)};redraw();document.getElementById("details").onclick=()=>document.getElementById("detail").hidden=false;</script></body></html>';
  const binding = { id: 'actual-panel', component: stage, route: 'main', source: { path: source, format: 'text' }, target: { path: 'panel.正则.json', pointer: '/0/replaceString', kind: 'regex' }, wrapper: 'fenced_html', match: 'equals' };
  f.write(source, html);
  f.write('导入包/panel.正则.json', [{ id:'panel', findRegex:'/<panel>/g', replaceString:'```html\n'+html+'\n```', placement:[2], disabled:false, markdownOnly:true, promptOnly:false, runOnEdit:true, substituteRegex:0, trimStrings:[] }]);
  f.write('制作文件/项目记录/交付清单.json', { schema:'rp-card-studio/active-route/v1',activeRoute:'main',components:{regex:{path:'panel.正则.json'}},routes:{main:{status:'active',components:{regex:{path:'panel.正则.json'}}}} });
  f.write('制作文件/检查/setup.js', 'window.fixtureState={name:"折叠望远镜",quantity:1};window.fixtureContext={chatId:"isolated-fixture",messageId:2,swipeId:0};window.readFixtureContext=()=>structuredClone(window.fixtureContext);window.readSnapshot=()=>structuredClone(window.fixtureState);window.applySnapshot=data=>{window.fixtureState=structuredClone(data);window.redraw?.();};');
  f.write('制作文件/检查/long.json', { name:'一件名称非常长而且应该正常换行的观测资料与记录工具',quantity:16 });
  const c = { id:'actual-case',route:'main',binding:binding.id,surfaceId:'main',surface:'message_iframe',decodeEntities:'none',input:'<panel>',frameSetup:'制作文件/检查/setup.js',viewport:{width:1280,height:900},steps:[{expect:'text',selector:'#name',value:'折叠望远镜'}],workbench:{
    controls:[{id:'space',label:'内容留白',selector:':root',property:'--space',type:'number',min:0,max:40,step:2,unit:'px',backport:{path:source,format:'html',selector:':root',property:'--space'}},{id:'accent',label:'文字颜色',selector:':root',property:'--accent',type:'color',backport:{path:source,format:'html',selector:':root',property:'--accent'}},{id:'columns',label:'资料排列',selector:'#grid',property:'grid-template-columns',type:'select',options:[{label:'单列',value:'1fr'},{label:'双列',value:'1fr 1fr'}],backport:{path:source,format:'html',selector:'#grid',property:'grid-template-columns'}}],
    presets:[{id:'spacious',label:'较宽松',values:{space:24}}],observations:[{id:'name',selector:'#name'},{id:'quantity',selector:'#quantity'}],stateAdapter:{scope:'frame',read:'readSnapshot',write:'applySnapshot',context:'readFixtureContext',snapshots:[{id:'long',label:'长内容与数量增长',path:'制作文件/检查/long.json'}]}
  }};
  const fixtures = { schema:'rp-card-studio/frontend-fixtures/v1',cases:[c] };
  f.manifest.bindings = [binding]; f.write('制作文件/项目记录/production.json',f.manifest); f.write('制作文件/检查/workbench.json',fixtures);
  return { ...f, source, html, binding, c, fixtures, fixturesPath:'制作文件/检查/workbench.json' };
}

export function scriptWorkbenchFixture(t) {
  const f=workbenchFixture(t),html=f.html.replace('window.readSnapshot()','parent.readSnapshot()');
  f.write(f.source,html);
  const script='const target=parent.document.createElement("iframe");target.id="script-result";target.srcdoc='+JSON.stringify(html)+';parent.document.getElementById("chat").append(target);';
  const binding={...f.binding,source:{path:'制作文件/运行源码/mount.js',format:'text'},target:{path:'panel.脚本.json',pointer:'/scripts/0/content',kind:'helper_script'},wrapper:'none'};
  f.write(binding.source.path,script);f.write('导入包/panel.脚本.json',{scripts:[{id:'main',enabled:true,content:script}]});
  f.write('制作文件/项目记录/交付清单.json',{schema:'rp-card-studio/active-route/v1',activeRoute:'main',components:{helper:{path:'panel.脚本.json'}},routes:{main:{status:'active',components:{helper:{path:'panel.脚本.json'}}}}});
  f.write('制作文件/检查/host.js','window.fixtureState={name:"折叠望远镜",quantity:1};window.fixtureContext={chatId:"isolated-fixture",messageId:2,swipeId:0};window.readFixtureContext=()=>structuredClone(window.fixtureContext);window.readSnapshot=()=>structuredClone(window.fixtureState);window.applySnapshot=data=>{window.fixtureState=structuredClone(data);document.getElementById("script-result").contentWindow.redraw();};');
  const c={...f.c,id:'script-case',surface:'script_iframe',resultFrame:'#script-result',hostSetup:'制作文件/检查/host.js',workbench:{...f.c.workbench,stateAdapter:{...f.c.workbench.stateAdapter,scope:'host'}}};delete c.frameSetup;
  const fixtures={schema:f.fixtures.schema,cases:[c]};f.manifest.bindings=[binding];f.write('制作文件/项目记录/production.json',f.manifest);f.write(f.fixturesPath,fixtures);
  return{...f,html,binding,c,fixtures};
}
