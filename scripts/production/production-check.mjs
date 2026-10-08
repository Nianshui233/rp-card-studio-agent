import fs from 'node:fs';
import path from 'node:path';
import { initProductionProject, validateProductionManifest } from './production-manifest.mjs';
import { validateInterviewGate } from './interview-gate.mjs';
import { validateInterviewCoverage, INTERVIEW_PROFILES } from './interview-coverage.mjs';
import { validateMvuCompleteness } from './mvu-completeness-gate.mjs';
import { validateEjsCompleteness } from './ejs-completeness-gate.mjs';
import { validateFrontendManifest } from './tavern-helper-carrier-gate.mjs';
import { validateDiagnosticEvents, validateReportClaim } from './diagnostic-evidence.mjs';

function option(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function readProject(root) {
  const file = path.join(root, '.rp-card', 'production.json');
  if (!fs.existsSync(file)) throw new Error('缺少 .rp-card/production.json；请先运行 production-check.mjs init');
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
    const checks = [
      validateProductionManifest(manifest, { root }),
      validateMvuCompleteness(manifest.mvu),
      validateEjsCompleteness(manifest.ejs),
      ...(['opening_frontend','message_frontend'].includes(manifest.activeStage) ? [validateFrontendManifest(manifest.frontend, { activeStage: manifest.activeStage })] : []),
      validateDiagnosticEvents(manifest.diagnostics?.events)
    ];
    if (['implementation','awaiting_review','runtime_verified','accepted'].includes(manifest.status) && ['opening_frontend','message_frontend','mvu','mvu_zod'].includes(manifest.activeStage) && !manifest.interviews?.[manifest.activeStage]) checks.push({ ok: false, issues: [`activeStage 缺少访谈覆盖：${manifest.activeStage}`] });
    for (const [stage, interview] of Object.entries(manifest.interviews ?? {})) checks.push({ stage, ...(interview.profile && INTERVIEW_PROFILES[interview.profile] ? validateInterviewCoverage(interview, interview.profile) : validateInterviewGate(interview, interview.required ?? undefined)) });
    const issues = checks.flatMap(result => result.issues ?? []);
    const result = { ok: issues.length === 0, issues, checks };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'claim') {
    const result = validateReportClaim(option('--text') || '', option('--level') || 'hypothesis');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    throw new Error('用法: node production-check.mjs init|validate|claim --root <项目目录> [--project-id id --title title --text claim --level evidence-level]');
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
