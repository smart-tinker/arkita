import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { notationElement, notationJunction, notationRelationship } from './notation.js';

export function legendEntries(state, view, legend) {
  const entries=new Map(),profiles=new Map((state.customizationProfiles??[]).map(item=>[item.id,item])),labels=new Map((legend.labels??[]).map(row=>[row.type,row.label])),colors=new Map((legend.colors??[]).map(row=>[row.profileId?'profile:'+row.profileId:'type:'+row.type,row.color]));
  function add(item,kind){
    const appearance=kind==='relationship'?notationRelationship(state.project.metamodel,item.type):kind==='junction'?notationJunction(state.project.metamodel,item.type):notationElement(state.project.metamodel,item.type),family=kind==='relationship'?'relationship':appearance.family;
    const base={type:item.type,name:labels.get(item.type)??appearance.badge??item.type,family,relationship:kind==='relationship',kind};
    if(kind==='relationship'?legend.showRelationships:legend.showElements!==false)entries.set('type:'+item.type,{...base,color:colors.get('type:'+item.type)});
    if(legend.showSpecializations)for(const application of item.profileApplications??[]){const profile=profiles.get(application.profileId);if(profile?.purpose==='specialization')entries.set('profile:'+profile.id+':'+item.type,{...base,name:profile.name+' · '+base.name,profileId:profile.id,color:colors.get('profile:'+profile.id)??colors.get('type:'+item.type)});}
  }
  const byKind={element:new Map(state.elements.map(item=>[item.id,item])),junction:new Map(state.junctions.map(item=>[item.id,item]))},relationships=new Map(state.relationships.map(item=>[item.id,item]));
  for(const occurrence of view.occurrences){const item=byKind[occurrence.concept.kind].get(occurrence.concept.id);if(item)add(item,occurrence.concept.kind);}
  for(const line of view.connections){const item=relationships.get(line.relationshipId);if(item)add(item,'relationship');}
  const order=[...CURRENT_CATALOG.elementTypes,...CURRENT_CATALOG.junctionTypes,...CURRENT_CATALOG.relationshipTypes];
  return [...entries.values()].sort((a,b)=>legend.sort==='name'?a.name.localeCompare(b.name,'ru',{numeric:true})||String(a.profileId??'').localeCompare(b.profileId??''):order.indexOf(a.type)-order.indexOf(b.type)||Number(!!a.profileId)-Number(!!b.profileId)||String(a.profileId??'').localeCompare(b.profileId??''));
}
export function legendLayout(state, view, node) {
  const entries = legendEntries(state, view, node.legend),rows=node.legend.rowsPerColumn?Math.min(node.legend.rowsPerColumn,entries.length):Math.ceil(entries.length/node.legend.columns),columns=node.legend.rowsPerColumn?Math.max(1,Math.ceil(entries.length/(rows||1))):node.legend.columns,font = node.style.fontSize ?? 12, rowHeight = font * 1.7;
  const longest = Math.max(10, ...entries.map(item => Array.from(item.name).length));
  const cell = node.legend.columnWidth ?? (node.legend.autoSize ? Math.ceil(longest * font * .7 + 34) : node.bounds.width / columns);
  const start = font * 2 + 14;
  const bounds = node.legend.autoSize ? { ...node.bounds, width: Math.max(80, Math.round((cell * columns + 20) * 10) / 10), height: Math.max(40, Math.round((rows * rowHeight + font * 2 + 20) * 10) / 10) } : node.bounds;
  const contentHeight = rows * rowHeight + font * 2 + 20;
  const spare = Math.max(0,bounds.height-contentHeight), offset = node.style.verticalAlign === 'bottom' ? spare : node.style.verticalAlign === 'middle' ? spare/2 : 0;
  return { entries, rows, columns,cell, rowHeight, start:start+offset, bounds, offset };
}
/** Pure effective drawing geometry; native bounds and authored order never change. */
export function layoutVisualView(state, view) {
  if (!view?.visualNodes.some(item => item.kind === 'legend' && item.legend.autoSize)) return view;
  return { ...view, visualNodes: view.visualNodes.map(item => item.kind === 'legend' && item.legend.autoSize ? { ...item, bounds: legendLayout(state, view, item).bounds } : item) };
}
export function legendColor(entry, scheme = 'notation') {
  if(entry.color)return entry.color;
  if (scheme === 'monochrome') return '#d1d5db';
  if (scheme === 'notation') return entry.relationship ? '#cbd5e1' : `var(--notation-${entry.family==='junctions'?'common':entry.family})`;
  const colors = ['#dbeafe', '#d1fae5', '#fef3c7', '#ede9fe', '#fce7f3', '#cffafe', '#ffedd5'];
  let hash = 0; for (const char of entry.type) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return colors[hash % colors.length];
}
