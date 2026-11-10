import test from 'node:test';
import assert from 'node:assert/strict';
import { nextJunctionBounds } from '../src/junction-placement.js';

const occurrence = (bounds, kind = 'element') => ({ concept: { kind }, bounds });
const view = occurrences => ({ occurrences, connections: [] });
const overlap = (a, b, gap = 12) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
const deepFreeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child); return Object.freeze(value); };
const seed = () => view([occurrence({ x: 100, y: 150, width: 210, height: 90 }), occurrence({ x: 530, y: 330, width: 210, height: 90 })]);

test('automatic junction placement is deterministic, detached and read-only', () => {
  assert.deepEqual(nextJunctionBounds(view([])), { x: 150, y: 80, width: 36, height: 36 });
  const input = deepFreeze(seed()), before = JSON.stringify(input), a = nextJunctionBounds(input), b = nextJunctionBounds(input);
  assert.deepEqual(a, b); assert.notEqual(a, b); assert.equal(JSON.stringify(input), before);
  for (const old of input.occurrences) assert.equal(overlap(a, old.bounds), false);
});

test('more than seven automatic junctions never recycle intersecting hit bodies', () => {
  const input = seed();
  for (let index = 0; index < 30; index++) {
    const bounds = nextJunctionBounds(input); assert.ok(bounds, `placement ${index}`);
    assert.ok(bounds.x >= 24 && bounds.y >= 24 && bounds.x + 36 <= 876 && bounds.y + 36 <= 616);
    for (const old of input.occurrences) assert.equal(overlap(bounds, old.bounds), false, `placement ${index}`);
    input.occurrences.push(occurrence(bounds, 'junction'));
  }
});

test('array order, IDs and persistent zIndex cannot change the automatic position', () => {
  const input = seed(); input.occurrences.push(occurrence({ x: 320.1, y: 80.3, width: 36, height: 36 }, 'junction'));
  const wanted = nextJunctionBounds(input);
  input.occurrences.reverse().forEach((item, i) => { item.id = `changed-${i}`; item.zIndex = 100 - i; });
  assert.deepEqual(nextJunctionBounds(input), wanted);
});

test('fractional obstacle edges preserve the sole exact-clearance tenth-grid slot', () => {
  const x = 500.1, y = 300.2;
  const input = view([
    occurrence({ x: 0, y: 0, width: 488.1, height: 640 }),
    occurrence({ x: 548.1, y: 0, width: 351.9, height: 640 }),
    occurrence({ x: 0, y: 0, width: 900, height: 288.2 }),
    occurrence({ x: 0, y: 348.2, width: 900, height: 291.8 }),
  ]);
  assert.deepEqual(nextJunctionBounds(input), { x, y, width: 36, height: 36 });
});

test('full initial-area coverage returns no slot; distant extreme geometry stays untouched', () => {
  const input = view([occurrence({ x: -999999.9, y: -999999.9, width: 0.1, height: 0.1 }), occurrence({ x: 0, y: 0, width: 1000000, height: 1000000 })]);
  assert.equal(nextJunctionBounds(deepFreeze(input)), null);
  const distant = view([occurrence({ x: 1000000, y: 1000000, width: 1000000, height: 1000000 })]);
  assert.deepEqual(nextJunctionBounds(distant), { x: 180, y: 118, width: 36, height: 36 });
});

test('tiny non-square imported junctions reserve their rendered minimum-radius hit circle', () => {
  const input = view([occurrence({ x: 197.9, y: 100, width: 0.2, height: 72 }, 'junction')]);
  const placed = nextJunctionBounds(input);
  assert.equal(overlap(placed, { x: 186, y: 124, width: 24, height: 24 }), false);
  assert.ok(Object.values(placed).every(n => Math.round(n * 10) / 10 === n && !Object.is(n, -0)));
});

test('visible pinned anchor hit targets are obstacles independent of optional geometry', () => {
  const input = view([]);
  input.connections.push({ routePoints: [{ kind: 'anchor', id: 'a', point: { x: 168, y: 98 } }, { kind: 'bend', point: { x: 0, y: 0 } }] });
  const placed = nextJunctionBounds(input);
  assert.equal(overlap(placed, { x: 158, y: 88, width: 20, height: 20 }), false);
});

test('tiny ordinary widths reserve the neutral four-unit selectable accent in every mode', () => {
  const input = view([occurrence({ x: 167.9, y: 100, width: 0.1, height: 100 })]);
  const placed = nextJunctionBounds(input);
  assert.deepEqual(placed, { x: 183.9, y: 118, width: 36, height: 36 });
  assert.ok(Math.round(placed.x * 10) - (1679 + 40) >= 120);
});
