import { usageError } from './errors.mjs';

var BOOLEAN_OPTIONS = /* @__PURE__ */ new Set(["json", "dry-run", "force", "help", "version"]);
var VALUE_OPTIONS = /* @__PURE__ */ new Set(["output", "type", "nsfw", "stages", "source", "rationale", "summary"]);
function setOption(options, name, value) {
  if (Object.hasOwn(options, name)) {
    throw usageError(`选项重复: --${name}`);
  }
  options[name] = value;
}
export function parseArgs(argv) {
  const options = {};
  const positional = [];
  let parseOptions = true;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (parseOptions && token === "--") {
      parseOptions = false;
      continue;
    }
    if (!parseOptions || !token.startsWith("-") || token === "-") {
      positional.push(token);
      continue;
    }
    if (token === "-h") {
      setOption(options, "help", true);
      continue;
    }
    if (!token.startsWith("--")) {
      throw usageError(`未知短选项: ${token}`);
    }
    const equalsAt = token.indexOf("=");
    const rawName = token.slice(2, equalsAt === -1 ? void 0 : equalsAt);
    const inlineValue = equalsAt === -1 ? void 0 : token.slice(equalsAt + 1);
    if (BOOLEAN_OPTIONS.has(rawName)) {
      if (inlineValue !== void 0) {
        throw usageError(`布尔选项不接受值: --${rawName}`);
      }
      setOption(options, rawName, true);
      continue;
    }
    if (VALUE_OPTIONS.has(rawName)) {
      const value = inlineValue ?? argv[++index];
      if (value === void 0 || value.startsWith("--")) {
        throw usageError(`选项缺少值: --${rawName}`);
      }
      setOption(options, rawName, value);
      continue;
    }
    throw usageError(`未知选项: --${rawName}`);
  }
  return { options, positional };
}
