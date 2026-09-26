import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function unquoteKey(raw) {
  const key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) return key.slice(1, -1);
  return key;
}

function lineRecords(text) {
  const records = [];
  const pattern = /[^\n]*\n|[^\n]+$/g;
  for (const match of text.matchAll(pattern)) records.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  return records;
}

export function splitYamlTextLosslessly(sourceText, { indent = 0 } = {}) {
  const source = String(sourceText).replace(/^\uFEFF/, '');
  if (!Number.isInteger(indent) || indent < 0) throw new Error('indent 必须是非负整数');
  if (/\t/.test(source)) throw new Error('无损切片要求 YAML 使用空格缩进，不能含 Tab');
  const lines = lineRecords(source);
  const prefix = ' '.repeat(indent);
  const boundaries = [];

  for (const line of lines) {
    const body = line.text.replace(/\r?\n$/, '');
    if (!body.startsWith(prefix) || body.startsWith(prefix + ' ') || !body.trim() || body.trimStart().startsWith('#') || body.slice(indent).startsWith('- ')) continue;
    const rest = body.slice(indent);
    const match = rest.match(/^((?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#][^:]*?)):\s*(?:.*)$/);
    if (!match) continue;
    boundaries.push({ start: line.start, key: unquoteKey(match[1]) });
  }

  if (!boundaries.length) throw new Error('在指定缩进层级找不到 YAML mapping 边界');

  return boundaries.map((boundary, index) => {
    const start = index === 0 ? 0 : boundary.start;
    const end = index + 1 < boundaries.length ? boundaries[index + 1].start : source.length;
    return { key: boundary.key, content: source.slice(start, end), start, end };
  });
}

function worldbookEntry(uid, section) {
  return {
    uid,
    key: [],
    keysecondary: [],
    comment: section.key,
    content: section.content,
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: 0,
    addMemo: true,
    order: 100 - uid,
    position: 0,
    disable: false,
    excludeRecursion: false,
    preventRecursion: true,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: null,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    displayIndex: uid,
  };
}

export function buildLosslessWorldbook(sourceText, options = {}) {
  const startUid = Number(options.startUid || 0);
  if (!Number.isInteger(startUid) || startUid < 0) throw new Error('startUid 必须是非负整数');
  const sections = splitYamlTextLosslessly(sourceText, options);
  const entries = {};
  sections.forEach((section, index) => { entries[startUid + index] = worldbookEntry(startUid + index, section); });
  const reconstructed = Object.values(entries).map(entry => entry.content).join('');
  const source = String(sourceText).replace(/^\uFEFF/, '');
  if (reconstructed !== source) throw new Error('内部错误：世界书条目无法无损重组源 YAML');
  return { entries };
}

function arg(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const sourcePath = arg('--source', args);
  const outputPath = arg('--output', args);
  if (!sourcePath || !outputPath) {
    console.error('用法: node split-yaml-lossless.mjs --source <完整.yaml> --output <世界书.json> [--indent 0] [--start-uid 0]');
    process.exitCode = 2;
    return;
  }
  const indent = Number(arg('--indent', args) || 0);
  const startUid = Number(arg('--start-uid', args) || 0);
  const source = fs.readFileSync(path.resolve(sourcePath), 'utf8');
  const worldbook = buildLosslessWorldbook(source, { indent, startUid });
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(worldbook, null, 2) + '\n', 'utf8');
  const count = Object.keys(worldbook.entries).length;
  console.log(`OK: ${count} 个世界书条目；content 可按 UID 顺序无损重组源 YAML`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
