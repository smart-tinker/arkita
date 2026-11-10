import {legendLayout} from './visual-layout.js';
import {createStore,exportFiles,DRAWING_COLLECTIONS} from '../../schemka-model-core/src/index.js';

/** One staged action; retaining coordinates differs from retaining the parent's top-left offset. */
export function prepareDrawingBounds(state,viewId,drawing,bounds,mode = 'retain') {
  if (!['retain','offset'].includes(mode)) throw Error('Неизвестный режим изменения контейнера.');
  const entry=state.views.find(item=>item.view.id===viewId),item=entry?.[DRAWING_COLLECTIONS[drawing.kind]]?.find(item=>item.id===drawing.id);
  if (!item?.bounds) throw Error('Фигура для изменения размера не найдена.');
  const changed=['x','y','width','height'].some(key=>item.bounds[key]!==bounds[key]);if(!changed)return {snapshot:state,changed:false};
  const stage=createStore(state),dx=Math.round((bounds.x-item.bounds.x)*10)/10,dy=Math.round((bounds.y-item.bounds.y)*10)/10;
  if(mode==='offset'&&(dx||dy))stage.execute({type:'moveDrawings',viewId,drawings:[drawing],dx,dy},stage.revision);
  const next=stage.snapshot,target=next.views.find(item=>item.view.id===viewId)[DRAWING_COLLECTIONS[drawing.kind]].find(item=>item.id===drawing.id).bounds;
  if(['x','y','width','height'].every(key=>target[key]===bounds[key]))return {snapshot:next,changed:true};Object.assign(target,bounds);
  stage.execute({type:'applyProjectSnapshot',files:exportFiles(next)},stage.revision);return {snapshot:stage.snapshot,changed:true};
}


/** Local creation size, or the saved legend's content size; descendants stay visible. */
export function standardDrawingBounds(state,viewId,drawing,defaults={width:210,height:90}){
 const entry=state.views.find(item=>item.view.id===viewId),item=entry?.[DRAWING_COLLECTIONS[drawing.kind]]?.find(item=>item.id===drawing.id);if(!item?.bounds)throw Error('Фигура не найдена.');
 const size=item.concept?.kind==='junction'?{width:36,height:36}:item.kind==='legend'?legendLayout(state,entry,{...item,legend:{...item.legend,autoSize:true}}).bounds:{width:defaults.width??210,height:defaults.height??90},bounds={...item.bounds,width:size.width,height:size.height},key=ref=>`${ref.kind}:${ref.id}`,descendants=new Set([key(drawing)]),nodes=[...entry.occurrences.map(item=>({kind:'occurrence',item})),...entry.visualNodes.map(item=>({kind:'visualNode',item}))];
 for(let changed=true;changed;){changed=false;for(const node of nodes)if(node.item.parent&&descendants.has(key(node.item.parent))&&!descendants.has(key({kind:node.kind,id:node.item.id}))){descendants.add(key({kind:node.kind,id:node.item.id}));changed=true;}}
 for(const node of nodes)if(node.item.id!==item.id&&descendants.has(key({kind:node.kind,id:node.item.id}))){bounds.width=Math.max(bounds.width,node.item.bounds.x+node.item.bounds.width-bounds.x+12);bounds.height=Math.max(bounds.height,node.item.bounds.y+node.item.bounds.height-bounds.y+12);}
 bounds.width=Math.round(bounds.width*10)/10;bounds.height=Math.round(bounds.height*10)/10;return bounds;
}
