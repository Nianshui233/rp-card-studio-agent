import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAssemblyManifest,
  applyTavernHelperAdapter,
  selectOpeningMessages,
  validateRuntimeSources,
} from '../scripts/rp-card-runtime.mjs';

function emptySources(overrides = {}) {
  return {
    positioning: [],
    world: [],
    characters: [],
    systems: [],
    scenes: [],
    mvu: [],
    prompts: [],
    ui: [],
    assembly: [],
    ...overrides,
  };
}

function worldbookEntry(overrides = {}) {
  return {
    id: 'guide',
    source: { kind: 'inline', content: 'Guide text.' },
    enabled: true,
    activation: {
      mode: 'constant',
      primary_keys: [],
      secondary_keys: [],
      selective: false,
    },
    insertion: { position: 'before_char', order: 1 },
    probability: 100,
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until_recursion: false,
    },
    recipient: 'shared',
    visibility: 'model',
    fallback: 'skip',
    ...overrides,
  };
}

function runtimeUiSources({ adapterDelivery = 'embedded', uiLevel = 'embedded', commands = [] } = {}) {
  return emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          storage: { namespace: 'stat_data' },
          variables: [{
            source_path: 'relationship.trust',
            runtime_path: 'stat_data.runtime.relationship_score',
            type: 'integer',
            default: 10,
            constraints: { minimum: 0, maximum: 100 },
            writer: { id: 'relationship_update', operations: ['set', 'add'] },
            readers: ['plot_model', 'status_ui', 'script'],
            visibility: 'player',
          }],
          initialization: { defaults: { relationship: { trust: 10 } } },
          update_rules: [],
          routing: { entries: [] },
        },
        ejs: { enabled: false, entries: [] },
        runtime_contract: {
          adapter: {
            id: 'tavern_helper',
            version: '1.0.0',
            delivery: adapterDelivery,
            entrypoint: 'rp_card_studio_runtime_guard',
            readiness_probe: 'globalThis.Mvu',
            timeout_ms: 10000,
            fallback: 'Keep the last legal state.',
          },
          dependencies: [],
        },
      },
    }],
    ui: [{
      relativePath: 'src/ui/status-ui.yaml',
      value: {
        status_ui: {
          enabled: true,
          mode: 'embedded',
          read_only: commands.length === 0,
          refresh: 'manual',
          text_template: 'Trust: {{relationship.trust}}',
          sections: [{
            id: 'relationship',
            display_name: 'Relationship',
            priority: 0,
            collapsed: false,
            fields: [{
              id: 'trust',
              source_path: 'relationship.trust',
              label: 'Trust',
              format: 'integer',
              missing_value: 'Unknown',
              visibility: 'player',
            }],
          }],
          commands,
          states: { loading: 'Loading', empty: 'Empty', error: 'Error', degraded: 'Unavailable' },
          responsive: { narrow: 'single_column', wide: 'grouped_columns' },
          visual: { density: 'compact', hierarchy: ['relationship'], motion: 'none' },
          accessibility: { keyboard: true, live_updates: 'polite', color_independent: true },
          dependencies: [],
          delivery: {
            level: uiLevel,
            adapter: 'tavern_helper',
            entrypoint: 'generated',
            artifact: 'inline',
            mount_anchor: 'rp-card-status',
            lifecycle: {
              wait_for: ['stat_data'],
              cleanup: ['events', 'observers', 'timers', 'dom'],
              idempotent: true,
            },
          },
        },
      },
    }],
  });
}

test('registered assembly sources resolve source_ref and JSON Pointer selector', async () => {
  const sources = emptySources({
    world: [{
      relativePath: 'src/world/realm.yaml',
      value: { id: 'realm', premise: { summary: 'The station circles a dim star.' } },
    }],
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: {
          entries: [worldbookEntry({
            source: {
              kind: 'registered_source',
              source_ref: 'world:realm',
              selector: '/premise/summary',
            },
          })],
        },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.deepEqual(validation.issues, []);

  const result = await applyAssemblyManifest({ data: { name: 'Card', extensions: {} } }, {
    sources,
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.payload.data.character_book.entries[0].content, 'The station circles a dim star.');
});

test('media asset fallback references must resolve', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: { entries: [] },
        media_manifest: {
          enabled: true,
          assets: [{
            id: 'hero_background',
            kind: 'background',
            source: { kind: 'inline', content: 'placeholder' },
            delivery: 'embedded',
            consumers: [{ ref: 'opening:start', slot: 'background' }],
            fallback: { strategy: 'asset', asset_ref: 'media:missing_background' },
          }],
        },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(issue => issue.rule === 'media.reference'));
});

test('state machines validate state_axis_id and initial_state', async () => {
  const sources = emptySources({
    systems: [{
      relativePath: 'src/systems/pressure.yaml',
      value: {
        axes: [{ id: 'pressure' }],
        state_machines: [{
          id: 'pressure_cycle',
          state_axis_id: 'missing_axis',
          initial_state: 'missing_state',
          states: [{ id: 'calm' }],
          transitions: [],
        }],
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  const stateMachineIssues = validation.issues.filter(issue => issue.rule === 'system.state_machine.reference');
  assert.equal(stateMachineIssues.length, 2);
});

test('opening presentation defaults, fallbacks, and media references form a closed graph', async () => {
  const opening = {
    id: 'start',
    is_default: true,
    visible_text: 'Plain fallback.',
    initial_state_ref: null,
    presentations: {
      default_variant_id: 'missing_default',
      variants: [{
        id: 'galgame',
        mode: 'galgame',
        visible_text: 'Enhanced opening.',
        fallback_variant_ref: 'presentation:missing_fallback',
        media_refs: ['media:missing_background'],
      }],
    },
  };
  const sources = emptySources({
    prompts: [{ relativePath: 'src/prompts/opening.yaml', value: { openings: [opening] } }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(issue => issue.rule === 'opening.presentation.reference'));
  assert.ok(validation.issues.some(issue => issue.rule === 'media.reference'));
});

test('assembly preserves imported worldbook entries unless replacement is explicit', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: { entries: [worldbookEntry()] },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });
  const payload = {
    data: {
      name: 'Card',
      extensions: {},
      character_book: {
        entries: [{ id: 'imported_entry', content: 'Imported content.', enabled: true }],
      },
    },
  };

  const result = await applyAssemblyManifest(payload, { sources, projectRoot: process.cwd(), target: 'character' });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.payload.data.character_book.entries.map(entry => entry.id), ['imported_entry', 'wb_guide']);
});

test('opening presentation selection keeps one semantic default and alternate variants', () => {
  const result = selectOpeningMessages([{
    openings: [{
      id: 'start',
      is_default: true,
      visible_text: 'Fallback.',
      presentations: {
        default_variant_id: 'plain',
        variants: [
          { id: 'plain', mode: 'prose', visible_text: 'Plain opening.' },
          { id: 'galgame', mode: 'galgame', visible_text: 'Enhanced opening.' },
        ],
      },
    }],
  }]);

  assert.equal(result.first, 'Plain opening.');
  assert.deepEqual(result.alternates, ['Enhanced opening.']);
});

test('complete_replace initialization profiles contain every declared variable', async () => {
  const variables = [
    {
      source_path: 'relationship.trust',
      runtime_path: 'stat_data.relationship.trust',
      type: 'integer',
      default: 10,
      constraints: { minimum: 0, maximum: 100 },
      writer: { id: 'relationship_update', operations: ['set'] },
      readers: ['plot_model'],
      visibility: 'player',
    },
    {
      source_path: 'relationship.respect',
      runtime_path: 'stat_data.relationship.respect',
      type: 'integer',
      default: 5,
      constraints: { minimum: 0, maximum: 100 },
      writer: { id: 'relationship_update', operations: ['set'] },
      readers: ['plot_model'],
      visibility: 'player',
    },
  ];
  const sources = emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          variables,
          initialization: {
            defaults: { relationship: { trust: 10, respect: 5 } },
            profiles: [{
              id: 'sparse',
              strategy: 'complete_replace',
              values: { relationship: { trust: 20 } },
            }],
            opening_bindings: [{
              opening_ref: 'opening:start',
              profile_ref: 'mvu_init:sparse',
              strategy: 'complete_replace',
            }],
          },
          update_rules: [],
          routing: { entries: [] },
        },
        ejs: { enabled: false, entries: [] },
      },
    }],
    prompts: [{
      relativePath: 'src/prompts/opening.yaml',
      value: { openings: [{ id: 'start', initial_state_ref: 'mvu_init:sparse' }] },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: { mvu: true } }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(issue => issue.rule === 'initialization.value' && issue.message.includes('relationship.respect')));
});

test('initialization profile inheritance rejects cycles', async () => {
  const sources = emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          variables: [],
          initialization: {
            defaults: {},
            profiles: [
              { id: 'alpha', extends: 'mvu_init:beta', strategy: 'validated_merge', values: {} },
              { id: 'beta', extends: 'mvu_init:alpha', strategy: 'validated_merge', values: {} },
            ],
            opening_bindings: [],
          },
          update_rules: [],
          routing: { entries: [] },
        },
        ejs: { enabled: false, entries: [] },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: { mvu: true } }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(issue => issue.rule === 'initialization.reference' && issue.message.includes('cycle')));
});

test('character and scene state bindings resolve against the MVU field ledger', async () => {
  const sources = emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          variables: [{
            source_path: 'relationship.trust',
            runtime_path: 'stat_data.relationship.trust',
            type: 'integer',
            default: 10,
            constraints: {},
            writer: { id: 'relationship_update', operations: ['set'] },
            readers: ['plot_model'],
            visibility: 'player',
          }],
          initialization: { defaults: { relationship: { trust: 10 } } },
          update_rules: [],
          routing: { entries: [] },
        },
        ejs: { enabled: false, entries: [] },
      },
    }],
    characters: [{
      relativePath: 'src/characters/card.yaml',
      value: { id: 'guide', state_bindings: [{ source_path: 'relationship.missing', access: 'read', purpose: 'Display trust.' }] },
    }],
    scenes: [{
      relativePath: 'src/scenes/start.yaml',
      value: { id: 'start', state_bindings: [{ source_path: 'scene.missing', access: 'write', purpose: 'Track discovery.' }] },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: { mvu: true } }, sources, projectRoot: process.cwd() });
  assert.equal(validation.issues.filter(issue => issue.rule === 'mvu.reference').length, 2);
});

test('opening scene and character references resolve across registered sources', async () => {
  const sources = emptySources({
    characters: [{ relativePath: 'src/characters/card.yaml', value: { id: 'guide' } }],
    scenes: [{ relativePath: 'src/scenes/start.yaml', value: { id: 'start' } }],
    prompts: [{
      relativePath: 'src/prompts/opening.yaml',
      value: {
        openings: [{
          id: 'arrival',
          scene_ref: 'scene:missing_scene',
          present_character_refs: ['character:missing_character'],
          initial_state_ref: null,
        }],
        dialogue_examples: [{ character_ref: 'character:missing_character' }],
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.equal(validation.issues.filter(issue => issue.rule === 'opening.reference').length, 3);
});

test('media consumers resolve to registered project entities', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: { entries: [] },
        media_manifest: {
          enabled: true,
          assets: [{
            id: 'arrival_background',
            kind: 'background',
            source: { kind: 'inline', content: 'embedded' },
            delivery: 'embedded',
            consumers: [{ ref: 'opening:missing_opening', slot: 'background' }],
            fallback: 'text',
          }],
        },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(issue => issue.rule === 'media.reference' && issue.message.includes('consumer')));
});

test('standalone object worldbooks treat container keys as imported entry ids', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: {
          duplicate_policy: 'error',
          entries: [worldbookEntry()],
        },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });
  const payload = { entries: { wb_guide: { content: 'Imported guide without an id.' } } };

  const result = await applyAssemblyManifest(payload, { sources, projectRoot: process.cwd(), target: 'worldbook' });
  assert.ok(result.issues.some(candidate => candidate.rule === 'assembly.reference'));
  assert.equal(result.payload.entries.wb_guide.content, 'Imported guide without an id.');
});

test('standalone worldbook assembly emits host fields and preserves custom extensions', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: {
          entries: [worldbookEntry({
            activation: {
              mode: 'keywords',
              primary_keys: ['signal'],
              secondary_keys: ['guide'],
              selective: true,
              logic: 'all',
              case_sensitive: true,
              match_whole_words: true,
            },
            probability: 75,
            extensions: { custom_host_data: { retained: true } },
          })],
        },
        media_manifest: { enabled: false, assets: [] },
      },
    }],
  });

  const result = await applyAssemblyManifest({ entries: {} }, { sources, projectRoot: process.cwd(), target: 'worldbook' });
  assert.deepEqual(result.issues, []);
  const entry = result.payload.entries.wb_guide;
  assert.deepEqual(entry.key, ['signal']);
  assert.deepEqual(entry.keysecondary, ['guide']);
  assert.equal(entry.useProbability, true);
  assert.equal(entry.probability, 75);
  assert.equal(entry.selectiveLogic, 3);
  assert.equal(entry.extensions.custom_host_data.retained, true);
});

test('update writes validate values and protocol operation semantics', async () => {
  const sources = emptySources({
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: {
          enabled: true,
          storage: { namespace: 'stat_data' },
          protocol: { id: 'restricted', operations: ['remove'] },
          variables: [{
            source_path: 'relationship.trust',
            runtime_path: 'stat_data.relationship.trust',
            type: 'integer',
            default: 10,
            constraints: { minimum: 0, maximum: 100 },
            writer: { id: 'relationship_update', operations: ['set'] },
            readers: ['plot_model'],
            visibility: 'player',
          }],
          initialization: { defaults: { relationship: { trust: 10 } } },
          update_rules: [{
            id: 'invalid_write',
            writer_id: 'relationship_update',
            reads: ['relationship.trust'],
            writes: [{ source_path: 'relationship.trust', operation: 'set', value: 'high' }],
          }],
          routing: { entries: [] },
        },
        ejs: { enabled: false, entries: [] },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: { mvu: true } }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(candidate => candidate.rule === 'mvu.write.value'));
  assert.ok(validation.issues.some(candidate => candidate.rule === 'mvu.protocol.operation'));
});

test('strong references close relationships, scenes, zones, routes, EJS, and known source refs', async () => {
  const sources = emptySources({
    characters: [{
      relativePath: 'src/characters/guide.yaml',
      value: {
        id: 'guide',
        relationships: [{ target_ref: 'character:missing_character' }],
        source_refs: ['world:missing_world'],
      },
    }],
    scenes: [{
      relativePath: 'src/scenes/start.yaml',
      value: {
        id: 'start',
        context: { world_ref: 'world:missing_world' },
        entrances: [],
        exits: [{ to_ref: 'scene:missing_scene' }],
        zones: [{ id: 'platform', connections: ['missing_zone'] }],
        source_refs: [],
      },
    }],
    mvu: [{
      relativePath: 'src/mvu/runtime.yaml',
      value: {
        mvu: { enabled: false, update_rules: [], routing: { entries: [{ source_ref: 'character:missing_character' }] } },
        ejs: { enabled: true, entries: [{ source_ref: 'scene:missing_scene', reads: [] }] },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: { ejs: true } }, sources, projectRoot: process.cwd() });
  const unresolved = validation.issues.filter(candidate => candidate.rule === 'reference.unresolved');
  assert.ok(unresolved.some(candidate => candidate.path.includes('/relationships/')));
  assert.ok(unresolved.some(candidate => candidate.path.includes('/context/world_ref')));
  assert.ok(unresolved.some(candidate => candidate.path.includes('/exits/')));
  assert.ok(unresolved.some(candidate => candidate.path.includes('/zones/')));
  assert.ok(unresolved.some(candidate => candidate.path.includes('/routing/')));
  assert.ok(unresolved.some(candidate => candidate.path.includes('/ejs/')));
  assert.ok(unresolved.some(candidate => candidate.path.includes('/source_refs/')));
});

test('workspace media sources cannot be shipped as remote references', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: { entries: [] },
        media_manifest: {
          enabled: true,
          assets: [{
            id: 'local_background',
            kind: 'background',
            source: { kind: 'file', path: 'SKILL.md' },
            delivery: 'remote',
            consumers: [],
            fallback: 'text',
          }],
        },
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(candidate => candidate.rule === 'media.delivery'));
});

test('embedded media is materialized as self-contained base64 with integrity evidence', async () => {
  const sources = emptySources({
    assembly: [{
      relativePath: 'src/integration/assembly.yaml',
      value: {
        worldbook_manifest: { entries: [] },
        media_manifest: {
          enabled: true,
          assets: [{
            id: 'inline_asset',
            kind: 'other',
            source: { kind: 'inline', content: 'abc' },
            delivery: 'embedded',
            consumers: [],
            fallback: 'text',
          }],
        },
      },
    }],
  });

  const result = await applyAssemblyManifest({ data: { extensions: {} } }, { sources, projectRoot: process.cwd(), target: 'character' });
  assert.deepEqual(result.issues, []);
  const asset = result.payload.data.extensions.rp_card_studio.media_manifest.assets[0];
  assert.deepEqual(asset.source, { kind: 'embedded', encoding: 'base64', data: 'YWJj' });
  assert.equal(asset.integrity.bytes, 3);
  assert.match(asset.integrity.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(asset.extensions.rp_card_studio.original_source, { kind: 'inline', content: 'abc' });
});

test('status UI scripts map runtime paths, execute every command channel, and remount after host replacement', () => {
  const commands = [
    { id: 'chat', label: 'Chat', channel: 'chat_command', payload: '/echo ready', writer_id: 'relationship_update' },
    { id: 'event', label: 'Event', channel: 'runtime_event', payload: 'rp-card-test-event', writer_id: 'relationship_update' },
    { id: 'api', label: 'API', channel: 'script_api', payload: 'TestApi.update', writer_id: 'relationship_update' },
  ];
  const result = applyTavernHelperAdapter({ data: { extensions: {} } }, {
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources: runtimeUiSources({ commands }),
    target: 'character',
  });
  assert.deepEqual(result.issues, []);
  const script = result.payload.data.extensions.tavern_helper.scripts.find(candidate => candidate.id === 'rp_card_studio_status_ui').content;
  assert.match(script, /"path":"runtime\.relationship_score"/);
  assert.match(script, /executeSlashCommandsWithOptions/);
  assert.match(script, /emit\(command\.payload, detail\)/);
  assert.match(script, /resolveCallable\(command\.payload\)/);
  assert.doesNotMatch(script, /const attemptRender = \(\) => \{\s*if \(ready\) return/);
  assert.match(script, /if \(!root\?\.isConnected \|\| !host\?\.isConnected\) attemptRender\(\)/);
});

test('non-embedded adapters do not generate executable runtime guards', () => {
  const result = applyTavernHelperAdapter({ data: { extensions: {} } }, {
    project: { features: { mvu: true, ejs: false, status_ui: false } },
    sources: runtimeUiSources({ adapterDelivery: 'host_required' }),
    target: 'character',
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.payload.data.extensions.tavern_helper, undefined);
});

test('embedded adapters reject undeployed entrypoint and artifact paths', async () => {
  const sources = runtimeUiSources();
  sources.mvu[0].value.runtime_contract.adapter.entrypoint = 'src/adapters/runtime.js';
  sources.ui[0].value.status_ui.delivery.entrypoint = 'src/adapters/status.js';
  sources.ui[0].value.status_ui.delivery.artifact = 'dist/status.js';

  const validation = await validateRuntimeSources({
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources,
    projectRoot: process.cwd(),
  });
  const artifactIssues = validation.issues.filter(candidate => candidate.rule === 'adapter.artifact');
  assert.equal(artifactIssues.length, 3);
});

test('specification UI delivery is reported as not run instead of embedded runtime evidence', async () => {
  const sources = runtimeUiSources({ uiLevel: 'specification' });
  const validation = await validateRuntimeSources({
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources,
    projectRoot: process.cwd(),
  });
  assert.equal(validation.issues.some(candidate => candidate.rule === 'ui.runtime_missing'), false);
  assert.ok(validation.warnings.some(candidate => candidate.rule === 'ui.runtime_not_run'));
});

test('specification UI wait conditions do not block the selected embedded UI owner', async () => {
  const sources = runtimeUiSources();
  const specification = structuredClone(sources.ui[0]);
  specification.relativePath = 'src/ui/specification.yaml';
  specification.value.status_ui.sections[0].id = 'spec_relationship';
  specification.value.status_ui.visual.hierarchy = ['spec_relationship'];
  specification.value.status_ui.delivery.level = 'specification';
  specification.value.status_ui.delivery.entrypoint = 'rp_card_status_specification';
  specification.value.status_ui.delivery.artifact = 'specification_only';
  specification.value.status_ui.delivery.mount_anchor = 'rp-card-status-specification';
  specification.value.status_ui.delivery.lifecycle.wait_for = ['never_event'];
  sources.ui.push(specification);

  const validation = await validateRuntimeSources({
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources,
    projectRoot: process.cwd(),
  });
  assert.deepEqual(validation.issues, []);
  assert.ok(validation.warnings.some(candidate => candidate.rule === 'ui.runtime_not_run'));

  const result = applyTavernHelperAdapter({ data: { extensions: {} } }, {
    project: { features: { mvu: true, ejs: false, status_ui: true } },
    sources,
    target: 'character',
  });
  const script = result.payload.data.extensions.tavern_helper.scripts.find(candidate => candidate.id === 'rp_card_studio_status_ui').content;
  assert.doesNotMatch(script, /never_event/);
  assert.match(script, /stat_data/);
});

test('opening selection traces variant, initialization profile, and resolved state', () => {
  const openings = [{
    openings: [{
      id: 'start',
      is_default: true,
      visible_text: 'Start.',
      initial_state_ref: 'mvu_init:arrival',
      presentations: {
        default_variant_id: 'plain',
        variants: [{ id: 'plain', mode: 'prose', visible_text: 'Plain start.' }],
      },
    }],
  }];
  const mvu = [{
    mvu: {
      initialization: {
        defaults: {},
        profiles: [{ id: 'arrival', values: { relationship: { trust: 25 } } }],
      },
    },
  }];

  const selected = selectOpeningMessages(openings, mvu);
  assert.deepEqual(selected.selection.default, {
    opening_id: 'start',
    variant_id: 'plain',
    source: 'opening_ref',
    profile_id: 'arrival',
    state: { relationship: { trust: 25 } },
  });
  assert.equal(selected.selection.evidence, 'artifact_only');
});

test('state machines enforce value contracts, reachability, and runtime requirements', async () => {
  const sources = emptySources({
    systems: [{
      relativePath: 'src/systems/mode.yaml',
      value: {
        id: 'mode_system',
        axes: [{
          id: 'mode',
          type: 'enum',
          initial: 'calm',
          constraints: { values: ['calm', 'alert'] },
          updates: [],
        }],
        rules: [{ effects: [{ axis_id: 'mode', operation: 'set', value: 'invalid' }] }],
        state_machines: [{
          id: 'mode_cycle',
          state_axis_id: 'mode',
          initial_state: 'calm',
          enforcement: 'runtime_required',
          states: [{ id: 'calm' }, { id: 'alert' }],
          transitions: [],
        }],
        source_refs: [],
      },
    }],
  });

  const validation = await validateRuntimeSources({ project: { features: {} }, sources, projectRoot: process.cwd() });
  assert.ok(validation.issues.some(candidate => candidate.rule === 'system.effect.value'));
  assert.ok(validation.issues.some(candidate => candidate.rule === 'system.state_machine.reachability'));
  assert.ok(validation.issues.some(candidate => candidate.rule === 'system.state_machine.runtime'));
});
