import fs from 'node:fs';
import { ensureProjectFolders } from '../project-layout.mjs';
import os from 'node:os';
import path from 'node:path';
import { MVU_ZOD_SOURCE_CONTRACT_SCHEMA, buildMvuZodProject } from './validate-mvu-zod-source-contract.mjs';
export async function createSourceFixture(t) {
  const root = ensureProjectFolders(fs.mkdtempSync(path.join(os.tmpdir(), 'rp-mvu-contract-')));
  t.after(() => { if (fs.realpathSync(path.dirname(root)) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('rp-mvu-contract-')) throw new Error('拒绝清理非测试目标'); fs.rmSync(root, { recursive: true, force: true }); });
  const write = (file, value) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); };
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const contract = {
    schema: MVU_ZOD_SOURCE_CONTRACT_SCHEMA, title: '回归场景', outputDialect: 'json_patch',
    paths: { schemaSource: '制作文件/运行源码/schema.ts', registrationSource: '制作文件/运行源码/脚本/index.ts', loaderSource: '制作文件/运行源码/loader.js', runtimeContract: '制作文件/配置/MVU运行合同.yaml', regexArtifact: '导入包/正则.json',
      initvar: '制作文件/运行源码/initvar.yaml', variableList: '制作文件/运行源码/变量列表.txt', updateRules: '制作文件/运行源码/更新规则.yaml', pathIndex: '制作文件/运行源码/路径索引.md',
      outputFormat: '制作文件/运行源码/输出格式.txt', fixtures: '制作文件/检查/用例/schema.json', importArtifact: '导入包/MVU.json', worldbookArtifact: '导入包/世界书.json', cardArtifact: '导入包/角色卡.json', buildRecord: '制作文件/项目记录/mvu-build.json' },
    providers: { versionPolicy: 'tutorial_default', loader: 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js',
      zod: 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js' },
    scriptIds: { loader: 'loader-test', registration: 'schema-test' }, runtime: { status: 'not_run' },
  };
  write(contract.paths.schemaSource, "export const Schema = z.object({ 世界: z.object({ 时间: z.coerce.number().prefault(0), 模式: z.enum(['白天', '夜晚']).prefault('白天') }).prefault({}) });\n");
  write(contract.paths.registrationSource, "import { registerMvuSchema } from '" + contract.providers.zod + "';\nimport { Schema } from '../schema';\n$(() => { registerMvuSchema(Schema); });\n");
  write(contract.paths.loaderSource, "import '" + contract.providers.loader + "';\n");
  write(contract.paths.initvar, '世界:\n  时间: 0\n  模式: 白天\n');
  write(contract.paths.variableList, '<status_current_variable>\n{{format_message_variable::stat_data}}\n</status_current_variable>');
  write(contract.paths.updateRules, '世界:\n  check: 仅依据当前回复发生的时间推进更新，没有事实不更新。');
  write(contract.paths.pathIndex, '/世界/时间\n/世界/模式');
  write(contract.paths.outputFormat, '<UpdateVariable><Analysis>核对当前回复变化。</Analysis><JSONPatch>[{"op":"replace","path":"/世界/时间","value":1}]</JSONPatch></UpdateVariable>');
  write(contract.paths.fixtures, [{ name: 'default-coerce', expected: 'accept', input: { 世界: { 时间: '7' } }, output: { 世界: { 时间: 7, 模式: '白天' } } },
    { name: 'invalid-enum', expected: 'reject', input: { 世界: { 模式: '不存在' } } }]);
  const keys = ['initvar', 'variableList', 'updateRules', 'pathIndex', 'outputFormat'];
  contract.worldbookBindings = keys.map((key, id) => ({ entryId: id, sources: [key] }));
  write(contract.paths.worldbookArtifact, { name: '世界书', entries: Object.fromEntries(keys.map((key, id) => [id, { uid: id, comment: ({initvar:'[initvar]变量初始化',variableList:'变量列表',updateRules:'[mvu_update]变量更新规则',pathIndex:'变量路径索引',outputFormat:'[mvu_update]变量输出格式'})[key], content: read(contract.paths[key]), position: 4, depth: 0, constant: key !== 'initvar', probability: 100, disable: key === 'initvar' }])) });
  write(contract.paths.cardArtifact, { spec: 'chara_card_v3', spec_version: '3.0', data: { name: '回归场景', extensions: { world: '世界书' }, first_mes: '回归场景。', alternate_greetings: [] } });
  write(contract.paths.runtimeContract, 'mvu:\n  mode: mvu_zod\n  init_strategy: worldbook\n  update_dialect: json_patch\n  loader:\n    url: ' + contract.providers.loader + '\n  zod:\n    provider_url: ' + contract.providers.zod + '\n');
  write(contract.paths.regexArtifact, [{ id: 'history-update', scriptName: '历史更新Prompt清理', findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/g', replaceString: '', placement: [2], disabled: false, trimStrings: [], substituteRegex: 0, minDepth: null, maxDepth: null, promptOnly: true, markdownOnly: false, runOnEdit: false }]);
  await buildMvuZodProject(contract, { root });
  write('制作文件/项目记录/mvu-source-contract.json', contract);
  return { root, contract, write, read };
}
