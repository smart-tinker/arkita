import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionGeometry, contourPoint, viewGeometryBounds, resolveConnectionEndpoint,
  sampleRoute, routePointAt, nearestRoutePoint } from '../src/connection-geometry.js';
import { copyLayout, sameLayout, moveLayout, nudgeLayout, insertBendpoint, removeBendpoint, resetBendpoints } from '../src/layout-edit.js';
import { multiplicityLabels } from '../src/multiplicity-geometry.js';

const point = (x, y) => ({ x, y });
const occurrence = (id, x, y, width = 100, height = 100, kind = 'element') =>
  ({ id, concept: { kind, id: `${kind}-${id}` }, bounds: { x, y, width, height } });
const end = id => ({ kind: 'occurrence', id });
const attachment = (id, anchorId) => ({ kind: 'connection', id, anchorId });
const bend = (x, y) => ({ kind: 'bend', point: point(x, y) });
const anchor = (id, x, y) => ({ kind: 'anchor', id, point: point(x, y) });
const connection = (id, source, target, routePoints = []) =>
  ({ id, relationshipId: `relationship-${id}`, source, target, routePoints, labelPosition: null });
const pair = [occurrence('a', 0, 0), occurrence('b', 300, 0)];
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const pointClose = (actual, expected, tolerance) => { close(actual.x, expected.x, tolerance); close(actual.y, expected.y, tolerance); };
const includes = (points, wanted) => points.some(point => point.x === wanted.x && point.y === wanted.y);
function contains(bounds, point) {
  assert.ok(point.x >= bounds.x && point.x <= bounds.x + bounds.width);
  assert.ok(point.y >= bounds.y && point.y <= bounds.y + bounds.height);
}

// Both occurrence kinds use the same placement contract. A junction circle is
// inscribed in its stored bounds, even when those bounds are not square.
test('circle rays use a centered inscribed circle without changing asymmetric occurrence bounds', () => {
  for (const [width, height] of [[120, 60], [60, 120], [.1, 1000000], [1000000, .1], [.1, .1]]) {
    const rect = freeze({ x: -999000, y: 999000, width, height });
    const center = point(rect.x + width / 2, rect.y + height / 2), radius = Math.min(width, height) / 2;
    for (const [x, y] of [[1, 0], [0, 1], [-1, -1], [2, -1], [0, 0]]) {
      const result = contourPoint(rect, point(x, y), 'circle');
      close(Math.hypot(result.x - center.x, result.y - center.y), radius, 2e-7);
      if (!x && !y) pointClose(result, point(center.x + radius, center.y));
    }
  }
});

test('automatic and stored circle routes clip on the same contour including self loops', () => {
  const occurrences = [occurrence('a', 0, 0, 120, 60, 'junction'), occurrence('b', 300, 0, 60, 120, 'junction')];
  const radiusFor = () => 'circle';
  const route = connection('host', end('a'), end('b'), [bend(180, -90)]);
  for (const enabled of [false, true]) {
    const points = sampleRoute(connectionGeometry(route, occurrences, radiusFor, enabled));
    close(Math.hypot(points[0].x - 60, points[0].y - 30), 30);
    close(Math.hypot(points.at(-1).x - 330, points.at(-1).y - 60), 30);
  }
  const loop = sampleRoute(connectionGeometry(connection('loop', end('a'), end('a')), occurrences, radiusFor));
  assert.deepEqual(loop[0], point(90, 30)); assert.deepEqual(loop.at(-1), point(60, 0));
  for (const p of loop) assert.ok(Math.hypot(p.x - 60, p.y - 30) >= 30 - 1e-7);
});

test('host anchors always pin routes while ordinary bends and explicit labels follow the toggle', () => {
  const host = freeze({ ...connection('host', end('a'), end('b'), [bend(150, -300), anchor('pin', 200, -80), bend(250, -300)]),
    labelPosition: point(-9000, -8000) });
  const before = JSON.stringify(host);
  const off = connectionGeometry(host, pair), on = connectionGeometry(host, pair, () => 0, true);
  assert.equal(off.routeMode, 'pinned-polyline'); assert.equal(on.routeMode, 'pinned-polyline');
  assert.ok(includes(off.points, point(200, -80))); assert.ok(includes(on.points, point(200, -80)));
  assert.ok(!includes(off.points, point(150, -300))); assert.ok(includes(on.points, point(150, -300)));
  assert.deepEqual(on.diagnostics, []); assert.deepEqual(on.anchors, [{ id: 'pin', point: point(200, -80), occludedBy: [] }]);
  assert.equal(on.x, -9000); assert.notEqual(off.x, -9000);
  assert.equal(JSON.stringify(host), before);
});

test('a relationship endpoint reads only the named host stored anchor, never host geometry', () => {
  const host = { id: 'host', relationshipId: 'shared-relationship', routePoints: [anchor('pin', 200, -80)] };
  Object.defineProperty(host, 'source', { get() { throw new Error('Host geometry must not be evaluated'); } });
  const other = connection('other', end('a'), end('b'), [anchor('wrong', 900, 900)]);
  other.relationshipId = host.relationshipId;
  const dependent = connection('dependent', end('a'), attachment('host', 'pin'));
  const geometry = connectionGeometry(dependent, pair, () => 0, false, [other, host, dependent]);
  assert.deepEqual(geometry.points.at(-1), point(200, -80));
  assert.deepEqual(resolveConnectionEndpoint(dependent.target, pair, [host]), {
    kind: 'connection', point: point(200, -80), bounds: { x: 200, y: -80, width: 0, height: 0 }, connectionId: 'host', anchorId: 'pin',
  });
  assert.throws(() => resolveConnectionEndpoint(attachment('other', 'pin'), pair, [host, other]), /Missing connection anchor/);
  assert.throws(() => resolveConnectionEndpoint(end('absent'), pair, [host]), /Missing connection occurrence/);
});

test('mutual and self-reference resolve in either collection order without recursion', () => {
  const a = connection('first', attachment('second', 'second-pin'), end('a'), [anchor('first-pin', 180, -100)]);
  const b = connection('second', end('b'), attachment('first', 'first-pin'), [anchor('second-pin', 250, -150)]);
  for (const hosts of [[a, b], [b, a]]) {
    const first = connectionGeometry(a, pair, () => 0, false, hosts), second = connectionGeometry(b, pair, () => 0, false, hosts);
    assert.deepEqual(first.points[0], point(250, -150));
    assert.deepEqual(second.points.at(-1), point(180, -100));
    assert.ok(includes(first.points, point(180, -100))); assert.ok(includes(second.points, point(250, -150)));
  }
  const self = connection('self', end('a'), attachment('self', 'self-pin'), [anchor('self-pin', 160, -100)]);
  assert.deepEqual(connectionGeometry(self, pair).points.at(-1), point(160, -100));
  const preview = { ...self, routePoints: [anchor('self-pin', 160, -200)] };
  assert.deepEqual(connectionGeometry(preview, pair, () => 0, false, [self]).points.at(-1), point(160, -200));
});

test('moving a hosted anchor updates host and dependent geometry without moving the stored node', () => {
  const host = freeze(connection('host', end('a'), end('b'), [anchor('pin', 200, -80)]));
  const dependent = freeze(connection('dependent', attachment('host', 'pin'), end('a')));
  const updated = { ...host, ...moveLayout(host, { kind: 'anchor', index: 0 }, 3.26, -20.21) };
  const hosts = [updated, dependent];
  const hostGeometry = connectionGeometry(updated, pair, () => 0, false, hosts);
  const dependentGeometry = connectionGeometry(dependent, pair, () => 0, false, hosts);
  assert.ok(includes(hostGeometry.points, point(203.3, -100.2)));
  assert.deepEqual(dependentGeometry.points[0], point(203.3, -100.2));
  assert.deepEqual(host.routePoints[0], anchor('pin', 200, -80));
});

test('node-terminal clipping never drops hidden anchors or their identity and emits stable diagnostics', () => {
  const host = freeze(connection('host', end('a'), end('b'), [bend(10, 10), anchor('hidden-source', 25, 25),
    anchor('outside', 200, -100), anchor('hidden-target', 350, 50), bend(360, 50)]));
  const geometry = connectionGeometry(host, pair, () => 0, true);
  assert.deepEqual(geometry.anchors.map(item => item.id), ['hidden-source', 'outside', 'hidden-target']);
  for (const item of host.routePoints.filter(item => item.kind === 'anchor')) assert.ok(includes(geometry.points, item.point));
  assert.deepEqual(geometry.diagnostics, [
    { ruleId: 'anchor-occluded', connectionId: 'host', anchorId: 'hidden-source', occurrenceId: 'a' },
    { ruleId: 'anchor-occluded', connectionId: 'host', anchorId: 'hidden-target', occurrenceId: 'b' },
  ]);
  assert.deepEqual(connectionGeometry(host, [...pair].reverse(), () => 0, true), geometry);
});

test('co-located anchors stay ordered and a wholly degenerate route remains inspectable', () => {
  const host = connection('host', attachment('host', 'one'), attachment('host', 'two'), [anchor('one', 7, 8), anchor('two', 7, 8)]);
  const geometry = connectionGeometry(host, []);
  assert.deepEqual(geometry.points, Array.from({ length: 4 }, () => point(7, 8)));
  assert.deepEqual(geometry.anchors.map(item => item.id), ['one', 'two']);
  assert.deepEqual(geometry.diagnostics, [{ ruleId: 'degenerate-route', connectionId: 'host' }]);
  assert.deepEqual(routePointAt(geometry), point(7, 8));
  assert.deepEqual(nearestRoutePoint(geometry, point(9, 9)), { point: point(7, 8), afterIndex: -1, segmentIndex: 0 });
  assert.ok(Object.values(viewGeometryBounds([], [host])).every(Number.isFinite));
});

test('a referenced point occluded by an occurrence is retained with an endpoint diagnostic', () => {
  const host = connection('host', end('a'), end('b'), [anchor('pin', 50, 50)]);
  const attached = connection('attached', end('a'), attachment('host', 'pin'));
  const geometry = connectionGeometry(attached, pair, () => 0, false, [host]);
  assert.deepEqual(geometry.points.at(-1), point(50, 50));
  assert.deepEqual(geometry.diagnostics, [
    { ruleId: 'endpoint-occluded', connectionId: 'attached', end: 'target', hostConnectionId: 'host', anchorId: 'pin', occurrenceId: 'a' },
    { ruleId: 'degenerate-route', connectionId: 'attached' },
  ]);
});

test('anchor occlusion uses the rendered circle rather than the whole stored rectangle', () => {
  const occurrences = [occurrence('a', 0, 0, 120, 60, 'junction'), occurrence('b', 300, 0)];
  const host = connection('host', end('a'), end('b'), [anchor('outside-circle', 5, 5)]);
  assert.deepEqual(connectionGeometry(host, occurrences, item => item.id === 'a' ? 'circle' : 0).diagnostics, []);
});

test('Fit includes mandatory remote anchors and supplied labels with the bend toggle off', () => {
  const host = connection('host', end('a'), end('b'), [anchor('remote', -1000000, 1000000)]);
  const attached = connection('attached', attachment('host', 'remote'), end('b'));
  const measured = { x: -1000200, y: 999950, width: 600, height: 100 };
  let calls = 0;
  const fit = viewGeometryBounds(pair, [host, attached], () => 0, false, () => { calls++; return measured; });
  assert.equal(calls, 2);
  for (const item of [host, attached]) for (const p of connectionGeometry(item, pair, () => 0, false, [host, attached]).points) contains(fit, p);
  contains(fit, measured); contains(fit, point(measured.x + measured.width, measured.y + measured.height));
});

test('multiplicity at a relationship endpoint uses its resolved point obstacle', () => {
  const host = connection('host', end('a'), end('b'), [anchor('pin', 200, -100)]);
  const attached = connection('attached', attachment('host', 'pin'), end('b'));
  const geometry = connectionGeometry(attached, pair, () => 0, false, [host]);
  const relationship = { sourceMultiplicity: '', targetMultiplicity: '*' };
  const labels = multiplicityLabels(relationship, geometry);
  assert.equal(labels.length, 2); assert.equal(labels[0].raw, ''); assert.equal(labels[1].raw, '*');
  assert.deepEqual(labels, multiplicityLabels(relationship, geometry, { x: 200, y: -100, width: 0, height: 0 }, pair[1].bounds));
});

test('reset preserves every anchor record and order; removing anchors through bend deletion is rejected', () => {
  const source = freeze(connection('host', end('a'), end('b'), [anchor('first', -0, 4.123), bend(20, 30), anchor('second', 20, 30), bend(50, 60)]));
  const reset = resetBendpoints(source);
  assert.deepEqual(reset.routePoints, [anchor('first', -0, 4.123), anchor('second', 20, 30)]);
  assert.notEqual(reset.routePoints[0], source.routePoints[0]); assert.notEqual(reset.routePoints[0].point, source.routePoints[0].point);
  assert.throws(() => removeBendpoint(source, 0), /Cannot remove an attachment anchor/);
  assert.throws(() => moveLayout(source, { kind: 'bend', index: 0 }, 0, 0), /Invalid layout target/);
  assert.throws(() => moveLayout(source, { kind: 'anchor', index: 1 }, 1, 0), /Invalid layout target/);
  const inserted = insertBendpoint(source, 0, point(1.23, 4.56));
  assert.deepEqual(inserted.routePoints.slice(0, 2), [anchor('first', -0, 4.123), bend(1.2, 4.6)]);
  assert.equal(sameLayout(source, copyLayout(source)), true);
  assert.equal(sameLayout(source, { ...copyLayout(source), routePoints: [anchor('different', -0, 4.123), ...source.routePoints.slice(1)] }), false);
  assert.deepEqual(nudgeLayout(source, { kind: 'anchor', index: 0 }, 1, 0).routePoints[0], anchor('first', 1, 4.123));
});

test('the shared 128-point budget counts bends and anchors; every pin remains on the displayed polyline', () => {
  const routePoints = Array.from({ length: 128 }, (_, index) => index % 2 ? bend(110 + index, -50) : anchor(`pin-${index}`, 110 + index, -50));
  const host = connection('host', end('a'), end('b'), routePoints);
  const geometry = connectionGeometry(host, pair, () => 0, true);
  assert.equal(sampleRoute(geometry).length, 130);
  assert.equal(geometry.anchors.length, 64);
  assert.throws(() => insertBendpoint(host, -1, point(0, 0)), /At most 128 route points/);
  assert.equal(resetBendpoints(host).routePoints.length, 64);
  assert.equal(multiplicityLabels({ sourceMultiplicity: '1', targetMultiplicity: '*' }, geometry).length, 2);
});

test('nearest route insertion uses merged raw indices, including hidden and collapsed bends', () => {
  const host = connection('host', end('a'), end('b'), [bend(50, 50), bend(50, 80), bend(50, 80), bend(200, 80), bend(350, 80)]);
  const ordinary = connectionGeometry(host, pair, () => 0, true);
  const nearest = nearestRoutePoint(ordinary, point(140, 90));
  pointClose(nearest.point, point(140, 80)); assert.equal(nearest.afterIndex, 2);
  const pinned = connection('pinned', end('a'), end('b'), [bend(50, -300), anchor('first', 150, -100), bend(200, -300), anchor('last', 250, -100)]);
  const off = connectionGeometry(pinned, pair);
  const offNearest = nearestRoutePoint(off, point(200, -95));
  assert.deepEqual(offNearest.point, point(200, -100)); assert.equal(offNearest.afterIndex, 1);
  const inserted = insertBendpoint(pinned, offNearest.afterIndex, offNearest.point);
  assert.deepEqual(inserted.routePoints.map(item => item.kind), ['bend', 'anchor', 'bend', 'bend', 'anchor']);
});

test('path sampling, midpoint and hit previews share exact polyline terminals and bounded cubic approximation', () => {
  const route = connection('host', end('a'), end('b'));
  const geometry = connectionGeometry(route, pair);
  assert.deepEqual(sampleRoute(geometry), [point(100, 50), point(300, 50)]);
  assert.deepEqual(routePointAt(geometry), point(200, 50));
  assert.deepEqual(routePointAt(geometry, -1), point(100, 50)); assert.deepEqual(routePointAt(geometry, 2), point(300, 50));
  assert.deepEqual(nearestRoutePoint(geometry, point(200, 100)), { point: point(200, 50), afterIndex: -1, segmentIndex: 0 });
  const loop = connectionGeometry(connection('loop', end('a'), end('a')), pair);
  const samples = sampleRoute(loop);
  assert.equal(samples.length, 65); assert.deepEqual(samples[0], point(100, 50)); assert.deepEqual(samples.at(-1), point(50, 0));
  assert.ok(samples.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(nearestRoutePoint(loop, routePointAt(loop)));
});

test('sampling rejects malformed or unbounded paths and nonfinite query coordinates', () => {
  for (const d of [null, undefined, '', 'M 0 0', 'M 0 0 H 20', 'M 0 0 L 1e309 0', 'M 0 0 L 1 1 Z',
    'M 0 0' + ' L 1 1'.repeat(130), 'M 0 0 L ' + '1'.repeat(17000) + ' 0']) {
    assert.deepEqual(sampleRoute({ d }), []); assert.equal(routePointAt({ d }), null); assert.equal(nearestRoutePoint({ d }, point(0, 0)), null);
  }
  const geometry = { d: 'M 0 0 L 10 10' };
  assert.equal(routePointAt(geometry, NaN), null); assert.equal(nearestRoutePoint(geometry, point(NaN, 0)), null);
});
