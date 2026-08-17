const Host = {
  scopes() {
    const scopes = [window];
    try { if (window.parent && window.parent !== window) scopes.push(window.parent); } catch {}
    return scopes;
  },
  value(name) {
    for (const scope of this.scopes()) {
      try { if (scope?.[name] !== undefined && scope?.[name] !== null) return scope[name]; } catch {}
    }
    return null;
  },
  readState() { return this.value("__RAIN_STATE__") || window.__RP_UI_MOCK__ || null; },
  writeInput(value) {
    try {
      const input = window.parent?.document?.getElementById("send_textarea");
      if (input) { input.value = `（行动）${value}`; input.focus(); return true; }
    } catch {}
    navigator.clipboard?.writeText?.(`（行动）${value}`);
    return false;
  },
};
