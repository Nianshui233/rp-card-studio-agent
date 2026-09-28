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


def worldbook_entries(worldbook):
    entries = worldbook.get('entries', []) if isinstance(worldbook, dict) else []
    return list(entries.values()) if isinstance(entries, dict) else entries if isinstance(entries, list) else []


def validate_yaml_roots(label, text, expected):
    try:
        data = yaml.safe_load(text)
    except Exception as error:
        return [f'{label}: invalid YAML: {error}']
    if not isinstance(data, dict):
        return [f'{label}: initvar root is not a mapping']
    actual = list(data.keys())
    missing = [key for key in expected if key not in actual]
    extra = [key for key in actual if key not in expected]
    failures = []
    if missing:
        failures.append(f'{label}: missing roots: {", ".join(missing)}')
    if extra:
        failures.append(f'{label}: extra roots: {", ".join(extra)}')
    return failures


def main():
    parser = argparse.ArgumentParser(description='Validate Greeting or worldbook [initvar] YAML against MVU_ZOD top-level Schema roots.')
    parser.add_argument('--card', required=True)
    parser.add_argument('--zod-script', required=True)
    parser.add_argument('--worldbook')
    parser.add_argument('--init-strategy', choices=['auto', 'greeting', 'worldbook'], default='auto')
    args = parser.parse_args()

    card = card_data(load_json(args.card))
    source = Path(args.zod_script).read_text(encoding='utf-8-sig')
    expected = schema_keys(source)
    if not expected:
        raise SystemExit('FAIL: cannot extract top-level keys from Zod Schema')
    greetings = [card.get('first_mes', ''), *(card.get('alternate_greetings') or [])]
    playable = [text for text in greetings if isinstance(text, str) and not pure_carrier(text)]
    greeting_bodies = [init_body(text) for text in playable]
    worldbook_baseline = None
    if args.worldbook:
        worldbook = load_json(args.worldbook)
        for entry in worldbook_entries(worldbook):
            if '[initvar]' in str(entry.get('comment', '')).lower():
                worldbook_baseline = entry.get('content', '')
                break

    strategy = args.init_strategy
    if strategy == 'auto':
        if playable and greeting_bodies and all(body is not None for body in greeting_bodies):
            strategy = 'greeting'
        elif worldbook_baseline is not None:
            strategy = 'worldbook'
        else:
            strategy = 'greeting'

    failures = []
    if strategy == 'greeting':
        if not playable:
            failures.append('no playable greetings')
        for index, body in enumerate(greeting_bodies):
            if body is None:
                failures.append(f'Greeting {index}: missing <initvar>')
            else:
                failures.extend(validate_yaml_roots(f'Greeting {index}', body, expected))
    elif strategy == 'worldbook':
        if worldbook_baseline is None:
            failures.append('worldbook [initvar] entry is missing; pass --worldbook')
        else:
            failures.extend(validate_yaml_roots('[initvar]', worldbook_baseline, expected))
        for index, body in enumerate(greeting_bodies):
            if body is not None:
                failures.extend(validate_yaml_roots(f'Greeting {index} partial initvar', body, expected))

    if failures:
        print('\n'.join('FAIL: ' + item for item in failures), file=sys.stderr)
        raise SystemExit(1)
    if strategy == 'greeting':
        print(f'PASS: {len(playable)} playable greetings have valid YAML and match {len(expected)} Zod roots')
    else:
        print(f'PASS: worldbook [initvar] baseline has valid YAML and matches {len(expected)} Zod roots')


if __name__ == '__main__':
    main()
