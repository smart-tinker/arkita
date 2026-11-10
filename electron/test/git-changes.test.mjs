import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFiles } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { modelChanges } from '../git-changes.mjs';

test('typed preview ignores JSON order and formatting and reports shared metadata and per-view geometry separately', () => {
  const original = conceptProject(), before = exportFiles(original);
  const shuffled = before.slice().reverse().map(file => ({ path: file.path, content: JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(file.content)).reverse())) }));
  assert.deepEqual(modelChanges(before, shuffled), []);
  const changed = structuredClone(original); changed.elements[0].documentation = 'Updated documentation';
  changed.views[0].occurrences[0].bounds.x += 10; changed.views[0].connections[0].routePoints[0].point.y += 20;
  const differences = modelChanges(before, exportFiles(changed));
  assert.equal(differences.length, 3); assert.equal(differences.filter(item => item.type === 'element').length, 1);
  assert.equal(differences.find(item => item.type === 'element').fields[0].category, 'metadata');
  assert.equal(differences.find(item => item.type === 'occurrence').viewName, original.views[0].view.name);
  assert.equal(differences.find(item => item.type === 'occurrence').fields[0].field, 'bounds.x');
  assert.equal(differences.find(item => item.type === 'connection').fields[0].category, 'geometry');
});
