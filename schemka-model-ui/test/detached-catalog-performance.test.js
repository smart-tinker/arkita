import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { installDetachedCatalog } from '../src/detached-catalog.js';

test('detached tree counts current-view drawings in one pass', async t => {
  const size = 24, activeReads = { occurrences: 0, connections: 0 };
  const counted = (items, key) => new Proxy(items, { get(target, property, receiver) {
    if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) activeReads[key]++;
    return Reflect.get(target, property, receiver);
  } });
  const elements = Array.from({ length: size }, (_, i) => ({ id: `element-${i}`, type: 'ApplicationComponent', name: `Element ${i}` }));
  const relationships = Array.from({ length: size }, (_, i) => ({ id: `relationship-${i}`, type: 'Flow', name: `Relationship ${i}` }));
  const activeView = {
    id: 'active-view', name: 'Active',
    occurrences: counted(elements.map(item => ({ id: `occurrence-${item.id}`, concept: { kind: 'element', id: item.id } })), 'occurrences'),
    connections: counted(relationships.map(item => ({ id: `connection-${item.id}`, relationshipId: item.id })), 'connections'),
  };
  const otherView = {
    id: 'other-view', name: 'Other',
    occurrences: elements.map(item => ({ id: `other-${item.id}`, concept: { kind: 'element', id: item.id } })),
    connections: relationships.map(item => ({ id: `other-connection-${item.id}`, relationshipId: item.id })),
  };
  const snapshot = {
    project: { name: 'Synthetic', metamodel: CURRENT_METAMODEL }, elements, junctions: [], relationships,
    views: [{ view: activeView, ...activeView }, { view: otherView, ...otherView }], folders: [],
  };
  const dom = new JSDOM('<!doctype html><html><body><header class="section-heading"></header><details class="app-menu"><summary>Вид</summary><div class="menu-items"></div></details></body></html>');
  t.after(() => dom.window.close());
  const opened = [];
  const desktop = {
    catalogOpen: async value => { opened.push(value); return { status: 'detached' }; },
    catalogPublish: async () => ({ status: 'ok' }),
    catalogDock: async () => ({ status: 'docked' }),
    onCatalogAction: () => () => {}, onCatalogDocked: () => () => {},
  };
  dom.window.schemkaDesktop = desktop;
  const model = { store: { snapshot, revision: 0 }, view: activeView, viewId: activeView.id, selection: null, conceptVisible: () => true };
  const ui = installDetachedCatalog({
    document: dom.window.document, window: dom.window, model, session: { documentToken: 'synthetic' },
    blocked: () => false, status: () => {}, activate: () => {}, panel: () => {},
  });

  await ui.open();
  assert.equal(opened.length, 1);
  const entry = (kind, id) => opened[0].entries.find(item => item.kind === kind && item.id === id);
  assert.equal(entry('element', elements[0].id).uses, 2, 'uses include other views');
  assert.equal(entry('element', elements[0].id).drawings, 1, 'drawings count only the active view');
  assert.equal(entry('relationship', relationships[0].id).uses, 2, 'relationship uses include other views');
  assert.equal(entry('relationship', relationships[0].id).drawings, 1, 'relationship drawings count only the active view');
  assert.ok(activeReads.occurrences + activeReads.connections <= 3 * (size + size),
    `snapshot should scan active arrays a bounded number of times; got ${JSON.stringify(activeReads)}`);
});
