const root = typeof window !== 'undefined' ? window : globalThis;

export function sendArchiveAction(action) {
  const text = `我在潮痕档案馆执行了：${action}`;
  const helper = root.parent?.TavernHelper || root.parent?.tavernHelper;
  if (helper?.triggerSlash) return helper.triggerSlash(`/setinput ${text}`);
  if (typeof root.parent?.sendTextareaMessage === 'function') return root.parent.sendTextareaMessage(text);
  return { ok: false, fallback: text };
}
