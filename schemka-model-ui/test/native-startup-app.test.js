import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
test(`${production ? 'production' : 'source'} native initial document opens after all synchronous UI modules and keeps clean history`, async t => {
 const state = createProject('Модель первого запуска'), bytes = serializeProjectFile(state), calls = [];
 const h = await setup(t, { documentReady: async token => { calls.push(token); return { status: 'opened', name: 'Initial.arkita', bytes }; }, documentChanged: async (...args) => { calls.push(args); return { status: 'detached' }; } });
 for (let index = 0; index < 40 && h.$('project-name').textContent !== state.project.name; index++) await new Promise(resolve => setImmediate(resolve));
 assert.equal(h.$('project-name').textContent, state.project.name, h.$('file-feedback').textContent); assert.equal(h.$('file-dialog').open, false); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true); assert.equal(calls.length, 2);
});

test('model properties expose the main-owned file path read-only and update it after Save As without history', async t => {
 let location; const state = createProject('Путь модели'), bytes = serializeProjectFile(state), first = 'C:\\Модели\\Первая.arkita', second = 'C:\\Модели\\Копия.arkita';
 const binding = (token, displayPath, generation) => ({ generation, binding: null, issues: [], file: { id: 'file', name: displayPath.split('\\').at(-1), displayPath, documentToken: token, blocked: false, requiresSaveAs: false } });
 const h = await setup(t, {
   documentReady: async () => ({ status: 'opened', name: 'Первая.arkita', bytes }),
   documentChanged: async (_previous, current) => { location = first; return { status: 'bound', directory: binding(current, first, 1) }; },
   documentLocation: async () => ({ status: 'ok', path: location }),
   saveProject: async (_bytes, token) => { location = second; return { status: 'saved', name: 'Копия.arkita', directory: binding(token, second, 2) }; },
 });
 for (let index = 0; index < 40 && h.$('project-name').textContent !== state.project.name; index++) await new Promise(resolve => setImmediate(resolve));
 h.$('project-metadata').click(); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.$('metadata-location').value, first); assert.equal(h.$('metadata-location').readOnly, true); h.$('metadata-close').click();
 h.$('file-button').click(); h.$('save-project').click();
 for (let index = 0; index < 40 && !h.$('file-feedback').textContent.includes('записана на диск'); index++) await new Promise(resolve => setImmediate(resolve));
 h.$('file-dialog').close(); h.$('project-metadata').click(); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.$('metadata-location').value, second, h.$('file-feedback').textContent); assert.equal(h.$('undo').disabled, true); assert.equal(h.$('file-state').dataset.dirty, 'false');
});
