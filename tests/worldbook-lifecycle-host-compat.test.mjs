import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyMvuArtifacts,
  auditSillyTavernMvuLifecycle,
} from '../scripts/rp-card-runtime.mjs';

function sources() {
  return {
    positioning: [], world: [], characters: [], systems: [], scenes: [],
    prompts: [], ui: [], assembly: [],
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          initialization: {
            defaults: {
              operation: { case_phase: 'arrival', fog_minutes: 26 },
              investigation: { evidence: 0 },
              relationship: { trust: 25 },
              record: { integrity: 80 },
            },
          },
          variables: [],
          update_rules: [],
          protocol: { operations: ['replace'] },
        },
      },
    }],
  };
}

function embeddedCard() {
  const result = applyMvuArtifacts({
    data: {
      name: '生命周期验收卡',
      extensions: { world: '生命周期验收世界书' },
      character_book: { name: '生命周期验收世界书', entries: [] },
    },
  }, {
    project: { features: { mvu: true, status_ui: false } },
    sources: sources(),
    target: 'character',
  });
  assert.deepEqual(result.issues, []);
  return result.payload;
}

function importedWorldbook(card) {
  return {
    entries: Object.fromEntries(card.data.character_book.entries.map((entry, index) => [index, {
      uid: index,
      comment: entry.comment,
      content: entry.content,
      disable: !entry.enabled,
      extensions: structuredClone(entry.extensions),
    }])),
  };
}

test('MVU is not ready before Import Card Lore materializes the embedded book in the host registry', () => {
  const card = embeddedCard();
  const audit = auditSillyTavernMvuLifecycle(card, {});

  assert.equal(audit.binding_matches, true);
  assert.equal(audit.registry_present, false);
  assert.equal(audit.ready, false);
  assert.equal(audit.stat_data, null);
});

test('a same-name stale host worldbook is rejected unless managed source keys and content match', () => {
  const card = embeddedCard();
  const bookName = card.data.character_book.name;
  const stale = importedWorldbook(card);
  const entries = Object.values(stale.entries);
  entries.find(entry => entry.extensions?.rp_card_studio?.source_key === 'mvu:initvar').content = JSON.stringify({ operation: { case_phase: 'stale' } });
  delete entries.find(entry => entry.extensions?.rp_card_studio?.source_key === 'mvu:update_rules').extensions.rp_card_studio.source_key;

  const audit = auditSillyTavernMvuLifecycle(card, { [bookName]: stale });

  assert.equal(audit.registry_present, true);
  assert.equal(audit.managed_content_matches, false);
  assert.equal(audit.ready, false);
  assert.ok(audit.managed_entries.some(entry => entry.source_key === 'mvu:update_rules' && !entry.present));
  assert.ok(audit.managed_entries.some(entry => entry.source_key === 'mvu:initvar' && !entry.content_matches));
});

test('Import Card Lore plus matching primary binding makes MVU ready and initializes stat_data', () => {
  const card = embeddedCard();
  const bookName = card.data.character_book.name;
  const audit = auditSillyTavernMvuLifecycle(card, new Map([[bookName, importedWorldbook(card)]]));

  assert.equal(audit.ready, true);
  assert.equal(audit.binding_matches, true);
  assert.equal(audit.registry_present, true);
  assert.equal(audit.managed_content_matches, true);
  assert.equal(audit.initvar.present, true);
  assert.equal(audit.initvar.recognizable, true);
  assert.equal(audit.runtime_ready, null);
  assert.equal(audit.host_compatibility.tavern_helper_blob_url_rendering, null);
  assert.deepEqual(audit.stat_data, {
    operation: { case_phase: 'arrival', fog_minutes: 26 },
    investigation: { evidence: 0 },
    relationship: { trust: 25 },
    record: { integrity: 80 },
  });
});

test('matching imported content is still not ready when the card binds another primary worldbook', () => {
  const card = embeddedCard();
  const bookName = card.data.character_book.name;
  card.data.extensions.world = '另一本文本相同的世界书';
  const audit = auditSillyTavernMvuLifecycle(card, { [bookName]: importedWorldbook(card) });

  assert.equal(audit.registry_present, true);
  assert.equal(audit.managed_content_matches, true);
  assert.equal(audit.binding_matches, false);
  assert.equal(audit.ready, false);
});

test('Tavern Helper Blob URL rendering blocks embedded MVU runtime startup on the verified host', () => {
  const card = embeddedCard();
  const bookName = card.data.character_book.name;
  const audit = auditSillyTavernMvuLifecycle(card, { [bookName]: importedWorldbook(card) }, {
    sillytavern_version: '1.18.0',
    tavern_helper_version: '4.9.1',
    tavern_helper: {
      render: { use_blob_url: true },
    },
  });

  assert.equal(audit.ready, true);
  assert.equal(audit.host_compatibility.tavern_helper_blob_url_rendering, true);
  assert.equal(audit.host_compatibility.embedded_mvu_script_compatible, false);
  assert.equal(audit.runtime_ready, false);
  assert.deepEqual(audit.host_compatibility.blockers, ['tavern_helper_blob_url_rendering']);
});

test('embedded MVU runtime may start after Tavern Helper Blob URL rendering is disabled', () => {
  const card = embeddedCard();
  const bookName = card.data.character_book.name;
  const audit = auditSillyTavernMvuLifecycle(card, { [bookName]: importedWorldbook(card) }, {
    sillytavern_version: '1.18.0',
    tavern_helper_version: '4.9.1',
    tavern_helper: {
      render: { use_blob_url: false },
    },
  });

  assert.equal(audit.ready, true);
  assert.equal(audit.host_compatibility.tavern_helper_blob_url_rendering, false);
  assert.equal(audit.host_compatibility.embedded_mvu_script_compatible, true);
  assert.equal(audit.runtime_ready, true);
  assert.deepEqual(audit.host_compatibility.blockers, []);
});
