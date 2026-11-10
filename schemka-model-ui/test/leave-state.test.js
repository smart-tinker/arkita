import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelLeaveState, installModelUnloadGuard } from '../src/leave-state.js';
import { createDemo } from '../src/demo.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';

test('readonly model leave state reflects exact baseline and pending drafts without changing data or history', () => {
  const model=createController(createDemo()),session=createProjectSession(model.store),inline={active:false,generation:0};let pending=false;
  const read=createModelLeaveState({model,session,inline,transient:()=>pending});const before=model.store.exportFiles(),history=model.store.history;
  assert.deepEqual(read(),{ready:true,dirty:false,transient:false,directoryWarning:false,revision:0,generation:0});assert.ok(Object.isFrozen(read()));
  inline.active=true;inline.generation++;assert.equal(read().transient,true);assert.deepEqual(model.store.exportFiles(),before);assert.deepEqual(model.store.history,history);
  model.execute({type:'renameProject',name:'Unsaved'});assert.equal(read().dirty,true);assert.equal(read().transient,true);
  inline.active=false;pending=true;assert.equal(read().transient,true);model.undo();assert.equal(read().dirty,false);
  pending=false;assert.equal(read().transient,false);assert.deepEqual(model.store.exportFiles(),before);
});

test('full application protects native unload before controller/setup can throw without a shell dependency', async()=>{
  const {readFile}=await import('node:fs/promises');const {Script}=await import('node:vm');
  const raw=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(raw,/schemka-site-shell|installNavigationGuard|data-mode-link/);
  const source=raw.replace(/^import .*;\n/gm,'');
  for(const failure of ['preferences','controller']){
    const handlers=new Map(),document={getElementById(){return null;}},window={addEventListener(name,handler,capture){assert.equal(capture,true);handlers.set(name,handler);},removeEventListener(){}};
    const createLocalPreferences=()=>{if(failure==='preferences')throw Error('preferences setup failed');return {snapshot:{}};};
    await assert.rejects(new Script(`(async () => {${source}\n})()`).runInNewContext({document,window,installModelUnloadGuard,createLocalPreferences,createDemo:()=>null,createController(){throw Error('controller setup failed');}}),new RegExp(`${failure} setup failed`));
    assert.deepEqual([...handlers.keys()],['beforeunload']);const event={preventDefault(){this.defaultPrevented=true;}};handlers.get('beforeunload')(event);assert.equal(event.defaultPrevented,true);assert.equal(event.returnValue,'');
  }
});

test('local unload boundary preserves dirty and transient state and fails closed for unreadable state',()=>{
  let callback,reads=0,state={ready:true,dirty:false,transient:false};
  const window={addEventListener(name,fn,capture){assert.equal(name,'beforeunload');assert.equal(capture,true);callback=fn;},removeEventListener(){}};
  installModelUnloadGuard({window,readState(){reads++;if(state instanceof Error)throw state;return state;}});
  const cases=[[{ready:true,dirty:false,transient:false},false],[{ready:true,dirty:true,transient:false},true],[{ready:true,dirty:false,transient:true},true],[null,true],[{ready:false,dirty:false,transient:false},true],[{ready:true,dirty:0,transient:false},true],[{ready:true,dirty:false,transient:0},true],[Error('read failed'),true]];
  for(const [next,blocked] of cases){state=next;const before=next instanceof Error?next:structuredClone(next);const event={preventDefault(){this.defaultPrevented=true;}};callback(event);assert.equal(Boolean(event.defaultPrevented),blocked);assert.equal(event.returnValue,blocked?'':undefined);assert.deepEqual(state,before);}
  assert.equal(reads,cases.length);
});

test('unload guard destroy removes only its own listener without reading or changing editor state',()=>{
  const listeners=new Map(),read=()=>{throw Error('must not read during install/destroy');};
  const window={addEventListener(name,fn,capture){listeners.set(name,{fn,capture});},removeEventListener(name,fn,capture){assert.equal(listeners.get(name).fn,fn);assert.equal(listeners.get(name).capture,capture);listeners.delete(name);}};
  const guard=installModelUnloadGuard({window,readState:read});assert.ok(Object.isFrozen(guard));assert.equal(listeners.size,1);guard.destroy();assert.equal(listeners.size,0);
});
