import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createProject } from '../../schemka-model-core/src/index.js';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createController } from '../src/controller.js';
import { installViewActions } from '../src/view-actions.js';

function setup(store=createDemo()) {
  const items=new Map(), reports=[];let renders=0,failRender=false;
  const document={getElementById(id){if(!items.has(id))items.set(id,{handlers:{},value:'',textContent:'',open:false,addEventListener(name,fn){this.handlers[name]=fn;},event(name){return this.handlers[name]?.({preventDefault(){}});},focus(){this.focused=true;},select(){},close(){this.open=false;this.event('close');},querySelector(){return {focus(){}};}});return items.get(id);}};
  const $=document.getElementById,model=createController(store);
  installViewActions({document,model,openDialog(id){$(id).open=true;},render(){renders++;if(failRender)throw Error('render failed');},panel(){},status(text){reports.push(text);},setFit(){}});
  return {$,model,reports,set failRender(value){failRender=value;},get renders(){return renders;}};
}
test('native create form cancellation has no effect; confirmed create switches view once with empty content',()=>{
  const h=setup(),before=h.model.store.exportFiles();h.$('new-view').event('click');h.$('new-view-name').value='Cancelled';h.$('view-dialog').close();h.$('view-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),before);
  h.$('new-view').event('click');h.$('new-view-name').value='<img> 日本語';h.$('view-form').event('submit');h.$('view-form').event('submit');
  assert.equal(h.model.store.history.undo,1);assert.equal(h.model.view.view.name,'<img> 日本語');assert.equal(h.model.view.occurrences.length,0);assert.equal(h.model.view.connections.length,0);assert.equal(h.renders,1);
});
test('first view can be created in a zero-view model; undo reconciles null and redo restores a valid view',()=>{
  const h=setup(createStore(createProject('Empty')));h.$('duplicate-view').event('click');assert.equal(h.$('view-dialog').open,false);
  h.$('new-view').event('click');h.$('new-view-name').value='';h.$('view-form').event('submit');const id=h.model.viewId;assert.ok(id);assert.equal(h.model.view.view.name,'');
  h.model.undo();assert.equal(h.model.viewId,null);assert.equal(h.model.selection,null);h.model.redo();assert.equal(h.model.viewId,id);
});
test('duplicate form uses one command, preserves shared data and switches to the new independent view',()=>{
  const h=setup(),source=h.model.view,before=h.model.store.snapshot;h.$('duplicate-view').event('click');h.$('new-view-name').value='Copy';h.$('view-form').event('submit');
  assert.equal(h.model.store.history.undo,1);assert.notEqual(h.model.viewId,source.view.id);assert.equal(h.model.view.view.name,'Copy');assert.deepEqual(h.model.store.snapshot.elements,before.elements);assert.deepEqual(h.model.store.snapshot.relationships,before.relationships);
  assert.notEqual(h.model.view.occurrences[0].id,source.occurrences[0].id);assert.deepEqual(h.model.view.occurrences[0].bounds,source.occurrences[0].bounds);
  h.model.undo();assert.equal(h.model.viewId,source.view.id);assert.deepEqual(h.model.store.exportFiles(),createStore(before).exportFiles());
});
test('stale dialog and invalid long name retain state and do not create history; cancelled retry succeeds',()=>{
  const h=setup();h.$('new-view').event('click');h.model.execute({type:'renameProject',name:'Newer'});const before=h.model.store.exportFiles();h.$('view-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),before);assert.match(h.$('view-error').textContent,/изменилась/);
  h.$('view-dialog').close();h.$('new-view').event('click');h.$('new-view-name').value='x'.repeat(8193);h.$('view-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),before);assert.equal(h.model.store.history.undo,1);assert.ok(h.$('view-error').textContent);
  h.$('new-view-name').value='Valid';h.$('view-form').event('submit');assert.equal(h.model.view.view.name,'Valid');assert.equal(h.model.store.history.undo,2);
});


test('a post-commit rendering error reports that the view already exists without repeating the command',()=>{
  const h=setup();h.$('new-view').event('click');h.failRender=true;h.$('view-form').event('submit');h.$('view-form').event('submit');
  assert.equal(h.model.store.history.undo,1);assert.equal(h.model.store.snapshot.views.length,3);assert.match(h.reports.at(-1),/Представление создано, но интерфейс/);
});


test('default duplicate name truncation never splits a Unicode surrogate pair',()=>{
  const h=setup(),name='x'.repeat(8183)+'😀';h.model.execute({type:'renameView',viewId:h.model.viewId,name});h.$('duplicate-view').event('click');
  assert.equal(h.$('new-view-name').value,'x'.repeat(8183)+' (копия)');assert.equal(h.model.view.view.name,name);
});
