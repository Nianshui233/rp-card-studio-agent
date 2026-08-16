import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import { applyAssemblyManifest, validateRuntimeSources } from '../scripts/rp-card-runtime.mjs';

const assemblySchema = JSON.parse(readFileSync(
  new URL('../assets/schemas/assembly.schema.json', import.meta.url),
  'utf8',
));
const validateAssemblySchema = new Ajv2020({ allErrors: true, strict: true }).compile(assemblySchema);

function worldbookEntry({
  id = 'harbor_rules',
  displayName = '雾港规则',
  activation = {},
  insertion = {},
  recursion = {},
  ...overrides
} = {}) {
  return {
    id,
    display_name: displayName,
    source: { kind: 'inline', content: `${displayName}的正文。` },
    enabled: true,
    activation: {
      mode: 'constant',
      primary_keys: [],
      secondary_keys: [],
      selective: false,
      logic: 'any',
      case_sensitive: false,
      match_whole_words: false,
      ...activation,
    },
    insertion: {
      position: 'before_char',
      order: 100,
      depth: null,
      role: 'system',
      ...insertion,
    },
    probability: 100,
    scan_depth: null,
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: false,
      delay_until_recursion: false,
      ...recursion,
    },
    recipient: 'shared',
    visibility: 'model',
    ignore_budget: false,
    token_budget: null,
    fallback: 'block',
    ...overrides,
  };
}

function completeAssembly(entries = [
  worldbookEntry(),
  worldbookEntry({
    id: 'dockmaster',
    displayName: '人物档案：码头长',
    activation: {
      mode: 'keywords',
      primary_keys: ['码头长'],
      secondary_keys: ['雾港'],
      selective: true,
      logic: 'all',
      case_sensitive: false,
      match_whole_words: false,
    },
    insertion: {
      position: 'at_depth',
      order: 200,
      depth: 4,
      role: 'system',
    },
    probability: 85,
    scan_depth: 6,
    recursion: {
      prevent_incoming: false,
      prevent_outgoing: true,
      delay_until_recursion: true,
    },
  }),
]) {
  return {
    schema_version: '1.0.0',
    status: 'locked',
    worldbook_manifest: {
      id: 'mist_harbor',
      display_name: '雾港世界书',
      description: '调度校验测试。',
      scan_depth: null,
      token_budget: null,
      recursive_scanning: false,
      preserve_imported_entries: true,
      duplicate_policy: 'error',
      entries,
    },
    media_manifest: { enabled: false, assets: [] },
  };
}

function sourcesFor(assembly) {
  return {
    positioning: [],
    world: [],
    characters: [],
    systems: [],
    scenes: [],
    mvu: [],
    prompts: [],
    ui: [],
    assembly: [{ relativePath: 'src/integration/assembly.yaml', value: assembly }],
  };
}

async function runtimeIssues(assembly) {
  const result = await validateRuntimeSources({
    project: { features: {}, target: 'worldbook' },
    sources: sourcesFor(assembly),
    projectRoot: process.cwd(),
  });
  return result.issues;
}

async function runtimeValidation(assembly, project = { features: {}, target: 'worldbook' }) {
  return validateRuntimeSources({
    project,
    sources: sourcesFor(assembly),
    projectRoot: process.cwd(),
  });
}

function deleteAt(object, path) {
  const segments = path.split('.');
  const key = segments.pop();
  let owner = object;
  for (const segment of segments) owner = owner[segment];
  delete owner[key];
}

function assertIssue(issues, rule, pathSuffix) {
  assert.ok(
    issues.some(issue => issue.rule === rule && issue.path.endsWith(pathSuffix)),
    `missing ${rule} issue at *${pathSuffix}:\n${JSON.stringify(issues, null, 2)}`,
  );
}

test('a complete and explicit worldbook schedule passes schema and runtime validation', async () => {
  const assembly = completeAssembly();

  assert.equal(
    validateAssemblySchema(assembly),
    true,
    JSON.stringify(validateAssemblySchema.errors, null, 2),
  );
  assert.deepEqual(await runtimeIssues(assembly), []);
});

test('assembly schema requires every explicit scheduling decision', () => {
  const requiredPaths = [
    'display_name',
    'activation.logic',
    'activation.case_sensitive',
    'activation.match_whole_words',
    'insertion.depth',
    'insertion.role',
    'scan_depth',
  ];

  for (const path of requiredPaths) {
    const assembly = completeAssembly([worldbookEntry()]);
    deleteAt(assembly.worldbook_manifest.entries[0], path);

    assert.equal(validateAssemblySchema(assembly), false, `schema accepted an entry without ${path}`);
    assert.ok(
      validateAssemblySchema.errors.some(error => (
        error.keyword === 'required'
        && error.params.missingProperty === path.split('.').at(-1)
      )),
      `schema rejected missing ${path} for the wrong reason:\n${JSON.stringify(validateAssemblySchema.errors, null, 2)}`,
    );
  }
});

test('runtime validation blocks every omitted scheduling decision with a precise rule and path', async () => {
  const requiredFields = [
    ['display_name', 'assembly.entry_name'],
    ['activation.mode', 'assembly.activation'],
    ['activation.primary_keys', 'assembly.activation'],
    ['activation.secondary_keys', 'assembly.activation'],
    ['activation.selective', 'assembly.activation'],
    ['activation.logic', 'assembly.activation'],
    ['activation.case_sensitive', 'assembly.activation'],
    ['activation.match_whole_words', 'assembly.activation'],
    ['insertion.position', 'assembly.insertion'],
    ['insertion.order', 'assembly.insertion'],
    ['insertion.depth', 'assembly.insertion'],
    ['insertion.role', 'assembly.insertion'],
    ['probability', 'assembly.probability'],
    ['scan_depth', 'assembly.scan_depth'],
    ['recursion.prevent_incoming', 'assembly.recursion'],
    ['recursion.prevent_outgoing', 'assembly.recursion'],
    ['recursion.delay_until_recursion', 'assembly.recursion'],
  ];

  for (const [path, rule] of requiredFields) {
    const assembly = completeAssembly([worldbookEntry()]);
    deleteAt(assembly.worldbook_manifest.entries[0], path);

    const issues = await runtimeIssues(assembly);
    assertIssue(issues, rule, `/${path.replaceAll('.', '/')}`);
  }
});

test('worldbook activation preserves SillyTavern-compatible legacy flag combinations', async () => {
  const cases = [
    {
      label: '关键词条目没有主关键词',
      activation: { mode: 'keywords', primary_keys: [] },
      path: '/activation/primary_keys',
    },
    {
      label: '常驻条目混入主关键词',
      activation: { mode: 'constant', primary_keys: ['雾港'] },
      path: null,
    },
  ];

  for (const { label, activation, path } of cases) {
    const issues = await runtimeIssues(completeAssembly([
      worldbookEntry({ activation }),
    ]));
    if (path) {
      assertIssue(issues, 'assembly.activation', path);
      assert.ok(issues.length > 0, `${label} was unexpectedly accepted`);
    } else {
      assert.deepEqual(issues, [], `${label} should remain host-compatible`);
    }
  }

  for (const activation of [
    { mode: 'keywords', primary_keys: ['码头长'], secondary_keys: [], selective: true },
    { mode: 'keywords', primary_keys: ['码头长'], secondary_keys: ['雾港'], selective: false },
  ]) {
    assert.deepEqual(await runtimeIssues(completeAssembly([worldbookEntry({ activation })])), []);
  }
});

test('at_depth insertion requires an explicit depth', async () => {
  const entry = worldbookEntry({ insertion: { position: 'at_depth', depth: 4 } });
  delete entry.insertion.depth;

  const issues = await runtimeIssues(completeAssembly([entry]));
  assertIssue(issues, 'assembly.insertion', '/insertion/depth');
});

test('worldbook entries may intentionally share a display name or insertion order', async () => {
  const issues = await runtimeIssues(completeAssembly([
    worldbookEntry(),
    worldbookEntry({ id: 'duplicate', insertion: { order: 100 } }),
  ]));

  assert.deepEqual(issues, []);
});

test('an entry cannot wait for recursion while preventing incoming recursion', async () => {
  const issues = await runtimeIssues(completeAssembly([
    worldbookEntry({
      recursion: {
        prevent_incoming: true,
        delay_until_recursion: true,
      },
    }),
  ]));

  assertIssue(issues, 'assembly.recursion', '/recursion');
});

test('numeric recursion delay levels survive assembly without boolean coercion', async () => {
  const assembly = completeAssembly([
    worldbookEntry({ recursion: { delay_until_recursion: 3 } }),
  ]);
  assert.equal(validateAssemblySchema(assembly), true, JSON.stringify(validateAssemblySchema.errors, null, 2));
  assert.deepEqual(await runtimeIssues(assembly), []);

  const result = await applyAssemblyManifest({
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: { name: '递归层级测试', extensions: {} },
  }, {
    sources: sourcesFor(assembly),
    projectRoot: process.cwd(),
    target: 'character',
  });
  assert.deepEqual(result.issues, []);
  const [entry] = result.payload.data.character_book.entries;
  assert.equal(entry.delayUntilRecursion, 3);
  assert.equal(entry.extensions.delay_until_recursion, 3);
});

test('content-rich worldbooks warn when every entry blocks recursion in both directions', async () => {
  const entries = Array.from({ length: 5 }, (_, index) => worldbookEntry({
    id: `content_${index}`,
    displayName: `内容条目 ${index}`,
    activation: {
      mode: 'keywords',
      primary_keys: [`关键词${index}`],
      secondary_keys: [],
      selective: false,
    },
    insertion: { order: 100 + index },
    recursion: { prevent_incoming: true, prevent_outgoing: true },
  }));
  const validation = await runtimeValidation(completeAssembly(entries), {
    features: { world: true, scenes: true },
    target: 'character_card',
  });

  assert.ok(
    validation.warnings.some(issue => issue.rule === 'assembly.recursion_network'),
    `missing closed recursion network warning:\n${JSON.stringify(validation, null, 2)}`,
  );
});
