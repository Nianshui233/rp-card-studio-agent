const Host = (() => {
  const value = name => {
    try { if (window[name] !== undefined && window[name] !== null) return window[name]; } catch {}
    try { if (window.parent?.[name] !== undefined && window.parent?.[name] !== null) return window.parent[name]; } catch {}
    return null;
  };
  const api = name => {
    const direct = value(name);
    if (typeof direct === "function") return direct;
    const helper = value("TavernHelper");
    if (typeof helper?.[name] === "function") return helper[name].bind(helper);
    return null;
  };
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
  return { value, api, writeInput };
})();