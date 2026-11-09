import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyLayout, sameLayout, moveLayout, nudgeLayout, insertBendpoint, removeBendpoint, resetBendpoints, resetLabelPosition,
} from '../src/layout-edit.js';

const layout = (points = [], labelPosition = null) => ({
  routePoints: Array.isArray(points) ? points.map(point => point?.kind ? point : { kind: 'bend', point }) : points, labelPosition,
});
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function detached(actual, original) {
  assert.notEqual(actual, original);
  assert.notEqual(actual.routePoints, original.routePoints);
  for (const item of actual.routePoints) assert.ok(!original.routePoints.includes(item));
  assert.notEqual(actual.routePoints.map(({ point }) => point), original.routePoints.map(({ point }) => point));
  for (const point of actual.routePoints.map(({ point }) => point)) assert.ok(!original.routePoints.map(({ point }) => point).includes(point));
  if (actual.labelPosition !== null && original.labelPosition !== null) {
    assert.notEqual(actual.labelPosition, original.labelPosition);
  }
}
function boundedError(action) {
  assert.throws(action, error => error instanceof Error && error.message.length > 0 && error.message.length <= 80);
}

test('copy extracts a detached layout without rounding, deduplicating or adding schema fields', () => {
  const point = { x: -12.345, y: 0.0001 };
  const connection = freeze({ id: 'connection-id', relationshipId: 'relationship-id',
    routePoints: [point, point, { x: 3, y: 4 }, point].map(point => ({ kind: 'bend', point })), labelPosition: { x: -0, y: 8.456 } });
  const result = copyLayout(connection);
  assert.deepEqual(result, layout([point, point, { x: 3, y: 4 }, point], { x: -0, y: 8.456 }));
  assert.deepEqual(Object.keys(result), ['routePoints', 'labelPosition']);
  detached(result, connection);
  assert.notEqual(result.routePoints.map(({ point }) => point)[0], result.routePoints.map(({ point }) => point)[1], 'Repeated source objects are separately copied');
  result.routePoints.map(({ point }) => point)[0].x = 999; result.labelPosition.y = 999;
  assert.equal(connection.routePoints.map(({ point }) => point)[0].x, -12.345); assert.equal(connection.labelPosition.y, 8.456);
  assert.deepEqual(copyLayout(freeze(layout())), layout());
});

test('sameLayout compares exact raw order, duplicates, fractions and null anchors', () => {
  const a = freeze(layout([{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 3, y: 4 }], { x: 0, y: -2 }));
  assert.equal(sameLayout(a, copyLayout(a)), true);
  assert.equal(sameLayout(a, layout([a.routePoints.map(({ point }) => point)[0], a.routePoints.map(({ point }) => point)[2], a.routePoints.map(({ point }) => point)[1]], a.labelPosition)), false);
  assert.equal(sameLayout(a, layout([a.routePoints.map(({ point }) => point)[0], a.routePoints.map(({ point }) => point)[2]], a.labelPosition)), false);
  assert.equal(sameLayout(a, layout(a.routePoints.map(({ point }) => point), null)), false);
  assert.equal(sameLayout(layout(), layout([], { x: 0, y: 0 })), false);
  assert.equal(sameLayout(layout([], { x: 1, y: 2 }), layout([], { x: 1 + Number.EPSILON, y: 2 })), false);
  assert.equal(sameLayout(layout([], { x: 0, y: 0 }), layout([], { x: -0, y: 0 })), false);
  assert.equal(sameLayout(layout(), layout()), true);
});

test('moving a duplicate bend edits its raw index and preserves all other stored fields', () => {
  const source = freeze(layout([{ x: 12.3, y: -4.5 }, { x: 12.3, y: -4.5 },
    { x: -9.876, y: 6.543 }, { x: 12.3, y: -4.5 }], { x: 5.4321, y: -7.6543 }));
  const result = moveLayout(source, freeze({ kind: 'bend', index: 1, anchor: { x: 999, y: 999 } }), -2.26, 8.04);
  assert.deepEqual(result, layout([source.routePoints.map(({ point }) => point)[0], { x: 10, y: 3.5 },
    source.routePoints.map(({ point }) => point)[2], source.routePoints.map(({ point }) => point)[3]], source.labelPosition));
  detached(result, source);
  assert.deepEqual(source.routePoints.map(({ point }) => point)[1], { x: 12.3, y: -4.5 });
});

test('label moves start at stored position or at the rendered anchor when null', () => {
  const bends = [{ x: 9.876, y: -5.432 }], anchor = freeze({ x: -20.25, y: 8.04 });
  const implicit = freeze(layout(bends)), explicit = freeze(layout(bends, { x: 5.6, y: -7.8 }));
  const fromImplicit = moveLayout(implicit, { kind: 'label', anchor }, 1.22, -9.18);
  assert.deepEqual(fromImplicit, layout(bends, { x: -19, y: -1.1 }));
  assert.deepEqual(moveLayout(explicit, { kind: 'label', anchor }, 1.22, -9.18), layout(bends, { x: 6.8, y: -17 }));
  assert.deepEqual(moveLayout(explicit, { kind: 'label' }, 1.22, -9.18), layout(bends, { x: 6.8, y: -17 }));
  detached(fromImplicit, implicit);
  assert.equal(implicit.labelPosition, null);
});

test('zero-delta moves preserve exact coordinates and null without creating a label anchor', () => {
  const sources = [freeze(layout([{ x: 1.234, y: -0 }], null)),
    freeze(layout([{ x: 1.234, y: -0 }], { x: -9.876, y: 4.321 }))];
  for (const source of sources) for (const target of [{ kind: 'bend', index: 0 },
    { kind: 'label' }, { kind: 'label', anchor: { x: 999, y: 999 } }]) {
    const result = moveLayout(source, target, 0, -0);
    assert.deepEqual(result, source); assert.equal(sameLayout(result, source), true); detached(result, source);
  }
});

test('rounding uses the existing 0.1-unit rule, normalizes negative zero, and can remain unchanged', () => {
  const source = freeze(layout([{ x: 10, y: -10 }], { x: 0, y: 0 }));
  const unchanged = moveLayout(source, { kind: 'bend', index: 0 }, 0.01, -0.01);
  assert.equal(sameLayout(source, unchanged), true); detached(unchanged, source);
  assert.deepEqual(moveLayout(source, { kind: 'label' }, -0.01, -0.04).labelPosition, { x: 0, y: 0 });
  assert.deepEqual(moveLayout(layout([], { x: 0, y: 0 }), { kind: 'label' }, -0.15, -0.25).labelPosition,
    { x: -0.1, y: -0.2 });
  assert.deepEqual(insertBendpoint(layout(), -1, { x: 2.25, y: -2.25 }).routePoints.map(({ point }) => point), [{ x: 2.3, y: -2.2 }]);
  const original = freeze(layout([{ x: 12.3, y: 4.5 }]));
  assert.deepEqual(moveLayout(original, { kind: 'bend', index: 0 }, 0.16, -0.26).routePoints.map(({ point }) => point), [{ x: 12.5, y: 4.2 }]);
  assert.deepEqual(moveLayout(original, { kind: 'bend', index: 0 }, 0.21, -0.31).routePoints.map(({ point }) => point), [{ x: 12.5, y: 4.2 }]);
});

test('finite extreme offsets and inserted points clamp to model bounds even when addition overflows', () => {
  const source = freeze(layout([{ x: 1000000, y: -1000000 }], { x: -1000000, y: 1000000 }));
  assert.deepEqual(moveLayout(source, { kind: 'bend', index: 0 }, Number.MAX_VALUE, -Number.MAX_VALUE), source);
  assert.deepEqual(moveLayout(source, { kind: 'label' }, Number.MAX_VALUE, -Number.MAX_VALUE).labelPosition,
    { x: 1000000, y: -1000000 });
  assert.deepEqual(moveLayout(layout([{ x: Number.MAX_VALUE, y: -Number.MAX_VALUE }]),
    { kind: 'bend', index: 0 }, Number.MAX_VALUE, -Number.MAX_VALUE).routePoints.map(({ point }) => point), [{ x: 1000000, y: -1000000 }]);
  assert.deepEqual(insertBendpoint(layout(), -1, { x: Number.MAX_VALUE, y: -Number.MAX_VALUE }),
    layout([{ x: 1000000, y: -1000000 }]));
  assert.deepEqual(insertBendpoint(layout(), -1, { x: -0, y: -0.01 }), layout([{ x: 0, y: 0 }]));
});

test('insertion supports empty, first, middle and final positions without changing duplicates or label', () => {
  const source = freeze(layout([{ x: 1.234, y: 2 }, { x: 1.234, y: 2 }, { x: 3, y: 4 }], { x: 5.678, y: 6 }));
  for (const afterIndex of [-1, 0, 1, 2]) {
    const result = insertBendpoint(source, afterIndex, freeze({ x: -7.26, y: 8.04 }));
    const expected = [...source.routePoints.map(({ point }) => point)]; expected.splice(afterIndex + 1, 0, { x: -7.3, y: 8 });
    assert.deepEqual(result, layout(expected, source.labelPosition)); detached(result, source);
  }
  assert.deepEqual(insertBendpoint(freeze(layout()), -1, { x: 1, y: 2 }), layout([{ x: 1, y: 2 }]));
});

test('removal addresses every raw position including duplicate and final points', () => {
  const source = freeze(layout([{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: -3.456, y: 4 }], { x: 5.678, y: 6 }));
  for (let index = 0; index < source.routePoints.map(({ point }) => point).length; index++) {
    const result = removeBendpoint(source, index);
    assert.deepEqual(result, layout(source.routePoints.map(({ point }) => point).filter((_, at) => at !== index), source.labelPosition));
    detached(result, source);
  }
  assert.deepEqual(removeBendpoint(freeze(layout([{ x: 1, y: 2 }])), 0), layout());
});

test('the 128-point cap permits replacement and removal but no additional insertion', () => {
  const source = freeze(layout(Array.from({ length: 127 }, (_, index) => ({ x: index, y: -index || 0 }))));
  const full = freeze(insertBendpoint(source, 126, { x: 127, y: -127 }));
  assert.equal(full.routePoints.map(({ point }) => point).length, 128);
  assert.equal(moveLayout(full, { kind: 'bend', index: 127 }, 2, 3).routePoints.map(({ point }) => point).length, 128);
  assert.equal(removeBendpoint(full, 127).routePoints.map(({ point }) => point).length, 127);
  for (const index of [-1, 0, 127]) boundedError(() => insertBendpoint(full, index, { x: 0, y: 0 }));
  boundedError(() => copyLayout(layout(Array.from({ length: 129 }, () => ({ x: 0, y: 0 })))));
});

test('reset helpers affect only their own field and remain detached for already-reset inputs', () => {
  const source = freeze(layout([{ x: -1.234, y: 2 }, { x: -1.234, y: 2 }], { x: 3.456, y: -4.567 }));
  assert.deepEqual(resetBendpoints(source), layout([], source.labelPosition));
  assert.deepEqual(resetLabelPosition(source), layout(source.routePoints.map(({ point }) => point)));
  detached(resetBendpoints(source), source); detached(resetLabelPosition(source), source);
  const empty = freeze(layout());
  for (const reset of [resetBendpoints, resetLabelPosition]) {
    const result = reset(empty); assert.deepEqual(result, empty); detached(result, empty);
    assert.equal(sameLayout(result, empty), true);
  }
});

test('invalid kinds and raw indices throw short errors, including on zero-delta moves', () => {
  const source = freeze(layout([{ x: 1, y: 2 }, { x: 3, y: 4 }]));
  for (const target of [null, undefined, {}, { kind: 'route' }, { kind: 'bend' }, { kind: 'x'.repeat(10000) }]) {
    boundedError(() => moveLayout(source, target, 0, 0));
  }
  for (const index of [-2, -1, 2, 128, 0.5, NaN, Infinity, -Infinity, '0', null, undefined, {}, 0n]) {
    boundedError(() => moveLayout(source, { kind: 'bend', index }, 0, 0));
    boundedError(() => removeBendpoint(source, index));
  }
  for (const index of [-2, 2, 128, 0.5, NaN, Infinity, -Infinity, '0', null, undefined, {}, 0n]) {
    boundedError(() => insertBendpoint(source, index, { x: 0, y: 0 }));
  }
  for (const index of [-1, 0, 1]) {
    boundedError(() => moveLayout(layout(), { kind: 'bend', index }, 0, 0));
    boundedError(() => removeBendpoint(layout(), index));
  }
  boundedError(() => insertBendpoint(layout(), 0, { x: 0, y: 0 }));
});

test('nonfinite or nonnumeric deltas and points are rejected without coercion', () => {
  const source = freeze(layout([{ x: 1, y: 2 }]));
  for (const value of [NaN, Infinity, -Infinity, '1', null, undefined, {}, [], true, 1n, Symbol('number')]) {
    boundedError(() => moveLayout(source, { kind: 'bend', index: 0 }, value, 0));
    boundedError(() => moveLayout(source, { kind: 'label', anchor: { x: 1, y: 2 } }, 0, value));
    for (const point of [{ x: value, y: 0 }, { x: 0, y: value }]) {
      boundedError(() => insertBendpoint(source, -1, point));
      boundedError(() => moveLayout(source, { kind: 'label', anchor: point }, 1, 1));
    }
  }
  for (const point of [null, undefined, false, 1, 'point', [], {}, { x: 0 }, { y: 0 }]) {
    boundedError(() => insertBendpoint(source, -1, point));
    boundedError(() => moveLayout(source, { kind: 'label', anchor: point }, 1, 1));
  }
});

test('malformed layouts fail consistently rather than silently discarding stored fields', () => {
  const invalid = [null, undefined, [], {}, { routePoints: [] }, { labelPosition: null },
    layout(null), layout({}), layout([null]), layout(new Array(1)), layout([], {}), layout([], { x: NaN, y: 0 })];
  for (const source of invalid) for (const action of [() => copyLayout(source), () => sameLayout(source, layout()),
    () => sameLayout(layout(), source), () => moveLayout(source, { kind: 'label' }, 0, 0),
    () => insertBendpoint(source, -1, { x: 0, y: 0 }), () => removeBendpoint(source, 0),
    () => resetBendpoints(source), () => resetLabelPosition(source)]) boundedError(action);
});


test('keyboard steps preserve explicit perpendicular fractions without changing pointer snapping', () => {
  const original = freeze(layout([{ x: 4.12345, y: 17.54321 }, { x: 4.12345, y: 17.54321 }], { x: 6.12345, y: 19.54321 }));
  for (const kind of ['bend', 'label']) for (const [dx, dy] of [[10, 0], [-1, 0], [0, 10], [0, -1]]) {
    const target = { kind, index: 1 }, next = nudgeLayout(original, target, dx, dy), origin = kind === 'bend' ? original.routePoints.map(({ point }) => point)[1] : original.labelPosition;
    const point = kind === 'bend' ? next.routePoints.map(({ point }) => point)[1] : next.labelPosition;
    assert.equal(point.x, dx ? Math.round((origin.x + dx) * 10) / 10 : origin.x);
    assert.equal(point.y, dy ? Math.round((origin.y + dy) * 10) / 10 : origin.y);
    assert.deepEqual(next.routePoints.map(({ point }) => point)[0], original.routePoints.map(({ point }) => point)[0]);
  }
  assert.equal(moveLayout(original, { kind: 'bend', index: 1 }, 10, 0).routePoints.map(({ point }) => point)[1].y, 17.5, 'Pointer policy is unchanged');
});

test('outward clamped keyboard steps preserve off-grid coordinates and nullable label exactly', () => {
  for (const [x, y, dx, dy] of [[1000000, 17.12345, 10, 0], [-1000000, 17.12345, -1, 0], [17.12345, 1000000, 0, 1], [17.12345, -1000000, 0, -10]]) {
    for (const kind of ['bend', 'label']) for (const nullable of [false, true]) {
      const point = { x, y }, original = freeze(layout([point], nullable ? null : point));
      const next = nudgeLayout(original, { kind, index: 0, anchor: point }, dx, dy);
      assert.deepEqual(next, original); assert.notEqual(next, original);
    }
  }
});

test('keyboard materialization snaps the renderer anchor on both axes only after actual movement', () => {
  const original = freeze(layout([], null)), target = { kind: 'label', anchor: { x: 20.12345, y: 30.54321 } };
  assert.deepEqual(nudgeLayout(original, target, 10, 0), layout([], { x: 30.1, y: 30.5 }));
  assert.deepEqual(nudgeLayout(original, target, 0, -1), layout([], { x: 20.1, y: 29.5 }));
  assert.deepEqual(nudgeLayout(original, target, 0, 0), original);
});

test('keyboard helper rejects diagonal/nonfinite deltas and invalid targets without mutation', () => {
  const original = freeze(layout([{ x: 1, y: 2 }], null));
  for (const [dx, dy] of [[1, 1], [Infinity, 0], [0, NaN], ['1', 0]]) assert.throws(() => nudgeLayout(original, { kind: 'bend', index: 0 }, dx, dy), /Invalid keyboard layout delta/);
  assert.throws(() => nudgeLayout(original, { kind: 'bend', index: 1 }, 10, 0), /Invalid bendpoint index/);
  assert.throws(() => nudgeLayout(original, { kind: 'label' }, 10, 0), /Invalid layout point/);
});
