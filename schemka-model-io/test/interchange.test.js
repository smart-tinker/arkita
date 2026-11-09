import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, validateProject } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { previewNativeMerge, remapProject, extractViewProject } from '../src/model-transfer.js';
import { exportCSV, parseCSV, previewCSVImport } from '../src/csv.js';
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

test('remapping includes anchors, typed refs, view references, profiles and preserves ID-looking user text', () => {
 const state=graph(), entry=state.views[0]; state.project.documentation=state.elements[0].id; entry.visualNodes.push({id:fixtureId('vnd',1),kind:'viewReference',targetViewId:state.views[1].view.id,name:'Next',documentation:'',properties:[],bounds:{x:0,y:0,width:60,height:40},parent:null,zIndex:0,style:{}});
 const a=remapProject(state),b=remapProject(state); validateProject(a.snapshot); assert.notEqual(a.snapshot.project.id,b.snapshot.project.id); assert.equal(a.snapshot.project.documentation,state.elements[0].id); assert.equal(a.snapshot.views[0].visualNodes[0].targetViewId,a.ids[state.views[1].view.id]); assert.equal(a.snapshot.views[0].connections[0].routePoints[1].id,a.ids[state.views[0].connections[0].routePoints[1].id]);
});

test('CSV canonical set roundtrips Unicode/newlines/duplicate keys/relationship endpoints for each delimiter and BOM', () => {
 const source=portableGraph(); source.views=[];
 for(const delimiter of [',',';','\t']) for(const bom of [false,true]) { const exported=exportCSV(source,{delimiter,bom}); const preview=previewCSVImport(createProject('New'),exported.files,{delimiter,modelMetadata:true}); assert.deepEqual(preview.snapshot.elements,source.elements); assert.deepEqual(preview.snapshot.relationships,source.relationships); assert.deepEqual(preview.snapshot.junctions,source.junctions); assert.equal(preview.snapshot.project.name,source.project.name); }
 const original=exportFiles(source); exportCSV(source,{spreadsheet:true,flatten:true}); assert.deepEqual(exportFiles(source),original);
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
 const newFile=table('elements',['id','type','name'],[['','Service','Created'],['','NoSuchType','Bad']]); assert.throws(()=>previewCSVImport(source,[newFile]), /каталоге/); assert.deepEqual(exportFiles(source),before);
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
 const source=portableGraph(), entry=source.views[0]; entry.view.kind='canvas'; entry.view.background='#f0f0f0'; entry.visualNodes.push({id:fixtureId('vnd',1),kind:'note',name:'Card',text:'Hello',instruction:'Fill',locked:true,documentation:'Note',properties:[{key:'tag',value:'a'}],bounds:{x:10,y:10,width:60,height:40},parent:null,zIndex:0,style:{fill:'#ffffff'}});
 const template=createTemplate(source,{name:'Board',kind:'board',viewId:entry.view.id}); const target=createProject('Target'),a=insertBoardTemplate(target,template),b=insertBoardTemplate(a.snapshot,template); assert.equal(a.snapshot.views[0].visualNodes[0].locked,true); assert.notEqual(a.viewId,b.viewId); assert.equal(b.snapshot.views.length,2); const store=createStore(target); store.execute({type:'applyProjectSnapshot',files:exportFiles(a.snapshot)},0); store.undo(store.revision); assert.deepEqual(store.exportFiles(),exportFiles(target));
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
