(() => {
  'use strict';

  function escapeSlashText(value) {
    return String(value)
      .replaceAll('\\', '\\\\')
      .replaceAll('|', '\\|')
      .replaceAll('\r\n', '{{newline}}')
      .replaceAll('\n', '{{newline}}');
  }

  const api = {
    async setInput(text) {
      const value = String(text || '').trim().slice(0, 220);
      if (!value) throw new Error('行动文本为空');
      if (typeof triggerSlash === 'function') {
        await triggerSlash('/setinput ' + escapeSlashText(value));
        return;
      }
      const textarea = window.parent?.document?.querySelector('#send_textarea');
      if (!textarea) throw new Error('找不到 SillyTavern 输入框');
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };

  initializeGlobal('航站输入桥', api);
  addEventListener('pagehide', () => {
    if (window.parent?.航站输入桥 === api) delete window.parent.航站输入桥;
  }, { once: true });
})();
