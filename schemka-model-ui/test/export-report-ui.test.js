import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { DEFAULT_REPORT_TEMPLATE, prepareReportProject } from '../../schemka-model-io/src/report.js';
import { installExportReportUI } from '../src/export-report-ui.js';
import { renderVisualNode } from '../src/visual-drawings.js';
import { exportViewSvg } from '../src/svg-export.js';
function fixture(t, native = {}, makeSnapshotViewSvg) {
  const dom = new JSDOM('<body><details class="app-menu"><summary>Файл</summary><div class="menu-items"></div></details></body>', { url: 'https://arkita.test' }); t.after(() => dom.window.close()); const { window } = dom, { document } = window;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const store = createStore(createProject('Report')), run = command => store.execute(command, store.revision).created, { viewId } = run({ type: 'createView', name: 'Main' }), { viewId: other } = run({ type: 'createView', name: 'Other' }), privateObject = run({ type: 'createElementInModel', elementType: 'Role', name: 'PrivateSecret', properties: [{ key: 'secret', value: 'PrivateValue' }] });
  const model = createController(createStore(store.snapshot)); model.switchView(viewId); const saved = [], rendered = [], statuses = [], session = { documentToken: 'document-one' };
  window.schemkaDesktop = { saveExternalFiles: async (...args) => { saved.push(args); return { status: 'saved' }; }, ...native };
  const snapshotViewSvg = makeSnapshotViewSvg ? makeSnapshotViewSvg({ document, window, rendered }) : (state, id, options) => { rendered.push({ state, id, options }); return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><title>${id}</title><text x="10" y="10">Test</text></svg>`; };
  const ui = installExportReportUI({ document, window, model, session, openDialog: id => document.getElementById(id).showModal(), blocked: () => false, status: x => statuses.push(x), snapshotViewSvg });
  const $ = id => document.getElementById(id), event = (id, type) => $(id).dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 2)); };
  return { $, event, settle, ui, model, session, saved, rendered, statuses, privateObject, other, document, window };
}

test('report preview and native output share one filtered revision; inert preview uses the real renderer callback', async t => {
  const h = fixture(t), before = h.model.store.exportFiles(); h.ui.open(); h.$('export-report-format').value = 'html'; h.event('export-report-format', 'change');
  const option = [...h.$('export-report-exclude').options].find(item => item.value === h.privateObject.elementId); option.selected = true; h.event('export-report-exclude', 'change'); h.$('export-report-generate').click(); await h.settle();
  assert.equal(h.$('export-report-save').disabled, false, h.$('export-report-feedback').textContent); assert.equal(h.rendered.length, 2); assert.ok(h.rendered.every(call => !call.state.elements.some(item => item.id === h.privateObject.elementId))); assert.equal(h.$('export-report-preview').querySelector('script,iframe,object'), null);
  h.event('export-report-form', 'submit'); await h.settle(); const [kind, records, token] = h.saved[0]; assert.equal(kind, 'html'); assert.equal(token, h.session.documentToken); const html = new TextDecoder().decode(records[0].bytes); assert.ok(!html.includes('PrivateSecret')); assert.ok(!html.includes('PrivateValue')); assert.match(h.$('export-report-feedback').textContent, /файл сохранён/); assert.deepEqual(h.model.store.exportFiles(), before);
});

test('excluded image drawing is absent from the saved HTML while retained image data is rendered', async t => {
  const renderedIds = [], h = fixture(t, {}, ({ document }) => (state, id) => {
    const entry = state.views.find(item => item.view.id === id), canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    canvas.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); canvas.style.backgroundColor = '#fff'; document.body.append(canvas);
    try { for (const item of entry.visualNodes) { renderedIds.push(item.id); canvas.append(renderVisualNode(document, item, state, entry)); }
      return exportViewSvg({ canvas, bounds: { x: 0, y: 0, width: 900, height: 640 }, title: entry.view.name });
    } finally { canvas.remove(); }
  });
  const visibleData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=';
  const excludedData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7L8AAAAASUVORK5CYII=';
  const visibleAsset = h.model.execute({ type: 'createAsset', name: 'Visible image', mediaType: 'image/png', data: visibleData }).created.assetId;
  const excludedAsset = h.model.execute({ type: 'createAsset', name: 'Excluded image', mediaType: 'image/png', data: excludedData }).created.assetId;
  const viewId = h.model.store.snapshot.views[0].view.id;
  const bounds = { x: 20, y: 20, width: 220, height: 140 };
  const visibleNode = h.model.execute({ type: 'createVisualNode', viewId, kind: 'image', name: 'Visible drawing', bounds, assetId: visibleAsset }).created.visualNodeId;
  const excludedNode = h.model.execute({ type: 'createVisualNode', viewId, kind: 'image', name: 'Excluded drawing', bounds, assetId: excludedAsset }).created.visualNodeId;
  const before = h.model.store.exportFiles(); h.ui.open(); h.$('export-report-format').value = 'html'; h.event('export-report-format', 'change');
  const option = [...h.$('export-report-exclude').options].find(item => item.value === excludedNode); assert.ok(option); option.selected = true; h.event('export-report-exclude', 'change');
  h.$('export-report-generate').click(); await h.settle(); assert.equal(h.$('export-report-save').disabled, false, h.$('export-report-feedback').textContent);
  h.event('export-report-form', 'submit'); await h.settle();
  const html = new TextDecoder().decode(h.saved[0][1][0].bytes), dom = new JSDOM(html); t.after(() => dom.window.close());
  const diagram = dom.window.document.querySelector(`#image-${viewId}`), svg = Buffer.from(diagram.getAttribute('src').split(',')[1], 'base64').toString('utf8');
  assert.deepEqual(renderedIds, [visibleNode]); assert.ok(svg.includes(visibleData)); assert.ok(!svg.includes(excludedData));
  assert.deepEqual(h.model.store.exportFiles(), before);
});

test('excluded view references warn in preview while excluded view data stays out of saved HTML and SVG', async t => {
  const renderedIds = [], h = fixture(t, {}, ({ document }) => (state, id) => {
    const entry = state.views.find(item => item.view.id === id), canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    canvas.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); canvas.style.backgroundColor = '#fff'; document.body.append(canvas);
    try { for (const item of entry.visualNodes) { renderedIds.push(item.id); canvas.append(renderVisualNode(document, item, state, entry)); }
      return exportViewSvg({ canvas, bounds: { x: 0, y: 0, width: 900, height: 640 }, title: entry.view.name });
    } finally { canvas.remove(); }
  });
  const excludedViewId = h.other, mainViewId = h.model.store.snapshot.views[0].view.id;
  const excludedName = 'ExcludedViewNameSentinel', excludedViewText = 'ExcludedViewTextSentinel', excludedNoteText = 'ExcludedNoteTextSentinel';
  const excludedData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7L8AAAAASUVORK5CYII=';
  h.model.execute({ type: 'renameView', viewId: excludedViewId, name: excludedName });
  h.model.execute({ type: 'updateMetadata', owner: { kind: 'view', id: excludedViewId }, documentation: excludedViewText });
  const { assetId } = h.model.execute({ type: 'createAsset', name: 'ExcludedResourceNameSentinel', mediaType: 'image/png', data: excludedData }).created;
  const imageId = h.model.execute({ type: 'createVisualNode', viewId: excludedViewId, kind: 'image', name: 'ExcludedImageNameSentinel', assetId, bounds: { x: 20, y: 20, width: 220, height: 140 } }).created.visualNodeId;
  const noteId = h.model.execute({ type: 'createVisualNode', viewId: excludedViewId, kind: 'note', name: 'ExcludedNoteNameSentinel', text: excludedNoteText, documentation: 'ExcludedNoteDocumentationSentinel', bounds: { x: 260, y: 20, width: 220, height: 140 } }).created.visualNodeId;
  const retainedId = h.model.execute({ type: 'createVisualNode', viewId: mainViewId, kind: 'note', name: 'RetainedMainNote', text: 'RetainedMainText', bounds: { x: 260, y: 20, width: 220, height: 140 } }).created.visualNodeId;
  const referenceId = h.model.execute({ type: 'createVisualNode', viewId: mainViewId, kind: 'viewReference', targetViewId: excludedViewId, name: 'ExcludedReferenceNameSentinel', documentation: 'ExcludedReferenceDocumentationSentinel', bounds: { x: 20, y: 20, width: 220, height: 140 } }).created.visualNodeId;
  const secondReferenceId = h.model.execute({ type: 'createVisualNode', viewId: mainViewId, kind: 'viewReference', targetViewId: excludedViewId, name: 'SecondExcludedReferenceNameSentinel', bounds: { x: 20, y: 200, width: 220, height: 140 } }).created.visualNodeId;
  const referenceIds = [referenceId, secondReferenceId];
  const before = h.model.store.exportFiles(), revision = h.model.store.revision, undoCount = h.model.store.history.undo;
  const expectedWarnings = referenceIds.map(id => `Ссылка ${id} удалена из сохранённого представления «Main» (${mainViewId}), так как целевое представление исключено`);
  const prepared = prepareReportProject(h.model.store.snapshot, { excludeIds: [excludedViewId] });
  assert.deepEqual(prepared.warnings, expectedWarnings);
  assert.equal(prepared.snapshot.views.some(entry => entry.view.id === excludedViewId), false);
  assert.equal(prepared.snapshot.views[0].visualNodes.some(item => referenceIds.includes(item.id)), false);

  h.ui.open(); h.$('export-report-format').value = 'html'; h.event('export-report-format', 'change');
  const option = [...h.$('export-report-exclude').options].find(item => item.value === excludedViewId); assert.ok(option); option.selected = true; h.event('export-report-exclude', 'change');
  h.$('export-report-generate').click(); await h.settle();
  const feedback = h.$('export-report-feedback').textContent;
  for (const warning of expectedWarnings) assert.ok(feedback.includes(warning), `missing preview warning: ${warning}`);
  assert.equal(h.$('export-report-save').disabled, false, feedback);
  for (const value of [excludedViewId, assetId, imageId, noteId, excludedName, excludedViewText, excludedNoteText, excludedData, 'ExcludedResourceNameSentinel', 'ExcludedImageNameSentinel', 'ExcludedNoteDocumentationSentinel', 'ExcludedReferenceDocumentationSentinel', 'SecondExcludedReferenceNameSentinel']) assert.ok(!feedback.includes(value), `warning leaked ${value}`);
  assert.deepEqual(renderedIds, [retainedId]);
  assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.model.store.revision, revision); assert.equal(h.model.store.history.undo, undoCount);

  h.event('export-report-form', 'submit'); await h.settle();
  const html = new TextDecoder().decode(h.saved[0][1][0].bytes), dom = new JSDOM(html); t.after(() => dom.window.close());
  const dataText = dom.window.document.getElementById('report-data').textContent;
  const diagram = dom.window.document.querySelector(`#image-${mainViewId}`), svg = Buffer.from(diagram.getAttribute('src').split(',')[1], 'base64').toString('utf8');
  assert.ok(svg.includes('RetainedMainText'));
  for (const surface of [html, dataText, svg]) for (const value of [excludedViewId, assetId, imageId, noteId, ...referenceIds, excludedName, excludedViewText, excludedNoteText, excludedData, 'ExcludedResourceNameSentinel', 'ExcludedImageNameSentinel', 'ExcludedNoteDocumentationSentinel', 'ExcludedReferenceDocumentationSentinel', 'SecondExcludedReferenceNameSentinel']) assert.ok(!surface.includes(value), `report output leaked ${value}`);
  assert.match(h.$('export-report-feedback').textContent, /файл сохранён/);
  assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.model.store.revision, revision); assert.equal(h.model.store.history.undo, undoCount);
});

test('cancelled native output is not success; changing fields invalidates output and stale model closes preview', async t => {
  const h = fixture(t, { saveExternalFiles: async () => ({ status: 'cancelled' }) }); h.ui.open(); h.$('export-report-generate').click(); await h.settle(); h.event('export-report-form', 'submit'); await h.settle(); assert.match(h.$('export-report-feedback').textContent, /отменён/);
  h.$('export-report-include-hidden').checked = true; h.event('export-report-include-hidden', 'change'); assert.equal(h.$('export-report-save').disabled, true); h.event('export-report-form', 'submit'); assert.equal(h.saved.length, 0);
  h.model.execute({ type: 'renameProject', name: 'Changed' }); h.ui.refresh(); assert.equal(h.$('export-report-dialog').open, false);
});

test('print preview uses exact shared pagination and PDF passes closed paper options without editing', async t => {
  const calls = [], h = fixture(t, { savePdf: async (...args) => { calls.push(args); return { status: 'saved' }; } }), before = h.model.store.exportFiles(); h.ui.open(); h.$('export-report-format').value = 'pdf'; h.event('export-report-format', 'change'); h.$('export-report-print-scale').value = '200'; h.event('export-report-print-scale', 'change'); h.$('export-report-generate').click(); await h.settle();
  assert.ok(h.document.querySelectorAll('.export-print-page').length > 1); h.event('export-report-form', 'submit'); await h.settle(); assert.deepEqual(calls[0][2], { paper: 'A4', landscape: false, scale: 200 });assert.equal(calls[0][3],h.session.documentToken); assert.deepEqual(h.model.store.exportFiles(), before);
});

test('late template read cannot change a cancelled or newly opened dialog', async t => {
  let finish; const pending = new Promise(resolve => { finish = resolve; }); const h = fixture(t, { readExternalFiles: () => pending }); h.ui.open(); h.$('export-report-format').value = 'html'; h.event('export-report-format', 'change'); h.$('export-report-template-open').click(); h.ui.cancel(); h.ui.open(); const before = h.$('export-report-title').value;
  finish({ status: 'opened', files: [{ bytes: new TextEncoder().encode(JSON.stringify({ format: 'arkita-report-template', version: 1, title: 'Late', locale: 'en-US', sections: ['summary'], footer: 'Footer' })) }] }); await h.settle(); assert.equal(h.$('export-report-title').value, before); assert.ok(!h.$('export-report-template-state').textContent.includes('summary'));
});

test('same-revision store replacement cannot export an old preview even if a test host reuses its document token',async t=>{
 const h=fixture(t);h.ui.open();h.$('export-report-generate').click();await h.settle();assert.equal(h.$('export-report-save').disabled,false);const next=h.model.store.snapshot;next.project.name='New document';h.model.store=createStore(next);h.event('export-report-form','submit');await h.settle();assert.equal(h.saved.length,0);assert.match(h.$('export-report-feedback').textContent,/Обновите предпросмотр/);h.ui.refresh();assert.equal(h.$('export-report-dialog').open,false);
});
test('late template-save completion reports the initiating operation without overwriting a reopened dialog',async t=>{
 let finish;const pending=new Promise(resolve=>finish=resolve),calls=[],h=fixture(t,{saveExternalFiles:async(...args)=>{calls.push(args);return pending;}});h.ui.open();h.$('export-report-template-save').click();h.ui.cancel();h.session.documentToken='document-two';h.ui.open();const before=h.$('export-report-feedback').textContent;finish({status:'saved'});await h.settle();assert.equal(calls[0][2],'document-one');assert.equal(h.$('export-report-feedback').textContent,before);assert.match(h.statuses.at(-1),/Шаблон сохранён/);
});


test('native output keeps its dialog until the system operation finishes; Escape cannot imply a cancelled print',async t=>{
 let finish;const output=new Promise(resolve=>finish=resolve),h=fixture(t,{savePdf:()=>output});h.ui.open();h.$('export-report-format').value='pdf';h.event('export-report-format','change');h.$('export-report-generate').click();await h.settle();const before=h.model.store.exportFiles();h.event('export-report-form','submit');
 assert.equal(h.$('export-report-cancel').disabled,true);assert.equal(h.$('export-report-format').disabled,true);
 const escape=new h.window.Event('cancel',{cancelable:true});h.$('export-report-dialog').dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.ok(h.$('export-report-dialog').open);assert.match(h.$('export-report-feedback').textContent,/системном окне/);
 finish({status:'cancelled'});await h.settle();assert.equal(h.$('export-report-cancel').disabled,false);assert.equal(h.$('export-report-format').disabled,false);assert.match(h.$('export-report-feedback').textContent,/Вывод отменён/);h.ui.cancel();assert.equal(h.$('export-report-dialog').open,false);assert.deepEqual(h.model.store.exportFiles(),before);
});


test('report logo selection previews and saves exact data URI; clearing removes optional template reference', async t => {
  const h = fixture(t), data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#234567"/></svg>').toString('base64');
  const { assetId } = h.model.execute({ type: 'createAsset', name: 'Company logo', mediaType: 'image/svg+xml', data }).created, before = h.model.store.exportFiles();
  h.ui.open(); h.$('export-report-format').value = 'html'; h.event('export-report-format', 'change');
  const logo = h.$('export-report-logo'); assert.ok(logo); assert.equal(logo.options.length, 2); logo.value = assetId; h.event(logo.id, 'change');
  h.$('export-report-generate').click(); await h.settle(); assert.equal(h.$('export-report-save').disabled, false, h.$('export-report-feedback').textContent);
  assert.equal(h.$('export-report-preview').querySelector('header img.report-logo').src, `data:image/svg+xml;base64,${data}`);
  h.event('export-report-form', 'submit'); await h.settle(); assert.match(new TextDecoder().decode(h.saved[0][1][0].bytes), /class="report-logo"/);
  h.$('export-report-template-save').click(); await h.settle(); assert.equal(JSON.parse(new TextDecoder().decode(h.saved[1][1][0].bytes)).logoAssetId, assetId);
  logo.value = ''; h.event(logo.id, 'change'); assert.equal(h.$('export-report-save').disabled, true); h.$('export-report-template-save').click(); await h.settle();
  assert.equal(Object.hasOwn(JSON.parse(new TextDecoder().decode(h.saved[2][1][0].bytes)), 'logoAssetId'), false);
  h.$('export-report-generate').click(); await h.settle(); assert.equal(h.$('export-report-preview').querySelector('header img.report-logo'), null);
  assert.deepEqual(h.model.store.exportFiles(), before);
});

test('template import fills logo choice; missing resource keeps prior settings and old templates clear it', async t => {
  let incoming; const h = fixture(t, { readExternalFiles: async () => ({ status: 'opened', files: [{ bytes: new TextEncoder().encode(JSON.stringify(incoming)) }] }) });
  const { assetId } = h.model.execute({ type: 'createAsset', name: 'Logo', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7L8AAAAASUVORK5CYII=' }).created, before = h.model.store.exportFiles();
  h.ui.open(); incoming = { ...DEFAULT_REPORT_TEMPLATE, title: 'Imported', logoAssetId: assetId }; h.$('export-report-template-open').click(); await h.settle();
  assert.equal(h.$('export-report-title').value, 'Imported'); assert.equal(h.$('export-report-logo').value, assetId);
  incoming = { ...incoming, title: 'Must not apply', logoAssetId: 'ast-00000000-0000-4000-8000-000000000000' }; h.$('export-report-template-open').click(); await h.settle();
  assert.match(h.$('export-report-feedback').textContent, /логотип.*отсутствует/i); assert.equal(h.$('export-report-title').value, 'Imported'); assert.equal(h.$('export-report-logo').value, assetId);
  h.$('export-report-logo').value = ''; h.event('export-report-logo', 'change'); h.$('export-report-template-save').click(); await h.settle();
  assert.equal(Object.hasOwn(JSON.parse(new TextDecoder().decode(h.saved[0][1][0].bytes)), 'logoAssetId'), false);
  incoming = { ...DEFAULT_REPORT_TEMPLATE }; h.$('export-report-template-open').click(); await h.settle(); assert.equal(h.$('export-report-logo').value, '');
  assert.deepEqual(h.model.store.exportFiles(), before);
});

test('selected report logo missing in a replacement document fails before diagram generation', async t => {
  const h = fixture(t), { assetId } = h.model.execute({ type: 'createAsset', name: 'Logo', mediaType: 'image/svg+xml', data: Buffer.from('<svg width="10" height="10"/>').toString('base64') }).created;
  h.ui.open(); h.$('export-report-format').value = 'html'; h.event('export-report-format', 'change'); h.$('export-report-logo').value = assetId; h.event('export-report-logo', 'change'); h.ui.cancel();
  const replacement = h.model.store.snapshot; replacement.assets = []; h.model.store = createStore(replacement); h.ui.open(); h.$('export-report-generate').click(); await h.settle();
  assert.match(h.$('export-report-feedback').textContent, /логотип.*отсутствует/i); assert.equal(h.rendered.length, 0); assert.equal(h.$('export-report-save').disabled, true); assert.equal(h.saved.length, 0);
});
