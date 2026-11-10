import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createClipboardService, pngImage } from '../clipboard-service.mjs';
import { createPrintService } from '../print-service.mjs';
import { createProject, createStore, capturePortableFragment } from '../../schemka-model-core/src/index.js';
import { serializeFragmentText } from '../../schemka-model-io/src/fragment-file.js';
function fragment() { const store = createStore(createProject('clipboard')), run = command => store.execute(command, store.revision).created; const viewId = run({ type: 'createView', name: 'one' }).viewId; const { occurrenceId } = run({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent', name: 'a', bounds: { x: 0, y: 0, width: 120, height: 60 } }); return serializeFragmentText(capturePortableFragment(store.snapshot, viewId, [{ kind: 'occurrence', id: occurrenceId }])); }
function owner() { const calls = []; return { window: { isDestroyed: () => false, webContents: { send: (...args) => calls.push(args) } }, files: { documentToken: randomUUID(), busy: false }, git: { busy: false }, calls }; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=', 'base64');
function harness(timeoutMs = 1000) {
  let text = ''; const images = [];
  const clipboard = { readText: async () => text, writeText: async value => { text = value; }, write: async items => { text = ''; images.push(items); } };
  class ClipboardItem { constructor(items) { this.items = items; } }
  const nativeImage = { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }) }) };
  return { clip: createClipboardService({ clipboard, ClipboardItem, nativeImage, timeoutMs }), clipboard, images, get text() { return text; }, set text(value) { text = value; } };
}
const cut = (clip, source, text = fragment()) => clip.write(source, { text, token: source.files.documentToken, cut: true });
test('clipboard cut has exact owner and one-shot successful destination acknowledgement with Electron Promise APIs', async () => {
  const { clip } = harness(), source = owner(), destination = owner(), stranger = owner();
  const written = await cut(clip, source); assert.ok(written.cutId); assert.equal((await clip.read()).cutId, written.cutId);
  await assert.rejects(() => clip.acknowledge(destination, written.cutId, source.files.documentToken), { code: 'DOCUMENT_STALE' });
  const result = clip.acknowledge(destination, written.cutId, destination.files.documentToken); await checkpoint();
  assert.equal(source.calls.length, 1); assert.equal(destination.calls.length, 0); assert.equal((await clip.read()).cutId, null);
  assert.equal(clip.complete(stranger, written.cutId, source.files.documentToken, { removed: true }).code, 'CLIPBOARD_STALE');
  assert.equal(clip.complete(source, written.cutId, source.files.documentToken, { removed: true }).code, 'CLIPBOARD_STALE');
  assert.equal((await clip.claim(stranger, written.cutId, source.files.documentToken)).code, 'CLIPBOARD_STALE');
  assert.equal((await clip.claim(source, written.cutId, source.files.documentToken)).status, 'ok');
  assert.equal((await clip.claim(source, written.cutId, source.files.documentToken)).code, 'CLIPBOARD_STALE');
  assert.equal(clip.complete(source, written.cutId, source.files.documentToken, { removed: true }).status, 'ok'); assert.equal((await result).sourceRemoved, true);
  assert.equal((await clip.acknowledge(destination, written.cutId, destination.files.documentToken)).sourceRemoved, false);
});
test('clipboard changed text, stale source, timeout and invalid input preserve source', async () => {
  const h = harness(10), { clip } = h, source = owner(), destination = owner(), captured = fragment();
  let { cutId } = await cut(clip, source, captured); h.text = fragment(); assert.equal((await clip.acknowledge(destination, cutId, destination.files.documentToken)).sourceRemoved, false); assert.equal(source.calls.length, 0);
  ({ cutId } = await cut(clip, source, captured)); source.files.documentToken = randomUUID(); assert.equal((await clip.read()).cutId, null);
  ({ cutId } = await cut(clip, source, captured)); assert.equal((await clip.acknowledge(destination, cutId, destination.files.documentToken)).sourceRemoved, false);
  await assert.rejects(() => clip.write(source, { text: 'HTML <script>', token: source.files.documentToken, cut: false }));
});
test('closing either window settles pending cuts; claimed operations never falsely report preservation', async () => {
  for (const claimed of [false, true]) for (const side of ['source', 'destination']) {
    const { clip } = harness(), source = owner(), destination = owner();
    const { cutId } = await cut(clip, source), result = clip.acknowledge(destination, cutId, destination.files.documentToken); await checkpoint();
    if (claimed) {
      assert.equal((await clip.claim(source, cutId, source.files.documentToken)).status, 'ok');
      await assert.rejects(() => cut(clip, source), { code: 'FILE_BUSY' });
    }
    clip.closed(side === 'source' ? source : destination);
    assert.equal((await result).sourceRemoved, claimed ? null : false);
    assert.equal((await clip.claim(source, cutId, source.files.documentToken)).code, 'CLIPBOARD_STALE');
    assert.equal(clip.complete(source, cutId, source.files.documentToken, { removed: true }).code, 'CLIPBOARD_STALE');
    assert.ok((await cut(clip, source)).cutId); clip.closed(source);
  }
});
test('a delayed read cannot return or invalidate a newer cut even when its text is identical', async () => {
  const h = harness(), { clip, clipboard } = h, source = owner(), captured = fragment(); await cut(clip, source, captured);
  const read = deferred(), readText = clipboard.readText; clipboard.readText = () => read.promise;
  const pending = clip.read(); const replacement = await cut(clip, source, captured);
  clipboard.readText = readText; read.resolve(captured);
  await assert.rejects(() => pending, { code: 'CLIPBOARD_STALE' });
  assert.equal((await clip.read()).cutId, replacement.cutId); assert.equal(source.calls.length, 0);
});
test('closing or replacing a cut during acknowledgement read settles it without a late deletion message', async () => {
  for (const change of ['replacement', 'source', 'destination', 'timeout']) {
    const h = harness(change === 'timeout' ? 10 : 1000), { clip, clipboard } = h, source = owner(), destination = owner(), captured = fragment();
    const { cutId } = await cut(clip, source, captured), read = deferred(), readText = clipboard.readText;
    clipboard.readText = () => read.promise;
    const pending = clip.acknowledge(destination, cutId, destination.files.documentToken);
    let replacement;
    if (change === 'replacement') replacement = await cut(clip, source, captured);
    else if (change !== 'timeout') clip.closed(change === 'source' ? source : destination);
    assert.equal((await pending).sourceRemoved, false);
    clipboard.readText = readText; read.resolve(captured); await checkpoint();
    assert.equal(source.calls.length, 0);
    assert.equal((await clip.read()).cutId, replacement?.cutId ?? null);
  }
});
test('a delayed claim cannot remove a source after timeout, replacement or destination close', async () => {
  for (const change of ['timeout', 'replacement', 'destination']) {
    const { clip, clipboard } = harness(change === 'timeout' ? 20 : 1000), source = owner(), destination = owner(), captured = fragment();
    const { cutId } = await cut(clip, source, captured), result = clip.acknowledge(destination, cutId, destination.files.documentToken); await checkpoint();
    assert.equal(source.calls.length, 1);
    const read = deferred(), readText = clipboard.readText; clipboard.readText = () => read.promise;
    const claim = clip.claim(source, cutId, source.files.documentToken); let replacement;
    if (change === 'replacement') replacement = await cut(clip, source, captured);
    else if (change === 'destination') clip.closed(destination);
    assert.equal((await result).sourceRemoved, false);
    clipboard.readText = readText; read.resolve(captured);
    assert.equal((await claim).code, 'CLIPBOARD_STALE');
    assert.equal(clip.complete(source, cutId, source.files.documentToken, { removed: true }).code, 'CLIPBOARD_STALE');
    assert.equal((await clip.read()).cutId, replacement?.cutId ?? null);
  }
});
test('native writes are awaited, cannot overlap, and cannot register a cut for a replaced or closed source', async () => {
  for (const change of ['token', 'closed']) {
    const h = harness(), { clip, clipboard } = h, source = owner(), other = owner(), captured = fragment(), write = deferred();
    const writeText = clipboard.writeText; clipboard.writeText = async value => { await write.promise; h.text = value; };
    let completed = false; const pending = cut(clip, source, captured).then(value => { completed = true; return value; });
    await checkpoint(); assert.equal(completed, false);
    await assert.rejects(() => cut(clip, other), { code: 'FILE_BUSY' }); await assert.rejects(() => clip.read(), { code: 'FILE_BUSY' });
    if (change === 'token') source.files.documentToken = randomUUID(); else clip.closed(source);
    write.resolve(); await assert.rejects(() => pending, { code: 'DOCUMENT_STALE' });
    clipboard.writeText = writeText; assert.equal((await clip.read()).cutId, null);
    assert.ok((await cut(clip, other)).cutId);
  }
});
test('native read/write rejections are observed and release write ownership without enabling deletion', async () => {
  const h = harness(), { clip, clipboard } = h, source = owner(), destination = owner(), failure = Object.assign(Error('clipboard denied'), { code: 'DENIED' });
  const readText = clipboard.readText, writeText = clipboard.writeText; const written = await cut(clip, source);
  clipboard.readText = async () => { throw failure; };
  await assert.rejects(() => clip.read(), failure);
  const result = await clip.acknowledge(destination, written.cutId, destination.files.documentToken);
  assert.equal(result.status, 'error'); assert.equal(result.code, 'DENIED'); assert.equal(result.sourceRemoved, false); assert.equal(source.calls.length, 0);
  clipboard.readText = readText; clipboard.writeText = async () => { throw failure; };
  await assert.rejects(() => cut(clip, source), failure); assert.equal((await clip.read()).cutId, null);
  clipboard.writeText = writeText; assert.ok((await cut(clip, source)).cutId);
});
test('PNG uses the Electron ClipboardItem Promise write API and observes completion, rejection and source lifetime', async () => {
  const h = harness(), { clip, clipboard, images } = h, source = owner(); await cut(clip, source);
  assert.equal((await clip.image(source, png, source.files.documentToken)).status, 'ok'); assert.equal(images.length, 1);
  const blob = images[0][0].items['image/png']; assert.equal(blob.type, 'image/png'); assert.deepEqual(Buffer.from(await blob.arrayBuffer()), png);
  const write = deferred(); clipboard.write = () => write.promise;
  const pending = clip.image(source, png, source.files.documentToken); await checkpoint();
  await assert.rejects(() => cut(clip, owner()), { code: 'FILE_BUSY' }); clip.closed(source); write.resolve();
  await assert.rejects(() => pending, { code: 'DOCUMENT_STALE' });
  const failure = Error('write failed'); clipboard.write = async () => { throw failure; };
  await assert.rejects(() => clip.image(source, png, source.files.documentToken), failure);
  assert.ok((await cut(clip, source)).cutId);
});
test('two concurrent claims still grant deletion exactly once', async () => {
  const { clip } = harness(), source = owner(), destination = owner(), { cutId } = await cut(clip, source);
  const pending = clip.acknowledge(destination, cutId, destination.files.documentToken); await checkpoint();
  const results = await Promise.all([clip.claim(source, cutId, source.files.documentToken), clip.claim(source, cutId, source.files.documentToken)]);
  assert.deepEqual(results.map(result => result.status).sort(), ['error', 'ok']);
  clip.complete(source, cutId, source.files.documentToken, { removed: true }); assert.equal((await pending).sourceRemoved, true);
});
test('replacement between exact-read completion and acknowledgement continuation cannot send an old deletion request', async () => {
  const { clip } = harness(), source = owner(), destination = owner(), captured = fragment(), { cutId } = await cut(clip, source, captured);
  const pending = clip.acknowledge(destination, cutId, destination.files.documentToken);
  let replacement; queueMicrotask(() => { replacement = cut(clip, source, captured); });
  assert.equal((await pending).sourceRemoved, false); const written = await replacement;
  assert.equal(source.calls.length, 0); assert.equal((await clip.read()).cutId, written.cutId);
});
test('document ownership is rechecked after native acknowledgement and claim reads', async () => {
  for (const phase of ['acknowledgement', 'claim']) for (const changed of ['source', 'destination']) {
    const { clip, clipboard } = harness(), source = owner(), destination = owner(), captured = fragment(), { cutId } = await cut(clip, source, captured);
    const read = deferred(); let result, pending;
    if (phase === 'claim') { result = clip.acknowledge(destination, cutId, destination.files.documentToken); await checkpoint(); }
    clipboard.readText = () => read.promise;
    pending = phase === 'claim' ? clip.claim(source, cutId, source.files.documentToken) : clip.acknowledge(destination, cutId, destination.files.documentToken);
    (changed === 'source' ? source : destination).files.documentToken = randomUUID(); read.resolve(captured);
    if (phase === 'claim') {
      if (changed === 'destination') await assert.rejects(() => pending, { code: 'DOCUMENT_STALE' });
      else assert.equal((await pending).code, 'CLIPBOARD_STALE');
      clip.closed(destination); assert.equal((await result).sourceRemoved, false);
    } else { assert.equal((await pending).sourceRemoved, false); assert.equal(source.calls.length, 0); }
  }
});
test('PNG header limits are checked before native decoding and decoder dimensions must agree', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=', 'base64'); let decoded = 0;
  const nativeImage = { createFromBuffer() { decoded++; return { isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }) }; } }; pngImage(png, nativeImage); assert.equal(decoded, 1);
  for (const bad of [Buffer.from('not png'), (() => { const bad = Buffer.from(png); bad.writeUInt32BE(20000, 16); return bad; })()]) assert.throws(() => pngImage(bad, nativeImage), { code: 'CLIPBOARD_IMAGE' }); assert.equal(decoded, 1);
  assert.throws(() => pngImage(png, { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 2, height: 1 }) }) }), { code: 'CLIPBOARD_IMAGE' });
});
test('print-only window receives validated static tiled document, disabled JS, exact native options and is always disposed', async () => {
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><text x="10" y="20">Test</text></svg>', local = {}, owner = { isDestroyed: () => false }; let created = 0, destroyed = 0, html;
  class PrintWindow {
    constructor(options) { created++; assert.equal(options.parent, owner); assert.equal(options.show, false); assert.equal(options.webPreferences.javascript, false); assert.equal(options.webPreferences.preload, undefined); assert.equal(options.webPreferences.session, local); this.webContents = new EventEmitter(); Object.assign(this.webContents, { setWindowOpenHandler: fn => assert.equal(fn().action, 'deny'), printToPDF: async options => { assert.equal(options.preferCSSPageSize, true); assert.equal(options.scale, 1); return Buffer.from('%PDF-1.7\n'); }, print: (options, done) => { assert.equal(options.silent, false); assert.equal(options.scaleFactor, 100); done(true); } }); }
    async loadURL(url) { assert.ok(url.startsWith('data:text/html')); html = decodeURIComponent(url.split(',').slice(1).join(',')); assert.equal((html.match(/<section /g) || []).length, 4); assert.ok(!html.includes('<script')); }
    isDestroyed() { return false; } destroy() { destroyed++; }
  }
  const print = createPrintService({ BrowserWindow: PrintWindow, session: local }); assert.equal((await print(owner, svg, { scale: 200 })).status, 'printed'); assert.equal((await print(owner, svg, { scale: 200 }, true)).pages, 4); assert.equal(created, destroyed);
  await assert.rejects(() => print(owner, '<svg onload="bad()"/>', {})); assert.equal(created, 2);
});
