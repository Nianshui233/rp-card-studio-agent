import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build, transform, version as esbuildVersion } from 'esbuild';
export const BUILDER_ID = 'esbuild@' + esbuildVersion;
import { parse } from 'acorn';

export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function projectPath(root, relative, { output = false } = {}) {
  if (!root || typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) throw new Error('必须提供项目内相对路径');
  const base = fs.realpathSync(root);
  const target = path.resolve(base, relative);
  const contained = value => { const rel = path.relative(base, value); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
  if (!contained(target) || target === base) throw new Error('路径越出项目或指向项目根：' + relative);
  let existing = target;
  while (!fs.existsSync(existing)) { if (!output) throw new Error('文件不存在：' + relative); existing = path.dirname(existing); }
  if (!contained(fs.realpathSync(existing))) throw new Error('路径经链接越出项目：' + relative);
  return target;
}
export function readProject(root, relative) { return fs.readFileSync(projectPath(root, relative)); }
export function readJson(root, relative) { return JSON.parse(readProject(root, relative).toString('utf8').replace(/^\uFEFF/, '')); }
export function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walkAst(child, visit)); else if (value && typeof value === 'object') walkAst(value, visit);
}
export function moduleAst(source) { return parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
export async function sourceAst(source, filename) {
  const { code } = await transform(source, { loader: filename.endsWith('.ts') ? 'ts' : 'js', target: 'es2022' });
  return moduleAst(code);
}

// esbuild never downloads providers. Only project files are bundled; remote ES imports remain literal.
export async function bundleProject(root, entry, { offline = false } = {}) {
  root = fs.realpathSync(root);
  const sourceHashes = {};
  const result = await build({
    absWorkingDir: fs.realpathSync(root), entryPoints: [entry], bundle: true, write: false,
    format: offline ? 'cjs' : 'esm', platform: 'neutral', target: 'es2022', charset: 'utf8',
    minify: false, legalComments: 'none', treeShaking: true, metafile: true, logLevel: 'silent',
    plugins: [{ name: 'project-source-boundary', setup(builder) {
      builder.onResolve({ filter: /^https?:/ }, args => {
        if (offline) throw new Error('canonical Schema 离线校验不能执行远程模块：' + args.path);
        return { path: args.path, external: true };
      });
      builder.onLoad({ filter: /.*/ }, args => {
        const relative = path.relative(root, args.path);
        const file = projectPath(root, relative);
        const bytes = fs.readFileSync(file);
        sourceHashes[relative.split(path.sep).join('/')] = hash(bytes);
        const extension = path.extname(file);
        return { contents: bytes.toString('utf8'), loader: extension === '.ts' ? 'ts' : 'js', resolveDir: path.dirname(file) };
      });
    } }],
  });
  return { code: result.outputFiles[0].text, sourceHashes, metafile: result.metafile };
}

export function artifactScripts(artifact) {
  if (Array.isArray(artifact)) return artifact.flatMap(artifactScripts);
  if (!artifact || typeof artifact !== 'object') return [];
  if (artifact.type === 'script' || (typeof artifact.content === 'string' && artifact.id)) return [artifact];
  if (Array.isArray(artifact.scripts)) return artifact.scripts.flatMap(artifactScripts);
  const scripts = (artifact.data || artifact)?.extensions?.tavern_helper?.scripts;
  return Array.isArray(scripts) ? scripts.flatMap(artifactScripts) : [];
}
