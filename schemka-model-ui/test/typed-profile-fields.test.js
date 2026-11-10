import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject,createStore } from '../../schemka-model-core/src/index.js';
import { typedValueControl,attributeDefinitionControl } from '../src/typed-profile-fields.js';

function documentFor(t) { const dom = new JSDOM('<!doctype html><html><body></body></html>'); t.after(() => dom.window.close()); return dom.window.document; }
test('human typed fields preserve false, zero, empty and exact CRLF/Unicode, and URL data remains inert', t => {
  const document = documentFor(t), values = [['Boolean',false],['Integer',0],['Real',0],['String',''],['String','Exact\r\n🙂'],['Currency',{amount:'-0.01',currency:'RUB'}],['Date','2024-02-29'],['URL','javascript:inert()']];
  for (const [type,value] of values) { const editor = typedValueControl(document,type,value); document.body.append(editor.element); assert.deepEqual(editor.read(),value); }
  assert.equal(document.querySelector('a,script,img,iframe'),null);
  const number = typedValueControl(document,'Integer',1); number.element.querySelector('input').value = ''; assert.throws(() => number.read(),/числовое/);
});
test('compound type/default controls roundtrip through the authoritative profile schema without JSON editing or loss of unrendered List rows', t => {
  const document = documentFor(t), structure = {kind:'Structure',fields:{title:'String',count:'Integer'}}, attributes = {
    nested:{type:structure,default:{title:'Text\r\n🙂',count:0}}, list:{type:{kind:'List',itemType:structure},default:[{title:'first',count:0},{title:'second',count:2}]}, empty:{type:{kind:'List',itemType:'Boolean'},default:[]}
  };
  const editor = attributeDefinitionControl(document,attributes); document.body.append(editor.element); assert.deepEqual(editor.read(),attributes); const store = createStore(createProject('Typed')); store.execute({type:'createCustomizationProfile',definition:{name:'Fields',purpose:'attributes',targets:[{kind:'element',type:'ApplicationComponent'}],attributes:editor.read()}},store.revision); assert.deepEqual(store.snapshot.customizationProfiles[0].attributes,attributes);
  const values = Array.from({length:130},(_,at) => `Value ${at}`), list = typedValueControl(document,{kind:'List',itemType:'String'},values); document.body.append(list.element); assert.equal(list.element.querySelectorAll('textarea').length,64); assert.deepEqual(list.read(),values);
  [...list.element.querySelectorAll('button')].find(item => item.textContent === 'Показать ещё 64 значения').click(); assert.equal(list.element.querySelectorAll('textarea').length,128); assert.deepEqual(list.read(),values);
  assert.equal(document.querySelector('[aria-label*=JSON],textarea[id*=json]'),null);
});
