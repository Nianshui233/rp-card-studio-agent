import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { textHash } from '../production/artifact-bindings.mjs';
import { CHECK_DIR, requireArea, resolveProjectPath } from '../project-layout.mjs';
import { loadDesignGuide, designEntries } from './design-guide.mjs';
import { demosForStage } from './design-demos.mjs';

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const asset = name => path.join(agentRoot, 'assets/frontend-library', name);
export function validateDesignLibrary(stage) {
  const { catalog } = loadDesignGuide(stage), issues = [], ids = new Set(), demos = demosForStage(stage);
  for (const entry of designEntries(catalog)) {
    if (!entry.id || ids.has(entry.id)) issues.push('资料 id 缺失或重复：' + entry.id); ids.add(entry.id);
    if (!entry.title || !Array.isArray(entry.tags) || !(entry.outcome || entry.application)) issues.push('资料缺少具体用途：' + entry.id);
    if (entry.kind === 'reference') {
      if (!entry.category || !entry.question || !entry.avoid || !['public_design','public_documentation'].includes(entry.sourceKind)) issues.push('参考缺少适用问题或边界：' + entry.id);
      try { const url = new URL(entry.source); if (url.protocol !== 'https:' || url.username || url.password) throw Error(); } catch { issues.push('来源不是有效 HTTPS 入口：' + entry.id); }
    }
    if (entry.preview && !demos[entry.preview]) issues.push('演示缺失或属于另一个前端阶段：' + entry.id);
  }
  return { ok: !issues.length, stage, issues, total: ids.size, references: catalog.references?.length ?? 0, demos: Object.keys(demos).length, research: 'not_performed' };
}
export async function renderDesignLibrary(stage) {
  const validation = validateDesignLibrary(stage); if (!validation.ok) throw Error(validation.issues.join('\n'));
  const { catalog } = loadDesignGuide(stage), data = { stage, catalogSha256: textHash(JSON.stringify(catalog)), entries: designEntries(catalog), demos: demosForStage(stage) };
  const result = await build({ entryPoints: [asset('library.mjs')], bundle: true, write: false, format: 'iife', target: 'es2022', legalComments: 'inline' });
  const encoded = JSON.stringify(data).replaceAll('<', '\\u003c');
  const notice = fs.readFileSync(path.join(agentRoot, 'assets/frontend-tools/THIRD_PARTY_NOTICES.md'), 'utf8');
  return fs.readFileSync(asset('index.html'), 'utf8').replace('</head>', () => '<!--\n' + notice.replaceAll('-->', '-- >') + '\n--></head>').replace('/* RP_LIBRARY_CSS */', () => fs.readFileSync(asset('library.css'), 'utf8'))
    .replace('/* RP_LIBRARY_DATA */', () => 'window.RP_DESIGN_LIBRARY=' + encoded + ';')
    .replace('/* RP_LIBRARY_JS */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const option = flag => { const index = process.argv.indexOf(flag); if (index < 0) return undefined; const value = process.argv[index + 1]; if (!value || value.startsWith('--')) throw Error(flag + ' 缺少值'); return value; };
    const stage = option('--stage');
    if (process.argv.includes('--check')) { const result = validateDesignLibrary(stage); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
    else {
      const root = option('--root'), out = option('--out');
      if (!out) throw Error('必须明确 --out；作品项目内的输出只能位于制作文件/检查');
      if (root) requireArea(out, CHECK_DIR, '资料挑选页');
      const target = root ? resolveProjectPath(root, out, { output: true }) : path.resolve(out);
      const existed = fs.existsSync(target);
      if (existed) {
        const previous = fs.readFileSync(target);
        if (fs.lstatSync(target).isSymbolicLink() || textHash(previous) !== option('--replace-sha256') || !previous.toString('utf8').includes('window.RP_DESIGN_LIBRARY=')) throw Error('输出已存在；只允许带已核对字节摘要替换本工具当前页面，不另留旧路线');
      } else if (option('--replace-sha256')) throw Error('原页面不存在，不能使用替换摘要');
      const html = await renderDesignLibrary(stage);
      if (existed && (fs.lstatSync(target).isSymbolicLink() || textHash(fs.readFileSync(target)) !== option('--replace-sha256'))) throw Error('生成期间原页面已变化，保留用户修改');
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, html, { flag: existed ? 'w' : 'wx' });
      console.log(JSON.stringify({ ok: true, stage, path: target, sha256: textHash(html), state: 'reference_only', runtime: 'not_run', userAcceptance: 'not_recorded' }, null, 2));
    }
  } catch (error) { console.error(JSON.stringify({ ok: false, issues: [error.message] })); process.exitCode = 1; }
}
