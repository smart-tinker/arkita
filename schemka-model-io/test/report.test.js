import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { generateHtmlReport, prepareReportProject, readReportTemplate, DEFAULT_REPORT_TEMPLATE } from '../src/report.js';
import { reportMarkdown } from '../src/report-markdown.js';
const fixture = () => { const store = createStore(createProject('Отчёт <script>bad()</script>')), run = command => store.execute(command, store.revision).created, { viewId } = run({ type: 'createView', name: 'Диаграмма' }), folder = run({ type: 'createFolder', name: 'Private folder' }), a = run({ type: 'createElementInModel', elementType: 'Role', name: 'PrivateSecretEntity', folderId: folder.folderId }), b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Role', name: 'Public', bounds: { x: 1, y: 2, width: 100, height: 80 }, documentation: 'Retain\r\n日本語', properties: [{ key: 'secret', value: 'PrivateSecretValue' }, { key: 'owner', value: 'Team' }, { key: 'owner', value: 'Other' }] }), c = run({ type: 'addOccurrence', viewId, concept: { kind: 'element', id: a.elementId }, bounds: { x: 200, y: 2, width: 100, height: 80 } }), r = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association', source: { kind: 'occurrence', id: b.occurrenceId }, target: { kind: 'occurrence', id: c.occurrenceId }, label: 'PrivateSecretRelation' }); return { store, run, viewId, a, b, r, folder }; };

test('real report exclusion precedes all data, follows folder/relationship/drawing closure and leaves source exact', () => {
  const f = fixture(), before = f.store.exportFiles(), out = prepareReportProject(f.store.snapshot, { excludeIds: [f.folder.folderId], excludeProperties: ['secret'], documentation: false });
  assert.equal(out.snapshot.elements.length, 1); assert.equal(out.snapshot.relationships.length, 0); assert.equal(out.snapshot.views[0].occurrences.length, 1); assert.equal(out.snapshot.elements[0].documentation, ''); assert.deepEqual(out.snapshot.elements[0].properties, [{ key: 'owner', value: 'Team' }, { key: 'owner', value: 'Other' }]);
  const html = generateHtmlReport(out.snapshot, { revision: f.store.revision, generatedAt: '2026-01-01T00:00:00Z' }); for (const privateText of ['PrivateSecretEntity', 'PrivateSecretValue', 'PrivateSecretRelation', f.a.elementId, f.folder.folderId]) assert.ok(!html.includes(privateText)); assert.deepEqual(f.store.exportFiles(), before);
  assert.throws(() => prepareReportProject(f.store.snapshot, { excludeIds: [f.store.snapshot.project.id] }));
});

test('offline report scripts use only fixed code; model HTML is inert, search and query resolve exact IDs', async t => {
  const f = fixture(), html = generateHtmlReport(f.store.snapshot, { revision: 1 });
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'file:///report.html' }); t.after(() => dom.window.close()); const { document, Event } = dom.window;
  assert.equal(document.querySelectorAll('script').length, 2); assert.equal(dom.window.bad, undefined); assert.match(document.querySelector('h1').textContent, /<script>/);
  const search = document.getElementById('report-search'); search.value = 'privatesecretentity'; search.dispatchEvent(new Event('input')); assert.equal(document.getElementById(f.a.elementId).hidden, false); assert.equal(document.getElementById(f.b.elementId).hidden, true); document.getElementById('report-reset').click(); assert.equal(document.getElementById(f.b.elementId).hidden, false);
  const filter = document.querySelector(`[data-filter="${f.folder.folderId}"]`); filter.checked = false; filter.dispatchEvent(new Event('change')); assert.equal(document.getElementById(f.a.elementId).hidden, true); assert.equal(document.getElementById(f.folder.folderId).hidden, false); assert.ok(html.includes('PrivateSecretEntity'));
  document.getElementById('query-table').value = 'element'; document.getElementById('query-field').value = 'name'; document.getElementById('query-value').value = 'public'; document.getElementById('query-form').dispatchEvent(new Event('submit', { cancelable: true })); assert.equal(document.querySelector('#query-result a').getAttribute('href'), `#${f.b.elementId}`);
});

test('report templates are closed data with sections and locale; malformed/active templates fail before export', () => {
  const f = fixture(), custom = { ...DEFAULT_REPORT_TEMPLATE, title: 'Architecture ${model.name}', locale: 'en-US', sections: ['views', 'summary'] }, html = generateHtmlReport(f.store.snapshot, { revision: 1, template: custom }); assert.ok(html.indexOf('section-views') < html.indexOf('section-summary')); assert.match(html, /Revision 1/); assert.ok(!html.includes(f.a.elementId));
  assert.throws(() => readReportTemplate(JSON.stringify({ ...custom, script: 'run()' }))); assert.throws(() => readReportTemplate(JSON.stringify({ ...custom, sections: ['views', 'views'] }))); assert.throws(() => generateHtmlReport(f.store.snapshot, { revision: 1, diagrams: { [f.viewId]: '<svg onload="bad()"/>' } }));
});

test('closed Markdown preserves tables/code/Unicode while escaping HTML and disabling external resources', () => {
  const source = '# Кириллица\n\n| Key | Value |\n| --- | --- |\n| Русский | 日本語 |\n\n```js\n<script>bad()</script>\n```\n\n[Сайт](https://example.test/path?q=1&b=2)\n<img src=x onerror=bad()>', markup = reportMarkdown(source); const dom = new JSDOM(markup);
  assert.equal(dom.window.document.querySelectorAll('table td').length, 2); assert.equal(dom.window.document.querySelector('script,img,a'), null); assert.match(dom.window.document.querySelector('code').textContent, /<script>/); dom.window.close();
  assert.match(reportMarkdown('[Link](https://example.test)', { externalLinks: true }), /rel="noopener noreferrer"/); assert.ok(!reportMarkdown('[X](javascript:bad)', { externalLinks: true }).includes('href='));
});

test('exported reports keep UNC file links inert when external links are enabled', () => {
  const f = fixture();
  f.run({ type: 'updateMetadata', owner: { kind: 'element', id: f.b.elementId }, documentation: '[Private](file://server/share/private.txt)\n\n[Site](https://example.test)' });
  const dom = new JSDOM(generateHtmlReport(f.store.snapshot, { revision: f.store.revision, externalLinks: true }));
  assert.equal(dom.window.document.querySelector('a[href^="file:"]'), null);
  assert.equal(dom.window.document.querySelector('a[href^="https:"]').getAttribute('href'), 'https://example.test');
  dom.window.close();
});


test('optional report logo uses only an existing validated asset and is embedded offline without model changes', t => {
  const f = fixture(), data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#123456"/></svg>').toString('base64');
  const { assetId } = f.run({ type: 'createAsset', name: 'Logo <script>bad()</script>', mediaType: 'image/svg+xml', data }), before = f.store.exportFiles();
  const template = { ...DEFAULT_REPORT_TEMPLATE, logoAssetId: assetId };
  assert.deepEqual(readReportTemplate(JSON.stringify(template)), template);
  assert.equal(Object.hasOwn(readReportTemplate(JSON.stringify(DEFAULT_REPORT_TEMPLATE)), 'logoAssetId'), false);
  const dom = new JSDOM(generateHtmlReport(f.store.snapshot, { revision: f.store.revision, template })); t.after(() => dom.window.close());
  const logo = dom.window.document.querySelector('header img.report-logo');
  assert.equal(logo.getAttribute('src'), `data:image/svg+xml;base64,${data}`);
  assert.equal(logo.getAttribute('alt'), 'Logo <script>bad()</script>');
  assert.ok(Number(logo.getAttribute('width')) <= 160); assert.ok(Number(logo.getAttribute('height')) <= 64);
  assert.equal(dom.window.document.querySelectorAll('script').length, 2);
  assert.match(dom.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, /img-src data:/);
  assert.deepEqual(f.store.exportFiles(), before);
  const png = f.run({ type: 'createAsset', name: 'Small logo', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7L8AAAAASUVORK5CYII=' });
  const small = new JSDOM(generateHtmlReport(f.store.snapshot, { revision: f.store.revision, template: { ...template, logoAssetId: png.assetId } })); t.after(() => small.window.close());
  assert.equal(small.window.document.querySelector('.report-logo').getAttribute('width'), '1'); assert.equal(small.window.document.querySelector('.report-logo').getAttribute('height'), '1');
});

test('report logo rejects malformed IDs, missing resources and active image payloads before output', () => {
  const f = fixture(), missing = 'ast-00000000-0000-4000-8000-000000000000';
  for (const logoAssetId of [null, '', 'https://example.test/logo.png', missing.toUpperCase(), missing.replace('ast-', 'el-'), {}]) assert.throws(() => readReportTemplate(JSON.stringify({ ...DEFAULT_REPORT_TEMPLATE, logoAssetId })));
  assert.throws(() => generateHtmlReport(f.store.snapshot, { revision: 0, template: { ...DEFAULT_REPORT_TEMPLATE, logoAssetId: missing } }), /логотип.*отсутствует/i);
  const state = f.store.snapshot; state.assets.push({ id: missing, name: 'Active', mediaType: 'image/svg+xml', encoding: 'base64', data: Buffer.from('<svg width="10" height="10" onload="bad()"/>').toString('base64') });
  assert.throws(() => generateHtmlReport(state, { revision: 0, template: { ...DEFAULT_REPORT_TEMPLATE, logoAssetId: missing } }));
});
