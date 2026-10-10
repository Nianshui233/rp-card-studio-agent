/** Technical lifecycle utility only: does not choose RP fields, host APIs or player identity. */
export function createBootController({ attempt, render, onState = () => {}, intervalMs = 150, timeoutMs = 15000 } = {}) {
  if (typeof attempt !== 'function' || typeof render !== 'function') throw new TypeError('attempt/render 必须是函数');
  if (!(intervalMs > 0) || !(timeoutMs > 0)) throw new TypeError('必须有明确的等待间隔与超时');
  let epoch = 0, controller = null, running = null;
  let state = { status: 'idle', lastSuccess: null };
  const publish = (status, extra, token) => {
    if (token !== epoch) return;
    state = { ...state, ...extra, status }; onState({ ...state });
  };
  const sleep = signal => new Promise(resolve => {
    if (signal.aborted) return resolve();
    const end = () => { clearTimeout(timer); signal.removeEventListener('abort', end); resolve(); };
    const timer = setTimeout(end, intervalMs); signal.addEventListener('abort', end, { once: true });
  });
  const start = ({ restart = false } = {}) => {
    if (running && !restart) return running;
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal, token = ++epoch;
    publish('waiting_provider', { error: null }, token);
    running = (async () => {
      const deadline = setTimeout(() => { publish('timed_out', { error: '启动等待超时；可重试，不能视为没有游戏数据' }, token); controllerForRun.abort(); }, timeoutMs);
      const controllerForRun = controller;
      const work = (async () => {
        while (!signal.aborted && token === epoch) {
          const result = await attempt({ signal });
          if (signal.aborted || token !== epoch) return;
          if (result?.status === 'ready') {
            await render(result.data, { signal });
            if (!signal.aborted && token === epoch) publish('ready', { lastSuccess: Date.now() }, token);
            return;
          }
          if (!['waiting_provider', 'waiting_snapshot'].includes(result?.status)) throw new Error('attempt 必须区分等待工具、等待快照与 ready');
          publish(result.status, {}, token); await sleep(signal);
        }
      })();
      // Even an unresponsive adapter cannot leave start() pending forever. Late completions are fenced by epoch/signal.
      const aborted = new Promise(resolve => {
        if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true });
      });
      try { await Promise.race([work, aborted]); }
      catch (error) { if (!signal.aborted) publish('failed', { error: String(error.message ?? error) }, token); }
      finally { clearTimeout(deadline); if (token === epoch) running = null; }
      return { ...state };
    })();
    return running;
  };
  return {
    start, retry: () => start({ restart: true }),
    stop() { ++epoch; controller?.abort(); running = null; state = { ...state, status: 'stopped' }; onState({ ...state }); },
    get state() { return { ...state }; },
  };
}
