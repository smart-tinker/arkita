import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloader } from '../src/browser-files.js';
function setup(fail = '') {
  const revoked = [], clicked = [], timers = new Map(), anchors = [];
  const URL = { createObjectURL() { if (fail === 'url') throw Error('url failed'); return `blob:test-${anchors.length}`; }, revokeObjectURL(url) { revoked.push(url); } };
  const document = { body: { append(anchor) { anchors.push(anchor); if (fail === 'append') throw Error('append failed'); } }, createElement() { return { click() { if (fail === 'click') throw Error('click failed'); clicked.push(this); }, remove() { this.removed = true; } }; } };
  const downloader = createDownloader({ document, URL, Blob, setTimeout(fn, delay) { assert.equal(delay,60000); timers.set(timers.size,fn); return timers.size-1; }, clearTimeout(id) { timers.delete(id); } });
  return { downloader, revoked, clicked, timers, anchors };
}
test('download hands off Blob bytes with safe provided name, delayed revoke and removed anchor', () => {
  const h=setup(); h.downloader.download(new Uint8Array([65]),'sample.schemka.json','application/json');
  assert.equal(h.clicked.length,1); assert.equal(h.clicked[0].download,'sample.schemka.json'); assert.equal(h.anchors[0].removed,true);
  assert.deepEqual(h.revoked,[]); [...h.timers.values()][0](); assert.deepEqual(h.revoked,['blob:test-0']); assert.equal(h.timers.size,0);
});
test('every failed handoff throws and releases allocated URLs; dispose releases all outstanding URLs', () => {
  for (const stage of ['url','append','click']) {
    const h=setup(stage); assert.throws(()=>h.downloader.download('x','x.mmd','text/plain'),/failed/);
    assert.equal(h.timers.size,0); assert.equal(h.revoked.length,stage==='url'?0:1);
    if (h.anchors.length) assert.equal(h.anchors[0].removed,true);
  }
  const h=setup(); h.downloader.download('a','a','text/plain'); h.downloader.download('b','b','text/plain'); h.downloader.dispose();
  assert.equal(h.revoked.length,2); assert.equal(h.timers.size,0); h.downloader.dispose(); assert.equal(h.revoked.length,2);
});
