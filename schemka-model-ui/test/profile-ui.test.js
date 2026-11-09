import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { expectedEndpointDecision } from './endpoint-oracle.js';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { createStore, createProject } from '../../schemka-model-core/src/index.js';
import { CURRENT_PROFILE, createRegistry, getPresentation } from '../../schemka-model-profiles/src/index.js';
import { presentationFor, elementRenderer, relationshipRenderer, installProfileUI } from '../src/profile-ui.js';

function setup(registry=createRegistry([CURRENT_PROFILE]),store=createDemo()) {
  const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  const document=dom.window.document, $=id=>document.getElementById(id), model=createController(store),session=createProjectSession(store);
  const ui=installProfileUI({document,model,registry,openDialog(id){$(id).open=true;}});
  return {$,document,model,session,ui,close(){dom.window.close();},open(){$('profile-button').click();}};
}
test('current palette and read-only report use the exact catalog while normative assessment remains UNKNOWN',()=>{
  const h=setup(),before=h.model.store.exportFiles(),revision=h.model.store.revision,history=h.model.store.history;
  h.ui.refresh();assert.match(h.$('catalog-profile').textContent,/42 типа элементов · 15 обозначений отношений/);
  h.open();assert.match(h.$('profile-reference').textContent,/schemka-archimate4@2/);assert.match(h.$('profile-structure').textContent,/VALID/);
  const state=h.model.store.snapshot,expected={ALLOWED:0,FORBIDDEN:0,UNKNOWN:0};
  for(const relation of state.relationships)expected[expectedEndpointDecision(state.elements.find(item=>item.id===relation.source.id).type,relation.type,state.elements.find(item=>item.id===relation.target.id).type).status]++;
  assert.ok(h.$('profile-local').textContent.includes(`ALLOWED: ${expected.ALLOWED} · FORBIDDEN: ${expected.FORBIDDEN} · UNKNOWN: ${expected.UNKNOWN}`));
  assert.match(h.$('profile-local').textContent,/Прямых разрешений: 2/);assert.match(h.$('profile-local').textContent,/Подтверждённых производных связей: 0/);assert.match(h.$('profile-normative').textContent,/UNKNOWN/);
  assert.equal(h.$('profile-catalog').children.length,59);assert.equal(h.$('profile-results').children.length,h.model.store.snapshot.relationships.length);
  assert.deepEqual(h.model.store.exportFiles(),before);assert.equal(h.model.store.revision,revision);assert.deepEqual(h.model.store.history,history);assert.equal(h.session.dirty,false);
});
test('missing exact registry profile and empty graph give explicit UNKNOWN without fallback permission',()=>{
  const h=setup(createRegistry([]));h.open();assert.match(h.$('profile-evidence').textContent,/отсутствуют/);assert.match(h.$('profile-local').textContent,/UNKNOWN/);assert.equal(h.$('profile-catalog').children.length,0);
  const empty=setup(createRegistry([CURRENT_PROFILE]),createStore(createProject('Empty')));empty.open();assert.match(empty.$('profile-local').textContent,/UNKNOWN/);assert.match(empty.$('profile-results').children[0].textContent,/отношений для проверки нет/);
});
test('descriptor markup rejects; safe catalog text and hostile model labels remain inert',()=>{
  const descriptor=structuredClone(CURRENT_PROFILE),attack='<img src=x onerror=alert(1)>';
  descriptor.elementTypes[0].label=attack;descriptor.metadata.source=attack;assert.throws(()=>createRegistry([descriptor]));
  const plain=structuredClone(CURRENT_PROFILE);plain.elementTypes[0].label='Элемент 日本語 & "quoted"';plain.metadata.source='https://example.invalid/source';
  const h=setup(createRegistry([plain]));h.model.execute({type:'renameRelationship',relationshipId:h.model.store.snapshot.relationships[0].id,label:attack});h.ui.refresh();h.open();
  assert.ok([...h.$('profile-catalog').children].some(item=>item.textContent.includes(plain.elementTypes[0].label)));assert.ok(h.$('profile-evidence').textContent.includes(plain.metadata.source));
  assert.ok([...h.$('profile-results').children].some(item=>item.textContent.includes(attack)));assert.equal(h.$('profile-results').querySelectorAll('img,script').length,0);
});
test('report refreshes on reopen and remains read-only even with undo/redo and dirty state',()=>{
  const h=setup();h.open();h.model.execute({type:'renameProject',name:'Edited'});const before=h.model.store.exportFiles(),history=h.model.store.history;h.open();
  assert.match(h.$('profile-reference').textContent,/ревизии 1/);assert.equal(h.session.dirty,true);assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
});
test('closed renderer mappings never forward arbitrary shape, URL, style or SVG properties',()=>{
  const registry=createRegistry([CURRENT_PROFILE]);
  const element=getPresentation(registry,{id:'schemka-archimate4',version:2},'element','Service');
  assert.deepEqual(presentationFor({id:'schemka-archimate4',version:2},'element','Service'),element);
  assert.equal(presentationFor({id:'schemka-archimate4',version:1},'element','Service').status,'UNKNOWN');
  assert.deepEqual(elementRenderer(element),{className:'node',radius:8,badge:'Service'});
  const link=getPresentation(registry,{id:'schemka-archimate4',version:2},'relationship','Realization');assert.deepEqual(relationshipRenderer(link),{className:'connection',marker:'url(#arrow)'});
  for(const value of [null,{}, {...element,shape:'<svg>'}, {...element,token:'url(https://bad)'}, {...element,adapter:'script'}, {...element,status:'UNKNOWN'}]) {
    const result=elementRenderer(value);assert.equal(result.className,'node unknown-type');assert.equal(result.radius,0);assert.match(result.badge,/неизвестный/);assert.deepEqual(Object.keys(result),['className','radius','badge']);
  }
  for(const value of [null,{}, {...link,marker:'url(https://bad)'}, {...link,token:'javascript:'}, {...link,adapter:'script'}, {...link,status:'UNKNOWN'}]) assert.deepEqual(relationshipRenderer(value),{className:'connection unknown-type',marker:null});
});


test('structural failure is not reported as a valid semantic assessment',()=>{
  const h=setup(),state=h.model.store.snapshot,before=h.model.store.exportFiles();state.elements[0].type='Unsupported';
  installProfileUI({document:h.document,model:{store:{snapshot:state,revision:7}},openDialog(){}});h.open();
  assert.match(h.$('profile-structure').textContent,/Формат не подтверждён/);assert.match(h.$('profile-local').textContent,/UNKNOWN/);assert.match(h.$('profile-normative').textContent,/UNKNOWN/);assert.deepEqual(h.model.store.exportFiles(),before);
});

test('formerly excluded composite endpoints are now source-backed without generated local rules', () => {
  assert.deepEqual(CURRENT_PROFILE.rules, []);
  const outside=createDemo().snapshot;outside.elements.forEach((element,index)=>{element.type=['Grouping','Location','Plateau'][index%3];});
  const h=setup(createRegistry([CURRENT_PROFILE]),createStore(outside)); h.ui.refresh(); h.open();
  assert.equal(h.$('profile-catalog').children.length,59);
  assert.match(h.$('profile-reference').textContent,/schemka-archimate4@2/);
  assert.ok([...h.$('profile-results').children].every(item=>!item.textContent.startsWith('UNKNOWN ·')));
  assert.match(h.$('profile-local').textContent,/UNKNOWN: 0/);
  assert.match(h.$('profile-normative').textContent,/UNKNOWN/);
});

test('assessment copy never promotes a proposal to local or normative permission', async () => {
  const { relationshipAssessment, assessmentMessage } = await import('../src/profile-ui.js');
  const h=setup(), state=h.model.store.snapshot;
  assert.equal(relationshipAssessment(state,state.relationships[0]).status,expectedEndpointDecision('Service','Serving','Process').status);
  for (const status of ['ALLOWED','FORBIDDEN','UNKNOWN']) {
    const message=assessmentMessage({status});
    assert.match(message,/^UNKNOWN/); assert.match(message,/Нормативная оценка: UNKNOWN/);
    assert.match(message,/пока не проверено/); assert.doesNotMatch(message,/ALLOWED|FORBIDDEN/);
  }
  assert.equal(relationshipAssessment(state,null).status,'UNKNOWN');
});

test('real-DOM report counts the 36 verified cases plus UNKNOWN without changing bytes or undo/redo', async t => {
  const { endpointFixture } = await import('./endpoint-fixture.js');
  const f=endpointFixture({relationships:true}),h=setup(createRegistry([CURRENT_PROFILE]),createStore(f.state)); t.after(()=>h.close());
  h.model.execute({type:'renameProject',name:'Temporary'});h.model.undo();
  const before=h.model.store.exportFiles(),revision=h.model.store.revision,history=h.model.store.history;
  h.open();
  assert.match(h.$('profile-local').textContent,/ALLOWED: 8 · FORBIDDEN: 28 · UNKNOWN: 1/);
  assert.match(h.$('profile-local').textContent,/Подтверждённых производных связей: 8/);
  assert.match(h.$('profile-normative').textContent,/Нормативная оценка: UNKNOWN/);
  for(const scope of h.$('profile-results').querySelectorAll('.assessment-coverage')) {
    assert.match(scope.textContent,/1764 упорядоченных/);assert.match(scope.textContent,/просмотрены 26460 из 26460; определено 26452 решений/);assert.match(scope.textContent,/8 остаются UNKNOWN/);
    assert.match(scope.textContent,/Охвачены все типы элементов текущего каталога/);
  }
  assert.equal(h.$('profile-results').querySelectorAll('.assessment-coverage').length,37);
  for(const [status,count] of [['ALLOWED',8],['FORBIDDEN',28],['UNKNOWN',1]])assert.equal(h.$('profile-results').querySelectorAll(`[data-assessment="${status}"]`).length,count);
  assert.match(h.$('profile-results').textContent,/Допустимо как производная связь\. Можно изобразить напрямую/);
  assert.match(h.$('profile-results').textContent,/ApplicationComponent → ReadAccess → DataObject/);
  assert.equal(h.$('profile-results').querySelectorAll('img,script').length,0);
  assert.deepEqual(new Set([...h.$('profile-results').querySelectorAll('a')].map(link=>link.href)),new Set(['https://publications.opengroup.org/standards/archimate/c260']));
  assert.deepEqual(h.model.store.exportFiles(),before);assert.equal(h.model.store.revision,revision);assert.deepEqual(h.model.store.history,history);assert.equal(h.session.dirty,false);
  // A descriptor clone can carry the same catalog and source metadata, but has
  // no authority to turn a local or synthetic rule into this verified matrix.
  const cloned=setup(createRegistry([structuredClone(CURRENT_PROFILE)]),createStore(f.state));t.after(()=>cloned.close());cloned.open();
  assert.match(cloned.$('profile-local').textContent,/ALLOWED: 0 · FORBIDDEN: 0 · UNKNOWN: 37/);
  assert.equal(cloned.$('profile-results').querySelectorAll('[data-assessment="ALLOWED"],[data-assessment="FORBIDDEN"]').length,0);
  for(const scope of cloned.$('profile-results').querySelectorAll('.assessment-coverage')){assert.match(scope.textContent,/Покрытие проверки не подтверждено/);assert.doesNotMatch(scope.textContent,/1764|26460|42 типов/);}
  assert.equal(cloned.$('profile-results').querySelectorAll('.assessment-coverage').length,37);
});
