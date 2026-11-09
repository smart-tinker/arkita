import {CURRENT_CATALOG} from '../../schemka-model-core/src/index.js';
import {evaluateConceptRelationship,getVerifiedRelationshipDecision,getVerifiedConceptDecision} from '../../schemka-model-profiles/src/index.js';
import {modelProfiles,diagnosticPresentation,renderAssessmentEvidence,relationshipCoverage} from './profile-ui.js';

/** Read-only reference uses the exact registry and private evidence boundary used by creation. */
export function installRelationshipReference({document,model,openDialog,blocked = () => false,status = () => {}}) {
  const node = (tag,text,id) => {const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(id)item.id=id;return item;};
  const dialog=node('dialog',undefined,'relationship-reference-dialog'),title=node('h2','Справочник отношений Arkita 4','relationship-reference-title');dialog.setAttribute('aria-labelledby',title.id);
  const fields=node('div'),summary=node('p','','relationship-reference-result'),version=node('p','','relationship-reference-version'),evidence=node('details'),close=node('button','Закрыть');close.type='button';
  const choices = [['element','Элемент'],['junction','Junction'],['relationship','Отношение']].flatMap(([kind,label])=>CURRENT_CATALOG[`${kind}Types`].map(type=>({kind,type,label:`${label} · ${type}`})));
  function select(label,id,entries){const host=node('label',label),item=node('select',undefined,id);for(const [value,text] of entries){const option=node('option',text);option.value=value;item.append(option);}host.append(item);fields.append(host);return item;}
  const source=select('Источник','relationship-reference-source',choices.map(item=>[`${item.kind}:${item.type}`,item.label])),target=select('Цель','relationship-reference-target',choices.map(item=>[`${item.kind}:${item.type}`,item.label])),type=select('Тип отношения','relationship-reference-type',CURRENT_CATALOG.relationshipTypes.map(type=>[type,type]));
  dialog.append(title,node('p','ALLOWED — проверенное разрешение для типов концов; FORBIDDEN — проверенный запрет; UNKNOWN — допустимость не подтверждена. Это справочник типов, а не оценка всей модели или конкретного графа.'),fields,summary,version,evidence,close);document.body.append(dialog);
  const button=node('button','Справочник отношений…','relationship-reference-button');button.type='button';const menu=[...document.querySelectorAll('.app-menu')].find(item=>item.querySelector('summary')?.textContent.trim()==='Справка');(menu?.querySelector('.menu-items')??document.body).append(button);
  let generation=0,observedStore=null,observedRevision=-1;
  function refresh(){if(!dialog.open)return;const state=model.store.snapshot,decode=value=>{const [kind,type]=value.split(':');return {kind,type};},context={source:decode(source.value),target:decode(target.value),relationshipType:type.value,scope:'direct'};
    const result=evaluateConceptRelationship(modelProfiles,state.project.metamodel,context),verified=getVerifiedRelationshipDecision(result)||getVerifiedConceptDecision(result),presentation=diagnosticPresentation(result);
    summary.dataset.assessment=presentation.status;summary.textContent=presentation.summary;
    const reference=state.project.metamodel;version.textContent=`Профиль ${reference.id} · ${reference.version}. ${verified?.sourceEvidence ? `Проверенный источник ${verified.sourceEvidence.publication}; SHA-256 ${verified.sourceEvidence.sha256}; правило ${verified.ruleId}.` : 'Для выбранного профиля и сочетания нет подтверждённого источника: UNKNOWN.'}`;
    renderAssessmentEvidence(document,evidence,result,{sourceType:`${context.source.kind} ${context.source.type}`,targetType:`${context.target.kind} ${context.target.type}`,relationshipType:type.value},relationshipCoverage(reference));observedStore=model.store;observedRevision=model.store.revision;generation++;
  }
  function open(){if(blocked()||dialog.open)return false;openDialog(dialog.id);if(!dialog.open)return false;refresh();source.focus();return true;}
  function cancel(){const active=dialog.open;if(active)dialog.close();generation++;return active;}
  for(const item of [source,target,type])item.addEventListener('change',refresh);button.addEventListener('click',()=>{try{open();}catch(error){status(error.message);}});close.addEventListener('click',cancel);dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});dialog.addEventListener('close',()=>generation++);
  return {open,cancel,refresh(){if(dialog.open&&(observedStore!==model.store||observedRevision!==model.store.revision))refresh();},get active(){return dialog.open;},get generation(){return generation;}};
}
