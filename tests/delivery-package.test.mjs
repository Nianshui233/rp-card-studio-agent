import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeliveryPackage } from '../scripts/forge/delivery-package.mjs';
import { makeProject } from '../scripts/forge/project.mjs';

test('delivery package splits card, worldbook, regex, helper script, and complete HTML', async () => {
  const project = makeProject({ name: '分件交付测试', nsfw: false });
  const source = {
    payload: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: '分件交付测试',
        description: '入口',
        first_mes: '<开场/>',
        character_book: {
          name: '分件交付测试 世界书',
          entries: [{ id: 1, keys: ['世界'], comment: '世界条目', content: '世界内容', enabled: true, constant: true, insertion_order: 10 }],
        },
        extensions: {
          regex_scripts: [
            {
              id: 'html-regex',
              scriptName: '状态栏',
              findRegex: '/<status\\/>/g',
              replaceString: '<!doctype html><html><head><style>body{color:red}</style></head><body><button>状态</button><script>console.log(1)</script></body></html>',
            },
            {
              id: 'hide-regex',
              scriptName: '隐藏更新',
              findRegex: '/<update>[\\s\\S]*?<\\/update>/g',
              replaceString: '',
            },
          ],
          tavern_helper: {
            scripts: [{ type: 'script', id: 'helper-1', name: '变量更新', content: 'console.log("ok")' }],
          },
        },
      },
    },
    consumedSources: [],
    restoredPaths: [],
  };
  const result = await buildDeliveryPackage({ project, projectRoot: process.cwd(), source, outputRoot: 'dist/分件交付测试' });
  const paths = result.files.map((file) => file.relativePath);
  assert.ok(paths.some((file) => file.endsWith('/02_角色卡/分件交付测试.json')));
  assert.ok(paths.some((file) => file.endsWith('/03_世界书/分件交付测试 世界书.json')));
  assert.ok(paths.some((file) => file.endsWith('/04_正则/状态栏.json')));
  assert.ok(paths.some((file) => file.endsWith('/05_前端/状态栏.html')));
  assert.ok(paths.some((file) => file.endsWith('/06_酒馆助手/变量更新.json')));

  const card = JSON.parse(result.files.find((file) => file.relativePath.endsWith('/02_角色卡/分件交付测试.json')).content);
  assert.equal(card.data.character_book, undefined);
  const worldbook = JSON.parse(result.files.find((file) => file.relativePath.endsWith('/03_世界书/分件交付测试 世界书.json')).content);
  assert.ok(worldbook.entries['0']);
  const regex = JSON.parse(result.files.find((file) => file.relativePath.endsWith('/04_正则/状态栏.json')).content);
  assert.equal(regex.replaceString, '');
  const html = result.files.find((file) => file.relativePath.endsWith('/05_前端/状态栏.html')).content;
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<body[\s>]/i);
  assert.match(html, /<style[\s>]/i);
  assert.match(html, /<script[\s>]/i);
  assert.equal(result.manifest.delivery_mode, 'rp_project_package');
});
