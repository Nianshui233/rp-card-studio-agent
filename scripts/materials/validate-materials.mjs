import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROCESSING_STATES = new Set(['absent', 'received', 'organizing', 'organized', 'user_review_needed', 'accepted', 'explicitly_skipped']);
const RESEARCH_STATES = new Set(['not_required', 'required', 'active', 'complete', 'blocked', 'skipped']);
const SYNTHESIS_KEYS = ['coreFacts', 'mustPreserve', 'cardCandidates', 'worldbookCandidates', 'systemCandidates', 'openingCandidates', 'styleReferences', 'openQuestions', 'parked'];

function issue(issues, message) { issues.push(message); }
function list(value, name, issues) {
  if (!Array.isArray(value)) issue(issues, `${name} must be an array`);
  return Array.isArray(value) ? value : [];
}

export function validateMaterials(value) {
  const issues = [];
  const warnings = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, issues: ['materials must be an object'], warnings };
  if (value.schema !== 'rp-card-studio/materials/v2') issue(issues, 'schema must be rp-card-studio/materials/v2');
  if (typeof value.projectId !== 'string' || !value.projectId.trim()) issue(issues, 'projectId must be a non-empty string');
  const processing = value.processing;
  if (!processing || typeof processing !== 'object' || Array.isArray(processing)) issue(issues, 'processing must be an object');
  else {
    if (!PROCESSING_STATES.has(processing.status)) issue(issues, `invalid processing.status: ${processing.status}`);
    if (!['single-pass', 'chunked', 'batched'].includes(processing.mode)) issue(issues, `invalid processing.mode: ${processing.mode}`);
    if (!Number.isInteger(processing.sourceCount) || processing.sourceCount < 0) issue(issues, 'processing.sourceCount must be a non-negative integer');
    if (!Number.isInteger(processing.unresolvedCount) || processing.unresolvedCount < 0) issue(issues, 'processing.unresolvedCount must be a non-negative integer');
  }
  const research = value.research;
  if (!research || typeof research !== 'object' || Array.isArray(research)) issue(issues, 'research must be an object');
  else {
    if (!RESEARCH_STATES.has(research.status)) issue(issues, `invalid research.status: ${research.status}`);
    if (research.status === 'blocked' && typeof research.blocker !== 'string') issue(issues, 'blocked research must include blocker');
    if (research.status === 'skipped' && research.override !== 'user') issue(issues, 'skipped research must record override=user');
    if (research.networkPolicy !== 'public_sources_only') issue(issues, 'research.networkPolicy must be public_sources_only');
  }
  for (const [name, items] of [['sources', value.sources], ['facts', value.facts], ['researchQuestions', value.researchQuestions], ['conflicts', value.conflicts]]) list(items, name, issues);
  if (!value.synthesis || typeof value.synthesis !== 'object' || Array.isArray(value.synthesis)) issue(issues, 'synthesis must be an object');
  else for (const key of SYNTHESIS_KEYS) list(value.synthesis[key], `synthesis.${key}`, issues);
  for (const [index, source] of list(value.sources, 'sources', []).entries()) {
    if (!source || typeof source !== 'object' || typeof source.id !== 'string' || !source.id.trim()) issue(issues, `sources[${index}] needs id`);
    if (source.kind && !['user-file', 'user-text', 'old-card', 'web-page', 'image', 'unknown'].includes(source.kind)) issue(issues, `sources[${index}] has invalid kind`);
    if (source.status && !['received', 'reviewed', 'frozen', 'blocked'].includes(source.status)) issue(issues, `sources[${index}] has invalid status`);
  }
  const hasSources = value.sources?.length > 0;
  if (hasSources && processing?.status === 'absent') issue(issues, 'sources exist but processing.status is absent');
  if (!hasSources && processing?.status === 'received') warnings.push('processing is received but sources is empty');
  return { ok: issues.length === 0, issues, warnings };
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: node validate-materials.mjs <materials.json>');
  const report = validateMaterials(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, '')));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
