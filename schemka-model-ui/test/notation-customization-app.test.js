import { production, setup } from './app-test-fixture.js';
import test from 'node:test';
import { setProfileAttributes, setProfileValues } from './profile-controls-fixture.js';
import assert from 'node:assert/strict';
import { createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { customizationProject, profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';

test(`${production ? 'production' : 'source'} app: customization labels preserve each base drawing and expose complete literal text across both themes and duplicate views`, async t => {
  const h = await setup(t), state = customizationProject({ enabled: { type: 'Boolean', default: true } });
  state.customizationProfiles[0].name = '<img src=x> & a very long literal specialization '.repeat(4);
  const second = 'prf-00000000-0000-4000-8000-000000000002';
  state.customizationProfiles.push({ id: second, ...profileDefinition(), name: 'Second' });
  for (const item of [...state.elements, ...state.junctions, ...state.relationships]) item.profileApplications.push({ profileId: second, values: {} });
  const store = createStore(state); store.execute({ type: 'duplicateView', viewId: state.views[0].view.id, name: 'Profiled duplicate' }, store.revision);
  const bytes = serializeProjectFile(store.snapshot); await h.load(bytes);
  const full = `«${state.customizationProfiles[0].name}, Second»`;
  for (const theme of ['light', 'dark']) {
    h.change('theme-mode', theme);
    for (const view of store.snapshot.views.filter(entry => entry.occurrences.length)) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
      for (const occurrence of view.occurrences) {
        const group = h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), label = group.querySelector('.stereotype-label');
        assert.ok(label); assert.equal(label.getAttribute('aria-label'), full); assert.ok(group.getAttribute('aria-label').includes(full));
        assert.equal(label.querySelector('title').textContent, full); assert.ok(label.firstChild.textContent.endsWith('…'));
        assert.ok(group.querySelector(occurrence.concept.kind === 'junction' ? 'circle.node-box' : '.node-box'));
        group.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert.ok(group.classList.contains('selected'));
        assert.match(h.$('inspector-content').textContent, /enabled: true · по умолчанию/);
        if (occurrence.concept.kind === 'junction') assert.ok(Number(label.getAttribute('y')) > Number(group.querySelector('.junction-caption').getAttribute('y')));
        else assert.ok(Number(label.getAttribute('y')) < 0, 'Separate lane above base name/type');
      }
      for (const connection of view.connections) {
        const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`), label = group.querySelector('.stereotype-label');
        assert.equal(label.getAttribute('aria-label'), full); assert.ok(group.querySelector('title').textContent.includes(full));
        assert.equal(Number(label.getAttribute('y')), Number(group.querySelector('.relationship-label').getAttribute('y')) - 20);
        assert.ok(group.querySelector('path.hit')); assert.ok(group.querySelector('.multiplicity-label'));
      }
    }
  }
  assert.equal(h.document.querySelector('img[src="x"],img[onerror]'), null); assert.equal(h.$('canvas').querySelector('img'), null); assert.deepEqual(await h.download(), Buffer.from(bytes));
});

test(`${production ? 'production' : 'source'} app: manager and inspector create and share a profile, save/reopen, then undo/redo a new value edit`, async t => {
  const h = await setup(t), state = conceptProject(); await h.load(serializeProjectFile(state));
  const submit = () => h.$('customization-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const findButton = (container, text) => [...container.querySelectorAll('button')].find(item => item.textContent === text);
  h.$('customization-button').click(); h.$('customization-new').click();
  h.$('customization-name').value = 'User-created'; h.$('customization-purpose').value = 'specialization';
  for (const input of h.$('customization-targets').querySelectorAll('input')) input.checked = true;
  setProfileAttributes(h.document,{enabled:{type:'Boolean',default:true},count:{type:'Integer',default:7},title:{type:'String',default:'old'}}); submit();
  for (const [kind, objects] of [['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships.slice(0, 1)]]) for (const object of objects) {
    const tree = h.document.querySelector('.catalog');
    const selector = `[data-${kind === 'relationship' ? 'relationship' : kind === 'junction' ? 'junction' : 'element'}-id="${object.id}"]`;
    tree.querySelector(selector).click(); findButton(h.$('inspector-content'), 'Применить…').click();
    setProfileValues(h.document,{enabled:false,count:0,title:''}); submit();
    assert.match(h.$('inspector-content').textContent, /count: 0 · своё значение/);
  }
  const saved = await h.download(); await h.load(saved); assert.equal(h.$('undo').disabled, true);
  h.document.querySelector('.catalog').querySelector(`[data-element-id="${state.elements[0].id}"]`).click();
  findButton(h.$('inspector-content'), 'Значения / сброс…').click(); setProfileValues(h.document,{}); submit();
  assert.match(h.$('inspector-content').textContent, /enabled: true · по умолчанию/);
  h.$('undo').click(); assert.match(h.$('inspector-content').textContent, /enabled: false · своё значение/);
  h.$('redo').click(); assert.match(h.$('inspector-content').textContent, /enabled: true · по умолчанию/);
  const result = deserializeProjectFile(await h.download()); assert.equal(result.customizationProfiles.length, 1); assert.equal(result.customizationProfiles[0].name, 'User-created');
  assert.deepEqual(result.elements[0].profileApplications[0].values, {}); assert.equal(result.junctions[1].profileApplications[0].values.count, 0);
});
