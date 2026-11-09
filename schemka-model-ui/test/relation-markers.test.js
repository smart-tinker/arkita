import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { MARKER_KINDS, MARKER_FIT_RADIUS, relationMarkerDefs, relationMarkerUrl } from '../src/relation-markers.js';
import { connectionGeometry, viewGeometryBounds } from '../src/connection-geometry.js';
import { notationDefs, notationLine } from '../src/notation.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const document = new JSDOM('<!doctype html>').window.document;
const kinds = ['open', 'hollow', 'closed', 'half', 'filled-diamond', 'hollow-diamond', 'dot'];
const catalog = ['Association', 'Realization', 'Flow', 'Composition', 'Aggregation', 'Assignment', 'Serving',
  'Access', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess', 'Influence', 'Triggering', 'Specialization', 'DirectedAssociation'];
const scopes = ['canvas', 'legend', ...catalog.map(type => `palette-${type.toLowerCase()}`)];
const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
const pointClose = (actual, expected) => { close(actual.x, expected.x); close(actual.y, expected.y); };
const numbers = text => text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
function points(text) {
  const values = numbers(text);
  assert.equal(values.length % 2, 0);
  assert.ok(values.every(Number.isFinite));
  return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
}
const markerFor = (kind, scope = 'canvas') => relationMarkerDefs(document, scope).querySelector(`#notation-${scope}-${kind}`);
const shapePoints = shape => shape.localName === 'circle'
  ? [{ x: Number(shape.getAttribute('cx')), y: Number(shape.getAttribute('cy')) }]
  : points(shape.getAttribute('d'));
const strokeRadius = shape => Number(shape.getAttribute('stroke-width')) / 2;
function inside(bounds, point, tolerance = 1e-7) {
  assert.ok(point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.width + tolerance,
    `x ${point.x} should be inside ${JSON.stringify(bounds)}`);
  assert.ok(point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.height + tolerance,
    `y ${point.y} should be inside ${JSON.stringify(bounds)}`);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Independent SVG transform oracle, not part of the production marker module.
// Equal viewport/viewBox dimensions make this a rotation around (refX, refY)
// followed by translation onto the unmodified connection endpoint.
function place(marker, point, endpoint, tangent, source = false) {
  const angle = Math.atan2(tangent.y, tangent.x) +
    (source && marker.getAttribute('orient') === 'auto-start-reverse' ? Math.PI : 0);
  const x = point.x - Number(marker.getAttribute('refX'));
  const y = point.y - Number(marker.getAttribute('refY'));
  return { x: endpoint.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: endpoint.y + x * Math.sin(angle) + y * Math.cos(angle) };
}
function terminals(geometry) {
  const route = points(geometry.d), source = route[0], target = route.at(-1);
  const afterSource = route.slice(1).find(point => point.x !== source.x || point.y !== source.y);
  const beforeTarget = route.slice(0, -1).reverse().find(point => point.x !== target.x || point.y !== target.y);
  assert.ok(afterSource && beforeTarget, 'Every tested route has nonzero endpoint tangents');
  return [
    { endpoint: source, tangent: { x: afterSource.x - source.x, y: afterSource.y - source.y }, source: true },
    { endpoint: target, tangent: { x: target.x - beforeTarget.x, y: target.y - beforeTarget.y }, source: false },
  ];
}

test('the seven original marker kinds are closed, frozen and generated as plain SVG DOM', () => {
  assert.deepEqual(MARKER_KINDS, kinds);
  assert.ok(Object.isFrozen(MARKER_KINDS));
  assert.throws(() => MARKER_KINDS.push('external'), TypeError);
  const defs = relationMarkerDefs(document);
  assert.equal(defs.localName, 'defs'); assert.equal(defs.children.length, 7);
  const allowed = {
    defs: [],
    marker: ['id', 'viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'overflow'],
    path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap'],
  };
  for (const node of [defs, ...defs.querySelectorAll('*')]) {
    assert.equal(node.namespaceURI, SVG_NS);
    assert.ok(Object.hasOwn(allowed, node.localName));
    for (const attribute of node.attributes) assert.ok(allowed[node.localName].includes(attribute.name), attribute.name);
    assert.equal(node.textContent, '');
  }
  assert.equal(defs.querySelectorAll('marker > path').length, 6);
  assert.equal(defs.querySelectorAll('marker > circle').length, 1);
  assert.doesNotMatch(defs.outerHTML, /(?:onload|onclick|href|style|script|foreignObject|data:|https?:\/\/[^w])/);
});

test('canvas, legend and all fifteen catalogue scopes have matching unique local fragment URLs', () => {
  const ids = new Set();
  for (const scope of scopes) {
    const defs = relationMarkerDefs(document, scope);
    for (const kind of kinds) {
      const id = `notation-${scope}-${kind}`;
      assert.equal(relationMarkerUrl(kind, scope), `url(#${id})`);
      assert.ok(defs.querySelector(`#${id}`));
      assert.ok(!ids.has(id)); ids.add(id);
    }
  }
  assert.equal(ids.size, 17 * 7);
  assert.equal(relationMarkerUrl('open'), 'url(#notation-canvas-open)');
});

test('notation adapters use the shared definitions and independent closed source/target marker fields', () => {
  for (const scope of scopes) {
    assert.equal(notationDefs(document, scope).outerHTML, relationMarkerDefs(document, scope).outerHTML);
    for (const source of [null, ...kinds]) for (const target of [null, ...kinds]) {
      const appearance = freeze({ startMarkerKind: source, markerKind: target, line: 'solid' });
      const line = notationLine(document, appearance, scope);
      assert.equal(line.namespaceURI, SVG_NS); assert.equal(line.localName, 'path');
      assert.equal(line.getAttribute('class'), 'line');
      assert.equal(line.getAttribute('marker-start'), source ? `url(#notation-${scope}-${source})` : null);
      assert.equal(line.getAttribute('marker-end'), target ? `url(#notation-${scope}-${target})` : null);
      assert.equal(line.getAttribute('stroke-dasharray'), null);
      assert.equal(line.attributes.length, 1 + Number(Boolean(source)) + Number(Boolean(target)));
    }
  }
  for (const [lineStyle, dash, cap] of [['solid', null, null], ['dashed', '7 5', null], ['dotted', '1 4', 'round']]) {
    const line = notationLine(document, { startMarkerKind: 'dot', markerKind: 'closed', line: lineStyle });
    assert.equal(line.getAttribute('marker-start'), 'url(#notation-canvas-dot)');
    assert.equal(line.getAttribute('marker-end'), 'url(#notation-canvas-closed)');
    assert.equal(line.getAttribute('stroke-dasharray'), dash); assert.equal(line.getAttribute('stroke-linecap'), cap);
  }
  const hostile = freeze({ startMarkerKind: 'url(https://bad.example)', markerKind: '__proto__',
    line: 'url(https://bad.example)', style: 'stroke:red', d: 'M0 0', 'marker-start': 'url(#external)',
    properties: { markerKind: 'closed' } });
  const line = notationLine(document, hostile, 'bad)" onload="alert(1)');
  assert.equal(line.outerHTML, '<path class="line"></path>');
});

test('unknown kinds produce no URL, and hostile or coercible scopes fall back without touching model data', () => {
  const hostile = freeze({ [Symbol.toPrimitive]() { throw new Error('No coercion of model data'); },
    markerKind: 'open', d: 'M0 0', fill: 'url(https://bad.example)', style: 'onload=alert(1)' });
  const unknown = [null, undefined, '', false, 7, '__proto__', 'constructor', 'toString', 'OPEN',
    'palette-Association', 'palette-unknown', 'url(https://bad.example)', 'canvas)" onload="alert(1)',
    '<svg><script/></svg>', ['open'], new String('open'), Symbol('open'), hostile];
  for (const kind of unknown) for (const scope of scopes) assert.equal(relationMarkerUrl(kind, scope), null);
  const safe = relationMarkerDefs(document).outerHTML;
  for (const scope of unknown) {
    assert.equal(relationMarkerDefs(document, scope).outerHTML, safe);
    for (const kind of kinds) assert.equal(relationMarkerUrl(kind, scope), `url(#notation-canvas-${kind})`);
  }
});

test('the marker viewport is padded, unscaled, round-stroked and tip-aligned, including the full dot circle', () => {
  const expected = {
    open: 'M0 -4 L10 0 L0 4', hollow: 'M0 -4 L10 0 L0 4 Z', closed: 'M0 -4 L10 0 L0 4 Z',
    half: 'M0 -4 L10 0', 'filled-diamond': 'M10 0 L5 -4 L0 0 L5 4 Z', 'hollow-diamond': 'M10 0 L5 -4 L0 0 L5 4 Z',
  };
  for (const kind of kinds) {
    const marker = markerFor(kind), shape = marker.firstElementChild;
    assert.equal(marker.getAttribute('viewBox'), '-3 -6 16 12');
    assert.equal(marker.getAttribute('markerWidth'), '16'); assert.equal(marker.getAttribute('markerHeight'), '12');
    assert.equal(marker.getAttribute('refX'), '10'); assert.equal(marker.getAttribute('refY'), '0');
    assert.equal(marker.getAttribute('markerUnits'), 'userSpaceOnUse');
    assert.equal(marker.getAttribute('orient'), 'auto-start-reverse');
    assert.equal(marker.getAttribute('overflow'), 'visible');
    assert.equal(shape.getAttribute('stroke'), 'var(--link)'); assert.equal(shape.getAttribute('stroke-width'), '1.5');
    assert.equal(shape.getAttribute('stroke-linecap'), 'round'); assert.equal(shape.getAttribute('stroke-linejoin'), 'round');
    const [x, y, width, height] = numbers(marker.getAttribute('viewBox'));
    const padding = strokeRadius(shape) + (kind === 'dot' ? Number(shape.getAttribute('r')) : 0);
    for (const point of shapePoints(shape)) for (const sx of [-1, 1]) for (const sy of [-1, 1])
      inside({ x, y, width, height }, { x: point.x + sx * padding, y: point.y + sy * padding });
    if (kind === 'dot') {
      assert.deepEqual(['cx', 'cy', 'r'].map(name => Number(shape.getAttribute(name))), [7, 0, 3]);
      close(Number(shape.getAttribute('cx')) + Number(shape.getAttribute('r')), 10);
    } else {
      assert.equal(shape.getAttribute('d'), expected[kind]);
      assert.ok(shapePoints(shape).some(point => point.x === 10 && point.y === 0));
    }
  }
});

test('filled and hollow markers use the canvas/link theme tokens in both light and dark themes', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const blocks = [css.match(/:root\s*\{([^}]+)\}/)[1], css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]];
  const themes = blocks.map(block => Object.fromEntries([...block.matchAll(/--(canvas|link):([^;]+);/g)].map(match => [match[1], match[2]])));
  assert.notEqual(themes[0].canvas, themes[1].canvas); assert.notEqual(themes[0].link, themes[1].link);
  const resolve = (value, theme) => value.replace(/var\(--(canvas|link)\)/g, (_, token) => theme[token]);
  for (const theme of themes) {
    assert.notEqual(theme.canvas, theme.link);
    for (const kind of kinds) {
      const shape = markerFor(kind).firstElementChild;
      assert.equal(resolve(shape.getAttribute('stroke'), theme), theme.link);
      const expected = ['hollow', 'hollow-diamond'].includes(kind) ? theme.canvas
        : ['closed', 'filled-diamond', 'dot'].includes(kind) ? theme.link : 'none';
      assert.equal(resolve(shape.getAttribute('fill'), theme), expected);
    }
  }
});

test('source reversal and target orientation place every tip exactly at its endpoint in every direction', () => {
  const endpoint = { x: 127, y: -89 };
  for (const kind of kinds) {
    const marker = markerFor(kind), shape = marker.firstElementChild;
    const body = kind === 'dot' ? { x: 7, y: 0 } : { x: 0, y: 0 };
    for (const tangent of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
      { x: 3, y: 4 }, { x: -3, y: 4 }, { x: -3, y: -4 }, { x: 3, y: -4 }]) for (const source of [false, true]) {
      pointClose(place(marker, { x: 10, y: 0 }, endpoint, tangent, source), endpoint);
      const actual = place(marker, body, endpoint, tangent, source), length = Math.hypot(tangent.x, tangent.y);
      const direction = source ? 1 : -1, distance = (10 - body.x) * direction;
      pointClose(actual, { x: endpoint.x + distance * tangent.x / length, y: endpoint.y + distance * tangent.y / length });
      // A circle's local right edge and each polygon/arrow tip use that same anchor.
      if (kind === 'dot') pointClose(place(marker, { x: Number(shape.getAttribute('cx')) + Number(shape.getAttribute('r')), y: 0 }, endpoint, tangent, source), endpoint);
    }
  }
});

test('marker ink has a strict twelve-unit rotation-independent bound about its anchored tip', () => {
  assert.equal(MARKER_FIT_RADIUS, 12);
  for (const kind of kinds) {
    const marker = markerFor(kind), shape = marker.firstElementChild;
    const extra = strokeRadius(shape) + (kind === 'dot' ? Number(shape.getAttribute('r')) : 0);
    const maximum = Math.max(...shapePoints(shape).map(point => Math.hypot(point.x - 10, point.y))) + extra;
    assert.ok(maximum < MARKER_FIT_RADIUS, `${kind}: ${maximum} < ${MARKER_FIT_RADIUS}`);
    // Straight edges and filled polygons stay in their vertex convex hull;
    // round joins/caps add a 0.75-radius disk. Circle support is exact above.
    for (let degrees = 0; degrees < 360; degrees += 5) for (const source of [false, true]) {
      const angle = degrees * Math.PI / 180, tangent = { x: Math.cos(angle), y: Math.sin(angle) };
      for (const point of shapePoints(shape)) {
        const transformed = place(marker, point, { x: 0, y: 0 }, tangent, source);
        assert.ok(Math.hypot(transformed.x, transformed.y) + extra < MARKER_FIT_RADIUS);
      }
    }
  }
});

const occurrence = (id, x, y, width = 120, height = 60) => ({ id, bounds: { x, y, width, height } });
const relation = (sourceId = 'a', targetId = 'b', points = []) =>
  ({ source: { kind: 'occurrence', id: sourceId }, target: { kind: 'occurrence', id: targetId }, routePoints: points.map(point => ({ kind: 'bend', point })), labelPosition: null });
const contours = [0, 8, 12, 'box3d', 'octagon', 'ellipse', 'folder', 'cloud', 'wavy'];

test('both-direction automatic and manual routes keep endpoint ownership with source and target markers', () => {
  for (const contour of contours) for (const [x, y] of [[400, 200], [-400, 200], [-400, -200], [400, -200]]) {
    const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', x, y)]);
    for (const manual of [false, true]) {
      const bends = [{ x: x / 2 + 60, y: 30 }, { x: x / 2 + 60, y: y + 30 }];
      const forward = freeze(relation('a', 'b', bends)), backward = freeze(relation('b', 'a', [...bends].reverse()));
      const a = connectionGeometry(forward, occurrences, () => contour, manual);
      const b = connectionGeometry(backward, occurrences, () => contour, manual);
      const routeA = points(a.d), routeB = points(b.d).reverse();
      assert.equal(routeA.length, routeB.length);
      routeA.forEach((point, index) => pointClose(point, routeB[index]));
      for (const geometry of [a, b]) for (const terminal of terminals(geometry)) for (const kind of kinds) {
        const marker = markerFor(kind);
        pointClose(place(marker, { x: 10, y: 0 }, terminal.endpoint, terminal.tangent, terminal.source), terminal.endpoint);
      }
    }
  }
});

test('existing Fit contains all rotated marker ink for automatic, manual, loop, overlap and short contour routes', () => {
  const fixtures = [
    { name: 'automatic', occurrences: [occurrence('a', 0, 0), occurrence('b', 400, 220)], connection: relation() },
    { name: 'manual', occurrences: [occurrence('a', 0, 0), occurrence('b', 400, 220)], connection: relation('a', 'b', [{ x: 180, y: 30 }, { x: 180, y: 250 }]), manual: true },
    { name: 'automatic self-loop', occurrences: [occurrence('a', 0, 0)], connection: relation('a', 'a') },
    { name: 'manual self-loop', occurrences: [occurrence('a', 0, 0)], connection: relation('a', 'a', [{ x: 200, y: 30 }, { x: 200, y: -80 }, { x: 60, y: -80 }]), manual: true },
    { name: 'overlap', occurrences: [occurrence('a', 0, 0), occurrence('b', 35, 10)], connection: relation() },
    { name: 'short line', occurrences: [occurrence('a', 0, 0), occurrence('b', 120.25, 0)], connection: relation() },
    { name: 'short manual', occurrences: [occurrence('a', 0, 0), occurrence('b', 120.25, 0)], connection: relation('a', 'b', [{ x: 120.125, y: 30 }]), manual: true },
  ];
  for (const [width, height] of [[.1, .1], [.1, 40], [40, .1], [2000, 1000]]) fixtures.push({
    name: `self-loop ${width} by ${height}`, occurrences: [occurrence('a', -999000, 999000, width, height)], connection: relation('a', 'a'),
  });
  for (const fixture of fixtures) for (const contour of contours) for (const reverse of [false, true]) {
    const connection = reverse ? { ...fixture.connection, source: fixture.connection.target,
      target: fixture.connection.source, routePoints: [...fixture.connection.routePoints].reverse()} : fixture.connection;
    freeze(connection); freeze(fixture.occurrences);
    const before = JSON.stringify([connection, fixture.occurrences]);
    const geometry = connectionGeometry(connection, fixture.occurrences, () => contour, fixture.manual);
    const fit = viewGeometryBounds(fixture.occurrences, [connection], () => contour, fixture.manual);
    for (const terminal of terminals(geometry)) {
      const endpoint = terminal.endpoint;
      const margin = Math.min(endpoint.x - fit.x, fit.x + fit.width - endpoint.x,
        endpoint.y - fit.y, fit.y + fit.height - endpoint.y);
      assert.ok(margin >= 70 - 1e-7, `${fixture.name}/${contour}: Fit margin ${margin}`);
      assert.ok(margin > MARKER_FIT_RADIUS);
      for (const kind of kinds) {
        const marker = markerFor(kind), shape = marker.firstElementChild;
        const extra = strokeRadius(shape) + (kind === 'dot' ? Number(shape.getAttribute('r')) : 0);
        for (const point of shapePoints(shape)) {
          const world = place(marker, point, endpoint, terminal.tangent, terminal.source);
          // Bounding every expanded vertex bounds the whole path/fill/round
          // stroke; for the dot this is its exact world-space ink box.
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) inside(fit, { x: world.x + sx * extra, y: world.y + sy * extra });
        }
      }
    }
    assert.equal(JSON.stringify([connection, fixture.occurrences]), before);
    assert.deepEqual(connectionGeometry(connection, fixture.occurrences, () => contour, fixture.manual), geometry);
  }
});

test('very short connections retain their endpoints and full-size overlapping markers without rescaling', () => {
  const occurrences = freeze([occurrence('a', 0, 0), occurrence('b', 120.25, 0)]), connection = freeze(relation());
  const geometry = connectionGeometry(connection, occurrences);
  assert.equal(geometry.d, 'M 120 30 L 120.25 30');
  const [source, target] = terminals(geometry), marker = markerFor('filled-diamond');
  const sourceRear = place(marker, { x: 0, y: 0 }, source.endpoint, source.tangent, true);
  const targetRear = place(marker, { x: 0, y: 0 }, target.endpoint, target.tangent);
  close(sourceRear.x - source.endpoint.x, 10); close(target.endpoint.x - targetRear.x, 10);
  assert.ok(sourceRear.x > target.endpoint.x && targetRear.x < source.endpoint.x, 'Overlap is intentional on a sub-marker-length connection');
  assert.deepEqual(connectionGeometry(connection, occurrences), geometry);
  assert.equal(marker.getAttribute('markerWidth'), '16'); assert.equal(marker.getAttribute('markerHeight'), '12');
});

test('shared definition and notation-line creation do not mutate a connection or its independent hit path', () => {
  const svg = document.createElementNS(SVG_NS, 'svg'), group = document.createElementNS(SVG_NS, 'g');
  const hit = document.createElementNS(SVG_NS, 'path');
  const geometry = connectionGeometry(relation(), [occurrence('a', 0, 0), occurrence('b', 300, 0)]);
  group.setAttribute('class', 'connection'); hit.setAttribute('class', 'hit');
  hit.setAttribute('d', geometry.d); group.append(hit); svg.append(group);
  const before = hit.outerHTML;
  svg.prepend(notationDefs(document));
  for (const sourceKind of kinds) for (const targetKind of kinds) {
    const visible = notationLine(document, { startMarkerKind: sourceKind, markerKind: targetKind, line: 'solid' });
    visible.setAttribute('d', geometry.d); group.append(visible);
    assert.equal(hit.outerHTML, before);
    assert.equal(visible.getAttribute('d'), hit.getAttribute('d'));
    assert.equal(hit.hasAttribute('marker-start'), false); assert.equal(hit.hasAttribute('marker-end'), false);
    assert.equal(visible.getAttribute('marker-start'), relationMarkerUrl(sourceKind));
    assert.equal(visible.getAttribute('marker-end'), relationMarkerUrl(targetKind));
    visible.remove();
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.connection \.hit\s*\{[^}]*stroke:transparent;[^}]*stroke-width:18;[^}]*pointer-events:stroke;/);
});
