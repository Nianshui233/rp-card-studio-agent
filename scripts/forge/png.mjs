import { inputError, integrityError } from './errors.mjs';
import { decodeUtf8, parseJsonText, sha256 } from './json.mjs';

export var PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}
function crc32(buffer) {
  const table = getCrcTable();
  let crc = 4294967295;
  for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function makeChunk(type, data) {
  if (!/^[A-Za-z]{4}$/.test(type)) throw inputError(`无效 PNG chunk 类型: ${type}`);
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}
function makeTextChunk(keyword, text) {
  if (!keyword || Buffer.byteLength(keyword, "latin1") > 79 || keyword.includes("\0")) {
    throw inputError(`无效 PNG tEXt keyword: ${keyword}`);
  }
  return makeChunk("tEXt", Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(text, "latin1")
  ]));
}
export function parsePng(buffer, label = "PNG") {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw inputError(`${label} 缺少有效 PNG 签名`);
  }
  const chunks = [];
  let offset = 8;
  let sawIend = false;
  while (offset < buffer.length) {
    if (sawIend) throw integrityError(`${label} 的 IEND 后仍有数据`);
    if (offset + 12 > buffer.length) throw integrityError(`${label} 含截断的 PNG chunk`, { offset });
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw integrityError(`${label} 含越界的 PNG chunk`, { offset, length });
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(buffer.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) {
      throw integrityError(`${label} 的 ${type} chunk CRC 不匹配`, {
        offset,
        expected: expectedCrc,
        actual: actualCrc
      });
    }
    const raw = buffer.subarray(offset, end);
    chunks.push({ type, data, raw, offset });
    offset = end;
    if (type === "IEND") sawIend = true;
  }
  if (!sawIend) throw integrityError(`${label} 缺少 IEND chunk`);
  if (chunks[0]?.type !== "IHDR") throw integrityError(`${label} 的首个 chunk 不是 IHDR`);
  return { chunks, buffer };
}
function parseTextChunk(chunk) {
  const separator = chunk.data.indexOf(0);
  if (separator <= 0) return null;
  return {
    keyword: chunk.data.toString("latin1", 0, separator),
    text: chunk.data.toString("latin1", separator + 1)
  };
}
function decodeStrictBase64(text, label) {
  if (text.length === 0 || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw integrityError(`${label} 不是有效 base64`);
  }
  const decoded = Buffer.from(text, "base64");
  const canonicalInput = text.replace(/=+$/, "");
  const canonicalOutput = decoded.toString("base64").replace(/=+$/, "");
  if (canonicalInput !== canonicalOutput) throw integrityError(`${label} 的 base64 编码损坏`);
  return decoded;
}
export function extractCardFromPng(buffer, label = "PNG") {
  const parsed = parsePng(buffer, label);
  const matches = parsed.chunks.filter((chunk) => chunk.type === "tEXt").map(parseTextChunk).filter((entry) => entry && ["chara", "ccv3"].includes(entry.keyword.toLowerCase())).map((entry) => ({
    ...entry,
    normalizedKeyword: entry.keyword.toLowerCase()
  }));
  const charaMatches = matches.filter((entry) => entry.normalizedKeyword === "chara");
  const ccv3Matches = matches.filter((entry) => entry.normalizedKeyword === "ccv3");
  if (matches.length === 0) throw inputError(`${label} 不含 tEXt/chara 或 tEXt/ccv3 角色卡数据`);
  if (charaMatches.length > 1 || ccv3Matches.length > 1) {
    throw integrityError(`${label} 含重复的角色卡 PNG 数据块，无法安全判定优先级`, {
      chara: charaMatches.length,
      ccv3: ccv3Matches.length
    });
  }
  const selected = ccv3Matches[0] ?? charaMatches[0];
  const payloadLabel = `${label} 的 ${selected.normalizedKeyword} payload`;
  const payloadBuffer = decodeStrictBase64(selected.text, payloadLabel);
  const payload = parseJsonText(decodeUtf8(payloadBuffer, payloadLabel), payloadLabel);
  return {
    payload,
    chunks: parsed.chunks,
    selectedKeyword: selected.normalizedKeyword,
    charaChunks: charaMatches.length,
    ccv3Chunks: ccv3Matches.length,
    nonCardDigest: nonCardChunkDigest(parsed.chunks)
  };
}
function cardChunkKeyword(chunk) {
  if (chunk.type !== "tEXt") return null;
  const keyword = parseTextChunk(chunk)?.keyword?.toLowerCase();
  return keyword === "chara" || keyword === "ccv3" ? keyword : null;
}
function isCardChunk(chunk) {
  return cardChunkKeyword(chunk) !== null;
}
export function nonCardChunkDigest(chunks) {
  return sha256(Buffer.concat(chunks.filter((chunk) => !isCardChunk(chunk)).map((chunk) => chunk.raw)));
}
export function ccv3Payload(payload) {
  const converted = structuredClone(payload);
  converted.spec = "chara_card_v3";
  converted.spec_version = "3.0";
  return converted;
}
export function embedCardInPng(buffer, payload, label = "PNG") {
  const parsed = parsePng(buffer, label);
  const charaEncoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const ccv3Encoded = Buffer.from(JSON.stringify(ccv3Payload(payload)), "utf8").toString("base64");
  const replacements = [
    makeTextChunk("chara", charaEncoded),
    makeTextChunk("ccv3", ccv3Encoded)
  ];
  const output = [PNG_SIGNATURE];
  let inserted = false;
  for (const chunk of parsed.chunks) {
    if (isCardChunk(chunk)) continue;
    if (chunk.type === "IEND" && !inserted) {
      output.push(...replacements);
      inserted = true;
    }
    output.push(chunk.raw);
  }
  const result = Buffer.concat(output);
  const reparsed = parsePng(result, `${label} 输出`);
  const beforeDigest = nonCardChunkDigest(parsed.chunks);
  const afterDigest = nonCardChunkDigest(reparsed.chunks);
  if (beforeDigest !== afterDigest) {
    throw integrityError("写入 chara/ccv3 payload 时修改了非角色卡 PNG chunk", {
      beforeDigest,
      afterDigest
    });
  }
  return result;
}
