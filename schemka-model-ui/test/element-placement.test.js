import test from 'node:test';
import assert from 'node:assert/strict';
import { nextElementBounds } from '../src/junction-placement.js';

const camera = { x: 0, y: 0, width: 900, height: 640 };
const occurrence = bounds => ({ concept: { kind: 'element' }, bounds });
const overlaps = (a, b) => a.x < b.x + b.width + 12 && a.x + a.width + 12 > b.x && a.y < b.y + b.height + 12 && a.y + a.height + 12 > b.y;

test('automatic elements use the panned fractional camera on the native tenth grid without changing input', () => {
  const view = Object.freeze({ occurrences: Object.freeze([]), connections: Object.freeze([]) });
  const area = Object.freeze({ x: 5000.03, y: -900.07, width: 450.1, height: 320.2 });
  const bounds = nextElementBounds(view, area);
  assert.deepEqual(bounds, nextElementBounds(view, area));
  assert.equal(bounds.width, 210); assert.equal(bounds.height, 90);
  assert.ok(bounds.x >= area.x + 24 && bounds.y >= area.y + 24);
  assert.ok(bounds.x + bounds.width <= area.x + area.width - 24 && bounds.y + bounds.height <= area.y + area.height - 24);
  for (const value of Object.values(bounds)) assert.ok(Math.round(value * 10) / 10 === value && !Object.is(value, -0));
});

test('eight ordinary elements have visible separate bodies instead of recycling seven positions', () => {
  const view = { occurrences: [], connections: [] };
  for (let i = 0; i < 8; i++) {
    const bounds = nextElementBounds(view, camera); assert.ok(bounds);
    for (const old of view.occurrences) assert.equal(overlaps(bounds, old.bounds), false);
    assert.ok(bounds.x >= 24 && bounds.y >= 24 && bounds.x + 210 <= 876 && bounds.y + 90 <= 616);
    view.occurrences.push(occurrence(bounds));
  }
});

test('rectangular element clearance preserves a sole fractional slot', () => {
  const view = { occurrences: [
    occurrence({ x: 0, y: 0, width: 488.1, height: 640 }),
    occurrence({ x: 722.1, y: 0, width: 177.9, height: 640 }),
    occurrence({ x: 0, y: 0, width: 900, height: 288.2 }),
    occurrence({ x: 0, y: 402.2, width: 900, height: 237.8 }),
  ], connections: [] };
  assert.deepEqual(nextElementBounds(view, camera), { x: 500.1, y: 300.2, width: 210, height: 90 });
});

test('covered, too small and out-of-model cameras use the nearest legal free position', () => {
  const empty = { occurrences: [], connections: [] };
  const full = { occurrences: [occurrence({ x: -10, y: -10, width: 920, height: 660 })], connections: [] };
  assert.deepEqual(nextElementBounds(full, camera), { x: 345, y: -112, width: 210, height: 90 });
  for (const area of [{ ...camera, width: 180 }, { ...camera, height: 80 }, { ...camera, x: 1000001 }, { ...camera, x: -1002000 }]) {
    const bounds = nextElementBounds(empty, area); assert.ok(bounds);
    for (const value of Object.values(bounds)) assert.ok(Math.abs(value) <= 1000000 && Math.round(value * 10) / 10 === value && !Object.is(value, -0));
  }
  assert.equal(nextElementBounds(empty, { ...camera, width: Infinity }), null);
  const edge = nextElementBounds(empty, { ...camera, x: 999950 });
  assert.ok(edge && edge.x <= 1000000);
  const covered = { occurrences: [-1000000, 0].flatMap(x => [-1000000, 0].map(y => occurrence({ x, y, width: 1000000, height: 1000000 }))), connections: [] };
  assert.equal(nextElementBounds(covered, camera), null, 'A fully occupied legal model domain still has no automatic slot');
});
