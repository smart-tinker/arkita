import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionGeometry, viewGeometryBounds } from '../src/connection-geometry.js';

const occurrence = (id, x, y, width = 100, height = 100) => ({ id, concept: { kind: 'element', id: `element-${id}` }, bounds: { x, y, width, height } });
const connection = (bends = [], labelPosition = null, sourceId = 'a', targetId = 'b') =>
  ({ source: { kind: 'occurrence', id: sourceId }, target: { kind: 'occurrence', id: targetId },
    routePoints: bends.map(point => ({ kind: 'bend', point })), labelPosition });
const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected} within ${tolerance}`);
const pointClose = (actual, expected, tolerance) => {
  close(actual.x, expected.x, tolerance); close(actual.y, expected.y, tolerance);
};
const pointsClose = (actual, expected, tolerance) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((point, index) => pointClose(point, expected[index], tolerance));
};
function pathPoints(geometry, polyline = true) {
  assert.doesNotMatch(geometry.d, /NaN|Infinity|undefined/);
  if (polyline) assert.doesNotMatch(geometry.d, /[ACHQSTVZ]/i, 'Stored routes are straight polyline segments');
  const values = geometry.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
  assert.equal(values.length % 2, 0);
  assert.ok(values.every(Number.isFinite));
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
}
function contains(bounds, point, tolerance = 1e-7) {
  assert.ok(point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.width + tolerance,
    `x ${point.x} should be inside ${JSON.stringify(bounds)}`);
  assert.ok(point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.height + tolerance,
    `y ${point.y} should be inside ${JSON.stringify(bounds)}`);
}
function finiteGeometry(geometry) {
  pathPoints(geometry, false);
  assert.ok([geometry.x, geometry.y, ...Object.values(geometry.bounds)].every(Number.isFinite));
  assert.ok(geometry.bounds.width >= 0 && geometry.bounds.height >= 0);
}
function onContour(rect, point, radius) {
  const halfW = rect.width / 2, halfH = rect.height / 2;
  const x = Math.abs(point.x - rect.x - halfW), y = Math.abs(point.y - rect.y - halfH);
  const rx = Math.min(radius, halfW), ry = Math.min(radius, halfH), tolerance = 2e-7;
  contains(rect, point, tolerance);
  if (Math.abs(x - halfW) <= tolerance && y <= halfH - ry + tolerance) return;
  if (Math.abs(y - halfH) <= tolerance && x <= halfW - rx + tolerance) return;
  assert.ok(rx > 0 && ry > 0, 'A point away from the straight edges must be on a rounded corner');
  close(((x - halfW + rx) / rx) ** 2 + ((y - halfH + ry) / ry) ** 2, 1, 2e-5);
}
function onSegment(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  close(((point.x - from.x) * dy - (point.y - from.y) * dx) / length, 0);
  const distance = ((point.x - from.x) * dx + (point.y - from.y) * dy) / length;
  assert.ok(distance >= -1e-7 && distance <= length + 1e-7);
}
function halfLengthPoint(points) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const ratio = remaining / lengths[index];
      return { x: points[index].x + ratio * (points[index + 1].x - points[index].x),
        y: points[index].y + ratio * (points[index + 1].y - points[index].y) };
    }
    remaining -= lengths[index];
  }
  assert.fail('Expected a nonzero visible route');
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

test('stored geometry is OFF by default, and false preserves the automatic route, label and fit', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
  const stored = connection([{ x: -1000000, y: 1000000 }, { x: 1000000, y: -1000000 }], { x: -900000, y: -900000 });
  const empty = connection(), automatic = connectionGeometry(empty, occurrences);
  assert.deepEqual(automatic, { d: 'M 100 50 L 300 50', x: 200, y: 38,
    bounds: { x: 100, y: 50, width: 200, height: 0 } });
  assert.deepEqual(connectionGeometry(stored, occurrences), automatic);
  assert.deepEqual(connectionGeometry(stored, occurrences, () => 0, false), automatic);
  assert.equal(Object.hasOwn(automatic, 'routeMode'), false);
  assert.equal(Object.hasOwn(automatic, 'fallbackReason'), false);
  assert.deepEqual(viewGeometryBounds(occurrences, [stored]), viewGeometryBounds(occurrences, [empty]));
  assert.deepEqual(viewGeometryBounds(occurrences, [stored], () => 0, false), viewGeometryBounds(occurrences, [empty]));
  assert.notEqual(connectionGeometry(stored, occurrences, () => 0, true).d, automatic.d);
  assert.notDeepEqual(viewGeometryBounds(occurrences, [stored], () => 0, true), viewGeometryBounds(occurrences, [empty]));
});

test('ordered absolute bends become intermediate vertices, and a null label follows visible arc length', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 200)];
  const stored = connection([{ x: 150, y: 50 }, { x: 150, y: 250 }]);
  const geometry = connectionGeometry(stored, occurrences, () => 0, true), points = pathPoints(geometry);
  assert.deepEqual(points, [{ x: 100, y: 50 }, ...stored.routePoints.map(({ point }) => point), { x: 300, y: 250 }]);
  assert.equal(geometry.routeMode, 'stored-polyline'); assert.equal(geometry.fallbackReason, undefined);
  assert.equal(geometry.x, 150); assert.equal(geometry.y, 188);
  const midpoint = halfLengthPoint(points);
  pointClose({ x: geometry.x, y: geometry.y }, { x: midpoint.x, y: midpoint.y - 12 });
  for (const point of [...points, { x: geometry.x, y: geometry.y }]) contains(geometry.bounds, point);
});

test('hidden leading and trailing bends are clipped along their actual segments, not a center ray', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
  const stored = connection([{ x: 50, y: 50 }, { x: 50, y: 80 }, { x: 50, y: 80 },
    { x: 200, y: 80 }, { x: 350, y: 80 }, { x: 350, y: 80 }, { x: 350, y: 50 }]);
  const geometry = connectionGeometry(stored, occurrences, () => 0, true), points = pathPoints(geometry);
  pointsClose(points, [{ x: 100, y: 80 }, { x: 200, y: 80 }, { x: 300, y: 80 }]);
  assert.deepEqual(points[1], stored.routePoints.map(({ point }) => point)[3]);
  assert.ok(points[1].x > points[0].x, 'The route departs outwards from the source');
  assert.ok(points.at(-1).x > points.at(-2).x, 'The arrow approaches the target in the stored direction');
  pointClose({ x: geometry.x, y: geometry.y }, { x: 200, y: 68 });
});

test('only adjacent duplicates disappear from display; later revisits keep their stored order', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 400, 0)];
  const stored = connection([{ x: 150, y: -50 }, { x: 150, y: -50 }, { x: 250, y: -50 },
    { x: 150, y: -50 }, { x: 250, y: 50 }, { x: 250, y: 50 }]);
  const points = pathPoints(connectionGeometry(stored, occurrences, () => 0, true));
  assert.deepEqual(points.slice(1, -1), [stored.routePoints.map(({ point }) => point)[0], stored.routePoints.map(({ point }) => point)[2], stored.routePoints.map(({ point }) => point)[3], stored.routePoints.map(({ point }) => point)[4]]);
  for (let index = 1; index < points.length; index++) assert.notDeepEqual(points[index], points[index - 1]);
  assert.equal(stored.routePoints.map(({ point }) => point).length, 6);
});

test('rounded clipping honors actual off-center segments and the radius of each occurrence', () => {
  const occurrences = [occurrence('a', 0, 0, 200, 100), occurrence('b', 400, 200, 200, 100)];
  const stored = connection([{ x: 188, y: 90 }, { x: 220, y: 106 }, { x: 380, y: 194 }, { x: 412, y: 210 }]);
  for (const [sourceRadius, targetRadius] of [[0, 0], [8, 8], [12, 12], [0, 12], [12, 8]]) {
    const radiusFor = item => item.id === 'a' ? sourceRadius : targetRadius;
    const points = pathPoints(connectionGeometry(stored, occurrences, radiusFor, true));
    assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point).slice(1, -1));
    onContour(occurrences[0].bounds, points[0], sourceRadius);
    onContour(occurrences[1].bounds, points.at(-1), targetRadius);
    onSegment(points[0], stored.routePoints.map(({ point }) => point)[0], stored.routePoints.map(({ point }) => point)[1]);
    onSegment(points.at(-1), stored.routePoints.map(({ point }) => point)[2], stored.routePoints.map(({ point }) => point)[3]);
    assert.ok(points[1].x > points[0].x && points[1].y > points[0].y);
    assert.ok(points.at(-1).x > points.at(-2).x && points.at(-1).y > points.at(-2).y);
  }
});

test('points in the cut-off corner of a rounded rectangle remain visible', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 200)];
  const stored = connection([{ x: 99, y: 99 }, { x: 220, y: 180 }, { x: 301, y: 201 }]);
  const points = pathPoints(connectionGeometry(stored, occurrences, () => 12, true));
  assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
  onContour(occurrences[0].bounds, points[0], 12);
  onContour(occurrences[1].bounds, points.at(-1), 12);
});

test('reversing the connection and bend order reverses the same clipped route and terminal directions', () => {
  const occurrences = [occurrence('a', 0, 0, 200, 100), occurrence('b', 400, 200, 200, 100)];
  const stored = connection([{ x: 188, y: 90 }, { x: 220, y: 106 }, { x: 380, y: 194 }, { x: 412, y: 210 }]);
  const reversed = connection([...stored.routePoints.map(({ point }) => point)].reverse(), null, 'b', 'a');
  const radiusFor = item => item.id === 'a' ? 12 : 8;
  const forward = connectionGeometry(stored, occurrences, radiusFor, true);
  const backward = connectionGeometry(reversed, occurrences, radiusFor, true);
  const expected = pathPoints(forward).reverse(), actual = pathPoints(backward);
  assert.equal(actual.length, expected.length);
  actual.forEach((point, index) => pointClose(point, expected[index]));
  pointClose({ x: backward.x, y: backward.y }, { x: forward.x, y: forward.y });
});

test('manual self-loops and coincident occurrences retain exterior bends instead of automatic cubics', () => {
  for (const coincident of [false, true]) {
    const occurrences = [occurrence('a', 0, 0)];
    if (coincident) occurrences.push(occurrence('b', 0, 0));
    const stored = connection([{ x: 150, y: 50 }, { x: 150, y: -50 }, { x: 50, y: -50 }], null, 'a', coincident ? 'b' : 'a');
    for (const radius of [0, 8, 12]) {
      const points = pathPoints(connectionGeometry(stored, occurrences, () => radius, true));
      assert.deepEqual(points, [{ x: 100, y: 50 }, ...stored.routePoints.map(({ point }) => point), { x: 50, y: 0 }]);
      assert.ok(points[1].x > points[0].x, 'The loop departs rightward');
      assert.ok(points.at(-1).y > points.at(-2).y, 'The loop arrives downward');
      onContour(occurrences[0].bounds, points[0], radius);
      onContour(occurrences.at(-1).bounds, points.at(-1), radius);
    }
  }
});

test('an overlapping pair keeps a visible stored route and source-to-target terminal ownership', () => {
  const occurrences = [occurrence('a', 0, 0, 200, 100), occurrence('b', 80, 30, 200, 100)];
  const stored = connection([{ x: 100, y: -100 }, { x: 180, y: -100 }]);
  for (const radius of [0, 8, 12]) {
    const points = pathPoints(connectionGeometry(stored, occurrences, () => radius, true));
    pointsClose(points, [{ x: 100, y: 0 }, ...stored.routePoints.map(({ point }) => point), { x: 180, y: 30 }]);
    assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
    onContour(occurrences[0].bounds, points[0], radius); onContour(occurrences[1].bounds, points.at(-1), radius);
    assert.ok(points[1].y < points[0].y); assert.ok(points.at(-1).y > points.at(-2).y);
  }
});

test('stored route interiors may cross endpoint nodes and unrelated nodes without obstacle rerouting', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 400, 0), occurrence('obstacle', 175, -25)];
  const stored = connection([{ x: 150, y: 50 }, { x: 50, y: 50 }, { x: 300, y: 50 },
    { x: 450, y: 50 }, { x: 300, y: -50 }]);
  const geometry = connectionGeometry(stored, occurrences, () => 12, true), points = pathPoints(geometry);
  assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
  onContour(occurrences[0].bounds, points[0], 12); onContour(occurrences[1].bounds, points.at(-1), 12);
});

test('empty bends and completely hidden or zero-length manual routes fall back to the existing automatic path', () => {
  const cases = [
    { occurrences: [occurrence('a', 0, 0), occurrence('b', 300, 0)], stored: connection() },
    { occurrences: [occurrence('a', 0, 0)], stored: connection([{ x: 50, y: 50 }, { x: 50, y: 50 }], null, 'a', 'a') },
    { occurrences: [occurrence('a', 0, 0)], stored: connection([{ x: 25, y: 25 }, { x: 75, y: 75 }], null, 'a', 'a') },
    { occurrences: [occurrence('a', 0, 0), occurrence('b', 0, 0)], stored: connection([{ x: 40, y: 40 }, { x: 60, y: 60 }]) },
    { occurrences: [occurrence('a', 0, 0, 200, 100), occurrence('b', 80, 30, 200, 100)], stored: connection([{ x: 140, y: 65 }]) },
    { occurrences: [occurrence('a', 0, 0), occurrence('b', 100, 0)], stored: connection([{ x: 100, y: 50 }]) },
  ];
  for (const { occurrences, stored } of cases) for (const radius of [0, 8, 12]) {
    const fallback = connectionGeometry(stored, occurrences, () => radius, true);
    const automatic = connectionGeometry(stored, occurrences, () => radius, false);
    assert.equal(fallback.d, automatic.d); assert.equal(fallback.x, automatic.x); assert.equal(fallback.y, automatic.y);
    assert.equal(fallback.routeMode, stored.routePoints.map(({ point }) => point).length ? 'automatic-fallback' : 'automatic');
    assert.equal(fallback.fallbackReason, stored.routePoints.map(({ point }) => point).length ? 'no-visible-route' : undefined);
    finiteGeometry(fallback);
  }
});

test('explicit anchors override label coordinates exactly only when enabled, including empty and fallback routes', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
  for (const bendpoints of [[], [{ x: 150, y: -100 }, { x: 250, y: -100 }]]) {
    const anchor = { x: -543.2, y: -876.5 }, stored = connection(bendpoints, anchor);
    const enabled = connectionGeometry(stored, occurrences, () => 12, true);
    assert.equal(enabled.x, anchor.x); assert.equal(enabled.y, anchor.y);
    contains(enabled.bounds, anchor); contains(viewGeometryBounds(occurrences, [stored], () => 12, true), anchor);
    assert.deepEqual(connectionGeometry(stored, occurrences, () => 12),
      connectionGeometry(connection(bendpoints), occurrences, () => 12));
  }
  const anchor = { x: 0, y: 0 }, stored = connection([{ x: 50, y: 50 }], anchor, 'a', 'a');
  const geometry = connectionGeometry(stored, occurrences, () => 12, true);
  assert.equal(geometry.x, 0); assert.equal(geometry.y, 0); assert.match(geometry.d, / C /);
  contains(geometry.bounds, anchor);
});

test('fit covers remote stored bends and exact anchors in every direction', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
  for (const anchor of [{ x: -1000000, y: 0 }, { x: 1000000, y: 0 }, { x: 0, y: -1000000 }, { x: 0, y: 1000000 }]) {
    const stored = connection([{ x: -4000, y: -3000 }, { x: 5000, y: 6000 }], anchor);
    const geometry = connectionGeometry(stored, occurrences, () => 12, true);
    const fit = viewGeometryBounds(occurrences, [stored], () => 12, true);
    assert.ok(Object.values(fit).every(Number.isFinite));
    for (const point of [...pathPoints(geometry), anchor]) { contains(geometry.bounds, point); contains(fit, point); }
  }
  assert.deepEqual(viewGeometryBounds([], [], () => 12, true), { x: 0, y: 0, width: 900, height: 640 });
});

test('enabled fit includes supplied painted label bounds, while OFF does not consult display-only measurements', () => {
  const occurrences = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
  const stored = connection([{ x: 150, y: -100 }], { x: -500, y: -800 });
  const measured = { x: -1234, y: -987, width: 2000, height: 432 };
  let calls = 0;
  const labelBoundsFor = item => { assert.equal(item, stored); calls++; return measured; };
  const fit = viewGeometryBounds(occurrences, [stored], () => 12, true, labelBoundsFor);
  assert.equal(calls, 1);
  contains(fit, { x: measured.x, y: measured.y });
  contains(fit, { x: measured.x + measured.width, y: measured.y + measured.height });
  assert.deepEqual(viewGeometryBounds(occurrences, [stored], () => 12, false, labelBoundsFor),
    viewGeometryBounds(occurrences, [stored], () => 12, false));
  assert.equal(calls, 1);
});

test('all 128 nonduplicate bends are displayed in order without truncation or model mutation', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 1000, 0)]);
  const stored = freeze(connection(Array.from({ length: 128 }, (_, index) => ({ x: 150 + index * 5, y: index % 2 ? -100 : -80 })),
    { x: -500.1, y: 300.2 }));
  const before = JSON.stringify({ occurrences, stored });
  const geometry = connectionGeometry(stored, occurrences, () => 12, true), points = pathPoints(geometry);
  assert.equal(points.length, 130); assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
  const fit = viewGeometryBounds(occurrences, [stored], () => 12, true);
  for (const point of [...points, stored.labelPosition]) { contains(geometry.bounds, point); contains(fit, point); }
  connectionGeometry(stored, occurrences, () => 12, false);
  viewGeometryBounds(occurrences, [stored], () => 12, false);
  assert.equal(JSON.stringify({ occurrences, stored }), before);
});

test('frozen repeated and hidden input bends are preserved through clipping, fallback and mode switching', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 300, 0)]);
  const stored = freeze(connection([{ x: 50, y: 50 }, { x: 50, y: 80 }, { x: 200, y: 80 },
    { x: 200, y: 80 }, { x: 350, y: 80 }, { x: 350, y: 50 }], { x: 0, y: 0 }));
  const loop = freeze(connection([{ x: 50, y: 50 }, { x: 50, y: 50 }], null, 'a', 'a'));
  const before = JSON.stringify({ occurrences, stored, loop });
  for (const enabled of [true, false, true, false]) {
    connectionGeometry(stored, occurrences, () => 12, enabled);
    connectionGeometry(loop, occurrences, () => 12, enabled);
    viewGeometryBounds(occurrences, [stored, loop], () => 12, enabled);
  }
  assert.equal(JSON.stringify({ occurrences, stored, loop }), before);
});

test('tiny and asymmetric rounded contours remain finite at coordinate extremes in both directions', () => {
  for (const [width, height] of [[.1, .1], [.1, 40], [40, .1], [20, 20], [200, 100], [100, 200]]) {
    const occurrences = freeze([occurrence('a', -999000, 999000, width, height), occurrence('b', 999000, -999000, height, width)]);
    for (const radius of [0, 8, 12]) for (const reverse of [false, true]) {
      const bends = [{ x: -500000, y: 1000000 }, { x: 0, y: 0 }, { x: 500000, y: -1000000 }];
      const stored = freeze(connection(reverse ? bends.reverse() : bends, null, reverse ? 'b' : 'a', reverse ? 'a' : 'b'));
      const geometry = connectionGeometry(stored, occurrences, () => radius, true), points = pathPoints(geometry);
      finiteGeometry(geometry); assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
      onContour(occurrences[reverse ? 1 : 0].bounds, points[0], radius);
      onContour(occurrences[reverse ? 0 : 1].bounds, points.at(-1), radius);
      const midpoint = halfLengthPoint(points);
      pointClose({ x: geometry.x, y: geometry.y }, { x: midpoint.x, y: midpoint.y - 12 }, 1e-6);
      const fit = viewGeometryBounds(occurrences, [stored], () => radius, true);
      for (const point of [...points, { x: geometry.x, y: geometry.y }]) { contains(geometry.bounds, point); contains(fit, point); }
    }
  }
});

test('maximum-size imported rectangles and extreme stored coordinates produce finite clipped geometry', () => {
  const occurrences = freeze([occurrence('a', -1000000, -1000000, 1000000, 1000000),
    occurrence('b', 1000000, 1000000, 1000000, 1000000)]);
  const stored = freeze(connection([{ x: 0, y: 1000000 }, { x: 1000000, y: 0 }], { x: -1000000, y: 1000000 }));
  for (const radius of [0, 8, 12]) {
    const geometry = connectionGeometry(stored, occurrences, () => radius, true), points = pathPoints(geometry);
    finiteGeometry(geometry); assert.deepEqual(points.slice(1, -1), stored.routePoints.map(({ point }) => point));
    onContour(occurrences[0].bounds, points[0], radius); onContour(occurrences[1].bounds, points.at(-1), radius);
    const fit = viewGeometryBounds(occurrences, [stored], () => radius, true);
    for (const point of [...points, stored.labelPosition]) { contains(geometry.bounds, point); contains(fit, point); }
  }
});
