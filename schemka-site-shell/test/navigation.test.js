import test from 'node:test';
import assert from 'node:assert/strict';
import { installNavigationGuard } from '../src/navigation.js';

function setup() {
  const listeners=new Map(),reports=[];let current={ready:true,dirty:false,transient:false},failure=false;
  const window={addEventListener(name,callback,capture){assert.equal(capture,true);const list=listeners.get(name)||[];list.push(callback);listeners.set(name,list);},removeEventListener(name,callback){listeners.set(name,listeners.get(name).filter(item=>item!==callback));}};
  const document={activeElement:{id:'draft-input'}}, originalFocus=document.activeElement;
  const ui=installNavigationGuard({document,window,readState(){if(failure)throw Error('unready');return current;},report(text){reports.push(text);}});
  const anchor={attrs:{href:'/'},getAttribute(name){return this.attrs[name];},closest(selector){assert.equal(selector,'a[data-mode-link]');return this;}};
  const event=(type,fields={})=>{const e={type,target:anchor,key:'Enter',preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...fields};for(const fn of listeners.get(type)||[])fn(e);return e;};
  return {ui,anchor,event,reports,document,originalFocus,listeners,set state(value){current=value;},set fail(value){failure=value;}};
}
for(const type of ['pointerdown','mousedown','click','auxclick','keydown'])test(`${type} blocks transient navigation before document handlers and leaves draft/focus unchanged`,()=>{
  const h=setup();h.state={ready:true,dirty:true,transient:true};const e=h.event(type,{ctrlKey:true});assert.equal(e.defaultPrevented,true);assert.equal(e.stopped,true);assert.equal(h.document.activeElement,h.originalFocus);assert.match(h.reports.at(-1),/Завершите или отмените/);
});
test('committed clean or dirty links preserve native anchor and modifier behavior, with no custom confirmation',()=>{
  const h=setup();for(const dirty of [false,true])for(const target of ['', '_blank'])for(const ctrlKey of [false,true]){
    h.state={ready:true,dirty,transient:false};h.anchor.attrs.target=target;
    for(const type of ['pointerdown','click','auxclick','keydown']){const e=h.event(type,{ctrlKey});assert.equal(e.defaultPrevented,undefined);assert.equal(e.stopped,undefined);}
  }assert.deepEqual(h.reports,[]);
});
test('native beforeunload warns for current dirty/transient/unready and never resets either state',()=>{
  const h=setup();for(const dirty of [false,true])for(const transient of [false,true]){const value={ready:true,dirty,transient};h.state=value;const e=h.event('beforeunload');assert.equal(Boolean(e.defaultPrevented),dirty||transient);assert.deepEqual(value,{ready:true,dirty,transient});}
  for(const value of [null,Promise.resolve({ready:true,dirty:false,transient:false}),{}, {ready:true,dirty:1,transient:false}]){h.state=value;assert.equal(h.event('beforeunload').defaultPrevented,true);assert.equal(h.event('click').defaultPrevented,true);}
  h.fail=true;assert.equal(h.event('click').defaultPrevented,true);assert.equal(h.event('beforeunload').defaultPrevented,true);
});
test('each action reads fresh state; cancelled/repeated/stale interactions never grant later navigation consent',()=>{
  const h=setup();h.state={ready:true,dirty:true,transient:false};assert.equal(h.event('pointerdown').defaultPrevented,undefined);
  h.state={ready:true,dirty:true,transient:true};assert.equal(h.event('click').defaultPrevented,true);assert.equal(h.event('click').defaultPrevented,true);
  h.state={ready:true,dirty:true,transient:false};assert.equal(h.event('click').defaultPrevented,undefined);assert.equal(h.event('beforeunload').defaultPrevented,true);
});
test('unknown destinations fail closed; unmanaged text fields and unrelated keys retain native behavior',()=>{
  const h=setup();for(const href of ['https://evil.invalid/','//evil.invalid/','javascript:alert(1)','/model/?target=x','/unknown/']){h.anchor.attrs.href=href;assert.equal(h.event('click').defaultPrevented,true);}
  assert.equal(h.event('click',{target:{closest(){return null;}}}).defaultPrevented,undefined);
  assert.equal(h.event('keydown',{key:'Tab'}).defaultPrevented,undefined);h.ui.destroy();h.ui.destroy();assert.equal(h.event('beforeunload').defaultPrevented,undefined);
});
test('catalog navigation receives the same ready, transient and dirty protection',()=>{
 const h=setup();h.anchor.attrs.href='/catalog/';assert.equal(h.event('click').defaultPrevented,undefined);
 h.state={ready:true,dirty:true,transient:true};assert.equal(h.event('click').defaultPrevented,true);
 h.state={ready:true,dirty:true,transient:false};assert.equal(h.event('click').defaultPrevented,undefined);assert.equal(h.event('beforeunload').defaultPrevented,true);
});

test('retired model route fails closed',()=>{const h=setup();h.anchor.attrs.href='/model/legacy/';assert.equal(h.event('click').defaultPrevented,true);});
