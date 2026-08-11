import { inputError } from './errors.mjs';

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
var fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
export function decodeUtf8(buffer, label = "输入") {
  try {
    return fatalUtf8Decoder.decode(buffer);
  } catch (error) {
    throw inputError(`${label} 不是有效 UTF-8`, { cause: error.message });
  }
}
export async function readUtf8(path5) {
  return decodeUtf8(await readFile(path5), path5);
}
export function parseJsonText(text, label = "JSON") {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw inputError(`${label} 不是有效 JSON: ${error.message}`);
  }
}
export async function readJson(path5) {
  return parseJsonText(await readUtf8(path5), path5);
}
export function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
export function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}
export function semanticEqual(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}
export function sha256(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(buffer).digest("hex");
}
export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
