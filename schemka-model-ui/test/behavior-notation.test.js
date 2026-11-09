import { assertGlyphCaptionClearance } from './glyph-caption-assertions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { NOTATION_ELEMENTS, UNKNOWN_NOTATION, notationElement, notationBox } from '../src/notation.js';
import { connectionGeometry, viewGeometryBounds } from '../src/connection-geometry.js';

const document = new JSDOM('').window.document, types = ['Service', 'Process', 'Function', 'Event'];
const numbers = text => text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
const points = node => node.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number));
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
const insideRounded = (x, y, width, height) => {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  const rx = Math.min(12, width / 2), ry = Math.min(12, height / 2);
  const dx = Math.max(rx - x, x - (width - rx), 0) / rx;
  const dy = Math.max(ry - y, y - (height - ry), 0) / ry;
  return dx * dx + dy * dy <= 1;
};

for (const type of types) test(`${type} alone has its closed behavior token and unchanged rounded-box descriptor`, () => {
  const appearance = notationElement(CURRENT_METAMODEL, type), token = type.toLowerCase();
  assert.deepEqual(NOTATION_ELEMENTS.filter(t => notationElement(CURRENT_METAMODEL, t).glyph === token), [type]);
  assert.equal(appearance.glyph, token); assert.equal(appearance.radius, 12); assert.equal(appearance.family, 'common');
  assert.equal(appearance.badge, type); assert.equal(appearance.className, 'node notation-draft notation-common');
  assert.equal(appearance.contour, undefined); assert.equal(appearance.banded, undefined); assert.equal(appearance.tabbed, undefined);
  for (const width of [.1, 1, 20, 38, 40, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 24, 28, 55, 90, 1000000]) {
    const bounds = Object.freeze({ width, height }), shape = notationBox(document, appearance, bounds), box = shape.querySelector('.node-box'), glyph = shape.querySelector(`.${token}-glyph`);
    assert.equal(shape.children.length, 2); assert.equal(shape.querySelectorAll('.node-box').length, 1); assert.equal(box.tagName, 'rect');
    assert.deepEqual([...box.attributes].map(a => [a.name, a.value]), [['class', 'node-box'], ['width', String(width)], ['height', String(height)], ['rx', '12']]);
    assert.equal(glyph.children.length, 1); assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(glyph.firstElementChild.getAttribute('class'), 'node-detail'); assert.equal(glyph.firstElementChild.hasAttribute('vector-effect'), false);
    assert.equal(shape.querySelectorAll('image,use,script,foreignObject,a,marker,defs').length, 0);
    assert.match(glyph.getAttribute('transform'), /^translate\([^)]+\) scale\([^ ,)]+\)$/u);
    const [x, y, scale] = numbers(glyph.getAttribute('transform'));
    assert.ok([x, y, scale].every(Number.isFinite) && scale > 0 && scale <= 1.5);
    assert.equal(glyph.firstElementChild.getAttribute('stroke-linejoin'), type === 'Service' ? null : 'round');
    // Every outline lies in [1,17] x [1,6]; round joins/curves add at most half the shared 1.25 stroke.
    // The rounded rectangle is convex, so containment of the ink rectangle's four corners covers all ink.
    for (const px of [.375, 17.625]) for (const py of [.375, 6.625]) assert.ok(insideRounded(x + px * scale, y + py * scale, width, height), `${type} ${width}x${height}: rounded-corner ink containment`);
    assertGlyphCaptionClearance(appearance, bounds, { left: x + .375 * scale, right: x + 17.625 * scale, top: y + .375 * scale, bottom: y + 6.625 * scale });
  }
});

test('Service is a horizontal closed capsule with smooth equal caps and no seam', () => {
  const glyph = notationBox(document, notationElement(CURRENT_METAMODEL, 'Service'), { width: 220, height: 90 }).querySelector('.service-glyph');
  const rect = glyph.firstElementChild; assert.equal(rect.tagName, 'rect');
  const [x, y, width, height, radius] = ['x', 'y', 'width', 'height', 'rx'].map(a => Number(rect.getAttribute(a)));
  assert.ok(x > 0 && y > 0 && width > height * 2); assert.equal(radius, height / 2);
  assert.equal(glyph.children.length, 1); assert.equal(rect.hasAttribute('ry'), false);
});

test('Process is a closed right block arrow with rectangular tail, two shoulders and no left notch', () => {
  const polygon = notationBox(document, notationElement(CURRENT_METAMODEL, 'Process'), { width: 220, height: 90 }).querySelector('.process-glyph').firstElementChild;
  assert.equal(polygon.tagName, 'polygon'); const p = points(polygon); assert.equal(p.length, 7);
  const [tailTop, shaftTop, shoulderTop, tip, shoulderBottom, shaftBottom, tailBottom] = p;
  assert.equal(tailTop[0], tailBottom[0]); assert.equal(tailTop[1], shaftTop[1]); assert.equal(tailBottom[1], shaftBottom[1]);
  assert.equal(shaftTop[0], shoulderTop[0]); assert.equal(shaftBottom[0], shoulderBottom[0]); assert.equal(shoulderTop[0], shoulderBottom[0]);
  assert.ok(tailTop[0] < shaftTop[0] && tip[0] > shoulderTop[0]);
  assert.ok(shoulderTop[1] < shaftTop[1] && shoulderBottom[1] > shaftBottom[1]); assert.equal(tip[1], (shoulderTop[1] + shoulderBottom[1]) / 2);
  assert.equal(p.filter((a, i) => cross(a, p[(i + 1) % 7], p[(i + 2) % 7]) < 0).length, 2);
});

test('Function is one closed six-edge upward chevron strip with exactly one inward notch', () => {
  const polygon = notationBox(document, notationElement(CURRENT_METAMODEL, 'Function'), { width: 220, height: 90 }).querySelector('.function-glyph').firstElementChild;
  assert.equal(polygon.tagName, 'polygon'); const p = points(polygon); assert.equal(p.length, 6);
  const [leftShoulder, apex, rightShoulder, rightTip, notch, leftTip] = p;
  assert.equal(apex[0], notch[0]); assert.ok(apex[1] < notch[1]); assert.ok(notch[1] < leftTip[1]);
  assert.equal(leftShoulder[0], leftTip[0]); assert.equal(rightShoulder[0], rightTip[0]); assert.equal(leftShoulder[1], rightShoulder[1]); assert.equal(leftTip[1], rightTip[1]);
  assert.ok(leftShoulder[0] < apex[0] && apex[0] < rightShoulder[0]);
  assert.equal(p.filter((a, i) => cross(a, p[(i + 1) % 6], p[(i + 2) % 6]) < 0).length, 1);
});

test('Event is closed with parallel top/bottom, one left V notch and a smooth rounded outward right cap', () => {
  const path = notationBox(document, notationElement(CURRENT_METAMODEL, 'Event'), { width: 220, height: 90 }).querySelector('.event-glyph').firstElementChild;
  assert.equal(path.tagName, 'path'); const d = path.getAttribute('d'); assert.deepEqual(d.match(/[a-z]/gi), ['M', 'H', 'A', 'H', 'L', 'Z']);
  const [left, top, right, rx, ry, rotation, large, sweep, capX, bottom, bottomLeft, notchX, notchY] = numbers(d);
  assert.equal(capX, right); assert.equal(bottomLeft, left); assert.equal(rx, ry); assert.equal(bottom - top, 2 * ry); assert.equal(rotation, 0); assert.equal(large, 0); assert.equal(sweep, 1);
  assert.ok(left < notchX && notchX < right); assert.equal(notchY, (top + bottom) / 2);
});

test('Behavior badges reject foreign profiles, hostile type/token values and retain UNKNOWN fallback', () => {
  for (const reference of [null, {}, { ...CURRENT_METAMODEL, version: 999 }, { ...CURRENT_METAMODEL, version: String(CURRENT_METAMODEL.version) }, { id: '<svg>', version: CURRENT_METAMODEL.version }]) for (const type of types) {
    const appearance = notationElement(reference, type); assert.equal(appearance.notation, UNKNOWN_NOTATION); assert.equal(appearance.glyph, undefined);
    assert.equal(notationBox(document, appearance, { width: 120, height: 55 }).outerHTML, '<rect class="node-box" width="120" height="55" rx="0"></rect>');
  }
  for (const value of ['__proto__', 'constructor', '<svg onload=bad()>', 'url(https://invalid.test)', 'service', 'Process" onload="x', {}, { service: true }, ['service'], ['Service'], { toString: () => 'Service' }, new String('Service'), 1, true, null]) {
    assert.equal(notationElement(CURRENT_METAMODEL, value).notation, UNKNOWN_NOTATION);
    if (value !== 'service') assert.equal(notationBox(document, { glyph: value }, { width: 120, height: 55 }).tagName, 'rect');
  }
});

for (const type of types) test(`${type} preserves independent rounded-box routes, hits, anchors, loops, Fit and input bytes`, () => {
  const a = notationElement(CURRENT_METAMODEL, type);
  for (const [dx, dy] of [[300, 200], [-300, 200], [300, -200], [-300, -200], [30, 15]]) {
    const occurrences = [{ id: 'a', bounds: { x: 0, y: 0, width: 120, height: 55 } }, { id: 'b', bounds: { x: dx, y: dy, width: 220, height: 90 } }];
    const host = { id: 'host', source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints: [{ kind: 'anchor', id: 'corner', point: { x: 1, y: 1 } }, { kind: 'anchor', id: 'inside', point: { x: 30, y: 20 } }, { kind: 'bend', point: { x: 260, y: -60 } }], labelPosition: { x: 200, y: -90 } };
    const connections = [host, { id: 'reverse', source: host.target, target: host.source, routePoints: [] }, { id: 'loop', source: host.source, target: host.source, routePoints: [] }, { id: 'attached', source: host.target, target: { kind: 'connection', id: 'host', anchorId: 'corner' }, routePoints: [] }];
    const bytes = JSON.stringify({ occurrences, connections }), actual = () => a.contour || a.radius, baseline = () => 12;
    for (const stored of [false, true]) {
      for (const c of connections) assert.deepEqual(connectionGeometry(c, occurrences, actual, stored, connections), connectionGeometry(c, occurrences, baseline, stored, connections));
      assert.deepEqual(viewGeometryBounds(occurrences, connections, actual, stored), viewGeometryBounds(occurrences, connections, baseline, stored));
    }
    assert.equal(JSON.stringify({ occurrences, connections }), bytes);
  }
});

test('Four behavior source locators close only their default-form backlog entries and retain UNKNOWN boundaries', async () => {
  const { readFileSync } = await import('node:fs');
  const ledger = JSON.parse(readFileSync(new URL('../../docs/ARCHIMATE-COVERAGE.json', import.meta.url), 'utf8'));
  for (const [index, type] of types.entries()) {
    const row = ledger.rows.find(r => r.id === type), evidence = row.assertions.find(a => a.predicate === 'normative_boxed_behavior_notation');
    assert.equal(row.normative_assessment, 'UNKNOWN'); assert.equal(row.mapping.source_shape, 'RoundedRectangle'); assert.equal(row.mapping.implemented_shape, 'RoundedRectangle');
    assert.equal(evidence.evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
    assert.ok(evidence.evidence.locator.includes(`§4.2.${index + 1}, Figure 4-${index + 5}`)); assert.ok(evidence.evidence.locator.includes('Appendix A.1, printed 123 / PDF 141'));
    assert.ok(row.assertions.some(a => a.predicate === 'draft_notation' && a.evidence.status === 'independent_unofficial_draft'));
  }
  const gap = ledger.gaps.find(g => g.id === 'source_icon_equivalence'), inventory = gap.default_form_inventory;
  assert.equal(inventory.missing_distinguishing_glyphs.length, 0); assert.deepEqual(inventory.incomplete_icon_forms, []);
  for (const type of types) { assert.ok(inventory.bounded_boxed_forms.includes(type)); assert.ok(!inventory.missing_distinguishing_glyphs.includes(type)); }
  assert.ok(gap.needed.includes('Full support for the displayed boxed/icon repertoire remains a separate open standard-support gap'));
  assert.equal(ledger.verification_status.independent_persistence_acceptance, 'HOLD'); assert.equal(ledger.verification_status.windows_acceptance, 'UNRUN');
  assert.ok(ledger.verification_status.relationship_draft_policy.startsWith('IMPLEMENTED_LOCAL_PENDING_DESKTOP_ACCEPTANCE'));
});
