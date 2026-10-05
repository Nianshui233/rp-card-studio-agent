import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMaterials } from './validate-materials.mjs';

function valid(overrides = {}) {
  return {
    schema: 'rp-card-studio/materials/v2',
    projectId: 'demo',
    processing: { status: 'organized', mode: 'single-pass', sourceCount: 1, unresolvedCount: 1 },
    research: { status: 'not_required', trigger: null, override: null, networkPolicy: 'public_sources_only', scope: '' },
    sources: [{ id: 'chapter-1', kind: 'user-text', status: 'reviewed' }],
    facts: [{ id: 'fact-1', sourceIds: ['chapter-1'], status: 'confirmed' }],
    researchQuestions: [],
    conflicts: [],
    synthesis: {
      coreFacts: ['核心事实'], mustPreserve: [], cardCandidates: [], worldbookCandidates: [],
      systemCandidates: [], openingCandidates: [], styleReferences: [], openQuestions: [], parked: []
    },
    ...overrides
  };
}

test('accepts a small source that was processed without a size threshold', () => {
  const report = validateMaterials(valid());
  assert.equal(report.ok, true);
});

test('accepts proactive public research as an independent material state', () => {
  const report = validateMaterials(valid({
    research: { status: 'complete', trigger: 'named_external_work', override: null, networkPolicy: 'public_sources_only', scope: 'initial canon reconnaissance' }
  }));
  assert.equal(report.ok, true);
});

test('requires an explicit user override when research is skipped', () => {
  const report = validateMaterials(valid({
    research: { status: 'skipped', trigger: 'named_external_work', override: null, networkPolicy: 'public_sources_only', scope: '' }
  }));
  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /override=user/);
});

test('requires a blocker when the host lacks web research tools', () => {
  const report = validateMaterials(valid({
    research: { status: 'blocked', trigger: 'named_external_work', override: null, networkPolicy: 'public_sources_only', scope: '' }
  }));
  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /blocker/);
});

test('rejects sources that are present while processing remains absent', () => {
  const report = validateMaterials(valid({ processing: { status: 'absent', mode: 'single-pass', sourceCount: 1, unresolvedCount: 0 } }));
  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /processing.status is absent/);
});
