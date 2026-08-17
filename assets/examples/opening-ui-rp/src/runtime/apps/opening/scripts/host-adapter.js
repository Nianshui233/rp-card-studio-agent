const Host = {
  writeInput(text) {
    try {
      const input = window.parent?.document?.getElementById("send_textarea");
      if (input) { input.value = text; input.focus(); return { ok: true, route: "textarea" }; }
    } catch {}
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return { ok: false, route: "clipboard" };
    }
    return { ok: false, route: "manual" };
  },
};
