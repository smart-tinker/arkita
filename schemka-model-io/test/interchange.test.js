import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, validateProject } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { previewNativeMerge, remapProject, extractViewProject } from '../src/model-transfer.js';
import { exportCSV, parseCSV, previewCSVImport } from '../src/csv.js';
import { CURRENT_PROFILE, createRegistry, assessProject } from '../../schemka-model-profiles/src/index.js';
import { exportXLSX } from '../src/xlsx.js';
import { createTemplate, readTemplate, serializeTemplate, instantiateTemplate, insertBoardTemplate, insertPatternTemplate, createTemplateLibrary, templatePreviewSVG } from '../src/templates.js';
const enc = new TextEncoder(), dec = new TextDecoder();
function graph() { const state = conceptProject(); state.elements[0].properties = [{ key: 'tag', value: 'a' }, { key: 'tag', value: 'b' }, { key: '__proto__', value: 'safe' }]; state.elements[0].name = ' 001🙂'; state.elements[0].documentation = '#text\r\n\r\n"quoted";\t=not formula'; return state; }
function portableGraph() { const s=graph(); s.junctions=[]; s.relationships=s.relationships.slice(0,1); s.views[0].occurrences=s.views[0].occurrences.slice(0,2); s.views[0].connections=s.views[0].connections.slice(0,1); return s; }
const table = (name, header, rows) => ({ name: `${name}.csv`, bytes: enc.encode([['arkita-csv','1',name,'canonical'], header, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n')) });

test('native preview is detached, scoped, duplicate-property-safe, all-or-none and one undo', () => {
 const target = graph(), source = structuredClone(target); source.elements[0].name = 'Imported'; source.elements[0].properties = [{ key:'tag',value:'c' },{ key:'tag',value:'d' }]; source.project.name = 'Incoming title'; source.elements.pop(); source.views = []; source.relationships = []; source.junctions = [];
 const before = exportFiles(target), preview = previewNativeMerge(target, source, { properties: 'merge' }); assert.equal(preview.snapshot.project.name,target.project.name); assert.equal(preview.snapshot.elements.length,2); assert.equal(preview.snapshot.elements[0].name,'Imported'); assert.deepEqual(preview.snapshot.elements[0].properties,[{key:'__proto__',value:'safe'},{key:'tag',value:'c'},{key:'tag',value:'d'}]); assert.deepEqual(exportFiles(target),before);
 const store = createStore(target); store.execute({type:'applyProjectSnapshot',files:exportFiles(preview.snapshot)},store.revision); assert.equal(store.history.undo,1); store.undo(store.revision); assert.deepEqual(store.exportFiles(),before);
 assert.equal(previewNativeMerge(target,target).unchanged,true); assert.equal(previewNativeMerge(target,source,{updateExisting:false}).unchanged,true);
 source.elements[0].type='Process'; assert.throws(()=>previewNativeMerge(target,source), /не меняет тип/);
});

test('native merge rejects an occurrence ID collision across view paths without changing bytes or history', () => {
 const target = graph(), source = structuredClone(target), collisionId = target.views[0].occurrences[0].id;
 source.views[0].view.id = fixtureId('view', 99); validateProject(source);
 const store = createStore(target), incoming = store.snapshot;
 const before = store.exportFiles(), incomingBefore = exportFiles(incoming), sourceBefore = exportFiles(source), history = store.history, revision = store.revision;
 assert.throws(() => previewNativeMerge(incoming, source), error => error.code === 'IMPORT_COLLISION' && error.message.includes(collisionId));
 assert.deepEqual(store.exportFiles(), before); assert.deepEqual(exportFiles(incoming), incomingBefore); assert.deepEqual(exportFiles(source), sourceBefore);
 assert.deepEqual(store.history, history); assert.equal(store.revision, revision);
});

test('native preview separates retained target records from skipped incoming scope', () => {
 const targetStore = createStore(graph()), targetFolderId = targetStore.execute({ type: 'createFolder', name: 'Local folder' }, targetStore.revision).created.folderId;
 const target = structuredClone(targetStore.snapshot), sourceStore = createStore(target), incomingFolderId = sourceStore.execute({ type: 'createFolder', name: 'Incoming-only folder' }, sourceStore.revision).created.folderId;
 const source = structuredClone(sourceStore.snapshot); source.project.name = 'Incoming model'; source.elements[0].name = 'Incoming element'; source.folders.find(item => item.id === targetFolderId).name = 'Incoming folder';
 const before = exportFiles(target), preview = previewNativeMerge(target, source, { modelMetadata: false, folders: false, updateExisting: false });
 assert.equal(preview.unchanged, true); assert.deepEqual(exportFiles(preview.snapshot), before);
 for (const [kind, id, label, reason] of [['project', target.project.id, target.project.name, 'modelMetadata'], ['folder', targetFolderId, 'Local folder', 'folders'], ['element', target.elements[0].id, target.elements[0].name, 'updateExisting']]) {
  assert.ok(preview.kept.some(item => item.kind === kind && item.id === id && item.targetId === id && item.label === label && item.reason === reason), `target ${kind} ${id} is shown as retained`);
 }
 for (const [kind, id, label, reason, targetId] of [['project', source.project.id, source.project.name, 'modelMetadata', target.project.id], ['folder', targetFolderId, 'Incoming folder', 'folders', targetFolderId], ['folder', incomingFolderId, 'Incoming-only folder', 'folders', null], ['element', source.elements[0].id, 'Incoming element', 'updateExisting', target.elements[0].id]]) {
  assert.ok(preview.skipped.some(item => item.kind === kind && item.sourceId === id && item.label === label && item.reason === reason && item.targetId === targetId), `incoming ${kind} ${id} is shown as skipped with its target`);
 }
 assert.ok(!preview.kept.some(item => item.id === incomingFolderId), 'an incoming-only skipped folder is not reported as a retained target');
});

test('native skipped folders keep source, remapped and existing target IDs distinct', () => {
 const targetStore = createStore(createProject('Local model')), targetFolderId = targetStore.execute({ type: 'createFolder', name: 'Local folder' }, targetStore.revision).created.folderId;
 const target = structuredClone(targetStore.snapshot), source = structuredClone(target); source.project.name = 'Incoming model'; source.folders[0].name = 'Incoming folder';
 const preview = previewNativeMerge(target, source, { ids: 'remap', folders: false, modelMetadata: true }), skipped = preview.skipped?.find(item => item.kind === 'folder');
 assert.ok(skipped, 'incoming folder is listed as skipped'); assert.equal(skipped.sourceId, source.folders[0].id); assert.equal(skipped.mappedId, preview.ids[source.folders[0].id]); assert.notEqual(skipped.mappedId, skipped.sourceId); assert.equal(skipped.targetId, null);
 assert.ok(preview.kept.some(item => item.kind === 'folder' && item.targetId === targetFolderId && item.id === targetFolderId), 'the existing target folder is listed separately');
});

test('remapping includes anchors, typed refs, view references, profiles and preserves ID-looking user text', () => {
 const state=graph(), entry=state.views[0]; state.project.documentation=state.elements[0].id; entry.visualNodes.push({id:fixtureId('vnd',1),kind:'viewReference',targetViewId:state.views[1].view.id,name:'Next',documentation:'',properties:[],bounds:{x:0,y:0,width:60,height:40},parent:null,zIndex:0,style:{}});
 const a=remapProject(state),b=remapProject(state); validateProject(a.snapshot); assert.notEqual(a.snapshot.project.id,b.snapshot.project.id); assert.equal(a.snapshot.project.documentation,state.elements[0].id); assert.equal(a.snapshot.views[0].visualNodes[0].targetViewId,a.ids[state.views[1].view.id]); assert.equal(a.snapshot.views[0].connections[0].routePoints[1].id,a.ids[state.views[0].connections[0].routePoints[1].id]);
});

test('CSV canonical set roundtrips Unicode/newlines/duplicate keys/relationship endpoints for each delimiter and BOM', () => {
 const source=portableGraph(); source.views=[];
 for(const delimiter of [',',';','\t']) for(const bom of [false,true]) { const exported=exportCSV(source,{delimiter,bom}); const preview=previewCSVImport(createProject('New'),exported.files,{delimiter,modelMetadata:true}); assert.deepEqual(preview.snapshot.elements,source.elements); assert.deepEqual(preview.snapshot.relationships,source.relationships); assert.deepEqual(preview.snapshot.junctions,source.junctions); assert.equal(preview.snapshot.project.name,source.project.name); }
 const original=exportFiles(source); exportCSV(source,{spreadsheet:true,flatten:true}); assert.deepEqual(exportFiles(source),original);
});

test('CSV roundtrip preserves notation relationship types, IDs, endpoint kinds, raw multiplicities and profile applications', () => {
 const id = fixtureId, state = createProject('Notation fields');
 state.project.id = id('prj', 500);
 state.elements = [['Grouping', 1], ['Service', 2], ['DataObject', 3]].map(([type, number]) => ({ id: id('el', 500 + number), type, name: type, documentation: '', properties: [] }));
 state.junctions = ['AndJunction', 'OrJunction'].map((type, index) => ({ id: id('jct', 500 + index), type, name: type, documentation: '', properties: [], ...(index === 0 ? { profileApplications: [{ profileId, values: {} }] } : {}) }));
 state.customizationProfiles = [{ id: profileId, ...profileDefinition() }];
 const ref = (kind, number) => ({ kind, id: id(kind === 'element' ? 'el' : kind === 'junction' ? 'jct' : 'rel', number) });
 const service = ref('element', 502), data = ref('element', 503), group = ref('element', 501), and = ref('junction', 500);
 const rows = [
  { type: 'Association', source: service, target: service, sourceMultiplicity: '', targetMultiplicity: ' raw\r\n value ' },
  { type: 'DirectedAssociation', source: service, target: service },
  { type: 'Access', source: service, target: data, sourceMultiplicity: '0..1' },
  { type: 'ReadAccess', source: service, target: data, targetMultiplicity: '' },
  { type: 'WriteAccess', source: service, target: data },
  { type: 'ReadWriteAccess', source: service, target: data },
  { type: 'Influence', source: service, target: group },
  { type: 'Aggregation', source: group, target: and, junctionRole: 'container' },
  { type: 'Association', source: ref('relationship', 700), target: service },
 ];
 state.relationships = rows.map((row, index) => ({ id: id('rel', 700 + index), label: `Relation ${index}`, documentation: '', properties: [], profileApplications: [{ profileId, values: {} }], ...row }));
 validateProject(state);
 const imported = previewCSVImport(createProject('Target'), exportCSV(state).files).snapshot;
 const plain = value => JSON.parse(JSON.stringify(value));
 assert.deepEqual(plain(imported.relationships), state.relationships);
 assert.deepEqual(plain(imported.elements), state.elements); assert.deepEqual(plain(imported.junctions), state.junctions);
 assert.deepEqual(plain(imported.customizationProfiles), state.customizationProfiles);
 for (let index = 0; index < rows.length; index++) for (const end of ['source', 'target']) {
  const field = `${end}Multiplicity`;
  assert.equal(Object.hasOwn(imported.relationships[index], field), Object.hasOwn(rows[index], field), `${index}:${field} presence`);
 }
});

test('CSV parser preserves # values, handles explicit comments, bounds malformed input and physical row numbers', () => {
 assert.deepEqual(parseCSV('#arkita-comment ignored\r\n"#arkita-comment data",x\r\n#value,y\r\n"a\r\nb",c').map(x=>x.values), [['#arkita-comment data','x'],['#value','y'],['a\r\nb','c']]);
 assert.throws(()=>parseCSV('a,b\n"unterminated',{name:'bad.csv'}),error=>error.file==='bad.csv'&&error.row===2); assert.throws(()=>parseCSV('"a"suffix,b'),/кавычки/); assert.throws(()=>parseCSV(new Uint8Array([0xff])),/UTF-8/);
 const file=exportCSV(graph(),{spreadsheet:true}).files[0]; assert.throws(()=>previewCSVImport(graph(),[file]),/канонический/);
});

test('CSV partial update never deletes absent data, rejects repeated IDs and changing type before commit', () => {
 const source=graph(), id=source.elements[0].id; const file=table('elements',['id','name'],[[id,'Updated']]); const result=previewCSVImport(source,[file]); assert.equal(result.snapshot.elements[0].documentation,source.elements[0].documentation); assert.equal(result.snapshot.relationships.length,source.relationships.length); assert.equal(result.changes.length,1);
 assert.equal(previewCSVImport(result.snapshot,[file]).unchanged,true);
 assert.throws(()=>previewCSVImport(source,[table('elements',['id','name'],[[id,'A'],[id,'B']])]),error=>error.row===4&&error.field==='id');
 assert.throws(()=>previewCSVImport(source,[table('elements',['id','type'],[[id,'Process']])]),error=>error.field==='type');
 assert.throws(()=>previewCSVImport(source,[table('relationships',['id','sourceKind','sourceId'],[[source.relationships[0].id,'element','missing']])]),error=>error.field==='source');
 assert.deepEqual(source,graph());
});

test('CSV rejects drawing-inconsistent endpoint edits and invalid rows late in a package without mutations', () => {
 const source=graph(), before=exportFiles(source); const file=table('relationships',['id','sourceKind','sourceId'],[[source.relationships[0].id,'element',source.elements[1].id]]);
 assert.throws(()=>previewCSVImport(source,[file]), /рисунки/); assert.deepEqual(exportFiles(source),before);
 const connection=source.views.flatMap(view=>view.connections).find(item=>item.relationshipId===source.relationships[0].id),wrong=source.views.flatMap(view=>view.occurrences).find(item=>item.concept.id!==source.elements[1].id),bindings=Object.fromEntries(source.views.flatMap(view=>view.connections.filter(item=>item.relationshipId===connection.relationshipId).map(item=>[item.id,{kind:'occurrence',id:wrong.id}])));
 assert.throws(()=>previewCSVImport(source,[file],{relationshipBindings:{[connection.relationshipId]:{source:bindings}}}),/ссылаться на выбранный/);assert.deepEqual(exportFiles(source),before);
 const newFile=table('elements',['id','type','name'],[['','Service','Created'],['','NoSuchType','Bad']]); assert.throws(()=>previewCSVImport(source,[newFile]), /каталоге/); assert.deepEqual(exportFiles(source),before);
});

test('CSV validates a two-end relationship rebind atomically against the valid final pair', () => {
 const store=createStore(createProject('Atomic CSV relationship rebind')),run=command=>store.execute(command,store.revision).created,viewId=run({type:'createView',name:'Main'}).viewId;
 const concepts={}; for(const [key,type,x] of [['process','Process',0],['service','Service',250],['data','DataObject',500],['business','BusinessObject',750]]) concepts[key]=run({type:'createElementAndOccurrence',viewId,elementType:type,name:type,bounds:{x,y:0,width:120,height:60}});
 const relation=run({type:'createRelationshipAndConnection',viewId,relationshipType:'Realization',source:{kind:'occurrence',id:concepts.process.occurrenceId},target:{kind:'occurrence',id:concepts.service.occurrenceId},label:'Realizes'}),state=store.snapshot,registry=createRegistry([CURRENT_PROFILE]),connection=state.views[0].connections.find(item=>item.id===relation.connectionId),before=exportFiles(state);
 const status=snapshot=>assessProject(snapshot,registry).relationships.find(item=>item.relationshipId===relation.relationshipId).status;
 assert.equal(status(state),'ALLOWED');
 for(const [sourceId,targetId] of [[concepts.data.elementId,concepts.service.elementId],[concepts.process.elementId,concepts.business.elementId]]) {
  const intermediate=structuredClone(state),item=intermediate.relationships.find(record=>record.id===relation.relationshipId),line=intermediate.views[0].connections.find(record=>record.id===connection.id),source=Object.values(concepts).find(value=>value.elementId===sourceId),target=Object.values(concepts).find(value=>value.elementId===targetId);
  item.source.id=sourceId;item.target.id=targetId;line.source={kind:'occurrence',id:source.occurrenceId};line.target={kind:'occurrence',id:target.occurrenceId};
  assert.equal(status(intermediate),'FORBIDDEN');
 }
 const file=table('relationships',['id','type','sourceKind','sourceId','targetKind','targetId'],[[relation.relationshipId,'Realization','element',concepts.data.elementId,'element',concepts.business.elementId]]);
 const bindings={[relation.relationshipId]:{
  source:{[connection.id]:{kind:'occurrence',id:concepts.data.occurrenceId}},
  target:{[connection.id]:{kind:'occurrence',id:concepts.business.occurrenceId}},
 }};
 const preview=previewCSVImport(state,[file],{relationshipBindings:bindings});
 assert.equal(status(preview.snapshot),'ALLOWED');
 assert.deepEqual(preview.snapshot.relationships.find(item=>item.id===relation.relationshipId).source,{kind:'element',id:concepts.data.elementId});
 assert.deepEqual(preview.snapshot.relationships.find(item=>item.id===relation.relationshipId).target,{kind:'element',id:concepts.business.elementId});
 const rebound=preview.snapshot.views[0].connections.find(item=>item.id===connection.id);
 assert.deepEqual(rebound.source,bindings[relation.relationshipId].source[connection.id]);
 assert.deepEqual(rebound.target,bindings[relation.relationshipId].target[connection.id]);
 assert.deepEqual(exportFiles(state),before);
 const locked=createStore(state);locked.execute({type:'setDrawingLocked',viewId,drawing:{kind:'connection',id:connection.id},locked:true},locked.revision);const lockedBefore=locked.exportFiles();
 assert.throws(()=>previewCSVImport(locked.snapshot,[file],{relationshipBindings:bindings}),/lock|заблок/i);
 assert.deepEqual(locked.exportFiles(),lockedBefore);
});

test('CSV properties require exact positions and explicit replace versus merge', () => {
 const source=graph(),id=source.elements[0].id, file=table('properties',['kind','id','position','key','value'],[['element',id,'0','tag','X'],['element',id,'1','tag','Y']]);
 assert.deepEqual(previewCSVImport(source,[file]).snapshot.elements[0].properties,[{key:'tag',value:'X'},{key:'tag',value:'Y'}]); assert.equal(previewCSVImport(source,[file],{properties:'merge'}).snapshot.elements[0].properties[0].key,'__proto__');
 assert.throws(()=>previewCSVImport(source,[table('properties',['kind','id','position','key','value'],[['element',id,'1','tag','X']])]),/без пропусков/);
});

function unzip(bytes) { const result=new Map(), view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); let at=0; while(view.getUint32(at,true)===0x04034b50){ const size=view.getUint32(at+18,true),n=view.getUint16(at+26,true),e=view.getUint16(at+28,true); assert.equal(view.getUint16(at+8,true),0); const name=dec.decode(bytes.slice(at+30,at+30+n)); result.set(name,dec.decode(bytes.slice(at+30+n+e,at+30+n+e+size))); at+=30+n+e+size; } assert.equal(view.getUint32(at,true),0x02014b50); return result; }
test('XLSX stores formula-looking and zero-prefixed values as inline strings; counts match real rows', () => {
 const source=graph(); source.elements[0].name='=HYPERLINK("https://example.invalid")'; source.elements[1].name='0001'; const before=exportFiles(source),result=exportXLSX(source),files=unzip(result.bytes);
 const sheets=[...files].filter(([name])=>name.startsWith('xl/worksheets/')).map(([,text])=>text).join(''); assert.match(sheets,/t="inlineStr"/); assert.match(sheets,/0001/); assert.match(sheets,/=HYPERLINK/); assert.doesNotMatch(sheets,/<f[ >]/); assert.equal(result.counts.relationships,source.relationships.length); assert.equal(result.counts.elements,2); assert.deepEqual(exportFiles(source),before);
 source.elements[0].name='bad\u0001'; assert.throws(()=>exportXLSX(source),/XML 1.0/);
});

test('template codec rejects duplicate/enlarged/future envelopes; two instances have independent native IDs', () => {
 const source=graph(), template=createTemplate(source,{name:'Review',description:'Описание',categories:['Architecture']}); const bytes=serializeTemplate(template), loaded=readTemplate(bytes); assert.deepEqual(exportFiles(loaded.snapshot),exportFiles(source));
 const a=instantiateTemplate(loaded),b=instantiateTemplate(loaded); assert.notEqual(a.snapshot.project.id,b.snapshot.project.id); a.snapshot.elements[0].name='Only A'; assert.equal(loaded.snapshot.elements[0].name,source.elements[0].name); assert.notEqual(a.snapshot.elements[0].id,b.snapshot.elements[0].id);
 assert.throws(()=>readTemplate(dec.decode(bytes).replace('"version":1','"version":2')), /версия/); assert.throws(()=>readTemplate(dec.decode(bytes).replace('"version":1','"version":1,"version":1')), /повторное/); assert.throws(()=>readTemplate('{"format":[]}'),/строка/);
});

test('board templates retain references and visual records and insert independent drawings with one Undo', () => {
 const source=portableGraph(), entry=source.views[0]; entry.view.kind='canvas'; entry.view.background='#f0f0f0'; entry.visualNodes.push({id:fixtureId('vnd',1),kind:'note',name:'Card',text:'Hello',instruction:'**Fill**\n\nUse the saved template.',locked:true,documentation:'Note',properties:[{key:'tag',value:'a'}],bounds:{x:10,y:10,width:60,height:40},parent:null,zIndex:0,style:{fill:'#ffffff'}});
 const template=createTemplate(source,{name:'Board',kind:'board',viewId:entry.view.id}),portable=readTemplate(serializeTemplate(template)); assert.equal(portable.snapshot.views[0].visualNodes[0].instruction,entry.visualNodes[0].instruction); const target=createProject('Target'),a=insertBoardTemplate(target,portable),b=insertBoardTemplate(a.snapshot,portable); assert.equal(a.snapshot.views[0].visualNodes[0].locked,true); assert.notEqual(a.viewId,b.viewId); assert.equal(b.snapshot.views.length,2); const store=createStore(target); store.execute({type:'applyProjectSnapshot',files:exportFiles(a.snapshot)},0); store.undo(store.revision); assert.deepEqual(store.exportFiles(),exportFiles(target));
 const svg=templatePreviewSVG(template.snapshot,entry.view.id); assert.match(svg, /Hello/); assert.doesNotMatch(svg,/<script/);
});

test('template library categories persist independently; failed quota write preserves prior collection', () => {
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},library=createTemplateLibrary(storage),template=createTemplate(graph(),{name:'One',categories:['A','B']}); library.put(template); library.category('A','C'); assert.deepEqual(createTemplateLibrary(storage).list().templates[0].metadata.categories,['C','B']); library.category('C',null); assert.equal(library.list().templates.length,1); const before=data.get('arkita.templates.v1'); storage.setItem=()=>{throw Error('quota')}; assert.throws(()=>library.remove(template.metadata.id),/quota/); assert.equal(data.get('arkita.templates.v1'),before);
});


test('pattern templates capture only selected data and choose clone versus exact-ID reuse explicitly', () => {
 const source=portableGraph(), viewId=source.views[0].view.id, selected=source.views[0].occurrences.map(item=>({kind:'occurrence',id:item.id}));
 const template=createTemplate(source,{name:'Pattern',kind:'pattern',viewId,selection:selected});assert.equal(template.snapshot.views.length,1);assert.equal(template.metadata.sourceViewId,viewId);
 const cloned=insertPatternTemplate(source,template,viewId,{concepts:'new',dx:0,dy:0});assert.equal(cloned.snapshot.elements.length,source.elements.length*2);assert.equal(cloned.snapshot.views.length,source.views.length);assert.equal(cloned.snapshot.views[0].occurrences.length,4);
 const reused=insertPatternTemplate(source,template,viewId,{concepts:'reuse',dx:0,dy:0});assert.equal(reused.snapshot.elements.length,source.elements.length);assert.equal(reused.snapshot.views[0].occurrences.length,4);assert.deepEqual(reused.snapshot.elements,source.elements);
 assert.throws(()=>insertPatternTemplate(source,template,viewId,{dx:NaN}),/сетке/);
});


test('pattern reuse refuses a destination viewpoint that hides inserted drawings; library category overflow is atomic',()=>{
 const source=portableGraph(),viewId=source.views[0].view.id,selected=source.views[0].occurrences.map(item=>({kind:'occurrence',id:item.id})),template=createTemplate(source,{name:'Pattern',kind:'pattern',viewId,selection:selected});const target=structuredClone(source),vpt=fixtureId('vpt',99);target.viewpoints=[{id:vpt,name:'Filtered',documentation:'',stakeholders:['Reader'],concerns:['Application'],purpose:['informing'],content:['details'],selection:{elementTypes:['ApplicationComponent'],junctionTypes:[],relationshipTypes:['Association']},representation:{kind:'diagram',notation:'archimate',labels:'name-and-type'}}];target.views[0].view.viewpointId=vpt;validateProject(target);const before=exportFiles(target);assert.throws(()=>insertPatternTemplate(target,template,viewId,{concepts:'reuse',dx:0,dy:0}),/Viewpoint/);assert.deepEqual(exportFiles(target),before);
 let raw=null;const library=createTemplateLibrary({getItem:()=>raw,setItem:(_,value)=>{raw=value;}});for(let i=0;i<64;i++)library.category(`Category ${i}`);const previous=raw;assert.throws(()=>library.category('Overflow'),/64/);assert.equal(raw,previous);assert.equal(library.list().categories.length,64);
});


test('board extraction includes profiles referenced only by legend color overrides and remaps them in templates',()=>{
 const store=createStore(createProject('Legend only')),run=command=>store.execute(command,store.revision),viewId=run({type:'createView',name:'Legend board'}).created.viewId,profileId=run({type:'createCustomizationProfile',definition:{name:'Special',purpose:'specialization',targets:[{kind:'element',type:'Role'}],attributes:{}}}).created.profileId;
 run({type:'createVisualNode',viewId,kind:'legend',name:'Legend',legend:{sort:'name',columns:1,showRelationships:false,colors:[{profileId,color:'#123456'}]},bounds:{x:0,y:0,width:200,height:100}});
 const before=store.exportFiles(),extracted=extractViewProject(store.snapshot,viewId);assert.equal(extracted.customizationProfiles[0].id,profileId);validateProject(extracted);const mapped=remapProject(extracted);assert.equal(mapped.snapshot.views[0].visualNodes[0].legend.colors[0].profileId,mapped.ids[profileId]);validateProject(mapped.snapshot);assert.deepEqual(store.exportFiles(),before);
});
