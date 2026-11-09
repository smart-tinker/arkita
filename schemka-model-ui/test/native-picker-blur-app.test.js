import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { EXAMPLE_AUTOMATION } from '../../schemka-model-io/src/automation.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));

// A native chooser can blur its parent WebContents. This tests that event boundary,
// not Windows focus behavior or the OS picker implementation itself.
test('native automation picker blur preserves its draft; explicit close still rejects late bytes',async t=>{
 let h,finish;const reads=[];h=await setup(t,{readExternalFiles:(kind,token)=>{reads.push({kind,token});h.window.dispatchEvent(new h.window.Event('blur'));return new Promise(resolve=>finish=resolve);}});
 h.$('automation-button').click();h.$('automation-import').click();assert.equal(h.$('automation-dialog').open,true);assert.equal(h.$('automation-import').disabled,true);
 const bytes=new TextEncoder().encode(JSON.stringify({...EXAMPLE_AUTOMATION,name:'Chosen through native picker'}));finish({status:'opened',files:[{name:'package.arkita-automation.json',bytes}]});await tick();assert.match(h.$('automation-editor').value,/Chosen through native picker/);assert.match(h.$('automation-install-report').textContent,/Chosen through native picker/);assert.equal(h.$('automation-install').disabled,true);assert.equal(h.$('undo').disabled,true);assert.equal(reads[0].kind,'automation');assert.match(reads[0].token,/^[0-9a-f-]{36}$/);
 h.$('automation-import').click();h.$('automation-close').click();const before=h.$('automation-editor').value;finish({status:'opened',files:[{name:'late.json',bytes:new TextEncoder().encode(JSON.stringify({...EXAMPLE_AUTOMATION,name:'Late must not appear'}))}]});await tick();assert.equal(h.$('automation-editor').value,before);assert.equal(h.$('automation-dialog').open,false);assert.equal(h.$('undo').disabled,true);
});

test('native report template picker blur keeps preview settings and applies exact selected template without editing model',async t=>{
 let h,finish;const reads=[];h=await setup(t,{readExternalFiles:(kind,token)=>{reads.push({kind,token});h.window.dispatchEvent(new h.window.Event('blur'));return new Promise(resolve=>finish=resolve);}});
 h.$('export-report-button').click();h.change('export-report-format','html');h.$('export-report-template-open').click();assert.equal(h.$('export-report-dialog').open,true);
 const template={format:'arkita-report-template',version:1,title:'Chosen report title',locale:'en-US',sections:['summary'],footer:'Chosen footer'};finish({status:'opened',files:[{name:'report.arkita-report.json',bytes:new TextEncoder().encode(JSON.stringify(template))}]});await tick();assert.equal(h.$('export-report-title').value,template.title);assert.equal(h.$('export-report-locale').value,'en-US');assert.match(h.$('export-report-template-state').textContent,/summary/);assert.equal(h.$('export-report-save').disabled,true);assert.equal(h.$('undo').disabled,true);assert.equal(reads[0].kind,'report-template');
 h.$('export-report-template-open').click();h.$('export-report-cancel').click();finish({status:'opened',files:[{name:'late.json',bytes:new TextEncoder().encode(JSON.stringify({...template,title:'Late report'}))}]});await tick();assert.equal(h.$('export-report-title').value,template.title);assert.equal(h.$('export-report-dialog').open,false);assert.equal(h.$('undo').disabled,true);
});
