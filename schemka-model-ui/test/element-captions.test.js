import test from 'node:test';
import assert from 'node:assert/strict';
import { createElementCaption, fitElementCaption, captionGrid, captionSpan } from '../src/element-captions.js';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { NOTATION_ELEMENTS, notationElement } from '../src/notation.js';
import { nodeContourGeometry } from '../src/node-shapes.js';

const graphemes = value => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(part => part.segment);
const document = { createElementNS() { return { textContent: '', attrs: {}, removed: false, setAttribute(key, value) { this.attrs[key] = String(value); }, getAttribute(key) { return this.attrs[key] ?? null; }, remove() { this.removed = true; } }; } };
function metrics(node, options = {}) {
  const size = node.getAttribute('class') === 'node-type' ? 10 : 14;
  const clusters = graphemes(node.textContent), width = clusters.reduce((total, char) => total + (char === 'W' ? 1 : char === 'i' ? .25 : char === ' ' ? .3 : /[\u2e80-\uffff]|\p{Extended_Pictographic}/u.test(char) ? 1 : .55) * size, 0);
  const actualWidth = options.nonmonotone ? width * (clusters.length % 3 === 0 ? .63 : 1.13) : width;
  return { x: Number(node.getAttribute('x')) + (options.overhang || 0) - (options.rtl ? actualWidth : node.getAttribute('text-anchor') === 'middle' ? actualWidth / 2 : 0), y: Number(node.getAttribute('y')) - size * .8, width: actualWidth, height: options.tall && node.textContent.includes('👨') ? 25 : size * .95 };
}
function check(job, measure = metrics, tolerance = 1e-7) {
  const result = fitElementCaption(job, measure); assert.equal(result.available, true); assert.ok(result.calls <= 64, String(result.calls));
  for (const [i, node] of job.nodes.entries()) if (!node.removed) {
    const ink = measure(node), slot = job.slots[i], span = captionSpan(job.appearance, job.bounds, slot, ink.height);
    assert.ok(ink.x >= span.left - tolerance && ink.x + ink.width <= span.right + tolerance, node.textContent);
    assert.ok(ink.y >= slot.top - tolerance && ink.y + ink.height <= slot.top + slot.height + tolerance, node.textContent);
    if (slot.header) {
      const suffix = ` · ${job.index}`; assert.ok(node.textContent.endsWith(suffix));
      const shown = node.textContent.slice(0, -suffix.length);
      assert.ok(shown === job.badge || shown.endsWith('…') && job.badge.startsWith(shown.slice(0, -1)));
      if (job.badge.startsWith('?')) assert.ok(shown.startsWith('?'));
    }
  }
  assert.ok(job.nodes.filter((node, i) => !job.slots[i].header && !node.removed).length <= 2);
  return result;
}
function make(name, type = 'CommunicationNetwork', width = 210, height = 90, index = 101, reference = CURRENT_METAMODEL) {
  return createElementCaption(document, notationElement(reference, type), { width, height }, name, index);
}
const visibleNames = job => job.nodes.filter((node, i) => !job.slots[i].header && !node.removed).map(node => node.textContent);

test('fixed slot capacity, tab/band offsets and compact/tiny limits', () => {
  assert.deepEqual(captionGrid({}, { width: 210, height: 90 }).map(s => [s.top, s.height]), [[11, 16], [27, 20], [47, 20]]);
  assert.deepEqual(captionGrid({ contour: 'cloud' }, { width: 210, height: 90 }).map(s => s.top), [13, 29, 49]);
  assert.deepEqual(captionGrid({ contour: 'folder' }, { width: 120, height: 55 }).map(s => s.top), [14, 30]);
  assert.deepEqual(captionGrid({ banded: true }, { width: 120, height: 55 }).map(s => s.top), [14, 30]);
  assert.equal(captionGrid({}, { width: 120, height: 55 }).length, 2);
  for (const bounds of [{ width: .1, height: .1 }, { width: 20, height: 100 }, { width: 400, height: 18 }]) assert.equal(captionGrid({}, bounds).length, 0);
});

test('native fractional SVG positions and glyph overhang retain a fitting name', () => {
  for (const scale of [.7, .85]) {
    const job = make('A · Общий сервис', 'Service');
    const measure = node => {
      const ink = metrics(node), x = Number(node.getAttribute('x'));
      // Windows getBBox round-trips scaled SVG coordinates and reports a negative glyph bearing.
      return { ...ink, x: Math.fround(Math.fround(x * scale) / scale) - 1.1842256784439087 };
    };
    check(job, measure, 1 / 64);
    assert.deepEqual(visibleNames(job), ['A · Общий сервис']);
    const title = job.nodes.find(node => node.getAttribute('class') === 'node-title' && !node.removed);
    assert.ok(measure(title).x < 17, 'Exercise the native rounding below the exact left boundary');
  }
});

test('a genuine 0.1 SVG-unit overflow is still rejected on every edge', () => {
  for (const [dx, dy] of [[-.1, 0], [.1, 0], [0, -.1], [0, .1]]) {
    const job = make('API', 'Service');
    check(job, node => {
      if (node.getAttribute('class') === 'node-type') return metrics(node);
      const x = Number(node.getAttribute('x')), y = Number(node.getAttribute('y')), placed = x !== 0 || y !== 0;
      return { x: x + (placed ? dx : 0), y: y - 10 + (placed ? dy : 0), width: 176, height: 20 };
    });
    assert.deepEqual(visibleNames(job), []);
  }
  const tooTall = make('API', 'Service');
  check(tooTall, node => ({ ...metrics(node), height: node.getAttribute('class') === 'node-type' ? 10 : 20.1 }));
  assert.deepEqual(visibleNames(tooTall), [], 'Candidate height remains strict');
});

test('Segoe UI header space preserves original row capacity and contour bounds for all 42 types', () => {
  assert.equal(NOTATION_ELEMENTS.length, 42);
  const heights = [45, 50, 55, 69, 90], ordinary = [2, 2, 2, 3, 3], inset = [1, 2, 2, 2, 3], wavy = [1, 1, 1, 2, 3];
  const headerHeight = 14.285715103149414, titleHeight = 19.06382942199707;
  const measure = node => ({ ...metrics(node), height: node.getAttribute('class') === 'node-type' ? headerHeight : titleHeight });
  for (const type of NOTATION_ELEMENTS) for (const [i, height] of heights.entries()) {
    const job = make('API', type, 210, height), { appearance, slots } = job;
    const counts = appearance.contour === 'wavy' ? wavy : appearance.contour === 'folder' || appearance.banded || appearance.tabbed ? inset : ordinary;
    assert.equal(slots.length, counts[i], `${type}/${height}: original row capacity`);
    assert.ok(slots[0].height >= 12 && slots[0].height <= 16);
    const minTop = appearance.contour === 'folder' ? height * .2 + 3 : appearance.banded || appearance.tabbed ? Math.min(height / 5, 12) + 3 : 3;
    assert.ok(slots[0].top >= minTop, `${type}/${height}: contour inset`);
    const bottom = (appearance.contour === 'wavy' ? height * .8 : height) - 3;
    for (const [j, slot] of slots.entries()) {
      assert.ok(slot.top + slot.height <= bottom + 1e-7, `${type}/${height}: lower contour`);
      if (j) {
        assert.equal(slot.height, 20);
        assert.equal(slot.top, slots[j - 1].top + slots[j - 1].height);
      }
    }
    check(job, measure);
    const roomForName = slots.slice(1).some(slot => {
      const span = captionSpan(appearance, job.bounds, slot, titleHeight);
      return span.right - span.left >= 3 * 14 * .55;
    });
    assert.equal(visibleNames(job).length, roomForName ? 1 : 0, `${type}/${height}: short native name`);
    if (height === 90) assert.equal(job.nodes[0].removed, false, `${type}: normal native header remains visible`);
  }
  assert.deepEqual(captionGrid({}, { width: 210, height: 45 }).map(s => [s.top, s.height]), [[5, 16], [21, 20]]);
  assert.deepEqual(captionGrid({ contour: 'folder' }, { width: 210, height: 50 }).map(s => [s.top, s.height]), [[13, 14], [27, 20]]);
  assert.deepEqual(captionGrid({ contour: 'folder' }, { width: 210, height: 55 }).map(s => [s.top, s.height]), [[14, 16], [30, 20]]);
});

test('all 42 badges, six whole indexes and normal/compact geometry keep confirmed ink in their strips', () => {
  for (const type of NOTATION_ELEMENTS) for (const index of [1, 99, 100, 101, 1000, 1234]) for (const [width, height] of [[210, 90], [220, 90], [120, 55], [.1, .1], [45, 200], [400, 35]]) {
    const job = make('Сервер мониторинга инфраструктуры', type, width, height, index); check(job);
    if (height === 55) assert.ok(visibleNames(job).length <= 1);
  }
});

test('ordinary supplied Russian name wraps at spaces; narrow glyphs show more than wide glyphs', () => {
  const job = make('Сервер мониторинга инфраструктуры'); check(job);
  assert.deepEqual(visibleNames(job), ['Сервер мониторинга', 'инфраструктуры']);
  const wide = make('W'.repeat(100)), narrow = make('i'.repeat(100)); check(wide); check(narrow);
  assert.ok(visibleNames(narrow).join('').length > visibleNames(wide).join('').length);
  const short = make('API'); check(short); assert.deepEqual(visibleNames(short), ['API']);
});

test('normalization is preview-only and literal Unicode, CJK, combining, flags, emoji ZWJ are never split', () => {
  const inputs = ['  English\r\nmultiple\t words  and spaces ', '日本語の長い名前'.repeat(12), 'e\u0301'.repeat(90), '👨‍👩‍👧‍👦'.repeat(30), '👍🏽'.repeat(40), '🇯🇵'.repeat(40), '<img onerror=alert(1)> & <script> literal text', '\t\n  ', 'مرحبا بالعالم مرحبا بالعالم مرحبا بالعالم', 'AAAA \u0301BBBB', 'AAAA\u0600 BBBB', 'AAAA \u200dBBBB'];
  for (const input of inputs) for (const width of [120, 210]) {
    const job = make(input, 'Node', width, width === 120 ? 55 : 90); check(job);
    const all = new Set(graphemes(job.name));
    for (const row of visibleNames(job)) for (const cluster of graphemes(row.replace(/…$/, ''))) assert.ok(all.has(cluster), JSON.stringify(cluster));
    let rest = job.name;
    for (const row of visibleNames(job)) { const shown = row.replace(/…$/, ''); assert.ok(rest.startsWith(shown)); rest = rest.slice(shown.length); if (graphemes(rest)[0] === ' ') rest = rest.slice(1); }
    if (!visibleNames(job).at(-1)?.endsWith('…')) assert.equal(rest, '');
    assert.equal(job.name, input.replace(/\s+/gu, ' ').trim() || '(без названия)');
  }
});

test('last available row carries a measured ellipsis and even that is omitted when it cannot fit', () => {
  const job = make('An intentionally long single row', 'Node', 120, 55); check(job); assert.ok(visibleNames(job)[0].endsWith('…'));
  const tiny = make('W'.repeat(100), 'Meaning', 35, 55); check(tiny); assert.deepEqual(visibleNames(tiny), []);
  const wide = make('First extraordinarilylongword end', 'Node', 210, 90); check(wide); assert.ok(visibleNames(wide).at(-1).endsWith('…'));
});

test('unknown descriptor and profile retain question mark and complete index, or omit the entire header', () => {
  for (const reference of [CURRENT_METAMODEL, { id: 'unknown', version: '1' }]) for (const width of [210, 120, 55]) {
    const job = make('Raw unknown name', 'FutureType', width, 90, 1234, reference); check(job);
    const header = job.nodes[0]; if (!header.removed) assert.match(header.textContent, /^\?.* · 1234$/);
  }
});

test('overhang, RTL placement, fallback height and nonmonotone shaping are checked as final ink', () => {
  for (const options of [{ overhang: -5 }, { rtl: true }, { tall: true }, { nonmonotone: true }, { overhang: 8, rtl: true, nonmonotone: true }]) {
    const measure = node => metrics(node, options), job = make('👨‍👩‍👧‍👦 Long caption words WWWWW e\u0301 and 日本語', 'Value'); check(job, measure);
  }
});

test('unavailable, thrown, NaN and zero metrics restore all pre-attempt text and positioning', () => {
  for (const failure of [() => undefined, () => { throw Error('no font'); }, () => ({ x: 0, y: 0, width: NaN, height: 10 }), () => ({ x: 0, y: 0, width: 0, height: 0 })]) {
    const job = make('Literal 👨‍👩‍👧‍👦 long preview & <img>'); const before = JSON.stringify(job.nodes);
    let count = 0; const result = fitElementCaption(job, node => ++count < 5 ? metrics(node) : failure());
    assert.equal(result.available, false); assert.equal(JSON.stringify(job.nodes), before); check(job);
  }
  const job = make('Already fitted short name'); check(job); const before = JSON.stringify(job.nodes);
  assert.equal(fitElementCaption(job, () => { throw Error('later failure'); }).available, false); assert.equal(JSON.stringify(job.nodes), before);
});

test('8192-code-unit unbroken stress stays below 64 measurements per occurrence without removal loop', () => {
  let maximum = 0;
  for (const char of ['W', 'i', '日', 'e\u0301', '👨‍👩‍👧‍👦']) {
    const job = make(char.repeat(Math.floor(8192 / char.length)), 'CommunicationNetwork', 210, 90, 1234);
    const result = check(job); maximum = Math.max(maximum, result.calls); assert.ok(visibleNames(job).at(-1).endsWith('…'));
  }
  assert.ok(maximum < 64);
});

test('conservative cloud disk lies strictly inside all 96 polygon chords, covering the whole text strip', () => {
  const outline = nodeContourGeometry({ width: 2, height: 2 }, 'cloud').outline.map(point => ({ x: point.x - 1, y: point.y - 1 }));
  let minimum = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy)));
    minimum = Math.min(minimum, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  assert.ok(minimum > .79, String(minimum));
  for (const [width, height] of [[120, 55], [210, 90], [40, 300]]) {
    const job = make('Cloud bounds sample '.repeat(10), 'Meaning', width, height); check(job);
    for (const node of job.nodes.filter(node => !node.removed)) {
      const ink = metrics(node);
      for (const x of [ink.x, ink.x + ink.width]) for (const y of [ink.y, ink.y + ink.height]) assert.ok(Math.hypot(2 * x / width - 1, 2 * y / height - 1) < .79);
    }
  }
});

test('word separators never split or discard a space with combining, Prepend or ZWJ code points', () => {
  for (const name of ['AAAA \u0301BBBB', 'AAAA\u0600 BBBB', 'AAAA \u200dBBBB']) {
    const job = make(name, 'Node', 84, 90);
    const measure = node => { const width = graphemes(node.textContent).length * 10; return { x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')) - 8, width, height: 10 }; };
    check(job, measure);
    assert.equal(visibleNames(job).join(''), name);
    for (const row of visibleNames(job)) for (const cluster of graphemes(row)) assert.ok(graphemes(name).includes(cluster));
  }
});

test('normalization trims standalone whitespace without cutting leading or trailing attached space graphemes', () => {
  for (const name of [' \u0301BBBB', 'AAAA\u0600 ', ' \u200dBBBB', ' \u0301BBBB\u0600 ']) {
    const job = make(name, 'Node', 210, 90); check(job);
    assert.equal(job.name, name); assert.equal(visibleNames(job).join(''), name);
  }
  const job = make('  AAAA\r\n\t BBBB  '); check(job); assert.equal(job.name, 'AAAA BBBB');
});

test('the last displayed name row signals omission when the final geometric slot cannot hold ellipsis', () => {
  const measure = node => ({ x: Number(node.getAttribute('x')) - (node.getAttribute('text-anchor') === 'middle' ? [...node.textContent].reduce((sum, c) => sum + (c === '…' ? 12 : 10), 0) / 2 : 0), y: Number(node.getAttribute('y')) - 8, width: [...node.textContent].reduce((sum, c) => sum + (c === '…' ? 12 : 10), 0), height: 10 });
  const narrow = make('ABCDE', 'Node', 45, 200); check(narrow, measure); assert.deepEqual(visibleNames(narrow), []);
  let recovered = false;
  for (let width = 45; width <= 90; width++) {
    const job = make('ABCDEFGHIJKLMNO', 'Meaning', width, 69); check(job, measure);
    const rows = visibleNames(job); assert.ok(!rows.length || rows.at(-1).endsWith('…'));
    if (rows.length === 1 && rows[0].endsWith('…')) recovered = true;
  }
  assert.ok(recovered, 'Earlier wider row becomes the truthful final visible row');
  const cloud = make('A'.repeat(100), 'Meaning');
  check(cloud, node => { const width = [...node.textContent].reduce((sum, char) => sum + (char === '…' ? 140 : 10), 0); return { x: Number(node.getAttribute('x')) - width / 2, y: Number(node.getAttribute('y')) - 8, width, height: 10 }; });
  assert.deepEqual(visibleNames(cloud), ['A…']);
  for (const name of ['W'.repeat(8192), 'e\u0301'.repeat(4096), '👨‍👩‍👧‍👦'.repeat(744)]) for (const type of ['Node', 'Meaning', 'Value', 'Deliverable']) {
    const job = make(name, type, 45, 200); check(job, measure); assert.ok(!visibleNames(job).length || visibleNames(job).at(-1).endsWith('…'));
  }
  const failed = make('ABCDE', 'Node', 45, 200), before = JSON.stringify(failed.nodes); let calls = 0;
  assert.equal(fitElementCaption(failed, node => { if (++calls > 12) throw Error('late unavailable fallback'); return measure(node); }).available, false);
  assert.equal(JSON.stringify(failed.nodes), before, 'Late fallback metrics retain the same all-or-nothing rollback');
});


test('large Device glyph reserves the intersecting name row and releases full width below it', () => {
  const appearance = notationElement(CURRENT_METAMODEL, 'Device'), bounds = { width: 220, height: 90 };
  const [header, name, lower] = captionGrid(appearance, bounds);
  assert.equal(captionSpan(appearance, bounds, header, 10).right, 183);
  assert.equal(captionSpan(appearance, bounds, name, 20).right, 183);
  assert.equal(captionSpan(appearance, bounds, lower, 14).right, 203);
  const job = make('Long Device name remains a complete model value', 'Device', bounds.width, bounds.height);
  check(job);
  assert.equal(job.name, 'Long Device name remains a complete model value');
});
