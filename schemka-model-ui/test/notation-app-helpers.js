import { setup, setStoredGeometry } from './app-test-fixture.js';
import { importedRelationship } from './imported-relationship.js';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS } from '../src/notation.js';

function beforeUnload(h) {
  const event = new h.window.Event('beforeunload', { cancelable: true });
  h.window.dispatchEvent(event); return event.defaultPrevented;
}

function openProfile(h) {
  h.$('help-button').click(); assert.equal(h.$('help-dialog').open, true);
  h.$('profile-button').click();
  assert.equal(h.$('help-dialog').open, false); assert.equal(h.$('profile-dialog').open, true);
}

function drawTypedRelationship(h, type, sourceId, targetId) {
  const canvas = h.$('canvas'), source = canvas.querySelector(`[data-id="${sourceId}"]`), target = canvas.querySelector(`[data-id="${targetId}"]`);
  const hit = smartHitSurface(h, source);
  h.$(`create-${type.toLowerCase()}`).click(); assert.equal(h.$('link-dialog').open, false);
  h.pointer(source, 'pointerdown', 100, 100, 71); hit(target);
  h.pointer(canvas, 'pointermove', 500, 200, 71); h.pointer(canvas, 'pointerup', 500, 200, 71); h.pointer(canvas, 'pointerup', 500, 200, 71);
  assert.equal(canvas.querySelector('.smart-link-preview'), null); assert.equal(canvas.hasPointerCapture(71), false);
  assert.equal(h.$(`create-${type.toLowerCase()}`).getAttribute('aria-pressed'), 'false'); assert.equal(h.$('link-dialog').open, false);
}

function fixture() {
  const store = createStore(createProject('Synthetic notation coverage'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Forty-two types / fifteen relation entries' });
  const { viewId: otherViewId } = run({ type: 'createView', name: 'Independent reversed layout' });
  const items = NOTATION_ELEMENTS.map((elementType, index) => run({ type: 'createElementAndOccurrence', viewId, elementType, name: `${elementType} <img onerror=alert(1)> 日本語`, bounds: { x: 40 + index % 3 * 280, y: 80 + Math.floor(index / 3) * 170, width: 220, height: 90 } }));
  const others = items.map((item, index) => run({ type: 'addOccurrence', viewId: otherViewId, concept: { kind: 'element', id: item.elementId }, bounds: { x: 640 - index % 3 * 280, y: 80 + Math.floor(index / 3) * 170, width: 220, height: 90 } }));
  const state = store.snapshot;
  NOTATION_RELATIONSHIPS.forEach((relationshipType, index) => {
    const { relationshipId } = importedRelationship(state, { relationshipType, label: `<script>${relationshipType}</script>`, viewId, source: { kind: 'occurrence', id: items[index].occurrenceId }, target: { kind: 'occurrence', id: items[index + 1].occurrenceId }});
    const first = state.views[0].connections.at(-1); state.views[1].connections.push({ ...structuredClone(first), id: 'conn-' + crypto.randomUUID(), source: { kind: 'occurrence', id: others[index].occurrenceId }, target: { kind: 'occurrence', id: others[index + 1].occurrenceId } });
  });
  importedRelationship(state, { relationshipType: 'Flow', label: 'Self loop', viewId, source: { kind: 'occurrence', id: items[4].occurrenceId }, target: { kind: 'occurrence', id: items[4].occurrenceId }});
  return deserializeProjectFile(serializeProjectFile(state));
}

function beginLayoutEdit(h, connectionId) {
  if (!h.$('stored-geometry').checked) setStoredGeometry(h, true);
  const group = h.$('canvas').querySelector(`[data-id="${connectionId}"]`);
  h.pointer(group.querySelector('.hit'), 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
  if (h.$('layout-edit-toggle').getAttribute('aria-pressed') !== 'true') h.$('layout-edit-toggle').click();
  assert.equal(h.$('layout-edit-toggle').getAttribute('aria-pressed'), 'true');
}

const layoutHandle = (h, index) => h.$('canvas').querySelector(`[data-layout-kind="bend"][data-layout-index="${index}"]`);

function searchPalette(h, value, focus = true) {
  if (focus) h.$('palette-search').focus();
  h.$('palette-search').value = value; h.$('palette-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
}

// Production DOM + real temporary file service. Dialog selection and IPC are injected;
// these tests do not launch Electron or establish native GUI acceptance.
async function nativeViewpointHarness(t, state) {
  const fs = await import('node:fs/promises'), path = await import('node:path'), os = await import('node:os');
  const { APP_URL } = await import('../../electron/boundary.mjs');
  const { createFileService } = await import('../../electron/file-service.mjs');
  const { createNativeDirectory, readNativeDirectory } = await import('../../electron/native-directory.mjs');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-viewpoint-dom-')); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const saved = await createNativeDirectory(parent, serializeProjectFile(state)), root = path.join(parent, saved.name);
  const main = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  let selected = root, holdRead = null, holdSave = null; const calls = [], errors = [];
  const service = createFileService({ window: main, dialog: { showOpenDialog: async () => ({ canceled: selected === null, filePaths: selected ? [selected] : [] }), showErrorBox: (...args) => errors.push(args) },
    readDirectory: async (...args) => { const result = await readNativeDirectory(...args); if (holdRead) await holdRead.promise; return result; } });
  const desktop = Object.fromEntries(['openDirectory', 'saveDirectory', 'documentChanged', 'saveBoundDirectory', 'recoverDirectory'].map(method => [method, async (...args) => {
    const call = { method, args, done: false }; calls.push(call);
    try { const result = await service[method](event, ...args); if (method === 'saveBoundDirectory' && holdSave) await holdSave.promise; call.result = result; return result; }
    finally { call.done = true; }
  }]));
  const h = await setup(t, desktop);
  const until = async predicate => { const deadline = Date.now() + 10000; while (!predicate()) { assert.ok(Date.now() < deadline, h.$('file-feedback').textContent || 'Native test timed out'); await new Promise(r => setTimeout(r, 5)); } await new Promise(r => setImmediate(r)); };
  const click = async id => { const count = calls.length; h.$(id).click(); await until(() => calls.length > count && calls.slice(count).every(c => c.done)); return calls.at(-1).result; };
  const open = async () => { h.$('file-button').click(); await click('desktop-open-directory'); assert.equal(h.$('load-project').disabled, false, JSON.stringify({ result: calls.at(-1)?.result, feedback: h.$('file-feedback').textContent })); h.$('load-project').click(); await until(() => !h.$('file-dialog').open); };
  await open();
  return { ...h, fs, path, root, parent, calls, errors, click, open, until, read: () => readNativeDirectory(root), select(value) { selected = value; },
    holdRead(value) { holdRead = value; }, holdSave(value) { holdSave = value; } };
}

const nativeDeferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

function smartHitSurface(h, initial) {
  const canvas = h.$('canvas'); let hit = initial;
  Object.defineProperty(canvas, 'viewBox', { configurable: true, value: { baseVal: { x: -1000, y: -1000, width: 10000, height: 10000 } } });
  h.document.elementFromPoint = () => hit;
  return next => { hit = next; };
}

export { beforeUnload, openProfile, drawTypedRelationship, fixture, beginLayoutEdit, layoutHandle, searchPalette, nativeViewpointHarness, nativeDeferred, smartHitSurface };
