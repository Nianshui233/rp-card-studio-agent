import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { parseDocument } from 'yaml';
import { validateMvuOutputFormat, parseMvuContract, validateMvuPackage } from './validate-mvu-package.mjs';
import { BUILDER_ID, hash, projectPath, readProject, readJson, bundleProject, sourceAst, moduleAst, walkAst, artifactScripts } from './mvu-source-tools.mjs';

export const MVU_ZOD_SOURCE_CONTRACT_SCHEMA = 'rp-card-studio/mvu-zod-source-contract/v1';
export const REQUIRED_RUNTIME_STEPS = ['loader_registered', 'schema_registered', 'initvar_initialized', 'prompt_processed', 'update_parsed', 'message_readback', 'save_reload_readback'];
const REQUIRED_PATHS = ['schemaSource', 'registrationSource', 'loaderSource', 'runtimeContract', 'regexArtifact', 'initvar', 'variableList', 'updateRules', 'pathIndex', 'outputFormat', 'fixtures', 'importArtifact', 'worldbookArtifact', 'cardArtifact', 'buildRecord'];
const OUTPUT_FILES = { registration: 'registration.js', loader: 'loader.js', schema: 'schema.json', normalizedInitvar: 'initvar.normalized.json' };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (root, name) => readProject(root, name).toString('utf8');
function yamlObject(source, label) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error(label + ' YAML 不合法：' + document.errors.map(e => e.message).join('; '));
  const data = document.toJS({ maxAliasCount: 100 });
  if (!object(data) || Object.hasOwn(data, 'stat_data')) throw new Error(label + ' 必须是状态树，不能再包裹 stat_data');
  return data;
}
function providerImports(ast) { return ast.body.filter(n => n.type === 'ImportDeclaration').map(n => n.source.value); }
function registrationCalls(ast) {
  const names = new Set();
  for (const item of ast.body.filter(n => n.type === 'ImportDeclaration'))
    for (const s of item.specifiers) if (s.imported?.name === 'registerMvuSchema') names.add(s.local.name);
  let count = 0;
  walkAst(ast, node => { if (node.type === 'CallExpression' && names.has(node.callee?.name)) count++; });
  return count;
}
function validateRuntime(runtime, root, artifactHash, sourceHashes, issues) {
  if (!object(runtime) || !['not_run', 'failed', 'pass'].includes(runtime.status)) { issues.push('runtime 必须明确为 not_run/failed/pass'); return; }
  if (runtime.status !== 'pass') return;
  try {
    if (!runtime.recordPath || !/^[a-f0-9]{64}$/.test(runtime.recordHash || '')) throw new Error('缺少真实运行记录文件及哈希');
    const bytes = readProject(root, runtime.recordPath);
    if (hash(bytes) !== runtime.recordHash) throw new Error('运行记录哈希不一致');
    const record = JSON.parse(bytes.toString('utf8'));
    if (record.artifactHash !== artifactHash) throw new Error('运行记录不属于当前精确导入制品');
    if (!isDeepStrictEqual(record.sourceHashes, sourceHashes)) throw new Error('运行记录绑定的 Schema/Prompt/世界书/开局输入已经变化');
    if (record.host?.kind !== 'sillytavern' || !record.host.sillytavern || !record.host.tavernHelper || !record.host.mvu || !record.host.zod || !record.capturedAt || !record.captureMethod) throw new Error('缺少真实宿主、扩展版本、记录时间或采集方法');
    for (const step of REQUIRED_RUNTIME_STEPS) {
      const evidence = record.steps?.[step];
      if (!object(evidence) || evidence.observed !== true || !evidence.files?.length || !evidence.observation) throw new Error('runtime pass 缺少证据：' + step);
      for (const file of evidence.files) if (!/^[a-f0-9]{64}$/.test(file.sha256 || '') || hash(readProject(root, file.path)) !== file.sha256) throw new Error('运行证据缺失或漂移：' + step);
    }
  } catch (error) { issues.push('runtime pass 无法核验：' + error.message); }
}

// This computes results from actual files. Inline source/status strings cannot stand in for a production project.
export async function inspectMvuZodSources(contract, { root } = {}) {
  if (!object(contract) || contract.schema !== MVU_ZOD_SOURCE_CONTRACT_SCHEMA) throw new Error('MVU_ZOD source contract 必须是 ' + MVU_ZOD_SOURCE_CONTRACT_SCHEMA);
  if (!root) throw new Error('MVU_ZOD source contract 需要真实项目 root');
  for (const name of REQUIRED_PATHS) if (!contract.paths?.[name]) throw new Error('source contract 缺少 paths.' + name);
  const p = contract.paths;
  const issues = [];
  const sources = {};
  const sourceHashes = {};
  for (const name of REQUIRED_PATHS.filter(n => !['importArtifact', 'worldbookArtifact', 'cardArtifact', 'buildRecord'].includes(n))) {
    const bytes = readProject(root, p[name]); sources[name] = bytes.toString('utf8'); sourceHashes[p[name].replaceAll('\\', '/')] = hash(bytes);
  }
  const registration = await bundleProject(root, p.registrationSource);
  const schemaBundle = await bundleProject(root, p.schemaSource, { offline: true });
  Object.assign(sourceHashes, registration.sourceHashes, schemaBundle.sourceHashes);
  if (!Object.keys(registration.sourceHashes).includes(p.schemaSource.replaceAll('\\', '/'))) issues.push('注册入口没有导入 canonical Schema 模块');
  const registrationAst = moduleAst(registration.code);
  if (registrationCalls(registrationAst) !== 1) issues.push('注册入口必须导入并调用一次真实 registerMvuSchema');
  const providerUrls = providerImports(registrationAst).filter(url => /\/dist\/util\/mvu_zod\.js$/.test(url));
  if (providerUrls.length !== 1 || providerUrls[0] !== contract.providers?.zod) issues.push('注册入口的 provider 与合同 providers.zod 不一致或缺失');
  if (!/waitGlobalInitialized|\$\s*\(/.test(registration.code)) issues.push('注册入口缺少宿主 Ready / MVU 就绪协调');
  const loaderAst = await sourceAst(sources.loaderSource, p.loaderSource);
  const loaderUrls = providerImports(loaderAst);
  if (loaderAst.body.length !== 1 || loaderUrls.length !== 1 || !/\/MagVarUpdate(?:@[^/]+)?\/artifact\/bundle\.js$/.test(loaderUrls[0]) || loaderUrls[0] !== contract.providers?.loader) issues.push('Loader 必须保留合同指定的单一静态 import，不拼接自制初始化包装');
  for (const url of [...providerUrls, ...loaderUrls]) {
    if (!url.startsWith('https://')) issues.push('provider 需要 HTTPS：' + url);
    if (contract.providers?.versionPolicy === 'pinned' && (!/@[^/]+\//.test(url) || /@(?:main|master|head|latest|dev|develop)\//i.test(url))) issues.push('项目要求 pinned，但 provider 未锁定 tag/commit：' + url);
  }
  if (!['tutorial_default', 'pinned'].includes(contract.providers?.versionPolicy)) issues.push('providers.versionPolicy 必须明确 tutorial_default 或 pinned');
  const runtimeContract = parseMvuContract(sources.runtimeContract);
  if (!['worldbook', 'greeting'].includes(runtimeContract.init_strategy)) issues.push('运行合同必须明确 worldbook 或 greeting 初始化策略');
  if (contract.patchMoveTarget && runtimeContract.patch_move_target && contract.patchMoveTarget !== runtimeContract.patch_move_target) issues.push('sourceContract 与运行合同 move 目标字段不一致');
  const contractEntries = {};
  const worldbookBytes = readProject(root, p.worldbookArtifact);
  const cardBytes = readProject(root, p.cardArtifact);
  sourceHashes[p.worldbookArtifact] = hash(worldbookBytes); sourceHashes[p.cardArtifact] = hash(cardBytes);
  const worldbook = JSON.parse(worldbookBytes.toString('utf8'));
  const rawEntries = worldbook.entries || {};
  const entries = Object.entries(rawEntries).map(([id, entry]) => ({ id: String(entry.uid ?? entry.id ?? id), entry }));
  const bound = new Set();
  for (const binding of contract.worldbookBindings || []) {
    const matches = entries.filter(item => item.id === String(binding.entryId));
    const keys = binding.sources || [];
    if (!keys.length || keys.some(key => !['initvar', 'variableList', 'updateRules', 'pathIndex', 'outputFormat'].includes(key))) throw new Error('世界书绑定包含未知/空 source key');
    const expected = keys.map(key => sources[key]).join(binding.separator ?? '\n');
    if (matches.length !== 1 || matches[0].entry.content !== expected) issues.push('世界书导入内容与 canonical 源漂移：' + binding.entryId);
    const entry = matches[0]?.entry;
    for (const key of keys) if (entry) contractEntries[key] = entry;
    if (keys.includes('initvar') && keys.length !== 1) issues.push('initvar 数据条目不能与普通 Prompt 合并');
    if (entry && keys.includes('initvar') && (!/\[initvar\]/i.test(entry.comment || entry.name || '') || entry.disable !== true)) issues.push('基线 initvar 必须使用禁用的 [initvar] 条目');
    if (entry && !keys.includes('initvar') && (entry.disable === true || entry.enabled === false)) issues.push('变量 Prompt 条目被禁用：' + binding.entryId);
    if (entry && keys.includes('variableList')) {
      if (/\[mvu_plot\]/i.test(entry.comment || entry.name || '') && !/\[mvu_update\]/i.test(entry.comment || entry.name || '')) issues.push('更新模型无法收到当前变量列表');
      if (Number(entry.position) !== 4 || ![0, 1].includes(Number(entry.depth))) issues.push('当前变量列表必须靠近最新剧情 D0/D1');
    }
    keys.forEach(key => bound.add(key));
  }
  for (const key of [...(runtimeContract.init_strategy === 'worldbook' ? ['initvar'] : []), 'variableList', 'updateRules', 'pathIndex', 'outputFormat']) if (!bound.has(key)) issues.push('canonical 组件没有绑定到最终世界书：' + key);
  const baseline = yamlObject(sources.initvar, 'initvar');
  let fixtures;
  try { fixtures = JSON.parse(sources.fixtures); } catch { throw new Error('fixtures 必须是 JSON'); }
  if (!Array.isArray(fixtures) || !fixtures.length) throw new Error('缺少实际项目的 Schema fixtures');
  if (new Set(fixtures.map(item => item.name)).size !== fixtures.length || fixtures.some(item => item.name === 'baseline' || item.name?.startsWith('greeting:'))) throw new Error('fixture 名称重复或使用保留名称');
  const cases = [{ name: 'baseline', input: baseline, expected: 'accept' }];
  for (const item of fixtures) {
    if (!item.name || !['accept', 'reject'].includes(item.expected) || !Object.hasOwn(item, 'input')) throw new Error('fixture 必须提供 name/input/expected');
    cases.push(item);
  }
  for (const greeting of contract.greetings || []) {
    const bytes = readProject(root, greeting.path); sourceHashes[greeting.path] = hash(bytes);
    if (greeting.kind !== 'full') throw new Error('增量 Greeting 使用目标 MVU parser 做更新回归，不能当作部分 initvar');
    cases.push({ name: 'greeting:' + greeting.path, input: yamlObject(bytes.toString('utf8'), greeting.path), expected: 'accept' });
  }
  const card = JSON.parse(cardBytes.toString('utf8'));
  const data = card.data || card;
  const greetings = [data.first_mes, ...(data.alternate_greetings || [])];
  for (const [i, greeting] of greetings.entries()) for (const match of String(greeting || '').matchAll(/<initvar>([\s\S]*?)<\/initvar>/gi)) {
    cases.push({ name: 'greeting:card:' + i, input: yamlObject(match[1], 'Greeting ' + i), expected: 'accept' });
  }
  const worker = spawnSync(process.execPath, [fileURLToPath(new URL('./schema-offline-worker.mjs', import.meta.url))], {
    input: JSON.stringify({ code: schemaBundle.code, cases }), encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 16 * 1024 * 1024,
  });
  if (worker.error) throw new Error('Schema 离线执行失败：' + worker.error.message);
  let offline;
  try { offline = JSON.parse(worker.stdout); } catch { throw new Error('Schema 离线执行没有返回可用报告：' + worker.stderr); }
  if (!offline.ok) throw new Error('Schema 离线执行失败：' + offline.error);
  for (const [i, result] of offline.results.entries()) {
    if (result.success !== (cases[i].expected === 'accept')) issues.push('Schema fixture 结果不符合预期：' + result.name);
    if (result.success && Object.hasOwn(cases[i], 'output') && !isDeepStrictEqual(result.data, cases[i].output)) issues.push('Schema fixture 转换/default 结果不一致：' + result.name);
  }
  const normalizedInitvar = offline.results[0].data;
  const schemaKeys = Object.keys(offline.jsonSchema.properties || normalizedInitvar || {});
  if (!schemaKeys.length) issues.push('canonical Schema 必须产出对象状态根');
  for (const name of ['baseline', ...cases.filter(c => c.name.startsWith('greeting:')).map(c => c.name)]) {
    const item = cases.find(c => c.name === name);
    for (const key of schemaKeys) if (!Object.hasOwn(item.input, key)) issues.push(name + ' 全量初态缺少状态根：' + key);
    for (const key of Object.keys(item.input)) if (!schemaKeys.includes(key)) issues.push(name + ' 初态出现 Schema 外状态根：' + key);
  }
  if (!/format_message_variable::stat_data/.test(sources.variableList)) issues.push('变量列表缺少当前 stat_data 的真实宏投影');
  for (const key of schemaKeys) {
    if (!sources.updateRules.includes(key)) issues.push('更新规则缺少状态根：' + key);
    if (!sources.pathIndex.includes('/' + key) && !/format_message_variable::stat_data/.test(sources.pathIndex)) issues.push('路径索引缺少状态根：' + key);
  }
  if (!/check|更新条件/.test(sources.updateRules)) issues.push('更新规则缺少 check/更新条件');
  if (!/<UpdateVariable>[\s\S]*<\/UpdateVariable>/.test(sources.outputFormat)) issues.push('输出格式缺少完整 UpdateVariable');
  if (!['json_patch', 'lodash'].includes(contract.outputDialect)) issues.push('必须声明输出方言');
  if (contract.outputDialect === 'json_patch' && !/<JSONPatch>/.test(sources.outputFormat)) issues.push('JSON Patch 输出合同缺失');
  if (contract.outputDialect === 'lodash' && !/_\.(?:set|add|assign|insert|remove|unset)\s*\(/.test(sources.outputFormat)) issues.push('lodash 输出合同缺失');
  if (/<JSONPatch>/.test(sources.outputFormat) && /_\.(?:set|add|assign|insert|remove|unset)\s*\(/.test(sources.outputFormat)) issues.push('输出格式混用方言');
  issues.push(...validateMvuOutputFormat(sources.outputFormat, { dialect: contract.outputDialect, moveTarget: runtimeContract.patch_move_target || contract.patchMoveTarget || 'to', indexText: sources.pathIndex }).issues);
  for (const fixture of fixtures.filter(item => item.updateMessage)) issues.push(...validateMvuOutputFormat(fixture.updateMessage, { dialect: contract.outputDialect, moveTarget: contract.patchMoveTarget || 'to', indexText: sources.pathIndex }).issues.map(issue => fixture.name + ': ' + issue));
  const outputs = {
    registration: registration.code, loader: sources.loaderSource,
    schema: JSON.stringify(offline.jsonSchema, null, 2) + '\n',
    normalizedInitvar: JSON.stringify(normalizedInitvar ?? null, null, 2) + '\n',
  };
  if (runtimeContract.mode !== 'mvu_zod' || runtimeContract.update_dialect !== contract.outputDialect || runtimeContract.loader?.url !== contract.providers?.loader || runtimeContract.zod?.provider_url !== contract.providers?.zod) issues.push('运行合同与 sourceContract mode/方言/provider 不一致');
  const generatedFolder = { type: 'folder', scripts: [{ type: 'script', name: 'MVU变量框架', id: contract.scriptIds?.loader, content: outputs.loader }, { type: 'script', name: '变量结构', id: contract.scriptIds?.registration, content: outputs.registration }] };
  const packageCheck = validateMvuPackage({ card, worldbook, scriptFolder: generatedFolder, regex: JSON.parse(sources.regexArtifact), zodSource: outputs.registration, mvuContract: runtimeContract }, { mode: 'mvu_zod', initStrategy: runtimeContract.init_strategy, dialect: contract.outputDialect, schemaKeys, contractEntries, allowEmbeddedCharacterBook: contract.allowEmbeddedCharacterBook === true });
  issues.push(...packageCheck.issues);
  return { issues, sources, sourceHashes: Object.fromEntries(Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b))), schemaKeys, outputs, fixtures: offline.results, offlineZodVersion: offline.zodVersion };
}

export async function validateMvuZodSourceContract(contract, options = {}) {
  const issues = [];
  try {
    const inspected = await inspectMvuZodSources(contract, options);
    issues.push(...inspected.issues);
    const record = readJson(options.root, contract.paths.buildRecord);
    if (record.schema !== 'rp-card-studio/mvu-zod-build/v1' || !isDeepStrictEqual(record.sourceHashes, inspected.sourceHashes)) issues.push('构建记录与当前 source hashes 不一致');
    if (record.offlineZodVersion !== inspected.offlineZodVersion || record.builder !== BUILDER_ID) issues.push('构建工具/离线 Zod 版本不一致');
    for (const [name, content] of Object.entries(inspected.outputs)) {
      const output = record.outputs?.[name];
      if (!output?.path || output.sha256 !== hash(content) || !readProject(options.root, output.path).equals(Buffer.from(content))) issues.push('重建输出漂移：' + name);
    }
    const artifactBytes = readProject(options.root, contract.paths.importArtifact);
    const artifactHash = hash(artifactBytes);
    if (record.artifactHash !== artifactHash) issues.push('importArtifact 实际哈希与构建记录不一致');
    const scripts = artifactScripts(JSON.parse(artifactBytes.toString('utf8')));
    for (const [name, content] of [['loader', inspected.outputs.loader], ['registration', inspected.outputs.registration]]) {
      const matches = scripts.filter(s => s.id === contract.scriptIds?.[name]);
      if (matches.length !== 1 || matches[0].content !== content || matches[0].enabled !== true) issues.push('最终导入脚本与重建内容不一致、未启用或不唯一：' + name);
    }
    const loaders = scripts.filter(s => /MagVarUpdate(?:@[^/]+)?\/artifact\/bundle\.js/.test(s.content || ''));
    const registrars = scripts.filter(s => /registerMvuSchema/.test(s.content || ''));
    if (loaders.length !== 1 || registrars.length !== 1) issues.push('最终导入制品重复/缺少 Loader 或注册器');
    for (const script of scripts) try { moduleAst(script.content); } catch (error) { issues.push('最终导入脚本语法错误：' + script.name + ': ' + error.message); }
    validateRuntime(contract.runtime, options.root, artifactHash, inspected.sourceHashes, issues);
    return { ok: issues.length === 0, issues, schemaKeys: inspected.schemaKeys, artifactHash,
      offline: { zodVersion: inspected.offlineZodVersion, fixtures: inspected.fixtures }, runtimeStatus: contract.runtime?.status === 'pass' ? 'evidence_bound_not_runtime_verified' : contract.runtime?.status ?? 'not_run', runtimeVerifiedByThisTool: false, evidenceLevel: 'offline_only' };
  } catch (error) { issues.push(error.message); return { ok: false, issues, evidenceLevel: 'offline_only' }; }
}

export async function buildMvuZodProject(contract, { root, outputDir = '配置/MVU/build' } = {}) {
  const inspected = await inspectMvuZodSources(contract, { root });
  if (inspected.issues.length) throw new Error(inspected.issues.join('\n'));
  const outputPaths = Object.fromEntries(Object.entries(OUTPUT_FILES).map(([name, filename]) => [name, outputDir.replaceAll('\\', '/') + '/' + filename]));
  const targets = [...Object.values(outputPaths), contract.paths.importArtifact, contract.paths.buildRecord];
  const inputFiles = new Set(Object.keys(inspected.sourceHashes).map(p => projectPath(root, p)));
  const resolved = targets.map(p => projectPath(root, p, { output: true }));
  if (new Set(resolved).size !== resolved.length || resolved.some(p => inputFiles.has(p))) throw new Error('拒绝让构建输出覆盖源码或彼此重叠');
  const scripts = Object.entries({ loader: inspected.outputs.loader, registration: inspected.outputs.registration }).map(([name, content]) => ({
    button: { enabled: true, buttons: [] }, data: {}, ...(contract.scriptMetadata?.[name] || {}),
    type: 'script', id: contract.scriptIds?.[name], name: contract.scriptNames?.[name] || (name === 'loader' ? 'MVU变量框架' : '变量结构'), content, enabled: true,
  }));
  if (scripts.some(s => typeof s.id !== 'string' || !s.id) || scripts[0].id === scripts[1].id) throw new Error('需要两个唯一 scriptIds.loader/registration');
  if (fs.existsSync(projectPath(root, contract.paths.importArtifact, { output: true }))) {
    const existing = readJson(root, contract.paths.importArtifact);
    const ids = new Set(scripts.map(s => s.id));
    if (artifactScripts(existing).some(s => !ids.has(s.id))) throw new Error('生成目标还含项目自定义脚本；请使用独立构建目录，不覆盖这些组件');
  }
  const artifactText = JSON.stringify({ ...(contract.folderMetadata || {}), type: 'folder', name: contract.title || 'MVU', scripts }, null, 2) + '\n';
  const record = { schema: 'rp-card-studio/mvu-zod-build/v1', builder: BUILDER_ID, offlineZodVersion: inspected.offlineZodVersion,
    sourceHashes: inspected.sourceHashes, outputs: Object.fromEntries(Object.entries(inspected.outputs).map(([name, content]) => [name, { path: outputPaths[name], sha256: hash(content) }])),
    artifactHash: hash(artifactText), evidenceLevel: 'offline_only' };
  for (const [name, content] of Object.entries(inspected.outputs)) { const file = projectPath(root, outputPaths[name], { output: true }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  for (const [relative, content] of [[contract.paths.importArtifact, artifactText], [contract.paths.buildRecord, JSON.stringify(record, null, 2) + '\n']]) { const file = projectPath(root, relative, { output: true }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
  return { record, outputs: outputPaths, runtimeStatus: 'not_run' };
}
