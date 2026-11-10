import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { box3dGeometry } from '../src/node-shapes.js';
import * as geometry from '../src/connection-geometry.js';

const { contourPoint, connectionGeometry, viewGeometryBounds } = geometry;
const close = (actual, expected, tolerance = 2e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const pointClose = (a, b, tolerance) => { close(a.x, b.x, tolerance); close(a.y, b.y, tolerance); };
const center = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const occurrence = (id, x, y, width = 120, height = 60) => ({ id, concept: { kind: 'element', id: `element-${id}` }, bounds: { x, y, width, height } });
const connection = (bends = [], labelPosition = null, sourceId = 'a', targetId = 'b') =>
  ({ source: { kind: 'occurrence', id: sourceId }, target: { kind: 'occurrence', id: targetId },
    routePoints: bends.map(point => ({ kind: 'bend', point })), labelPosition });
const box = () => 'box3d';
const sizes = [[.1, .1], [.1, 1000000], [1000000, .1], [20, 20], [120, 60], [60, 120], [2000, 1000], [1000000, 1000000]];
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function pathPoints(result, polyline = false) {
  assert.doesNotMatch(result.d, /NaN|Infinity|undefined/);
  if (polyline) assert.doesNotMatch(result.d, /[ACHQSTVZ]/i);
  const values = result.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
  assert.ok(values.every(Number.isFinite));
  assert.ok([result.x, result.y, ...Object.values(result.bounds)].every(Number.isFinite));
  return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
}
function insideRect(rect, point, tolerance = 2e-7) {
  assert.ok(point.x >= rect.x - tolerance && point.x <= rect.x + rect.width + tolerance);
  assert.ok(point.y >= rect.y - tolerance && point.y <= rect.y + rect.height + tolerance);
}
// Independent analytic inequalities, not the implementation's polygon helper.
function onBox(rect, point) {
  insideRect(rect, point);
  const x = point.x - rect.x, y = point.y - rect.y, d = Math.min(rect.width / 6, rect.height / 6, 10);
  const distances = [x, y, rect.width - x, rect.height - y,
    (x + y - d) / Math.SQRT2, (rect.width + rect.height - d - x - y) / Math.SQRT2];
  assert.ok(distances.every(value => value >= -2e-7), `${JSON.stringify(point)} is inside the box`);
  assert.ok(distances.some(value => Math.abs(value) <= 2e-7), `${JSON.stringify(point)} is on an outer edge`);
}
function onSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  close(((point.x - a.x) * dy - (point.y - a.y) * dx) / length, 0);
  const along = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length;
  assert.ok(along >= -2e-7 && along <= length + 2e-7);
}

test('one original box helper supplies the six-vertex outline and three internal face separators', () => {
  const bounds = freeze({ x: 20, y: -30, width: 120, height: 60 });
  const result = box3dGeometry(bounds);
  assert.deepEqual(result, { depth: 10, outline: [
    { x: 20, y: -20 }, { x: 30, y: -30 }, { x: 140, y: -30 },
    { x: 140, y: 20 }, { x: 130, y: 30 }, { x: 20, y: 30 },
  ], separators: [
    [{ x: 20, y: -20 }, { x: 130, y: -20 }],
    [{ x: 130, y: -20 }, { x: 140, y: -30 }],
    [{ x: 130, y: -20 }, { x: 130, y: 30 }],
  ] });
  const local = box3dGeometry({ width: 120, height: 60 });
  assert.deepEqual(result.outline, local.outline.map(point => ({ x: point.x + 20, y: point.y - 30 })));
  assert.deepEqual(result.separators, local.separators.map(line => line.map(point => ({ x: point.x + 20, y: point.y - 30 }))));
  result.outline[0].x = 999; // Returned display geometry cannot rewrite bounds or later calls.
  assert.equal(bounds.x, 20); assert.equal(box3dGeometry(bounds).outline[0].x, 20);
});

test('box outline is convex, full-extent and bounded for tiny, large, translated and asymmetric imports', () => {
  for (const [width, height] of sizes) for (const [x, y] of [[0, 0], [-999000, 999000], [1000000, -1000000]]) {
    const rect = freeze({ x, y, width, height }), before = JSON.stringify(rect), result = box3dGeometry(rect);
    assert.equal(result.depth, Math.min(width / 6, height / 6, 10));
    assert.ok(result.depth > 0 && result.depth <= width / 6 && result.depth <= height / 6);
    assert.equal(Math.min(...result.outline.map(p => p.x)), x);
    assert.equal(Math.max(...result.outline.map(p => p.x)), x + width);
    assert.equal(Math.min(...result.outline.map(p => p.y)), y);
    assert.equal(Math.max(...result.outline.map(p => p.y)), y + height);
    for (const point of [...result.outline, ...result.separators.flat()]) insideRect(rect, point);
    result.outline.forEach((a, i, points) => {
      const b = points[(i + 1) % 6], c = points[(i + 2) % 6];
      assert.ok((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0);
      onBox(rect, a);
    });
    const junction = result.separators[0][1];
    assert.ok(junction.x > x && junction.x < x + width && junction.y > y && junction.y < y + height);
    assert.equal(JSON.stringify(rect), before);
  }
});

test('center rays meet the actual box silhouette in every quadrant, at bevels and at all vertices', () => {
  for (const [width, height] of sizes) for (const [x, y] of [[0, 0], [-999000, 999000]]) {
    const rect = freeze({ x, y, width, height }), c = center(rect), shape = box3dGeometry(rect);
    const directions = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
      [width, height], [-width, -height], [width, -height], [-width, height], [2, 1], [1, 2], [-2, 1], [1, -2]];
    for (const angle of Array.from({ length: 64 }, (_, i) => i * Math.PI / 32)) directions.push([Math.cos(angle), Math.sin(angle)]);
    for (const [dx, dy] of directions) {
      const point = contourPoint(rect, freeze({ x: dx, y: dy }), 'box3d'); onBox(rect, point);
      const length = Math.hypot(dx, dy), ux = length ? dx / length : 1, uy = length ? dy / length : 0;
      const expectedDistance = Math.min(ux ? width / 2 / Math.abs(ux) : Infinity,
        uy ? height / 2 / Math.abs(uy) : Infinity,
        ux + uy ? ((width + height) / 2 - shape.depth) / Math.abs(ux + uy) : Infinity);
      pointClose(point, { x: c.x + ux * expectedDistance, y: c.y + uy * expectedDistance });
      if (length) pointClose(contourPoint(rect, { x: -dx, y: -dy }, 'box3d'), { x: 2 * c.x - point.x, y: 2 * c.y - point.y });
    }
    // Construct vertex directions locally too: subtracting translated tiny
    // widths can change the ray's direction enough to miss a far-away vertex.
    const local = box3dGeometry({ width, height });
    local.outline.forEach((vertex, i) => pointClose(contourPoint(rect,
      { x: vertex.x - width / 2, y: vertex.y - height / 2 }, 'box3d'), shape.outline[i]));
  }
});

test('automatic arrows clip both box endpoints, reverse exactly and accept mixed box/rounded callbacks', () => {
  for (const [dx, dy] of [[500, 250], [-500, -250], [500, -250], [-500, 250], [500, 0], [0, 500]]) {
    const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', dx, dy)]);
    const forward = pathPoints(connectionGeometry(connection(), occurrences, box), true);
    const backward = pathPoints(connectionGeometry(connection([], null, 'b', 'a'), occurrences, box), true);
    assert.deepEqual(backward, [...forward].reverse());
    onBox(occurrences[0].bounds, forward[0]); onBox(occurrences[1].bounds, forward[1]);
    assert.ok((forward[1].x - forward[0].x) * dx + (forward[1].y - forward[0].y) * dy > 0);
    const mixed = pathPoints(connectionGeometry(connection(), occurrences, item => item.id === 'a' ? 'box3d' : 12), true);
    onBox(occurrences[0].bounds, mixed[0]);
    pointClose(mixed[1], contourPoint(occurrences[1].bounds, { x: -dx, y: -dy }, 12));
  }
  const pair = [occurrence('a', 0, 0), occurrence('b', 500, 250)];
  assert.notEqual(connectionGeometry(connection(), pair, box).d, connectionGeometry(connection(), pair).d);
});

test('self/coincident box loops keep proven outer-edge anchors and complete exterior control hulls for every aspect', () => {
  for (const [width, height] of sizes) for (const coincident of [false, true]) {
    const occurrences = freeze([occurrence('a', -999000, 999000, width, height),
      ...(coincident ? [occurrence('b', -999000, 999000, width, height)] : [])]);
    const link = connection([], null, 'a', coincident ? 'b' : 'a'), rect = occurrences[0].bounds;
    const result = connectionGeometry(link, occurrences, box), points = pathPoints(result);
    assert.deepEqual(result, connectionGeometry(link, occurrences, () => 0));
    assert.equal((result.d.match(/ C /g) || []).length, 2);
    assert.equal(points.length, 7); onBox(rect, points[0]); onBox(rect, points.at(-1));
    assert.ok(points[1].x > points[0].x); assert.equal(points[1].y, points[0].y);
    assert.equal(points[5].x, points[6].x); assert.ok(points[5].y < points[6].y);
    for (const p of points.slice(0, 4)) assert.ok(p.x >= rect.x + rect.width);
    for (const p of points.slice(3)) assert.ok(p.y <= rect.y);
    const fit = viewGeometryBounds(occurrences, [link], box);
    for (const p of points) insideRect(fit, p);
  }
});

test('overlap routes retain source/target contour ownership and direction in both orders', () => {
  for (const [width, height] of sizes) for (const [offsetX, offsetY] of [[.2, .2], [0, .2]]) {
    const occurrences = freeze([occurrence('a', 0, 0, width, height), occurrence('b', width * offsetX, height * offsetY, width, height)]);
    for (const reverse of [false, true]) {
      const link = connection([], null, reverse ? 'b' : 'a', reverse ? 'a' : 'b');
      const result = connectionGeometry(link, occurrences, box), points = pathPoints(result);
      assert.match(result.d, / C /);
      assert.deepEqual(result, connectionGeometry(link, occurrences, () => 0));
      onBox(occurrences[reverse ? 1 : 0].bounds, points[0]);
      onBox(occurrences[reverse ? 0 : 1].bounds, points.at(-1));
      const fit = viewGeometryBounds(occurrences, [link], box);
      for (const p of points) insideRect(fit, p);
    }
  }
});

test('stored clipping discards hidden prefixes and suffixes along actual off-center segments on both bevels', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 300, 180)]);
  const bends = [{ x: 60, y: 30 }, { x: 116, y: 50 }, { x: 116, y: 50 },
    { x: 128, y: 62 }, { x: 220, y: 120 }, { x: 292, y: 174 },
    { x: 310, y: 186 }, { x: 310, y: 186 }, { x: 360, y: 210 }];
  const stored = freeze(connection(bends)), result = connectionGeometry(stored, occurrences, box, true), points = pathPoints(result, true);
  assert.equal(result.routeMode, 'stored-polyline');
  assert.deepEqual(points.slice(1, -1), bends.slice(3, 6));
  pointClose(points[0], { x: 118, y: 52 }); pointClose(points.at(-1), { x: 306.4, y: 183.6 });
  onBox(occurrences[0].bounds, points[0]); onBox(occurrences[1].bounds, points.at(-1));
  onSegment(points[0], bends[2], bends[3]); onSegment(points.at(-1), bends[5], bends[6]);
  const reversed = connection([...bends].reverse(), null, 'b', 'a');
  const reverseResult = connectionGeometry(reversed, occurrences, box, true), reversePoints = pathPoints(reverseResult, true);
  reversePoints.forEach((point, i) => pointClose(point, points.at(-i - 1)));
  pointClose(reverseResult, result);
});

test('stored bends in removed box corners stay visible, while separators never clip an endpoint', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 300, 180)]);
  const stored = freeze(connection([{ x: 119, y: 59 }, { x: 220, y: 140 }, { x: 301, y: 181 }]));
  const points = pathPoints(connectionGeometry(stored, occurrences, box, true), true);
  assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
  onBox(occurrences[0].bounds, points[0]); onBox(occurrences[1].bounds, points.at(-1));
  const horizontal = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
  const viaJunction = connection([{ x: 110, y: 10 }, { x: 115, y: 10 }, { x: 200, y: 10 }, { x: 310, y: 10 }]);
  const line = pathPoints(connectionGeometry(viaJunction, horizontal, box, true), true);
  pointClose(line[0], { x: 120, y: 10 }); pointClose(line.at(-1), { x: 300, y: 10 });
  assert.deepEqual(line.slice(1, -1), [{ x: 200, y: 10 }]);
});

test('stored repeats and later revisits keep order, including deliberate interior crossings', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 500, 0)]);
  const stored = freeze(connection([{ x: 160, y: -60 }, { x: 160, y: -60 }, { x: 60, y: 30 },
    { x: 300, y: -60 }, { x: 160, y: -60 }, { x: 400, y: 30 }, { x: 400, y: 30 }]));
  const points = pathPoints(connectionGeometry(stored, occurrences, box, true), true);
  assert.deepEqual(points.slice(1, -1), [stored.routePoints.map(({ point }) => point)[0], stored.routePoints.map(({ point }) => point)[2], stored.routePoints.map(({ point }) => point)[3], stored.routePoints.map(({ point }) => point)[4], stored.routePoints.map(({ point }) => point)[5]]);
  for (let i = 1; i < points.length; i++) assert.notDeepEqual(points[i], points[i - 1]);
  onBox(occurrences[0].bounds, points[0]); onBox(occurrences[1].bounds, points.at(-1));
});

test('stored self/coincident and overlapping routes preserve visible bends and exterior terminal directions', () => {
  for (const [width, height] of sizes) for (const mode of ['self', 'coincident', 'overlap']) {
    const occurrences = freeze([occurrence('a', 0, 0, width, height),
      ...(mode === 'self' ? [] : [occurrence('b', mode === 'overlap' ? width / 4 : 0, 0, width, height)])]);
    const end = occurrences.at(-1).bounds, roof = -height - 100;
    const bends = [{ x: width + 200, y: height / 2 }, { x: width + 200, y: roof }, { x: center(end).x, y: roof }];
    const stored = freeze(connection(bends, null, 'a', mode === 'self' ? 'a' : 'b'));
    const result = connectionGeometry(stored, occurrences, box, true), points = pathPoints(result, true);
    assert.equal(result.routeMode, 'stored-polyline'); assert.deepEqual(points.slice(1, -1), bends);
    onBox(occurrences[0].bounds, points[0]); onBox(end, points.at(-1));
    assert.ok(points[1].x > points[0].x); assert.ok(points.at(-1).y > points.at(-2).y);
  }
});

test('empty/hidden stored box routes retain automatic fallback and exact explicit label anchors', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 0, 0)]);
  for (const bends of [[], [{ x: 60, y: 30 }], [{ x: 10, y: 10 }, { x: 100, y: 50 }]]) {
    const label = { x: -123.4, y: 456.7 }, stored = freeze(connection(bends, label));
    const enabled = connectionGeometry(stored, occurrences, box, true), automatic = connectionGeometry(stored, occurrences, box);
    assert.equal(enabled.d, automatic.d); assert.equal(enabled.x, label.x); assert.equal(enabled.y, label.y);
    assert.equal(enabled.routeMode, bends.length ? 'automatic-fallback' : 'automatic');
    assert.equal(enabled.fallbackReason, bends.length ? 'no-visible-route' : undefined);
    insideRect(enabled.bounds, label); insideRect(viewGeometryBounds(occurrences, [stored], box, true), label);
  }
});

test('Fit covers remote bends, measured labels, box extents and control hulls without changing frozen inputs', () => {
  for (const [width, height] of sizes) {
    const occurrences = freeze([occurrence('a', -999000, 999000, width, height), occurrence('b', 999000, -999000, height, width)]);
    const stored = freeze(connection([{ x: -1000000, y: 1000000 }, { x: 0, y: 0 }, { x: 1000000, y: -1000000 }], { x: -1000000, y: -1000000 }));
    const before = JSON.stringify({ occurrences, stored });
    const measured = freeze({ x: -1000400, y: -1000020, width: 1000, height: 40 });
    for (const enabled of [true, false, true]) {
      const result = connectionGeometry(stored, occurrences, box, enabled), points = pathPoints(result, true);
      const fit = viewGeometryBounds(occurrences, [stored], box, enabled, () => measured);
      for (const point of points) insideRect(fit, point);
      for (const item of occurrences) for (const point of box3dGeometry(item.bounds).outline) insideRect(fit, point);
      onBox(occurrences[0].bounds, points[0]); onBox(occurrences[1].bounds, points.at(-1));
      if (enabled) {
        assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
        insideRect(fit, stored.labelPosition); insideRect(fit, measured);
        insideRect(fit, { x: measured.x + measured.width, y: measured.y + measured.height });
      }
    }
    assert.equal(JSON.stringify({ occurrences, stored }), before);
  }
  assert.deepEqual(viewGeometryBounds([], [], box, true), { x: 0, y: 0, width: 900, height: 640 });
});

test('only the exact closed box token changes contours; unknown values retain numeric rectangle fallback', () => {
  const rect = freeze({ x: 0, y: 0, width: 120, height: 60 }), direction = freeze({ x: 2, y: 1 });
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 500, 250)]), stored = freeze(connection([{ x: 119, y: 59 }, { x: 400, y: 200 }]));
  for (const value of ['Box3D', 'box3d ', 'polygon', { shape: 'box3d' }, ['box3d'], null, false, NaN, Infinity, -12]) {
    assert.deepEqual(contourPoint(rect, direction, value), contourPoint(rect, direction, 0));
    for (const enabled of [false, true]) {
      assert.deepEqual(connectionGeometry(stored, occurrences, () => value, enabled), connectionGeometry(stored, occurrences, () => 0, enabled));
      assert.deepEqual(viewGeometryBounds(occurrences, [stored], () => value, enabled), viewGeometryBounds(occurrences, [stored], () => 0, enabled));
    }
  }
});

// Pin a deterministic numerical corpus independently of future implementation edits.
function regressionCorpus(api) {
  const results = [];
  for (const [width, height] of sizes) for (const radius of [0, 8, 12]) {
    const rect = { x: -999000, y: 999000, width, height };
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [1, 1], [-1, 1], [width, height]]) results.push(api.contourPoint(rect, { x, y }, radius));
    const pairs = [
      [occurrence('a', 0, 0, width, height), occurrence('b', width + 300, height + 200, width, height)],
      [occurrence('a', 0, 0, width, height), occurrence('b', width / 4, height / 4, width, height)],
      [occurrence('a', 0, 0, width, height), occurrence('b', 0, height / 4, width, height)],
      [occurrence('a', 0, 0, width, height), occurrence('b', 0, 0, width, height)],
      [occurrence('a', -999000, 999000, width, height), occurrence('b', 999000, -999000, height, width)],
    ];
    for (const occurrences of pairs) for (const reverse of [false, true]) {
      const a = center(occurrences[reverse ? 1 : 0].bounds), b = center(occurrences[reverse ? 0 : 1].bounds);
      const source = reverse ? 'b' : 'a', target = reverse ? 'a' : 'b';
      const links = [connection([], null, source, target), connection([a, a, b, b], null, source, target),
        connection([a, { x: -1000000, y: 1000000 }, { x: 1000000, y: -1000000 }, b], { x: -900000, y: -900000 }, source, target),
        connection([a, { x: a.x + 123, y: a.y - 145 }, { x: a.x + 123, y: a.y - 145 }, a], null, source, source)];
      const callback = item => item.id === 'a' ? radius : 12;
      for (const enabled of [false, true]) for (const link of links) {
        results.push(api.connectionGeometry(link, occurrences, callback, enabled));
        results.push(api.viewGeometryBounds(occurrences, [link], callback, enabled));
      }
    }
  }
  return results;
}
test('numeric contour, route, label and Fit outputs match the deterministic regression corpus', async () => {
  const actual = regressionCorpus(geometry);
  assert.equal(actual.length, 4032);
  assert.equal(createHash('sha256').update(JSON.stringify(actual)).digest('hex'), 'd4ed7551ec26f88e017cdc40c995c33572afec598b35de301bbf689b806d4315');

});
