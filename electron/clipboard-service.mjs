import { randomUUID } from 'node:crypto';
import { deserializeFragmentText, FRAGMENT_TEXT_LIMIT } from '../schemka-model-io/src/fragment-file.js';
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
export function pngImage(input, nativeImage) {
  if (!(input instanceof Uint8Array) || input.byteLength < 33 || input.byteLength > 64 * 1024 * 1024) fail('CLIPBOARD_IMAGE', 'Изображение должно быть PNG не больше 64 MiB.');
  const bytes = Buffer.from(input);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') fail('CLIPBOARD_IMAGE', 'Некорректное изображение PNG.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 32 * 1024 * 1024) fail('CLIPBOARD_IMAGE', 'Изображение превышает 16384 px или 32 MiPixels.');
  const image = nativeImage.createFromBuffer(bytes), size = image.getSize();
  if (image.isEmpty() || size.width !== width || size.height !== height) fail('CLIPBOARD_IMAGE', 'PNG не удалось декодировать.');
  return image;
}
/** Clipboard ownership is process-local. Only successful destination commit may acknowledge a one-shot cut. */
export function createClipboardService({ clipboard, nativeImage, ClipboardItem, timeoutMs = 3000 }) {
  let cut = null, writing = null, generation = 0; const claimed = new Map();
  function current(record, token) {
    if (record.window.isDestroyed() || !token || record.files.documentToken !== token) fail('DOCUMENT_STALE', 'Модель этого окна уже изменилась.');
    if (record.files.busy || record.git.busy || record.openBusy) fail('FILE_BUSY', 'Дождитесь текущей операции.');
  }
  function finish(operation, result) {
    if (!operation) return;
    if (operation.pending) { clearTimeout(operation.pending.timer); operation.pending.resolve(result); }
    claimed.delete(operation.id); if (cut === operation) cut = null;
  }
  function live(operation) { return operation && cut === operation && !writing && !operation.record.window.isDestroyed() && operation.record.files.documentToken === operation.token; }
  async function exact(operation) {
    if (!live(operation)) return false;
    const revision = generation, text = await clipboard.readText();
    return revision === generation && live(operation) && text === operation.text;
  }
  async function writeClipboard(record, token, action, commit) {
    current(record, token);
    if (writing) fail('FILE_BUSY', 'Дождитесь записи в системный буфер.');
    const request = { record, cancelled: false }; writing = request; generation++;
    finish(cut, { status: 'ok', sourceRemoved: false, reason: 'Буфер был заменён.' });
    try {
      await action();
      current(record, token);
      if (request.cancelled) fail('DOCUMENT_STALE', 'Окно источника уже изменилось.');
      return commit();
    } finally { writing = null; }
  }
  return {
    async write(record, options) {
      if (!options || typeof options !== 'object' || Object.keys(options).some(key => !['text', 'token', 'cut'].includes(key)) || typeof options.cut !== 'boolean') fail('CLIPBOARD_FRAGMENT', 'Некорректный фрагмент.');
      const { text, token, cut: move } = options;
      current(record, token); deserializeFragmentText(text);
      if (move && [...claimed.values()].some(operation => operation.record === record)) fail('FILE_BUSY', 'Дождитесь завершения переноса из этого окна.');
      return writeClipboard(record, token, () => clipboard.writeText(text), () => {
        if (move) cut = { id: randomUUID(), record, token, text, pending: null, delivered: false };
        return { status: 'ok', cutId: cut?.id ?? null };
      });
    },
    async read() {
      if (writing) fail('FILE_BUSY', 'Дождитесь записи в системный буфер.');
      const revision = generation, operation = cut, text = await clipboard.readText();
      if (revision !== generation) fail('CLIPBOARD_STALE', 'Буфер изменился во время чтения. Повторите вставку.');
      if (text.length > FRAGMENT_TEXT_LIMIT) fail('CLIPBOARD_FRAGMENT', 'Фрагмент превышает допустимый размер.');
      deserializeFragmentText(text);
      if (operation && cut === operation && (!live(operation) || text !== operation.text)) finish(operation, { status: 'ok', sourceRemoved: false, reason: 'Источник или буфер изменился.' });
      return { status: 'ok', text, cutId: cut === operation && live(operation) && !operation.delivered ? operation.id : null };
    },
    async acknowledge(record, id, token) {
      current(record, token);
      const operation = cut;
      if (!operation || operation.id !== id || operation.delivered || operation.record === record) return { status: 'ok', sourceRemoved: false, reason: 'Источник изменился или недоступен; фрагмент скопирован.' };
      operation.delivered = true; operation.destination = record; operation.destinationToken = token;
      return new Promise(resolve => {
        // The timeout also bounds native clipboard reads; a late read must never deliver deletion.
        const timer = setTimeout(() => finish(operation, { status: 'ok', sourceRemoved: false, reason: 'Источник не подтвердил удаление; фрагмент скопирован.' }), timeoutMs);
        operation.pending = { resolve, timer };
        exact(operation).then(matches => {
          if (!matches || !live(operation)) { finish(operation, { status: 'ok', sourceRemoved: false, reason: 'Источник или буфер изменился; фрагмент скопирован.' }); return; }
          current(record, token);
          operation.record.window.webContents.send('schemka:clipboard-cut-delivered', { cutId: operation.id, sourceToken: operation.token });
        }).catch(error => finish(operation, { status: 'error', sourceRemoved: false, code: error.code || 'CLIPBOARD_IO', message: error.message, reason: error.message }));
      });
    },
    async claim(record, id, token) {
      const operation = cut;
      if (!operation || !operation.pending || operation.record !== record || operation.id !== id || operation.token !== token || !await exact(operation) || !live(operation)) return { status: 'error', code: 'CLIPBOARD_STALE' };
      current(record, token); current(operation.destination, operation.destinationToken);
      // The renderer must claim deletion before the timeout can report a preserved source.
      clearTimeout(operation.pending.timer); claimed.set(id, operation); cut = null;
      return { status: 'ok' };
    },
    complete(record, id, token, result) {
      const operation = claimed.get(id);
      if (!operation || operation.record !== record || operation.token !== token || !result || typeof result.removed !== 'boolean' || (result.reason !== undefined && (typeof result.reason !== 'string' || result.reason.length > 500))) return { status: 'error', code: 'CLIPBOARD_STALE' };
      finish(operation, { status: 'ok', sourceRemoved: result.removed, reason: result.reason || (result.removed ? 'Исходный фрагмент удалён.' : 'Источник сохранён; фрагмент скопирован.') });
      return { status: 'ok' };
    },
    async image(record, input, token) {
      current(record, token); pngImage(input, nativeImage);
      const item = new ClipboardItem({ 'image/png': new Blob([input], { type: 'image/png' }) });
      return writeClipboard(record, token, () => clipboard.write([item]), () => ({ status: 'ok' }));
    },
    closed(record) {
      if (writing?.record === record) writing.cancelled = true;
      if (cut && (cut.record === record || cut.destination === record)) finish(cut, { status: 'ok', sourceRemoved: false, reason: 'Окно переноса недоступно; исходник сохранён.' });
      for (const operation of claimed.values()) if (operation.record === record || operation.destination === record) finish(operation, { status: 'ok', sourceRemoved: null, reason: 'Окно переноса недоступно. Результат удаления исходника не подтверждён; проверьте обе модели.' });
    },
  };
}
