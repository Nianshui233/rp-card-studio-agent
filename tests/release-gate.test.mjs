import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseReadinessIssues, assertReleaseReady } from '../scripts/continuation/release-gate.mjs';

test('release readiness refuses static-only or unaccepted artifacts', () => {
  const issues = releaseReadinessIssues({ automated: 'passed', browser: 'passed', 'real-sillytavern': 'not_run', human: 'not_run', release: 'not_run' });
  assert.equal(issues.length, 3);
  assert.throws(() => assertReleaseReady({ 'real-sillytavern': 'passed', human: 'passed', release: 'not_run' }), /release 摘要/);
});

test('release readiness requires real host evidence, human acceptance, and release marking', () => {
  assert.equal(assertReleaseReady({ 'real-sillytavern': 'passed', human: 'passed', release: 'passed' }), true);
});
