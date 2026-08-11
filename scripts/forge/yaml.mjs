import YAML from 'yaml';

import { inputError } from './errors.mjs';
import { readUtf8 } from './json.mjs';

function parseYamlText(text, label = "YAML") {
  const document = YAML.parseDocument(text, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true
  });
  if (document.errors.length > 0) {
    throw inputError(`${label} 不是有效 YAML`, {
      errors: document.errors.map((error) => error.message)
    });
  }
  return document.toJS({ maxAliasCount: 100 });
}
export async function readYaml(path5) {
  return parseYamlText(await readUtf8(path5), path5);
}
export function stringifyYaml(value) {
  return YAML.stringify(value, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false
  });
}
