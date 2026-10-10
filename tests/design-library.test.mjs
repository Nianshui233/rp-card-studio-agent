import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers/production-fixture.mjs';
import { textHash } from '../scripts/production/artifact-bindings.mjs';
import { loadDesignGuide, searchDesignGuide, designEntries } from '../scripts/frontend/design-guide.mjs';
import { validateDesignLibrary, renderDesignLibrary } from '../scripts/frontend/design-library.mjs';
import { DESIGN_DEMOS } from '../scripts/frontend/design-demos.mjs';

test('stage libraries contain independent questions, applications, external locators and local examples', () => {
  for (const stage of ['opening_frontend','message_frontend']) {
    const checked = validateDesignLibrary(stage); assert.equal(checked.ok,true,checked.issues.join('\n')); assert.ok(checked.references >= 28); assert.equal(checked.demos,4);
    const { catalog } = loadDesignGuide(stage); for (const entry of catalog.references) assert.equal(DESIGN_DEMOS[entry.preview].stage,stage);
  }
  const a = designEntries(loadDesignGuide('opening_frontend').catalog), b = designEntries(loadDesignGuide('message_frontend').catalog);
  assert.ok(a.filter(entry=>entry.category==='角色创建').length); assert.ok(b.filter(entry=>entry.category==='人物与情报').length); assert.equal(b.some(entry=>entry.id==='opening-branching-form'),false);
});
test('natural Chinese topics are bounded by semantic tags without generic fallback or cross-stage leakage', () => {
  const result = searchDesignGuide('message_frontend','我想看人物关系网',3,{kind:'reference'});
  assert.equal(result.results[0].id,'message-social-network'); assert.equal(result.research,'not_performed'); assert.ok(result.results.length<=3);
  assert.deepEqual(searchDesignGuide('opening_frontend','unmatched-xyz').results,[]);
  assert.ok(searchDesignGuide('opening_frontend','',20,{category:'角色创建'}).results.every(entry=>entry.category==='角色创建'));
  assert.throws(()=>searchDesignGuide('message_frontend','',4,{category:'角色创建'}));
});
test('each picker is self-contained and carries only its own proposed references', async () => {
  const html = await renderDesignLibrary('opening_frontend');
  assert.match(html,/rp-card-studio\/design-selection\/v1/); assert.match(html,/opening-creation/); assert.doesNotMatch(html,/message-inventory/);
  assert.doesNotMatch(html,/<script[^>]+src=/); assert.match(html,/sandbox="allow-scripts"/); assert.match(html,/not_performed/); assert.doesNotMatch(html,/RP_LIBRARY_JS/);
});
test('the picker CLI refreshes only an explicitly matched current tool page and refuses unrelated files', t => {
  const f=fixture(t),cli=fileURLToPath(new URL('../scripts/frontend/design-library.mjs',import.meta.url)),relative='制作文件/检查/picker.html';
  const run=(...args)=>spawnSync(process.execPath,[cli,'--stage','opening_frontend','--root',f.root,'--out',relative,...args],{encoding:'utf8'});
  const first=run();assert.equal(first.status,0,first.stderr);const hash=JSON.parse(first.stdout).sha256;
  assert.equal(run().status,1);assert.equal(run('--replace-sha256',hash).status,0);
  f.write(relative,'user document');assert.equal(run('--replace-sha256',textHash('user document')).status,1);assert.equal(fs.readFileSync(path.join(f.root,relative),'utf8'),'user document');
});
