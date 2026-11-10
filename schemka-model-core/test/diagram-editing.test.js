import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles } from '../src/index.js';
import { newId } from '../src/format.js';
import { reverseRelationships, reorderDrawings, createLinkedElement } from '../src/diagram-editing.js';
const fixture = () => { const store = createStore(createProject('Editing')), run = command => store.execute(command, store.revision).created; const { viewId } = run({ type: 'createView', name: 'Main' }); let rank = 0; const add = name => run({ zIndex: rank++, type: 'createElementAndOccurrence', viewId, elementType: 'Role', name, bounds: { x: 20, y: 20, width: 100, height: 80 } }); const a = add('A'), b = add('B'), c = add('C'); return { store, run, viewId, a, b, c }; };

test('group z-order preserves siblings, selected order, parent boundaries and no-op', () => {
  const h = fixture(), refs = [h.a, h.b].map(item => ({ kind: 'occurrence', id: item.occurrenceId }));
  const before = h.store.exportFiles(), out = reorderDrawings(h.store.snapshot, h.viewId, refs, 'front'); assert.equal(out.changed, true);
  const ordered = out.snapshot.views[0].occurrences.slice().sort((a, b) => a.zIndex - b.zIndex).map(item => item.id), initial = h.store.snapshot.views[0].occurrences.slice().sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)).filter(item => refs.some(ref => ref.id === item.id)).map(item => item.id);
  assert.deepEqual(ordered.slice(-2), initial); assert.equal(reorderDrawings(out.snapshot, h.viewId, refs, 'front').changed, false); assert.deepEqual(h.store.exportFiles(), before);
  h.run({ type: 'applyProjectSnapshot', files: exportFiles(out.snapshot) }); h.store.undo(h.store.revision); assert.deepEqual(h.store.exportFiles(), before);
});

test('reverse twice exactly restores typed endpoints, absent multiplicity, anchor order and custom endings in every view', () => {
  const h = fixture(); const r = h.run({ type: 'createRelationshipAndConnection', viewId: h.viewId, relationshipType: 'Association', source: { kind: 'occurrence', id: h.a.occurrenceId }, target: { kind: 'occurrence', id: h.b.occurrenceId }, label: 'Rel', routePoints: [{ kind: 'bend', point: { x: 80, y: 100 } }, { kind: 'anchor', id: newId('anc'), point: { x: 120, y: 100 } }] });
  h.run({ type: 'updateRelationshipMultiplicity', relationshipId: r.relationshipId, sourceMultiplicity: '0..*' }); h.run({ type: 'updateDrawingStyle', viewId: h.viewId, drawing: { kind: 'connection', id: r.connectionId }, style: { sourceEnding: 'circle' } });
  const before = h.store.snapshot, out = reverseRelationships(before, [r.relationshipId]); assert.deepEqual(out.newBlockers, []); assert.deepEqual(out.snapshot.relationships[0].target, before.relationships[0].source); assert.equal(out.snapshot.relationships[0].targetMultiplicity, '0..*'); assert.equal(Object.hasOwn(out.snapshot.relationships[0], 'sourceMultiplicity'), false);
  const twice = reverseRelationships(out.snapshot, [r.relationshipId]); assert.deepEqual(exportFiles(twice.snapshot), exportFiles(before));
});

test('linked creation is staged, fails atomically for bad relationship and applies as one undo', () => {
  const h = fixture(), before = h.store.exportFiles(); const options = { viewId: h.viewId, elementType: 'Role', name: 'New', bounds: { x: 300, y: 10, width: 100, height: 80 }, sourceOccurrenceId: h.a.occurrenceId, relationshipType: 'Association' };
  assert.throws(() => createLinkedElement(h.store.snapshot, { ...options, relationshipType: 'Not-a-type' })); assert.deepEqual(h.store.exportFiles(), before);
  const out = createLinkedElement(h.store.snapshot, options); h.run({ type: 'applyProjectSnapshot', files: out.files }); assert.equal(h.store.snapshot.elements.length, 4); assert.equal(h.store.snapshot.relationships.length, 1); h.store.undo(h.store.revision); assert.deepEqual(h.store.exportFiles(), before);
});
