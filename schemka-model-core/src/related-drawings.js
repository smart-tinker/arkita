import { createStore, validateProject, exportFiles, planGeneratedView, MODEL_GRAPH_LIMIT } from './index.js';

const key=ref=>`${ref.kind}:${ref.id}`;
/** Add images of existing graph records; semantic IDs, names and properties stay exact. */
export function addRelatedDrawings(state,{viewId,relationshipIds,neighbors=false,placements={},point=null},{prepareCommand=command=>command}={}) {
  validateProject(state);const original=state.views.find(entry=>entry.view.id===viewId);if(!original)throw Error('Представление не найдено.');
  if(!Array.isArray(relationshipIds)||!relationshipIds.length||relationshipIds.length>MODEL_GRAPH_LIMIT||new Set(relationshipIds).size!==relationshipIds.length)throw Error(`Выберите от 1 до ${MODEL_GRAPH_LIMIT} разных отношений; полный план с концами также ограничен ${MODEL_GRAPH_LIMIT} концептами.`);
  const selected=relationshipIds.map(id=>{const item=state.relationships.find(item=>item.id===id);if(!item)throw Error('Отношение не найдено.');return item;});
  const roots=new Set(selected.flatMap(item=>[key(item.source),key(item.target),key({kind:'relationship',id:item.id})]));
  const ids=new Set(relationshipIds);if(neighbors)for(const item of state.relationships)if(roots.has(key(item.source))||roots.has(key(item.target)))ids.add(item.id);
  const options={concepts:[...ids].map(id=>({kind:'relationship',id})),relationshipMode:'selected',viewpointId:original.view.viewpointId??null};
  const plan=planGeneratedView(state,options);if(!plan.connectionCount)throw Error('Выбор типов viewpoint исключает выбранные отношения.');
  const stage=createStore(state),generatedId=stage.execute({type:'generateView',...options,name:'Временный план добавления'},stage.revision).created.viewId;
  const snapshot=stage.snapshot,generated=snapshot.views.find(entry=>entry.view.id===generatedId),view=snapshot.views.find(entry=>entry.view.id===viewId);
  snapshot.views=snapshot.views.filter(entry=>entry.view.id!==generatedId);
  const nodeMap=new Map(),lineMap=new Map(),anchors=new Map(),reused=[],newNodes=[],newLines=[],newAnchors=[];
  const sorted=items=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
  for(const item of generated.occurrences){const ref=key(item.concept),candidates=sorted(view.occurrences.filter(other=>key(other.concept)===ref)),choice=placements[ref];
    const existing=choice?candidates.find(other=>other.id===choice.id):candidates[0];if(choice&&!existing)throw Error('Выбранный рисунок конца больше недоступен.');
    if(existing){nodeMap.set(item.id,existing.id);reused.push({concept:item.concept,drawing:{kind:'occurrence',id:existing.id},alternatives:candidates.length});}else{nodeMap.set(item.id,item.id);newNodes.push(item);}}
  for(const item of generated.connections){const ref=`relationship:${item.relationshipId}`,candidates=sorted(view.connections.filter(other=>other.relationshipId===item.relationshipId)),choice=placements[ref];
    const existing=choice?candidates.find(other=>other.id===choice.id):candidates[0];if(choice&&!existing)throw Error('Выбранное соединение конца больше недоступно.');
    lineMap.set(item.id,existing??item);if(existing)reused.push({concept:{kind:'relationship',id:item.relationshipId},drawing:{kind:'connection',id:existing.id},alternatives:candidates.length});else newLines.push(item);}
  const right=Math.max(0,...[...view.occurrences,...view.visualNodes].map(item=>item.bounds.x+item.bounds.width)),dx=Math.round((point?.x??right+80)*10)/10-40,dy=Math.round((point?.y??40)*10)/10-40;
  for(const item of newNodes){item.bounds.x=Math.round((item.bounds.x+dx)*10)/10;item.bounds.y=Math.round((item.bounds.y+dy)*10)/10;}
  const generatedById=new Map(generated.connections.map(item=>[item.id,item])),generatedNodes=new Map(generated.occurrences.map(item=>[item.id,item]));
  for(const item of generated.connections){const existing=lineMap.get(item.id);if(existing===item)continue;
    for(const side of ['source','target']){const end=item[side],actual=existing[side],concept=end.kind==='occurrence'?generatedNodes.get(end.id).concept:{kind:'relationship',id:generatedById.get(end.id).relationshipId},choice=placements[key(concept)];
      if(choice&&(actual.kind!==end.kind||actual.id!==choice.id||choice.anchorId&&actual.anchorId!==choice.anchorId))throw Error('Выбранное соединение использует другой рисунок или якорь конца. Выберите совместимые рисунки; существующее соединение не будет изменено.');
    }
  }
  const existingLines=new Set(view.connections.map(item=>item.id)),occurrences=new Map(view.occurrences.map(item=>[item.id,item]));
  function hostAnchorPlacement(host){
    if(host.routePoints.length){const at=Math.floor((host.routePoints.length-1)/2);return {point:{...host.routePoints[at].point},at:at+1};}
    const point=end=>{if(end.kind==='occurrence'){const bounds=occurrences.get(end.id).bounds;return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};}return view.connections.find(item=>item.id===end.id).routePoints.find(item=>item.kind==='anchor'&&item.id===end.anchorId).point;};
    const a=point(host.source),b=point(host.target);if(a.x===b.x&&a.y===b.y){const bounds=host.source.kind==='occurrence'?occurrences.get(host.source.id).bounds:{width:120,height:80};return {point:{x:a.x+bounds.width/2+60,y:a.y-bounds.height/2-40},at:0};}return {point:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},at:0};
  }
  function endpoint(end){if(end.kind==='occurrence')return {...end,id:nodeMap.get(end.id)};const host=lineMap.get(end.id),old=generatedById.get(end.id),choice=placements[`relationship:${old.relationshipId}`];let anchor=anchors.get(host.id);
    if(!anchor){anchor=choice?.anchorId?host.routePoints.find(item=>item.kind==='anchor'&&item.id===choice.anchorId):host.routePoints.find(item=>item.kind==='anchor');if(choice?.anchorId&&!anchor)throw Error('Выбранный якорь больше недоступен.');
      if(!anchor){if(host.locked)throw Error('Разблокируйте соединение перед добавлением якоря.');anchor=structuredClone(old.routePoints.find(item=>item.kind==='anchor'));const placement=existingLines.has(host.id)?hostAnchorPlacement(host):{point:{x:anchor.point.x+dx,y:anchor.point.y+dy},at:host.routePoints.length};anchor.point=placement.point;anchor.point.x=Math.round(anchor.point.x*10)/10;anchor.point.y=Math.round(anchor.point.y*10)/10;host.routePoints.splice(placement.at,0,anchor);newAnchors.push({connectionId:host.id,anchorId:anchor.id});}anchors.set(host.id,anchor);}
    return {kind:'connection',id:host.id,anchorId:anchor.id};}
  for(const item of newLines){item.source=endpoint(item.source);item.target=endpoint(item.target);for(const route of item.routePoints){route.point.x=Math.round((route.point.x+dx)*10)/10;route.point.y=Math.round((route.point.y+dy)*10)/10;}if(item.labelPosition){item.labelPosition.x=Math.round((item.labelPosition.x+dx)*10)/10;item.labelPosition.y=Math.round((item.labelPosition.y+dy)*10)/10;}}
  for(const item of newNodes)item.style=prepareCommand({type:'addOccurrence',style:item.style}).style??item.style;
  for(const item of newLines)item.style=prepareCommand({type:'addConnection',style:item.style}).style??item.style;
  view.occurrences.push(...newNodes);view.connections.push(...newLines);validateProject(snapshot);
  return {snapshot,files:exportFiles(snapshot),plan,reused,newAnchors,occurrenceIds:newNodes.map(item=>item.id),connectionIds:newLines.map(item=>item.id),changed:Boolean(newNodes.length||newLines.length||newAnchors.length)};
}
