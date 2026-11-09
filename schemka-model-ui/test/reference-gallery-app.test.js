import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {setup,production} from './app-test-fixture.js';
import {conceptProject} from '../../schemka-model-core/fixtures/concept-project.js';
import {serializeProjectFile} from '../../schemka-model-io/src/index.js';
const mode=production?'production':'source';

test(`${mode} gallery menu thumbnails and navigation close their own modal before global interaction guards, preserving exact saved bytes`,async t=>{
 const h=await setup(t),state=conceptProject(),bytes=Buffer.from(serializeProjectFile(state));const style=h.document.createElement('style');style.textContent=readFileSync(new URL('../style.css',import.meta.url),'utf8');h.document.head.append(style);await h.load(bytes);h.$('model-gallery-button').click();assert.equal(h.$('model-gallery-dialog').open,true);const button=[...h.$('model-gallery-list').querySelectorAll('button')].find(item=>item.dataset.viewId===state.views[1].view.id);assert.ok(button);for(let attempt=0;attempt<100&&!button.querySelector('img').getAttribute('src')&&!button.querySelector('img').alt.startsWith('Миниатюра недоступна');attempt++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(button.querySelector('img').src.startsWith('data:image/svg+xml'),button.querySelector('img').alt);
 button.click();assert.equal(h.$('model-gallery-dialog').open,false);assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId,state.views[1].view.id);assert.deepEqual(await h.download(),bytes);
});
test(`${mode} relationship reference menu uses trusted three-status decisions and exact source while leaving model untouched`,async t=>{
 const h=await setup(t),bytes=Buffer.from(serializeProjectFile(conceptProject()));await h.load(bytes);h.$('relationship-reference-button').click();assert.equal(h.$('relationship-reference-dialog').open,true);
 h.change('relationship-reference-source','element:Product');h.change('relationship-reference-target','element:Deliverable');h.change('relationship-reference-type','Composition');assert.equal(h.$('relationship-reference-result').dataset.assessment,'UNKNOWN');assert.match(h.$('relationship-reference-version').textContent,/C260.*a29ef66a/);h.$('relationship-reference-dialog').querySelector('button').click();assert.equal(h.$('relationship-reference-dialog').open,false);assert.deepEqual(await h.download(),bytes);
});
