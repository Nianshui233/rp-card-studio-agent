import { readProjectState } from '../continuation/ledger-transition.mjs';
import { textHash } from './artifact-bindings.mjs';
import { validateProductionProject } from './production-project.mjs';
import fs from 'node:fs';
import { STATE_DIR, resolveProjectPath } from '../project-layout.mjs';
import path from 'node:path';
import { initProductionProject } from './production-manifest.mjs';
import { validateReportClaim } from './diagnostic-evidence.mjs';

function option(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function readProject(root) {
  const file = resolveProjectPath(root, STATE_DIR + '/production.json');
  if (!fs.existsSync(file)) throw new Error('缺少 制作文件/项目记录/production.json；请先运行 production-check.mjs init');
  return { file, manifest: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

const command = process.argv[2];
try {
  const root = path.resolve(option('--root') || process.cwd());
  if (command === 'init') {
    const result = initProductionProject(root, { projectId: option('--project-id'), title: option('--title') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (command === 'validate') {
    const { manifest } = readProject(root);
    const result = await validateProductionProject(manifest, { root, final: process.argv.includes('--final') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'decision-ref') {
    const { ledger } = readProjectState(root);
    const decision = ledger.decisions?.find(d => d.id === option('--id'));
    if (!decision || !['user_confirmed','delegated','material_fact'].includes(decision.sourceKind)) throw new Error('决定不存在或未生效；不能制造确认');
    process.stdout.write(JSON.stringify({ ok: true, sourceKind: decision.sourceKind, text: decision.text, ref: { id: decision.id, textSha256: textHash(decision.text) } }, null, 2) + '\n');
  } else if (command === 'claim') {
    const result = validateReportClaim(option('--text') || '', option('--level') || 'hypothesis');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    throw new Error('用法: node production-check.mjs init|validate|decision-ref|claim --root <项目目录> [--final --project-id id --title title --text claim --level evidence-level]');
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
