import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { DEFAULT_REPORT_TEMPLATE } from '../../schemka-model-io/src/report.js';
import { installExportReportUI } from '../src/export-report-ui.js';
function fixture(t, native = {}) {
  const dom = new JSDOM('<body><details class="app-menu"><summary>Файл</summary><div class="menu-items"></div></details></body>', { url: 'https://arkita.test' }); t.after(() => dom.window.close()); const { window } = dom, { document } = window;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const store = createStore(createProject('Report')), run = command => store.execute(command, store.revision).created, { viewId } = run({ type: 'createView', name: 'Main' }), { viewId: other } = run({ type: 'createView', name: 'Other' }), privateObject = run({ type: 'createElementInModel', elementType: 'Role', name: 'PrivateSecret', properties: [{ key: 'secret', value: 'PrivateValue' }] });
  const model = createController(createStore(store.snapshot)); model.switchView(viewId); const saved = [], rendered = [], statuses = [], session = { documentToken: 'document-one' };
  window.schemkaDesktop = { saveExternalFiles: async (...args) => { saved.push(args); return { status: 'saved' }; }, ...native };
  const ui = installExportReportUI({ document, window, model, session, openDialog: id => document.getElementById(id).showModal(), blocked: () => false, status: x => statuses.push(x), snapshotViewSvg(state, id, options) { rendered.push({ state, id, options }); return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><title>${id}</title><text x="10" y="10">Test</text></svg>`; } });
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
