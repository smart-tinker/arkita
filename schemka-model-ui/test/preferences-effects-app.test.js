import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
test('working margin changes Fit camera only, selection glow is optional and dirty marker follows real edits',async t=>{
 const h=await setup(t),before=await h.download(),box=()=>h.$('canvas').getAttribute('viewBox').split(/\s+/).map(Number);
 h.$('fit-button').click();const initial=box();
 h.$('preferences-button').click();h.$('preferences-gestures-margin').value='100';h.$('preferences-behavior-selectionEffect').checked=false;h.$('preferences-display-dirtyMarker').value='asterisk';h.$('preferences-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
 h.$('fit-button').click();const enlarged=box();assert.equal(enlarged[2]-initial[2],152);assert.equal(enlarged[3]-initial[3],152);assert.equal(h.$('canvas').dataset.selectionEffect,'false');assert.deepEqual(await h.download(),before);
 h.$('create-service').click();h.$('element-name').value='Changed';h.$('edit-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(h.$('file-button').textContent,'Файл *');h.$('undo').click();assert.equal(h.$('file-button').textContent,'Файл');
});
