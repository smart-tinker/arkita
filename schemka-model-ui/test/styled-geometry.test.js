import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionGeometry, sampleRoute, nearestRoutePoint } from '../src/connection-geometry.js';
const nodes = [{ id: 'a', bounds: { x: 0, y: 0, width: 100, height: 80 } }, { id: 'b', bounds: { x: 400, y: 180, width: 100, height: 80 } }];
const line = (style, routePoints = []) => ({ id: 'line', relationshipId: 'rel', source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints, labelPosition: null, style });
test('orthogonal drawing style changes only display geometry, and rounded corners retain their exact hosted pins', () => {
  const raw = line({ lineStyle: 'orthogonal' }), before = structuredClone(raw), geometry = connectionGeometry(raw, nodes), points = sampleRoute(geometry);
  assert.ok(points.length >= 3); for (let i = 1; i < points.length; i++) assert.ok(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y); assert.deepEqual(raw, before);
  const pin = { kind: 'anchor', id: 'pin', point: { x: 250, y: 50 } }, rounded = line({ lineStyle: 'rounded' }, [pin]); const curved = connectionGeometry(rounded, nodes, () => 0, false, [rounded]);
  assert.match(curved.d, / C /); assert.ok(sampleRoute(curved).some(point => point.x === pin.point.x && point.y === pin.point.y)); assert.ok(nearestRoutePoint(curved, pin.point));
});
test('stored geometry toggle retains its label/bend contract under style, and full-budget styled paths remain bounded and sampleable', () => {
  const raw = line({ lineStyle: 'orthogonal' }, [{ kind: 'bend', point: { x: 220, y: -100 } }]); raw.labelPosition = { x: 700, y: 800 };
  const on = connectionGeometry(raw, nodes, () => 0, true), off = connectionGeometry(raw, nodes, () => 0, false); assert.equal(on.x, 700); assert.equal(on.y, 800); assert.notEqual(off.x, 700);
  const points = Array.from({ length: 128 }, (_, at) => ({ kind: 'anchor', id: `pin-${at}`, point: { x: 120 + at * 2, y: at % 2 ? 100 : 120 } }));
  const full = line({ lineStyle: 'rounded' }, points), geometry = connectionGeometry(full, nodes, () => 0, false, [full]); assert.ok(geometry.d.length < 131072); assert.ok(sampleRoute(geometry).length > 128); for (const pin of points) assert.ok(sampleRoute(geometry).some(point => point.x === pin.point.x && point.y === pin.point.y));
  assert.deepEqual(sampleRoute({ d: 'M 0 0' + ' L 1 1'.repeat(130) }), []);
});

test('automatic and styled self links stay visible after moving/resizing while authored coordinates remain unchanged', () => {
  for (const style of [{}, { lineStyle: 'direct' }, { lineStyle: 'orthogonal' }, { lineStyle: 'rounded' }]) {
    const raw = { ...line(style), target: { kind: 'occurrence', id: 'a' } }, before = structuredClone(raw);
    for (const bounds of [{ x: 0, y: 0, width: 100, height: 80 }, { x: -400, y: 200, width: 220, height: 130 }]) {
      const geometry = connectionGeometry(raw, [{ id: 'a', bounds }]), points = sampleRoute(geometry);
      assert.ok(points.length > 2); assert.ok(points.some(point => point.x !== points[0].x || point.y !== points[0].y)); assert.ok(geometry.bounds.width > 0 && geometry.bounds.height > 0);
      if (style.lineStyle === 'orthogonal') for (let at = 1; at < points.length; at++) assert.ok(points[at].x === points[at - 1].x || points[at].y === points[at - 1].y);
    }
    assert.deepEqual(raw, before);
  }
});
