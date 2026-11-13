import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { setup } from './app-test-fixture.js';

const run = (store, command) => store.execute(command, store.revision).created;
const openTree = h => { for (const section of h.document.querySelectorAll('[data-catalog-section]')) section.open = true; };
const context = (h, element) => {
  element.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 90, clientY: 220 }));
  return h.$('context-menu');
};

test('model deletion preview lists duplicate-named dependencies separately and cancel preserves the model', async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic deletion preview'));
  const firstView = run(store, { type: 'createView', name: 'Repeated view' }).viewId;
  const secondView = run(store, { type: 'createView', name: 'Repeated view' }).viewId;
  const target = run(store, { type: 'createElementAndOccurrence', viewId: firstView, elementType: 'Role', name: 'Repeated name', bounds: { x: 0, y: 0, width: 100, height: 60 } });
  const other = run(store, { type: 'createElementAndOccurrence', viewId: firstView, elementType: 'Role', name: 'Repeated name', bounds: { x: 150, y: 0, width: 100, height: 60 } });
  const support = run(store, { type: 'createElementAndOccurrence', viewId: firstView, elementType: 'Role', name: 'Support', bounds: { x: 300, y: 0, width: 100, height: 60 } });
  const targetInSecond = run(store, { type: 'addOccurrence', viewId: secondView, concept: { kind: 'element', id: target.elementId }, bounds: { x: 0, y: 100, width: 100, height: 60 } }).occurrenceId;
  const supportInSecond = run(store, { type: 'addOccurrence', viewId: secondView, concept: { kind: 'element', id: support.elementId }, bounds: { x: 150, y: 100, width: 100, height: 60 } }).occurrenceId;
  const firstRelation = run(store, { type: 'createRelationshipAndConnection', viewId: firstView, relationshipType: 'Association', source: { kind: 'occurrence', id: target.occurrenceId }, target: { kind: 'occurrence', id: support.occurrenceId }, label: 'Repeated relation' });
  run(store, { type: 'createRelationshipAndConnection', viewId: firstView, relationshipType: 'Association', source: { kind: 'occurrence', id: support.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId }, label: 'Repeated relation' });
  run(store, { type: 'addConnection', viewId: secondView, relationshipId: firstRelation.relationshipId, source: { kind: 'occurrence', id: targetInSecond }, target: { kind: 'occurrence', id: supportInSecond } });
  const bytes = serializeProjectFile(store.snapshot);
  await h.load(bytes); openTree(h);

  const element = h.document.querySelector(`.catalog button[data-element-id="${target.elementId}"]`);
  const menu = context(h, element); menu.querySelector('[data-context-action="delete-element"]').click();
  assert.equal(h.$('delete-dialog').open, true);
  const rows = [...h.$('delete-impact').querySelectorAll('li')].map(item => item.textContent);
  assert.equal(rows.filter(text => text.startsWith('Зависимое отношение: «Repeated relation»')).length, 2);
  assert.equal(rows.filter(text => text.startsWith('Затронутое представление: «Repeated view»')).length, 2);
  assert.equal(rows.filter(text => text.startsWith('Изображение: «Repeated name» · «Repeated view»')).length, 2);
  assert.equal(rows.filter(text => text.startsWith('Соединение: «Repeated relation» · «Repeated view»')).length, 3);

  h.$('delete-dialog').querySelector('[data-close]').click();
  assert.equal(Buffer.compare(await h.download(), Buffer.from(bytes)), 0);
  assert.equal(h.$('undo').disabled, true);

  context(h, element).querySelector('[data-context-action="delete-element"]').click();
  h.$('delete-confirm').click();
  const deleted = deserializeProjectFile(await h.download());
  assert.equal(deleted.elements.some(item => item.id === target.elementId), false);
  assert.equal(deleted.elements.some(item => item.id === other.elementId), true);
  h.$('undo').click();
  assert.equal(Buffer.compare(await h.download(), Buffer.from(bytes)), 0);
});
