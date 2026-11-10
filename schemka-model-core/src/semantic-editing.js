import { createStore } from './store.js';
import { moveDrawingGeometry, applyDrawingGeometry } from './group-geometry.js';
import { validateProject, exportFiles, projectIndex, conceptRecord, viewIndex, endpointRecord } from './format.js';
import { CURRENT_PROFILE, createRegistry, assessProject, evaluateConceptRelationship, getVerifiedRelationshipDecision, getVerifiedConceptDecision } from '../../schemka-model-profiles/src/index.js';

const registry = createRegistry([CURRENT_PROFILE]);
const key = ref => ref ? `${ref.kind}:${ref.id}` : '';
const same = (a,b) => key(a) === key(b);
const nodes = view => [...view.occurrences.map(item=>({kind:'occurrence',id:item.id,item})),...view.visualNodes.map(item=>({kind:'visualNode',id:item.id,item}))];
const ref = node => node ? {kind:node.kind,id:node.id} : null;
const contains = (a,b) => a.x<=b.x && a.y<=b.y && a.x+a.width>=b.x+b.width && a.y+a.height>=b.y+b.height;
const blockers = report => [...report.relationships.filter(item=>item.status==='FORBIDDEN').map(item=>`${item.relationshipId}:${item.ruleId}:${item.reason}`),...report.junctionAssessment.issues.filter(item=>item.status==='FAIL').map(item=>`${item.ruleId}:${[...item.relationshipIds].sort().join(',')}`)];

/** A visible candidate is geometric only. No ArchiMate nesting meaning is inferred. */
export function nestingTargets(view, drawings, { parentView = view } = {}) {
  const all=nodes(view), byKey=new Map(nodes(parentView).map(node=>[key(node),node])), selected=new Set(drawings.map(key));
  const descendant=(candidate,ancestor)=>{let item=candidate.item;const seen=new Set();while(item.parent){const id=key(item.parent);if(id===key(ancestor))return true;if(seen.has(id))return true;seen.add(id);item=byKey.get(id)?.item;if(!item)return false;}return false;};
  return all.filter(node=>selected.has(key(node))&&!all.some(parent=>selected.has(key(parent))&&descendant(node,parent))).map(child=>{
    const candidates=all.filter(parent=>!selected.has(key(parent)) && (parent.kind==='occurrence'||parent.item.kind==='group') && !descendant(parent,child) && contains(parent.item.bounds,child.item.bounds) && parent.item.bounds.width*parent.item.bounds.height>child.item.bounds.width*child.item.bounds.height);
    candidates.sort((a,b)=>a.item.bounds.width*a.item.bounds.height-b.item.bounds.width*b.item.bounds.height||b.item.zIndex-a.item.zIndex||a.id.localeCompare(b.id));
    const existing=child.item.parent&&byKey.get(key(child.item.parent)),hidden=child.item.parent&&!all.some(item=>same(item,child.item.parent));
    const parent=ref(candidates[0])??(hidden&&(!existing||contains(existing.item.bounds,child.item.bounds))?child.item.parent:null);return {drawing:ref(child),parent,previous:child.item.parent,changed:!same(parent,child.item.parent)};
  });
}

export function prepareNestingPlacement(state,command,{visibleIds=null}={}) {
  if(!['createElementAndOccurrence','createJunctionAndOccurrence','addOccurrence','moveDrawings'].includes(command.type))return null;
  const original=state.views.find(item=>item.view.id===command.viewId);if(!original)return null;
  const preview=structuredClone(original),visible=visibleIds?new Set(visibleIds):null;
  let previewRefs;
  if(command.type==='moveDrawings'){
    applyDrawingGeometry(preview,moveDrawingGeometry(preview,command.drawings,command.dx,command.dy,command.connectionIds));previewRefs=command.drawings;
  }else{
    if(!command.bounds||command.parent)return null;
    const id='placement-preview';preview.visualNodes.push({id,kind:'note',bounds:command.bounds,parent:null,zIndex:0});visible?.add(id);previewRefs=[{kind:'visualNode',id}];
  }
  const visibleView=view=>visible?{...view,occurrences:view.occurrences.filter(item=>visible.has(item.id)),visualNodes:view.visualNodes.filter(item=>visible.has(item.id))}:view;
  if(!nestingTargets(visibleView(preview),previewRefs,{parentView:preview}).some(item=>item.changed))return null;
  const stage=createStore(state),result=stage.execute(command,stage.revision),entry=stage.snapshot.views.find(item=>item.view.id===command.viewId);
  const drawings=command.type==='moveDrawings'?command.drawings:[{kind:'occurrence',id:result.created.occurrenceId}];
  drawings.forEach(item=>visible?.add(item.id));
  const view=visibleView(entry);
  const targets=nestingTargets(view,drawings,{parentView:entry}).filter(item=>item.changed);
  if(!targets.length)return null;
  for(const item of targets)stage.execute({type:'reparentDrawing',viewId:command.viewId,drawing:item.drawing,parent:item.parent},stage.revision);
  return {snapshot:stage.snapshot,targets,viewId:command.viewId,created:result.created,operation:command.type==='moveDrawings'?'move':command.type==='addOccurrence'?'reuse':'create'};
}

export function nestingRelationshipChoices(state,viewId,drawing,parent,{parentTypes=[],childTypes=[]}={}) {
  if(drawing.kind!=='occurrence'||parent?.kind!=='occurrence')return [];
  const entry=state.views.find(item=>item.view.id===viewId),child=entry.occurrences.find(item=>item.id===drawing.id),container=entry.occurrences.find(item=>item.id===parent.id),index=projectIndex(state),choices=[];
  for(const [direction,source,target,sourceDrawing,targetDrawing,types]of [['parent-child',container.concept,child.concept,parent,drawing,parentTypes],['child-parent',child.concept,container.concept,drawing,parent,childTypes]]){
    for(const type of new Set(types)){
      const decision=evaluateConceptRelationship(registry,state.project.metamodel,{source:{kind:source.kind,type:conceptRecord(index,source).type},relationshipType:type,target:{kind:target.kind,type:conceptRecord(index,target).type},scope:'direct'});
      const verified=getVerifiedRelationshipDecision(decision)||getVerifiedConceptDecision(decision);
      if(verified?.status!=='ALLOWED')continue;
      const existing=state.relationships.filter(item=>item.type===type&&same(item.source,source)&&same(item.target,target));
      for(const relation of existing.length?existing:[null]) choices.push({key:`${direction}:${relation?.id??type}`,direction,type,relationshipId:relation?.id??null,source:sourceDrawing,target:targetDrawing,decision});
    }
  }
  return choices;
}

export function finishNestingPlacement(plan,selections,{parentTypes=[],childTypes=[],prepareCommand=command=>command}={}) {
  const stage=createStore(plan.snapshot);
  for(const [index,target]of plan.targets.entries()){
    const selected=selections[index];if(!selected?.key)continue;
    const offered=nestingRelationshipChoices(plan.snapshot,plan.viewId,target.drawing,target.parent,{parentTypes,childTypes}).find(item=>item.key===selected.key);
    const available=nestingRelationshipChoices(stage.snapshot,plan.viewId,target.drawing,target.parent,{parentTypes,childTypes});
    // Two moved occurrences of the same concept share a relation created earlier in this atomic plan.
    const choice=offered&&available.find(item=>item.key===offered.key||!offered.relationshipId&&item.type===offered.type&&item.direction===offered.direction);
    if(!choice)throw Error('Предложение отношения больше не допустимо. Подготовьте вложение заново.');
    let connection=stage.snapshot.views.find(item=>item.view.id===plan.viewId).connections.find(item=>item.relationshipId===choice.relationshipId&&same(item.source,choice.source)&&same(item.target,choice.target));
    if(!connection){const command=choice.relationshipId?{type:'addConnection',viewId:plan.viewId,relationshipId:choice.relationshipId,source:choice.source,target:choice.target}:{type:'createRelationshipAndConnection',viewId:plan.viewId,relationshipType:choice.type,source:choice.source,target:choice.target,label:''};const result=stage.execute(prepareCommand(command),stage.revision);connection={id:result.created.connectionId};}
    if(selected.hide!==undefined){const current=stage.snapshot.views.find(item=>item.view.id===plan.viewId).connections.find(item=>item.id===connection.id);if(current.style.hideWhenNested!==selected.hide)stage.execute({type:'updateDrawingStyle',viewId:plan.viewId,drawing:{kind:'connection',id:connection.id},style:{...current.style,hideWhenNested:selected.hide}},stage.revision);}
  }
  return {...plan,snapshot:stage.snapshot};
}

export function relationshipRebindImpact(state,relationshipId,end,concept) {
  validateProject(state);if(!['source','target'].includes(end))throw Error('Выберите изменяемый конец отношения.');
  const relationship=state.relationships.find(item=>item.id===relationshipId);if(!relationship)throw Error('Отношение не найдено.');conceptRecord(projectIndex(state),concept);
  if(same(relationship[end],concept))throw Error('Выберите другой общий концепт.');
  return {relationshipId,end,concept,previous:relationship[end],usages:state.views.flatMap(view=>view.connections.filter(item=>item.relationshipId===relationshipId).map(item=>({viewId:view.view.id,viewName:view.view.name,connectionId:item.id,endpoint:item[end]})))};
}

/** Every usage needs an explicit exact drawing binding; no first matching occurrence. */
export function prepareRelationshipRebind(state,{relationshipId,end,concept,bindings},{prepareCommand=command=>command,defaultSize={width:210,height:90}}={}) {
  const impact=relationshipRebindImpact(state,relationshipId,end,concept),expected=new Set(impact.usages.map(item=>item.connectionId));
  if(!bindings||Object.keys(bindings).length!==expected.size||Object.keys(bindings).some(id=>!expected.has(id)))throw Error('Укажите привязку каждого рисунка общего отношения.');
  const stage=createStore(state),resolved=new Map();
  for(const usage of impact.usages){
    const value=bindings[usage.connectionId];if(!value)throw Error('Выберите привязку каждого соединения.');
    if(value.createOccurrence===true){
      if(!['element','junction'].includes(concept.kind))throw Error('Для отношения выберите точный существующий якорь.');
      const old=state.views.find(view=>view.view.id===usage.viewId),previous=old.occurrences.find(item=>item.id===usage.endpoint.id),anchor=old.connections.find(item=>item.id===usage.endpoint.id)?.routePoints.find(item=>item.id===usage.endpoint.anchorId)?.point;
      const bounds=previous?{...previous.bounds}:{x:anchor?.x??0,y:anchor?.y??0,width:concept.kind==='junction'?36:defaultSize.width,height:concept.kind==='junction'?36:defaultSize.height};
      const result=stage.execute(prepareCommand({type:'addOccurrence',viewId:usage.viewId,concept,bounds}),stage.revision);resolved.set(usage.connectionId,{kind:'occurrence',id:result.created.occurrenceId});
    }else resolved.set(usage.connectionId,structuredClone(value));
  }
  const snapshot=stage.snapshot;snapshot.relationships.find(item=>item.id===relationshipId)[end]=structuredClone(concept);
  for(const usage of impact.usages){const view=snapshot.views.find(item=>item.view.id===usage.viewId),connection=view.connections.find(item=>item.id===usage.connectionId),endpoint=resolved.get(usage.connectionId);const record=endpointRecord(projectIndex(snapshot),viewIndex(view),endpoint);if(!same(record.concept,concept))throw Error('Рисунок должен ссылаться на выбранный общий концепт.');connection[end]=endpoint;}
  validateProject(snapshot);
  const before=new Set(blockers(assessProject(state,registry))),report=assessProject(snapshot,registry),newBlockers=blockers(report).filter(item=>!before.has(item));
  if(newBlockers.length)throw Error(`Переподключение создаёт доказанно недопустимые отношения: ${newBlockers.join('; ')}`);
  // The existing command boundary enforces locks on every changed drawing.
  createStore(state).execute({type:'applyProjectSnapshot',files:exportFiles(snapshot)},0);
  const related=new Set(state.relationships.filter(item=>item.id===relationshipId||[item.source,item.target].some(ref=>ref.kind==='relationship'&&ref.id===relationshipId)).map(item=>item.id));
  return {...impact,snapshot,decisions:report.relationships.filter(item=>related.has(item.relationshipId))};
}
