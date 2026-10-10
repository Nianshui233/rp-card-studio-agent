import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { inspectInstallation, scanInstallations, discoverHost, localOrigin, probeLocalOrigin, writeHostEnvironment } from '../scripts/host/discover-sillytavern.mjs';
import { processHints, parsePosixProcesses, parseSsListeners, parseLsofListeners, collectLocalEnvironment } from '../scripts/host/local-environment.mjs';
import { fixture as temp } from './helpers/production-fixture.mjs';
function installation(f,name = 'renamed-host',port = 8123) {
  f.write(name + '/package.json',{name:'SillyTavern',version:'fixture-version'}); f.write(name + '/server.js','fixture'); f.write(name + '/public/index.html','<title>SillyTavern</title>');
  f.write(name + '/config.yaml','port: '+port+'\ndataRoot: ./private-data\nenableUserAccounts: true\napiKey: DO-NOT-PERSIST\n');
  return path.join(f.root,name);
}
const env = (overrides = {}) => async () => ({processes:[],listeners:[],diskRoots:[],warnings:[],visibility:'execution_environment',...overrides});
const accessible = async origin => ({origin,status:'sillytavern_accessible',identity:'page_signature'});
test('directory identity requires actual host markers, not a SillyTavern-like folder name', t => {
  const f = temp(t); f.write('SillyTavern/package.json',{name:'unrelated'});
  assert.equal(inspectInstallation(path.join(f.root,'SillyTavern')),null);
  const directory = installation(f); assert.equal(inspectInstallation(directory).version,'fixture-version');
  const result = scanInstallations([f.root]); assert.equal(result.installations.length,1); assert.equal(result.coverage.exhaustive,false);
});
test('configuration reads only whitelist fields and never claims effective runtime or records secrets', t => {
  const f = temp(t), directory = installation(f), result = inspectInstallation(directory,{port:'8234',dataRoot:'./custom'});
  assert.equal(result.configuration.port,8234); assert.equal(result.configuration.dataRoot,path.join(directory,'custom'));
  assert.equal(result.configuration.accountsEnabled,true); assert.equal(result.configuration.effectiveRuntime,'not_verified');
  assert.doesNotMatch(JSON.stringify(result),/DO-NOT-PERSIST|apiKey/);
});
test('missing config does not pretend the default port is effective', t => {
  const f = temp(t), directory = installation(f); fs.unlinkSync(path.join(directory,'config.yaml'));
  const result = inspectInstallation(directory); assert.equal(result.configuration.port,null); assert.equal(result.configuration.status,'unavailable');
});
test('scan is bounded, does not recurse chat data or node_modules, and never concludes global absence', t => {
  const f = temp(t); installation(f,'data/hidden'); installation(f,'node_modules/hidden'); installation(f,'deep/nested/host');
  const result = scanInstallations([f.root],{maxDepth:1,maxDirectories:2,maxMs:1000});
  assert.equal(result.coverage.limitReached,true); assert.equal(result.coverage.exhaustive,false); assert.equal(result.installations.length,0);
});
test('process parsing extracts paths and supported options, not passwords or unrelated command text', () => {
  const result = processHints([{pid:10,command:'"C:\\Program Files\\nodejs\\node.exe" "D:\\AI\\renamed\\server.js" --port=9001 --dataRoot "D:\\private data" --password SECRET'}],{platform:'win32'});
  assert.equal(result[0].directory,'D:\\AI\\renamed'); assert.equal(result[0].options.port,'9001'); assert.equal(result[0].options.dataRoot,'D:\\private data');
  assert.doesNotMatch(JSON.stringify(result),/SECRET|password/);
  assert.equal(processHints([{pid:11,command:'node server.js',cwd:'/opt/renamed'}],{platform:'linux'})[0].directory,'/opt/renamed');
});
test('Linux and macOS collectors preserve PID and listener distinctions', async () => {
  assert.equal(parsePosixProcesses(' 11 node server.js\n 12 python app.py\n',() => '/opt/host').length,1);
  assert.deepEqual(parseSsListeners('LISTEN 0 511 127.0.0.1:8123 0.0.0.0:* users:(("node",pid=11,fd=8))')[0],{pid:11,port:8123,address:'127.0.0.1:8123'});
  assert.equal(parseLsofListeners('p11\nn[::1]:8123\n')[0].pid,11);
  const result = await collectLocalEnvironment({platform:'linux',execute:async program => { if (program === 'ps') return '11 node server.js'; throw Error('no permission'); }});
  assert.equal(result.processes.length,1); assert.match(result.warnings.join(' '),/不能断言没有运行实例/);
});
test('Windows collector uses one read-only native shell', async () => {
  let program, args;
  const result = await collectLocalEnvironment({platform:'win32',execute:async (p,a) => {program=p;args=a;return JSON.stringify({processes:[{pid:5,command:'node server.js'}],listeners:[{pid:5,port:8888}],diskRoots:['D:\\'],warnings:[]}); }});
  assert.equal(program,'powershell.exe'); assert.ok(args.includes('-NonInteractive')); assert.match(args.at(-1),/Get-NetTCPConnection/);
  assert.equal(result.listeners[0].port,8888);
});
test('remote endpoints, arbitrary paths, credentials and URL queries are rejected', () => {
  for (const url of ['https://example.com','http://localhost:8000/admin','http://a:b@localhost:8000/','http://localhost:8000/?key=SECRET','http://127.0.0.1:8000/#private','file:///tmp/x']) assert.throws(() => localOrigin(url),/本机回环/);
  assert.equal(localOrigin('http://localhost:8123'),'http://localhost:8123');
});
test('single accessible instance is selected for read-only inspection but is not runtime acceptance', async t => {
  const f = temp(t), directory = installation(f);
  const result = await discoverHost({roots:[f.root],directories:[directory],collect:env({processes:[{pid:10,command:'node "'+path.join(directory,'server.js')+'"'}],listeners:[{pid:10,port:8123,address:'127.0.0.1'}]}),probe:accessible});
  assert.equal(result.selection.status,'selected'); assert.equal(result.runtime,'not_run'); assert.equal(result.instances[0].testConditions,'not_verified');
  assert.equal(result.instances[0].installationDirectory,fs.realpathSync(directory)); assert.doesNotMatch(JSON.stringify(result),/DO-NOT-PERSIST/);
});
test('multiple accessible instances require choice; explicit target preference is not guessed', async t => {
  const f = temp(t); installation(f,'first',8123); installation(f,'second',8234);
  const result = await discoverHost({roots:[f.root],collect:env(),probe:accessible}); assert.equal(result.selection.status,'needs_choice');
  const preferred = await discoverHost({roots:[f.root],preferredOrigin:'http://127.0.0.1:8234',collect:env(),probe:accessible}); assert.equal(preferred.selection.origin,'http://127.0.0.1:8234');
  const missing = await discoverHost({roots:[f.root],preferredDirectory:path.join(f.root,'missing'),collect:env(),probe:accessible}); assert.equal(missing.selection.status,'preferred_not_verified');
});
test('installed but unreachable host is recorded without app startup, false readiness or global absence', async t => {
  const f = temp(t); installation(f);
  const result = await discoverHost({roots:[f.root],collect:env({visibility:'container'}),probe:async () => ({status:'network_unavailable',identity:'not_verified'})});
  assert.equal(result.installations.length,1); assert.equal(result.selection.status,'not_found_in_scope'); assert.equal(result.visibility,'container'); assert.equal(result.runtime,'not_run');
});
test('environment record is overwritten in the production area without creating history or changing imports', t => {
  const f = temp(t); f.write('project/导入包/keep.txt','unchanged'); f.write('project/制作文件/keep.txt','unchanged');
  const project = path.join(f.root,'project'), report = {schema:'rp-card-studio/host-environment/v1',runtime:'not_run',capturedAt:'first'};
  const target = writeHostEnvironment(project,report); writeHostEnvironment(project,{...report,capturedAt:'second'});
  assert.equal(JSON.parse(fs.readFileSync(target)).capturedAt,'second'); assert.deepEqual(fs.readdirSync(path.dirname(target)),['host-environment.json']);
  assert.equal(fs.readFileSync(path.join(project,'导入包/keep.txt'),'utf8'),'unchanged');
  assert.throws(() => writeHostEnvironment(project,{...report,runtime:'passed'}),/冒充运行验收/);
});
async function server(t,handler) {
  const instance = http.createServer(handler); await new Promise(resolve => instance.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => { instance.close(resolve); instance.closeAllConnections(); }));
  return 'http://127.0.0.1:' + instance.address().port;
}
test('real HTTP discovery reads only homepage, sends no credentials and distinguishes other services', async t => {
  let requested;
  const origin = await server(t,(req,res) => {requested={url:req.url,method:req.method,cookie:req.headers.cookie,auth:req.headers.authorization};res.end('<html><title>SillyTavern</title><link href="manifest.json"></html>');});
  const result = await probeLocalOrigin(origin); assert.equal(result.status,'sillytavern_accessible');
  assert.deepEqual(requested,{url:'/',method:'GET',cookie:undefined,auth:undefined});
  const other = await server(t,(_req,res) => res.end('<title>Other App</title>')); assert.equal((await probeLocalOrigin(other)).status,'other_response');
});
test('redirects and access restrictions are not followed or promoted to verified hosts', async t => {
  let count=0;
  const origin = await server(t,(_req,res) => {count++;res.writeHead(302,{Location:'https://example.com/login'});res.end();});
  const result = await probeLocalOrigin(origin); assert.equal(result.status,'access_restricted'); assert.equal(result.identity,'not_verified'); assert.equal(count,1);
});
test('exact preferred origin survives deduplication of IPv4 and IPv6 listeners for the same process', async t => {
  const f = temp(t);
  const result = await discoverHost({roots:[f.root],preferredOrigin:'http://127.0.0.1:8123',collect:env({processes:[{pid:10,command:'node server.js'}],listeners:[{pid:10,port:8123,address:'127.0.0.1'},{pid:10,port:8123,address:'::1'}]}),probe:accessible});
  assert.equal(result.selection.origin,'http://127.0.0.1:8123');
  assert.equal(localOrigin('http://127.0.0.5:8000'),'http://127.0.0.5:8000');
});
test('process-derived port override is retained even when the configuration file cannot be read', t => {
  const f = temp(t), directory = installation(f); fs.unlinkSync(path.join(directory,'config.yaml'));
  const result = inspectInstallation(directory,{port:'9001',dataRoot:'./external-data'});
  assert.equal(result.configuration.status,'unavailable'); assert.equal(result.configuration.port,9001);
  assert.equal(result.configuration.effectiveRuntime,'not_verified');
});
