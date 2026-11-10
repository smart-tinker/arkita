import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smartRelationshipChoices } from '../src/profile-ui.js';
import { CURRENT_CATALOG, createProject } from '../../schemka-model-core/src/index.js';
import { expectedEndpointDecision } from './endpoint-oracle.js';
import { getVerifiedRelationshipDecision, getVerifiedConceptDecision } from '../../schemka-model-profiles/src/index.js';

test('smart chooser exactly matches all 26,460 independent ordinary outcomes and never promotes UNKNOWN', () => {
  const state = createProject('Chooser'), source = { kind: 'element', id: 'source' }, target = { kind: 'element', id: 'target' };
  const counts = { direct: 0, derived: 0, UNKNOWN: 0, FORBIDDEN: 0 };
  for (const a of CURRENT_CATALOG.elementTypes) for (const b of CURRENT_CATALOG.elementTypes) {
    state.elements = [{ id: source.id, type: a }, { id: target.id, type: b }];
    const choices = smartRelationshipChoices(state, source, target);
    for (const type of CURRENT_CATALOG.relationshipTypes) {
      const expected = expectedEndpointDecision(a, type, b);
      const allowed = choices.allowed.find(item => item.type === type), unknown = choices.unknown.find(item => item.type === type);
      assert.equal(Boolean(allowed), expected.status === 'ALLOWED', `${a}/${type}/${b}`);
      assert.equal(Boolean(unknown), expected.status === 'UNKNOWN');
      if (allowed || unknown) { const decision = (allowed || unknown).decision; assert.equal(getVerifiedRelationshipDecision(decision), decision); assert.equal(decision.permissionClass, expected.permissionClass); }
      counts[expected.permissionClass || expected.status]++;
    }
    const visible = smartRelationshipChoices(state, source, target, type => type === 'ReadAccess');
    assert.ok([...visible.allowed, ...visible.unknown].every(item => item.type === 'ReadAccess'));
  }
  assert.deepEqual(counts, { direct: 4443, derived: 2935, UNKNOWN: 8, FORBIDDEN: 19074 });
});
test('smart chooser rejects missing concepts and an unknown profile cannot produce allowed choices', () => {
  const state = createProject('Chooser'); state.elements = [{ id: 'a', type: 'ApplicationComponent' }, { id: 'b', type: 'DataObject' }];
  for (const kind of ['junction', 'relationship']) assert.deepEqual(smartRelationshipChoices(state, { kind, id: 'a' }, { kind: 'element', id: 'b' }), { allowed: [], unknown: [] });
  state.project.metamodel.version = 'unknown';
  assert.deepEqual(smartRelationshipChoices(state, { kind: 'element', id: 'a' }, { kind: 'element', id: 'b' }), { allowed: [], unknown: [] });
});

test('manual smart chooser preserves all independently reviewed concept endpoint classifications and never labels them direct', () => {
  const oracle = JSON.parse(readFileSync(new URL('../../schemka-model-profiles/test/fixtures/concept-endpoints.json', import.meta.url))), pairs = new Map();
  for (const [sk, st, type, tk, tt, expected, , , evidence] of oracle.rows) {
    const key = JSON.stringify([sk, st, tk, tt]);
    if (!pairs.has(key)) {
      const state = createProject('Concept chooser'), source = { kind: sk, id: 'source' }, target = { kind: tk, id: 'target' };
      const collection = kind => kind === 'element' ? state.elements : kind === 'junction' ? state.junctions : state.relationships;
      collection(sk).push({ id: source.id, type: st }); collection(tk).push({ id: target.id, type: tt });
      pairs.set(key, smartRelationshipChoices(state, source, target));
    }
    const choices = pairs.get(key), allowed = choices.allowed.find(item => item.type === type), unknown = choices.unknown.find(item => item.type === type);
    assert.equal(Boolean(allowed), Boolean(evidence && expected === 'ALLOWED'), `${key}/${type}`);
    assert.equal(Boolean(unknown), Boolean(evidence && expected === 'UNKNOWN'), `${key}/${type}`);
    if (allowed || unknown) {
      const decision = (allowed || unknown).decision; assert.equal(getVerifiedConceptDecision(decision), decision);
      assert.equal(decision.permissionClass, null); assert.equal(decision.sourceEvidence.basis, 'concept-rule');
    }
  }
  assert.equal(oracle.rows.length, 6448);
});

import { JSDOM } from 'jsdom';
import { installSmartRelationship } from '../src/smart-relationship.js';
import { createController } from '../src/controller.js';
import { createStore } from '../../schemka-model-core/src/index.js';
import { endpointFixture } from './endpoint-fixture.js';

function gestureHarness(t, onStatus = () => {}) {
  const f = endpointFixture(), model = createController(createStore(f.state)); model.switchView(f.viewId);
  const dom = new JSDOM('<button id="smart-link-tool"></button><button id="smart-link-dialog"></button>' + CURRENT_CATALOG.relationshipTypes.map(type => `<button id="create-${type.toLowerCase()}"></button>`).join('') + '<svg id="canvas"></svg>', { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { window } = dom, { document } = window, canvas = document.getElementById('canvas'), calls = [], reports = [];
  const nodes = f.items.map(item => { const node = document.createElementNS('http://www.w3.org/2000/svg', 'g'); node.dataset.kind = 'occurrence'; node.dataset.id = item.occurrenceId; canvas.append(node); return node; });
  window.Element.prototype.getClientRects = function () { return this.isConnected ? [{}] : []; };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 640 });
  Object.defineProperty(canvas, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: 900, height: 640 } } });
  canvas.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20, inverse() { return { a: .5, b: 0, c: 0, d: .5, e: -5, f: -10 }; } });
  canvas.setPointerCapture = id => { canvas.capture = id; }; canvas.hasPointerCapture = id => canvas.capture === id; canvas.releasePointerCapture = () => { delete canvas.capture; };
  let hit = nodes[0]; document.elementFromPoint = () => hit;
  const smart = installSmartRelationship({ document, window, canvas, model, openLink: (...args) => calls.push(args), connect: (...args) => calls.push(args), blocked: () => false, beforeStart() {}, status: text => { reports.push(text); onStatus({ text, active: smart.active, captured: canvas.capture !== undefined }); } });
  const event = (target = nodes[0], extras = {}) => ({ target, button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100, preventDefault() {}, ...extras });
  const start = (type = null) => { smart.activate(type); smart.start(event()); };
  return { f, model, canvas, nodes, smart, calls, reports, event, start, hit(node) { hit = node; } };
}
for (const type of [null, 'ReadAccess']) for (const mode of ['revision', 'view', 'hidden', 'detached', 'secondary', 'same-concept', 'renderer', 'collapse-source', 'collapse-target']) test(`${type || 'smart'} gesture ${mode}: exact state, bounded capture and no movement`, t => {
  const h = gestureHarness(t), before = h.model.store.exportFiles(), history = h.model.store.history;
  h.start(type); assert.equal(h.smart.active, true); const line = h.canvas.querySelector('line'); assert.equal(line.getAttribute('x1'), '45'); assert.equal(line.getAttribute('y1'), '40');
  if (mode === 'revision') h.model.execute({ type: 'renameProject', name: 'new revision' });
  if (mode === 'view') h.model.switchView(h.f.otherViewId);
  if (mode === 'hidden') h.nodes[0].style.display = 'none';
  if (mode === 'collapse-source') h.nodes[0].style.visibility = 'collapse';
  if (mode === 'collapse-target') h.nodes[1].style.visibility = 'collapse';
  if (mode === 'detached') h.nodes[0].remove();
  if (mode === 'secondary') { h.smart.start(h.event(h.nodes[1], { isPrimary: false, pointerId: 2 })); h.smart.finish(h.event(h.nodes[1], { isPrimary: false, pointerId: 2 })); assert.equal(h.smart.active, true); }
  if (mode === 'renderer') { line.setAttribute = () => { throw Error('synthetic renderer failure'); }; h.smart.move(h.event()); }
  const expected = h.model.store.exportFiles(); h.hit(mode === 'same-concept' || mode === 'secondary' ? h.nodes[0] : h.nodes[1]);
  h.smart.finish(h.event(h.canvas)); h.smart.finish(h.event(h.canvas)); assert.equal(h.smart.active, false); assert.equal(h.canvas.capture, undefined); assert.equal(h.canvas.querySelector('line'), null);
  assert.equal(h.calls.length, ['same-concept', 'secondary'].includes(mode) ? 1 : 0);
  if (h.calls.length) { assert.equal(h.calls[0][0], type); assert.equal(h.calls[0][1].fixedEndpoints, type ? undefined : true); assert.equal(h.calls[0][1].sourceEndpoint.id, h.f.items[0].occurrenceId); assert.equal(h.calls[0][1].targetEndpoint.id, h.f.items[0].occurrenceId); }
  assert.deepEqual(h.model.store.exportFiles(), expected); if (mode !== 'revision') { assert.deepEqual(expected, before); assert.deepEqual(h.model.store.history, history); }
});

test('connector activation switches and toggles tools, cancel clears palette state and invalid types stay inert', t => {
  const h = gestureHarness(t), $ = id => h.canvas.ownerDocument.getElementById(id), before = h.model.store.exportFiles();
  h.start('ReadAccess'); assert.equal($('create-readaccess').getAttribute('aria-pressed'), 'true'); assert.equal(h.canvas.classList.contains('smart-link-armed'), true);
  h.smart.activate('Association'); assert.equal(h.smart.active, false); assert.equal(h.smart.enabled, true); assert.equal(h.canvas.capture, undefined);
  assert.equal($('create-readaccess').getAttribute('aria-pressed'), 'false'); assert.equal($('create-association').getAttribute('aria-pressed'), 'true');
  h.smart.activate(); assert.equal($('create-association').getAttribute('aria-pressed'), 'false'); assert.equal($('smart-link-tool').getAttribute('aria-pressed'), 'true');
  h.smart.activate(); assert.equal(h.smart.enabled, false); assert.equal($('smart-link-tool').getAttribute('aria-pressed'), 'false'); assert.equal(h.canvas.classList.contains('smart-link-armed'), false);
  h.smart.activate('Unknown'); assert.equal(h.smart.enabled, false); assert.equal(h.calls.length, 0); assert.deepEqual(h.model.store.exportFiles(), before);
});

test('typed connector accepts junction drawings while magic chooser remains ordinary-only', t => {
  const h = gestureHarness(t), viewId = h.model.viewId;
  const junction = h.model.execute({ type: 'createJunctionAndOccurrence', viewId, junctionType: 'AndJunction', name: 'Junction', bounds: { x: 300, y: 100, width: 20, height: 20 } }).created;
  const node = h.nodes[0].cloneNode(); node.dataset.id = junction.occurrenceId; h.canvas.append(node);
  const before = h.model.store.exportFiles(), history = h.model.store.history;
  h.start(); h.hit(node); h.smart.finish(h.event()); assert.equal(h.calls.length, 0);
  h.start('Association'); h.hit(node); h.smart.finish(h.event()); h.smart.finish(h.event());
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], 'Association'); assert.equal(h.calls[0][1].targetEndpoint.id, junction.occurrenceId);
  h.smart.activate('Association'); h.smart.start(h.event(node)); h.hit(h.nodes[0]); h.smart.finish(h.event());
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1][1].sourceEndpoint.id, junction.occurrenceId);
  assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history);
});

test('smart finish failure clears state and capture before reporting, including repeated release', t => {
  const reports = [], h = gestureHarness(t, value => reports.push(value)), before = h.model.store.exportFiles();
  h.start(); reports.length = 0; h.nodes[0].getClientRects = () => { throw Error('synthetic finish lookup'); };
  h.smart.finish(h.event()); h.smart.finish(h.event());
  assert.deepEqual(reports, [{ text: 'Магическая связь отменена: synthetic finish lookup', active: false, captured: false }]);
  assert.equal(h.calls.length, 0); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
});
