import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { box3dGeometry, nodeContourGeometry } from '../src/node-shapes.js';
import * as geometry from '../src/connection-geometry.js';

const { contourPoint, connectionGeometry, viewGeometryBounds } = geometry;
const tokens = ['octagon', 'ellipse', 'folder', 'cloud', 'wavy'];
const sizes = [[.1, .1], [.1, 1000000], [1000000, .1], [20, 20], [120, 60], [60, 120], [2000, 1000], [1000000, 1000000]];
const translations = [[0, 0], [-999000, 999000], [1000000, -1000000]];
const center = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const point = (rect, x, y) => ({ x: rect.x + rect.width * x, y: rect.y + rect.height * y });
const occurrence = (id, x, y, width = 120, height = 60) => ({ id, concept: { kind: 'element', id: `element-${id}` }, bounds: { x, y, width, height } });
const connection = (bends = [], labelPosition = null, sourceId = 'a', targetId = 'b') =>
  ({ source: { kind: 'occurrence', id: sourceId }, target: { kind: 'occurrence', id: targetId },
    routePoints: bends.map(point => ({ kind: 'bend', point })), labelPosition });
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const close = (actual, expected, tolerance = 2e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const pointClose = (actual, expected, tolerance) => { close(actual.x, expected.x, tolerance); close(actual.y, expected.y, tolerance); };
function pathPoints(result) {
  assert.doesNotMatch(result.d, /NaN|Infinity|undefined|[ACHQSTVZ]/i);
  const values = result.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
  assert.ok(values.every(Number.isFinite));
  assert.ok([result.x, result.y, ...Object.values(result.bounds)].every(Number.isFinite));
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
}
function inBounds(rect, p, tolerance = 2e-7) {
  assert.ok(p.x >= rect.x - tolerance && p.x <= rect.x + rect.width + tolerance, `${p.x} within x bounds`);
  assert.ok(p.y >= rect.y - tolerance && p.y <= rect.y + rect.height + tolerance, `${p.y} within y bounds`);
}
function normalized(rect, p) { return { x: (p.x - rect.x) / rect.width, y: (p.y - rect.y) / rect.height }; }
function localOutline(rect, token) {
  return nodeContourGeometry({ width: rect.width, height: rect.height }, token).outline
    .map(p => ({ x: p.x / rect.width, y: p.y / rect.height }));
}
function edgeDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function onContour(rect, p, token) {
  inBounds(rect, p);
  const q = normalized(rect, p);
  if (token === 'ellipse') close((2 * q.x - 1) ** 2 + (2 * q.y - 1) ** 2, 1, 2e-7);
  else {
    const polygon = localOutline(rect, token);
    assert.ok(polygon.some((a, index) => edgeDistance(q, a, polygon[(index + 1) % polygon.length]) <= 2e-7),
      `${JSON.stringify(q)} is on ${token}`);
  }
}
// Independent winding-number containment for verification of painted polygons.
function inside(rect, p, token, strict = false) {
  const q = normalized(rect, p);
  if (token === 'ellipse') return (2 * q.x - 1) ** 2 + (2 * q.y - 1) ** 2 < 1 + (strict ? -2e-8 : 2e-8);
  const polygon = localOutline(rect, token);
  let winding = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (edgeDistance(q, a, b) < 2e-8) return !strict;
    const cross = (b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y);
    if (a.y <= q.y && b.y > q.y && cross > 0) winding++;
    if (a.y > q.y && b.y <= q.y && cross < 0) winding--;
  }
  return winding !== 0;
}
function onSegment(p, a, b) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return pointClose(p, a);
  close(((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length, 0);
  const distance = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length;
  assert.ok(distance >= -2e-7 && distance <= length + 2e-7);
}

// Each design is locally authored and deterministic. The renderer consumes the
// very same returned polygon, while ellipse uses actual SVG ellipse attributes.
test('shared closed contour API supplies exact local designs and never rewrites bounds', () => {
  const rect = freeze({ x: 20, y: -30, width: 120, height: 60 });
  assert.deepEqual(nodeContourGeometry(rect, 'ellipse'), { ellipse: { cx: 80, cy: 0, rx: 60, ry: 30 } });
  assert.deepEqual(nodeContourGeometry(rect, 'folder').outline,
    [[20, -30], [68, -30], [68, -18], [140, -18], [140, 30], [20, 30]].map(([x, y]) => ({ x, y })));
  assert.deepEqual(nodeContourGeometry(rect, 'octagon').outline,
    [[32, -30], [128, -30], [140, -18], [140, 18], [128, 30], [32, 30], [20, 18], [20, -18]].map(([x, y]) => ({ x, y })));
  for (const token of ['octagon', 'folder', 'cloud', 'wavy']) {
    const global = nodeContourGeometry(rect, token), local = nodeContourGeometry({ width: 120, height: 60 }, token);
    assert.deepEqual(global.outline, local.outline.map(p => ({ x: p.x + 20, y: p.y - 30 })));
    global.outline[0].x = 987654;
    assert.deepEqual(nodeContourGeometry(rect, token).outline, local.outline.map(p => ({ x: p.x + 20, y: p.y - 30 })));
  }
  assert.equal(nodeContourGeometry(rect, 'cloud').outline.length, 96);
  assert.equal(nodeContourGeometry(rect, 'wavy').outline.length, 51);
  for (const invalid of ['Ellipse', 'folder ', 'box3d', 'polygon', '', 0, null, {}, ['folder']]) assert.equal(nodeContourGeometry(rect, invalid), null);
});

test('all new outlines contain the center and fit stored extents at tiny, extreme and translated bounds', () => {
  for (const token of tokens) for (const [width, height] of sizes) for (const [x, y] of translations) {
    const rect = freeze({ x, y, width, height }), before = JSON.stringify(rect), shape = nodeContourGeometry(rect, token);
    assert.ok(inside(rect, center(rect), token, true), `${token} contains its center`);
    const vertices = shape.outline || [point(rect, 0, .5), point(rect, 1, .5), point(rect, .5, 0), point(rect, .5, 1)];
    for (const vertex of vertices) inBounds(rect, vertex);
    assert.equal(Math.min(...vertices.map(p => p.x)), x); assert.equal(Math.max(...vertices.map(p => p.x)), x + width);
    assert.equal(Math.min(...vertices.map(p => p.y)), y); assert.equal(Math.max(...vertices.map(p => p.y)), y + height);
    assert.equal(JSON.stringify(rect), before);
  }
});

test('rays land on the actual polygon or analytic ellipse for every quadrant and aspect ratio', () => {
  for (const token of tokens) for (const [width, height] of sizes) for (const [x, y] of translations) {
    const rect = freeze({ x, y, width, height });
    const directions = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [width, height], [-width, height], [width, -height], [-width, -height]];
    for (let i = 0; i < 64; i++) directions.push([Math.cos(i * Math.PI / 32), Math.sin(i * Math.PI / 32)]);
    for (const [dx, dy] of directions) {
      const hit = contourPoint(rect, freeze({ x: dx, y: dy }), token);
      onContour(rect, hit, token);
      if (token === 'ellipse') {
        const nx = dx || dy ? dx / width : 1, ny = dy / height, length = Math.hypot(nx, ny);
        pointClose(hit, point(rect, .5 + nx / (2 * length), .5 + ny / (2 * length)));
      }
      const inner = { x: center(rect).x + .5 * (hit.x - center(rect).x), y: center(rect).y + .5 * (hit.y - center(rect).y) };
      assert.ok(inside(rect, inner, token), `${token} ray leaves from its filled center`);
    }
    pointClose(contourPoint(rect, { x: 0, y: -1 }, token), point(rect, .5, token === 'folder' ? .2 : 0));
    pointClose(contourPoint(rect, { x: 1, y: 0 }, token), point(rect, 1, .5));
  }
});

test('automatic new and mixed contour endpoints preserve direction and reverse precisely', () => {
  for (const token of tokens) for (const other of [...tokens, 'box3d', 0, 12]) for (const [x, y] of [[500, 250], [-500, -250], [500, -250], [-500, 250], [500, 0], [0, 500]]) {
    const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', x, y)]);
    const radiusFor = item => item.id === 'a' ? token : other;
    const forward = pathPoints(connectionGeometry(connection(), occurrences, radiusFor));
    const reverse = pathPoints(connectionGeometry(connection([], null, 'b', 'a'), occurrences, radiusFor));
    assert.deepEqual(reverse, [...forward].reverse());
    onContour(occurrences[0].bounds, forward[0], token);
    pointClose(forward[1], contourPoint(occurrences[1].bounds, { x: -x, y: -y }, other));
    assert.ok((forward[1].x - forward[0].x) * x + (forward[1].y - forward[0].y) * y > 0);
  }
});

test('automatic rays use the outermost fill exit while stored routes retain the first visible excursion', () => {
  const occurrences = freeze([occurrence('a', 0, 0, 100, 100), occurrence('b', 24, -51, 2, 2)]);
  const forward = pathPoints(connectionGeometry(connection(), occurrences, () => 'folder'));
  const reverse = pathPoints(connectionGeometry(connection([], null, 'b', 'a'), occurrences, () => 'folder'));
  pointClose(forward[0], { x: 37.5, y: 0 }); assert.deepEqual(reverse, [...forward].reverse());
  const stored = connection([{ x: 37.5, y: 0 }]);
  const manual = pathPoints(connectionGeometry(stored, occurrences, () => 'folder', true));
  pointClose(manual[0], { x: 42.5, y: 20 }); assert.deepEqual(manual[1], stored.routePoints.map(({ point }) => point)[0]);
  for (const token of tokens) for (const [width, height] of sizes) for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16, dx = width * 2.5 * Math.cos(angle), dy = height * 2.5 * Math.sin(angle);
    const pair = freeze([occurrence('a', -999000, 999000, width, height),
      occurrence('b', -999000 + .49 * width + dx, 999000 + .49 * height + dy, .02 * width, .02 * height)]);
    const points = pathPoints(connectionGeometry(connection(), pair, () => token));
    assert.equal(points.length, 2);
    const reversePoints = pathPoints(connectionGeometry(connection([], null, 'b', 'a'), pair, () => token));
    assert.deepEqual(reversePoints, [...points].reverse());
    onContour(pair[0].bounds, points[0], token); onContour(pair[1].bounds, points[1], token);
    for (let k = 1; k < 32; k++) {
      const p = { x: points[0].x + k / 32 * (points[1].x - points[0].x), y: points[0].y + k / 32 * (points[1].y - points[0].y) };
      assert.ok(!inside(pair[0].bounds, p, token, true), `${token} automatic route stays outside source`);
      assert.ok(!inside(pair[1].bounds, p, token, true), `${token} automatic route stays outside target`);
    }
  }
});

test('new self/coincident loops have true anchors and wholly exterior orthogonal bridges', () => {
  for (const token of tokens) for (const [width, height] of sizes) for (const coincident of [false, true]) {
    const occurrences = freeze([occurrence('a', -999000, 999000, width, height),
      ...(coincident ? [occurrence('b', -999000, 999000, width, height)] : [])]);
    const rect = occurrences[0].bounds, link = connection([], null, 'a', coincident ? 'b' : 'a');
    const result = connectionGeometry(link, occurrences, () => token), points = pathPoints(result);
    assert.equal(points.length, 5); onContour(rect, points[0], token); onContour(rect, points.at(-1), token);
    assert.ok(points[1].x > points[0].x); assert.equal(points[1].y, points[0].y);
    assert.equal(points.at(-2).x, points.at(-1).x); assert.ok(points.at(-2).y < rect.y);
    for (let i = 1; i < points.length; i++) for (let k = 1; k < 32; k++) {
      const t = k / 32, p = { x: points[i - 1].x + t * (points[i].x - points[i - 1].x), y: points[i - 1].y + t * (points[i].y - points[i - 1].y) };
      assert.ok(!inside(rect, p, token, true), `${token} loop does not cross its fill`);
    }
    const fit = viewGeometryBounds(occurrences, [link], () => token);
    for (const p of points) { inBounds(result.bounds, p); inBounds(fit, p); }
  }
});

test('overlaps route outward before turning, including the tall folder notch and reversed paths', () => {
  for (const token of tokens) for (const [width, height] of sizes) for (const [ox, oy] of [[.2, .2], [-.2, .2], [0, .2]]) {
    const occurrences = freeze([occurrence('a', 0, 0, width, height), occurrence('b', width * ox, height * oy, width, height)]);
    for (const reverse of [false, true]) {
      const link = connection([], null, reverse ? 'b' : 'a', reverse ? 'a' : 'b');
      const points = pathPoints(connectionGeometry(link, occurrences, () => token));
      const from = occurrences[reverse ? 1 : 0].bounds, to = occurrences[reverse ? 0 : 1].bounds;
      assert.ok(points.length >= 4); onContour(from, points[0], token); onContour(to, points.at(-1), token);
      for (const [rect, a, b] of [[from, points[0], points[1]], [to, points.at(-1), points.at(-2)]]) {
        assert.ok(a.x === b.x || a.y === b.y);
        for (let k = 1; k < 64; k++) assert.ok(!inside(rect, { x: a.x + (b.x - a.x) * k / 64, y: a.y + (b.y - a.y) * k / 64 }, token, true));
      }
      const fit = viewGeometryBounds(occurrences, [link], () => token);
      points.forEach(p => inBounds(fit, p));
    }
  }
});

test('concave folder clipping retains an inside-to-outside-to-inside excursion in one segment', () => {
  for (const [width, height] of sizes) for (const [x, y] of translations) {
    const rect = { x, y, width, height }, occurrences = freeze([{ id: 'a', bounds: rect }, occurrence('b', x + width + 300, y)]);
    const bends = [point(rect, .2, .1), point(rect, .8, .3), point(rect, 1.5, .3)];
    const stored = freeze(connection(bends)), result = connectionGeometry(stored, occurrences, () => 'folder', true), points = pathPoints(result);
    assert.equal(result.routeMode, 'stored-polyline');
    pointClose(points[0], point(rect, .4, 1 / 6), 2e-3);
    assert.deepEqual(points.slice(1, 3), bends.slice(1));
    onContour(rect, points[0], 'folder'); onSegment(points[0], bends[0], bends[1]);
    assert.ok(inside(rect, bends[0], 'folder') && inside(rect, bends[1], 'folder'));
    const reverse = pathPoints(connectionGeometry(connection([...bends].reverse(), null, 'b', 'a'), occurrences, () => 'folder', true));
    assert.equal(reverse.length, points.length); reverse.forEach((p, index) => pointClose(p, points.at(-index - 1)));
  }
});

test('cloud and wave chords keep visible excursions even when both stored endpoints are inside', () => {
  const rect = { x: 0, y: 0, width: 120, height: 60 };
  const examples = [
    ['wavy', point(rect, .5, .88), point(rect, 1, .88), point(rect, .75, .88)],
    ['cloud', point(rect, .98, .5), point(rect, .5 + .48 / Math.SQRT2, .5 + .48 / Math.SQRT2),
      point(rect, (.98 + .5 + .48 / Math.SQRT2) / 2, (.5 + .5 + .48 / Math.SQRT2) / 2)],
  ];
  for (const [token, a, b, outside] of examples) {
    assert.ok(inside(rect, a, token)); assert.ok(inside(rect, b, token)); assert.ok(!inside(rect, outside, token));
    const occurrences = freeze([{ id: 'a', bounds: rect }, occurrence('b', 500, 0)]);
    const bends = [a, b, { x: 300, y: 30 }], result = connectionGeometry(freeze(connection(bends)), occurrences, () => token, true), points = pathPoints(result);
    assert.equal(result.routeMode, 'stored-polyline'); onContour(rect, points[0], token); onSegment(points[0], a, b);
    assert.deepEqual(points.slice(1, -1), bends.slice(1));
    assert.ok(Math.hypot(points[0].x - a.x, points[0].y - a.y) < Math.hypot(outside.x - a.x, outside.y - a.y));
  }
});

test('ellipse stored intersections are analytic along actual off-center segments', () => {
  for (const [width, height] of sizes) for (const [x, y] of translations) {
    const rect = { x, y, width, height }, target = { x: x + width + 300, y: y + height + 300, width, height };
    const occurrences = freeze([{ id: 'a', bounds: rect }, { id: 'b', bounds: target }]);
    const bends = [point(rect, .5, .75), point(rect, 1.5, .75), point(target, -.5, .25), point(target, .5, .25)];
    const points = pathPoints(connectionGeometry(freeze(connection(bends)), occurrences, () => 'ellipse', true));
    const expectedX = .5 + Math.sqrt(3) / 4;
    pointClose(points[0], point(rect, expectedX, .75), 2e-3);
    pointClose(points.at(-1), point(target, 1 - expectedX, .25), 2e-3);
    onContour(rect, points[0], 'ellipse'); onContour(target, points.at(-1), 'ellipse');
    onSegment(points[0], bends[0], bends[1]); onSegment(points.at(-1), bends[2], bends[3]);
    assert.deepEqual(points.slice(1, -1), bends.slice(1, -1));
  }
});

test('vertex tangencies, repeated points and collinear boundary runs trim only truly hidden prefixes', () => {
  const occurrences = freeze([occurrence('a', 0, 0, 100, 100), occurrence('b', 400, 0, 100, 100)]);
  const cases = [
    ['folder', [{ x: 40, y: 20 }, { x: 40, y: 20 }, { x: 30, y: 30 }, { x: 30, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 30 }, { x: 200, y: 30 }], { x: 100, y: 30 }],
    ['octagon', [{ x: 88, y: 0 }, { x: 88, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 200, y: 50 }], { x: 100, y: 50 }],
    ['ellipse', [{ x: 50, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 200, y: 50 }], { x: 100, y: 50 }],
    ['cloud', [{ x: 50, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 200, y: 50 }], { x: 100, y: 50 }],
    ['wavy', [{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 50, y: 30 }, { x: 200, y: 30 }], { x: 100, y: 30 }],
  ];
  for (const [token, bends, expected] of cases) {
    const points = pathPoints(connectionGeometry(freeze(connection(bends)), occurrences, () => token, true));
    pointClose(points[0], expected); assert.deepEqual(points.slice(1, -1), bends.slice(-1));
    for (let i = 1; i < points.length; i++) assert.notDeepEqual(points[i], points[i - 1]);
  }
  const tangent = connection([{ x: 50, y: 0 }, { x: 50, y: 0 }, { x: 200, y: 0 }]);
  const tangentPoints = pathPoints(connectionGeometry(tangent, occurrences, () => 'ellipse', true));
  pointClose(tangentPoints[0], { x: 50, y: 0 }); assert.deepEqual(tangentPoints[1], { x: 200, y: 0 });
});

test('all visible interior bends and later revisits survive clipping without model mutation', () => {
  for (const token of tokens) {
    const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 1000, 0)]);
    const bends = Array.from({ length: 128 }, (_, index) => ({ x: 150 + index * 5, y: index % 2 ? -100 : -80 }));
    bends[30] = center(occurrences[0].bounds); bends[70] = center(occurrences[1].bounds); bends[80] = bends[25];
    const stored = freeze(connection(bends, { x: -900000, y: -900000 })), before = JSON.stringify({ occurrences, stored });
    for (const enabled of [true, false, true]) {
      const result = connectionGeometry(stored, occurrences, () => token, enabled), points = pathPoints(result);
      const measured = { x: -900500, y: -900020, width: 1000, height: 40 };
      const fit = viewGeometryBounds(occurrences, [stored], () => token, enabled, () => measured);
      for (const p of points) inBounds(fit, p);
      if (enabled) {
        assert.deepEqual(points.slice(1, -1), bends); assert.equal(result.x, stored.labelPosition.x); assert.equal(result.y, stored.labelPosition.y);
        inBounds(fit, measured); inBounds(fit, { x: measured.x + measured.width, y: measured.y + measured.height });
      }
    }
    assert.equal(JSON.stringify({ occurrences, stored }), before);
  }
});

test('empty and entirely hidden new-shape stored routes retain automatic fallback and explicit anchors', () => {
  for (const token of tokens) {
    const occurrences = freeze([occurrence('a', 0, 0)]);
    for (const bends of [[], [{ x: 60, y: 30 }, { x: 60, y: 30 }], [{ x: 55, y: 28 }, { x: 65, y: 32 }]]) {
      const stored = freeze(connection(bends, { x: -123, y: 456 }, 'a', 'a'));
      const enabled = connectionGeometry(stored, occurrences, () => token, true), automatic = connectionGeometry(stored, occurrences, () => token);
      assert.equal(enabled.d, automatic.d); assert.equal(enabled.x, -123); assert.equal(enabled.y, 456);
      assert.equal(enabled.routeMode, bends.length ? 'automatic-fallback' : 'automatic');
      assert.equal(enabled.fallbackReason, bends.length ? 'no-visible-route' : undefined);
    }
  }
});

// Pin a deterministic numerical contour, route and Fit corpus.
const regressionHash = 'c82141616325b30b82844e03d868e527912bffff878874879afd4405672afa72';
function regressionCorpus(api) {
  const results = [];
  for (const [width, height] of sizes) for (const token of [0, 8, 12, 'box3d', null, 'unknown']) {
    const rect = { x: -999000, y: 999000, width, height };
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [width, height]]) results.push(api.contourPoint(rect, { x, y }, token));
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
      const callback = item => item.id === 'a' ? token : 'box3d';
      for (const enabled of [false, true]) for (const link of links) {
        results.push(api.connectionGeometry(link, occurrences, callback, enabled));
        results.push(api.viewGeometryBounds(occurrences, [link], callback, enabled));
      }
    }
  }
  return results;
}
test('numeric and box3d contours, automatic/stored paths, labels and Fit remain byte-exact against the deterministic regression corpus', async () => {
  const actual = regressionCorpus(geometry), serialized = JSON.stringify(actual);
  assert.equal(createHash('sha256').update(serialized).digest('hex'), regressionHash);

  assert.deepEqual(box3dGeometry({ x: 0, y: 0, width: 120, height: 60 }), {
    depth: 10,
    outline: [{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 50 }, { x: 110, y: 60 }, { x: 0, y: 60 }],
    separators: [[{ x: 0, y: 10 }, { x: 110, y: 10 }], [{ x: 110, y: 10 }, { x: 120, y: 0 }], [{ x: 110, y: 10 }, { x: 110, y: 60 }]],
  });
});
