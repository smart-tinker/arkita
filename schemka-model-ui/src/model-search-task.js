import { searchModel, planNameReplacement } from '../../schemka-model-core/src/model-search.js';

export function createSearchTask(window, { workerFactory = () => new window.Worker(new URL('./model-search-worker.js', import.meta.url), { type: 'module' }), timeout = 1500 } = {}) {
  let active = null;
  function cancel() {
    if (!active) return;
    active.finish(new Error('Поиск отменён.'));
  }
  function run(state, options, replacement = null, owners = null) {
    cancel();
    // Literal work is bounded by the model limits; regex never falls back to the UI thread.
    if (!options.regex && typeof window.Worker !== 'function') return Promise.resolve(replacement === null ? searchModel(state, options) : planNameReplacement(state, options, replacement, owners));
    return new Promise((resolve, reject) => {
      let worker, timer;
      const request = { finish(error, result) {
        if (active !== request) return;
        active = null; window.clearTimeout(timer); worker?.terminate();
        error ? reject(error) : resolve(result);
      } };
      active = request;
      try {
        worker = workerFactory();
        timer = window.setTimeout(() => request.finish(new Error('Поиск превысил 1,5 секунды и остановлен. Упростите выражение или сузьте область.')), timeout);
        worker.onmessage = event => event.data.error ? request.finish(new Error(event.data.error.message)) : request.finish(null, event.data.result);
        worker.onerror = () => request.finish(new Error('Worker поиска недоступен. Регулярное выражение не выполнялось в интерфейсе.'));
        worker.postMessage({ state, options, replacement, owners });
      } catch (error) { request.finish(new Error(`Не удалось запустить поиск: ${error.message}`)); }
    });
  }
  return { run, cancel, get active() { return Boolean(active); } };
}
