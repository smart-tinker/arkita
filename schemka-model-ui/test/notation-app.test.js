import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { production, app, setup, richLifecycleFixture, setStoredGeometry } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProject, createStore, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';
import { DRAFT_NOTATION, UNKNOWN_NOTATION, NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, notationElement, notationRelationship, notationJunction, notationBox, notationLine } from '../src/notation.js';
import { beforeUnload, openProfile, fixture } from './notation-app-helpers.js';

test(`${production ? 'production' : 'source'} app: standalone editor exposes one palette and accessible Help without product links or history changes`, async t => {
  const h = await setup(t), bytes = await h.download();
  for (const id of ['notation-mode', 'notation-status', 'notation-version', 'view-name', 'reuse-link-button']) assert.equal(h.$(id), null, `${id} is absent`);
  assert.equal(h.document.querySelector('.platform-nav,[data-mode-link]'), null);
  assert.deepEqual([...h.document.querySelectorAll('a[href]')].filter(link => link.origin === h.window.location.origin).map(link => link.pathname), [], 'The standalone editor has no landing or sibling product links');
  assert.equal(h.document.querySelector('[href*="/shell/"],[src*="/shell/"]'), null);
  assert.doesNotMatch(readFileSync(app, 'utf8'), /shell\/|installModeNavigation/);
  assert.equal(h.$('palette-title').textContent.trim(), 'Палитра');
  assert.equal(h.document.querySelectorAll('h2#palette-title').length, 1);
  assert.equal([...h.document.querySelectorAll('h1,h2,h3,summary')].filter(heading => heading.textContent.trim() === 'Палитра').length, 1);
  assert.equal([...h.document.querySelectorAll('h1,h2,h3,summary')].some(heading => heading.textContent.trim() === 'Текущее представление'), false);
  assert.equal(h.$('catalogue-palette').tagName, 'DIV');
  assert.equal(h.$('catalogue-palette').querySelector(':scope > summary'), null);
  assert.deepEqual([...h.document.querySelectorAll('[data-palette-group]')].map(group => group.dataset.paletteGroup), ['relationships', 'junctions', 'common', 'strategy', 'business', 'application', 'technology', 'motivation', 'implementation']);
  assert.equal(h.$('help-button').getAttribute('aria-label'), 'Справка');
  assert.equal(h.$('help-dialog').getAttribute('aria-labelledby'), 'help-title');
  assert.equal(h.$('notation-legend').closest('dialog'), h.$('help-dialog'));
  assert.equal(h.$('profile-button').closest('dialog'), h.$('help-dialog'));
  assert.equal(h.$('profile-button').textContent.trim(), 'Проверка модели');
  assert.equal(h.$('profile-button').hasAttribute('data-close'), true);
  assert.equal(h.$('help-dialog').open, false);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Temporary history';
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); h.$('undo').click();
  const node = h.$('canvas').querySelector('.node'); h.pointer(node, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
  h.$('fit-button').click();
  const history = h.$('history-state').textContent, fitted = h.$('canvas').getAttribute('viewBox'), selectedId = node.dataset.id;
  for (let repeat = 0; repeat < 3; repeat++) {
    h.$('help-button').click(); assert.equal(h.$('help-dialog').open, true);
    h.$('notation-legend').querySelector('summary').click();
    assert.equal(h.$('notation-legend').open, repeat % 2 === 0);
    const legend = h.$('notation-legend-items').querySelector('svg[role="img"]');
    assert.match(legend.getAttribute('aria-label'), /42.*15/);
    assert.equal(legend.querySelectorAll('.node').length, 42); assert.equal(legend.querySelectorAll('.connection').length, 15);
    assert.equal(legend.querySelectorAll('.junction-legend').length, 2);
    assert.equal(h.$('notation-legend').querySelector('a[href="https://meta.linked.archi/archimate4/notation/"]').textContent.includes('Kalin Maldzhanski'), true);
    assert.ok(h.$('notation-legend').querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]'));
    h.$('help-dialog').querySelector('[data-close]:not(#profile-button)').click(); assert.equal(h.$('help-dialog').open, false);
    assert.equal(h.document.querySelector('dialog[open]'), null);
    assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
    assert.equal(h.$('canvas').getAttribute('viewBox'), fitted); assert.equal(h.$('canvas').querySelector('.node.selected').dataset.id, selectedId);
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), bytes);
  }
  openProfile(h); assert.ok(h.$('profile-results')); h.$('profile-dialog').close();
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} app: native unload protection preserves clean, dirty and uncommitted inline states without a shell`, async t => {
  const h = await setup(t), bytes = await h.download();
  assert.equal(beforeUnload(h), false);
  for (const stored of [true, false]) { setStoredGeometry(h, stored); assert.equal(beforeUnload(h), false); }
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Uncommitted native-close draft';
  const history = h.$('history-state').textContent;
  assert.equal(beforeUnload(h), true); assert.equal(beforeUnload(h), true);
  assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(input.value, 'Uncommitted native-close draft');
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, 'false');
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(beforeUnload(h), false);
  h.$('create-service').click(); h.$('element-name').value = 'Uncommitted creation';
  assert.equal(beforeUnload(h), true); assert.equal(h.$('element-name').value, 'Uncommitted creation');
  h.$('edit-dialog').close(); assert.equal(beforeUnload(h), false);
  const moving = h.$('canvas').querySelector('.node'), original = moving.getAttribute('transform');
  h.pointer(moving, 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 120, 110);
  const preview = moving.getAttribute('transform'); assert.notEqual(preview, original);
  assert.equal(beforeUnload(h), true); assert.equal(moving.getAttribute('transform'), preview);
  h.pointer(h.$('canvas'), 'pointercancel'); assert.equal(beforeUnload(h), false);
  assert.equal(h.$('canvas').querySelector(`[data-id="${moving.dataset.id}"]`).getAttribute('transform'), original);
  h.pointer(h.$('create-node'), 'pointerdown', 20, 20, 3); assert.equal(beforeUnload(h), true);
  h.pointer(h.$('create-node'), 'pointercancel', 20, 20, 3); assert.equal(beforeUnload(h), false);
  assert.deepEqual(await h.download(), bytes);
  h.$('project-name').click(); const committed = h.document.querySelector('.inline-editor input'); committed.value = 'Saved through native guard';
  committed.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(beforeUnload(h), true); assert.equal(h.$('file-state').dataset.dirty, 'true');
  h.$('undo').click(); assert.equal(beforeUnload(h), false); h.$('redo').click(); assert.equal(beforeUnload(h), true);
  const saved = await h.download(); assert.equal(beforeUnload(h), false);
  assert.equal(deserializeProjectFile(saved).project.name, 'Saved through native guard'); assert.equal(h.$('undo').disabled, false);
});

test(`${production ? 'production' : 'source'} app: defensive unknown descriptors are explicit and cannot inject typed markers or markup into DOM`, async t => {
  const h = await setup(t), bytes = await h.download(), history = h.$('history-state').textContent;
  const unknownCases = [
    [CURRENT_METAMODEL, '<svg onload=alert(1)>'], [CURRENT_METAMODEL, '__proto__'],
    [{ ...CURRENT_METAMODEL, version: 999 }, 'Service'], [{ ...CURRENT_METAMODEL, id: 'unsupported' }, 'Flow'],
  ];
  for (const [reference, type] of unknownCases) {
    const element = notationElement(reference, type), relationship = notationRelationship(reference, type), junction = notationJunction(reference, type);
    for (const appearance of [element, relationship, junction]) {
      assert.equal(appearance.notation, UNKNOWN_NOTATION); assert.match(appearance.className, /unknown-type/);
      assert.match(appearance.badge, /\?.*неизвестн/); assert.doesNotMatch(appearance.className, /notation-draft|junction-and|junction-or/);
    }
    const box = notationBox(h.document, element, { width: 160, height: 70 }), line = notationLine(h.document, relationship);
    assert.equal(box.tagName.toLowerCase(), 'rect'); assert.equal(box.getAttribute('rx'), '0');
    assert.equal(line.hasAttribute('marker-start'), false); assert.equal(line.hasAttribute('marker-end'), false);
    assert.doesNotMatch(box.outerHTML + line.outerHTML, /onload|alert|https:|__proto__/);
  }
  const hostile = notationLine(h.document, { startMarkerKind: 'url(https://bad.example/source)', markerKind: '<svg onload=x>', line: 'url(https://bad.example/line)' });
  assert.equal(hostile.hasAttribute('marker-start'), false); assert.equal(hostile.hasAttribute('marker-end'), false);
  assert.equal(hostile.attributes.length, 1);
  assert.match(readFileSync(new URL('../style.css', import.meta.url), 'utf8'), /\.unknown-type \.node-box,\.unknown-type \.line\s*\{[^}]*stroke-dasharray/);
  assert.equal(h.$('canvas').querySelectorAll('.unknown-type').length, 0, 'Known catalogue entries never use the defensive fallback');
  assert.equal(h.$('history-state').textContent, history); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} app: forty-two types, fifteen relation entries, legend/palette parity and saved-geometry roundtrips preserve every saved file and view`, async t => {
  const h = await setup(t), state = fixture();
  for (const [index, relation] of state.relationships.entries()) { relation.sourceMultiplicity = `${index + 1}`; relation.targetMultiplicity = index % 2 ? '*' : ''; }
  const bytes = Buffer.from(serializeProjectFile(state));
  await h.load(bytes);
  assert.equal(h.$('notation-mode'), null); assert.equal(h.$('notation-status'), null);
  assert.equal(h.$('canvas').dataset.notation, DRAFT_NOTATION);
  assert.match(h.$('notation-legend').textContent, /Kalin Maldzhanski.*Linked.Archi/); assert.match(h.$('notation-legend').textContent, /CC BY 4.0/);
  for (const view of state.views) {
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
    for (const occurrence of view.occurrences) {
      const element = state.elements.find(item => item.id === occurrence.concept.id);
      const item = h.document.querySelector(`#canvas [data-id="${occurrence.id}"]`);
      assert.equal(item.dataset.notation, DRAFT_NOTATION);
      const nodeBox = item.querySelector('.node-box');
      assert.equal(nodeBox.getAttribute('rx'), element.type === 'Value' ? '110' : ['Grouping', 'Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Meaning', 'Deliverable'].includes(element.type) ? null : ['Service', 'Process', 'Function', 'Event', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage'].includes(element.type) ? '12' : '0');
      assert.ok(item.textContent.includes(({ SystemSoftware: 'SYSTEM SOFTWARE', CommunicationNetwork: 'COMMUNICATION NETWORK', ApplicationComponent: 'APPLICATION COMPONENT', ApplicationInterface: 'APPLICATION INTERFACE', DataObject: 'DATA OBJECT', BusinessActor: 'BUSINESS ACTOR', BusinessInterface: 'BUSINESS INTERFACE', BusinessObject: 'BUSINESS OBJECT', TechnologyInterface: 'TECHNOLOGY INTERFACE', DistributionNetwork: 'DISTRIBUTION NETWORK', ValueStream: 'VALUE STREAM', CourseOfAction: 'COURSE OF ACTION', WorkPackage: 'WORK PACKAGE' }[element.type] || element.type.toUpperCase())));
      assert.equal(item.querySelectorAll('.node-band').length, ['DataObject', 'BusinessObject'].includes(element.type) ? 1 : 0);
      assert.equal(h.document.querySelectorAll(`#create-${element.type.toLowerCase()} .node-band`).length, ['DataObject', 'BusinessObject'].includes(element.type) ? 1 : 0);
      assert.equal(h.document.querySelectorAll(`#notation-legend-items [data-legend-type="${element.type}"] .node-band`).length, ['DataObject', 'BusinessObject'].includes(element.type) ? 1 : 0);
    }
    for (const connection of view.connections) {
      const relation = state.relationships.find(item => item.id === connection.relationshipId), line = h.document.querySelector(`#canvas [data-id="${connection.id}"] .line`);
      const group = line.parentElement;
      assert.equal(group.querySelector('[data-multiplicity-end=source]').firstChild.nodeValue, relation.sourceMultiplicity);
      assert.equal(group.querySelector('[data-multiplicity-end=target]').firstChild.nodeValue, relation.targetMultiplicity || '⟨пусто⟩');
      const palette = h.document.querySelector(`#create-${relation.type.toLowerCase()} .line`);
      const appearance = notationRelationship(state.project.metamodel, relation.type);
      assert.equal(line.getAttribute('stroke-dasharray'), appearance.line === 'dotted' ? '1 4' : appearance.line === 'dashed' ? '7 5' : null);
      assert.equal(palette.getAttribute('stroke-dasharray'), line.getAttribute('stroke-dasharray'));
      for (const [position, kind] of [['start', appearance.startMarkerKind], ['end', appearance.markerKind]]) {
        assert.equal(line.getAttribute(`marker-${position}`), kind ? `url(#notation-canvas-${kind})` : null);
        assert.equal(palette.getAttribute(`marker-${position}`), kind ? `url(#notation-palette-${relation.type.toLowerCase()}-${kind})` : null);
      }
      if (connection.source.id === connection.target.id) assert.match(line.getAttribute('d'), / C /);
    }
    h.$('fit-button').click(); const fitted = h.$('canvas').getAttribute('viewBox');
    const before = [...h.document.querySelectorAll('#canvas [data-id]')].map(node => [node.dataset.id, node.getAttribute('transform'), node.querySelector('.line')?.getAttribute('d')]);
    for (let repeat = 0; repeat < 3; repeat++) {
      setStoredGeometry(h, true);
      assert.equal(h.$('canvas').dataset.notation, DRAFT_NOTATION);
      assert.equal(h.$('canvas').querySelectorAll('.node-band').length, 2);
      setStoredGeometry(h, false);
    }
    assert.equal(h.$('canvas').getAttribute('viewBox'), fitted);
    assert.deepEqual([...h.document.querySelectorAll('#canvas [data-id]')].map(node => [node.dataset.id, node.getAttribute('transform'), node.querySelector('.line')?.getAttribute('d')]), before);
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true);
    assert.deepEqual(await h.download(), bytes);
    assert.equal((await h.download('download-mermaid')).toString(), exportMermaid(state, view.view.id));
  }
  for (const theme of ['dark', 'light']) { h.change('theme-mode', theme); assert.equal(h.document.documentElement.dataset.theme, theme); assert.ok(h.document.querySelector('#canvas .notation-common')); assert.ok(h.document.querySelector('#canvas .notation-technology')); assert.ok(h.document.querySelector('#canvas .notation-application')); assert.ok(h.document.querySelector('#canvas .notation-business')); }
  assert.equal(h.document.querySelectorAll('#canvas img,#canvas script,#notation-legend img,#notation-legend script').length, 0);
  const ids = [...h.document.querySelectorAll('[id]')].map(node => node.id); assert.equal(new Set(ids).size, ids.length, 'Marker and control IDs remain unique');
});

test(`${production ? 'production' : 'source'} app: zero-view current files remain empty and byte-exact with stored geometry ON/OFF`, async t => {
  const h = await setup(t), bytes = Buffer.from(serializeProjectFile(createProject('No views')));
  await h.load(bytes);
  for (const stored of [false, true, false]) {
    setStoredGeometry(h, stored); assert.equal(h.$('canvas').dataset.notation, DRAFT_NOTATION);
    assert.equal(h.$('canvas').querySelectorAll('.node,.connection').length, 0); assert.match(h.$('canvas').textContent, /нет представлений/);
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
    assert.deepEqual(await h.download(), bytes);
  }
});

test(`${production ? 'production' : 'source'} app: download oracle rejects failed and unavailable exports after a previous success`, async t => {
  const h = await setup(t), original = await h.download();
  h.$('project-name').click();
  h.document.querySelector('.inline-editor input').value = 'Unsaved after first download';
  h.document.querySelector('.inline-editor input').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const createURL = h.window.URL.createObjectURL;
  h.window.URL.createObjectURL = () => { throw Error('Synthetic dispatch denial'); };
  await assert.rejects(h.download(), /Expected one new save-project download/);
  assert.match(h.$('file-feedback').textContent, /Скачивание не выполнено/);
  assert.equal(h.$('file-state').dataset.dirty, 'true');
  assert.equal(h.$('undo').disabled, false);
  h.$('file-dialog').close(); h.window.URL.createObjectURL = createURL;
  const changed = await h.download();
  assert.notDeepEqual(changed, original);
  assert.equal(deserializeProjectFile(changed).project.name, 'Unsaved after first download');
  await h.load(serializeProjectFile(createProject('No exportable view')));
  await assert.rejects(h.download('download-mermaid'), /Expected one new download-mermaid download/);
  assert.equal(h.$('download-mermaid').disabled, true); h.$('file-dialog').close();
  assert.equal(deserializeProjectFile(await h.download()).project.name, 'No exportable view');
});

test(`${production ? 'production' : 'source'} app: persisted zIndex and equal-layer ID order survive creation, explicit overlap and save/reopen`, async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic overlap'));
  const run = command => store.execute(command, store.revision).created; const { viewId } = run({ type: 'createView', name: 'Overlap' });
  run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Imported high UUID', bounds: { x: 180, y: 118, width: 210, height: 90 } });
  const seed = store.snapshot, highId = 'occ-ffffffff-ffff-4fff-bfff-ffffffffffff';
  seed.views[0].occurrences[0].id = highId;
  await h.load(serializeProjectFile(seed));
  h.$('create-service').click(); h.$('element-name').value = 'Created overlapping service';
  h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const created = h.$('canvas').querySelector('.node.selected').dataset.id;
  const ids = () => [...h.$('canvas').querySelectorAll('.node')].map(item => item.dataset.id);
  assert.ok(created < highId); assert.deepEqual(ids(), [created, highId]);
  assert.equal(h.$('canvas').querySelector(`[data-id="${created}"]`).getAttribute('aria-label'), 'Service: Created overlapping service. Экземпляр 2');
  const saved = await h.download(), state = deserializeProjectFile(saved);
  assert.deepEqual(state.views[0].occurrences.find(item => item.id === highId).bounds, seed.views[0].occurrences[0].bounds);
  await h.load(saved); assert.deepEqual(ids(), [created, highId]); assert.deepEqual(await h.download(), saved);
  // The higher layer must win even when its UUID sorts first. A display sort
  // must not renumber endpoint options or rewrite the canonical entity arrays.
  state.views[0].occurrences.find(item => item.id === created).bounds = { ...seed.views[0].occurrences[0].bounds };
  state.views[0].occurrences.find(item => item.id === created).zIndex = 19;
  state.views[0].occurrences.find(item => item.id === highId).zIndex = -7;
  for (const reference of [CURRENT_METAMODEL]) {
    const candidate = structuredClone(state); candidate.project.metamodel = reference;
    const bytes = Buffer.from(serializeProjectFile(candidate)); await h.load(bytes);
    for (const stored of [false, true]) {
      setStoredGeometry(h, stored); assert.deepEqual(ids(), [highId, created]);
      const ordered = deserializeProjectFile(bytes).views[0].occurrences;
      for (const [index, occurrence] of ordered.entries()) {
        const node = h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`);
        assert.match(node.getAttribute('aria-label'), new RegExp(`Экземпляр ${index + 1}$`));
        assert.equal(node.getAttribute('transform'), 'translate(180 118)');
      }
      const top = h.$('canvas').querySelector(`[data-id="${created}"]`);
      h.pointer(top, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
      assert.equal(h.$('canvas').querySelector('.node.selected').dataset.id, created);
      assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
      assert.deepEqual(await h.download(), bytes);
    }
  }
});

test(`${production ? 'production' : 'source'} app: rich shared-model edits survive a fresh-session full-file lifecycle`, async t => {
  const fixture = richLifecycleFixture(), expected = structuredClone(fixture.state);
  const view = expected.views.find(entry => entry.view.id === fixture.viewId);
  let saved;
  await t.test('import, shared rename, one-view move, typed create and full export', async phase => {
    const h = await setup(phase); await h.load(serializeProjectFile(fixture.state));
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
    const rename = (target, value) => {
      target.dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = value;
      input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      assert.equal(h.document.querySelector('.inline-editor'), null);
    };
    rename(h.$('project-name'), 'Edited synthetic project'); expected.project.name = 'Edited synthetic project';
    rename(h.document.querySelector(`#view-tabs [data-view-id="${fixture.viewId}"]`), 'Edited main view'); view.view.name = 'Edited main view';
    rename(h.$('canvas').querySelector(`[data-id="${fixture.a.occurrenceId}"]`), 'Renamed shared collaboration <img>');
    expected.elements.find(item => item.id === fixture.a.elementId).name = 'Renamed shared collaboration <img>';
    rename(h.$('canvas').querySelector(`[data-id="${fixture.relation.connectionId}"]`), 'Renamed shared flow');
    expected.relationships.find(item => item.id === fixture.relation.relationshipId).label = 'Renamed shared flow';
    const moving = h.$('canvas').querySelector(`[data-id="${fixture.a.occurrenceId}"]`);
    h.pointer(moving, 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 147, 123); h.pointer(h.$('canvas'), 'pointerup', 147, 123);
    Object.assign(view.occurrences.find(item => item.id === fixture.a.occurrenceId).bounds, { x: 87.1, y: 103.2 });
    h.$('create-role').click(); h.$('element-name').value = 'Created lifecycle role';
    h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    const created = h.$('canvas').querySelector('.node.selected');
    expected.elements.push({ id: created.dataset.renameId, type: 'Role', name: 'Created lifecycle role', documentation: '', properties: propertyEntries({}) });
    view.occurrences.push({ id: created.dataset.id, concept: { kind: 'element', id: created.dataset.renameId }, bounds: { x: 210, y: 205.2, width: 210, height: 90 }, parent: null, style: {}, zIndex: 0 });
    assert.match(h.$('history-state').textContent, /6 действий/); assert.equal(h.$('file-state').dataset.dirty, 'true');
    saved = await h.download();
    assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
    assert.deepEqual(deserializeProjectFile(saved).views.find(entry => entry.view.id === fixture.otherViewId), fixture.state.views.find(entry => entry.view.id === fixture.otherViewId));
  });
  await t.test('fresh application session reopens all views and re-exports exact bytes', async phase => {
    const h = await setup(phase); assert.equal(h.$('project-name').textContent, 'Учебная модель');
    await h.load(saved);
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true);
    for (const entry of expected.views) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${entry.view.id}"]`).click();
      assert.equal(h.$('canvas').querySelectorAll('.node').length, entry.occurrences.length);
      assert.equal(h.$('canvas').querySelectorAll('.connection').length, entry.connections.length);
      if (entry.view.id !== fixture.emptyViewId) {
        assert.ok(h.$('canvas').textContent.includes('Renamed shared collaboration'));
        assert.ok(h.$('canvas').textContent.includes('Renamed shared flow'));
      }
      assert.equal((await h.download('download-mermaid')).toString(), exportMermaid(expected, entry.view.id));
    }
    assert.equal(h.document.querySelectorAll('#canvas img,#canvas script').length, 0);
    assert.deepEqual(await h.download(), saved);
    assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
  });
});

test(`${production ? 'production' : 'source'} app: fresh boot, confirmed blank model and educational reset expose the complete current catalogue immediately`, async t => {
  let createdFile;
  const ready = h => {
    for (const type of [...NOTATION_ELEMENTS, ...NOTATION_RELATIONSHIPS]) {
      const control = h.$(`create-${type.toLowerCase()}`); assert.ok(control); assert.equal(control.hidden, false, type); assert.equal(control.disabled, false, type);
    }
    for (const stage of ['preview', 'common', 'application', 'domain', 'extended', 'relationship']) {
      assert.equal(h.$(`${stage}-enable`), null); assert.equal(h.$(`${stage}-dialog`), null);
    }
    assert.equal(h.$('notation-legend-items').querySelectorAll('.node').length, 42);
    assert.equal(h.$('notation-legend-items').querySelectorAll('.connection').length, 15);
    assert.equal(h.$('notation-mode'), null); assert.equal(h.$('notation-status'), null);
    assert.doesNotMatch(h.$('catalog-profile').textContent, /preview|v[1-7]|Element|Link/);
  };
  const replace = async (h, control) => {
    h.$('file-button').click(); h.$(control).click(); assert.equal(h.$('replace-project').hidden, false);
    h.$('load-project').click();
    for (let i = 0; i < 40 && h.$('file-dialog').open; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.$('file-dialog').open, false, h.$('file-feedback').textContent); ready(h);
  };
  await t.test('all forty-two typed creations and safe new/reset replacement run without an activation step', async phase => {
    const h = await setup(phase); ready(h);
    assert.deepEqual(deserializeProjectFile(await h.download()).project.metamodel, CURRENT_METAMODEL);
    for (const type of NOTATION_ELEMENTS) {
      h.$(`create-${type.toLowerCase()}`).click(); h.$('element-name').value = `Created ${type} <img onerror=x>`;
      h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
      assert.match(h.$('canvas').querySelector('.node.selected').getAttribute('aria-label'), new RegExp(`^${type}:`));
    }
    const undo = h.$('history-state').textContent;
    h.$('file-button').click(); h.$('new-project').click(); assert.match(h.$('replace-description').textContent, /изменения будут потеряны/);
    h.$('cancel-load').click(); h.$('file-dialog').close(); assert.equal(h.$('history-state').textContent, undo);
    createdFile = await h.download(); const created = deserializeProjectFile(createdFile);
    assert.equal(created.elements.length, 45); assert.deepEqual(new Set(created.elements.map(item => item.type)), new Set(NOTATION_ELEMENTS));
    await replace(h, 'new-project');
    const blank = deserializeProjectFile(await h.download()); assert.deepEqual(blank.project.metamodel, CURRENT_METAMODEL);
    assert.equal(blank.elements.length, 0); assert.equal(blank.relationships.length, 0); assert.equal(blank.views.length, 1); assert.equal(h.$('undo').disabled, true);
    h.$('create-plateau').click(); h.$('element-name').value = 'Current plateau'; h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    const beforeReset = await h.download(); h.$('file-button').click(); h.$('reset-example').click(); h.$('file-dialog').close();
    h.$('load-project').click(); assert.deepEqual(await h.download(), beforeReset, 'Late confirmation after cancel cannot replace the model');
    await replace(h, 'reset-example');
    const example = deserializeProjectFile(await h.download()); assert.deepEqual(example.project.metamodel, CURRENT_METAMODEL);
    assert.equal(example.elements.length, 3); assert.equal(example.views.length, 2); assert.equal(h.$('undo').disabled, true);
    assert.equal(h.$('canvas').querySelectorAll('img,script,image,use').length, 0);
  });
  await t.test('independent fresh session reopens every current type and starts with the same complete catalogue', async phase => {
    const h = await setup(phase); ready(h); await h.load(createdFile); ready(h); assert.deepEqual(await h.download(), createdFile);
  });
});

test(`${production ? 'production' : 'source'} app: mouse Apply commits the project name before later Service creation and keeps both undo steps`, async t => {
  const h = await setup(t), initial = deserializeProjectFile(await h.download());
  h.$('project-name').click();
  const input = h.document.querySelector('.inline-editor input'), accept = h.document.querySelector('.inline-editor [aria-label="Применить имя"]');
  assert.equal(input.getAttribute('aria-label'), 'Название модели'); input.value = 'QA Схемка17';
  h.pointer(accept, 'pointerdown', 200, 50);
  const down = new h.window.MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }); accept.dispatchEvent(down);
  if (!down.defaultPrevented) input.blur(); // native button-not-focused default
  await Promise.resolve();
  assert.equal(accept.isConnected, true, 'The Apply control must survive the pre-click focus checkpoint');
  assert.equal(h.$('history-state').textContent, 'Единая история · 0 действий', 'Pressing the control does not commit early');
  h.pointer(accept, 'pointerup', 200, 50); accept.dispatchEvent(new h.window.MouseEvent('mouseup', { button: 0, bubbles: true })); accept.click();
  assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(h.$('project-name').textContent, 'QA Схемка17');
  assert.match(h.$('history-state').textContent, /1 действий/);
  h.$('create-service').click(); h.$('element-name').value = 'After mouse rename'; h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('project-name').textContent, 'QA Схемка17'); assert.match(h.$('history-state').textContent, /2 действий/);
  const bytes = await h.download(), saved = deserializeProjectFile(bytes); assert.equal(saved.project.name, 'QA Схемка17'); assert.equal(saved.elements.length, initial.elements.length + 1);
  h.$('undo').click(); assert.equal(h.$('project-name').textContent, 'QA Схемка17');
  h.$('undo').click(); assert.deepEqual(deserializeProjectFile(await h.download()), initial);
  h.$('redo').click(); h.$('redo').click(); assert.deepEqual(await h.download(), bytes);
});
