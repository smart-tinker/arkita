import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createStore} from '../../schemka-model-core/src/index.js';
import {conceptProject} from '../../schemka-model-core/fixtures/concept-project.js';
import {fixtureId} from '../../schemka-model-core/fixtures/relationship-project.js';
import {createController} from '../src/controller.js';
import {installRelatedDrawingsUI} from '../src/related-drawings-ui.js';

function fixture(t){const dom=new JSDOM('<!doctype html><html><body></body></html>');t.after(()=>dom.window.close());const {window}=dom,{document}=window;window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};const model=createController(createStore(conceptProject()));model.switchView(fixtureId('view',2));const reports=[],ui=installRelatedDrawingsUI({document,window,model,openDialog:id=>document.getElementById(id).setAttribute('open',''),blocked:()=>false,render:()=>{},status:text=>reports.push(text)}),$=id=>document.getElementById(id);return{model,ui,$,reports};}
test('related preview rejects replaced same-revision stores, cancelled/late Apply and preserves dirty redo exactly',t=>{
 const h=fixture(t),id=fixtureId('rel',1);h.ui.open(id);h.$('related-drawings-preview').click();assert.equal(h.$('related-drawings-apply').disabled,false);const state=conceptProject();state.project.name='Different opened document';h.model.store=createStore(state);h.model.switchView(fixtureId('view',2));const before=h.model.store.exportFiles();h.$('related-drawings-apply').click();assert.deepEqual(h.model.store.exportFiles(),before);h.ui.refresh();assert.equal(h.ui.active,false);h.$('related-drawings-apply').click();h.$('related-drawings-preview').click();assert.deepEqual(h.model.store.exportFiles(),before);
 h.model.execute({type:'renameProject',name:'Past'});h.model.execute({type:'renameProject',name:'Future'});h.model.undo();const dirty=h.model.store.exportFiles(),history=h.model.store.history;h.ui.open(id);h.$('related-drawings-preview').click();h.ui.cancel();h.$('related-drawings-apply').click();assert.deepEqual(h.model.store.exportFiles(),dirty);assert.deepEqual(h.model.store.history,history);
});
test('accepted relation closure is one Undo; changed selection invalidates prepared Apply',t=>{
 const h=fixture(t),before=h.model.store.exportFiles();h.ui.open(fixtureId('rel',1));h.$('related-drawings-preview').click();h.$('related-drawings-neighbors').checked=true;h.$('related-drawings-neighbors').dispatchEvent(new (h.$('related-drawings-neighbors').ownerDocument.defaultView.Event)('change'));assert.equal(h.$('related-drawings-apply').disabled,true);h.$('related-drawings-preview').click();h.$('related-drawings-apply').click();assert.equal(h.ui.active,false);assert.equal(h.model.store.history.undo,1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
});
