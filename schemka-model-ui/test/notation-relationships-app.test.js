import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { production, setup, richLifecycleFixture, setStoredGeometry } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';
import { DRAFT_NOTATION, NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, notationElement, notationRelationship } from '../src/notation.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { connectionGeometry } from '../src/connection-geometry.js';
import { openProfile, drawTypedRelationship, beginLayoutEdit } from './notation-app-helpers.js';

function reuseRelationship(h, relationshipId) {
  const item = h.$('relationships').querySelector(`[data-relationship-id="${relationshipId}"]`);
  assert.ok(item, 'Existing relationship is available through the model tree');
  item.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 40 }));
  const action = h.$('context-menu').querySelector('[data-context-action="reuse-relationship"]');
  assert.ok(action); action.click();
  assert.equal(h.$('link-dialog').open, true); assert.equal(h.$('existing-link').value, relationshipId);
}

test(`${production ? 'production' : 'source'} app: current relation catalogue supports all fifteen UI creations, shared multiview edits and exact fresh-session files`, async t => {
  const {expectedEndpointDecision}=await import('./endpoint-oracle.js');
  const fixture = richLifecycleFixture(), store = createStore(fixture.state);
  const itemsByType = {};
  for (const elementType of NOTATION_ELEMENTS) { const item = store.execute({ type: 'createElementAndOccurrence', viewId: fixture.viewId, elementType, name: elementType, bounds: { x: 40, y: 400, width: 180, height: 90 } }, store.revision).created; itemsByType[elementType] = item; store.execute({ type: 'addOccurrence', viewId: fixture.otherViewId, concept: { kind: 'element', id: item.elementId }, bounds: { x: 500, y: 400, width: 180, height: 90 } }, store.revision); }
  const bytes = Buffer.from(serializeProjectFile(store.snapshot)), expected = structuredClone(store.snapshot);
  const main = expected.views.find(view => view.view.id === fixture.viewId), other = expected.views.find(view => view.view.id === fixture.otherViewId);
  let saved;
  await t.test('direct/reverse/self creation, raw route edit, shared rename and relation reuse', async phase => {
    const h = await setup(phase); await h.load(bytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
    assert.equal(h.$('canvas').dataset.notation, DRAFT_NOTATION);
    const created = [];
    for (const [index, type] of NOTATION_RELATIONSHIPS.entries()) {
      const pair = NOTATION_ELEMENTS.flatMap(a => NOTATION_ELEMENTS.map(b => [a, b])).find(([a, b]) => expectedEndpointDecision(a, type, b).status === 'ALLOWED');
      const source = itemsByType[pair[0]], target = itemsByType[pair[1]];
      drawTypedRelationship(h, type, source.occurrenceId, target.occurrenceId);
      const label = ''; assert.equal(h.document.querySelector('#inspector-content .relationship-assessment').dataset.assessment,expectedEndpointDecision(expected.elements.find(item=>item.id===source.elementId).type,type,expected.elements.find(item=>item.id===target.elementId).type).status);
      const group = h.$('canvas').querySelector('.connection.selected'), id = group.dataset.renameId;
      const relation = { id, type, source: { kind: 'element', id: source.elementId }, target: { kind: 'element', id: target.elementId }, label, documentation: '', properties: propertyEntries({}) };
      const route = { id: group.dataset.id, relationshipId: id, source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId }, routePoints: [], labelPosition: null, style: {} };
      expected.relationships.push(relation); main.connections.push(route); created.push({ relation, route });
      const appearance = notationRelationship(expected.project.metamodel, type), path = group.querySelector('.line');
      for (const [position, kind] of [['start', appearance.startMarkerKind], ['end', appearance.markerKind]]) assert.equal(path.getAttribute(`marker-${position}`), kind ? `url(#notation-canvas-${kind})` : null);
      assert.equal(group.querySelector('.hit').hasAttribute('marker-start'), false); assert.equal(group.querySelector('.hit').hasAttribute('marker-end'), false);
    }
    const read = created.find(item => item.relation.type === 'ReadAccess'); beginLayoutEdit(h, read.route.id);
    h.$('layout-add-point').click(); h.pointer(h.$('canvas'), 'pointerdown', 300, 10); h.pointer(h.$('canvas'), 'pointerup', 300, 10);
    read.route.routePoints.push({ kind: 'bend', point: { x: 300, y: 10 } });
    assert.equal(h.$('canvas').querySelector(`[data-id="${read.route.id}"] .line`).getAttribute('marker-start'), 'url(#notation-canvas-open)');
    h.$('undo').click(); h.$('redo').click(); setStoredGeometry(h, false);
    const readGroup = h.$('canvas').querySelector(`[data-id="${read.route.id}"]`);
    readGroup.dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = h.document.querySelector('.inline-editor input'); input.value = 'Shared ReadAccess rename';
    input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); read.relation.label = input.value;
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click();
    for (const { relation } of created) {
      const source = other.occurrences.find(item => item.concept.id === relation.source.id), target = other.occurrences.find(item => item.concept.id === relation.target.id);
      reuseRelationship(h, relation.id); h.change('link-source', source.id); h.change('link-target', target.id);
      assert.equal(h.$('link-assessment').dataset.assessment,expectedEndpointDecision(expected.elements.find(item=>item.id===relation.source.id).type,relation.type,expected.elements.find(item=>item.id===relation.target.id).type).status); h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
      const group = h.$('canvas').querySelector('.connection.selected');
      other.connections.push({ id: group.dataset.id, relationshipId: relation.id, source: { kind: 'occurrence', id: source.id }, target: { kind: 'occurrence', id: target.id }, routePoints: [], labelPosition: null, style: {} });
    }
    openProfile(h); assert.equal(h.$('profile-catalog').children.length, 59); assert.match(h.$('profile-normative').textContent, /UNKNOWN/); h.$('profile-dialog').close();
    assert.match(h.$('notation-legend').textContent, /11 базовых отношений и 4 варианта интерфейса/);
    saved = await h.download(); assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
  });
  await t.test('fresh app keeps endpoint identities and raw routes exact across themes, stored geometry ON/OFF and Mermaid exports', async phase => {
    const h = await setup(phase); await h.load(saved); assert.equal(h.$('relationship-enable'), null); assert.equal(h.$('undo').disabled, true);
    for (const view of expected.views) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
      assert.equal(h.$('notation-legend-items').querySelectorAll('.connection').length, 15);
      for (const stored of [false, true]) {
        setStoredGeometry(h, stored);
        for (const theme of ['light', 'dark']) {
          h.change('theme-mode', theme);
          for (const route of view.connections) {
            const relation = expected.relationships.find(item => item.id === route.relationshipId), appearance = notationRelationship(expected.project.metamodel, relation.type);
            const group = h.$('canvas').querySelector(`[data-id="${route.id}"]`), line = group.querySelector('.line');
            for (const [position, kind] of [['start', appearance.startMarkerKind], ['end', appearance.markerKind]]) assert.equal(line.getAttribute(`marker-${position}`), kind ? `url(#notation-canvas-${kind})` : null);
            assert.equal(group.querySelector('.hit').getAttribute('d'), line.getAttribute('d'));
          }
        }
      }
      assert.equal((await h.download('download-mermaid')).toString(), exportMermaid(expected, view.view.id));
    }
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), saved);
    const ids = [...h.document.querySelectorAll('[id]')].map(element => element.id); assert.equal(ids.length, new Set(ids).size);
    assert.equal(h.document.querySelectorAll('#canvas img,#canvas image,#canvas script,#canvas use').length, 0);
  });
});

function openMultiplicity(h, relationshipId) {
  h.$('relationships').querySelector(`[data-relationship-id="${relationshipId}"]`).click();
  h.document.querySelector('[data-inspector-action="multiplicity"]').click();
  assert.equal(h.$('multiplicity-dialog').open, true);
}

const applyMultiplicity = h => h.$('multiplicity-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));

function editMultiplicity(h, end, value) {
  if (h.$(`multiplicity-${end}-value`).disabled) h.$(`multiplicity-${end}-set`).click();
  h.$(`multiplicity-${end}-value`).value = value;
  h.$(`multiplicity-${end}-value`).dispatchEvent(new h.window.Event('input', { bubbles: true }));
}

test(`${production ? 'production' : 'source'} app: raw multiplicities stay shared, distinct and inert through edit, route/name geometry, undo and independent file reopen`, async t => {
  const f = richLifecycleFixture(), state = structuredClone(f.state), relationship = state.relationships.find(item => item.id === f.relation.relationshipId);
  relationship.type = 'ReadAccess'; relationship.sourceMultiplicity = '\r\n<script>&日本語\r'; relationship.targetMultiplicity = '';
  const original = Buffer.from(serializeProjectFile(state)); let saved, expected;
  await t.test('untouched/reverted/cancelled raw values, explicit edits and resets preserve unrelated data', async phase => {
    const h = await setup(phase); await h.load(original);
    openMultiplicity(h, relationship.id); assert.equal(h.$('multiplicity-source-value').value, '\n<script>&日本語\n');
    assert.equal(h.$('multiplicity-target-value').disabled, false); assert.match(h.$('multiplicity-target-presence').textContent, /пустая/);
    applyMultiplicity(h); assert.equal(h.$('undo').disabled, true); assert.deepEqual(await h.download(), original);
    openMultiplicity(h, relationship.id); editMultiplicity(h, 'source', 'changed'); editMultiplicity(h, 'source', '\n<script>&日本語\n');
    applyMultiplicity(h); assert.deepEqual(await h.download(), original);
    openMultiplicity(h, relationship.id); editMultiplicity(h, 'source', '*'); h.$('multiplicity-target-remove').click(); h.$('multiplicity-dialog').close();
    applyMultiplicity(h); assert.deepEqual(await h.download(), original);
    openMultiplicity(h, relationship.id); editMultiplicity(h, 'source', '1..*'); editMultiplicity(h, 'target', '<img onerror=x>\n' + 'x'.repeat(80));
    assert.equal(h.$('multiplicity-source-diagnostic').dataset.status, 'CONFIRMED_SYNTAX');
    assert.equal(h.$('multiplicity-target-diagnostic').dataset.status, 'UNVERIFIED');
    applyMultiplicity(h); applyMultiplicity(h); assert.match(h.$('history-state').textContent, /1 действий/);
    expected = structuredClone(state); const changed = expected.relationships.find(item => item.id === relationship.id);
    changed.sourceMultiplicity = '1..*'; changed.targetMultiplicity = '<img onerror=x>\n' + 'x'.repeat(80);
    h.$('undo').click(); assert.deepEqual(await h.download(), original); h.$('redo').click();
    for (const view of expected.views.filter(view => view.connections.some(route => route.relationshipId === relationship.id))) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
      for (const stored of [false, true]) {
        setStoredGeometry(h, stored);
        for (const theme of ['light', 'dark']) {
          h.change('theme-mode', theme); h.$('fit-button').click();
          const [left, top, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
          for (const route of view.connections.filter(route => route.relationshipId === relationship.id)) {
            const group = h.$('canvas').querySelector(`[data-id="${route.id}"]`), source = group.querySelector('[data-multiplicity-end="source"]'), target = group.querySelector('[data-multiplicity-end="target"]');
            assert.equal(source.firstChild.nodeValue, '1..*'); assert.match(target.firstChild.nodeValue, /…$/); assert.equal(Array.from(target.firstChild.nodeValue).length, 16);
            assert.equal(target.querySelector('title').textContent, changed.targetMultiplicity); assert.equal(source.querySelector('title').textContent, changed.sourceMultiplicity);
            assert.equal(group.querySelector('.relationship-label').textContent.includes('1..*'), false);
            for (const label of [source, target]) {
              const x = Number(label.getAttribute('x')), y = Number(label.getAttribute('y')), size = Array.from(label.firstChild.nodeValue).length * 22 + 8;
              const start = x - (label.getAttribute('text-anchor') === 'end' ? size : label.getAttribute('text-anchor') === 'middle' ? size / 2 : 0);
              assert.ok(start >= left && start + size <= left + width && y - 16 >= top && y + 8 <= top + height);
            }
            assert.equal(group.querySelector('.line').getAttribute('marker-start'), 'url(#notation-canvas-open)');
          }
        }
      }
    }
    assert.equal(h.$('canvas').querySelectorAll('img,script,image,use').length, 0);
    saved = await h.download(); assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
    // Removing the source is a separate explicit operation; the target string stays exact.
    openMultiplicity(h, relationship.id); h.$('multiplicity-source-remove').click(); applyMultiplicity(h);
    const removed = deserializeProjectFile(await h.download()).relationships.find(item => item.id === relationship.id);
    assert.equal(Object.hasOwn(removed, 'sourceMultiplicity'), false); assert.equal(removed.targetMultiplicity, changed.targetMultiplicity);
    h.$('undo').click(); assert.deepEqual(await h.download(), saved);
    openMultiplicity(h, relationship.id); applyMultiplicity(h); assert.equal(h.$('redo').disabled, false, 'No-op Apply preserves redo');
  });
  await t.test('new session preserves complete raw data and leaves name-label layout separate from end labels', async phase => {
    const h = await setup(phase); await h.load(saved); assert.deepEqual(await h.download(), saved);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
    const route = expected.views.find(view => view.view.id === f.viewId).connections.find(item => item.relationshipId === relationship.id);
    beginLayoutEdit(h, route.id);
    const group = () => h.$('canvas').querySelector(`[data-id="${route.id}"]`);
    assert.equal(group().querySelectorAll('.layout-edit-label').length, 1); assert.equal(group().querySelector('.layout-edit-label').classList.contains('relationship-label'), true);
    assert.equal(group().querySelectorAll('.multiplicity-label.layout-edit-label').length, 0);
    const before = [...group().querySelectorAll('.multiplicity-label')].map(item => [item.getAttribute('x'), item.getAttribute('y')]);
    const name = group().querySelector('.relationship-label'); h.pointer(name, 'pointerdown', 200, 100); h.pointer(h.$('canvas'), 'pointerup', 220, 110);
    assert.deepEqual([...group().querySelectorAll('.multiplicity-label')].map(item => [item.getAttribute('x'), item.getAttribute('y')]), before);
    const result = deserializeProjectFile(await h.download()); assert.deepEqual(result.relationships, deserializeProjectFile(saved).relationships);
    h.$('undo').click(); assert.deepEqual(await h.download(), saved);
  });
});

test(`${production ? 'production' : 'source'} app: multiplicity drafts obey modal, gesture, file and stale-view boundaries; Fit retains measured and unavailable-label bounds`, async t => {
  const h = await setup(t), f = richLifecycleFixture(), state = structuredClone(f.state);
  const relation = state.relationships.find(item => item.id === f.relation.relationshipId); relation.sourceMultiplicity = '1234567890123456';
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes); setStoredGeometry(h, false);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
  openMultiplicity(h, relation.id); editMultiplicity(h, 'target', 'draft\ntext');
  assert.equal(h.pointer(h.$('stored-geometry'), 'pointerdown').defaultPrevented, true);
  h.$('stored-geometry').checked = true; h.$('stored-geometry').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.equal(h.$('stored-geometry').checked, false); assert.equal(h.$('multiplicity-target-value').value, 'draft\ntext');
  h.$('multiplicity-target-value').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(h.$('multiplicity-dialog').open, true); assert.equal(h.$('undo').disabled, true);
  h.$('file-button').click(); assert.equal(h.$('multiplicity-dialog').open, false); applyMultiplicity(h); h.$('file-dialog').close();
  assert.deepEqual(await h.download(), bytes);

  openMultiplicity(h, relation.id); editMultiplicity(h, 'target', '*');
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.otherViewId}"]`).click(); applyMultiplicity(h);
  assert.match(h.$('multiplicity-error').textContent, /изменились/); h.$('multiplicity-dialog').close(); assert.deepEqual(await h.download(), bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
  h.$('relationships').querySelector(`[data-relationship-id="${relation.id}"]`).click();
  const edit = h.document.querySelector('[data-inspector-action="multiplicity"]');
  const node = h.$('canvas').querySelector('.node'); node.dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true }));
  const input = h.document.querySelector('.inline-editor input'); input.value = 'Uncommitted name'; edit.click();
  assert.equal(h.$('multiplicity-dialog').open, false); assert.equal(input.value, 'Uncommitted name');
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  h.pointer(node, 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 130, 140); edit.click();
  assert.equal(h.$('multiplicity-dialog').open, false); h.pointer(h.$('canvas'), 'pointercancel');
  h.$('file-button').click(); h.$('new-project').click(); edit.click(); assert.equal(h.$('multiplicity-dialog').open, false);
  h.$('cancel-load').click(); h.$('file-dialog').close(); assert.deepEqual(await h.download(), bytes);

  const captionBBox = h.window.SVGElement.prototype.getBBox;
  h.$('fit-button').click(); const fallback = h.$('canvas').getAttribute('viewBox');
  h.window.SVGElement.prototype.getBBox = function () { return this.matches('.node-type,.node-title') ? captionBBox.call(this) : { x: 0, y: 0, width: 0, height: 0 }; };
  h.$('fit-button').click(); assert.equal(h.$('canvas').getAttribute('viewBox'), fallback);
  h.window.SVGElement.prototype.getBBox = function () {
    if (this.matches('.node-type,.node-title')) return captionBBox.call(this);
    return this.matches('.multiplicity-label') ? { x: -4000, y: -3000, width: 3000, height: 1000 } : { x: 0, y: 0, width: 0, height: 0 };
  };
  h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
  assert.ok(x <= -4004 && y <= -3004 && x + width >= -996 && y + height >= -1996);
  assert.deepEqual(await h.download(), bytes);
  assert.match(readFileSync(new URL('../style.css', import.meta.url), 'utf8'), /\.connection \.multiplicity-label\s*\{[^}]*pointer-events:none/);
});

test(`${production ? 'production' : 'source'} app: verified Access endpoint diagnostics protect creation and preserve all 36 imported records, shared reuse and fresh file reopen`, async t => {
  const { endpointFixture, ACCESS_TYPES, APPLICATION_TYPES, expectedAccessStatus } = await import('./endpoint-fixture.js');
  const f=endpointFixture({ relationships: true }), expected=structuredClone(f.state), main=expected.views.find(view=>view.view.id===f.viewId), other=expected.views.find(view=>view.view.id===f.otherViewId);
  const statusFor = relation => ACCESS_TYPES.includes(relation.type) ? expectedAccessStatus(expected.elements.find(item=>item.id===relation.source.id).type, expected.elements.find(item=>item.id===relation.target.id).type) : 'UNKNOWN';
  const submit = h => h.$('link-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
  const assertInspector = (h,status) => {
    assert.equal(h.document.querySelector('#inspector-content .relationship-assessment').dataset.assessment,status);
    assert.match(h.document.querySelector('#inspector-content .relationship-assessment').textContent,/Нормативная оценка: UNKNOWN/);
    assert.equal(h.document.querySelector('#inspector-content .assessment-evidence a').href,'https://publications.opengroup.org/standards/archimate/c260');
  };
  let saved;
  await t.test('all combinations reject forbidden creation, create 8 derived and retain imported failures',async phase=>{
    const h=await setup(phase);await h.load(serializeProjectFile(f.state));h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
    for(const type of ACCESS_TYPES)for(const [si,source]of f.items.entries())for(const [ti,target]of f.items.entries()) {
      const status=expectedAccessStatus(APPLICATION_TYPES[si],APPLICATION_TYPES[ti]);
      const history = h.$('history-state').textContent;
      drawTypedRelationship(h, type, source.occurrenceId, target.occurrenceId);
      assert.match(h.$('status').textContent,/Нормативная оценка: UNKNOWN/);
      if (status === 'FORBIDDEN') { assert.match(h.$('status').textContent, /не создана/); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('canvas').querySelectorAll('.connection').length, expected.relationships.length); continue; }
      const details = h.document.querySelector('#inspector-content .assessment-evidence');
      assert.ok(details.textContent.includes(`${APPLICATION_TYPES[si]} → ${type} → ${APPLICATION_TYPES[ti]}`));
      assert.match(h.document.querySelector('#inspector-content .relationship-assessment').textContent,/Допустимо как производная связь\. Можно изобразить напрямую/);
      const label='';
      assert.equal(h.$('link-dialog').open,false);assert.equal(h.$('canvas').querySelectorAll('.connection').length,expected.relationships.length+1);
      const group=h.$('canvas').querySelector('.connection.selected'),relation={id:group.dataset.renameId,type,source:{kind:'element',id:source.elementId},target:{kind:'element',id:target.elementId},label, documentation: '', properties: propertyEntries({})};
      expected.relationships.push(relation);main.connections.push({id:group.dataset.id,relationshipId:relation.id,source: { kind: 'occurrence', id: source.occurrenceId },target: { kind: 'occurrence', id: target.occurrenceId },routePoints: [],labelPosition: null, style: {}});
      assertInspector(h,status);
      if(type==='ReadAccess')assert.equal(group.querySelector('.line').getAttribute('marker-start'),'url(#notation-canvas-open)');
    }
    assert.equal(expected.relationships.length,45);assert.match(h.$('history-state').textContent,/8 действий/);
    h.$('undo').click();assert.equal(h.$('canvas').querySelectorAll('.connection').length,44);h.$('redo').click();assert.equal(h.$('canvas').querySelectorAll('.connection').length,45);
    // A cancelled palette tool and a late release cannot create an extra link.
    const history=h.$('history-state').textContent;h.$('create-readaccess').click();
    h.document.body.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    h.pointer(h.$('canvas'), 'pointerup', 100, 100, 71); assert.equal(h.$('history-state').textContent,history);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.otherViewId}"]`).click();
    for(const relation of expected.relationships) {
      const source=other.occurrences.find(item=>item.concept.id===relation.source.id),target=other.occurrences.find(item=>item.concept.id===relation.target.id);
      reuseRelationship(h,relation.id);h.change('link-source',source.id);h.change('link-target',target.id);
      assert.equal(h.$('link-assessment').dataset.assessment,statusFor(relation));assert.equal(h.$('link-submit').disabled,false);submit(h);submit(h);
      const group=h.$('canvas').querySelector('.connection.selected');other.connections.push({id:group.dataset.id,relationshipId:relation.id,source: { kind: 'occurrence', id: source.id },target: { kind: 'occurrence', id: target.id },routePoints: [],labelPosition: null, style: {}});
      assertInspector(h,statusFor(relation));
    }
    openProfile(h);assert.match(h.$('profile-local').textContent,/ALLOWED: 16 · FORBIDDEN: 28 · UNKNOWN: 1/);assert.match(h.$('profile-local').textContent,/Подтверждённых производных связей: 16/);
    assert.match(h.$('profile-normative').textContent,/Нормативная оценка: UNKNOWN/);assert.equal(h.$('profile-results').children.length,45);
    assert.equal(h.$('profile-dialog').querySelectorAll('img,script').length,0);h.$('profile-dialog').close();
    saved=await h.download();assert.deepEqual(deserializeProjectFile(saved),deserializeProjectFile(serializeProjectFile(expected)));
    assert.equal((await h.download('download-mermaid')).toString(),exportMermaid(expected,f.otherViewId));
  });
  await t.test('fresh-session inspector and saved-geometry ON/OFF retain stored endpoint roles and exact raw files',async phase=>{
    const h=await setup(phase);await h.load(saved);assert.equal(h.$('undo').disabled,true);assert.equal(h.$('redo').disabled,true);
    for(const view of expected.views) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
      for(const stored of [false,true]) {
        setStoredGeometry(h,stored);
        for(const connection of view.connections) {
          const relation=expected.relationships.find(item=>item.id===connection.relationshipId),group=h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
          h.pointer(group,'pointerdown',400,200);h.pointer(h.$('canvas'),'pointerup',400,200);assertInspector(h,statusFor(relation));
          const source=expected.elements.find(item=>item.id===relation.source.id).type,target=expected.elements.find(item=>item.id===relation.target.id).type;
          assert.ok(h.document.querySelector('#inspector-content .assessment-evidence').textContent.includes(`${source} → ${relation.type} → ${target}`));
        }
      }
      assert.equal((await h.download('download-mermaid')).toString(),exportMermaid(expected,view.view.id));assert.deepEqual(await h.download(),saved);
    }
    assert.equal(h.$('file-state').dataset.dirty,'false');assert.equal(h.$('undo').disabled,true);assert.equal(h.$('redo').disabled,true);
  });
});

test(`${production ? 'production' : 'source'} app: expanded endpoint classes and every relation family protect new creation across shared views and exact imported drafts`, async t => {
  const {extendedEndpointFixture}=await import('./endpoint-fixture.js');
  const {expectedEndpointDecision,verifiedElementTypes,verifiedRelationshipTypes}=await import('./endpoint-oracle.js');
  const f=extendedEndpointFixture(),expected=structuredClone(f.state),main=expected.views.find(view=>view.view.id===f.viewId),other=expected.views.find(view=>view.view.id===f.otherViewId);
  const cases=[];
  // Pick representatives from the independent source ledger, never from runtime
  // classifications. Exhaustive full-catalogue triple coverage is in the pure formatter suite.
  for(const type of verifiedRelationshipTypes)for(const requested of ['direct','derived','FORBIDDEN']) {
    let found;
    for(const source of verifiedElementTypes)for(const target of verifiedElementTypes) {
      const decision=expectedEndpointDecision(source,type,target);
      if(!found&&(decision.permissionClass||decision.status)===requested)found={source,type,target,...decision};
    }
    if(found)cases.push(found);
  }
  // Newly covered domains stay in the fixture instead of being replaced with
  // UNKNOWN sentinels. Expected permissions come from the independent ledger.
  for(const [source,type,target] of [
    ['BusinessActor','Assignment','Role'],['Role','Assignment','BusinessActor'],
    ['Node','Access','Artifact'],['Capability','Realization','Goal'],
    ['WorkPackage','Realization','Deliverable'],['Stakeholder','Association','Driver'],
  ]) {
    const decision=expectedEndpointDecision(source,type,target);assert.notEqual(decision.status,'UNKNOWN');
    if(!cases.some(item=>item.source===source&&item.type===type&&item.target===target))cases.push({source,type,target,...decision});
  }
  for(const composite of ['Grouping','Location','Product','Plateau'])for(const [source,target] of [[composite,'Service'],['Service',composite]]) {
    const decision=expectedEndpointDecision(source,'Serving',target);assert.notEqual(decision.status,'UNKNOWN');
    cases.push({source,type:'Serving',target,...decision});
  }
  for(const [source,type,target] of [
    ['Product','Aggregation','Service'],['Product','Composition','Grouping'],['Product','Aggregation','ApplicationComponent'],
    ['Plateau','Aggregation','Goal'],['Plateau','Composition','Outcome'],['Plateau','Aggregation','Requirement'],
    ['Plateau','Composition','Grouping'],['Plateau','Aggregation','Driver'],['Location','Aggregation','Driver'],
  ])cases.push({source,type,target,...expectedEndpointDecision(source,type,target)});
  for(const source of ['Product','Plateau'])for(const target of ['Deliverable','WorkPackage'])for(const type of ['Aggregation','Composition']) {
    const decision=expectedEndpointDecision(source,type,target);assert.equal(decision.reason,'source-scope-unresolved');
    cases.push({source,type,target,...decision});
  }
  assert.equal(new Set(cases.map(item=>item.type)).size,15);
  const typeOf=id=>expected.elements.find(item=>item.id===id).type;
  const decisionFor=relation=>expectedEndpointDecision(typeOf(relation.source.id),relation.type,typeOf(relation.target.id));
  const submit=h=>h.$('link-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
  const assertCoverage=node=>{assert.ok(node);assert.match(node.textContent,/1764 упорядоченных/);assert.match(node.textContent,/просмотрены 26460 из 26460; определено 26452 решений/);assert.match(node.textContent,/8 остаются UNKNOWN/);assert.match(node.textContent,/Охвачены все типы элементов текущего каталога/);};
  const assertDecision=(node,decision)=>{assert.equal(node.dataset.assessment,decision.status);if(decision.permissionClass==='direct')assert.match(node.textContent,/прямое разрешение/);if(decision.permissionClass==='derived')assert.match(node.textContent,/как производная связь/);assert.match(node.textContent,/Нормативная оценка: UNKNOWN/);};
  let saved;
  await t.test('startup has two direct permissions, while imported forbidden drafts are retained and all family representatives can be created',async phase=>{
    const h=await setup(phase);openProfile(h);assert.match(h.$('profile-local').textContent,/ALLOWED: 2 · FORBIDDEN: 0 · UNKNOWN: 0/);assert.match(h.$('profile-local').textContent,/Прямых разрешений: 2/);assert.match(h.$('profile-normative').textContent,/UNKNOWN/);h.$('profile-dialog').close();
    const before=Buffer.from(serializeProjectFile(f.state));await h.load(before);h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
    for(const draft of f.oldDrafts){const group=h.$('canvas').querySelector(`[data-id="${draft.connectionId}"]`);h.pointer(group,'pointerdown',400,200);h.pointer(h.$('canvas'),'pointerup',400,200);assertDecision(h.document.querySelector('.relationship-assessment'),{status:'FORBIDDEN',permissionClass:null});}
    assert.deepEqual(await h.download(),before,'Loading and inspecting old draft types must never rewrite them');
    for(const entry of cases) {
      const source=f.items[entry.source],target=f.items[entry.target],history=h.$('history-state').textContent;
      drawTypedRelationship(h, entry.type, source.occurrenceId, target.occurrenceId);
      if (entry.status === 'FORBIDDEN') { assert.match(h.$('status').textContent, /не создана/); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('canvas').querySelectorAll('.connection').length, expected.relationships.length); continue; }
      const assessment = h.document.querySelector('#inspector-content .relationship-assessment'), evidence = h.document.querySelector('#inspector-content .assessment-evidence');
      assertDecision(assessment,entry);assertCoverage(evidence.querySelector('.assessment-coverage'));
      assert.ok(evidence.textContent.includes(`столбец (источник) ${entry.source}; строка (цель) ${entry.target}`));
      if(entry.status==='UNKNOWN'){assert.match(assessment.textContent,/Область правила/);assert.match(evidence.textContent,/G\/g отсутствует/);assert.match(evidence.textContent,/§ 12\.4, стр\. 104/);}
      const label='';
      const group=h.$('canvas').querySelector('.connection.selected'),relation={id:group.dataset.renameId,type:entry.type,source:{kind:'element',id:source.elementId},target:{kind:'element',id:target.elementId},label, documentation: '', properties: propertyEntries({})};
      expected.relationships.push(relation);main.connections.push({id:group.dataset.id,relationshipId:relation.id,source: { kind: 'occurrence', id: source.occurrenceId },target: { kind: 'occurrence', id: target.occurrenceId },routePoints: [],labelPosition: null, style: {}});
      assertDecision(h.document.querySelector('.relationship-assessment'),entry);assertCoverage(h.document.querySelector('#inspector-content .assessment-coverage'));
      if(entry.type==='ReadAccess')assert.equal(group.querySelector('.line').getAttribute('marker-start'),'url(#notation-canvas-open)');
    }
    const count=expected.relationships.length;assert.equal(h.$('canvas').querySelectorAll('.connection').length,count);h.$('undo').click();assert.equal(h.$('canvas').querySelectorAll('.connection').length,count-1);h.$('redo').click();assert.equal(h.$('canvas').querySelectorAll('.connection').length,count);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.otherViewId}"]`).click();
    for(const relation of expected.relationships){reuseRelationship(h,relation.id);const source=other.occurrences.find(item=>item.concept.id===relation.source.id),target=other.occurrences.find(item=>item.concept.id===relation.target.id);h.change('link-source',source.id);h.change('link-target',target.id);assertDecision(h.$('link-assessment'),decisionFor(relation));assertCoverage(h.$('link-assessment-evidence').querySelector('.assessment-coverage'));submit(h);const group=h.$('canvas').querySelector('.connection.selected');other.connections.push({id:group.dataset.id,relationshipId:relation.id,source: { kind: 'occurrence', id: source.id },target: { kind: 'occurrence', id: target.id },routePoints: [],labelPosition: null, style: {}});}
    const counts={ALLOWED:0,FORBIDDEN:0,UNKNOWN:0,direct:0,derived:0};for(const relation of expected.relationships){const decision=decisionFor(relation);counts[decision.status]++;if(decision.permissionClass)counts[decision.permissionClass]++;}
    openProfile(h);assert.ok(h.$('profile-local').textContent.includes(`ALLOWED: ${counts.ALLOWED} · FORBIDDEN: ${counts.FORBIDDEN} · UNKNOWN: ${counts.UNKNOWN}`));assert.ok(h.$('profile-local').textContent.includes(`Прямых разрешений: ${counts.direct}`));assert.ok(h.$('profile-local').textContent.includes(`Подтверждённых производных связей: ${counts.derived}`));assert.equal(h.$('profile-results').children.length,count);assert.equal(h.$('profile-dialog').querySelectorAll('img,script').length,0);h.$('profile-dialog').close();
    saved=await h.download();assert.deepEqual(deserializeProjectFile(saved),deserializeProjectFile(serializeProjectFile(expected)));
  });
  await t.test('fresh session preserves classes, raw properties and endpoint ownership with saved geometry ON/OFF',async phase=>{
    const h=await setup(phase);await h.load(saved);
    for(const view of expected.views){h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();for(const stored of [false,true]){setStoredGeometry(h,stored);for(const connection of view.connections){const relation=expected.relationships.find(item=>item.id===connection.relationshipId),group=h.$('canvas').querySelector(`[data-id="${connection.id}"]`);h.pointer(group,'pointerdown',400,200);h.pointer(h.$('canvas'),'pointerup',400,200);assertDecision(h.document.querySelector('.relationship-assessment'),decisionFor(relation));}}
      assert.deepEqual(await h.download(),saved);assert.equal((await h.download('download-mermaid')).toString(),exportMermaid(expected,view.view.id));}
    assert.equal(h.$('file-state').dataset.dirty,'false');assert.equal(h.$('undo').disabled,true);assert.equal(h.$('redo').disabled,true);
    const reopened=deserializeProjectFile(saved);
    for(const original of f.state.relationships)assert.deepEqual(reopened.relationships.find(item=>item.id===original.id),original);
  });
});

test(`${production ? 'production' : 'source'} app: canonical v2 junctions, all endpoint kinds, cyclic pinned routes, native roundtrip and view duplication`, async t => {
  const { conceptProject } = await import('../../schemka-model-core/fixtures/concept-project.js');
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state));
  await h.load(bytes); setStoredGeometry(h, false);
  const view = state.views[0], group = id => h.$('canvas').querySelector(`.connection[data-id="${id}"]`);
  assert.equal(h.$('tree-common').querySelector(':scope > summary .tree-count').textContent, '3', 'Common contains one Grouping and both junctions');
  assert.equal(h.$('tree-common').querySelectorAll('[data-junction-id]').length, 2);
  assert.equal(h.$('canvas').querySelectorAll('.junction').length, 2);
  assert.equal(h.$('canvas').querySelectorAll('.view-anchor').length, 13);
  assert.equal(h.$('canvas').querySelectorAll('.connection').length, view.connections.length);
  for (const connection of view.connections) {
    const route = connectionGeometry(connection, view.occurrences, occurrence => { if (occurrence.concept.kind === 'junction') return 'circle'; const appearance = notationElement(state.project.metamodel, state.elements.find(item => item.id === occurrence.concept.id).type); return appearance.contour || appearance.radius; }, false, view.connections);
    assert.equal(group(connection.id).querySelector('.line').getAttribute('d'), route.d);
    assert.equal(group(connection.id).dataset.routeMode, 'pinned-polyline');
    assert.doesNotMatch(route.d, /NaN|Infinity|undefined/);
  }
  for (const occurrence of view.occurrences.filter(item => item.concept.kind === 'junction')) {
    const rendered = h.$('canvas').querySelector(`.junction[data-id="${occurrence.id}"]`), circle = rendered.querySelector('.node-box');
    assert.equal(circle.tagName.toLowerCase(), 'circle');
    assert.equal(Number(circle.getAttribute('r')), Math.min(occurrence.bounds.width, occurrence.bounds.height) / 2);
    assert.match(rendered.getAttribute('aria-label'), /AndJunction|OrJunction/);
    h.pointer(rendered, 'pointerdown'); h.pointer(rendered, 'pointerup');
    assert.match(h.$('inspector-content').textContent, /Junction: общий концепт/);
    assert.ok(h.$('inspector-content').querySelector('.graph-issue'));
  }
  assert.match(h.$('stored-geometry-status').textContent, /Предупреждений геометрии/);
  h.$('fit-button').click(); assert.doesNotMatch(h.$('canvas').getAttribute('viewBox'), /NaN|Infinity/);
  for (const stored of [false, true, false]) {
    setStoredGeometry(h, stored);
    assert.equal(h.$('canvas').querySelectorAll('.junction').length, 2);
    assert.deepEqual(await h.download(), bytes);
  }
  h.$('file-button').click(); h.$('download-mermaid').click();
  assert.match(h.$('file-feedback').textContent, /Mermaid.*(не|unsupported|UNSUPPORTED|junction)/i);
  h.$('file-dialog').close(); assert.deepEqual(await h.download(), bytes);
  h.$('duplicate-view').click(); h.$('new-view-name').value = 'Cyclic independent copy';
  h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const duplicatedBytes = await h.download(), duplicated = deserializeProjectFile(duplicatedBytes);
  assert.equal(duplicated.views.length, 3); assert.deepEqual(duplicated.junctions, state.junctions);
  const copy = duplicated.views.find(entry => entry.view.name === 'Cyclic independent copy');
  assert.equal(copy.connections.length, view.connections.length);
  const priorIds = new Set(view.connections.map(item => item.id));
  for (const connection of copy.connections) {
    assert.equal(priorIds.has(connection.id), false);
    for (const endpoint of [connection.source, connection.target]) if (endpoint.kind === 'connection') assert.equal(priorIds.has(endpoint.id), false);
  }
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
  h.$('redo').click(); assert.deepEqual(await h.download(), duplicatedBytes);
  await h.load(duplicatedBytes); assert.deepEqual(await h.download(), duplicatedBytes);
});

test(`${production ? 'production' : 'source'} app: canonical v2 refuses an old core header without replacing current drawings or history`, async t => {
  const h = await setup(t);
  h.$('create-andjunction').click(); h.$('element-name').value = 'Current junction';
  h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const before = await h.download(), history = h.$('history-state').textContent;
  const envelope = JSON.parse(before), projectFile = envelope.files.find(file => file.path === 'schemka.json');
  const oldHeader = JSON.parse(projectFile.content); oldHeader.formatVersion = 1; oldHeader.metamodel.version = 1;
  projectFile.content = JSON.stringify(oldHeader);
  h.$('file-button').click(); const file = new Blob([JSON.stringify(envelope)]); Object.defineProperty(file, 'name', { value: 'old-header.schemka.json' });
  Object.defineProperty(h.$('project-file'), 'files', { value: [file], configurable: true });
  h.$('project-file').dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('load-project').click();
  for (let attempt = 0; attempt < 40 && !h.$('file-feedback').textContent.includes('Файл не открыт'); attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.match(h.$('file-feedback').textContent, /Файл не открыт/); assert.match(h.$('file-feedback').textContent, /version|верси|v1/i);
  assert.equal(h.$('file-dialog').open, true); h.$('file-dialog').close();
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('canvas').querySelectorAll('.junction').length, 1);
  assert.deepEqual(await h.download(), before); h.$('undo').click(); assert.equal(h.$('canvas').querySelectorAll('.junction').length, 0);
});

test(`${production ? 'production' : 'source'} app: connection context offers properties without legacy create-from actions or model writes`, async t => {
  const { conceptProject } = await import('../../schemka-model-core/fixtures/concept-project.js');
  const h = await setup(t), state = conceptProject(), host = state.views[0].connections[0];
  while (host.routePoints.length < 128) host.routePoints.push({ kind: 'bend', point: { x: 400, y: 400 } });
  await h.load(serializeProjectFile(state)); const bytes = await h.download();
  const line = h.$('canvas').querySelector(`.connection[data-id="${host.id}"] .line`);
  line.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 100 }));
  assert.ok(h.$('context-menu').querySelector('[data-context-action="properties"]'));
  assert.equal(h.$('context-menu').querySelector('[data-context-action^="relation-"]'),null);
  assert.equal(h.$('link-dialog').open,false);
  h.document.activeElement.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.deepEqual(await h.download(), bytes);
});
