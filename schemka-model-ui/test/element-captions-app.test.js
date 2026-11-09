import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production, richLifecycleFixture, assertFittedCaption } from './app-test-fixture.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

// A separate file bounds test-only JSDOM/ESM instance retention. All font metrics here are simulated.
const warning = 'Не удалось измерить подписи: показан предварительный текст, он может выходить за границы. Полные имена доступны в свойствах.';
const panel = (h, name) => h.document.querySelector(`[data-panel="${name}"]`).click();
const resize = h => h.window.dispatchEvent(new h.window.Event('resize'));
const select = (h, node) => node.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
function rename(h, value) {
  h.document.querySelector('.object-name').click();
  h.document.querySelector('.inline-editor input').value = value;
  h.document.querySelector('.inline-editor [aria-label="Применить имя"]').click();
}
const captions = h => [...h.$('canvas').querySelectorAll('.node-type,.node-title')];
const routes = h => [...h.$('canvas').querySelectorAll('.line,.hit,.view-anchor-mark')].map(node => node.outerHTML);
async function loaded(t) {
  const h = await setup(t); assert.equal(h.$('status').textContent, 'Готово · выберите элемент или связь');
  const fixture = richLifecycleFixture(), element = fixture.state.elements.find(e => e.id === fixture.a.elementId);
  element.type = 'CommunicationNetwork'; element.name = 'Сервер мониторинга инфраструктуры';
  const view = fixture.state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  occurrence.bounds.width = 210; occurrence.bounds.height = 90;
  const bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`);
  return { h, fixture, element, view, occurrence, bytes, get };
}

test(`${production ? 'production' : 'source'} captions: hidden inspector rename retains full inputs and measures only on reveal`, async t => {
  const { h, element, view, occurrence, get } = await loaded(t);
  select(h, get()); h.viewport.narrow = true; panel(h, 'inspector');
  const calls = h.captionMetrics.calls, name = 'Новая инфраструктура e\u0301 日本語 👨‍👩‍👧‍👦 <img> & очередь сообщений';
  rename(h, name);
  assert.equal(h.captionMetrics.calls, calls); assert.equal(h.captionMetrics.hiddenCalls, 0);
  assert.equal(h.$('status').textContent.includes(warning), false);
  assert.ok(get().querySelector('.node-title').textContent); assert.equal(get().querySelectorAll('.node-title').length, 2);
  assert.ok(get().getAttribute('aria-label').includes(name)); assert.ok(get().querySelector('title').textContent.includes(name));
  assert.equal(h.document.querySelector('.object-name').textContent, name);
  const before = await h.download(), history = h.$('history-state').textContent, dirty = h.$('file-state').dataset.dirty;
  const node = get(), previousRoutes = routes(h), viewBox = h.$('canvas').getAttribute('viewBox');
  panel(h, 'canvas');
  assert.ok(h.captionMetrics.calls > calls); assert.equal(get(), node);
  assertFittedCaption(get(), element.type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, name);
  assert.equal(get().getAttribute('aria-pressed'), 'true'); assert.deepEqual(routes(h), previousRoutes); assert.equal(h.$('canvas').getAttribute('viewBox'), viewBox);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, dirty); assert.deepEqual(await h.download(), before);
  const fitted = h.captionMetrics.calls;
  resize(h); resize(h); panel(h, 'canvas'); panel(h, 'inspector'); panel(h, 'canvas');
  assert.equal(h.captionMetrics.calls, fitted); assert.equal(h.captionMetrics.disconnectedCalls, 0);
  h.$('undo').click(); assert.ok(get().getAttribute('aria-label').includes('Сервер мониторинга инфраструктуры'));
  h.$('redo').click(); assert.ok(get().getAttribute('aria-label').includes(name)); assert.deepEqual(await h.download(), before);
});

test(`${production ? 'production' : 'source'} captions: hidden catalog render recovers on narrow-to-wide resize without changing panel or geometry`, async t => {
  const { h, element, occurrence, view, get, bytes } = await loaded(t);
  select(h, get()); h.$('fit-button').click(); h.viewport.narrow = true; panel(h, 'catalog');
  const calls = h.captionMetrics.calls;
  h.$('fit-button').click(); // Existing render path while the narrow canvas is hidden.
  assert.equal(h.captionMetrics.calls, calls); assert.equal(h.captionMetrics.hiddenCalls, 0);
  const pending = get(), previousRoutes = routes(h), viewBox = h.$('canvas').getAttribute('viewBox'), history = h.$('history-state').textContent;
  h.viewport.narrow = false; resize(h);
  assert.equal(h.document.body.dataset.mobilePanel, 'catalog'); assert.equal(get(), pending); assert.ok(h.captionMetrics.calls > calls);
  assertFittedCaption(get(), element.type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, element.name);
  assert.deepEqual(routes(h), previousRoutes); assert.equal(h.$('canvas').getAttribute('viewBox'), viewBox); assert.equal(h.$('history-state').textContent, history);
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('file-state').dataset.dirty, 'false');
  const fitted = h.captionMetrics.calls; get().focus(); resize(h); assert.equal(h.document.activeElement, get()); assert.equal(h.captionMetrics.calls, fitted);
  get().dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.ok(h.document.querySelector('.inline-editor')); resize(h); assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(h.captionMetrics.calls, fitted);
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 130, 120); assert.ok(get().classList.contains('dragging'));
  resize(h); assert.equal(h.$('canvas').querySelector('.dragging'), null); assert.equal(h.$('canvas').hasPointerCapture(1), false); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} captions: visible unavailable metrics retain bounded previews, warn once and recover in-place on panel or resize`, async t => {
  const { h, element, occurrence, view, get, bytes } = await loaded(t);
  for (const [i, mode] of ['missing', 'throw', 'nan', 'zero'].entries()) {
    h.captionMetrics.mode = mode;
    const calls = h.captionMetrics.calls; h.$('fit-button').click();
    assert.equal(h.captionMetrics.calls - calls, 1, 'Stop at first unavailable occurrence');
    assert.ok(get().querySelector('.node-title').textContent); assert.match(get().querySelector('.node-type').textContent, / · \d{2}$/);
    const text = captions(h).map(node => node.outerHTML), node = get(), previousRoutes = routes(h), viewBox = h.$('canvas').getAttribute('viewBox'), history = h.$('history-state').textContent;
    assert.ok(h.$('status').textContent.includes('Все элементы вписаны')); assert.equal(h.$('status').textContent.split(warning).length, 2);
    select(h, get()); assert.ok(h.$('status').textContent.includes('Объект выбран')); assert.ok(h.$('status').textContent.endsWith(warning));
    resize(h); assert.equal(h.captionMetrics.calls - calls, 2); assert.deepEqual(captions(h).map(node => node.outerHTML), text);
    h.captionMetrics.mode = 'valid';
    if (i % 2) panel(h, 'canvas'); else resize(h); // Recovery while continuously visible.
    assert.equal(get(), node); assert.equal(h.$('status').textContent.includes(warning), false); assert.ok(h.$('status').textContent.includes('Объект выбран'));
    assertFittedCaption(get(), element.type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, element.name);
    assert.deepEqual(routes(h), previousRoutes); assert.equal(h.$('canvas').getAttribute('viewBox'), viewBox); assert.equal(h.$('history-state').textContent, history);
    assert.deepEqual(await h.download(), bytes); const fitted = h.captionMetrics.calls; resize(h); panel(h, 'canvas'); assert.equal(h.captionMetrics.calls, fitted);
  }
  h.captionMetrics.mode = 'zero'; h.$('fit-button').click(); h.viewport.narrow = true; panel(h, 'inspector'); h.captionMetrics.mode = 'valid'; panel(h, 'canvas');
  assert.equal(h.$('status').textContent.includes(warning), false); assert.equal(h.captionMetrics.hiddenCalls, 0);
});

test(`${production ? 'production' : 'source'} captions: pending old view/project nodes are discarded before activate, load and empty views`, async t => {
  const { h, fixture, get, bytes } = await loaded(t);
  h.captionMetrics.mode = 'zero'; h.$('fit-button').click();
  const old = new Set(captions(h)), original = h.window.SVGElement.prototype.getBBox;
  let staleCalls = 0;
  h.window.SVGElement.prototype.getBBox = function () { if (old.has(this)) staleCalls++; return original.call(this); };
  h.captionMetrics.mode = 'valid';
  await h.load(bytes); // afterLoad calls panel before render; old jobs must already be cleared.
  assert.equal(staleCalls, 0); assert.equal(h.$('status').textContent.includes(warning), false);
  h.captionMetrics.mode = 'zero'; h.$('fit-button').click(); for (const node of captions(h)) old.add(node);
  h.viewport.narrow = true; panel(h, 'inspector'); h.captionMetrics.mode = 'valid';
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click();
  assert.equal(staleCalls, 0); assert.equal(h.document.body.dataset.mobilePanel, 'canvas'); assert.equal(h.captionMetrics.hiddenCalls, 0);
  assert.equal(get(), null);
  h.captionMetrics.mode = 'zero'; h.$('fit-button').click(); for (const node of captions(h)) old.add(node);
  const before = h.captionMetrics.calls;
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.emptyViewId}"]`).click();
  assert.equal(captions(h).length, 0); assert.equal(h.$('status').textContent.includes(warning), false);
  resize(h); panel(h, 'canvas'); assert.equal(h.captionMetrics.calls, before); assert.equal(staleCalls, 0);
  const noViews = createProject('Empty model'); await h.load(Buffer.from(serializeProjectFile(noViews))); resize(h);
  assert.equal(captions(h).length, 0); assert.equal(h.$('status').textContent.includes(warning), false); assert.equal(staleCalls, 0);
});

test(`${production ? 'production' : 'source'} captions: raw long graphemes, 101 index and tiny imports survive native bytes and duplicate view`, async t => {
  const h = await setup(t), store = createStore(createProject('Caption literal bytes'));
  const { viewId } = store.execute({ type: 'createView', name: 'Labels' }, store.revision).created;
  const raw = '  e\u0301 👨‍👩‍👧‍👦 <img onerror=1> & <script>\r\n日本語\t' + 'W'.repeat(8000);
  store.execute({ type: 'createElementAndOccurrence', viewId, elementType: 'CommunicationNetwork', name: raw, bounds: { x: 40, y: 40, width: 210, height: 90 } }, store.revision);
  const state = store.snapshot, template = state.views[0].occurrences[0];
  state.views[0].occurrences = Array.from({ length: 101 }, (_, i) => ({ ...structuredClone(template), id: `occ-00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, bounds: { x: i * 220, y: 40, width: i === 0 ? .1 : i === 1 ? 120 : 210, height: i === 0 ? .1 : i === 1 ? 55 : 90 } }));
  const bytes = Buffer.from(serializeProjectFile(state)), calls = h.captionMetrics.calls; await h.load(bytes);
  assert.ok(h.captionMetrics.calls - calls <= 101 * 64);
  assert.equal(h.$('canvas').querySelectorAll('[data-kind="occurrence"]')[0].querySelector('text'), null);
  const target = h.$('canvas').querySelector(`[data-id="${state.views[0].occurrences[100].id}"]`);
  assertFittedCaption(target, 'CommunicationNetwork', template.bounds, 101, raw);
  assert.match(target.querySelector('.node-type').textContent, / · 101$/);
  select(h, target); assert.equal(h.document.querySelector('.object-name').textContent, raw); assert.ok(h.$('inspector-content').textContent.includes('CommunicationNetwork'));
  assert.deepEqual(await h.download(), bytes); const history = h.$('history-state').textContent;
  h.change('theme-mode', 'dark'); h.$('fit-button').click(); assert.equal(h.$('history-state').textContent, history); assert.deepEqual(await h.download(), bytes);
  h.$('duplicate-view').click(); h.$('new-view-name').value = 'Same raw captions'; h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const duplicate = await h.download(); assert.equal(deserializeProjectFile(duplicate).elements[0].name, raw);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), duplicate);
  await h.load(duplicate); assert.deepEqual(await h.download(), duplicate); assert.equal(h.$('file-state').dataset.dirty, 'false');
});
