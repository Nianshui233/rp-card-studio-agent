import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SOURCE_DIR, CODE_DIR, CONFIG_DIR, CHECK_DIR, BUILD_DIR, DELIVERY_DIR, STATE_DIR, resolveProjectPath, requireArea } from '../project-layout.mjs';

export const CHECK_PLAN_SCHEMA = 'rp-card-studio/check-plan/v1';
export const CHECK_REPORT_SCHEMA = 'rp-card-studio/check-report/v1';
const WATCHED = [SOURCE_DIR, CODE_DIR, CONFIG_DIR, CHECK_DIR, BUILD_DIR, DELIVERY_DIR];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

export function assessCommand(result, step) {
  const issues = [];
  if (result.error) issues.push('执行失败：' + result.error.message);
  if (result.status !== 0 || result.signal) issues.push('进程未成功结束：' + String(result.status ?? result.signal));
  let payload = null;
  if (step.result !== 'exit' || step.kind === 'check') {
    try {
      payload = JSON.parse(String(result.stdout ?? '').replace(/^\uFEFF/, '').trim());
      if (payload?.ok !== true) issues.push('检查未明确返回 ok:true');
      if (Array.isArray(payload?.issues) && payload.issues.length) issues.push('检查含未解决 issues');
      for (const children of [payload?.results, payload?.checks]) if (Array.isArray(children) && children.some(r => r?.ok === false || r?.passed === false)) issues.push('检查含失败子项');
      if (Number.isInteger(payload?.total) && (payload.total === 0 || payload.passed !== payload.total)) issues.push('检查未全部通过或没有执行用例');
    } catch { issues.push('必须输出一份完整 JSON 结果，不能只打印勾选或成功文字'); }
  }
  return { ok: issues.length === 0, issues, payload, exitCode: result.status, stderr: String(result.stderr ?? '') };
}

export function validateCheckPlan(plan) {
  const issues = [], ids = new Set();
  if (plan?.schema !== CHECK_PLAN_SCHEMA || !Array.isArray(plan?.steps) || !plan.steps.length) return { ok: false, issues: ['缺少有效 check-plan 与 steps'] };
  let checksStarted = false;
  for (const step of plan.steps) {
    if (!step?.id || ids.has(step.id)) issues.push('步骤 id 缺失或重复');
    if (!['build', 'check'].includes(step?.kind)) issues.push('未知步骤 kind：' + step?.id);
    if (step?.kind === 'check') checksStarted = true;
    if (checksStarted && step?.kind === 'build') issues.push('最终检查开始后不得再次构建，否则检查证据已过期：' + step.id);
    if (!Array.isArray(step?.args) || step.args.some(a => typeof a !== 'string')) issues.push('args 必须是字符串数组：' + step?.id);
    if (step?.kind === 'check' && step.result !== 'json') issues.push('check 必须使用 JSON 结果：' + step?.id);
    if (!['json', 'exit'].includes(step?.result)) issues.push('result 必须声明 json 或 exit：' + step?.id);
    if (!['project', 'agent'].includes(step?.cwd)) issues.push('cwd 必须声明 project 或 agent：' + step?.id);
    if (step?.dependsOn !== undefined && (!Array.isArray(step.dependsOn) || step.dependsOn.some(d => typeof d !== 'string'))) issues.push('dependsOn 必须是 id 数组');
    for (const dep of Array.isArray(step?.dependsOn) ? step.dependsOn : []) if (!ids.has(dep)) issues.push('依赖必须已在前序步骤完成：' + step.id + ' -> ' + dep);
    ids.add(step?.id);
  }
  if (!plan.steps.some(s => s.kind === 'check')) issues.push('不能只有构建、没有最终检查');
  return { ok: issues.length === 0, issues };
}

export function snapshotProject(root, { reportPath = STATE_DIR + '/check-report.json' } = {}) {
  const files = [];
  function walk(relative) {
    let directory; try { directory = resolveProjectPath(root, relative); } catch (e) { if (!fs.existsSync(path.join(root, relative))) return; throw e; }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = relative + '/' + entry.name;
      if (next === reportPath || next === STATE_DIR + '/检查结果' || [STATE_DIR + '/acceptance.json', STATE_DIR + '/materials.json'].includes(next)) continue;
      if (relative === STATE_DIR && entry.isFile() && !entry.name.endsWith('.json')) continue;
      const resolved = resolveProjectPath(root, next);
      if (fs.statSync(resolved).isDirectory()) {
        if (entry.isSymbolicLink()) throw new Error('检查输入目录不能是链接：' + next);
        walk(next);
      } else files.push({ path: next, sha256: sha(fs.readFileSync(resolved)) });
    }
  }
  for (const area of [...WATCHED, STATE_DIR]) walk(area);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function runCheckPlan(plan, { root, agentRoot, reportPath = STATE_DIR + '/check-report.json', execute = spawnSync } = {}) {
  const validation = validateCheckPlan(plan);
  const report = { schema: CHECK_REPORT_SCHEMA, ok: false, level: 'automated', planSha256: sha(JSON.stringify(plan)), issues: [...validation.issues], steps: [], files: [] };
  if (!validation.ok) return report;
  const expand = value => value.replaceAll('${projectRoot}', path.resolve(root)).replaceAll('${agentRoot}', path.resolve(agentRoot));
  let beforeChecks = null;
  for (const step of plan.steps) {
    if (step.kind === 'check' && beforeChecks === null) beforeChecks = snapshotProject(root, { reportPath });
    const result = execute(step.program === 'node' || !step.program ? process.execPath : expand(step.program), step.args.map(expand), {
      cwd: step.cwd === 'agent' ? agentRoot : root, encoding: 'utf8', shell: false, timeout: step.timeoutMs ?? 120000, maxBuffer: 16 * 1024 * 1024,
    });
    const measured = assessCommand(result, step);
    report.steps.push({ id: step.id, kind: step.kind, ...measured });
    if (!measured.ok) { report.issues.push(...measured.issues.map(i => step.id + ': ' + i)); break; }
  }
  report.files = snapshotProject(root, { reportPath });
  if (beforeChecks && JSON.stringify(beforeChecks) !== JSON.stringify(report.files)) report.issues.push('检查期间源文件、构建产物或导入包发生变化，必须重跑；检查不得顺手重写基线');
  report.ok = report.issues.length === 0 && report.steps.length === plan.steps.length;
  return report;
}

export function validateCheckReceipt(root, verification) {
  const issues = []; let measuredSteps = [];
  try {
    requireArea(verification?.plan, STATE_DIR, '检查计划'); requireArea(verification?.report, STATE_DIR, '检查结果');
    const plan = readJson(resolveProjectPath(root, verification.plan));
    const report = readJson(resolveProjectPath(root, verification.report)); measuredSteps = Array.isArray(report.steps) ? report.steps : [];
    issues.push(...validateCheckPlan(plan).issues);
    if (report.schema !== CHECK_REPORT_SCHEMA || report.ok !== true || report.level !== 'automated' || !Array.isArray(report.issues) || report.issues.length) issues.push('缺少完整通过的自动检查结果；它不是宿主验收');
    if (report.planSha256 !== sha(JSON.stringify(plan))) issues.push('检查计划已变化');
    if (JSON.stringify(report.files) !== JSON.stringify(snapshotProject(root, { reportPath: verification.report }))) issues.push('当前源文件或导入包与检查时不同，检查证据已过期');
    if (!Array.isArray(report.steps) || report.steps.length !== plan.steps.length || plan.steps.some((s, i) => report.steps[i]?.id !== s.id || report.steps[i]?.kind !== s.kind || report.steps[i]?.ok !== true || report.steps[i]?.exitCode !== 0)) issues.push('检查步骤缺失、失败或与当前计划不一致');
    for (const [index, step] of (report.steps ?? []).entries()) if (plan.steps[index]?.kind === 'check') {
      issues.push(...assessCommand({ status: step.exitCode, stdout: JSON.stringify(step.payload) }, plan.steps[index]).issues);
    }
  } catch (error) { issues.push(error.message); }
  return { ok: issues.length === 0, issues, steps: measuredSteps };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  try {
    const root = path.resolve(opt('--root') || process.cwd());
    const relative = opt('--plan') || STATE_DIR + '/check-plan.json'; requireArea(relative, STATE_DIR, '检查计划');
    const reportPath = opt('--report') || STATE_DIR + '/check-report.json'; requireArea(reportPath, STATE_DIR, '检查结果');
    if (relative === reportPath) throw new Error('检查结果不能覆盖检查计划');
    const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const report = runCheckPlan(readJson(resolveProjectPath(root, relative)), { root, agentRoot, reportPath });
    const destination = resolveProjectPath(root, reportPath, { output: true }); fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1;
  } catch (e) { console.log(JSON.stringify({ ok: false, issues: [e.message] })); process.exitCode = 1; }
}
