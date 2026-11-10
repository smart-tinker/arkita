import { assertGlyphCaptionClearance } from './glyph-caption-assertions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DRAFT_NOTATION, UNKNOWN_NOTATION, NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, notationElement, notationRelationship, notationJunction, notationDefs, notationLine, notationBox, renderNotationLegend, renderNotationPalette, installNotationUI, cornerGlyphLayout } from '../src/notation.js';
import { connectionGeometry, contourPoint, viewGeometryBounds } from '../src/connection-geometry.js';
import { box3dGeometry, nodeContourGeometry } from '../src/node-shapes.js';
import { createController } from '../src/controller.js';
import { createDemo } from '../src/demo.js';
import { createProjectSession } from '../src/project-session.js';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
const ref = CURRENT_METAMODEL;
const document = new JSDOM('<div id="notation-legend-items"></div>').window.document;

test('versioned visual adapter distinguishes all forty-two labelled types without changing profile membership', () => {
  assert.equal(NOTATION_ELEMENTS.length, 42); assert.equal(NOTATION_RELATIONSHIPS.length, 15);
  for (const type of NOTATION_ELEMENTS) {
    const value = notationElement(ref, type);
    assert.equal(value.notation, DRAFT_NOTATION); assert.equal(value.badge.replaceAll(' ', '').toLowerCase(), type.toLowerCase());
    assert.equal(value.radius, ['Service', 'Process', 'Function', 'Event', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage'].includes(type) ? 12 : 0);
    assert.equal(value.family, ['Node', 'Device', 'SystemSoftware', 'CommunicationNetwork', 'TechnologyInterface', 'Equipment', 'Facility', 'DistributionNetwork', 'Artifact', 'Material'].includes(type) ? 'technology' : ['ApplicationComponent', 'ApplicationInterface', 'DataObject'].includes(type) ? 'application' : ['BusinessActor', 'BusinessInterface', 'BusinessObject', 'Product'].includes(type) ? 'business' : ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Meaning', 'Value'].includes(type) ? 'motivation' : ['Resource', 'Capability', 'ValueStream', 'CourseOfAction'].includes(type) ? 'strategy' : ['WorkPackage', 'Deliverable', 'Plateau'].includes(type) ? 'implementation' : 'common');
  }

});

const relationshipStyles = {
  Association: ['solid', null, null], Realization: ['dotted', null, 'hollow'], Flow: ['dashed', null, 'closed'],
  Composition: ['solid', 'filled-diamond', null], Aggregation: ['solid', 'hollow-diamond', null], Assignment: ['solid', 'dot', 'closed'],
  Serving: ['solid', null, 'open'], Access: ['dotted', null, null], ReadAccess: ['dotted', 'open', null],
  WriteAccess: ['dotted', null, 'open'], ReadWriteAccess: ['dotted', 'open', 'open'], Influence: ['dashed', null, 'open'],
  Triggering: ['solid', null, 'closed'], Specialization: ['solid', null, 'hollow'], DirectedAssociation: ['solid', null, 'half'],
};
const dash = line => line === 'dotted' ? '1 4' : line === 'dashed' ? '7 5' : null;
test('visual v2 maps eleven base relations and four UI variants to the exact source/end/pattern facts', () => {
  assert.equal(DRAFT_NOTATION, 'schemka-am4-draft-visual@2');
  assert.deepEqual(NOTATION_RELATIONSHIPS, Object.keys(relationshipStyles));
  for (const [type, expected] of Object.entries(relationshipStyles)) {
    const appearance = notationRelationship(ref, type);
    assert.deepEqual([appearance.line, appearance.startMarkerKind, appearance.markerKind], expected);
    const line = notationLine(document, appearance);
    assert.equal(line.getAttribute('stroke-dasharray'), dash(expected[0]));
    assert.equal(line.getAttribute('stroke-linecap'), expected[0] === 'dotted' ? 'round' : null);
    assert.equal(line.getAttribute('marker-start'), expected[1] ? `url(#notation-canvas-${expected[1]})` : null);
    assert.equal(line.getAttribute('marker-end'), expected[2] ? `url(#notation-canvas-${expected[2]})` : null);
  }

});

test('unknown profile/version/type and hostile descriptor fields stay safe and never opt into draft geometry', () => {
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, id: 'evil' }, { ...ref, version: '2' }]) {
    assert.match(notationElement(reference, 'Service').className, /unknown-type/);
    assert.equal(notationRelationship(reference, 'Flow').markerKind, null);
  }
  for (const type of ['__proto__', 'constructor', '<svg onload=alert(1)>', 'url(https://bad.example/a)']) {
    const box = notationElement(ref, type), line = notationRelationship(ref, type);
    assert.equal(box.notation, UNKNOWN_NOTATION); assert.equal(line.notation, UNKNOWN_NOTATION);
    assert.equal(line.markerKind, null); assert.doesNotMatch(JSON.stringify([box, line]), /onload|https:|__proto__/);
  }
  const fake = notationLine(document, { markerKind: 'url(https://bad)', line: 'url(https://bad)', style: 'url(https://bad)' }, 'bad');
  assert.equal(fake.getAttribute('marker-end'), null); assert.equal(fake.attributes.length, 1);
  const safe = notationElement({ ...ref, svg: '<script/>', style: 'url(https://bad)' }, 'Node');
  assert.equal(safe.notation, UNKNOWN_NOTATION); assert.equal(safe.glyph, undefined);
  const fallback = notationBox(document, safe, { width: 1, height: 1 });
  assert.equal(fallback.tagName, 'rect'); assert.equal(fallback.getAttribute('rx'), '0'); assert.equal(fallback.querySelector('.node-glyph'), null);
});

test('known junctions retain distinct typed glyphs and unsupported junctions never masquerade as AND or OR', () => {
  for (const [type, className] of [['AndJunction', 'junction-and'], ['OrJunction', 'junction-or']]) {
    const value = notationJunction(ref, type);
    assert.equal(value.notation, DRAFT_NOTATION); assert.equal(value.contour, 'circle'); assert.equal(value.badge, type);
    assert.ok(value.className.split(' ').includes(className)); assert.equal(value.family, 'junctions');
  }
  for (const [reference, type] of [[ref, 'FutureJunction'], [ref, '__proto__'], [ref, '<svg/>'], [null, 'AndJunction'], [{ ...ref, version: 999 }, 'OrJunction']]) {
    const value = notationJunction(reference, type);
    assert.equal(value.notation, UNKNOWN_NOTATION); assert.equal(value.className, 'node junction unknown-type');
    assert.equal(value.family, 'unknown'); assert.match(value.badge, /^\? · неизвестный/);
    assert.doesNotMatch(JSON.stringify(value), /FutureJunction|__proto__|<svg/);
  }
});

test('unsupported profiles and types use conspicuous marker-free fallbacks for every primitive', () => {
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, id: 'foreign' }, { ...ref, version: '2' }]) {
    for (const type of NOTATION_ELEMENTS) {
      const value = notationElement(reference, type);
      assert.equal(value.notation, UNKNOWN_NOTATION); assert.equal(value.className, 'node unknown-type');
      assert.equal(value.family, 'unknown'); assert.match(value.badge, /^\? · неизвестный/);
      assert.equal(value.radius, 0); assert.equal(value.contour, undefined); assert.equal(value.glyph, undefined); assert.equal(value.banded, undefined); assert.equal(value.tabbed, undefined);
    }
    for (const type of NOTATION_RELATIONSHIPS) {
      const value = notationRelationship(reference, type);
      assert.equal(value.notation, UNKNOWN_NOTATION); assert.equal(value.className, 'connection unknown-type');
      assert.match(value.badge, /^\? · неизвестное/); assert.equal(value.startMarkerKind, null); assert.equal(value.markerKind, null);
      const line = notationLine(document, value);
      assert.equal(line.getAttribute('marker-start'), null); assert.equal(line.getAttribute('marker-end'), null);
    }
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.unknown-type \.node-box,\.unknown-type \.line \{ stroke-dasharray:5 4; \}/);
  assert.match(css, /\.junction\.unknown-type \.node-box \{ fill: var\(--surface\); \}/);
});

test('legend uses exact canvas mappings, forty-two labels and fifteen relation entries; marker geometry is local and padded', () => {
  renderNotationLegend(document);
  for (const type of NOTATION_ELEMENTS) {
    const group = document.querySelector(`[data-legend-type="${type}"]`), appearance = notationElement(ref, type);
    assert.equal(group.getAttribute('class'), appearance.className);
    assert.equal(group.querySelector('.node-box').getAttribute('rx'), appearance.contour === 'ellipse' ? '84.5' : appearance.contour ? null : String(appearance.radius));
    assert.equal(group.querySelector('text').textContent, appearance.badge);
  }
  for (const type of NOTATION_RELATIONSHIPS) {
    const group = document.querySelector(`[data-legend-type="${type}"]`), appearance = notationRelationship(ref, type);
    assert.equal(group.getAttribute('class'), appearance.className);
    assert.equal(group.querySelector('path').getAttribute('stroke-dasharray'), dash(appearance.line));
    assert.equal(group.querySelector('path').getAttribute('marker-start'), appearance.startMarkerKind ? `url(#notation-legend-${appearance.startMarkerKind})` : null);
    assert.equal(group.querySelector('path').getAttribute('marker-end'), appearance.markerKind ? `url(#notation-legend-${appearance.markerKind})` : null);
  }
  const defs = notationDefs(document);
  assert.equal(defs.children.length, 7);
  for (const marker of defs.children) {
    assert.equal(marker.getAttribute('viewBox'), '-3 -6 16 12');
    assert.equal(marker.getAttribute('orient'), 'auto-start-reverse');
    assert.equal(marker.getAttribute('refX'), '10');
    assert.equal(marker.getAttribute('overflow'), 'visible');
    assert.equal(marker.getAttribute('markerUnits'), 'userSpaceOnUse');
  }
  assert.match(defs.querySelector('#notation-canvas-hollow path').getAttribute('d'), /Z$/);
  assert.equal(defs.querySelector('#notation-canvas-half path').getAttribute('d'), 'M0 -4 L10 0');
  assert.equal(defs.querySelectorAll('image,use,script,foreignObject').length, 0);
});

test('saved geometry is session-only: toggles, refresh and reset leave model, view, dirty state, redo and files intact', () => {
  const doc = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://schemka.test' }).window.document;
  const model = createController(createDemo()), session = createProjectSession(model.store);
  model.execute({ type: 'renameProject', name: 'Dirty state' });
  model.execute({ type: 'renameProject', name: 'Undo me' }); model.undo();
  const before = JSON.stringify(model.store.exportFiles()), revision = model.store.revision, history = model.store.history, view = model.viewId;
  const localBefore = JSON.stringify(doc.defaultView.localStorage), sessionBefore = JSON.stringify(doc.defaultView.sessionStorage);
  let rendered = 0;
  const reports = [];
  const ui = installNotationUI({ document: doc, blocked: () => false, renderCanvas() { rendered++; }, report(message) { reports.push(message); } });
  const stored = doc.getElementById('stored-geometry');
  assert.equal(ui.storedGeometry, false); assert.equal(stored.checked, false);
  const change = value => { stored.checked = value; stored.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true })); };
  for (let index = 0; index < 4; index++) { change(true); change(false); }
  assert.equal(rendered, 8); assert.equal(ui.storedGeometry, false);
  change(false); assert.equal(rendered, 8, 'An unchanged preference causes no rerender');
  stored.click(); assert.equal(ui.storedGeometry, true); assert.equal(stored.checked, true); assert.equal(rendered, 9);
  ui.refresh(); assert.equal(ui.storedGeometry, true); assert.equal(stored.checked, true); assert.equal(rendered, 9);
  ui.resetStoredGeometry(); assert.equal(ui.storedGeometry, false); assert.equal(stored.checked, false);
  ui.resetStoredGeometry(); ui.refresh(); assert.equal(ui.storedGeometry, false); assert.equal(rendered, 9);
  assert.equal(reports.length, 9); reports.forEach(message => assert.match(message, /Файл и история не изменены/));
  assert.equal(JSON.stringify(model.store.exportFiles()), before); assert.equal(model.store.revision, revision);
  assert.deepEqual(model.store.history, history); assert.equal(model.viewId, view); assert.equal(session.dirty, true);
  assert.equal(JSON.stringify(doc.defaultView.localStorage), localBefore); assert.equal(JSON.stringify(doc.defaultView.sessionStorage), sessionBefore);
});

test('saved geometry guards preserve either checked state across pointer, mouse, keyboard, click, change and focus interruption', () => {
  const doc = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).window.document;
  let blocked = false, rendered = 0;
  const reports = [], ui = installNotationUI({ document: doc, blocked: () => blocked, renderCanvas() { rendered++; }, report(message) { reports.push(message); } });
  const stored = doc.getElementById('stored-geometry'), label = stored.closest('label');
  const editor = doc.createElement('div'); editor.className = 'inline-editor';
  const input = doc.createElement('input'); input.value = 'Uncommitted draft'; editor.append(input); doc.body.append(editor);
  const event = type => new doc.defaultView.Event(type, { bubbles: true, cancelable: true });
  for (const expected of [false, true]) {
    blocked = false;
    if (stored.checked !== expected) stored.click();
    const before = rendered; blocked = true;
    for (const type of ['pointerdown', 'mousedown']) {
      const action = event(type); label.dispatchEvent(action);
      assert.equal(action.defaultPrevented, true); assert.equal(stored.checked, expected);
    }
    const key = new doc.defaultView.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    stored.dispatchEvent(key); assert.equal(key.defaultPrevented, true);
    stored.click(); assert.equal(stored.checked, expected, 'Cancelled checkbox activation rolls back exactly once');
    stored.checked = !expected; const change = event('change'); stored.dispatchEvent(change);
    assert.equal(change.defaultPrevented, true); assert.equal(stored.checked, expected);
    input.focus(); stored.focus(); assert.equal(doc.activeElement, input); assert.equal(input.value, 'Uncommitted draft');
    assert.equal(ui.storedGeometry, expected); assert.equal(rendered, before);
    const outside = event('pointerdown'); doc.getElementById('help-button').dispatchEvent(outside);
    assert.equal(outside.defaultPrevented, false, 'Capture only guards the saved-geometry controls');
  }
  assert.ok(reports.some(message => /Сначала завершите или отмените ввод/.test(message)));
  assert.ok(reports.filter(message => /Показ сохранённой геометрии не изменён/.test(message)).length >= 12);
  ui.resetStoredGeometry(); assert.equal(ui.storedGeometry, false); assert.equal(stored.checked, false);
});

test('Help owns the shared legend, complete attribution and scope caveats while the canvas retains only saved-geometry controls', () => {
  const doc = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).window.document;
  const help = doc.getElementById('help-dialog'), legend = doc.getElementById('notation-legend'), controls = doc.getElementById('notation-controls');
  assert.equal(legend.closest('dialog'), help); assert.equal(doc.querySelectorAll('#notation-legend-items').length, 1);
  assert.equal(doc.querySelector('#notation-mode,#notation-status,#notation-mode-version'), null);
  assert.equal(controls.querySelector('select,details,a'), null);
  assert.equal(controls.querySelectorAll('input').length, 1); assert.equal(controls.querySelector('input').id, 'stored-geometry');
  assert.match(doc.getElementById('stored-geometry-hint').textContent, /при открытии модели сохранённые маршруты и подписи показываются автоматически, если они заданы/);
  assert.match(doc.getElementById('stored-geometry-hint').title, /не изменяет JSON.*Обход препятствий не выполняется/);
  for (const phrase of [
    'частичный локальный набор текущего профиля', 'Одинаковые контуры различаются подписями типов',
    'Неизвестные типы и неподдерживаемые версии', 'Device: прямоугольник со значком монитора по C260, рис. 10-5 и приложению A',
    'Значок нарисован локально', 'отдельный icon-only вариант пока не реализован',
    'Вспомогательный источник описывает Box3D', 'расхождение источников сохранено в документации',
    'снимок Turtle от 2026-10-10', 'DataObject — прямоугольник с верхней полосой', 'бейджи заменены локальными текстовыми метками',
    'Product имеет внутреннюю вкладку', 'Equipment / Facility — прямоугольники с локальными значками шестерёнок и фабрики по C260, рис. 10-7 и 10-8', 'точное воспроизведение исходных значков не заявляется',
    'Облако и волнистый край — авторские многоугольники', 'геометрическая вложенность не подтверждает нормативную корректность модели',
    '11 базовых отношений и 4 варианта интерфейса', 'ReadAccess показывает стрелку у источника', 'концы не переставляются',
    'Маркеры локальные', 'на очень коротких участках они могут перекрываться',
    'Kalin Maldzhanski / Linked.Archi · v4.0 draft', 'CC BY 4.0', 'исходные иконки не скопированы',
    'Одобрение автора и соответствие стандарту не заявляются', 'полное соответствие семантике не проверено',
    'Проверка отдельных типов концов показана в свойствах отношения', 'JSON сохраняет исходную модель', 'Mermaid остаётся текстовым приближением',
  ]) assert.ok(legend.textContent.includes(phrase), phrase);
  assert.deepEqual([...legend.querySelectorAll('a')].map(link => link.href), ['https://meta.linked.archi/archimate4/notation/', 'https://creativecommons.org/licenses/by/4.0/']);
  for (const link of legend.querySelectorAll('a')) { assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer'); }
  assert.match(help.textContent, /Соответствие всей модели стандарту не проверено \(UNKNOWN\)/);
  renderNotationLegend(doc);
  assert.equal(legend.querySelectorAll('[data-legend-type]').length, 59);
  assert.ok(help.querySelector('[data-close]'), 'Help keeps its existing close action');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /notation-toolbar|notation-status|notation-mode/);
});

test('palette keeps all 59 typed glyphs and existing membership in the adapted Archi group order', () => {
  const doc = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).window.document;
  const palette = doc.querySelector('.palette');
  assert.equal(palette.querySelectorAll('h2').length, 1); assert.equal(doc.getElementById('palette-title').textContent, 'Палитра');
  assert.equal(doc.getElementById('catalogue-palette').tagName, 'DIV'); assert.equal(palette.querySelectorAll('[data-palette-group] > summary').length, 9);
  assert.equal(doc.querySelector('#view-name,#reuse-link-button'), null);
  assert.doesNotMatch(palette.textContent, /Текущее представление|ArchiMate 4/);
  const expectedGroups = [
    ['relationships', NOTATION_RELATIONSHIPS], ['junctions', ['AndJunction', 'OrJunction']],
    ['common', ['Service', 'Process', 'Function', 'Event', 'Path', 'Collaboration', 'Role', 'Grouping', 'Location']],
    ['strategy', ['Resource', 'Capability', 'ValueStream', 'CourseOfAction']],
    ['business', ['BusinessActor', 'BusinessInterface', 'BusinessObject', 'Product']],
    ['application', ['ApplicationComponent', 'ApplicationInterface', 'DataObject']],
    ['technology', ['Node', 'Device', 'SystemSoftware', 'CommunicationNetwork', 'TechnologyInterface', 'Equipment', 'Facility', 'DistributionNetwork', 'Artifact', 'Material']],
    ['motivation', ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Meaning', 'Value']],
    ['implementation', ['WorkPackage', 'Deliverable', 'Plateau']],
  ];
  assert.deepEqual([...palette.querySelectorAll('[data-palette-group]')].map(group => group.dataset.paletteGroup), expectedGroups.map(([group]) => group));
  for (const [group, types] of expectedGroups) {
    const section = palette.querySelector(`[data-palette-group="${group}"]`);
    assert.deepEqual([...section.querySelectorAll('button[id^="create-"]')].map(button => button.id).sort(), types.map(type => `create-${type.toLowerCase()}`).sort());
    assert.equal(section.querySelector('[data-palette-count]'), null);
  }
  const profile = doc.getElementById('profile-button');
  assert.equal(profile.closest('dialog').id, 'help-dialog'); assert.equal(profile.textContent, 'Проверка модели');
  assert.equal(profile.type, 'button'); assert.ok(profile.hasAttribute('data-close')); assert.equal(palette.contains(profile), false);
  renderNotationPalette(doc);
  assert.equal(palette.querySelectorAll('button[id^=create-] .palette-glyph svg').length, 59);
  for (const [group, types] of expectedGroups) for (const type of types) {
    const value = group === 'junctions' ? notationJunction(ref, type) : group === 'relationships' ? notationRelationship(ref, type) : notationElement(ref, type);
    const sample = doc.querySelector(`#create-${type.toLowerCase()} .palette-glyph svg`);
    assert.equal(sample.querySelector('g').getAttribute('class'), value.className);
    if (group === 'relationships') {
      const path = sample.querySelector('.line'), scope = `notation-palette-${type.toLowerCase()}`;
      assert.equal(path.getAttribute('marker-start'), value.startMarkerKind ? `url(#${scope}-${value.startMarkerKind})` : null);
      assert.equal(path.getAttribute('marker-end'), value.markerKind ? `url(#${scope}-${value.markerKind})` : null);
      assert.equal(path.getAttribute('stroke-dasharray'), dash(value.line));
    }
  }
  renderNotationPalette(doc, { ...ref, version: 999 });
  assert.equal(palette.querySelectorAll('g.unknown-type').length, 59);
  assert.equal(palette.querySelectorAll('.line[marker-start],.line[marker-end],.junction-and,.junction-or').length, 0);
});

test('connection endpoints and arrow tangents retain source-to-target direction, including reversal and self-loop', () => {
  for (const [x, y] of [[500, 10], [-500, 10], [10, 500], [10, -500], [500, 500], [-500, -500]]) {
    const occurrences = [{ id: 'a', bounds: { x: 10, y: 10, width: 200, height: 90 } }, { id: 'b', bounds: { x, y, width: 200, height: 90 } }];
    const before = JSON.stringify(occurrences);
    const forward = connectionGeometry({ source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints: [], labelPosition: null }, occurrences);
    const reverse = connectionGeometry({ source: { kind: 'occurrence', id: 'b' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null }, occurrences);
    const numbers = value => value.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const f = numbers(forward), r = numbers(reverse);
    assert.deepEqual(f.slice(0, 2), r.slice(2)); assert.deepEqual(f.slice(2), r.slice(0, 2));
    assert.ok((f[2] - f[0]) * (x - 10) + (f[3] - f[1]) * (y - 10) > 0);
    assert.equal(JSON.stringify(occurrences), before);
  }
  const loop = connectionGeometry({ source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null }, [{ id: 'a', bounds: { x: 10, y: 10, width: 200, height: 90 } }]);
  assert.match(loop.d, /^M 210 55 C /); assert.match(loop.d, /110 10$/); assert.doesNotMatch(loop.d, /NaN|Infinity/);
});

const luminance = hex => {
  const c = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
test('fixed draft fills and text/border/selected contrast survive light and dark; states retain the type fill', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const tokens = Object.fromEntries([...css.matchAll(/--notation-([\w-]+):(#[a-f\d]{6});/g)].map(match => [match[1], match[2]]));
  assert.equal(tokens.common, '#e5dfd3'); assert.equal(tokens.technology, '#afffaf'); assert.equal(tokens.application, '#afffff'); assert.equal(tokens.business, '#ffffb5');
  for (const fill of ['common', 'technology', 'application', 'business', 'motivation', 'strategy', 'implementation']) for (const ink of ['ink', 'border', 'selected']) {
    const a = luminance(tokens[fill]), b = luminance(tokens[ink]), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= (ink === 'ink' ? 4.5 : 3), `${ink}/${fill}: ${ratio}`);
  }
  assert.match(css, /\.node\.notation-draft\.selected rect\.node-box,[\s\S]*?stroke:var\(--notation-selected\)/);
  assert.match(css, /\.node\.notation-draft\.dragging rect\.node-box/);
});


const numbers = geometry => geometry.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
function onContour(rect, point, radius) {
  const halfW = rect.width / 2, halfH = rect.height / 2;
  const x = Math.abs(point.x - rect.x - halfW), y = Math.abs(point.y - rect.y - halfH);
  const rx = Math.min(radius, halfW), ry = Math.min(radius, halfH), tolerance = 1e-7;
  assert.ok(x <= halfW + tolerance && y <= halfH + tolerance, 'Point stays inside the rectangle bounds');
  if (Math.abs(x - halfW) < tolerance && y <= halfH - ry + tolerance) return;
  if (Math.abs(y - halfH) < tolerance && x <= halfW - rx + tolerance) return;
  assert.ok(rx > 0 && ry > 0, 'A non-edge point requires a corner ellipse');
  close(((x - halfW + rx) / rx) ** 2 + ((y - halfH + ry) / ry) ** 2, 1, 1e-5);
}
test('contour intersections honor typed and generic rounded corners, reversed directions and plain rectangles', () => {
  const occurrences = [{ id: 'a', bounds: { x: 0, y: 0, width: 200, height: 100 } }, { id: 'b', bounds: { x: 400, y: 200, width: 200, height: 100 } }];
  for (const [radius, expected] of [[notationElement(ref, 'Service').radius, [195.2, 97.6, 404.8, 202.4]], [8, [196.8, 98.4, 403.2, 201.6]], [notationElement(ref, 'Node').radius, [200, 100, 400, 200]], [notationElement(ref, 'Unsupported').radius, [200, 100, 400, 200]]]) {
    const forward = numbers(connectionGeometry({ source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints: [], labelPosition: null }, occurrences, () => radius));
    const reverse = numbers(connectionGeometry({ source: { kind: 'occurrence', id: 'b' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null }, occurrences, () => radius));
    forward.forEach((value, index) => close(value, expected[index]));
    reverse.forEach((value, index) => close(value, expected[(index + 2) % 4]));
    onContour(occurrences[0].bounds, { x: forward[0], y: forward[1] }, radius);
    onContour(occurrences[1].bounds, { x: forward[2], y: forward[3] }, radius);
  }
});
test('SVG radius clamping is honored for tiny/asymmetric bounds and rays in every quadrant without mutation', () => {
  for (const [width, height] of [[200, 100], [20, 20], [.1, .1], [.1, 40], [40, .1]]) {
    const rect = { x: -999000, y: 999000, width, height }, before = JSON.stringify(rect);
    for (const radius of [0, 8, 12]) for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1], [2, 1], [1, 2]]) {
      const point = contourPoint(rect, { x, y }, radius);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y)); onContour(rect, point, radius);
    }
    assert.equal(JSON.stringify(rect), before);
  }
});
test('narrow self-loops and coincident occurrences have nonzero routes, contour anchors and fit containing their complete control hull', () => {
  for (const [width, height] of [[20, 20], [.1, .1], [.1, 40], [40, .1], [200, 90]]) for (const radius of [0, 8, 12]) {
    const occurrences = [{ id: 'a', bounds: { x: 10, y: 10, width, height } }];
    const before = JSON.stringify(occurrences), connection = { source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null };
    const geometry = connectionGeometry(connection, occurrences, () => radius), points = numbers(geometry);
    assert.match(geometry.d, / C /); assert.doesNotMatch(geometry.d, /NaN|Infinity/);
    onContour(occurrences[0].bounds, { x: points[0], y: points[1] }, radius);
    onContour(occurrences[0].bounds, { x: points.at(-2), y: points.at(-1) }, radius);
    close(points.at(-2), 10 + width / 2); close(points.at(-1), 10);
    assert.notEqual(points[0], points.at(-2)); assert.notEqual(points[1], points.at(-1));
    const fit = viewGeometryBounds(occurrences, [connection], () => radius);
    for (let index = 0; index < points.length; index += 2) {
      assert.ok(points[index] > fit.x && points[index] < fit.x + fit.width);
      assert.ok(points[index + 1] > fit.y && points[index + 1] < fit.y + fit.height);
    }
    assert.equal(JSON.stringify(occurrences), before);
    const coincident = [...occurrences, { ...occurrences[0], id: 'b' }];
    assert.match(connectionGeometry({ source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints: [], labelPosition: null }, coincident, () => radius).d, / C /);
  }
});
test('overlap does not create a reversed straight arrow; both contour endpoints remain owned by their occurrences', () => {
  for (const reverse of [false, true]) {
    const occurrences = [{ id: 'a', bounds: { x: 0, y: 0, width: 200, height: 100 } }, { id: 'b', bounds: { x: 80, y: 30, width: 200, height: 100 } }];
    const ids = reverse ? ['b', 'a'] : ['a', 'b'];
    const geometry = connectionGeometry({ source: { kind: 'occurrence', id: ids[0] }, target: { kind: 'occurrence', id: ids[1] }, routePoints: [], labelPosition: null }, occurrences, () => 12), values = numbers(geometry);
    assert.match(geometry.d, / C /);
    onContour(occurrences.find(item => item.id === ids[0]).bounds, { x: values[0], y: values[1] }, 12);
    onContour(occurrences.find(item => item.id === ids[1]).bounds, { x: values[6], y: values[7] }, 12);
  }
});


test('each self-loop cubic stays outside its own node across square, wide, tall and tiny bounds, with correct terminal directions', () => {
  const sizes = [[200, 200], [400, 200], [200, 400], [2000, 1000], [1000, 2000], [1000000, 1000000], [20, 20], [.1, .1], [.1, 400], [400, .1]];
  for (const [width, height] of sizes) for (const radius of [0, 8, 12]) {
    const rect = { x: 10, y: 10, width, height }, occurrences = [{ id: 'a', bounds: rect }];
    const geometry = connectionGeometry({ source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null }, occurrences, () => radius);
    const p = numbers(geometry);
    assert.equal((geometry.d.match(/ C /g) || []).length, 2, 'Exterior loop consists of two cubics');
    assert.equal(p.length, 14);
    assert.ok(p[2] > p[0]); close(p[3], p[1]); // Depart outwards through the right edge.
    close(p[10], p[12]); assert.ok(p[11] < p[13]); // Arrive downwards onto the top edge.
    close(p[6] - p[4], p[8] - p[6]); close(p[7] - p[5], p[9] - p[7]); // Smooth join.
    for (let segment = 0; segment < 2; segment++) {
      const offset = segment * 6, controls = Array.from({ length: 4 }, (_, index) => ({ x: p[offset + index * 2], y: p[offset + index * 2 + 1] }));
      // Analytic control-hull property is stronger than sampled clearance.
      assert.ok(controls.every(point => segment === 0 ? point.x >= rect.x + width : point.y <= rect.y));
      for (let sample = 0; sample <= 256; sample++) {
        const t = sample / 256, u = 1 - t;
        const x = u ** 3 * controls[0].x + 3 * u ** 2 * t * controls[1].x + 3 * u * t ** 2 * controls[2].x + t ** 3 * controls[3].x;
        const y = u ** 3 * controls[0].y + 3 * u ** 2 * t * controls[1].y + 3 * u * t ** 2 * controls[2].y + t ** 3 * controls[3].y;
        assert.equal(x > rect.x && x < rect.x + width && y > rect.y && y < rect.y + height, false, `${width}×${height}, radius ${radius}, segment ${segment}, t ${t}: (${x}, ${y}) crosses node`);
      }
    }
    onContour(rect, { x: p[0], y: p[1] }, radius); onContour(rect, { x: p[12], y: p[13] }, radius);
  }
});


test('legend is profile-aware and adaptive: unknown catalogues fail closed and forty-two-kind layout has no row/line overlap', () => {
  for (const [version, elementCount, relationCount] of [[2, 42, 15], [999, 0, 0]]) {
    renderNotationLegend(document, { ...ref, version });
    const image = document.querySelector('svg'), elements = [...image.querySelectorAll('g.node')], relationships = [...image.querySelectorAll('g.connection')];
    assert.equal(elements.length, elementCount); assert.equal(relationships.length, relationCount);
    assert.equal(Boolean(image.querySelector('[data-legend-type="Role"]')), version === 2);
    assert.equal(Boolean(image.querySelector('[data-legend-type="DataObject"]')), version === 2);
    if (!elements.length) {
      assert.match(image.textContent, /Неизвестный профиль: типовые обозначения недоступны/);
      assert.equal(image.querySelectorAll('[data-legend-type]').length, 0);
      continue;
    }
    const lastRowBottom = Math.max(...elements.map(group => Number(group.getAttribute('transform').match(/translate\(\S+ (\S+)\)/)[1]) + 28));
    const firstRelationshipY = Number(relationships[0].querySelector('path').getAttribute('d').split(' ')[2]);
    assert.ok(firstRelationshipY > lastRowBottom + 10);
    const viewHeight = Number(image.getAttribute('viewBox').split(' ')[3]);
    for (const group of relationships) assert.ok(Number(group.querySelector('text').getAttribute('y')) < viewHeight - 10);
  }
});


test('Application shapes use local rectangles and only DataObject has an interior top band', () => {
  for (const type of ['ApplicationComponent', 'ApplicationInterface', 'DataObject']) {
    const appearance = notationElement(ref, type);
    assert.equal(appearance.family, 'application'); assert.equal(appearance.radius, 0);
    for (const [width, height] of [[.1, .1], [.1, 100], [100, .1], [200, 90], [400, 200]]) {
      const bounds = Object.freeze({ x: 10, y: -20, width, height }), shape = notationBox(document, appearance, bounds);
      const rectangle = shape.matches('rect') ? shape : shape.querySelector('rect');
      assert.equal(Number(rectangle.getAttribute('width')), width); assert.equal(Number(rectangle.getAttribute('height')), height); assert.equal(rectangle.getAttribute('rx'), '0');
      const bands = shape.querySelectorAll('.node-band'); assert.equal(bands.length, type === 'DataObject' ? 1 : 0);
      if (bands.length) {
        const band = bands[0], y = Number(band.getAttribute('y1'));
        assert.ok(y > 0 && y < height); assert.equal(y, Math.min(height / 5, 12));
        assert.equal(Number(band.getAttribute('y2')), y); assert.equal(Number(band.getAttribute('x1')), 0); assert.equal(Number(band.getAttribute('x2')), width);
      }
      assert.equal(shape.querySelectorAll('image,use,script,foreignObject').length, 0);
      assert.equal(shape.querySelectorAll('path').length, type === 'ApplicationComponent' ? 1 : 0);
      assert.equal(shape.querySelectorAll('.component-glyph > path.node-detail').length, type === 'ApplicationComponent' ? 1 : 0);
      const unknown = notationBox(document, notationElement({ ...ref, version: 999 }, type), bounds);
      assert.equal(unknown.tagName, 'rect'); assert.equal(unknown.querySelectorAll('.node-band').length, 0);
    }
  }
});

test('DataObject bands do not change the outer endpoint contour or fit', () => {
  const bounds = { x: 40, y: 30, width: 200, height: 90 };
  for (const [width, height] of [[.1, .1], [200, 200], [400, 200]]) {
    const occurrences = [{ id: 'a', bounds: { x: 40, y: 30, width, height } }, { id: 'b', bounds: { x: 500, y: 300, width: 100, height: 60 } }];
    const dataRadius = () => notationElement(ref, 'DataObject').radius, rectangleRadius = () => notationElement(ref, 'ApplicationComponent').radius;
    for (const connection of [{ source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' }, routePoints: [], labelPosition: null }, { source: { kind: 'occurrence', id: 'b' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null }, { source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'a' }, routePoints: [], labelPosition: null }]) {
      assert.deepEqual(connectionGeometry(connection, occurrences, dataRadius), connectionGeometry(connection, occurrences, rectangleRadius));
      assert.deepEqual(viewGeometryBounds(occurrences, [connection], dataRadius), viewGeometryBounds(occurrences, [connection], rectangleRadius));
    }
  }
});


test('new Business and Technology glyphs share original bounded geometry across arbitrary imported sizes', () => {
  const parse = text => text.split(' ').map(point => { const [x, y] = point.split(',').map(Number); return { x, y }; });
  for (const [width, height] of [[.1, .1], [.1, 9000], [9000, .1], [25, 100], [200, 90], [9000, 9000]]) {
    const bounds = Object.freeze({ width, height });
    const product = notationBox(document, notationElement(ref, 'Product'), bounds);
    assert.equal(product.querySelector('.node-box').tagName, 'rect'); assert.equal(product.querySelector('.node-box').getAttribute('rx'), '0');
    assert.deepEqual(parse(product.querySelector('.node-tab').getAttribute('points')), [{ x: 0, y: Math.min(height / 5, 12) }, { x: width * .45, y: Math.min(height / 5, 12) }, { x: width * .45, y: 0 }]);
    const business = notationBox(document, notationElement(ref, 'BusinessObject'), bounds);
    const data = notationBox(document, notationElement(ref, 'DataObject'), bounds);
    assert.equal(business.outerHTML, data.outerHTML, 'BusinessObject reuses the proven interior band geometry');
  }
  assert.equal(notationElement(ref, 'Device').contour, undefined, 'Device retains the C260 boxed rectangular contour');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /polygon\.node-box[^}]*fill:var\(--notation-technology\)/);
  assert.match(css, /selected polygon\.node-box[^}]*stroke:var\(--notation-selected\)/);
  assert.match(css, /dragging polygon\.node-box[^}]*stroke:var\(--notation-selected\)/);
  assert.match(css, /\.node-detail[^}]*pointer-events:none/);
});

test('extended contours have eighteen closed descriptors, exact family fills and genuinely shared SVG contours', () => {
  const descriptors = [
    ['Grouping', 'common', 'folder'], ['Location', 'common', null],
    ...['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement'].map(type => [type, 'motivation', 'octagon']),
    ['Meaning', 'motivation', 'cloud'], ['Value', 'motivation', 'ellipse'],
    ['Resource', 'strategy', null], ...['Capability', 'ValueStream', 'CourseOfAction'].map(type => [type, 'strategy', null]),
    ['WorkPackage', 'implementation', null], ['Deliverable', 'implementation', 'wavy'], ['Plateau', 'implementation', null],
  ];
  const parse = text => text.split(' ').map(value => { const [x, y] = value.split(',').map(Number); return { x, y }; });
  for (const [type, family, token] of descriptors) {
    const appearance = notationElement(ref, type);
    assert.equal(appearance.family, family); assert.equal(appearance.contour ?? null, token);
    assert.match(appearance.className, /notation-extended/);
    for (const [width, height] of [[.1, .1], [.1, 1000000], [1000000, .1], [120, 55], [210, 90], [70, 400]]) {
      const bounds = Object.freeze({ x: 900000, y: -900000, width, height }), shape = notationBox(document, appearance, bounds);
      const geometry = nodeContourGeometry({ width, height }, token);
      if (geometry?.outline) {
        const outline = ['folder', 'octagon', 'cloud'].includes(token) ? shape.querySelector('polygon.node-box') : shape;
        assert.equal(outline.tagName, 'polygon'); assert.deepEqual(parse(outline.getAttribute('points')), geometry.outline);
        assert.equal(shape.querySelectorAll('rect:not(.node-detail)').length, 0, 'No invisible rectangle fills concave cutouts');
      } else if (geometry?.ellipse) {
        assert.equal(shape.tagName, 'ellipse');
        for (const [key, value] of Object.entries(geometry.ellipse)) assert.equal(Number(shape.getAttribute(key)), value);
      } else if (token === 'box3d') {
        assert.deepEqual(parse(shape.querySelector('.node-box').getAttribute('points')), box3dGeometry({ width, height }).outline);
      } else assert.equal(['Plateau', 'Location', 'Resource', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage'].includes(type) ? shape.querySelector('.node-box').tagName : shape.tagName, 'rect');
      assert.equal(shape.querySelectorAll('image,use,script,foreignObject').length, 0);
      assert.equal(shape.querySelectorAll('path').length, ['Location', 'Stakeholder', 'Outcome', 'Resource', 'CourseOfAction', 'WorkPackage'].includes(type) ? 1 : 0);
      const unknown = notationBox(document, notationElement({ ...ref, version: 999 }, type), bounds);
      assert.equal(unknown.tagName, 'rect'); assert.equal(unknown.getAttribute('rx'), '0');
    }
  }
  for (const token of ['constructor', '__proto__', '<script/>', 'url(https://evil)', { outline: [] }]) {
    assert.equal(nodeContourGeometry({ width: 120, height: 55 }, token), null);
    assert.equal(notationBox(document, { contour: token }, { width: 120, height: 55 }).tagName, 'rect');
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  for (const [family, color] of [['motivation', '#cbcbff'], ['strategy', '#f5deaa'], ['implementation', '#ffe0e0']]) assert.ok(css.includes(`--notation-${family}:${color};`));
  assert.match(css, /\.node\.notation-extended \.node-box[^}]*stroke:#000000/);
  assert.match(css, /\.notation-extended\.notation-implementation \.node-box[^}]*fill:var\(--notation-implementation\)/);
  for (const state of ['selected', ':focus-visible', 'dragging']) assert.ok(css.includes(`notation-extended${state.startsWith(':') ? '' : '.'}${state} .node-box`));
});


test('Device alone uses a bounded original monitor badge inside the unchanged rectangular contour', () => {
  const doc = new JSDOM('<!doctype html>').window.document;
  const appearance = notationElement(ref, 'Device'); assert.equal(appearance.glyph, 'monitor'); assert.equal(appearance.radius, 0); assert.equal(appearance.contour, undefined);
  for (const type of NOTATION_ELEMENTS.filter(t => t !== 'Device')) assert.equal(notationElement(ref, type).glyph, type === 'Equipment' ? 'equipment' : type === 'Facility' ? 'facility' : type === 'Plateau' ? 'plateau' : type === 'Node' ? 'cuboid' : type === 'ApplicationComponent' ? 'component' : ['BusinessInterface', 'ApplicationInterface', 'TechnologyInterface'].includes(type) ? 'interface' : ['Service', 'Process', 'Function', 'Event', 'Role', 'Collaboration', 'Path', 'Location', 'BusinessActor', 'Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'SystemSoftware', 'CommunicationNetwork', 'DistributionNetwork', 'Artifact', 'Material', 'Resource', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage'].includes(type) ? type.toLowerCase() : undefined, type);
  for (const width of [.1, 1, 20, 40, 120, 220, 1000000]) for (const height of [.1, 1, 24, 28, 55, 90, 1000000]) {
    const box = notationBox(doc, appearance, { width, height }), rect = box.querySelector('.node-box'), glyph = box.querySelector('.device-glyph');
    assert.equal(rect.tagName, 'rect'); assert.equal(Number(rect.getAttribute('width')), width); assert.equal(Number(rect.getAttribute('height')), height);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    const [x, y, scale] = glyph.getAttribute('transform').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok([x, y, scale].every(Number.isFinite)); assert.ok(scale > 0);
    // Independently include the default 1.25-unit detail stroke, not only centerlines.
    for (const [px, py] of [[.375, .375], [19.625, 16.625]]) {
      assert.ok(x + px * scale >= 0 && x + px * scale <= width, `${width}/${height} horizontal`);
      assert.ok(y + py * scale >= 0 && y + py * scale <= height, `${width}/${height} vertical`);
    }
    assert.equal(glyph.querySelectorAll('rect').length, 1); assert.equal(glyph.querySelectorAll('polygon').length, 1);
    assert.equal(box.querySelectorAll('image,use,script,foreignObject,a').length, 0);
    if (width === 220 && height === 90) { assert.ok(x > 175); assert.ok(y + 17 * scale < 30, 'Normal name line at y49 is below the badge'); }
    if (width === 120 && height === 55) assert.ok(x > 80, 'Device label and badge have separate horizontal space');
  }
  for (const reference of [{ ...ref, version: 999 }, { id: '<svg>', version: ref.version }]) assert.equal(notationBox(doc, notationElement(reference, 'Device'), { width: 220, height: 90 }).querySelector('.device-glyph'), null);
  for (const type of ['__proto__', 'constructor', '<img src=x>', 'Device" onload="x']) assert.equal(notationBox(doc, notationElement(ref, type), { width: 220, height: 90 }).querySelector('.device-glyph'), null);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.node \.node-detail[^}]*pointer-events:none/);
  for (const mode of ['selected', ':focus-visible', 'dragging']) assert.ok(css.includes(`${mode === ':focus-visible' ? '.node.notation-draft' : '.node.notation-draft.'}${mode} .node-detail`));
});

test('Node alone uses a bounded six-vertex cuboid badge with three face separators and rectangular hit geometry', () => {
  const appearance = notationElement(ref, 'Node');
  assert.equal(appearance.glyph, 'cuboid'); assert.equal(appearance.radius, 0); assert.equal(appearance.contour, undefined);
  for (const type of NOTATION_ELEMENTS.filter(t => t !== 'Node')) assert.notEqual(notationElement(ref, type).glyph, 'cuboid', type);
  const outline = [[2, 4], [4, 2], [18, 2], [18, 12], [16, 14], [2, 14]];
  const separators = [[[2, 4], [16, 4]], [[16, 4], [18, 2]], [[16, 4], [16, 14]]];
  const points = item => item.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number));
  for (const width of [.1, 1, 20, 38, 40, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 24, 28, 55, 90, 1000000]) {
    const bounds = Object.freeze({ x: 900000, y: -900000, width, height });
    const box = notationBox(document, appearance, bounds), rect = box.querySelector('.node-box'), glyph = box.querySelector('.node-glyph');
    assert.equal(box.querySelectorAll('rect').length, 1); assert.equal(box.querySelectorAll('.node-box').length, 1);
    assert.equal(rect.tagName, 'rect'); assert.equal(Number(rect.getAttribute('width')), width); assert.equal(Number(rect.getAttribute('height')), height); assert.equal(rect.getAttribute('rx'), '0');
    assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(glyph.children.length, 4); assert.equal(glyph.querySelectorAll('polygon.node-detail').length, 1);
    assert.deepEqual(points(glyph.querySelector('polygon')), outline);
    assert.deepEqual([...glyph.querySelectorAll('polyline.node-detail')].map(points), separators);
    const [x, y, scale] = glyph.getAttribute('transform').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok([x, y, scale].every(Number.isFinite)); assert.ok(scale > 0 && scale <= 1.4);
    // A full 1.25-unit stroke allowance exceeds the half-stroke/miter extents of these 90/135-degree corners.
    for (const [px, py] of [[.75, .75], [19.25, 15.25]]) {
      assert.ok(x + px * scale >= 0 && x + px * scale <= width, `${width}/${height} horizontal stroke bounds`);
      assert.ok(y + py * scale >= 0 && y + py * scale <= height, `${width}/${height} vertical stroke bounds`);
    }
    assertGlyphCaptionClearance(appearance, bounds, { left: x + .375 * scale, right: x + 19.625 * scale, top: y + .375 * scale, bottom: y + 16.625 * scale });
    if (width === 120 && height === 55 || width === 169 && height === 28) assert.ok(x > 80, 'Normal/legend Node label and badge remain horizontally separate');
    assert.equal(box.querySelectorAll('image,use,script,foreignObject,a').length, 0);
  }
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, version: '2' }, { id: '<svg>', version: ref.version }]) assert.equal(notationBox(document, notationElement(reference, 'Node'), { width: 220, height: 90 }).querySelector('.node-glyph'), null);
  for (const type of ['__proto__', 'constructor', '<img src=x>', 'Node" onload="x', 'cuboid']) assert.equal(notationBox(document, notationElement(ref, type), { width: 220, height: 90 }).querySelector('.node-glyph'), null);
  for (const glyph of ['__proto__', 'constructor', 'url(https://evil)', '<svg/>', { cuboid: true }]) assert.equal(notationBox(document, { glyph }, { width: 120, height: 55 }).tagName, 'rect');
});

test('Grouping alone adds a dashed unchanged folder contour and a bounded noninteractive tab divider', () => {
  const appearance = notationElement(ref, 'Grouping');
  assert.equal(appearance.contour, 'folder'); assert.equal(appearance.family, 'common'); assert.equal(appearance.radius, 0);
  for (const type of NOTATION_ELEMENTS.filter(type => type !== 'Grouping')) {
    assert.notEqual(notationElement(ref, type).contour, 'folder');
    assert.equal(notationBox(document, notationElement(ref, type), { width: 220, height: 90 }).querySelector('.grouping-divider'), null);
  }
  for (const width of [.1, 1, 20, 38, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 28, 55, 90, 1000000]) {
    const bounds = Object.freeze({ x: 900000, y: -900000, width, height });
    const shape = notationBox(document, appearance, bounds), outline = shape.querySelector('polygon.node-box'), divider = shape.querySelector('line.grouping-divider');
    assert.equal(shape.children.length, 2); assert.equal(shape.querySelectorAll('.node-box').length, 1); assert.equal(shape.querySelectorAll('rect').length, 0);
    const points = outline.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number));
    assert.deepEqual(points, [[0, 0], [width * .4, 0], [width * .4, height * .2], [width, height * .2], [width, height], [0, height]]);
    for (const [x, y] of points) assert.ok(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= width && y >= 0 && y <= height);
    assert.deepEqual(['x1', 'x2', 'y1', 'y2'].map(key => Number(divider.getAttribute(key))), [0, width * .4, height * .2, height * .2]);
    for (const item of [outline, divider]) assert.equal(item.getAttribute('stroke-dasharray'), '7 5');
    assert.equal(divider.getAttribute('pointer-events'), 'none'); assert.equal(divider.getAttribute('aria-hidden'), 'true');
    assert.equal(outline.hasAttribute('pointer-events'), false, 'The original filled polygon remains the hit surface');
    assert.equal(shape.querySelectorAll('image,use,script,foreignObject,a').length, 0);
  }
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, version: '2' }, { id: '<svg>', version: ref.version }]) {
    const shape = notationBox(document, notationElement(reference, 'Grouping'), { width: 220, height: 90 });
    assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.grouping-divider'), null); assert.equal(shape.hasAttribute('stroke-dasharray'), false);
  }
  for (const type of ['__proto__', 'constructor', '<img src=x>', 'Grouping" onload="x', 'folder']) {
    const shape = notationBox(document, notationElement(ref, type), { width: 220, height: 90 });
    assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.grouping-divider'), null);
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.node\.notation-extended\.notation-common \.node-box[^}]*fill:var\(--notation-common\)/);
  for (const state of ['selected', ':focus-visible', 'dragging']) for (const part of ['node-box', 'node-detail']) {
    assert.ok(css.includes(`notation-extended${state.startsWith(':') ? '' : '.'}${state} .${part}`));
  }
});


test('ApplicationComponent alone uses two crossing tabs and an interrupted body edge inside the unchanged rectangle', () => {
  const appearance = notationElement(ref, 'ApplicationComponent');
  assert.equal(appearance.glyph, 'component'); assert.equal(appearance.radius, 0); assert.equal(appearance.contour, undefined);
  for (const type of NOTATION_ELEMENTS.filter(t => t !== 'ApplicationComponent')) assert.notEqual(notationElement(ref, type).glyph, 'component', type);
  for (const width of [.1, 1, 20, 38, 40, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 24, 28, 55, 90, 1000000]) {
    const bounds = Object.freeze({ x: 900000, y: -900000, width, height });
    const box = notationBox(document, appearance, bounds), rect = box.querySelector('.node-box'), glyph = box.querySelector('.component-glyph');
    assert.equal(box.querySelectorAll('.node-box').length, 1); assert.equal(rect.tagName, 'rect');
    assert.equal(Number(rect.getAttribute('width')), width); assert.equal(Number(rect.getAttribute('height')), height); assert.equal(rect.getAttribute('rx'), '0');
    assert.equal(rect.hasAttribute('pointer-events'), false, 'The original rectangle remains the hit surface');
    assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(glyph.children.length, 3); assert.equal(glyph.querySelectorAll('path.node-detail').length, 1);
    assert.equal(glyph.querySelector('path').getAttribute('d'), 'M6 2.5 V1 H18 V10 H6 V8.5 M6 4.5 V6.5');
    const tabs = [...glyph.querySelectorAll('rect.node-detail')].map(tab => ['x', 'y', 'width', 'height'].map(key => Number(tab.getAttribute(key))));
    assert.deepEqual(tabs, [[2, 2.5, 8, 2], [2, 6.5, 8, 2]]);
    for (const [x, , w, h] of tabs) { assert.ok(x < 6 && x + w > 6, 'Each horizontal tab crosses the body left edge'); assert.ok(w > h); }
    assert.ok(tabs[0][1] + tabs[0][3] < tabs[1][1], 'Two distinct tabs with a visible gap');
    const [x, y, scale] = glyph.getAttribute('transform').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok([x, y, scale].every(Number.isFinite)); assert.ok(scale > 0 && scale <= 1.4);
    // Bounds include every 90-degree corner and the full default half-stroke (1.25 / 2).
    for (const [px, py] of [[1.375, .375], [18.625, 10.625]]) {
      assert.ok(x + px * scale >= 0 && x + px * scale <= width, `${width}/${height} horizontal stroke bounds`);
      assert.ok(y + py * scale >= 0 && y + py * scale <= height, `${width}/${height} vertical stroke bounds`);
    }
    assertGlyphCaptionClearance(appearance, bounds, { left: x + 1.375 * scale, right: x + 18.625 * scale, top: y + .375 * scale, bottom: y + 10.625 * scale });
    if (width === 120 && height === 55) assert.ok(y + 10.625 * scale < 15, 'Compact badge ends above the full type caption at baseline 25 with 10px text');
    assert.equal(box.querySelectorAll('image,use,script,foreignObject,a').length, 0);
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.node \.node-detail[^}]*fill:none[^}]*stroke-width:1.25[^}]*pointer-events:none/);
  for (const state of ['selected', ':focus-visible', 'dragging']) assert.ok(css.includes(`${state.startsWith(':') ? '.node.notation-draft' : '.node.notation-draft.'}${state} .node-detail`));
});

test('ApplicationComponent badge is unavailable for foreign profiles or hostile type and glyph values', () => {
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, version: '2' }, { id: '<svg>', version: ref.version }, { ...ref, svg: '<script/>' }]) {
    const shape = notationBox(document, notationElement(reference, 'ApplicationComponent'), { width: 220, height: 90 });
    assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.component-glyph'), null);
  }
  for (const type of ['__proto__', 'constructor', '<img src=x>', 'ApplicationComponent" onload="x', 'component']) {
    const shape = notationBox(document, notationElement(ref, type), { width: 220, height: 90 });
    assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.component-glyph'), null);
  }
  for (const glyph of ['__proto__', 'constructor', 'url(https://evil)', '<svg/>', { component: true }]) assert.equal(notationBox(document, { glyph }, { width: 120, height: 55 }).tagName, 'rect');
});

test('Only the three interface types share a circular outline and tangent left stem within unchanged rectangles', () => {
  const types = ['BusinessInterface', 'ApplicationInterface', 'TechnologyInterface'];
  assert.deepEqual(NOTATION_ELEMENTS.filter(type => notationElement(ref, type).glyph === 'interface').sort(), [...types].sort());
  for (const type of types) {
    const appearance = notationElement(ref, type);
    assert.equal(appearance.glyph, 'interface'); assert.equal(appearance.radius, 0); assert.equal(appearance.contour, undefined);
    assert.equal(appearance.family, type.replace('Interface', '').toLowerCase());
    assert.equal(appearance.badge, type.replace('Interface', ' Interface'));
    for (const width of [.1, 1, 20, 38, 40, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 24, 28, 55, 90, 1000000]) {
      const box = notationBox(document, appearance, Object.freeze({ x: 900000, y: -900000, width, height }));
      const rect = box.querySelector('rect.node-box'), glyph = box.querySelector('.interface-glyph');
      assert.equal(box.children.length, 2); assert.equal(box.querySelectorAll('.node-box').length, 1); assert.equal(box.querySelectorAll('rect').length, 1);
      assert.deepEqual(['width', 'height', 'rx'].map(key => Number(rect.getAttribute(key))), [width, height, 0]);
      assert.equal(rect.hasAttribute('pointer-events'), false, 'The existing rectangle is the only hit surface');
      assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
      assert.equal(glyph.children.length, 2); assert.equal(glyph.querySelectorAll('circle.node-detail').length, 1); assert.equal(glyph.querySelectorAll('line.node-detail').length, 1);
      const circle = glyph.querySelector('circle'), stem = glyph.querySelector('line');
      const [cx, cy, r] = ['cx', 'cy', 'r'].map(key => Number(circle.getAttribute(key)));
      const [x1, x2, y1, y2] = ['x1', 'x2', 'y1', 'y2'].map(key => Number(stem.getAttribute(key)));
      assert.ok(r > 0); assert.ok(x1 < x2); assert.equal(x2, cx - r); assert.equal(y1, cy); assert.equal(y2, cy);
      assert.deepEqual([cx, cy, r, x1, x2, y1, y2], [13, 4.5, 3.5, 2, 9.5, 4.5, 4.5]);
      assert.equal(glyph.hasAttribute('fill'), false); assert.equal(circle.hasAttribute('fill'), false, 'The shared node-detail rule supplies fill:none');
      const transform = glyph.getAttribute('transform');
      assert.match(transform, /^translate\([^)]+\) scale\([^ ,)]+\)$/u, 'Exactly one uniform scale preserves circles');
      const [x, y, scale] = transform.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
      assert.ok([x, y, scale].every(Number.isFinite)); assert.ok(scale > 0 && scale <= 1.4);
      // Independently bound both primitives, including half the 1.25-unit detail stroke.
      const left = Math.min(x1, cx - r) - .625, right = cx + r + .625;
      const top = cy - r - .625, bottom = cy + r + .625;
      assert.ok(x + left * scale >= 0 && x + right * scale <= width, `${type}/${width}/${height} horizontal stroke bounds`);
      assert.ok(y + top * scale >= 0 && y + bottom * scale <= height, `${type}/${width}/${height} vertical stroke bounds`);
      assertGlyphCaptionClearance(appearance, { width, height }, { left: x + left * scale, right: x + right * scale, top: y + top * scale, bottom: y + bottom * scale });
      if (width === 169 && height === 28) assert.ok(y + bottom * scale < 8, 'Legend badge stays above full 10px caption at baseline 18');
      assert.equal(box.querySelectorAll('image,use,script,foreignObject,a,path,polygon,polyline,marker').length, 0);
      assert.equal(box.querySelector('[href],[onload],[marker-start],[marker-end]'), null);
    }
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.node \.node-detail[^}]*fill:none[^}]*stroke:var\(--notation-border\)[^}]*stroke-width:1.25[^}]*pointer-events:none/);
  for (const state of ['selected', ':focus-visible', 'dragging']) assert.ok(css.includes(`${state.startsWith(':') ? '.node.notation-draft' : '.node.notation-draft.'}${state} .node-detail`));
});

test('Interface glyph remains closed to foreign profiles and hostile type, URL and non-string glyph values', () => {
  for (const type of ['BusinessInterface', 'ApplicationInterface', 'TechnologyInterface']) {
    for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, version: '2' }, { id: '<svg>', version: ref.version }, { ...ref, svg: '<script/>' }]) {
      const appearance = notationElement(reference, type), shape = notationBox(document, appearance, { width: 220, height: 90 });
      assert.equal(appearance.notation, UNKNOWN_NOTATION); assert.equal(appearance.glyph, undefined);
      assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.interface-glyph'), null);
    }
  }
  for (const type of ['__proto__', 'constructor', '<img src=x>', 'ApplicationInterface" onload="x', 'interface', 'url(https://evil)']) {
    const shape = notationBox(document, notationElement(ref, type), { width: 220, height: 90 });
    assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.interface-glyph'), null);
  }
  for (const glyph of ['__proto__', 'constructor', 'url(https://evil)', '<svg/>', { interface: true }, ['interface'], 1, true, null]) {
    const shape = notationBox(document, { glyph }, { width: 120, height: 55 });
    assert.equal(shape.tagName, 'rect'); assert.equal(shape.querySelector('.interface-glyph'), null);
  }
});

test('Interface decoration leaves exact rectangle contour intersections, routes and Fit extents unchanged', () => {
  for (const type of ['BusinessInterface', 'ApplicationInterface', 'TechnologyInterface']) {
    const appearance = notationElement(ref, type), contour = () => appearance.contour || appearance.radius;
    for (const [width, height] of [[.1, .1], [.1, 1000000], [1000000, .1], [120, 55], [220, 90], [1000000, 1000000]]) {
      const occurrences = [{ id: 'a', bounds: { x: 40, y: 30, width, height } }, { id: 'b', bounds: { x: 500, y: 300, width: 100, height: 60 } }];
      const connections = [['a', 'b'], ['b', 'a'], ['a', 'a']].map(([source, target], index) => ({ id: `c${index}`, source: { kind: 'occurrence', id: source }, target: { kind: 'occurrence', id: target }, routePoints: [{ kind: 'bend', point: { x: 420, y: -60 } }, { kind: 'bend', point: { x: 470, y: 280 } }], labelPosition: { x: 460, y: -90 } }));
      for (const saved of [false, true]) {
        for (const connection of connections) assert.deepEqual(connectionGeometry(connection, occurrences, contour, saved, connections), connectionGeometry(connection, occurrences, () => 0, saved, connections));
        assert.deepEqual(viewGeometryBounds(occurrences, connections, contour, saved), viewGeometryBounds(occurrences, connections, () => 0, saved));
      }
      for (const direction of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: -1 }]) assert.deepEqual(contourPoint(occurrences[0].bounds, direction, contour()), contourPoint(occurrences[0].bounds, direction, 0));
    }
  }
});

test('Plateau alone uses three solid equal stepped bars in a square rectangle with stroke-inclusive caption clearance', () => {
  const appearance = notationElement(ref, 'Plateau');
  assert.equal(appearance.glyph, 'plateau'); assert.equal(appearance.contour, undefined); assert.equal(appearance.radius, 0);
  assert.deepEqual(NOTATION_ELEMENTS.filter(type => notationElement(ref, type).glyph === 'plateau'), ['Plateau']);
  for (const width of [.1, 1, 20, 38, 120, 169, 220, 1000000]) for (const height of [.1, 1, 20, 28, 55, 90, 1000000]) {
    const box = notationBox(document, appearance, Object.freeze({ width, height })), rect = box.querySelector('.node-box'), glyph = box.querySelector('.plateau-glyph');
    assert.equal(box.children.length, 2); assert.equal(rect.tagName, 'rect');
    assert.deepEqual(['width', 'height', 'rx'].map(key => Number(rect.getAttribute(key))), [width, height, 0]);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(rect.hasAttribute('pointer-events'), false, 'The full rectangle is the hit surface');
    assert.equal(glyph.children.length, 3); assert.equal(glyph.querySelectorAll('line.node-detail').length, 3);
    const bars = [...glyph.children].map(bar => ['x1', 'x2', 'y1', 'y2'].map(key => Number(bar.getAttribute(key))));
    assert.deepEqual(bars, [[6, 18, 1, 1], [4, 16, 4, 4], [2, 14, 7, 7]]);
    for (const [index, [x1, x2, y1, y2]] of bars.entries()) {
      assert.equal(x2 - x1, 12); assert.equal(y1, y2);
      assert.equal(glyph.children[index].hasAttribute('stroke-dasharray'), false);
      if (index) { assert.ok(x1 < bars[index - 1][0]); assert.ok(y1 > bars[index - 1][2]); }
    }
    assert.match(glyph.getAttribute('transform'), /^translate\([^)]+\) scale\([^ ,)]+\)$/u);
    const [x, y, scale] = glyph.getAttribute('transform').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok([x, y, scale].every(Number.isFinite)); assert.ok(scale > 0 && scale <= 1.4);
    // Conservatively allow half of the existing 1.25-unit detail stroke at every endpoint.
    assert.ok(x + 1.375 * scale >= 0 && x + 18.625 * scale <= width);
    assert.ok(y + .375 * scale >= 0 && y + 7.625 * scale <= height);
    assertGlyphCaptionClearance(appearance, { width, height }, { left: x + 1.375 * scale, right: x + 18.625 * scale, top: y + .375 * scale, bottom: y + 7.625 * scale });
    if (width === 169 && height === 28) assert.ok(y + 7.625 * scale < 8, 'Above the full legend caption at baseline 18');
    assert.equal(box.querySelectorAll('image,use,script,foreignObject,a,path,polygon,polyline,circle').length, 0);
  }
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, version: '2' }, { id: '<svg>', version: ref.version }]) assert.equal(notationBox(document, notationElement(reference, 'Plateau'), { width: 120, height: 55 }).querySelector('.plateau-glyph'), null);
  for (const type of ['__proto__', 'constructor', '<img src=x>', 'Plateau" onload="x', 'plateau']) assert.equal(notationBox(document, notationElement(ref, type), { width: 120, height: 55 }).querySelector('.plateau-glyph'), null);
  for (const glyph of ['__proto__', 'url(https://evil)', '<svg/>', { plateau: true }, ['plateau'], 1, true, null]) assert.equal(notationBox(document, { glyph }, { width: 120, height: 55 }).tagName, 'rect');
});

for (const type of ['Plateau', 'Equipment', 'Facility']) test(`${type} rectangle intentionally changes bevel clipping while independent rectangle endpoints, saved routes and Fit remain correct`, () => {
  const appearance = notationElement(ref, type), contour = () => appearance.contour || appearance.radius;
  const near = (actual, expected) => { assert.ok(Math.abs(actual.x - expected.x) < 1e-7, `${actual.x} versus ${expected.x}`); assert.ok(Math.abs(actual.y - expected.y) < 1e-7, `${actual.y} versus ${expected.y}`); };
  // Independent center-ray/axis-aligned-rectangle intersection, no production contour helper.
  const rectHit = (r, target) => {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2, dx = target.x - cx, dy = target.y - cy;
    const fraction = Math.min(dx ? r.width / 2 / Math.abs(dx) : Infinity, dy ? r.height / 2 / Math.abs(dy) : Infinity);
    return { x: cx + fraction * dx, y: cy + fraction * dy };
  };
  const occurrences = [{ id: 'a', bounds: { x: 0, y: 0, width: 120, height: 60 } }, { id: 'b', bounds: { x: 240, y: 120, width: 120, height: 60 } }];
  const connections = [['a', 'b'], ['b', 'a'], ['a', 'a']].map(([source, target], index) => ({ id: `c${index}`, source: { kind: 'occurrence', id: source }, target: { kind: 'occurrence', id: target }, routePoints: [{ kind: 'bend', point: { x: -120, y: -60 } }, { kind: 'bend', point: { x: 480, y: 240 } }], labelPosition: { x: 400, y: -90 } }));
  const original = JSON.stringify({ occurrences, connections });
  for (const saved of [false, true]) for (const connection of connections) {
    const from = occurrences.find(o => o.id === connection.source.id).bounds, to = occurrences.find(o => o.id === connection.target.id).bounds;
    const geometry = connectionGeometry(connection, occurrences, contour, saved, connections), numbers = geometry.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
    const start = { x: numbers[0], y: numbers[1] }, end = { x: numbers.at(-2), y: numbers.at(-1) };
    if (!saved && connection.source.id === connection.target.id) { near(start, { x: 120, y: 30 }); near(end, { x: 60, y: 0 }); }
    else {
      near(start, rectHit(from, saved ? connection.routePoints[0].point : { x: to.x + to.width / 2, y: to.y + to.height / 2 }));
      near(end, rectHit(to, saved ? connection.routePoints.at(-1).point : { x: from.x + from.width / 2, y: from.y + from.height / 2 }));
    }
    if (saved) { assert.equal(geometry.x, 400); assert.equal(geometry.y, -90); }
    const fit = viewGeometryBounds(occurrences, connections, contour, saved);
    for (const r of [...occurrences.map(o => o.bounds), geometry.bounds]) { assert.ok(fit.x <= r.x && fit.y <= r.y); assert.ok(fit.x + fit.width >= r.x + r.width && fit.y + fit.height >= r.y + r.height); }
  }
  const fresh = connectionGeometry(connections[0], occurrences, contour), old = connectionGeometry(connections[0], occurrences, () => 'box3d');
  assert.notEqual(fresh.d, old.d);
  const oldNumbers = old.d.match(/-?[\d.]+/g).map(Number);
  // Former 10-unit bevel intersects x+y=170 at (113 1/3, 56 2/3).
  near({ x: oldNumbers[0], y: oldNumbers[1] }, { x: 340 / 3, y: 170 / 3 });
  near({ x: oldNumbers[2], y: oldNumbers[3] }, { x: 740 / 3, y: 370 / 3 });
  assert.equal(fresh.d, 'M 120 60 L 240 120');
  for (const r of [occurrences[0].bounds, { x: 12, y: -8, width: .1, height: 1000000 }, { x: 12, y: -8, width: 1000000, height: .1 }]) for (const direction of [{ x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }]) {
    near(contourPoint(r, direction, contour()), rectHit(r, { x: r.x + r.width / 2 + direction.x, y: r.y + r.height / 2 + direction.y }));
  }
  assert.equal(JSON.stringify({ occurrences, connections }), original);
});

for (const type of ['Plateau', 'Equipment', 'Facility']) test(`${type} former bevel cutouts now occlude anchors and referenced endpoints without rewriting any stored point or identity`, () => {
  const appearance = notationElement(ref, type), contour = () => appearance.contour || appearance.radius;
  const occurrences = [{ id: 'plateau', bounds: { x: 0, y: 0, width: 120, height: 60 } }, { id: 'other', bounds: { x: 300, y: 200, width: 100, height: 60 } }];
  const host = { id: 'host', source: { kind: 'occurrence', id: 'plateau' }, target: { kind: 'occurrence', id: 'other' }, routePoints: [{ kind: 'anchor', id: 'upper-left', point: { x: 1, y: 1 } }, { kind: 'anchor', id: 'lower-right', point: { x: 119, y: 59 } }, ...[[ -1, 30 ], [121, 30], [60, -1], [60, 61]].map(([x, y], i) => ({ kind: 'anchor', id: `outside-${i}`, point: { x, y } }))], labelPosition: { x: 170, y: -90 } };
  const attachments = host.routePoints.map(a => ({ id: a.id, source: { kind: 'occurrence', id: 'other' }, target: { kind: 'connection', id: 'host', anchorId: a.id }, routePoints: [], labelPosition: null }));
  const connections = [host, ...attachments], original = JSON.stringify({ occurrences, connections });
  for (const saved of [false, true]) {
    const current = connectionGeometry(host, occurrences, contour, saved, connections), old = connectionGeometry(host, occurrences, o => o.id === 'plateau' ? 'box3d' : 0, saved, connections);
    assert.deepEqual(old.diagnostics, []);
    assert.deepEqual(current.diagnostics, ['upper-left', 'lower-right'].map(anchorId => ({ ruleId: 'anchor-occluded', connectionId: 'host', anchorId, occurrenceId: 'plateau' })));
    for (const [index, anchor] of current.anchors.entries()) { assert.equal(anchor.id, host.routePoints[index].id); assert.deepEqual(anchor.point, host.routePoints[index].point); assert.deepEqual(anchor.occludedBy, index < 2 ? ['plateau'] : []); }
    for (const attached of attachments) {
      const currentEndpoint = connectionGeometry(attached, occurrences, contour, saved, connections), oldEndpoint = connectionGeometry(attached, occurrences, o => o.id === 'plateau' ? 'box3d' : 0, saved, connections);
      assert.deepEqual(oldEndpoint.diagnostics, []);
      assert.deepEqual(currentEndpoint.diagnostics, attached.id.startsWith('outside') ? [] : [{ ruleId: 'endpoint-occluded', connectionId: attached.id, end: 'target', hostConnectionId: 'host', anchorId: attached.id, occurrenceId: 'plateau' }]);
      assert.deepEqual(currentEndpoint.points.at(-1), host.routePoints.find(a => a.id === attached.id).point);
    }
  }
  assert.equal(JSON.stringify({ occurrences, connections }), original);
});

for (const type of ['Equipment', 'Facility']) test(`${type} alone has original bounded rectangular glyph topology and full-caption clearance`, () => {
  const appearance = notationElement(ref, type), token = type.toLowerCase();
  assert.equal(appearance.glyph, token); assert.equal(appearance.contour, undefined); assert.equal(appearance.radius, 0);
  assert.deepEqual(NOTATION_ELEMENTS.filter(t => notationElement(ref, t).glyph === token), [type]);
  const points = polygon => polygon.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number));
  for (const width of [.1, 1, 20, 25, 38, 120, 169, 220, 9000]) for (const height of [.1, 1, 20, 28, 55, 90, 100, 9000]) {
    const box = notationBox(document, appearance, Object.freeze({ width, height })), rect = box.querySelector('.node-box'), glyph = box.querySelector(`.${token}-glyph`);
    assert.equal(box.children.length, 2); assert.equal(rect.tagName, 'rect');
    assert.deepEqual(['width', 'height', 'rx'].map(key => Number(rect.getAttribute(key))), [width, height, 0]);
    assert.equal(rect.hasAttribute('pointer-events'), false); assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    const polygons = [...glyph.querySelectorAll('polygon.node-detail')], hubs = [...glyph.querySelectorAll('circle.node-detail')];
    assert.equal(polygons.length, type === 'Equipment' ? 2 : 1); assert.equal(hubs.length, type === 'Equipment' ? 2 : 0);
    assert.equal(glyph.children.length, type === 'Equipment' ? 4 : 1);
    const ink = polygons.flatMap(p => { assert.equal(p.getAttribute('stroke-linejoin'), 'round'); return points(p); });
    if (type === 'Equipment') {
      const gears = polygons.map((p, i) => {
        const cx = Number(hubs[i].getAttribute('cx')), cy = Number(hubs[i].getAttribute('cy')), r = Number(hubs[i].getAttribute('r'));
        const pts = points(p), radii = pts.map(([x, y]) => Math.hypot(x - cx, y - cy)), min = Math.min(...radii), max = Math.max(...radii);
        assert.ok(r > 0 && r < min); assert.ok(max / min > 1.3, 'Distinct teeth, not circles');
        const peaks = radii.filter((v, j) => v > (min + max) / 2 && radii[(j + radii.length - 1) % radii.length] < (min + max) / 2);
        assert.ok(peaks.length >= 5); assert.equal(pts.length, peaks.length * 4);
        // Positive polygon area and each hub within every edge half-plane establish a closed toothed outline around its hub.
        const area = pts.reduce((sum, [x, y], j) => { const [nx, ny] = pts[(j + 1) % pts.length]; return sum + x * ny - y * nx; }, 0);
        assert.ok(area > 0);
        for (let j = 0; j < pts.length; j++) { const [x, y] = pts[j], [nx, ny] = pts[(j + 1) % pts.length]; assert.ok((nx - x) * (cy - y) - (ny - y) * (cx - x) > 0); }
        return { cx, cy, r, max };
      });
      assert.ok(gears[0].cx < gears[1].cx && gears[0].cy > gears[1].cy && gears[0].max > gears[1].max && gears[0].r > gears[1].r);
      const distance = Math.hypot(gears[1].cx - gears[0].cx, gears[1].cy - gears[0].cy);
      assert.ok(Math.abs(distance - gears[0].max - gears[1].max) < .1, 'Gear tips meet without disjoint decorations');
    } else {
      const pts = points(polygons[0]); assert.equal(pts.length, 10);
      assert.deepEqual(pts, [[2, 8], [2, 1], [4, 1], [4, 5], [8, 3], [8, 5], [12, 3], [12, 5], [16, 3], [16, 8]]);
      const ramps = pts.slice(1).map((p, i) => [pts[i], p]).filter(([a, b]) => b[0] > a[0] && b[1] < a[1]);
      assert.equal(ramps.length, 3); assert.equal(new Set(ramps.map(([, b]) => b[1])).size, 1);
      assert.ok(pts[1][1] < ramps[0][1][1]); assert.equal(pts[0][1], pts.at(-1)[1]);
    }
    const [x, y, scale] = glyph.getAttribute('transform').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok([x, y, scale].every(Number.isFinite) && scale > 0 && scale <= 1.4);
    for (const [px, py] of ink) { // Round joins limit the complete 1.25-unit stroke to half-width about every vertex.
      assert.ok(x + (px - .625) * scale >= 0 && x + (px + .625) * scale <= width);
      assert.ok(y + (py - .625) * scale >= 0 && y + (py + .625) * scale <= height);
    }
    const bottom = y + (Math.max(...ink.map(p => p[1])) + .625) * scale;
    assertGlyphCaptionClearance(appearance, { width, height }, { left: x + (Math.min(...ink.map(p => p[0])) - .625) * scale, right: x + (Math.max(...ink.map(p => p[0])) + .625) * scale, top: y + (Math.min(...ink.map(p => p[1])) - .625) * scale, bottom });
    if (width === 169 && height === 28) assert.ok(bottom < 8, 'Clear of full legend caption at baseline 18');
    assert.equal(box.querySelectorAll('image,use,script,foreignObject,a,path,polyline').length, 0);
  }
  for (const reference of [null, {}, { ...ref, version: 999 }, { ...ref, version: '2' }, { id: '<svg>', version: ref.version }]) assert.equal(notationBox(document, notationElement(reference, type), { width: 120, height: 55 }).querySelector(`.${token}-glyph`), null);
  for (const hostile of ['__proto__', 'constructor', '<img src=x>', `${type}" onload="x`, token]) assert.equal(notationBox(document, notationElement(ref, hostile), { width: 120, height: 55 }).querySelector(`.${token}-glyph`), null);
  for (const glyph of ['__proto__', 'url(https://evil)', '<svg/>', { equipment: true }, ['facility'], 1, true, null]) assert.equal(notationBox(document, { glyph }, { width: 120, height: 55 }).tagName, 'rect');
});

for (const type of ['Equipment', 'Facility']) test(`${type} rectangle agrees with independent mixed-contour controls through overlap, directions and Fit`, () => {
  const appearance = notationElement(ref, type);
  for (const otherContour of [0, 12, 'ellipse', 'octagon', 'folder', 'cloud', 'wavy']) for (const [x, y] of [[300, 200], [-300, -200], [300, -200], [-300, 200], [30, 15]]) {
    const occurrences = [{ id: 'a', bounds: { x: 0, y: 0, width: 120, height: 60 } }, { id: 'b', bounds: { x, y, width: 120, height: 60 } }];
    const connections = [['a', 'b'], ['b', 'a'], ['a', 'a']].map(([from, to], i) => ({ id: `c${i}`, source: { kind: 'occurrence', id: from }, target: { kind: 'occurrence', id: to }, routePoints: [{ kind: 'bend', point: { x: -170, y: 170 } }, { kind: 'bend', point: { x: 270, y: -170 } }], labelPosition: { x: 200, y: -200 } }));
    const state = JSON.stringify({ occurrences, connections }), contour = o => o.id === 'a' ? appearance.contour || appearance.radius : otherContour, reference = o => o.id === 'a' ? 0 : otherContour;
    for (const stored of [false, true]) {
      for (const c of connections) assert.deepEqual(connectionGeometry(c, occurrences, contour, stored, connections), connectionGeometry(c, occurrences, reference, stored, connections));
      assert.deepEqual(viewGeometryBounds(occurrences, connections, contour, stored), viewGeometryBounds(occurrences, connections, reference, stored));
    }
    assert.equal(JSON.stringify({ occurrences, connections }), state);
  }
});


test('ordinary corner glyphs occupy 27/28 canvas units while palette and legend retain their bounded allocations', () => {
  const technical = new Set(['monitor', 'cuboid', 'component', 'interface', 'plateau', 'equipment', 'facility']);
  let glyphs = 0;
  for (const type of NOTATION_ELEMENTS) {
    const appearance = notationElement(ref, type), bounds = Object.freeze({ width: 220, height: 90 });
    const corner = cornerGlyphLayout(appearance, bounds);
    if (!corner) continue;
    glyphs++;
    assert.equal(corner.width, technical.has(appearance.glyph) ? 28 : 27, type);
    const shape = notationBox(document, appearance, bounds), glyph = shape.querySelector('g[class$="-glyph"]');
    assert.equal(glyph.getAttribute('transform'), `translate(${corner.x} ${corner.y}) scale(${corner.scale})`);
    assert.equal(glyph.getAttribute('pointer-events'), 'none');
    for (const [width, height] of [[38, 20], [169, 28]]) {
      const preview = cornerGlyphLayout(appearance, { width, height });
      assert.ok(preview.scale <= 1, `${type}: compact preview is not enlarged`);
    }
  }
  assert.equal(glyphs, 35);
  assert.equal(cornerGlyphLayout({ glyph: '<svg/>', contour: 'octagon' }, { width: 220, height: 90 }), null);
});


test('initial and reset geometry display detect semantic or visual points and label-only positions across all views', () => {
  for (const collection of ['connections', 'visualConnectors']) for (const geometry of [{ routePoints: [{ kind: 'bend', point: { x: 20, y: 30 } }], labelPosition: null }, { routePoints: [], labelPosition: { x: 0, y: 0 } }]) {
    const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://schemka.test' }), doc = dom.window.document;
    let views = [{ connections: [], visualConnectors: [] }, { connections: [], visualConnectors: [], [collection]: [geometry] }], rendered = 0;
    const before = JSON.stringify(views), storage = JSON.stringify(dom.window.localStorage);
    const ui = installNotationUI({ document: doc, readViews: () => views, blocked: () => false, renderCanvas() { rendered++; }, report() {} });
    const checkbox = doc.getElementById('stored-geometry'); assert.equal(ui.storedGeometry, true); assert.equal(checkbox.checked, true);
    checkbox.click(); assert.equal(ui.storedGeometry, false); ui.refresh(); assert.equal(checkbox.checked, false);
    ui.resetStoredGeometry(); assert.equal(ui.storedGeometry, true); assert.equal(checkbox.checked, true);
    assert.equal(JSON.stringify(views), before); assert.equal(JSON.stringify(dom.window.localStorage), storage); assert.equal(rendered, 1);
    views = [{ connections: [{ routePoints: [], labelPosition: null }], visualConnectors: [] }]; ui.resetStoredGeometry(); assert.equal(ui.storedGeometry, false); assert.equal(checkbox.checked, false);
    dom.window.close();
  }
});
