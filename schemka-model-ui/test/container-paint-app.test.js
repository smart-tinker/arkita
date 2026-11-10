import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { setup, setStoredGeometry } from './app-test-fixture.js';
import { connectionGeometry } from '../src/connection-geometry.js';

for (const kind of ['visual', 'semantic', 'nested', 'cross']) test(`actual canvas and SVG keep ${kind} container lines above opaque fills and below endpoint nodes`, async t => {
  const h = await setup(t), store = createStore(createProject('Container paint regression'));
  const style = h.document.createElement('style'); style.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8'); h.document.head.append(style);
  const run = command => store.execute(command, store.revision).created, viewId = run({ type: 'createView', name: 'Nested lines' }).viewId;
  const containers = [];
  function container(semantic, parent = null) {
    const name = semantic ? 'Semantic container' : 'Visual container';
    const common = { viewId, name, parent, bounds: kind === 'cross' ? { x: semantic ? 450 : 0, y: 0, width: semantic ? 450 : 400, height: 500 } : { x: semantic && parent ? 40 : 0, y: semantic && parent ? 60 : 0, width: 900, height: 500 }, zIndex: 99, style: { fill: semantic ? '#ffeecc' : '#d9e7ee', stroke: '#123456', verticalAlign: 'top' } };
    const created = run(semantic ? { ...common, type: 'createElementAndOccurrence', elementType: 'Grouping' } : { ...common, type: 'createVisualNode', kind: 'group' });
    const ref = { kind: semantic ? 'occurrence' : 'visualNode', id: created.occurrenceId ?? created.visualNodeId };
    containers.push({ ...ref, name, bounds: common.bounds, fill: common.style.fill }); return ref;
  }
  let parent = container(kind === 'semantic'); if (kind === 'nested') parent = container(true, parent);
  const targetParent = kind === 'cross' ? container(true) : parent;
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Source node', parent, zIndex: 3, bounds: { x: 100, y: 130, width: 180, height: 90 } });
  const b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Role', name: 'Target node', parent: targetParent, zIndex: -2, bounds: { x: 560, y: 130, width: 180, height: 90 } });
  const source = { kind: 'occurrence', id: a.occurrenceId }, target = { kind: 'occurrence', id: b.occurrenceId };
  const line = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association', label: 'Обмен данными', source, target, routePoints: [{ kind: 'bend', point: { x: 420, y: 330 } }], labelPosition: { x: 420, y: 345 } });
  const visual = run({ type: 'createVisualConnector', viewId, name: 'Visual line', source, target, routePoints: [{ kind: 'bend', point: { x: 420, y: 80 } }] });
  const state = store.snapshot, view = state.views[0], bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const canvas = h.$('canvas'), figure = id => canvas.querySelector(`[data-id="${id}"]`);
  function assertPaint() {
    assert.equal(canvas.firstElementChild.localName, 'defs');
    const order = [...canvas.children].map(item => item.dataset.id);
    for (const container of containers) {
      assert.ok(order.indexOf(container.id) < order.indexOf(line.connectionId), 'opaque parent paints before semantic line');
      assert.ok(order.indexOf(container.id) < order.indexOf(visual.visualConnectorId), 'opaque parent paints before visual line');
      const group = figure(container.id); assert.ok(group.querySelector('.node-box')); assert.ok(group.textContent.includes(container.name));
      assert.equal(group.querySelector('.node-box').style.fill, container.fill); assert.equal(group.getAttribute('transform'), `translate(${container.bounds.x} ${container.bounds.y})`);
      assert.equal(group.getAttribute('role'), 'button'); assert.equal(group.getAttribute('tabindex'), '0');
    }
    if (kind === 'nested') assert.ok(order.indexOf(containers[0].id) < order.indexOf(containers[1].id), 'nested parent retains outer-before-inner order');
    for (const id of [line.connectionId, visual.visualConnectorId]) {
      assert.ok(order.indexOf(id) < order.indexOf(a.occurrenceId)); assert.ok(order.indexOf(id) < order.indexOf(b.occurrenceId));
      assert.notEqual(figure(id).style.display, 'none'); assert.ok(figure(id).querySelector('.line').getAttribute('d'));
    }
    if (kind !== 'cross') assert.ok(order.indexOf(b.occurrenceId) < order.indexOf(a.occurrenceId), 'leaf sibling zIndex order is retained');
  }
  function assertExport(text) {
    const exported = new h.window.DOMParser().parseFromString(text, 'image/svg+xml'); assert.equal(exported.querySelector('parsererror'), null);
    const groups = [...exported.documentElement.children].filter(item => item.localName === 'g');
    const index = text => groups.findIndex(item => item.querySelector('title')?.textContent.includes(text));
    for (const container of containers) { assert.ok(index(container.name) >= 0); assert.ok(index(container.name) < index('Обмен данными')); assert.ok(index(container.name) < index('Visual line')); }
    assert.ok(index('Обмен данными') < index('Source node')); assert.ok(index('Обмен данными') < index('Target node'));
    assert.ok(index('Visual line') < index('Source node')); if (kind !== 'cross') assert.ok(index('Target node') < index('Source node'));
    assert.ok([...exported.querySelectorAll('text')].some(item => item.textContent.includes('Обмен данными')));
  }
  for (const stored of [false, true]) {
    setStoredGeometry(h, stored); assertPaint();
    const geometry = connectionGeometry(view.connections[0], view.occurrences, () => 0, stored, view.connections);
    assert.equal(figure(line.connectionId).querySelector('.line').getAttribute('d'), geometry.d);
    assert.ok(figure(line.connectionId).querySelector('.relationship-label').textContent.includes('Обмен данными'));
    figure(containers[0].id).dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert.ok(figure(containers[0].id).classList.contains('selected'));
    assertExport((await h.download('download-svg')).toString()); assertPaint();
    h.$('export-report-button').click(); h.change('export-report-format', 'svg'); h.change('export-report-text-mode', 'text'); h.$('export-report-generate').click();
    const image = h.$('export-report-preview').querySelector('img'); assert.ok(image, h.$('export-report-feedback').textContent);
    assertExport(decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1))); h.$('export-report-cancel').click(); assertPaint();
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('undo').disabled, true);
  }
  const node = figure(a.occurrenceId); node.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
  const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = 'Edited source'; input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assertPaint(); h.$('undo').click(); assertPaint(); assert.deepEqual(await h.download(), bytes);
  h.$('redo').click(); assertPaint(); assert.ok(figure(a.occurrenceId).textContent.includes('Edited source')); h.$('undo').click();
  await h.load(bytes); assertPaint(); assert.deepEqual(await h.download(), bytes);
});
