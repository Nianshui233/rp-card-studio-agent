import { interviewFixture } from './helpers/production-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERVIEW_PROFILES, validateInterviewCoverage } from '../scripts/production/interview-coverage.mjs';

test('interview coverage cannot close on shallow answers', () => {
  const shallow = { status: 'covered', coverage: Object.fromEntries(Object.keys(INTERVIEW_PROFILES.message_frontend).map(id => [id, { status: 'confirmed', depth: 'surface', sourceKind: 'user_confirmed', evidence: 'USR-1' }])) };
  const result = validateInterviewCoverage(shallow, 'message_frontend');
  assert.match(result.issues.join('\n'), /深度不足/);
});

test('interview coverage requires all dependencies and detailed MVU dimensions', () => {
  const coverage = Object.fromEntries(Object.entries(INTERVIEW_PROFILES.mvu).map(([id, depth]) => [id, { status: 'confirmed', depth, sourceKind: 'user_confirmed', evidence: 'USR-1' }]));
  const result = validateInterviewCoverage({ status: 'covered', coverage, unexpandedDependencies: ['动态 Record 字段'] }, 'mvu');
  assert.match(result.issues.join('\n'), /未展开/);
  delete result.issues;
});

test('complete coverage can close a profile', () => {
  const { interview, ledger } = interviewFixture('opening_frontend', INTERVIEW_PROFILES);
  assert.equal(validateInterviewCoverage(interview, 'opening_frontend', { ledger }).ok, true);
});
