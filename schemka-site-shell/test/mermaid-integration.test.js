import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { patchMermaidSource } from '../mermaid-integration.mjs';
import { baselineSource, patched, createHarness } from './harness-mermaid.js';

const pinnedHash = '760b718e0ab34a73686d1b8acfa59c9c04cc7d2994191538d1ea7e42f5a3057b';
const hash = value => createHash('sha256').update(value).digest('hex');
const ready = async options => {
  const harness = createHarness(options);
  assert.equal(harness.bootError, null, 'the complete production-patched source must boot');
  await harness.flush();
  return harness;
};
const dirty = (harness, expected = true) => {
  assert.equal(harness.beforeUnload().defaultPrevented, expected);
  assert.equal(harness.get('fileState').classList.contains('changed'), expected);
};
const managedEvents = ['pointerdown', 'mousedown', 'click', 'auxclick', 'keydown'];
function blockedBeforeDocument(harness) {
  let documentCalls = 0;
  for (const type of managedEvents) {
    harness.document.addEventListener(type, () => { documentCalls += 1; }, true);
    const event = harness.dispatch(harness.modeLink, type, { key: 'Enter', ctrlKey: true });
    assert.equal(event.defaultPrevented, true, `${type} must refuse navigation`);
    assert.equal(event.immediate, true, `${type} must stop propagation at window capture`);
    assert.equal(documentCalls, 0, `${type} must not reach even document capture`);
  }
}

test('patch pins the full external v8 source and exposes a stable audited anchor/hash report', () => {
  assert.equal(hash(baselineSource), pinnedHash);
  assert.equal(patched.originalSha256, pinnedHash);
  assert.equal(patched.patchedSha256, hash(patched.source));
  assert.deepEqual(patched.anchors, [
    'file indicator', 'view indicator', 'download cleanup', 'download baseline',
    'clipboard pending', 'file read pending', 'file menu draft preservation', 'early fail-closed guard', 'startup bridge',
  ]);
  assert.equal(new Set(patched.anchors).size, 9);
  assert.ok(Object.isFrozen(patched)); assert.ok(Object.isFrozen(patched.anchors));
  assert.throws(() => patchMermaidSource(`${baselineSource}\n`), { code: 'PATCH_ANCHOR' });
  assert.throws(() => patchMermaidSource(patched.source), { code: 'PATCH_ANCHOR' });
  assert.equal(hash(baselineSource), pinnedHash, 'patching does not mutate baseline input');
});

for (const [label, options] of [
  ['initial palette setup', { failGetId: 'themeMode' }],
  ['initial Mermaid configure', { failConfigure: true }],
  ['later event setup', { failListenerId: 'source' }],
]) test(`full source fails closed after ${label} throws, before shellState exists`, () => {
  const harness = createHarness(options);
  assert.match(harness.bootError?.message || '', /fixture .*failure/);
  blockedBeforeDocument(harness);
  assert.equal(harness.beforeUnload().defaultPrevented, true);
  assert.equal(harness.downloads.length, 0);
});


for (const [label, options] of [
  ['source setter', { failStartupSource: true }],
  ['visibility setup', { failStartupVisibility: true }],
  ['initial view setup', { failStartupView: true }],
]) test(`full source fails closed when ${label} throws after bridge assignment`, () => {
  const harness = createHarness(options);
  assert.match(harness.bootError?.message || '', /fixture startup .* failure/);
  assert.equal(typeof harness.get('saveJSON').onclick, 'function', 'late startup reached wired save handlers');
  blockedBeforeDocument(harness);
  assert.equal(harness.beforeUnload().defaultPrevented, true);
  assert.equal(harness.renderCalls.length, 0);
  assert.equal(harness.downloads.length, 0);
});

test('untouched full-app initial fit establishes the clean view baseline exactly once', async () => {
  const harness = await ready();
  assert.equal(harness.renderCalls.length, 1);
  assert.equal(harness.get('diagnostics').textContent, '');
  assert.equal(harness.get('sourceStateText').textContent, 'Схема обновлена');
  dirty(harness, false);
  assert.deepEqual(harness.snapshot().view, { x: 95, y: 55, scale: 0.9 });
  harness.click('zoomIn'); dirty(harness);
  harness.click('applySource'); await harness.flush();
  dirty(harness, true);
});

for (const action of ['zoom', 'wheel', 'pan', 'edit']) test(`pending startup render cannot clean an intervening user ${action}`, async () => {
  const harness = await ready({ pendingRender: true });
  assert.equal(harness.renderCalls.length, 1);
  assert.equal(harness.beforeUnload().defaultPrevented, true, 'pending renderer is transient');
  const originalText = harness.get('source').value;
  if (action === 'zoom') harness.click('zoomIn');
  if (action === 'wheel') harness.dispatch(harness.get('canvas'), 'wheel', { deltaY: -70 });
  if (action === 'pan') {
    harness.dispatch(harness.get('canvas'), 'pointerdown');
    harness.dispatch(harness.get('canvas'), 'pointermove', { clientX: 260, clientY: 240 });
    harness.dispatch(harness.get('canvas'), 'pointerup', { clientX: 260, clientY: 240 });
  }
  if (action === 'edit') harness.edit(`${originalText}  %% user edit\n`);
  await harness.finishRender();
  dirty(harness);
  assert.equal(harness.snapshot().source, action === 'edit' ? `${originalText}  %% user edit\n` : originalText);
  assert.equal(harness.get('confirm').open, false);
});

test('failed initial rendering after a user view change cannot accept the view baseline either', async () => {
  const harness = await ready({ pendingRender: true });
  harness.click('zoomIn'); await harness.rejectRender();
  assert.match(harness.get('diagnostics').textContent, /fixture render rejected/);
  dirty(harness);
});

test('view-only changes warn natively; MMD keeps them dirty and exact JSON handoff cleans them', async () => {
  const harness = await ready();
  const exactText = harness.get('source').value;
  harness.click('zoomIn'); dirty(harness);
  harness.click('saveMmd');
  assert.equal(harness.downloads.at(-1).blob.text, exactText);
  assert.equal(harness.downloads.at(-1).blob.type, 'text/plain');
  dirty(harness);
  assert.match(harness.get('fileState').textContent, /вид \/ имя/);
  const expected = harness.snapshot();
  harness.click('saveJSON');
  assert.deepEqual(JSON.parse(harness.downloads.at(-1).blob.text), expected);
  assert.equal(harness.downloads.at(-1).blob.type, 'application/json');
  assert.equal(harness.downloads.at(-1).name, 'skhemka-mermaid.json');
  dirty(harness, false);
});

test('filename imported through real JSON handlers remains dirty after MMD; JSON accepts exact name/source/view', async () => {
  const harness = await ready();
  const original = harness.snapshot();
  const renamed = { ...original, filename: 'renamed.mmd' };
  await harness.importJSON(renamed);
  assert.equal(harness.get('confirm').open, true);
  harness.click('acceptConfirm'); await harness.flush();
  assert.equal(harness.get('documentName').textContent, 'renamed.mmd');
  harness.click('saveMmd'); dirty(harness);
  assert.equal(harness.downloads.at(-1).name, 'renamed.mmd');
  assert.equal(harness.downloads.at(-1).blob.text, original.source);
  harness.click('saveJSON');
  assert.deepEqual(JSON.parse(harness.downloads.at(-1).blob.text), renamed);
  dirty(harness, false);
});

for (const format of ['saveMmd', 'saveJSON']) for (const failure of ['blob', 'createURL', 'click']) {
  test(`${format} ${failure} failure preserves dirty source/view and allows a later successful retry`, async () => {
    const harness = await ready();
    harness.edit('flowchart LR\r\n A --> B\r\n'); harness.click('zoomIn');
    const expected = harness.snapshot(), oldDownloads = harness.downloads.length;
    harness.faults[failure] = true;
    harness.click(format);
    assert.equal(harness.downloads.length, oldDownloads);
    assert.match(harness.get('toast').textContent, /Не удалось передать файл браузеру/);
    dirty(harness);
    harness.faults[failure] = false;
    assert.deepEqual(harness.snapshot(), expected);
    harness.click('saveJSON'); dirty(harness, false);
    assert.deepEqual(JSON.parse(harness.downloads.at(-1).blob.text), expected);
    if (failure === 'click') assert.ok(harness.revoked.length > 0, 'failed dispatch revokes its object URL');
  });
}

for (const change of ['source', 'view']) test(`synchronous ${change} change inside real download click cannot be marked clean`, async () => {
  const harness = await ready();
  harness.edit('flowchart LR\n A --> B\n');
  const captured = harness.snapshot();
  harness.faults.onDownload = () => {
    harness.faults.onDownload = null;
    if (change === 'source') harness.edit('flowchart LR\n C --> D\n');
    else harness.click('zoomIn');
  };
  harness.click('saveJSON');
  assert.deepEqual(JSON.parse(harness.downloads.at(-1).blob.text), captured);
  dirty(harness);
  const current = harness.snapshot();
  if (change === 'source') assert.equal(current.source, 'flowchart LR\n C --> D\n');
  else assert.notDeepEqual(current.view, captured.view);
  harness.click('saveJSON'); dirty(harness, false);
});

test('pending real file read blocks mode navigation before document handlers; Cancel keeps document unchanged', async () => {
  const harness = await ready();
  const original = harness.snapshot();
  const reading = harness.startRead();
  blockedBeforeDocument(harness);
  assert.equal(harness.beforeUnload().defaultPrevented, true);
  assert.equal(harness.get('confirm').open, false);
  await reading.finish();
  assert.equal(harness.get('confirm').open, true);
  blockedBeforeDocument(harness);
  harness.click('cancelConfirm');
  assert.equal(harness.get('confirm').open, false);
  assert.deepEqual(harness.snapshot(), original);
  dirty(harness, false);
  assert.equal(harness.dispatch(harness.modeLink, 'click').defaultPrevented, false);
});

test('pending real clipboard promise blocks mode navigation at window capture without changing source or focus', async () => {
  const harness = await ready({ pendingClipboard: true });
  const original = harness.snapshot();
  harness.get('source').focus();
  harness.get('source').setSelectionRange(4, 11);
  harness.click('copy');
  const focus = harness.document.activeElement;
  blockedBeforeDocument(harness);
  assert.equal(harness.beforeUnload().defaultPrevented, true);
  assert.equal(harness.document.activeElement, focus);
  assert.equal(harness.get('source').selectionStart, 4);
  assert.equal(harness.get('source').selectionEnd, 11);
  assert.deepEqual(harness.snapshot(), original);
  await harness.finishClipboard();
  dirty(harness, false);
});

test('private panel drafts block capture navigation and repeated native leave/Cancel attempts never clear them', async () => {
  const harness = await ready();
  harness.click('zoomIn');
  const original = harness.snapshot();
  harness.click('showNode');
  const draft = harness.get('nodeLabel');
  draft.value = 'Unapplied private node caption'; draft.setSelectionRange(2, 9); draft.focus();
  assert.equal(harness.get('newNode').hidden, false);
  harness.get('fileMenu').hidden = false;
  blockedBeforeDocument(harness);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Browser cancellation means no unload occurs. No approval token is written.
    assert.equal(harness.beforeUnload().defaultPrevented, true);
    assert.equal(harness.get('newNode').hidden, false);
    assert.equal(draft.value, 'Unapplied private node caption');
    assert.equal(draft.selectionStart, 2); assert.equal(draft.selectionEnd, 9);
    assert.equal(harness.document.activeElement, draft);
    assert.equal(harness.get('fileMenu').hidden, false, 'legacy document click never ran');
    assert.deepEqual(harness.snapshot(), original);
  }
  harness.click('closeNode');
  assert.equal(harness.get('newNode').hidden, true);
  assert.equal(harness.dispatch(harness.modeLink, 'click').defaultPrevented, false);
  dirty(harness);
});

test('Cancel replacement preserves dirty source/view/name, selection and undo availability', async () => {
  const harness = await ready();
  harness.edit('flowchart TD\n A --> B\n'); harness.click('zoomIn');
  harness.get('source').setSelectionRange(3, 8); harness.get('source').focus();
  const original = harness.snapshot(), canUndo = !harness.get('undo').disabled;
  await harness.importJSON({ ...original, source: 'flowchart LR\n X --> Y\n', filename: 'replacement.mmd' });
  assert.equal(harness.get('confirm').open, true);
  harness.click('cancelConfirm');
  assert.deepEqual(harness.snapshot(), original);
  assert.equal(!harness.get('undo').disabled, canUndo);
  assert.equal(harness.get('source').selectionStart, 3);
  assert.equal(harness.get('source').selectionEnd, 8);
  dirty(harness);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(harness.dispatch(harness.modeLink, 'click').defaultPrevented, false);
    assert.equal(harness.beforeUnload().defaultPrevented, true);
    assert.deepEqual(harness.snapshot(), original);
  }
});


test('successful JSON dispatch followed by a UI setter failure retains accepted baseline and truthful status', async () => {
  const harness = await ready();
  harness.edit('flowchart LR\n A --> B\n'); harness.click('zoomIn');
  const expected = harness.snapshot();
  Object.defineProperty(harness.get('connect'), 'disabled', { configurable: true, set() { throw Error('fixture post-dispatch UI failure'); } });
  harness.click('saveJSON');
  assert.equal(harness.downloads.length, 1);
  assert.deepEqual(JSON.parse(harness.downloads[0].blob.text), expected);
  assert.equal(harness.beforeUnload().defaultPrevented, false, 'successful exact handoff already accepted the baseline');
  assert.match(harness.get('toast').textContent, /Файл передан браузеру.*не полностью/);
  assert.doesNotMatch(harness.get('toast').textContent, /Не удалось передать/);
});

test('cleanup timer failure after successful download cannot report failure or retain false dirty state', async () => {
  const harness = await ready();
  harness.edit('flowchart LR\n A --> B\n'); harness.click('zoomIn');
  const expected = harness.snapshot();
  harness.faults.timerCleanup = true;
  harness.click('saveJSON');
  assert.equal(harness.downloads.length, 1);
  assert.deepEqual(JSON.parse(harness.downloads[0].blob.text), expected);
  dirty(harness, false);
  assert.match(harness.get('toast').textContent, /Файл передан браузеру/);
  assert.doesNotMatch(harness.get('toast').textContent, /Не удалось передать/);
});


for (const panel of ['object', 'move']) test(`opening real file menu preserves ${panel} draft until capture navigation refuses the mode link`, async () => {
  const harness = await ready({ renderedNode: true });
  const node = harness.get('world').querySelector('g.node');
  assert.equal(node?.dataset.skNode, 'client', 'real mount bound the stub Mermaid node');
  harness.click(node);
  assert.equal(node.classList.contains('sk-selected'), true);
  harness.click(panel === 'object' ? 'editObject' : 'moveToGroup');
  const panelElement = harness.get(panel === 'object' ? 'objectPanel' : 'movePanel');
  const input = harness.get(panel === 'object' ? 'objectCaption' : 'targetGroup');
  assert.equal(panelElement.hidden, false, 'actual object/group handler opened the draft');
  input.value = panel === 'object' ? 'Private edited caption' : 'data';
  if (panel === 'object') input.setSelectionRange(2, 7);
  input.focus();
  if (panel === 'move') harness.dispatch(input, 'change');
  const expected = harness.snapshot();
  // Native pointerdown focuses the menu button; blocked navigation must not move it again.
  harness.get('more').focus();
  harness.click('more');
  assert.equal(harness.get('fileMenu').hidden, false, 'real menu toggle remains open after document click');
  assert.equal(harness.get('more').getAttribute('aria-expanded'), 'true');
  assert.equal(panelElement.hidden, false, 'opening the menu cannot dismiss the private draft');
  blockedBeforeDocument(harness);
  assert.equal(panelElement.hidden, false);
  assert.equal(input.value, panel === 'object' ? 'Private edited caption' : 'data');
  if (panel === 'object') { assert.equal(input.selectionStart, 2); assert.equal(input.selectionEnd, 7); }
  assert.equal(harness.document.activeElement, harness.get('more'));
  assert.equal(node.classList.contains('sk-selected'), true, 'the selected diagram object survives');
  assert.deepEqual(harness.snapshot(), expected);
  assert.equal(harness.get('fileMenu').hidden, false);
  assert.equal(harness.beforeUnload().defaultPrevented, true);
});

for (const panel of ['object', 'move']) test(`ordinary outside click still closes ${panel} draft as in the pinned standalone`, async () => {
  const harness = await ready({ renderedNode: true });
  const node = harness.get('world').querySelector('g.node');
  harness.click(node);
  harness.click(panel === 'object' ? 'editObject' : 'moveToGroup');
  const panelElement = harness.get(panel === 'object' ? 'objectPanel' : 'movePanel');
  assert.equal(panelElement.hidden, false);
  const expected = harness.snapshot();
  harness.click('more'); assert.equal(panelElement.hidden, false);
  harness.click('stats');
  assert.equal(panelElement.hidden, true);
  assert.equal(harness.get('fileMenu').hidden, true);
  assert.equal(node.classList.contains('sk-selected'), true);
  assert.deepEqual(harness.snapshot(), expected);
  assert.equal(harness.beforeUnload().defaultPrevented, false);
});
