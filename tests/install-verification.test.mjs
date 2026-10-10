import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers/production-fixture.mjs';
import { installationManifest, verifyInstallation } from '../scripts/install/verify-install.mjs';

function installed(t) {
  const f=fixture(t),source=path.join(f.root,'source'),target=path.join(f.root,'installed');
  for(const [relative,text]of Object.entries({'SKILL.md':'---\nname: example\n---\n','AGENT.md':'source contract\n','agent.yaml':'name: example\n','package.json':'{"name":"rp-card-studio-agent","version":"0.13.0"}','orchestrator/routing.yaml':'stages: {}\n','internal-skills/one/SKILL.md':'skill\n','assets/example.bin':Buffer.from([0xff,0,10])}))f.write('source/'+relative,text);
  fs.cpSync(source,target,{recursive:true});return{f,source,target};
}
test('verification checks an actual copied installation without claiming discovery or writing files',t=>{
  const{source,target}=installed(t),before=fs.statSync(path.join(target,'AGENT.md')).mtimeMs;
  const result=verifyInstallation({source,target,host:'codex'});
  assert.equal(result.ok,true);assert.equal(result.skills.matched,2);assert.equal(result.hostDiscovery,'not_verified');assert.equal(result.written,false);assert.equal(result.runtime,'not_run');
  assert.equal(fs.statSync(path.join(target,'AGENT.md')).mtimeMs,before);assert.equal(result.files.expected,installationManifest(source).files.length);
});
test('missing new skill, edited files and stale managed resources are independently visible',t=>{
  const{source,target}=installed(t);fs.unlinkSync(path.join(target,'internal-skills/one/SKILL.md'));fs.appendFileSync(path.join(target,'AGENT.md'),'local change');fs.writeFileSync(path.join(target,'assets/obsolete.txt'),'old');fs.writeFileSync(path.join(target,'personal.txt'),'personal');
  const result=verifyInstallation({source,target});assert.equal(result.ok,false);assert.ok(result.files.missing.includes('internal-skills/one/SKILL.md'));assert.ok(result.files.changed.includes('AGENT.md'));assert.ok(result.files.unexpectedManaged.includes('assets/obsolete.txt'));assert.equal(fs.readFileSync(path.join(target,'personal.txt'),'utf8'),'personal');
});
test('source-tree masquerading and linked installations are refused',t=>{
  const{f,source,target}=installed(t);assert.throws(()=>verifyInstallation({source,target:source}),/源码仓库/);assert.throws(()=>verifyInstallation({source,target:path.join(source,'copy')}),/源码仓库/);
  const link=path.join(f.root,'link');fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>verifyInstallation({source,target:link}),/实际目录/);
});
test('portable text fingerprints tolerate newline conversion, binary changes do not',t=>{
  const{source,target}=installed(t);fs.writeFileSync(path.join(target,'AGENT.md'),'source contract\r\n');assert.equal(verifyInstallation({source,target}).ok,true);
  fs.writeFileSync(path.join(target,'assets/example.bin'),Buffer.from([0xff,0,11]));assert.ok(verifyInstallation({source,target}).files.changed.includes('assets/example.bin'));
});
test('DSH adapter source is owned, generated bundles and ordinary tests are excluded',t=>{
  const {f,source,target}=installed(t);f.write('source/.dsh/build.mjs','adapter source');f.write('source/.dsh/build/package.json','generated');f.write('source/.dsh/adapter-contract.test.mjs','test');
  const expected=installationManifest(source).files.map(file=>file.path);assert.ok(expected.includes('.dsh/build.mjs'));assert.equal(expected.includes('.dsh/build/package.json'),false);assert.equal(expected.includes('.dsh/adapter-contract.test.mjs'),false);
  assert.ok(verifyInstallation({source,target}).files.missing.includes('.dsh/build.mjs'));
});
