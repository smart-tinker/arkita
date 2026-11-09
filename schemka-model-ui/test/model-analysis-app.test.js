import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { fixtureId as id } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { assertSvgExport } from '../src/svg-export.js';
import { queryModelGraph } from '../../schemka-model-core/src/index.js';

const mode = production ? 'production' : 'source';
const stateOf = h => ({ history: h.$('history-state').textContent, undo: h.$('undo').disabled, redo: h.$('redo').disabled, dirty: h.$('file-state').dataset.dirty });
const press = (h, element, key) => element.dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
function select(h, kind, value) { const item = h.document.querySelector(`[data-${kind}-id="${id(kind === 'element' ? 'el' : kind === 'junction' ? 'jct' : 'rel', value)}"]`); assert.ok(item); item.click(); }
function result(h, kind, value) { const item = h.$('analysis-results').querySelector(`[data-analysis-result-kind="${kind}"][data-analysis-result-id="${id(kind === 'element' ? 'el' : kind === 'junction' ? 'jct' : 'rel', value)}"]`); assert.ok(item); return item; }
function renameProject(h, name) { h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = name; input.dispatchEvent(new h.window.Event('input', { bubbles: true })); press(h, input, 'Enter'); }

test(`${mode} analysis dock follows real editor selection, pin/back/home preserve history and the exact model`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  select(h, 'element', 1); h.$('model-analysis-button').click();
  assert.equal(h.$('model-analysis-panel').hidden, false); assert.equal(h.$('analysis-generation-dialog').open, false);
  assert.match(h.$('analysis-root').textContent, /Grouping/); const before = stateOf(h);
  h.$('analysis-pin').click(); select(h, 'element', 2); assert.match(h.$('analysis-root').textContent, /Grouping/);
  const oldResult = result(h, 'relationship', 1); oldResult.click(); assert.match(h.$('analysis-root').textContent, /Link 1/);
  h.$('analysis-graph-scroll').scrollTop = 31; h.$('analysis-zoom-in').click(); const zoom = h.$('analysis-zoom-value').textContent;
  result(h, 'junction', 1).click(); assert.match(h.$('analysis-root').textContent, /AndJunction/);
  h.$('analysis-back').click(); assert.match(h.$('analysis-root').textContent, /Link 1/); assert.equal(h.$('analysis-graph-scroll').scrollTop, 31); assert.equal(h.$('analysis-zoom-value').textContent, zoom);
  h.$('analysis-home').click(); assert.match(h.$('analysis-root').textContent, /Grouping/);
  h.$('analysis-pin').click(); assert.match(h.$('analysis-root').textContent, /ApplicationComponent/);
  oldResult.click(); assert.match(h.$('analysis-root').textContent, /ApplicationComponent/);
  assert.deepEqual(stateOf(h), before); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} graph direction/type/depth/layout/zoom controls are read-only and explain hidden roots and size boundaries`, async t => {
  const h = await setup(t), state = conceptProject(); await h.load(serializeProjectFile(state)); select(h, 'relationship', 11); h.$('model-analysis-button').click();
  const before = stateOf(h); h.change('analysis-depth', '0'); assert.equal(h.$('analysis-results').children.length, 1); assert.match(h.$('analysis-summary').textContent, /концы за границей/);
  h.change('analysis-depth', '8'); h.change('analysis-direction', 'incoming'); assert.ok(h.$('analysis-results').children.length > 1);
  h.change('analysis-direction', 'both'); h.change('analysis-layout-direction', 'rows');
  h.$('analysis-orthogonal').checked = true; h.$('analysis-orthogonal').dispatchEvent(new h.window.Event('change'));
  assert.ok(h.$('analysis-graph').querySelector('[data-analysis-edge]'));
  const zoom = parseInt(h.$('analysis-zoom-value').textContent); h.$('analysis-zoom-in').click(); assert.ok(parseInt(h.$('analysis-zoom-value').textContent) >= zoom);
  const type = h.document.querySelector('[data-analysis-type-kind="relationship"][value="Association"]'); type.checked = false; type.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.$('analysis-results').children.length, 0); assert.match(h.$('analysis-summary').textContent, /Корень скрыт/); assert.equal(h.$('analysis-generate').disabled, true);
  h.$('analysis-reset-filters').click(); assert.ok(h.$('analysis-results').children.length > 1);
  assert.deepEqual(stateOf(h), before); assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(state)));
});

test(`${mode} generation preview lists relation endpoint closure, cancellation is inert, confirmed view reuses concepts and one Undo restores exact bytes`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes); select(h, 'relationship', 11); h.$('model-analysis-button').click(); h.change('analysis-depth', '0');
  h.$('analysis-generate').click(); h.change('analysis-generation-relationships', 'selected');
  assert.equal(h.$('analysis-generation-dialog').open, true); assert.equal(h.$('analysis-generation-details').children.length, 3);
  h.$('analysis-generation-dialog').querySelector('[data-close]').click(); assert.deepEqual(await h.download(), bytes);
  h.$('analysis-generate').click(); h.change('analysis-generation-relationships', 'selected'); h.$('analysis-generation-name').value = 'Связи связей';
  h.$('analysis-generation-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('analysis-generation-dialog').open, false); assert.equal(h.$('views').children.length, 3);
  const after = await h.download(), next = deserializeProjectFile(after.toString());
  assert.deepEqual(next.elements, deserializeProjectFile(bytes.toString()).elements); assert.deepEqual(next.relationships, deserializeProjectFile(bytes.toString()).relationships);
  const generated = next.views.find(entry => entry.view.name === 'Связи связей'); assert.equal(generated.occurrences.length, 2); assert.equal(generated.connections.length, 2);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), after);
});

test(`${mode} generation rejects stale preview without a second mutation and preserves redo`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  renameProject(h, 'Временное имя'); select(h, 'element', 1); h.$('analysis-generation-selection').click(); assert.equal(h.$('analysis-generation-dialog').open, true);
  // A programmatic external revision change simulates a stale preview; real dialog blocks background input.
  h.$('undo').click(); const before = stateOf(h);
  h.$('analysis-generation-form').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
  assert.match(h.$('analysis-generation-error').textContent, /Модель изменилась/); assert.equal(h.$('views').children.length, 2); assert.deepEqual(stateOf(h), before);
  h.$('analysis-generation-dialog').querySelector('[data-close]').click(); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} SVG export keeps filtered graph and inert Unicode labels; clipboard denial is visible and neither action edits the model`, async t => {
  const h = await setup(t), state = conceptProject(); state.elements[0].name = 'Платёж <script> 🙂 漢字'; const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  select(h, 'element', 1); h.$('model-analysis-button').click(); h.change('analysis-depth', '0'); const before = stateOf(h);
  let download = null; h.window.HTMLAnchorElement.prototype.click = function () { download = { name: this.download, url: this.href }; };
  const blobs = new Map(); h.window.URL.createObjectURL = blob => { blobs.set('blob:analysis', blob); return 'blob:analysis'; }; h.window.URL.revokeObjectURL = () => {};
  h.$('analysis-export').click(); await new Promise(resolve => setImmediate(resolve)); assert.ok(download); assert.match(download.name, /\.svg$/);
  const svg = await blobs.get(download.url).text(); assert.equal(assertSvgExport(svg), svg); assert.match(svg, /Платёж &lt;script&gt; 🙂 漢字/); assert.equal(/<script|<foreignObject|data-analysis/.test(svg), false);
  const parsed = new h.window.DOMParser().parseFromString(svg, 'image/svg+xml'); assert.equal(parsed.querySelector('parsererror'), null); assert.equal(parsed.querySelectorAll('g').length, 1);
  h.$('analysis-copy').click(); await new Promise(resolve => setImmediate(resolve)); assert.match(h.$('analysis-feedback').textContent, /Буфер изображений недоступен/); assert.deepEqual(stateOf(h), before);
});

test(`${mode} quality analysis reports full-model issues, changes active rules, navigates by ID and invalidates stale results`, async t => {
  const h = await setup(t), state = conceptProject(); state.elements[1].name = state.elements[0].name; state.elements[1].type = state.elements[0].type;
  await h.load(serializeProjectFile(state)); h.$('model-analysis-button').click(); h.$('analysis-quality-run').click();
  assert.equal(h.$('analysis-quality-results').querySelectorAll('[data-analysis-rule="empty-views"]').length, 1);
  const duplicate = h.$('analysis-quality-results').querySelector('[data-analysis-rule="duplicate-names"]'); assert.ok(duplicate); assert.equal(duplicate.querySelectorAll('button').length, 2);
  const before = stateOf(h); h.$('tree-common').open = false; duplicate.querySelector('button').click(); assert.deepEqual(stateOf(h), before); assert.ok(h.$('inspector-content').textContent.includes(id('el', 1)));
  assert.equal(h.$('tree-common').open, true); assert.equal(h.document.activeElement.dataset.elementId, id('el', 1));
  for (const input of h.document.querySelectorAll('[data-analysis-rule]')) input.checked = false;
  h.$('analysis-quality-run').click(); assert.match(h.$('analysis-quality-summary').textContent, /^0 замечаний/); assert.equal(h.$('analysis-quality-results').children.length, 0);
  h.document.querySelector('[data-analysis-rule][value="empty-views"]').checked = true; h.$('analysis-quality-run').click(); const old = h.$('analysis-quality-results').querySelector('button');
  renameProject(h, 'Изменено'); assert.match(h.$('analysis-quality-summary').textContent, /Модель изменилась/); assert.equal(old.disabled, true);
  const currentView = h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId; old.click(); assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, currentView);
});

test(`${mode} quality rule preferences persist independently of the model, reset explicitly and report unavailable storage`, async t => {
  const h = await setup(t); await h.load(serializeProjectFile(conceptProject())); h.$('model-analysis-button').click(); const before = stateOf(h);
  const inputs = [...h.document.querySelectorAll('input[data-analysis-rule]')];
  for (const input of inputs) { input.checked = false; input.dispatchEvent(new h.window.Event('change', { bubbles: true })); }
  assert.deepEqual(JSON.parse(h.window.localStorage.getItem('arkita.analysis.rules.v1')), []);
  h.$('analysis-quality-run').click(); assert.match(h.$('analysis-quality-summary').textContent, /Включены: нет/); assert.match(h.$('analysis-quality-summary').textContent, /Исключены: Пустые виды/);
  h.$('analysis-quality-reset').click(); assert.ok(inputs.every(input => input.checked)); assert.deepEqual(JSON.parse(h.window.localStorage.getItem('arkita.analysis.rules.v1')), inputs.map(input => input.value));
  Object.defineProperty(h.window, 'localStorage', { configurable: true, get() { throw Error('Storage denied'); } });
  inputs[0].checked = false; inputs[0].dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.match(h.$('analysis-quality-settings').textContent, /сохранить.*не удалось/); assert.deepEqual(stateOf(h), before);
});

test(`${mode} analysis keyboard and load lifecycle keep editor movement separate and remove pinned stale roots`, async t => {
  const h = await setup(t), state = conceptProject(); await h.load(serializeProjectFile(state)); select(h, 'element', 1); h.$('model-analysis-button').click();
  const before = stateOf(h), first = h.$('analysis-graph').querySelector('[data-analysis-id]'); first.focus(); press(h, first, 'ArrowRight'); press(h, first, 'Delete'); assert.deepEqual(stateOf(h), before);
  h.$('analysis-pin').click(); const next = conceptProject(); next.elements[0].name = 'Новая модель'; await h.load(serializeProjectFile(next));
  assert.equal(h.$('analysis-pin').getAttribute('aria-pressed'), 'false'); assert.match(h.$('analysis-root').textContent, /Выберите элемент/);
  press(h, h.$('analysis-close'), 'Escape'); assert.equal(h.$('model-analysis-panel').hidden, true); assert.equal(h.document.activeElement, h.$('model-analysis-button'));
});

test(`${mode} analysis triggers preserve an unfinished inline draft and do not change model history`, async t => {
  const h = await setup(t); await h.load(serializeProjectFile(conceptProject())); select(h, 'element', 1);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); assert.ok(input);
  input.value = 'Незавершённая правка'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  const before = stateOf(h);
  for (const trigger of [h.$('model-analysis-button'), h.$('analysis-generation-selection'), h.document.querySelector('[data-inspector-action="analysis"]')]) {
    assert.ok(trigger); trigger.dispatchEvent(new h.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })); trigger.click();
    assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(input.value, 'Незавершённая правка');
    assert.equal(h.document.activeElement, input); assert.equal(h.$('model-analysis-panel').hidden, true); assert.equal(h.$('analysis-generation-dialog').open, false);
  }
  assert.deepEqual(stateOf(h), before); press(h, input, 'Escape');
});

function fakeWorkers(h) {
  const workers = [];
  h.window.Worker = class {
    constructor(url, options) { this.url = url; this.options = options; this.terminated = false; workers.push(this); }
    postMessage(data) { this.data = structuredClone(data); this.deliver = this.onmessage; }
    terminate() { this.terminated = true; }
    complete() { this.deliver({ data: { result: queryModelGraph(this.data.state, this.data.options) } }); }
  };
  return workers;
}

test(`${mode} cancellable worker keeps the completed graph, controls, scroll and history and rejects late results`, async t => {
  const h = await setup(t); const bytes = Buffer.from(serializeProjectFile(conceptProject())); await h.load(bytes); select(h, 'element', 1);
  const workers = fakeWorkers(h); h.$('model-analysis-button').click(); assert.equal(workers.length, 1);
  assert.equal(workers[0].options.type, 'module'); assert.match(workers[0].url.pathname, /model-analysis-worker\.js$/);
  assert.equal(h.$('model-analysis-panel').getAttribute('aria-busy'), 'true'); assert.equal(h.$('analysis-generate').disabled, true);
  workers[0].complete(); assert.equal(workers[0].terminated, true); assert.equal(h.$('model-analysis-panel').getAttribute('aria-busy'), 'false');
  h.$('analysis-zoom-in').click(); h.$('analysis-graph-scroll').scrollTop = 33; const graph = h.$('analysis-graph').outerHTML, zoom = h.$('analysis-zoom-value').textContent, before = stateOf(h);
  h.change('analysis-depth', '8'); assert.equal(workers.length, 2); assert.equal(h.$('analysis-graph').outerHTML, graph);
  h.$('analysis-cancel-build').click(); assert.equal(workers[1].terminated, true); assert.equal(h.$('analysis-depth').value, '1'); assert.equal(h.$('analysis-zoom-value').textContent, zoom); assert.equal(h.$('analysis-graph-scroll').scrollTop, 33);
  assert.equal(h.$('analysis-graph').outerHTML, graph); assert.match(h.$('analysis-feedback').textContent, /отменено/);
  workers[1].complete(); assert.equal(h.$('analysis-graph').outerHTML, graph); assert.equal(h.$('analysis-depth').value, '1');
  assert.deepEqual(stateOf(h), before); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} newer worker requests replace older ones, errors retain completed output, load cancels pending work`, async t => {
  const h = await setup(t); await h.load(serializeProjectFile(conceptProject())); select(h, 'element', 1); const workers = fakeWorkers(h);
  h.$('model-analysis-button').click(); workers[0].complete(); const before = h.$('analysis-graph').outerHTML;
  h.change('analysis-depth', '4'); h.change('analysis-depth', '8'); assert.equal(workers[1].terminated, true);
  workers[1].complete(); assert.equal(h.$('model-analysis-panel').getAttribute('aria-busy'), 'true'); assert.equal(h.$('analysis-graph').outerHTML, before);
  workers[2].onmessage({ data: { error: { message: 'Synthetic worker failure' } } }); assert.match(h.$('analysis-feedback').textContent, /Synthetic worker failure/); assert.equal(h.$('analysis-depth').value, '1');
  assert.equal(h.$('analysis-graph').outerHTML, before);
  h.change('analysis-depth', '8'); const pending = workers.at(-1), next = conceptProject(); next.project.name = 'Другой сеанс'; const bytes = Buffer.from(serializeProjectFile(next));
  await h.load(bytes); assert.equal(pending.terminated, true); pending.complete(); assert.equal(h.$('analysis-graph').children.length, 0); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} nesting quality shows exact view/drawing pair and current-rule relation evidence without silently repairing model`,async t=>{
 const h=await setup(t),state=conceptProject(),entry=state.views[0],parent=entry.occurrences[0],child=entry.occurrences.find(item=>item.concept.kind==='element'&&item.concept.id!==parent.concept.id);parent.bounds={x:0,y:0,width:800,height:600};child.bounds={x:40,y:80,width:160,height:90};child.parent={kind:'occurrence',id:parent.id};const bytes=Buffer.from(serializeProjectFile(state));await h.load(bytes);h.$('model-analysis-button').click();for(const input of h.document.querySelectorAll('[data-analysis-rule]'))input.checked=input.value==='nesting-review';h.$('analysis-quality-run').click();
 const row=h.$('analysis-quality-results').querySelector('[data-analysis-rule="nesting-review"]');assert.ok(row);assert.match(row.textContent,/Кандидат проверки вложенности/);for(const id of [entry.view.id,parent.id,child.id])assert.ok(row.textContent.includes(id));assert.match(row.textContent,/UNKNOWN/);
 const details=row.querySelector('details');assert.ok(details);details.open=true;details.dispatchEvent(new h.window.Event('toggle'));assert.match(details.textContent,/ALLOWED|FORBIDDEN|UNKNOWN/);assert.match(details.textContent,/C260/);assert.deepEqual(await h.download(),bytes);
});
