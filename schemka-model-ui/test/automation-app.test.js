import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { EXAMPLE_AUTOMATION } from '../../schemka-model-io/src/automation.js';
import { deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';

test('actual app automation dialog permits readonly query and applies an enabled package preview with one Undo', async t => {
  const h = await setup(t), before = await h.download(), state = deserializeProjectFile(before);
  h.$('automation-button').click(); assert.ok(h.$('automation-dialog').open);
  h.$('automation-query-run').click(); assert.match(h.$('automation-feedback').textContent, /Найдено/);
  h.$('automation-editor').value = JSON.stringify({ ...EXAMPLE_AUTOMATION, id: 'arkita.test-rename', capabilities: ['model.read', 'model.write'], steps: [{ action: 'rename', query: { kind: 'project' }, prefix: 'Changed ' }] });
  h.$('automation-inspect').click(); h.$('automation-install-consent').checked = true; h.$('automation-install-consent').dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('automation-install').click();
  h.$('automation-enabled').checked = true; h.$('automation-enabled').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.equal(h.$('automation-run').disabled, false); h.$('automation-run').click();
  for (let i = 0; i < 100 && h.$('automation-cancel-run').disabled === false; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.match(h.$('automation-feedback').textContent, /Проверьте изменения/);
  h.$('automation-apply-consent').checked = true; h.$('automation-apply-consent').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.equal(h.$('automation-apply').disabled, false); h.$('automation-apply').click(); h.$('automation-close').click();
  assert.equal(deserializeProjectFile(await h.download()).project.name, `Changed ${state.project.name}`);
  h.$('undo').click(); assert.deepEqual(await h.download(), before);
});
