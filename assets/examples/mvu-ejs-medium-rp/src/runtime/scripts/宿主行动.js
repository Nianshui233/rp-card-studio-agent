export function sendRainlineAction(text, host = globalThis) {
  const parent = host?.parent && host.parent !== host ? host.parent : host;
  const textarea = parent?.document?.querySelector?.('#send_textarea');
  if (!textarea) return { ok: false, fallback: text };
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, text };
}
