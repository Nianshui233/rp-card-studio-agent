const Host = (() => {
  const cleanups = new Set();
  const scopes = () => {
    const result = [window];
    try { if (window.parent && window.parent !== window) result.push(window.parent); } catch {}
    return result;
  };
  const value = name => {
    for (const scope of scopes()) {
      try { if (scope?.[name] !== undefined && scope?.[name] !== null) return scope[name]; } catch {}
    }
    return null;
  };
  const api = name => {
    const direct = value(name);
    if (typeof direct === "function") return direct;
    const helper = value("TavernHelper");
    if (typeof helper?.[name] === "function") return helper[name].bind(helper);
    return null;
  };
  const currentMessageId = () => {
    try {
      const id = api("getCurrentMessageId")?.();
      return Number.isInteger(id) && id >= 0 ? id : null;
    } catch { return null; }
  };
  async function readState() {
    const projectState = value("__RAIN_STATE__");
    if (projectState) return projectState;
    const mvu = value("Mvu");
    if (mvu?.getMvuData) {
      try { return mvu.getMvuData({ type: "message", message_id: currentMessageId() ?? "latest" })?.stat_data ?? null; } catch {}
    }
    try { return api("getVariables")?.({ type: "message", message_id: currentMessageId() ?? "latest" })?.stat_data ?? window.__RP_UI_MOCK__ ?? null; } catch {}
    return window.__RP_UI_MOCK__ ?? null;
  }
  async function writeInput(text) {
    const valueToWrite = String(text ?? "");
    try { if (api("triggerSlash")) { await api("triggerSlash")(`/setinput ${JSON.stringify(valueToWrite)}`); return { ok: true, route: "tavern-helper-slash" }; } } catch {}
    try {
      const input = window.parent?.document?.getElementById("send_textarea");
      if (input) { input.value = valueToWrite; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); input.focus(); return { ok: true, route: "textarea" }; }
    } catch {}
    try { if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(valueToWrite); return { ok: false, route: "clipboard", text: valueToWrite }; } } catch {}
    return { ok: false, route: "manual", text: valueToWrite };
  }
  function on(event, listener) {
    const eventOn = api("eventOn");
    if (eventOn) { try { const off = eventOn(event, listener); if (typeof off === "function") cleanups.add(off); return off || (() => {}); } catch {} }
    return () => {};
  }
  function clear() { for (const off of cleanups) { try { off(); } catch {} } cleanups.clear(); }
  addEventListener("pagehide", clear, { once: true });
  return { value, api, readState, writeInput, on, clear, capabilities: () => ({ projectState: Boolean(value("__RAIN_STATE__")), mvu: Boolean(value("Mvu")), tavernHelper: Boolean(value("TavernHelper")) }) };
})();