import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
test(`${production ? 'production' : 'source'} app documentation Markdown preview stays inert and preserves raw/no-op and exact Undo`, async t => {
 const h=await setup(t),state=conceptProject(); state.elements[0].documentation='# Заголовок\r\n\r\n- Первый\r\n- Второй\r\n\r\n[Сайт](https://example.test)\r\n<img onerror=bad()>\r\n'; const before=Buffer.from(serializeProjectFile(state)); await h.load(before);
 const open=()=>{h.document.querySelector(`[data-element-id="${state.elements[0].id}"]`).click();h.document.querySelector('[data-inspector-action="documentation"]').click();assert.equal(h.$('documentation-dialog').open,true);};
 const submit=()=>h.$('documentation-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
 open();h.$('documentation-view').click();assert.equal(h.$('documentation-preview').querySelectorAll('ul li').length,2);assert.equal(h.$('documentation-preview').querySelector('img,script'),null);h.$('documentation-edit').click();submit();assert.deepEqual(await h.download(),before);assert.equal(h.$('undo').disabled,true);
 open();h.change('documentation-value','## Новое\n1. Один\n2. Два');h.$('documentation-view').click();assert.equal(h.$('documentation-preview').querySelectorAll('ol li').length,2);submit();assert.equal(deserializeProjectFile(await h.download()).elements[0].documentation,'## Новое\n1. Один\n2. Два');assert.match(h.$('history-state').textContent,/1 действий/);h.$('undo').click();assert.deepEqual(await h.download(),before);
});
