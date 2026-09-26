import argparse
import json
import re
import sys
from pathlib import Path

import yaml


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def card_data(card):
    return card.get('data') if isinstance(card.get('data'), dict) else card


def pure_carrier(text):
    return bool(re.fullmatch(r'\s*<[\w\-\u4e00-\u9fff]+\s*/?>\s*', text or ''))


def init_body(text):
    match = re.search(r'<initvar>([\s\S]*?)</initvar>', text or '', re.I)
    return match.group(1) if match else None


def schema_keys(source):
    marker = 'export const Schema = z.object({'
    start = source.find(marker)
    if start < 0:
        return []
    body_start = start + len(marker)
    depth = 1
    quote = None
    escaped = False
    end = None
    for index, char in enumerate(source[body_start:], body_start):
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"`":
            quote = char
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                end = index
                break
    if end is None:
        return []
    body = source[body_start:end]
    keys = []
    depth = 0
    for line in body.splitlines():
        stripped = line.strip()
        if depth == 0 and stripped and not stripped.startswith('//'):
            match = re.match(r'^(?:"([^"]+)"|\'([^\']+)\'|([\w\u4e00-\u9fff$]+))\s*:', stripped)
            if match:
                keys.append(next(value for value in match.groups() if value is not None))
        line_without_strings = re.sub(r'(["\'`])(?:\\.|(?!\1).)*\1', '', line)
        depth += sum(line_without_strings.count(char) for char in '({[')
        depth -= sum(line_without_strings.count(char) for char in ')}]')
        depth = max(0, depth)
    return list(dict.fromkeys(keys))


def main():
    parser = argparse.ArgumentParser(description='Validate all playable Greeting initvar YAML against MVU_ZOD top-level Schema roots.')
    parser.add_argument('--card', required=True)
    parser.add_argument('--zod-script', required=True)
    args = parser.parse_args()

    card = card_data(load_json(args.card))
    source = Path(args.zod_script).read_text(encoding='utf-8-sig')
    expected = schema_keys(source)
    if not expected:
        raise SystemExit('FAIL: cannot extract top-level keys from Zod Schema')
    greetings = [card.get('first_mes', ''), *(card.get('alternate_greetings') or [])]
    playable = [text for text in greetings if isinstance(text, str) and not pure_carrier(text)]
    if not playable:
        raise SystemExit('FAIL: no playable greetings')
    failures = []
    for index, greeting in enumerate(playable):
        body = init_body(greeting)
        if body is None:
            failures.append(f'Greeting {index}: missing <initvar>')
            continue
        try:
            data = yaml.safe_load(body)
        except Exception as error:
            failures.append(f'Greeting {index}: invalid YAML: {error}')
            continue
        if not isinstance(data, dict):
            failures.append(f'Greeting {index}: initvar root is not a mapping')
            continue
        actual = list(data.keys())
        missing = [key for key in expected if key not in actual]
        extra = [key for key in actual if key not in expected]
        if missing:
            failures.append(f'Greeting {index}: missing roots: {", ".join(missing)}')
        if extra:
            failures.append(f'Greeting {index}: extra roots: {", ".join(extra)}')
    if failures:
        print('\n'.join('FAIL: ' + item for item in failures), file=sys.stderr)
        raise SystemExit(1)
    print(f'PASS: {len(playable)} playable greetings have valid YAML and match {len(expected)} Zod roots')


if __name__ == '__main__':
    main()
