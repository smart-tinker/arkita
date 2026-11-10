import { assertGlyphCaptionClearance } from './glyph-caption-assertions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { NOTATION_ELEMENTS, UNKNOWN_NOTATION, notationElement, notationBox } from '../src/notation.js';
import { connectionGeometry, viewGeometryBounds, contourPoint } from '../src/connection-geometry.js';

const document = new JSDOM('').window.document, types = ['Role', 'Collaboration', 'Path', 'Location', 'BusinessActor'];
const numbers = text => text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
const points = node => node.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number));
const attrs = (node, keys) => keys.split(' ').map(k => Number(node.getAttribute(k)));
const glyphFor = type => notationBox(document, notationElement(CURRENT_METAMODEL, type), { width: 220, height: 90 }).lastElementChild;

for (const type of types) test(`${type} alone has its closed structure token and bounded square-box decoration over 72 sizes`, () => {
  const appearance = Object.freeze(notationElement(CURRENT_METAMODEL, type)), token = type.toLowerCase(), original = JSON.stringify(appearance);
  assert.deepEqual(NOTATION_ELEMENTS.filter(t => notationElement(CURRENT_METAMODEL, t).glyph === token), [type]);
  assert.equal(appearance.glyph, token); assert.equal(appearance.radius, 0); assert.equal(appearance.family, type === 'BusinessActor' ? 'business' : 'common');
  assert.equal(appearance.badge, type === 'BusinessActor' ? 'Business Actor' : type);
  assert.equal(appearance.className, `node notation-draft notation-${appearance.family}${type === 'Location' ? ' notation-extended' : ''}`);
  assert.equal(appearance.contour, undefined); assert.equal(appearance.banded, undefined); assert.equal(appearance.tabbed, undefined);
  for (const width of [.1, 1, 20, 38, 40, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 24, 28, 55, 90, 1000000]) {
    const bounds = Object.freeze({ x: 900000, y: -900000, width, height }), shape = notationBox(document, appearance, bounds), box = shape.querySelector('.node-box'), glyph = shape.lastElementChild;
    assert.equal(shape.children.length, 2); assert.equal(shape.querySelectorAll('.node-box').length, 1); assert.equal(box.tagName, 'rect');
    assert.deepEqual([...box.attributes].map(a => [a.name, a.value]), [['class', 'node-box'], ['width', String(width)], ['height', String(height)], ['rx', '0']]);
    assert.equal(glyph.getAttribute('class'), `${token}-glyph`); assert.equal(glyph.children.length, { Role: 2, Collaboration: 2, Path: 4, Location: 1, BusinessActor: 4 }[type]);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(shape.querySelectorAll('image,use,script,foreignObject,a,marker,defs').length, 0);
    for (const child of glyph.children) {
      assert.equal(child.getAttribute('class'), 'node-detail'); assert.equal(child.hasAttribute('vector-effect'), false);
      assert.equal(child.hasAttribute('fill'), false, 'Use the existing shared fill:none treatment without masking inner arcs');
      if (['path', 'polyline'].includes(child.tagName)) assert.equal(child.getAttribute('stroke-linejoin'), 'round');
    }
    assert.match(glyph.getAttribute('transform'), /^translate\([^)]+\) scale\([^ ,)]+\)$/u);
    const [x, y, scale] = numbers(glyph.getAttribute('transform'));
    assert.ok([x, y, scale].every(Number.isFinite) && scale > 0 && scale <= 1.5);
    // All primitives and their control hulls lie in [1,17] x [1,8]. Curves, butt caps and round joins
    // expand by at most half the unchanged 1.25 stroke; the separate topology tests check this hull.
    for (const px of [.375, 17.625]) for (const py of [.375, 8.625]) {
      assert.ok(x + px * scale >= 0 && x + px * scale <= width);
      assert.ok(y + py * scale >= 0 && y + py * scale <= height);
    }
    assert.equal(glyph.innerHTML, glyphFor(type).innerHTML, 'Only the one uniform transform varies');
    assertGlyphCaptionClearance(appearance, bounds, { left: x + .375 * scale, right: x + 17.625 * scale, top: y + .375 * scale, bottom: y + 8.625 * scale });
  }
  assert.equal(JSON.stringify(appearance), original);
});

test('Role is a horizontal barrel with exactly one complete front ellipse and one rounded back boundary', () => {
  const g = glyphFor('Role'), [back, front] = g.children;
  assert.equal(back.tagName, 'path'); assert.equal(front.tagName, 'ellipse');
  assert.deepEqual(back.getAttribute('d').match(/[a-z]/gi), ['M', 'H', 'A', 'H']);
  const [frontX, top, backX, rx, ry, rotation, large, sweep, bottomX, bottom, bottomFront] = numbers(back.getAttribute('d'));
  const [cx, cy, faceRX, faceRY] = attrs(front, 'cx cy rx ry');
  assert.equal(frontX, cx); assert.equal(bottomFront, cx); assert.equal(top, cy - faceRY); assert.equal(bottom, cy + faceRY);
  assert.equal(backX, bottomX); assert.equal(rx, faceRX); assert.equal(ry, faceRY); assert.ok(cx > backX && cx - backX > 2 * faceRX);
  assert.deepEqual([rotation, large, sweep], [0, 0, 0]); assert.ok(backX - rx >= 1 && cx + faceRX <= 17 && top >= 1 && bottom <= 8);
  assert.equal(g.querySelectorAll('ellipse').length, 1, 'No second complete rear ellipse or coincident front arc');
});

test('Collaboration keeps two complete equal overlapping circles and a visible unmasked lens', () => {
  const g = glyphFor('Collaboration'); assert.ok([...g.children].every(n => n.tagName === 'circle'));
  const [a, b] = [...g.children].map(n => attrs(n, 'cx cy r')), separation = b[0] - a[0];
  assert.equal(a[1], b[1]); assert.equal(a[2], b[2]); assert.ok(separation > 0 && separation < 2 * a[2]);
  const lensWidth = 2 * a[2] - separation, crossings = Math.sqrt(a[2] ** 2 - (separation / 2) ** 2);
  assert.ok(lensWidth > 1.25 && crossings > 0, 'Stroke-aware gap and two distinct outline crossings');
  for (const [cx, cy, r] of [a, b]) assert.ok(cx - r >= 1 && cx + r <= 17 && cy - r >= 1 && cy + r <= 8);
  for (const n of g.children) assert.equal(n.hasAttribute('fill'), false);
  assert.equal(g.querySelectorAll('path,clipPath,mask,use').length, 0);
});

test('Path has two opposite open chevrons and exactly two cap-separated detached central dashes', () => {
  const g = glyphFor('Path'), chevrons = [...g.querySelectorAll('polyline')].map(points), lines = [...g.querySelectorAll('line')];
  assert.equal(chevrons.length, 2); assert.equal(lines.length, 2); assert.equal(g.children.length, 4);
  const [left, right] = chevrons;
  for (const [i, p] of chevrons.entries()) {
    assert.equal(p.length, 3); assert.equal(p[0][0], p[2][0]); assert.ok(p[0][1] < p[1][1] && p[1][1] < p[2][1]);
    assert.equal(p[1][1], (p[0][1] + p[2][1]) / 2); assert.ok(i ? p[1][0] > p[0][0] : p[1][0] < p[0][0]);
    assert.ok(p.every(([x, y]) => x >= 1 && x <= 17 && y >= 1 && y <= 8));
  }
  const [a, b] = lines.map(n => attrs(n, 'x1 y1 x2 y2'));
  assert.equal(a[1], a[3]); assert.equal(b[1], b[3]); assert.equal(a[1], b[1]); assert.equal(a[1], left[1][1]);
  assert.ok(a[0] < a[2] && a[2] < b[0] && b[0] < b[2]); assert.equal(a[2] - a[0], b[2] - b[0]); assert.ok(a[2] - a[0] >= 2 * 1.25, 'Short horizontal strokes retain a dash aspect ratio');
  assert.ok(a[0] - left[0][0] > 1.25 && right[0][0] - b[2] > 1.25 && b[0] - a[2] > 1.25, 'Positive gaps even under conservative half-stroke cap expansion');
  for (const n of lines) assert.equal(n.getAttribute('stroke-linecap'), 'butt');
  assert.equal(g.querySelectorAll('path,polygon').length, 0, 'No closed or filled arrowheads and no connecting shaft');
});

test('Location is one closed rounded-top downward teardrop without an inner hole, dot or stem', () => {
  const g = glyphFor('Location'), p = g.firstElementChild; assert.equal(g.children.length, 1); assert.equal(p.tagName, 'path');
  assert.deepEqual(p.getAttribute('d').match(/[a-z]/gi), ['M', 'C', 'A', 'C', 'Z']);
  const [tipX, tipY, c1x, c1y, c2x, c2y, left, shoulderY, rx, ry, rotation, large, sweep, right, otherY, c3x, c3y, c4x, c4y, endX, endY] = numbers(p.getAttribute('d'));
  assert.equal(tipX, endX); assert.equal(tipY, endY); assert.equal(tipX, (left + right) / 2); assert.equal(shoulderY, otherY);
  assert.deepEqual([rotation, large, sweep], [0, 0, 1]); assert.equal(right - left, 2 * rx); assert.ok(rx > 0 && ry > 0);
  assert.ok(shoulderY - ry >= 1 && tipY <= 8 && tipY > Math.max(c1y, c2y, c3y, c4y, shoulderY));
  assert.ok(left >= 1 && right <= 17 && [c1x, c2x, c3x, c4x].every(x => x >= left && x <= right));
  assert.equal(c1x + c4x, 2 * tipX); assert.equal(c2x + c3x, 2 * tipX); assert.equal(c1y, c4y); assert.equal(c2y, c3y);
});

test('BusinessActor has an outlined head, tangent torso, horizontal arms and two connected diagonal legs', () => {
  const g = glyphFor('BusinessActor'); assert.deepEqual([...g.children].map(n => n.tagName), ['circle', 'line', 'line', 'polyline']);
  const [head, torso, arms, legs] = g.children, [cx, cy, r] = attrs(head, 'cx cy r'), [x1, y1, x2, y2] = attrs(torso, 'x1 y1 x2 y2'), [ax, ay, bx, by] = attrs(arms, 'x1 y1 x2 y2'), [left, fork, right] = points(legs);
  assert.ok(r > 0 && cy - r >= 1); assert.equal(x1, cx); assert.equal(x2, cx); assert.equal(y1, cy + r); assert.ok(y2 > y1);
  assert.equal(ay, by); assert.ok(ax < cx && bx > cx && ay > y1 && ay < y2);
  assert.deepEqual(fork, [cx, y2]); assert.ok(left[0] < cx && right[0] > cx && left[1] > y2); assert.equal(left[1], right[1]);
  assert.equal(cx - left[0], right[0] - cx); assert.ok(ax >= 1 && bx <= 17 && left[1] <= 8);
});

test('Structure symbols reject hostile types, tokens and references without active markup', () => {
  for (const reference of [null, {}, { ...CURRENT_METAMODEL, version: 999 }, { ...CURRENT_METAMODEL, version: String(CURRENT_METAMODEL.version) }, { id: '<svg>', version: CURRENT_METAMODEL.version }, { ...CURRENT_METAMODEL, svg: '<svg/>' }]) for (const type of types) {
    const a = notationElement(reference, type); assert.equal(a.notation, UNKNOWN_NOTATION); assert.equal(a.glyph, undefined);
    assert.equal(notationBox(document, a, { width: 120, height: 55 }).outerHTML, '<rect class="node-box" width="120" height="55" rx="0"></rect>');
  }
  for (const type of types) for (const value of [type.toLowerCase(), '__proto__', 'constructor', '<svg onload=bad()>', 'url(https://invalid.test)', `${type}" onload="bad`, {}, [type], [type.toLowerCase()], { toString: () => type }, new String(type), 1, true, null]) {
    assert.equal(notationElement(CURRENT_METAMODEL, value).notation, UNKNOWN_NOTATION);
    if (value !== type.toLowerCase()) assert.equal(notationBox(document, { glyph: value }, { width: 120, height: 55 }).tagName, 'rect');
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.node \.node-detail[^}]*fill:none; stroke:var\(--notation-border\); stroke-width:1\.25; pointer-events:none/);
  for (const state of ['.selected', ':focus-visible', '.dragging']) {
    assert.ok(css.includes(`.node.notation-draft${state} .node-detail`)); assert.ok(css.includes(`.node.notation-extended${state} .node-detail`));
  }
});

for (const type of types) test(`${type} preserves rectangle intersections, routes, anchors, self-loops, Fit and bytes`, () => {
  const a = notationElement(CURRENT_METAMODEL, type);
  for (const [width, height] of [[.1, .1], [1, 1000000], [1000000, 1], [38, 20], [120, 55], [220, 90]]) for (const [dx, dy] of [[300, 200], [-300, 200], [300, -200], [-300, -200], [30, 15]]) {
    const occurrences = [{ id: 'a', bounds: { x: 0, y: 0, width, height } }, { id: 'b', bounds: { x: dx, y: dy, width: 220, height: 90 } }];
    const host = { id: 'host', source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints: [{ kind: 'anchor', id: 'inside', point: { x: width / 2, y: height / 2 } }, { kind: 'anchor', id: 'outside', point: { x: -100, y: -100 } }, { kind: 'bend', point: { x: 260, y: -60 } }], labelPosition: { x: 200, y: -90 } };
    const connections = [host, { id: 'auto', source: host.source, target: host.target, routePoints: [] }, { id: 'reverse', source: host.target, target: host.source, routePoints: [] }, { id: 'loop', source: host.source, target: host.source, routePoints: [] }, { id: 'attached', source: host.target, target: { kind: 'connection', id: 'host', anchorId: 'outside' }, routePoints: [] }];
    const bytes = JSON.stringify({ occurrences, connections }), actual = () => a.contour || a.radius, baseline = () => 0;
    for (const stored of [false, true]) {
      for (const c of connections) assert.deepEqual(connectionGeometry(c, occurrences, actual, stored, connections), connectionGeometry(c, occurrences, baseline, stored, connections));
      assert.deepEqual(viewGeometryBounds(occurrences, connections, actual, stored), viewGeometryBounds(occurrences, connections, baseline, stored));
    }
    for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const f = Math.min(x ? width / 2 / Math.abs(x) : Infinity, y ? height / 2 / Math.abs(y) : Infinity);
      assert.deepEqual(contourPoint(occurrences[0].bounds, { x, y }, actual()), { x: width / 2 + f * x, y: height / 2 + f * y });
    }
    assert.equal(JSON.stringify({ occurrences, connections }), bytes);
  }
});

test('Five structure source locators close only the default entries while alternatives and UNKNOWN gates remain open', () => {
  const ledger = JSON.parse(readFileSync(new URL('../../docs/ARCHIMATE-COVERAGE.json', import.meta.url), 'utf8'));
  for (const [type, figure, printed, pdf] of [['Role', '4-2', 19, 37], ['Collaboration', '4-3', 19, 37], ['Path', '4-4', 20, 38], ['Location', '4-11', 27, 45], ['BusinessActor', '8-2', 74, 92]]) {
    const row = ledger.rows.find(r => r.id === type), evidence = row.assertions.find(a => a.predicate === 'normative_boxed_structure_notation');
    assert.equal(row.normative_assessment, 'UNKNOWN'); assert.equal(row.mapping.source_shape, 'Rectangle'); assert.equal(row.mapping.implemented_shape, 'Rectangle');
    assert.equal(evidence.evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
    assert.ok(evidence.evidence.locator.includes(`Figure ${figure}, printed ${printed} / PDF ${pdf}`)); assert.ok(evidence.evidence.locator.includes('Appendix A.1, printed 123 / PDF 141'));
    assert.ok(row.assertions.some(a => a.predicate === 'draft_notation' && a.evidence.status === 'independent_unofficial_draft'));
  }
  const gap = ledger.gaps.find(g => g.id === 'source_icon_equivalence'), inventory = gap.default_form_inventory;
  assert.equal(inventory.missing_distinguishing_glyphs.length, 0); assert.deepEqual(inventory.incomplete_icon_forms, []);
  for (const type of types) { assert.ok(inventory.bounded_boxed_forms.includes(type)); assert.ok(!inventory.missing_distinguishing_glyphs.includes(type)); }
  assert.ok(gap.needed.includes('Full support for the displayed boxed/icon repertoire remains a separate open standard-support gap'));
  assert.equal(ledger.verification_status.independent_persistence_acceptance, 'HOLD'); assert.equal(ledger.verification_status.windows_acceptance, 'UNRUN');
  assert.ok(ledger.verification_status.relationship_draft_policy.startsWith('IMPLEMENTED_LOCAL_PENDING_DESKTOP_ACCEPTANCE'));
});
