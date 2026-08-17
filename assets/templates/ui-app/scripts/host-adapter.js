const Host = {
  scopes() {
    const scopes = [window];
    try { if (window.parent && window.parent !== window) scopes.push(window.parent); } catch {}
    return scopes;
  },
  value(name) {
    for (const scope of this.scopes()) {
      try { if (scope && scope[name] !== undefined && scope[name] !== null) return scope[name]; } catch {}
    }
    return null;
  },
  fn(name) {
    for (const scope of this.scopes()) {
      try { if (typeof scope?.[name] === "function") return scope[name].bind(scope); } catch {}
    }
    return null;
  },
  async readState() {
    const mvu = this.value("Mvu");
    const messageId = this.fn("getCurrentMessageId")?.() ?? 0;
    if (mvu?.getMvuData) return mvu.getMvuData({ type: "message", message_id: messageId })?.stat_data ?? null;
    return window.__RP_UI_MOCK__ ?? null;
  },
  writeInput(text) {
    try {
      const input = window.parent?.document?.getElementById("send_textarea");
      if (input) { input.value = text; input.focus(); return true; }
    } catch {}
    navigator.clipboard?.writeText?.(text);
    return false;
  },
};
