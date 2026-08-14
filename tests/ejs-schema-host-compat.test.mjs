import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(path.join(skillRoot, 'assets', 'schemas', 'mvu.schema.json'), 'utf8'));

test('EJS schema describes the structured ST-Prompt-Template host contract', () => {
  const entry = schema.properties.ejs.properties.entries.items;
  const condition = schema.$defs.ejsCondition;
  const branches = schema.$defs.ejsBranches;

  assert.deepEqual(
    [...entry.required].sort(),
    ['branches', 'condition', 'complexity', 'id', 'insertion_order', 'placement', 'reads', 'source_ref', 'target'].sort(),
  );
  assert.equal(entry.properties.condition.$ref, '#/$defs/ejsCondition');
  assert.equal(entry.properties.branches.$ref, '#/$defs/ejsBranches');
  assert.deepEqual(entry.properties.target.enum, ['prompt', 'render', 'both']);
  assert.deepEqual(entry.properties.placement.enum, ['before', 'after']);
  assert.deepEqual(entry.properties.missing_dependency.enum, ['omit_dynamic', 'block']);
  assert.equal(entry.properties.engine.const, 'st_prompt_template');
  assert.equal(condition.properties.runtime_path.$ref, '#/$defs/runtimePath');
  assert.deepEqual(condition.properties.operator.enum, ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'truthy', 'falsy', 'includes']);
  assert.deepEqual(Object.keys(branches.properties).sort(), ['fallback', 'when_false', 'when_true']);
  assert.equal(schema.$defs.ejsDependency.properties.readiness_probe.pattern.includes('EjsTemplate'), true);
});

test('legacy string EJS conditions are represented as a migration error, not a valid source shape', () => {
  const entry = schema.properties.ejs.properties.entries.items;
  assert.notEqual(entry.properties.condition.type, 'string');
  assert.equal(Object.hasOwn(entry.properties, 'fallback'), false);
  assert.equal(entry.properties.branches.$ref, '#/$defs/ejsBranches');
});

test('new MVU projects recommend insert while imported protocols may retain the upstream add alias', () => {
  const operationVariants = schema.properties.mvu.allOf[0].then.properties.protocol.properties.operations.oneOf
    .map(option => option.const);

  assert.deepEqual(operationVariants[0], ['replace', 'delta', 'insert', 'remove', 'move']);
  assert.ok(operationVariants.some(operations => operations.includes('add')));
  assert.equal(schema.$defs.protocol.properties.operations.items.enum.includes('add'), true);
});


test('MVU schema allows built-in, extra-pass, and hybrid update routes', () => {
  assert.deepEqual(
    schema.properties.mvu.properties.update_mode.enum,
    ['disabled', 'same_generation', 'extra_pass', 'both'],
  );
  assert.deepEqual(
    schema.properties.mvu.allOf[0].then.properties.update_mode.enum,
    ['same_generation', 'extra_pass', 'both'],
  );
});
