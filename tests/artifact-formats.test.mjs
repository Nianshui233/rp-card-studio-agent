import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forge = process.env.RP_CARD_FORGE ?? path.join(skillRoot, 'scripts', 'rp-card-forge.bundle.mjs');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function runForge(args, { expectSuccess = false } = {}) {
  const result = spawnSync(process.execPath, [forge, ...args, '--json'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  let report = null;
  try {
    report = JSON.parse(output);
  } catch {
    // Assertions below include the raw output when a report cannot be parsed.
  }
  if (expectSuccess && result.status !== 0) {
    assert.fail(`Forge failed with status ${result.status}:\n${output}`);
  }
  return { ...result, output, report };
}

function tempRoot(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), `rp-card-formats-${label}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeJson(target, payload) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function characterCard(version, name, dataOverrides = {}) {
  return {
    spec: `chara_card_v${version}`,
    spec_version: `${version}.0`,
    data: {
      name,
      description: `${name} description`,
      personality: 'Measured',
      scenario: 'A format compatibility test.',
      first_mes: 'Hello.',
      mes_example: '<START>\n{{char}}: Hello.',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags: ['format-test'],
      creator: 'RP Card Studio tests',
      character_version: '1.0',
      extensions: {},
      ...dataOverrides,
    },
  };
}

function regexScript(overrides = {}) {
  return {
    id: '666902d9-29fc-49c6-b70e-0a9c26932b09',
    scriptName: '[UI] Message status',
    findRegex: '/<StatusPlaceHolderImpl\\s*\\/?>/gi',
    replaceString: '<div>Status</div>',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    ...overrides,
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function textChunk(keyword, text) {
  return pngChunk('tEXt', Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(text, 'latin1'),
  ]));
}

function cardChunk(keyword, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return textChunk(keyword, encoded);
}

function makePng(textChunks) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixel = deflateSync(Buffer.from([0, 0, 0, 0, 0]));
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', header),
    ...textChunks,
    pngChunk('IDAT', pixel),
    pngChunk('IEND'),
  ]);
}

function readTextChunks(buffer) {
  assert.ok(buffer.subarray(0, pngSignature.length).equals(pngSignature), 'fixture is not a PNG');
  const entries = [];
  let offset = pngSignature.length;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const separator = data.indexOf(0);
      entries.push({
        keyword: data.toString('latin1', 0, separator),
        text: data.toString('latin1', separator + 1),
      });
    }
    offset += length + 12;
  }
  return entries;
}

function decodeCardChunk(entry) {
  return JSON.parse(Buffer.from(entry.text, 'base64').toString('utf8'));
}

test('PNG unpack prefers ccv3 over a conflicting chara payload', t => {
  const root = tempRoot(t, 'ccv3-priority');
  const input = path.join(root, 'conflicting.png');
  const legacy = characterCard(2, 'Legacy chara payload');
  const current = characterCard(3, 'Preferred ccv3 payload', {
    assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
  });
  writeFileSync(input, makePng([cardChunk('chara', legacy), cardChunk('ccv3', current)]));
  const unpacked = path.join(root, 'unpacked');

  runForge(['unpack', input, '--output', unpacked, '--nsfw', 'disabled'], { expectSuccess: true });

  const selected = JSON.parse(readFileSync(path.join(unpacked, 'src', 'import', 'original.json'), 'utf8'));
  assert.equal(selected.spec, 'chara_card_v3');
  assert.equal(selected.data.name, 'Preferred ccv3 payload');
});

test('V3 JSON can be unpacked and packed without semantic loss', t => {
  const root = tempRoot(t, 'v3-json');
  const input = path.join(root, 'input.json');
  const expected = characterCard(3, 'V3 JSON card', {
    nickname: 'V3',
    source: ['https://example.invalid/source'],
    group_only_greetings: ['Welcome, group.'],
    assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
  });
  writeJson(input, expected);
  const unpacked = path.join(root, 'unpacked');
  const repackedPath = path.join(root, 'repacked.json');

  runForge(['unpack', input, '--output', unpacked, '--nsfw', 'disabled'], { expectSuccess: true });
  runForge(['pack', unpacked, '--output', repackedPath], { expectSuccess: true });

  const repacked = JSON.parse(readFileSync(repackedPath, 'utf8'));
  assert.deepEqual(repacked, expected);
});

test('V3 PNG pack rewrites synchronized chara and ccv3 payloads', t => {
  const root = tempRoot(t, 'v3-png');
  const input = path.join(root, 'input.png');
  const legacy = characterCard(2, 'Legacy PNG payload');
  const current = characterCard(3, 'Current PNG payload', {
    assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
  });
  writeFileSync(input, makePng([
    textChunk('fixture-note', 'preserve me'),
    cardChunk('chara', legacy),
    cardChunk('ccv3', current),
  ]));
  const unpacked = path.join(root, 'unpacked');
  const repackedPath = path.join(root, 'repacked.png');

  runForge(['unpack', input, '--output', unpacked, '--nsfw', 'disabled'], { expectSuccess: true });
  const sourcePath = path.join(unpacked, 'src', 'characters', 'card.yaml');
  const source = readFileSync(sourcePath, 'utf8');
  const edited = source.replace(/^display_name:.*$/m, 'display_name: Edited V3 PNG card');
  assert.notEqual(edited, source, 'unpacked character source did not contain display_name');
  writeFileSync(sourcePath, edited, 'utf8');
  runForge(['pack', unpacked, '--output', repackedPath], { expectSuccess: true });

  const textEntries = readTextChunks(readFileSync(repackedPath));
  const characterEntries = textEntries.filter(entry => ['chara', 'ccv3'].includes(entry.keyword.toLowerCase()));
  assert.deepEqual(characterEntries.map(entry => entry.keyword).sort(), ['ccv3', 'chara']);
  const chara = decodeCardChunk(characterEntries.find(entry => entry.keyword === 'chara'));
  const ccv3 = decodeCardChunk(characterEntries.find(entry => entry.keyword === 'ccv3'));
  assert.deepEqual(chara, ccv3, 'chara and ccv3 retained conflicting payloads after pack');
  assert.equal(chara.spec, 'chara_card_v3');
  assert.equal(chara.spec_version, '3.0');
  assert.equal(chara.data.name, 'Edited V3 PNG card');
  assert.equal(textEntries.find(entry => entry.keyword === 'fixture-note')?.text, 'preserve me');
});

test('PNG character keywords use SillyTavern case-insensitive matching', t => {
  const root = tempRoot(t, 'keyword-case');
  const input = path.join(root, 'mixed-case.png');
  writeFileSync(input, makePng([cardChunk('ChArA', characterCard(2, 'Mixed-case keyword card'))]));

  const result = runForge(['inspect', input], { expectSuccess: true });

  assert.equal(result.report?.data?.name, 'Mixed-case keyword card', result.output);
});

test('V2 spec_version accepts exactly 2.0', t => {
  const root = tempRoot(t, 'v2-version');
  const validPath = path.join(root, 'valid.json');
  writeJson(validPath, characterCard(2, 'Valid V2 card'));
  runForge(['validate', validPath], { expectSuccess: true });

  const unexpectedlyAccepted = [];
  for (const version of ['2', '2.0.0', '2.1']) {
    const input = path.join(root, `invalid-${version.replaceAll('.', '-')}.json`);
    const payload = characterCard(2, `Invalid V2 ${version}`);
    payload.spec_version = version;
    writeJson(input, payload);
    const result = runForge(['validate', input]);
    if (result.status === 0) {
      unexpectedlyAccepted.push(version);
    } else {
      assert.match(result.output, /spec_version/, `V2 ${version} was rejected for the wrong reason:\n${result.output}`);
    }
  }

  assert.deepEqual(unexpectedlyAccepted, [], `invalid V2 versions were accepted: ${unexpectedlyAccepted.join(', ')}`);
});

test('V2 and V3 artifacts validate complete SillyTavern scoped regex scripts', t => {
  const root = tempRoot(t, 'regex-schema');
  for (const version of [2, 3]) {
    const input = path.join(root, `v${version}.json`);
    writeJson(input, characterCard(version, `V${version} regex card`, {
      extensions: { regex_scripts: [regexScript()] },
    }));
    runForge(['validate', input], { expectSuccess: true });
  }
});

test('artifact validation rejects malformed scoped regex host fields', t => {
  const root = tempRoot(t, 'regex-invalid');
  const cases = [
    ['uuid', { id: 'rp_card_status' }],
    ['placement', { placement: [4] }],
    ['boolean', { promptOnly: 'false' }],
    ['substitute', { substituteRegex: 3 }],
    ['minimum-depth', { minDepth: -2 }],
    ['maximum-depth', { maxDepth: -1 }],
    ['depth-order', { minDepth: 4, maxDepth: 3 }],
    ['syntax', { findRegex: '/[unterminated/g' }],
  ];

  for (const [label, overrides] of cases) {
    const input = path.join(root, `${label}.json`);
    writeJson(input, characterCard(2, `Invalid regex ${label}`, {
      extensions: { regex_scripts: [regexScript(overrides)] },
    }));
    const result = runForge(['validate', input]);
    assert.notEqual(result.status, 0, `${label} regex contract was unexpectedly accepted`);
    assert.match(result.output, /regex_scripts|placement|Depth|substituteRegex|promptOnly|id/i);
  }
});

test('artifact validation rejects duplicate scoped regex UUIDs', t => {
  const root = tempRoot(t, 'regex-duplicate');
  const input = path.join(root, 'duplicate.json');
  writeJson(input, characterCard(3, 'Duplicate regex UUID', {
    extensions: { regex_scripts: [regexScript(), regexScript({ scriptName: 'Duplicate' })] },
  }));
  const result = runForge(['validate', input]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /duplicate scoped regex UUID|regex\.id_duplicate/i);
});
