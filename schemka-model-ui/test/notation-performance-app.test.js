import { production, setup } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { customizationDrawingProject } from '../../schemka-model-core/fixtures/customization-project.js';

test(`${production ? 'production' : 'source'} app: 1000 ordinary and fully profiled drawings prepare labels once per render, including Fit, without per-drawing model validation`, {
  skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'performance test runs in Extended CI' : false,
}, async t => {
  for (const profiled of [false, true]) await t.test(profiled ? 'fully profiled 1000 drawings' : 'ordinary 1000 drawings', async t => {
    const h = await setup(t), state = customizationDrawingProject(1000, profiled), bytes = serializeProjectFile(state);
    async function measured(action, name) {
      const ownKeys = Reflect.ownKeys; let preparedWalks = 0, directLabelWalks = 0, totalModelWalks = 0;
      Reflect.ownKeys = value => {
        const project = value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'project');
        if (project && 'value' in project && project.value?.id === state.project.id) {
          totalModelWalks++;
          const stack = new Error().stack;
          if (stack.includes('at createCustomizationResolver ')) preparedWalks++;
          if (stack.includes('at specializationLabel ')) directLabelWalks++;
        }
        return ownKeys(value);
      };
      const start = performance.now();
      try { await action(); } finally { Reflect.ownKeys = ownKeys; }
      const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
      assert.equal(preparedWalks, 1, name + ': exactly one preparation per actual render');
      assert.equal(directLabelWalks, 0, name + ': no old per-drawing whole-model label validator');
      t.diagnostic(JSON.stringify({ profiled, drawings: 1000, operation: name, elapsedMs, preparedWalks, directLabelWalks, totalModelWalks, measurement: 'production jsdom, not browser latency' }));
    }
    await measured(() => h.load(bytes), 'load/render with Fit off');
    assert.equal(h.$('canvas').classList.contains('fitted'), false);
    assert.equal(h.$('canvas').querySelectorAll('[data-kind="occurrence"]').length, 1000);
    assert.equal(h.$('canvas').querySelectorAll('.stereotype-label').length, profiled ? 1000 : 0);
    const before = { history: h.$('history-state').textContent, fileState: h.$('file-state').textContent,
      geometry: [...h.$('canvas').querySelectorAll('[data-kind="occurrence"]')].map(group => [group.dataset.id, group.getAttribute('transform'), group.querySelector('.node-box').outerHTML]) };
    await measured(() => h.$('fit-button').click(), 'render with Fit on');
    assert.equal(h.$('canvas').classList.contains('fitted'), true);
    assert.equal(h.$('history-state').textContent, before.history); assert.equal(h.$('file-state').textContent, before.fileState);
    assert.deepEqual([...h.$('canvas').querySelectorAll('[data-kind="occurrence"]')].map(group => [group.dataset.id, group.getAttribute('transform'), group.querySelector('.node-box').outerHTML]), before.geometry);
    if (profiled) for (const label of h.$('canvas').querySelectorAll('.stereotype-label')) {
      assert.equal(label.getAttribute('aria-label'), '«<literal Alpha>, Beta»'); assert.equal(label.querySelector('title').textContent, '«<literal Alpha>, Beta»');
    }
    assert.equal(h.document.querySelector('literal'), null); assert.deepEqual(await h.download(), Buffer.from(bytes));
  });
});
