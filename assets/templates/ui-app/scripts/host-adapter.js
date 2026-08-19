/*
 * SillyTavern / Tavern Helper host adapter
 *
 * This file is deliberately host-neutral at the UI layer. The same HTML can
 * be previewed in a normal browser and run inside a Tavern Helper message
 * iframe. Runtime code should call Host.* instead of reaching into a single
 * guessed global or assuming that the parent DOM is always available.
 */
const Host = (() => {
  const cleanups = new Set();

  function scopes() {
    const result = [window];
    try {
      if (window.parent && window.parent !== window) result.push(window.parent);
    } catch {
      // Cross-window access can fail in a normal browser preview.
    }
    return result;
  }

  function value(name) {
    for (const scope of scopes()) {
      try {
        if (scope?.[name] !== undefined && scope?.[name] !== null) return scope[name];
      } catch {
        // Keep probing the next host surface.
      }
    }
    return null;
  }

  function helper() {
    return value('TavernHelper');
  }

  function context() {
    for (const scope of scopes()) {
      try {
        const silly = scope?.SillyTavern;
        if (typeof silly?.getContext === 'function') return silly.getContext();
      } catch {
        // Continue to the next scope.
      }
    }
    return null;
  }

  function api(name) {
    const direct = value(name);
    if (typeof direct === 'function') return direct;
    const helperApi = helper();
    if (typeof helperApi?.[name] === 'function') return helperApi[name].bind(helperApi);
    const hostContext = context();
    if (typeof hostContext?.[name] === 'function') return hostContext[name].bind(hostContext);
    return null;
  }

  function currentMessageId() {
    try {
      const getId = api('getCurrentMessageId');
      const id = getId?.();
      return Number.isInteger(id) && id >= 0 ? id : null;
    } catch {
      return null;
    }
  }

  async function waitForMvu(timeoutMs = 6000) {
    const existing = value('Mvu');
    if (existing?.getMvuData) return existing;

    const wait = api('waitGlobalInitialized');
    if (wait) {
      let timeoutHandle;
      try {
        const timeout = new Promise((resolve) => {
          timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
        });
        const result = await Promise.race([Promise.resolve(wait('Mvu')), timeout]);
        if (result?.getMvuData) return result;
      } catch {
        // A missing optional MVU layer is a normal fallback case.
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    }

    return value('Mvu')?.getMvuData ? value('Mvu') : null;
  }

  function normalizeState(data) {
    if (!data || typeof data !== 'object') return null;
    // MVU exposes { stat_data, initialized_lorebooks, ... }.
    if (data.stat_data && typeof data.stat_data === 'object') return data.stat_data;
    return data;
  }

  async function readState() {
    const id = currentMessageId();
    const mvu = await waitForMvu();
    if (mvu?.getMvuData) {
      try {
        const mvuData = mvu.getMvuData({
          type: 'message',
          message_id: id ?? 'latest',
        });
        const state = normalizeState(mvuData);
        if (state) return state;
      } catch {
        // Fall through to the Tavern Helper variable table.
      }
    }

    const getVariables = api('getVariables');
    if (getVariables) {
      try {
        const variables = getVariables({
          type: 'message',
          message_id: id ?? 'latest',
        });
        const state = normalizeState(variables);
        if (state) return state;
      } catch {
        // The current surface may not be a message iframe.
      }
    }

    return window.__RP_UI_MOCK__ ?? null;
  }

  function addCleanup(fn) {
    if (typeof fn === 'function') cleanups.add(fn);
    return fn;
  }

  function on(event, listener) {
    if (!event || typeof listener !== 'function') return () => {};

    const eventOn = api('eventOn');
    if (eventOn) {
      try {
        const off = eventOn(event, listener);
        const cleanup = typeof off === 'function' ? off : () => {};
        return addCleanup(cleanup);
      } catch {
        // Try the native event source below.
      }
    }

    const hostContext = context();
    const source = hostContext?.eventSource || value('eventSource');
    if (source?.on) {
      try {
        source.on(event, listener);
        const cleanup = () => {
          try {
            if (source.removeListener) source.removeListener(event, listener);
            else if (source.off) source.off(event, listener);
          } catch {
            // Best-effort cleanup for host event emitters.
          }
        };
        return addCleanup(cleanup);
      } catch {
        // No usable event surface.
      }
    }

    return () => {};
  }

  function eventName(name) {
    if (!name) return name;
    for (const scope of scopes()) {
      try {
        const table = scope?.tavern_events || scope?.iframe_events || scope?.event_types || scope?.eventTypes;
        if (table?.[name]) return table[name];
      } catch {
        // Keep the literal event name as a fallback.
      }
    }
    const mvu = value('Mvu');
    if (mvu?.events?.[name]) return mvu.events[name];
    const hostContext = context();
    return hostContext?.eventTypes?.[name] || hostContext?.event_types?.[name] || name;
  }

  function onNamed(name, listener) {
    return on(eventName(name), listener);
  }

  function clear() {
    for (const cleanup of cleanups) {
      try { cleanup(); } catch {}
    }
    cleanups.clear();
  }

  async function writeInput(text) {
    const valueToWrite = String(text ?? '');
    const triggerSlash = api('triggerSlash');
    if (triggerSlash) {
      try {
        await triggerSlash(`/setinput ${JSON.stringify(valueToWrite)}`);
        return { ok: true, route: 'tavern-helper-slash' };
      } catch {
        // Direct DOM and clipboard are still useful fallbacks.
      }
    }

    try {
      const input = window.parent?.document?.getElementById('send_textarea')
        || (typeof document !== 'undefined' ? document.getElementById?.('send_textarea') : null);
      if (input) {
        input.value = valueToWrite;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
        return { ok: true, route: 'textarea' };
      }
    } catch {
      // Normal browser preview or a changed host DOM.
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(valueToWrite);
        return { ok: false, route: 'clipboard', text: valueToWrite };
      }
    } catch {
      // Clipboard permissions are optional.
    }

    return { ok: false, route: 'manual', text: valueToWrite };
  }

  function capabilities() {
    const hostContext = context();
    const mvu = value('Mvu');
    let tavernVersion = null;
    let tavernHelperVersion = null;
    try { tavernVersion = api('getTavernVersion')?.() ?? hostContext?.version ?? null; } catch {}
    try { tavernHelperVersion = api('getTavernHelperVersion')?.() ?? null; } catch {}
    return {
      tavernHelper: Boolean(helper()),
      sillyTavern: Boolean(hostContext),
      mvu: Boolean(mvu?.getMvuData || api('waitGlobalInitialized')),
      messageId: Boolean(api('getCurrentMessageId')),
      messageVariables: Boolean(api('getVariables')),
      events: Boolean(api('eventOn') || hostContext?.eventSource || value('eventSource')),
      input: Boolean(window.parent?.document?.getElementById?.('send_textarea') || api('triggerSlash')),
      regexReplay: Boolean(api('formatAsTavernRegexedString')),
      worldbookBinding: Boolean(api('getCharWorldbookNames') && api('rebindCharWorldbooks')),
      tavernVersion,
      tavernHelperVersion,
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener?.('pagehide', clear, { once: true });
  }

  return {
    scopes,
    value,
    api,
    context,
    currentMessageId,
    waitForMvu,
    readState,
    writeInput,
    on,
    onNamed,
    eventName,
    clear,
    capabilities,
  };
})();
