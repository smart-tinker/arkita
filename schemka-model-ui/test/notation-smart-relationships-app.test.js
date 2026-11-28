import { production, setup } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { beforeUnload, searchPalette, smartHitSurface } from './notation-app-helpers.js';

test(`${production ? 'production' : 'source'} app: smart dialog keeps UNKNOWN separate, explicit and direction-preserving`, async t => {
  const { extendedEndpointFixture } = await import('./endpoint-fixture.js');
  const f = extendedEndpointFixture(), h = await setup(t); await h.load(serializeProjectFile(f.state));
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
  const bytes = await h.download(), history = h.$('history-state').textContent;
  h.$('smart-link-dialog').click(); assert.equal(h.$('link-dialog').open, true); assert.equal(h.$('smart-link-field').hidden, false);
  h.change('link-source', f.items.Product.occurrenceId); h.change('link-target', f.items.Deliverable.occurrenceId);
  assert.equal(h.$('smart-link-type').value, ''); assert.equal(h.$('link-submit').disabled, true);
  const groups = [...h.$('smart-link-type').querySelectorAll('optgroup')];
  const unknown = groups.find(g => g.label.startsWith('UNKNOWN · Прямое: Product') && g.label.includes('→ Deliverable'));
  assert.deepEqual([...unknown.children].map(o => o.value).sort(), ['Aggregation', 'Composition']);
  assert.ok(groups.some(g => g.label.startsWith('ALLOWED · Прямое: Product') && g.label.includes('→ Deliverable')));
  assert.ok(groups.some(g => g.label.startsWith('ALLOWED · Обратное: Deliverable') && g.label.includes('→ Product')));
  h.change('smart-link-type', 'Aggregation'); assert.equal(h.$('link-submit').disabled, false);
  assert.equal(h.$('link-assessment').dataset.assessment, 'UNKNOWN'); assert.match(h.$('link-note').textContent, /Допустимость не подтверждена/);
  assert.match(h.$('smart-link-direction').textContent, /Product.*→.*Deliverable/);
  h.$('link-dialog').close(); assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  h.$('smart-link-dialog').click(); h.change('link-source', f.items.Product.occurrenceId); h.change('link-target', f.items.Deliverable.occurrenceId); h.change('smart-link-type', 'Aggregation');
  h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const saved = await h.download(), state = deserializeProjectFile(saved), relation = state.relationships.find(r => !f.state.relationships.some(old => old.id === r.id));
  assert.equal(relation.source.id, f.items.Product.elementId); assert.equal(relation.target.id, f.items.Deliverable.elementId); assert.equal(relation.type, 'Aggregation');
  assert.match(h.$('history-state').textContent, /1 действий/); h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), saved);
});

test(`${production ? 'production' : 'source'} app: Magic Connector creates an allowed endpoint at an empty point in both orders and preserves one-step history`, async t => {
  const { endpointFixture } = await import('./endpoint-fixture.js');
  const fixture = endpointFixture(), h = await setup(t), canvas = h.$('canvas');
  async function run(state, { sourceId, newType, order, reverse = false, point = { x: 800, y: 500 }, cancelFirst = false, parentRef = null, shiftDrop = false }) {
    const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
    const source = canvas.querySelector(`[data-id="${sourceId}"]`), hit = smartHitSurface(h, source);
    const parentNode = parentRef && canvas.querySelector(`[data-id="${parentRef.id}"]`);
    if (shiftDrop) assert.ok(parentNode, 'the exact parent drawing is rendered');
    if (order === 'relation-first') {
      h.$('smart-link-tool').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, altKey: true }));
      assert.equal(h.$('magic-order-dialog').open, true); h.change('magic-order-type', 'Access'); assert.equal(h.$('magic-order-apply').disabled, false);
      h.$('magic-order-apply').click();
    } else h.$('smart-link-tool').click();
    h.pointer(source, 'pointerdown', 100, 100, 91); hit(shiftDrop ? parentNode : canvas);
    h.pointer(canvas, 'pointermove', point.x, point.y, 91);
    if (shiftDrop) {
      assert.equal(h.document.elementFromPoint(point.x, point.y), parentNode, 'the drop hits the exact parent drawing, not the canvas');
      const release = new h.window.Event('pointerup', { bubbles: true, cancelable: true });
      Object.assign(release, { button: 0, isPrimary: true, pointerId: 91, clientX: point.x, clientY: point.y, shiftKey: true });
      canvas.dispatchEvent(release);
    } else h.pointer(canvas, 'pointerup', point.x, point.y, 91);
    assert.equal(h.$('diagram-tools-dialog').open, true); assert.equal(h.$('diagram-search-order').value, order);
    assert.equal(h.$('diagram-source').value, sourceId); assert.equal(h.$('diagram-source').disabled, true);
    if (cancelFirst) {
      const history = h.$('history-state').textContent; h.$('diagram-tools-cancel').click();
      assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
      return { bytes, state };
    }
    h.$('diagram-search').value = newType; h.$('diagram-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
    if (reverse) h.change('diagram-reverse', 'reverse');
    assert.ok([...h.$('diagram-type').options].some(option => option.value === newType));
    assert.ok([...h.$('diagram-relationship').options].some(option => option.value === 'Access'));
    if (order === 'relation-first') assert.equal(h.$('diagram-relationship').value, 'Access');
    h.$('diagram-type').value = newType; h.$('diagram-type').dispatchEvent(new h.window.Event('change', { bubbles: true }));
    h.$('diagram-relationship').value = 'Access'; h.$('diagram-relationship').dispatchEvent(new h.window.Event('change', { bubbles: true }));
    h.$('diagram-name').value = 'Created endpoint'; h.$('diagram-relationship-label').value = 'Uses';
    h.$('diagram-tools-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    if (h.$('semantic-editing-dialog').open) {
      h.change('nesting-relation-0', '');
      h.$('semantic-editing-apply').click();
    }
    assert.equal(h.$('diagram-tools-dialog').open, false);
    const saved = await h.download(), after = deserializeProjectFile(saved), before = deserializeProjectFile(bytes);
    const element = after.elements.find(item => !before.elements.some(old => old.id === item.id));
    const occurrence = after.views.find(item => item.view.id === fixture.viewId).occurrences.find(item => item.concept.id === element.id);
    const relationship = after.relationships.find(item => !before.relationships.some(old => old.id === item.id));
    const view = after.views.find(item => item.view.id === fixture.viewId), connection = view.connections.find(item => item.relationshipId === relationship.id);
    const existing = before.views.find(item => item.view.id === fixture.viewId).occurrences.find(item => item.id === sourceId);
    assert.equal(element.type, newType); assert.equal(element.name, 'Created endpoint');
    assert.equal(after.relationships.length, before.relationships.length + 1);
    assert.equal(relationship.label, 'Uses'); assert.equal(relationship.type, 'Access');
    assert.deepEqual(relationship.source, reverse ? { kind: 'element', id: element.id } : existing.concept);
    assert.deepEqual(relationship.target, reverse ? existing.concept : { kind: 'element', id: element.id });
    assert.deepEqual(connection.source, { kind: 'occurrence', id: reverse ? occurrence.id : sourceId });
    assert.deepEqual(connection.target, { kind: 'occurrence', id: reverse ? sourceId : occurrence.id });
    assert.equal(occurrence.bounds.x, point.x - 105); assert.equal(occurrence.bounds.y, point.y - 45);
    assert.match(h.$('history-state').textContent, /1 действий/);
    h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), saved);
    return { bytes, state: after };
  }
  await run(fixture.state, { sourceId: fixture.items[0].occurrenceId, newType: 'DataObject', order: 'element-first', cancelFirst: true });
  await run(fixture.state, { sourceId: fixture.items[0].occurrenceId, newType: 'DataObject', order: 'element-first' });
  await run(fixture.state, { sourceId: fixture.items[0].occurrenceId, newType: 'DataObject', order: 'relation-first' });
  await run(fixture.state, { sourceId: fixture.items[2].occurrenceId, newType: 'ApplicationComponent', order: 'relation-first', reverse: true });
  const nestedStore = createStore(fixture.state), parent = nestedStore.execute({ type: 'createElementAndOccurrence', viewId: fixture.viewId, elementType: 'Service', name: 'Container', bounds: { x: 600, y: 250, width: 350, height: 300 } }, nestedStore.revision).created;
  const nested = await run(nestedStore.snapshot, { sourceId: fixture.items[0].occurrenceId, newType: 'DataObject', order: 'element-first', point: { x: 800, y: 400 }, parentRef: { kind: 'occurrence', id: parent.occurrenceId }, shiftDrop: true });
  const nestedElement = nested.state.elements.find(item => item.name === 'Created endpoint');
  assert.deepEqual(nested.state.views.find(item => item.view.id === fixture.viewId).occurrences.find(item => item.concept.id === nestedElement.id).parent, { kind: 'occurrence', id: parent.occurrenceId });
  const groupStore = createStore(fixture.state), group = groupStore.execute({ type: 'createVisualNode', viewId: fixture.viewId, kind: 'group', name: 'Visual group', bounds: { x: 600, y: 250, width: 350, height: 300 } }, groupStore.revision).created;
  const competingGroup = groupStore.execute({ type: 'createVisualNode', viewId: fixture.viewId, kind: 'group', name: 'Competing group', zIndex: 1, bounds: { x: 600, y: 250, width: 350, height: 300 } }, groupStore.revision).created;
  const groupParent = { kind: 'visualNode', id: group.visualNodeId };
  const nestedGroup = await run(groupStore.snapshot, { sourceId: fixture.items[0].occurrenceId, newType: 'DataObject', order: 'element-first', point: { x: 800, y: 400 }, parentRef: groupParent, shiftDrop: true });
  const nestedGroupView = nestedGroup.state.views.find(item => item.view.id === fixture.viewId);
  const groupElement = nestedGroup.state.elements.find(item => item.name === 'Created endpoint');
  const nestedGroupOccurrence = nestedGroupView.occurrences.find(item => item.concept.id === groupElement.id);
  const containingGroups = nestedGroupView.visualNodes.filter(item => item.kind === 'group'
    && nestedGroupOccurrence.bounds.x >= item.bounds.x && nestedGroupOccurrence.bounds.y >= item.bounds.y
    && nestedGroupOccurrence.bounds.x + nestedGroupOccurrence.bounds.width <= item.bounds.x + item.bounds.width
    && nestedGroupOccurrence.bounds.y + nestedGroupOccurrence.bounds.height <= item.bounds.y + item.bounds.height);
  assert.deepEqual(containingGroups.map(item => item.id).sort(), [group.visualNodeId, competingGroup.visualNodeId].sort());
  assert.deepEqual(nestedGroupOccurrence.parent, groupParent);
});

test(`${production ? 'production' : 'source'} app: manual relationship menu retains exact repeated connection anchors and both junction types with cancel and atomic undo`, async t => {
  const state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)), h = await setup(t);
  const view = state.views[0], source = view.occurrences[0], host = view.connections.at(-1), anchor = host.routePoints.find(point => point.kind === 'anchor');
  const targets = [
    { key: `${host.id}:${anchor.id}`, endpoint: { kind: 'connection', id: host.id, anchorId: anchor.id }, concept: { kind: 'relationship', id: host.relationshipId } },
    { key: `${host.id}:new`, concept: { kind: 'relationship', id: host.relationshipId } },
    ...view.occurrences.filter(item => item.concept.kind === 'junction').map(item => ({ key: item.id, endpoint: { kind: 'occurrence', id: item.id }, concept: item.concept })),
  ];
  for (const target of targets) {
    await h.load(bytes);
    const open = () => {
      h.document.querySelector('[data-command="smart-link-dialog"]').click(); assert.equal(h.$('link-dialog').open, true);
      assert.equal(h.$('link-endpoints').hidden, false); assert.equal(h.$('link-source').disabled, false);
      h.change('link-source', source.id); h.change('link-target', target.key); assert.equal(h.$('link-target').value, target.key);
      assert.equal(h.$('smart-link-type').value, ''); assert.equal(h.$('link-submit').disabled, true);
      h.change('smart-link-type', 'Association'); assert.equal(h.$('link-submit').disabled, false);
      assert.match(h.$('smart-link-type').selectedOptions[0].textContent, /правило концептов/);
      assert.doesNotMatch(h.$('smart-link-type').selectedOptions[0].textContent, /прямое|производное/);
    };
    open(); h.$('link-dialog').close(); h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('undo').disabled, true);
    open(); h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })); h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(h.$('link-dialog').open, false);
    const saved = await h.download(), after = deserializeProjectFile(saved), added = after.relationships.find(item => !state.relationships.some(old => old.id === item.id)), changedView = after.views.find(item => item.view.id === view.view.id), connection = changedView.connections.find(item => item.relationshipId === added.id);
    assert.deepEqual(added.source, source.concept); assert.deepEqual(added.target, target.concept); assert.equal(added.type, 'Association');
    if (target.endpoint) assert.deepEqual(connection.target, target.endpoint);
    else {
      const changedHost = changedView.connections.find(item => item.id === host.id);
      assert.equal(connection.target.id, host.id); assert.equal(changedHost.routePoints.length, host.routePoints.length + 1);
      assert.ok(changedHost.routePoints.some(point => point.kind === 'anchor' && point.id === connection.target.anchorId));
    }
    assert.deepEqual(changedView.occurrences, view.occurrences); assert.match(h.$('history-state').textContent, /1 действий/);
    h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), saved);
  }
});

for (const tool of ['smart-link-tool', 'create-readaccess']) test(`${production ? 'production' : 'source'} app: ${tool} captured drag uses exact repeated drawings, never moves, and ReadAccess keeps stored direction`, async t => {
  const { endpointFixture } = await import('./endpoint-fixture.js'); const f = endpointFixture(), store = createStore(f.state);
  const repeated = store.execute({ type: 'addOccurrence', viewId: f.viewId, concept: { kind: 'element', id: f.items[0].elementId }, bounds: { x: 20, y: 400, width: 180, height: 90 } }, store.revision).created.occurrenceId;
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)), h = await setup(t); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
  const source = h.$('canvas').querySelector(`[data-id="${repeated}"]`), target = h.$('canvas').querySelector(`[data-id="${f.items[2].occurrenceId}"]`), hit = smartHitSurface(h, source);
  const transform = source.getAttribute('transform'); h.$(tool).click(); assert.equal(h.$('link-dialog').open, false); assert.equal(beforeUnload(h), true);
  h.pointer(source, 'pointerdown', 100, 100, 41); assert.ok(h.$('canvas').querySelector('.smart-link-preview')); assert.equal(h.$('canvas').hasPointerCapture(41), true);
  hit(target); h.pointer(h.$('canvas'), 'pointermove', 500, 200, 41); assert.equal(source.getAttribute('transform'), transform); assert.equal(h.$('undo').disabled, true);
  h.pointer(h.$('canvas'), 'pointerup', 500, 200, 41); h.pointer(h.$('canvas'), 'pointerup', 500, 200, 41);
  assert.equal(h.$('canvas').querySelector('.smart-link-preview'), null); assert.equal(h.$('canvas').hasPointerCapture(41), false);
  if (tool === 'smart-link-tool') {
    assert.equal(h.$('link-dialog').open, true); assert.equal(h.$('link-endpoints').hidden, true); assert.equal(h.$('link-mode-field').hidden, true);
    assert.match(h.$('link-fixed-endpoints').textContent, /ApplicationComponent.*→.*DataObject/);
    assert.equal(h.$('link-source').value, repeated); assert.equal(h.$('link-target').value, f.items[2].occurrenceId); assert.equal(h.$('smart-link-type').value, '');
    h.change('link-source', f.items[1].occurrenceId); assert.equal(h.$('link-source').value, repeated, 'Fixed endpoints cannot be retargeted by a stale select change');
    h.change('smart-link-type', 'ReadAccess'); assert.equal(h.$('link-assessment').dataset.assessment, 'ALLOWED'); assert.match(h.$('smart-link-type').selectedOptions[0].textContent, /производное/);
    h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  } else assert.equal(h.$('link-dialog').open, false);
  const connection = h.$('canvas').querySelector('.connection.selected'); assert.equal(connection.querySelector('.line').getAttribute('marker-start'), 'url(#notation-canvas-open)');
  const saved = await h.download(), after = deserializeProjectFile(saved), added = after.relationships.find(r => !state.relationships.some(old => old.id === r.id));
  assert.equal(added.source.id, f.items[0].elementId); assert.equal(added.target.id, f.items[2].elementId);
  const drawing = after.views.find(v => v.view.id === f.viewId).connections.find(c => c.relationshipId === added.id);
  assert.equal(drawing.source.id, repeated); assert.equal(drawing.target.id, f.items[2].occurrenceId); assert.deepEqual(after.views.find(v => v.view.id === f.viewId).occurrences, deserializeProjectFile(bytes).views.find(v => v.view.id === f.viewId).occurrences);
  assert.match(h.$('history-state').textContent, /1 действий/); h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), saved);
});

for (const tool of ['smart-link-tool', 'create-readaccess']) test(`${production ? 'production' : 'source'} app: ${tool} lifecycle and bad releases retire capture without a model edit`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const viewId = state.views[0].view.id, id = state.views[0].occurrences[0].id;
  const modes = ['Escape', 'blur', 'resize', 'pointercancel', 'lostpointercapture', 'file', 'history', 'view', 'filter', 'context', 'second', 'blank', 'outside', 'connection', 'junction', 'detached', 'capture-failure'];
  for (const mode of modes) {
    if (tool !== 'smart-link-tool' && mode === 'junction') continue;
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${viewId}"]`).click(); h.$('palette-clear').click();
    const source = h.$('canvas').querySelector(`[data-id="${id}"]`), hit = smartHitSurface(h, source), history = h.$('history-state').textContent;
    const originalCapture = h.$('canvas').setPointerCapture;
    if (mode === 'capture-failure') h.$('canvas').setPointerCapture = () => { throw Error('capture unavailable'); };
    h.$(tool).click(); h.pointer(source, 'pointerdown', 100, 100, 51);
    h.$('canvas').setPointerCapture = originalCapture;
    if (mode === 'Escape') h.document.body.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    else if (mode === 'blur' || mode === 'resize') h.window.dispatchEvent(new h.window.Event(mode));
    else if (mode === 'pointercancel' || mode === 'lostpointercapture') h.pointer(h.$('canvas'), mode, 100, 100, 51);
    else if (mode === 'file') { h.$('file-button').click(); h.$('file-dialog').close(); }
    else if (mode === 'history') h.document.body.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    else if (mode === 'view') h.document.querySelector(`[data-view-scope="tree"][data-view-id="${state.views[1].view.id}"]`).click();
    else if (mode === 'filter') searchPalette(h, 'Node');
    else if (mode === 'context') { source.dispatchEvent(new h.window.MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true, clientX: 100, clientY: 100 })); h.document.body.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
    else if (mode === 'second') h.pointer(source, 'pointerdown', 100, 100, 52);
    else if (mode === 'detached') source.remove();
    else if (mode === 'connection') hit(h.$('canvas').querySelector('.connection'));
    else if (mode === 'junction') hit(h.$('canvas').querySelector('.junction'));
    else if (mode === 'blank') hit(h.$('canvas'));
    h.pointer(h.$('canvas'), 'pointerup', mode === 'outside' ? 10000 : 100, 100, 51); h.pointer(h.$('canvas'), 'pointerup', 100, 100, 51);
    assert.equal(h.$('canvas').querySelector('.smart-link-preview'), null, mode); assert.equal(h.$('canvas').hasPointerCapture(51), false, mode); assert.equal(h.$('link-dialog').open, false, mode);
    assert.equal(h.$('history-state').textContent, history, mode); assert.equal(h.$(tool).getAttribute('aria-pressed'), 'false', mode);
    assert.deepEqual(await h.download(), bytes, mode);
  }
});

test(`${production ? 'production' : 'source'} app: collapsed smart endpoints reject and finish errors report only after capture/preview cleanup`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const view = state.views[0], observations = [], descriptor = Object.getOwnPropertyDescriptor(h.window.Node.prototype, 'textContent');
  Object.defineProperty(h.$('status'), 'textContent', { configurable: true,
    get() { return descriptor.get.call(this); },
    set(value) { if (value.includes('synthetic finish lookup')) observations.push({ preview: Boolean(h.$('canvas').querySelector('.smart-link-preview')), captured: h.$('canvas').hasPointerCapture(61), pressed: h.$('smart-link-tool').getAttribute('aria-pressed') }); descriptor.set.call(this, value); },
  });
  for (const mode of ['collapsed-start', 'collapsed-source', 'collapsed-target', 'finish-error']) {
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
    const source = h.$('canvas').querySelector(`[data-id="${view.occurrences[0].id}"]`), target = h.$('canvas').querySelector(`[data-id="${view.occurrences[1].id}"]`), hit = smartHitSurface(h, source), history = h.$('history-state').textContent;
    if (mode === 'collapsed-start') source.style.visibility = 'collapse';
    h.$('smart-link-tool').click(); h.pointer(source, 'pointerdown', 100, 100, 61);
    if (mode === 'collapsed-start') assert.equal(h.$('canvas').querySelector('.smart-link-preview'), null);
    else assert.ok(h.$('canvas').querySelector('.smart-link-preview'));
    if (mode === 'collapsed-source') source.style.visibility = 'collapse';
    if (mode === 'collapsed-target') target.style.visibility = 'collapse';
    if (mode === 'finish-error') source.getClientRects = () => { throw Error('synthetic finish lookup'); };
    hit(target); h.pointer(h.$('canvas'), 'pointerup', 300, 200, 61); h.pointer(h.$('canvas'), 'pointerup', 300, 200, 61);
    delete source.getClientRects;
    assert.equal(h.$('link-dialog').open, false, mode); assert.equal(h.$('canvas').hasPointerCapture(61), false, mode); assert.equal(h.$('canvas').querySelector('.smart-link-preview'), null, mode);
    assert.equal(h.$('history-state').textContent, history, mode); assert.deepEqual(await h.download(), bytes, mode);
  }
  assert.deepEqual(observations, [{ preview: false, captured: false, pressed: 'false' }]);
});
