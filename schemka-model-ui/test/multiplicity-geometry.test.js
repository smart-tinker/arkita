import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionGeometry } from '../src/connection-geometry.js';
import { multiplicityLabels } from '../src/multiplicity-geometry.js';

const rect = (x, y, width = 100, height = 100) => ({ x, y, width, height });
const occurrence = (id, bounds) => ({ id, concept: { kind: 'element', id: `element-${id}` }, bounds });
const connection = (sourceId = 'a', targetId = 'b', bends = [], labelPosition = null) =>
  ({ source: { kind: 'occurrence', id: sourceId }, target: { kind: 'occurrence', id: targetId },
    routePoints: bends.map(point => ({ kind: 'bend', point })), labelPosition });
const both = { sourceMultiplicity: '1', targetMultiplicity: '*' };
const sourceBounds = rect(-100, -50), targetBounds = rect(300, -50);
const straight = { d: 'M 0 0 L 300 0' };
const labels = (relationship = both, geometry = straight, source = sourceBounds, target = targetBounds) =>
  multiplicityLabels(relationship, geometry, source, target);
const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function finite(label) {
  assert.ok([label.x, label.y, ...Object.values(label.bounds)].every(Number.isFinite));
  assert.ok(label.bounds.width > 0 && label.bounds.height === 24);
  assert.ok(Array.from(label.text).length <= 16);
}
function clears(bounds, obstacle, gap = 4, tolerance = 1e-7) {
  return bounds.x + bounds.width <= obstacle.x - gap + tolerance ||
    bounds.x >= obstacle.x + obstacle.width + gap - tolerance ||
    bounds.y + bounds.height <= obstacle.y - gap + tolerance ||
    bounds.y >= obstacle.y + obstacle.height + gap - tolerance;
}
function marker(point) { return rect(point.x - 12, point.y - 12, 24, 24); }
function pathEndpoints(geometry) {
  const numbers = geometry.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
  return [{ x: numbers[0], y: numbers[1] }, { x: numbers.at(-2), y: numbers.at(-1) }];
}
function checkRoute(occurrences, route, radiusFor = () => 0, stored = false, relationship = both) {
  const source = occurrences.find(item => item.id === route.source.id).bounds;
  const target = occurrences.find(item => item.id === route.target.id).bounds;
  const geometry = connectionGeometry(route, occurrences, radiusFor, stored);
  const result = labels(relationship, geometry, source, target), endpoints = pathEndpoints(geometry);
  assert.equal(result.length, 2);
  for (const [index, label] of result.entries()) {
    finite(label);
    assert.ok(clears(label.bounds, index ? target : source), `${label.end} must clear its own node`);
    assert.ok(clears(label.bounds, marker(endpoints[index])), `${label.end} must clear endpoint marker ink`);
  }
  return { result, geometry, endpoints };
}

test('source-only, target-only and double-ended labels use stored endpoint roles and exact raw strings', () => {
  const expected = [
    { end: 'source', text: '1', raw: '1', x: 20, y: -14, anchor: 'start', bounds: rect(16, -30, 30, 24) },
    { end: 'target', text: '*', raw: '*', x: 280, y: -14, anchor: 'end', bounds: rect(254, -30, 30, 24) },
  ];
  assert.deepEqual(labels(), expected);
  assert.deepEqual(labels({ sourceMultiplicity: '1' }), expected.slice(0, 1));
  assert.deepEqual(labels({ targetMultiplicity: '*' }), expected.slice(1));
  for (const type of ['ReadAccess', 'ReadWriteAccess', 'WriteAccess', 'Composition', 'Association']) {
    assert.deepEqual(labels({ ...both, type }), expected);
  }
});

test('absent, explicitly empty and star remain three distinct cases', () => {
  assert.deepEqual(labels({}), []);
  assert.deepEqual(labels(Object.create(both)), []);
  const result = labels({ sourceMultiplicity: '', targetMultiplicity: '*' });
  assert.equal(result[0].text, '⟨пусто⟩'); assert.equal(result[0].raw, '');
  assert.equal(result[0].bounds.width, 7 * 22 + 8);
  assert.equal(result[1].text, '*'); assert.equal(result[1].raw, '*');
});

test('uninterpreted whitespace and HTML remain plain raw text without normalization', () => {
  for (const raw of [' 1..* ', '01', '<b>x</b>', '∅', '\\n']) {
    const [label] = labels({ sourceMultiplicity: raw });
    assert.equal(label.text, raw); assert.equal(label.raw, raw);
  }
  const raw = '<img src=x onerror="evil()">';
  const [label] = labels({ sourceMultiplicity: raw });
  assert.equal(label.text, '<img src=x oner…'); assert.equal(label.raw, raw);
});

test('CR, LF and TAB are visible before truncation; other controls use deterministic Unicode escapes', () => {
  for (const [raw, text] of [
    ['1\r\n\t*', '1\\r\\n\\t*'], ['\x00\x1F', '\\u0000\\u001F'],
    ['\x7F\x85', '\\u007F\\u0085'], ['\u2028\u2029', '\\u2028\\u2029'],
    ['\u200E\u202E', '\\u200E\\u202E'], ['\u{E0001}', '\\u{E0001}'], ['\uD800', '\\uD800'],
  ]) {
    const [label] = labels({ sourceMultiplicity: raw });
    assert.equal(label.text, text); assert.equal(label.raw, raw);
    assert.doesNotMatch(label.text, /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u);
  }
  assert.equal(labels({ sourceMultiplicity: '\n'.repeat(20) })[0].text, '\\n'.repeat(7) + '\\…');
});

test('the final ellipsis is included in a Unicode-safe sixteen-code-point display cap', () => {
  for (const raw of ['0123456789ABCDEF', '😀'.repeat(16)]) {
    assert.equal(labels({ sourceMultiplicity: raw })[0].text, raw);
  }
  for (const raw of ['0123456789ABCDEFG', '😀'.repeat(17), '😀'.repeat(64), 'x'.repeat(128)]) {
    const [label] = labels({ sourceMultiplicity: raw });
    assert.equal(label.text, Array.from(raw).slice(0, 15).join('') + '…');
    assert.equal(Array.from(label.text).length, 16); assert.equal(label.bounds.width, 360);
    assert.equal(label.raw, raw); assert.doesNotMatch(label.text, /\p{Cs}/u);
  }
});

test('invalid multiplicity values are omitted without coercion or unbounded display work', () => {
  for (const value of [undefined, null, 1, {}, [], 'x'.repeat(129), '😀'.repeat(65)]) {
    assert.deepEqual(labels({ sourceMultiplicity: value }), []);
    assert.deepEqual(labels({ sourceMultiplicity: value, targetMultiplicity: '*' }), labels({ targetMultiplicity: '*' }));
  }
  for (const relationship of [null, undefined, false, 1, '1']) {
    assert.deepEqual(multiplicityLabels(relationship, straight, sourceBounds, targetBounds), []);
  }
});

test('reversing a line reverses outward anchors and changes the common path-normal side', () => {
  const result = labels(both, { d: 'M 300 0 L 0 0' }, targetBounds, sourceBounds);
  assert.deepEqual(result.map(({ end, x, y, anchor }) => ({ end, x, y, anchor })), [
    { end: 'source', x: 280, y: 14, anchor: 'end' },
    { end: 'target', x: 20, y: 14, anchor: 'start' },
  ]);
});

test('vertical paths use middle anchors and baseline-aware marker clearance at both ends', () => {
  const result = labels(both, { d: 'M 0 0 L 0 300' }, rect(-50, -100), rect(-50, 300));
  assert.deepEqual(result.map(({ end, x, y, anchor }) => ({ end, x, y, anchor })), [
    { end: 'source', x: 14, y: 32, anchor: 'middle' },
    { end: 'target', x: 14, y: 276, anchor: 'middle' },
  ]);
  const reverse = labels(both, { d: 'M 0 300 L 0 0' }, rect(-50, 300), rect(-50, -100));
  assert.deepEqual(reverse.map(({ x, y, anchor }) => ({ x, y, anchor })), [
    { x: -14, y: 276, anchor: 'middle' }, { x: -14, y: 32, anchor: 'middle' },
  ]);
});

test('diagonal positions use normalized path tangents and move only along the outward vector', () => {
  const result = labels(both, { d: 'M 0 0 L 300 300' }, rect(-100, -100), rect(300, 300));
  const unit = Math.SQRT1_2;
  close(result[0].x, 32 * unit); close(result[0].y, 4 * unit);
  assert.equal(result[0].anchor, 'start'); assert.equal(result[1].anchor, 'end');
  const dx = result[1].x - (300 - 4 * unit), dy = result[1].y - (300 - 32 * unit);
  close(dx, dy); assert.ok(dx < 0);
  close(result[1].bounds.y + result[1].bounds.height, 284);
});

test('actual generated cubic self-loops retain separate rightward and downward endpoint tangents', () => {
  const occurrences = [occurrence('a', rect(0, 0))];
  const { result, geometry } = checkRoute(occurrences, connection('a', 'a'));
  assert.match(geometry.d, / C .* C /);
  assert.deepEqual(result.map(({ x, y, anchor }) => ({ x, y, anchor })), [
    { x: 120, y: 36, anchor: 'start' }, { x: 64, y: -24, anchor: 'middle' },
  ]);
});

test('generated orthogonal loops and overlapping routes keep source and target roles for every new contour', () => {
  for (const token of ['octagon', 'ellipse', 'folder', 'cloud', 'wavy']) {
    const loop = checkRoute([occurrence('a', rect(0, 0))], connection('a', 'a'), () => token);
    assert.match(loop.geometry.d, / L /); assert.doesNotMatch(loop.geometry.d, / C /);
    assert.equal(loop.result[0].anchor, 'start'); assert.equal(loop.result[1].anchor, 'middle');
    const overlap = [occurrence('a', rect(0, 0, 200, 100)), occurrence('b', rect(80, 30, 200, 100))];
    const result = checkRoute(overlap, connection(), () => token).result;
    assert.equal(result[0].anchor, 'middle'); assert.equal(result[1].anchor, 'middle');
  }
});

test('stored polylines use actual terminal segments, ignore duplicate bends and ignore saved label positions', () => {
  const occurrences = [occurrence('a', rect(0, 0)), occurrence('b', rect(300, 200))];
  const bends = [{ x: 50, y: 50 }, { x: 50, y: -60 }, { x: 50, y: -60 },
    { x: 350, y: -60 }, { x: 350, y: 250 }];
  const route = connection('a', 'b', bends, { x: -900000, y: 800000 });
  const { result, geometry } = checkRoute(occurrences, route, () => 12, true);
  assert.equal(geometry.routeMode, 'stored-polyline');
  assert.equal(result[0].anchor, 'middle'); assert.equal(result[1].anchor, 'middle');
  const changed = connectionGeometry({ ...route, labelPosition: { x: 999999, y: -999999 } }, occurrences, () => 12, true);
  assert.deepEqual(labels(both, changed, occurrences[0].bounds, occurrences[1].bounds), result);
  const rawDuplicatePath = { d: 'M 0 0 L 0 0 L 100 0 L 100 0 L 300 0 L 300 0' };
  assert.deepEqual(labels(both, rawDuplicatePath), labels());
});

test('very short links may have crossing labels without rewriting paths or attempting obstacle avoidance', () => {
  const occurrences = [occurrence('a', rect(0, 0, .001, .001)), occurrence('b', rect(.002, 0, .001, .001))];
  const { result, geometry } = checkRoute(occurrences, connection(), () => 0, false,
    { sourceMultiplicity: '1234567890123456', targetMultiplicity: '1234567890123456' });
  assert.match(geometry.d, /^M 0\.001 0\.0005 L 0\.002 0\.0005$/);
  assert.ok(result[0].x > result[1].x, 'Both endpoints keep the fixed outward offsets even on tiny gaps');
});

test('conservative labels clear their own stored rectangles for rounded, concave and asymmetric nodes', () => {
  for (const [width, height] of [[1, 1000000], [1000000, 1], [.001, 1000], [1000, .001], [100, 100]]) {
    for (const token of [0, 12, 'box3d', 'octagon', 'ellipse', 'folder', 'cloud', 'wavy']) {
      const occurrences = [occurrence('a', rect(-100000, -100000, width, height))];
      checkRoute(occurrences, connection('a', 'a'), () => token, false,
        { sourceMultiplicity: '1234567890123456', targetMultiplicity: '1234567890123456' });
    }
  }
  const occurrences = [occurrence('a', rect(0, 0)), occurrence('b', rect(300, 300))];
  checkRoute(occurrences, connection(), () => 'ellipse', false,
    { sourceMultiplicity: '1234567890123456', targetMultiplicity: '1234567890123456' });
});

test('clearance uses the minimum analytic outward translation, including clearing a second obstacle entered on the way', () => {
  const [label] = labels({ sourceMultiplicity: '1' }, { d: 'M 0 0 L 300 0' }, rect(30, -100, 20, 200));
  // The initial bbox [14,44] hits this node and the marker. The first valid
  // position has its left edge at 54, exactly the node's right edge plus 4.
  assert.equal(label.x, 58); assert.equal(label.bounds.x, 54);
  assert.ok(clears(label.bounds, rect(30, -100, 20, 200), 4, 0));
  assert.ok(!clears({ ...label.bounds, x: label.bounds.x - .0001 }, rect(30, -100, 20, 200), 4, 0));
  const [entered] = labels({ sourceMultiplicity: '1' }, straight, rect(48.5, -100, 20, 200));
  // This node is initially clear, but moving 2 to clear the marker enters it.
  // Choosing only the initially intersecting obstacle's exit would be wrong.
  assert.equal(entered.x, 76.5); assert.equal(entered.bounds.x, 72.5);
  const [long] = labels({ sourceMultiplicity: '1234567890123456' }, { d: 'M 0 0 L 0 300' }, rect(-100, -100, 200, 100));
  assert.equal(long.y, 32); assert.ok(clears(long.bounds, marker({ x: 0, y: 0 }), 4, 0));
});

test('near-vertical tiny components never cause enormous clearance shifts or divide-by-zero', () => {
  for (const value of ['5e-324', '1e-300', '1e-16']) {
    const result = labels(both, { d: `M 0 0 L ${value} 300` }, rect(-50, -100), rect(-50, 300));
    assert.equal(result.length, 2); result.forEach(finite);
    close(result[0].x, 14); close(result[0].y, 32);
    close(result[1].x, 14); close(result[1].y, 276);
  }
});

test('cubic terminal degeneracy falls through control points and wholly zero-length segments', () => {
  for (const d of [
    'M 0 0 C 0 0, 200 0, 300 0',
    'M 0 0 C 0 0, 0 0, 300 0',
    'M 0 0 C 100 0, 300 0, 300 0',
    'M 0 0 C 300 0, 300 0, 300 0',
    'M 0 0 C 0 0, 0 0, 0 0 C 100 0, 200 0, 300 0 C 300 0, 300 0, 300 0',
    'M 0 0 L 0 0 C 0 0, 200 0, 300 0 L 300 0',
  ]) assert.deepEqual(labels(both, { d }), labels());
  const loop = labels(both, { d: 'M 0 0 C 100 0, 0 -100, 0 0' }, sourceBounds, rect(-50, 0));
  assert.equal(loop.length, 2); assert.equal(loop[0].anchor, 'start'); assert.equal(loop[1].anchor, 'middle');
});

test('subnormal nonzero vectors are normalized without inventing a default tangent', () => {
  const tiny = labels(both, { d: 'M 0 0 L 5e-324 5e-324' }, rect(-1, -1, 1, 1), rect(0, 0, 1, 1));
  assert.equal(tiny.length, 2); tiny.forEach(finite);
  close(tiny[0].x, 32 * Math.SQRT1_2); close(tiny[0].y, 4 * Math.SQRT1_2);
  for (const d of ['M 0 0', 'M 0 0 L 0 0', 'M 1 1 C 1 1, 1 1, 1 1']) assert.deepEqual(labels(both, { d }), []);
});

test('malformed, arbitrary SVG, nonfinite and over-limit paths fail closed', () => {
  for (const d of [
    null, undefined, {}, '', 'M 0 0 L 300 0 trailing', 'M 0 0 L 300', 'M 0 0 L 300 0 Z',
    'm 0 0 l 300 0', 'M 0 0 H 300', 'M 0 0 Q 150 0 300 0', 'M 0 0 A 1 1 0 0 0 300 0',
    'M 0 0 L 300 0 M 20 20 L 30 30', 'M 0 0 300 0', 'M 0 0 L 300 0\n',
    'M 0 0 C 0 0 0 0 300 0', 'M 0 0 C 0 0, 0 0, 300', 'M 0 0 L NaN 0',
    'M 0 0 L Infinity 0', 'M 0 0 L 1e309 0', 'M 1e308 0 L -1e308 0',
    'M 0 0 L 0x100 0', 'M 0 0 L 03 0', 'M 0 0 L +300 0', 'M 0 0 L 300 0" onload="evil()',
    '<path d="M 0 0 L 300 0"/>', 'M 0 0' + ' L 1 1'.repeat(130), 'M 0 0 L ' + '1'.repeat(17000) + ' 0',
  ]) assert.deepEqual(labels(both, { d }), [], String(d).slice(0, 100));
  assert.deepEqual(multiplicityLabels(both, null, sourceBounds, targetBounds), []);
});

test('the maximum locally generated stored route stays inside parsing bounds', () => {
  const occurrences = [occurrence('a', rect(0, 0)), occurrence('b', rect(1000, 0))];
  const bends = Array.from({ length: 128 }, (_, i) => ({ x: 150 + i * 5, y: i % 2 ? -90 : -60 }));
  const { geometry } = checkRoute(occurrences, connection('a', 'b', bends), () => 0, true);
  assert.equal((geometry.d.match(/ L /g) || []).length, 129);
});

test('invalid own-node bounds fail closed for that endpoint', () => {
  for (const bad of [null, {}, rect(NaN, 0), rect(0, Infinity), rect(0, 0, -1), rect(1e308, 0, 1e308)]) {
    assert.deepEqual(labels({ sourceMultiplicity: '1' }, straight, bad), []);
    assert.deepEqual(labels(both, straight, bad), labels({ targetMultiplicity: '*' }));
  }
});

test('all inputs stay immutable; geometry label coordinates, unrelated model fields and model-supplied paths are ignored', () => {
  const relationship = freeze({ ...both, type: 'ReadAccess', labelPosition: { x: -99, y: -99 },
    d: 'M 123 123 L 999 999', sourceLabelPosition: { x: 2, y: 3 }, properties: { sourceMultiplicity: 'wrong' } });
  const geometry = freeze({ ...straight, x: 777, y: 888, routeMode: 'stored-polyline', bounds: rect(0, 0, 300, 0) });
  const source = freeze({ ...sourceBounds }), target = freeze({ ...targetBounds });
  const before = JSON.stringify([relationship, geometry, source, target]);
  assert.deepEqual(labels(relationship, geometry, source, target), labels());
  assert.equal(JSON.stringify([relationship, geometry, source, target]), before);
});
