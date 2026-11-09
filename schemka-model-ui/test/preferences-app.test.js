import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { customizationDrawingProject, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

test('local preferences apply without model/history edits; creation uses saved defaults and Undo removes one object',async t=>{
  const h=await setup(t),before=await h.download(),history=h.$('history-state').textContent;h.$('preferences-button').click();h.$('preferences-display-diagramFont').value='Arial';h.$('preferences-display-statusBar').checked=false;h.$('preferences-defaults-width').value='300';h.$('preferences-defaults-height').value='140';h.$('preferences-defaults-nodeStyle-fill').value='#123456';h.$('preferences-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(h.$('preferences-dialog').open,false,h.$('preferences-error').textContent);assert.equal(h.document.body.dataset.preferenceStatus,'false');assert.equal(h.$('history-state').textContent,history);assert.deepEqual(await h.download(),before);assert.ok([...h.$('canvas').querySelectorAll('text')].some(item=>item.style.fontFamily==='Arial'));
  h.$('create-service').click();h.$('element-name').value='Configured';h.$('edit-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));const state=deserializeProjectFile(await h.download()),element=state.elements.find(item=>item.name==='Configured'),drawing=state.views.flatMap(view=>view.occurrences).find(item=>item.concept.id===element.id);assert.equal(drawing.bounds.width,300);assert.equal(drawing.bounds.height,140);assert.equal(drawing.style.fill,'#123456');h.$('undo').click();assert.deepEqual(await h.download(),before);
});

test('specialization palette creates the selected explicit profile in one Undo step and preserves cancel',async t=>{
  const h=await setup(t),state=customizationDrawingProject(1,true);await h.load(serializeProjectFile(state));const before=await h.download(),button=h.document.querySelector(`[data-create-specialization="${profileId}"][data-kind="element"]`);assert.ok(button);button.click();assert.equal(h.$('edit-dialog').open,true);h.$('edit-dialog').close();assert.deepEqual(await h.download(),before);button.click();h.$('element-name').value='Specialized';h.$('edit-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));const after=deserializeProjectFile(await h.download()),created=after.elements.find(item=>item.name==='Specialized');assert.deepEqual(created.profileApplications,[{profileId,values:{}}]);h.$('undo').click();assert.deepEqual(await h.download(),before);
});


test('human defaults for alignment/position/gradient reach quick linked and repeated creations without changing old drawings',async t=>{
 const h=await setup(t),before=deserializeProjectFile(await h.download());
 h.$('preferences-button').click();
 for(const [id,value]of Object.entries({'width':'280','height':'130','nodeStyle-fill':'#c0d0e0','nodeStyle-textAlign':'right','nodeStyle-verticalAlign':'bottom','nodeStyle-gradient-direction':'horizontal','nodeStyle-gradient-color':'#123456','lineStyle':'orthogonal'}))h.$(`preferences-defaults-${id}`).value=value;
 h.$('preferences-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(h.$('preferences-dialog').open,false,h.$('preferences-error').textContent);const original=await h.download();
 h.$('diagram-quick-add').click();h.$('diagram-type').value='Role';h.$('diagram-name').value='Styled quick';h.$('diagram-source').value=[...h.$('diagram-source').options].find(option=>option.value)?.value;h.$('diagram-relationship').value='Association';h.$('diagram-repeat').checked=true;
 h.$('diagram-tools-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(h.$('diagram-tools-dialog').open,false,h.$('diagram-tools-error').textContent);
 h.pointer(h.$('canvas'),'pointerdown',350,200);h.window.dispatchEvent(new h.window.Event('blur'));
 const after=deserializeProjectFile(await h.download()),created=after.elements.filter(item=>item.name==='Styled quick');assert.equal(created.length,2);
 for(const element of created){const drawing=after.views.flatMap(view=>view.occurrences).find(item=>item.concept.id===element.id);assert.deepEqual(drawing.style,{fill:'#c0d0e0',textAlign:'right',verticalAlign:'bottom',gradient:{direction:'horizontal',color:'#123456'}});assert.equal(drawing.bounds.width,280);assert.equal(drawing.bounds.height,130);const relation=after.relationships.find(item=>item.source.id===element.id||item.target.id===element.id);assert.equal(after.views.flatMap(view=>view.connections).find(item=>item.relationshipId===relation.id).style.lineStyle,'orthogonal');}
 for(const entry of before.views)for(const node of entry.occurrences)assert.deepEqual(after.views.find(view=>view.view.id===entry.view.id).occurrences.find(item=>item.id===node.id),node);
 h.$('undo').click();h.$('undo').click();assert.deepEqual(await h.download(),original);
});

test('actual rounded-lines preference changes display routes without a document diff or Undo and restores the exact prior display',async t=>{
 const h=await setup(t),bytes=await h.download(),history=h.$('history-state').textContent,paths=()=>[...h.$('canvas').querySelectorAll('.connection .line')].map(path=>path.getAttribute('d')),before=paths();assert.ok(before.length);const apply=value=>{h.$('preferences-button').click();h.$('preferences-display-roundedLines').checked=value;h.$('preferences-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(h.$('preferences-dialog').open,false,h.$('preferences-error').textContent);};apply(true);assert.notDeepEqual(paths(),before);assert.deepEqual(await h.download(),bytes);assert.equal(h.$('history-state').textContent,history);apply(false);assert.deepEqual(paths(),before);assert.deepEqual(await h.download(),bytes);
});
