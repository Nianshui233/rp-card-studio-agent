(() => {
  'use strict';
  const api = {
    async setInput(text) {
      if (typeof triggerSlash === 'function') {
        await triggerSlash(`/setinput ${String(text)}`);
        return;
      }
      const textarea = window.parent?.document?.querySelector('#send_textarea');
      if (!textarea) throw new Error('找不到 SillyTavern 输入框');
      textarea.value = String(text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
  initializeGlobal('航站输入桥', api);
  addEventListener('pagehide', () => {
    if (window.parent?.航站输入桥 === api) delete window.parent.航站输入桥;
  }, { once: true });
})();
