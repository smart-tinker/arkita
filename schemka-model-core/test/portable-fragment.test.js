import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, captureFragment, capturePortableFragment, readPortableFragment, portableFragmentInfo, exportFiles, importFiles, remapProject } from '../src/index.js';
import { newId } from '../src/format.js';
import { serializeFragmentText, deserializeFragmentText } from '../../schemka-model-io/src/fragment-file.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=';
const collections = { occurrence:'occurrences', connection:'connections', visualNode:'visualNodes', visualConnector:'visualConnectors' };
const all = view => Object.entries(collections).flatMap(([kind,key]) => view[key].map(item => ({ kind,id:item.id })));
const persisted = store => ({ files:store.exportFiles(), revision:store.revision, history:store.history });
function fixture() {
  const store = createStore(createProject('Portable source')), run = command => store.execute(command,store.revision).created;
  const viewId = run({ type:'createView',name:'Selected view' }).viewId, related = run({ type:'createView',name:'Referenced whole view' }).viewId, unrelated = run({ type:'createView',name:'Unrelated secret view' }).viewId;
  const a = run({ type:'createElementAndOccurrence',viewId,elementType:'ApplicationComponent',name:'A',bounds:{ x:0,y:0,width:140,height:80 } });
  const b = run({ type:'addOccurrence',viewId,concept:{ kind:'element',id:a.elementId },bounds:{ x:300,y:0,width:140,height:80 } });
  const anchorId = newId('anc'), line = run({ type:'createRelationshipAndConnection',viewId,relationshipType:'Association',label:'Internal',source:{ kind:'occurrence',id:a.occurrenceId },target:{ kind:'occurrence',id:b.occurrenceId },routePoints:[{ kind:'anchor',id:anchorId,point:{ x:220,y:70 } }],labelPosition:{ x:160,y:50 } });
  const assetId = run({ type:'createAsset',name:'Used',mediaType:'image/png',data:png }).assetId;
  run({ type:'createAsset',name:'Unused secret asset',mediaType:'image/png',data:png });
  const group = run({ type:'createVisualNode',viewId,kind:'group',name:'Container',bounds:{ x:0,y:160,width:300,height:220 } }).visualNodeId;
  run({ type:'createVisualNode',viewId,kind:'note',name:'Note',text:'Exact\r\n🙂',parent:{ kind:'visualNode',id:group },bounds:{ x:20,y:200,width:200,height:100 },style:{ image:{ assetId,fit:'contain',position:'center' },fontWeight:'bold' } });
  run({ type:'createVisualNode',viewId,kind:'viewReference',targetViewId:related,bounds:{ x:400,y:200,width:180,height:100 } });
  run({ type:'createVisualConnector',viewId,source:{ kind:'visualNode',id:group },target:{ kind:'connection',id:line.connectionId,anchorId },style:{ lineStyle:'orthogonal' } });
  run({ type:'createVisualNode',viewId:related,kind:'viewReference',targetViewId:viewId,bounds:{ x:0,y:0,width:180,height:100 } });
  run({ type:'createVisualNode',viewId:related,kind:'image',assetId,bounds:{ x:200,y:0,width:50,height:50 } });
  run({ type:'createVisualNode',viewId:unrelated,kind:'note',text:'Secret unrelated data',bounds:{ x:0,y:0,width:100,height:80 } });
  run({ type:'createFolder',name:'Do not copy model organization',members:[{ kind:'view',id:viewId },{ kind:'element',id:a.elementId }] });
  const state = store.snapshot, profileId = newId('prf');
  state.customizationProfiles = [{ id:profileId,name:'Image specialization',purpose:'specialization',targets:[{ kind:'element',type:'ApplicationComponent' }],attributes:{ idText:{ type:'String',default:a.elementId } },imageAssetId:assetId }];
  state.elements[0].profileApplications = [{ profileId,values:{ idText:a.elementId } }]; state.elements[0].properties = [{ key:'id',value:a.elementId },{ key:'id',value:assetId }];
  return { state,viewId,related,unrelated,assetId,a,b,group,profileId };
}

test('portable capture is detached and includes exact selected visuals, recursive view references, profile images and semantic closure only', () => {
  const f = fixture(), source = createStore(f.state), before = persisted(source), view = f.state.views.find(entry => entry.view.id === f.viewId);
  const fragment = capturePortableFragment(source.snapshot,f.viewId,all(view)), copied = readPortableFragment(fragment).state, info = portableFragmentInfo(fragment);
  assert.deepEqual(persisted(source),before); assert.equal(copied.views.length,2); assert.equal(copied.folders.length,0); assert.equal(copied.assets.length,1); assert.equal(copied.customizationProfiles.length,1); assert.equal(copied.elements.length,1);
  assert.equal(copied.views.find(entry => entry.view.id === f.related).view.name,'Referenced whole view'); assert.ok(!JSON.stringify(fragment).includes('Secret unrelated data')); assert.ok(!JSON.stringify(fragment).includes('Unused secret asset'));
  assert.deepEqual(info.referencedViews,['Referenced whole view']); assert.match(info.warnings.join(' '),/папок/); assert.match(info.warnings.join(' '),/целиком/); assert.ok(Object.isFrozen(fragment.files));
  assert.throws(() => { fragment.files[0].content = ''; },TypeError); assert.deepEqual(exportFiles(importFiles(fragment.files)),fragment.files);
  const text = serializeFragmentText(fragment); assert.deepEqual(serializeFragmentText(deserializeFragmentText(text)),text);
});

test('cross-model clone remaps concepts, profiles, assets, views, containers and all 4 drawing refs exactly once with one Undo', () => {
  const f = fixture(), view = f.state.views.find(entry => entry.view.id === f.viewId), fragment = capturePortableFragment(f.state,f.viewId,all(view));
  const target = createStore(createProject('Destination')), targetView = target.execute({ type:'createView',name:'Target' },target.revision).created.viewId;
  const before = persisted(target), result = target.execute({ type:'pastePortableFragment',viewId:targetView,fragment,dx:40,dy:50 },target.revision), after = target.snapshot;
  assert.equal(target.history.undo,before.history.undo+1); assert.equal(after.elements.length,1); assert.equal(after.relationships.length,1); assert.equal(after.customizationProfiles.length,1); assert.equal(after.assets.length,1); assert.equal(after.views.length,2);
  const main = after.views.find(entry => entry.view.id === targetView), related = after.views.find(entry => entry.view.id !== targetView), concept = after.elements[0];
  assert.ok(concept.id !== f.a.elementId); assert.deepEqual(concept.properties,f.state.elements[0].properties); assert.equal(concept.profileApplications[0].values.idText,f.a.elementId,'typed string values are opaque');
  assert.equal(concept.profileApplications[0].profileId,after.customizationProfiles[0].id); assert.equal(after.customizationProfiles[0].imageAssetId,after.assets[0].id);
  assert.equal(new Set(main.occurrences.map(item => item.concept.id)).size,1); assert.equal(Math.min(...main.occurrences.map(item => item.bounds.x)),40); assert.ok(main.occurrences.every(item => item.bounds.y === 50));
  const group = main.visualNodes.find(item => item.kind === 'group'), note = main.visualNodes.find(item => item.kind === 'note'); assert.deepEqual(note.parent,{ kind:'visualNode',id:group.id }); assert.equal(note.style.image.assetId,after.assets[0].id);
  assert.equal(main.visualNodes.find(item => item.kind === 'viewReference').targetViewId,related.view.id); assert.equal(related.visualNodes.find(item => item.kind === 'viewReference').targetViewId,targetView); assert.equal(related.visualNodes.find(item => item.kind === 'image').assetId,after.assets[0].id);
  const connector = main.visualConnectors[0], host = main.connections.find(item => item.id === connector.target.id); assert.ok(host); assert.ok(host.routePoints.some(point => point.id === connector.target.anchorId));
  assert.equal(result.created.occurrenceIds.length,2); assert.equal(result.created.visualNodeIds.length,3); assert.equal(result.created.viewIds.length,1);
  const saved = target.exportFiles(); target.undo(target.revision); assert.deepEqual(target.exportFiles(),before.files); target.redo(target.revision); assert.deepEqual(target.exportFiles(),saved);
});

test('independent clone never merges equal UUIDs/names, and remapping leaves user properties/profile values opaque', () => {
  const f = fixture(), fragment = capturePortableFragment(f.state,f.viewId,all(f.state.views[0])), target = createStore(f.state), beforeCount = target.snapshot.elements.length;
  target.execute({ type:'pastePortableFragment',viewId:f.unrelated,fragment,dx:0,dy:0 },target.revision); assert.equal(target.snapshot.elements.length,beforeCount+1);
  const mapped = remapProject(f.state), copied = mapped.snapshot.elements.find(item => item.id === mapped.ids[f.a.elementId]); assert.deepEqual(copied.properties,f.state.elements[0].properties); assert.equal(copied.profileApplications[0].values.idText,f.a.elementId); assert.equal(mapped.snapshot.customizationProfiles[0].attributes.idText.default,f.a.elementId);
});

test('portable invalid version, missing resource, unsupported native and out-of-bounds paste retain exact target/history', () => {
  const f = fixture(), valid = capturePortableFragment(f.state,f.viewId,all(f.state.views[0])), target = createStore(f.state);
  for (const mutate of [fragment => { fragment.version = 2; }, fragment => { fragment.files = fragment.files.filter(file => !file.path.startsWith('assets/')); }, fragment => { const head = fragment.files.find(file => file.path === 'schemka.json'); head.content = JSON.stringify({ ...JSON.parse(head.content), formatVersion:5 }); }]) {
    const fragment = structuredClone(valid); mutate(fragment); const before = persisted(target); assert.throws(() => target.execute({ type:'pastePortableFragment',viewId:f.unrelated,fragment,dx:0,dy:0 },target.revision)); assert.deepEqual(persisted(target),before);
  }
  const before = persisted(target); assert.throws(() => target.execute({ type:'pastePortableFragment',viewId:f.unrelated,fragment:valid,dx:1000000,dy:0 },target.revision)); assert.deepEqual(persisted(target),before);
  for (const text of ['ordinary text','ARKITA-FRAGMENT/2\nanything',serializeFragmentText(valid).replace('ARKITA-FRAGMENT/1\n','ARKITA-FRAGMENT/1\n../')]) assert.throws(() => deserializeFragmentText(text));
});

test('same-document Cut is one paste+delete transaction; stale and locked source leave source/destination unchanged', () => {
  const f = fixture(), store = createStore(f.state), fragment = captureFragment(f.state,f.viewId,[{ kind:'visualNode',id:f.group }]), before = persisted(store);
  store.execute({ type:'moveFragment',viewId:f.unrelated,fragment,mode:'reuse',dx:20,dy:20 },store.revision); const after = store.exportFiles();
  assert.ok(!store.snapshot.views[0].visualNodes.some(item => item.id === f.group)); assert.equal(store.snapshot.views.find(entry => entry.view.id === f.unrelated).visualNodes.length,3);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(),before.files); store.redo(store.revision); assert.deepEqual(store.exportFiles(),after);
  store.undo(store.revision); store.execute({ type:'updateVisualNode',viewId:f.viewId,nodeId:f.group,name:'Changed' },store.revision); const changed = persisted(store); assert.throws(() => store.execute({ type:'removeFragment',fragment },store.revision),{ code:'FRAGMENT_STALE' }); assert.deepEqual(persisted(store),changed);
  store.execute({ type:'setDrawingLocked',viewId:f.viewId,drawing:{ kind:'visualNode',id:f.group },locked:true },store.revision); const locked = captureFragment(store.snapshot,f.viewId,[{ kind:'visualNode',id:f.group }]), lockedBefore = persisted(store);
  assert.throws(() => store.execute({ type:'moveFragment',viewId:f.unrelated,fragment:locked,mode:'reuse',dx:0,dy:0 },store.revision),{ code:'DRAWING_LOCKED' }); assert.deepEqual(persisted(store),lockedBefore);
});
