import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(path.join(skillRoot, 'assets', 'schemas', 'status-ui.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

function regexDocument() {
  return {
    schema_version: '1.2.0',
    status: 'locked',
    status_ui: {
      enabled: true,
      mode: 'embedded',
      read_only: true,
      refresh: 'on_message',
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
      commands: [],
      states: {
        loading: 'Loading',
        empty: 'Empty',
        error: 'Error',
        degraded: 'Unavailable',
      },
      responsive: { narrow: 'compact_list', wide: 'grouped_columns' },
      visual: { density: 'compact', hierarchy: ['relationship'], motion: 'none' },
      accessibility: { keyboard: true, live_updates: 'polite', color_independent: true },
      dependencies: [],
      delivery: {
        level: 'embedded',
        adapter: 'sillytavern_regex',
        surface: 'message',
        entrypoint: 'generated',
        artifact: 'inline',
        placeholder: '<StatusPlaceHolderImpl/>',
      },
    },
  };
}

function expectValid(document) {
  assert.equal(validate(document), true, JSON.stringify(validate.errors, null, 2));
}

function expectInvalid(document) {
  assert.equal(validate(document), false, 'expected status UI source to violate the host contract');
}

test('embedded SillyTavern regex accepts only its message-local static contract', () => {
  expectValid(regexDocument());

  const invalidDocuments = [
    document => { document.status_ui.refresh = 'on_state_change'; },
    document => { document.status_ui.read_only = false; },
    document => {
      document.status_ui.commands.push({
        id: 'advance',
        label: 'Advance',
        channel: 'runtime_event',
        payload: 'project.advance',
        writer_id: 'advance_writer',
      });
    },
    document => { document.status_ui.responsive.narrow = 'tabs'; },
    document => { document.status_ui.responsive.wide = 'tabs'; },
  ];

  for (const mutate of invalidDocuments) {
    const document = regexDocument();
    mutate(document);
    expectInvalid(document);
  }
});

test('dynamic refresh, commands, and tabs require a Tavern Helper message host', () => {
  const document = regexDocument();
  Object.assign(document.status_ui, {
    mode: 'both',
    read_only: false,
    refresh: 'on_state_change',
    commands: [{
      id: 'advance',
      label: 'Advance',
      channel: 'runtime_event',
      payload: 'project.advance',
      writer_id: 'advance_writer',
    }],
    responsive: { narrow: 'tabs', wide: 'tabs' },
    delivery: {
      level: 'host_required',
      adapter: 'tavern_helper_message',
      surface: 'message',
      entrypoint: 'host_managed',
      artifact: 'host_managed',
      placeholder: '<StatusPlaceHolderImpl/>',
    },
  });
  expectValid(document);

  document.status_ui.delivery.level = 'specification';
  expectInvalid(document);
});

test('delivery schema exposes only the two message-local adapters', () => {
  const delivery = schema.$defs.delivery;
  assert.deepEqual(delivery.properties.adapter.enum, ['sillytavern_regex', 'tavern_helper_message']);
  assert.equal(delivery.properties.surface.const, 'message');
  assert.equal(Object.hasOwn(delivery.properties, 'mount_anchor'), false);
  assert.equal(Object.hasOwn(delivery.properties, 'lifecycle'), false);

  const regexHostRequired = regexDocument();
  regexHostRequired.status_ui.delivery.level = 'host_required';
  expectInvalid(regexHostRequired);

  const embeddedTavernHelper = regexDocument();
  embeddedTavernHelper.status_ui.delivery.adapter = 'tavern_helper_message';
  expectInvalid(embeddedTavernHelper);
});

test('regex-only missing and runtime state strings are explicitly design metadata', () => {
  assert.match(schema.$defs.field.properties.missing_value.description, /Design copy/);
  assert.match(schema.properties.status_ui.properties.states.description, /Design copy/);
  assert.match(schema.properties.status_ui.properties.accessibility.description, /host verification/);
});

test('status fields may select stat_data or display_data while legacy fields default to stat_data', () => {
  const legacy = regexDocument();
  expectValid(legacy);

  const current = regexDocument();
  current.schema_version = '1.3.0';
  current.status_ui.sections[0].fields[0].data_source = 'stat_data';
  expectValid(current);

  const display = regexDocument();
  display.schema_version = '1.3.0';
  display.status_ui.sections[0].fields[0].data_source = 'display_data';
  expectValid(display);

  display.status_ui.sections[0].fields[0].data_source = 'chat_data';
  expectInvalid(display);
});