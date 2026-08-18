export function buildUserBlock(input = {}) {
  const esc = (value) => String(value ?? '').replace(/[<>]/g, '');
  return `<回声创角>\n姓名：${esc(input.name)}\n身份：${esc(input.identity)}\n与车站的关系：${esc(input.relation)}\n</回声创角>`;
}

export function sendOrCopy(text, host = globalThis) {
  if (typeof host?.do_sillytavern_input === 'function') return host.do_sillytavern_input(text);
  return { fallback: 'copy', text };
}
