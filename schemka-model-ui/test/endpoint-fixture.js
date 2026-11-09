import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { importedRelationship } from './imported-relationship.js';
import { createProject, createStore, CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';

export const ACCESS_TYPES = ['Access', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess'];
export const APPLICATION_TYPES = ['ApplicationComponent', 'ApplicationInterface', 'DataObject'];
export const expectedAccessStatus = (source, target) => source !== 'DataObject' && target === 'DataObject' ? 'ALLOWED' : 'FORBIDDEN';

/** Synthetic endpoint checks with shared objects, independent layouts and untouched metadata. */
export function endpointFixture({ relationships = false } = {}) {
  const store = createStore(createProject('Synthetic endpoint checks'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Source endpoints' });
  const { viewId: otherViewId } = run({ type: 'createView', name: 'Shared reverse layout' });
  const items = APPLICATION_TYPES.map((elementType, index) => run({ type: 'createElementAndOccurrence', viewId, elementType,
    name: `${elementType} <img onerror=x>`, documentation: 'Synthetic\r\nretained', properties: propertyEntries({ untouched: '<script> & text' }),
    bounds: { x: 30 + index * 260, y: 120, width: 180.1, height: 85.2 } }));
  items.forEach((item, index) => run({ type: 'addOccurrence', viewId: otherViewId, concept: { kind: 'element', id: item.elementId },
    bounds: { x: 620 - index * 260, y: 280, width: 180, height: 90 } }));
  const outside = run({type:'createElementAndOccurrence',viewId,elementType:'Plateau',name:'Unresolved composite scope',bounds:{x:810,y:120,width:160,height:80}});
  run({type:'addOccurrence',viewId:otherViewId,concept: { kind: 'element', id: outside.elementId },bounds:{x:810,y:280,width:160,height:80}});
  const deliverable = run({type:'createElementAndOccurrence',viewId,elementType:'Deliverable',name:'Unresolved target',bounds:{x:1050,y:120,width:160,height:80}});
  run({type:'addOccurrence',viewId:otherViewId,concept: { kind: 'element', id: deliverable.elementId },bounds:{x:1050,y:280,width:160,height:80}});
  const unknown = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Aggregation',
    source: { kind: 'occurrence', id: outside.occurrenceId }, target: { kind: 'occurrence', id: deliverable.occurrenceId },
    label: 'Unknown <img onerror=x>',
    properties: propertyEntries({ retained: 'value' }), routePoints: ([{ x: 290.1, y: 70.2 }]).map(point => ({ kind: 'bend', point })), labelPosition: { x: 300, y: 65 } });
  run({type:'updateRelationshipMultiplicity',relationshipId:unknown.relationshipId,sourceMultiplicity:'',targetMultiplicity:'raw\r\ntext'});
  const state = store.snapshot;
  if (relationships) for (const type of ACCESS_TYPES) for (const source of items) for (const target of items) {
    importedRelationship(state, { viewId, relationshipType: type,
      source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId },
      label: `${type} <img onerror=x>` });
  }
  return { state, viewId, otherViewId, items, unknown };
}

/** Wider checked domain, with two deliberately forbidden imported drafts. */
export function extendedEndpointFixture() {
  const store=createStore(createProject('Synthetic expanded endpoint lifecycle'));
  const run=command=>store.execute(command,store.revision).created;
  const {viewId}=run({type:'createView',name:'Checked endpoint types'});
  const {viewId:otherViewId}=run({type:'createView',name:'Shared counterpart'});
  const items={};
  for(const [index,elementType] of CURRENT_CATALOG.elementTypes.entries()) {
    items[elementType]=run({type:'createElementAndOccurrence',viewId,elementType,name:`${elementType} <img onerror=x>`,documentation:'Kept\r\nexact',properties: propertyEntries({preserved:'text'}),bounds:{x:40+index%4*240,y:90+Math.floor(index/4)*200,width:180.1,height:85.2}});
    run({type:'addOccurrence',viewId:otherViewId,concept: { kind: 'element', id: items[elementType].elementId },bounds:{x:800-index%4*240,y:100+Math.floor(index/4)*200,width:180,height:90}});
  }
  const oldDrafts=[], state=store.snapshot;
  for(const [source,target]of [['Service','Process'],['Process','Function']]) {
    const edge=importedRelationship(state,{viewId,relationshipType:'Realization',source: { kind: 'occurrence', id: items[source].occurrenceId },target: { kind: 'occurrence', id: items[target].occurrenceId },label:'Existing draft <img onerror=x>',properties: propertyEntries({preserved:'must not rewrite'}),routePoints: ([{x:300.1,y:40.2}]).map(point => ({ kind: 'bend', point })),labelPosition:{x:310,y:30},sourceMultiplicity:'',targetMultiplicity:'1\r\nraw'});
    oldDrafts.push(edge);
  }
  return {state,viewId,otherViewId,items,oldDrafts};
}
