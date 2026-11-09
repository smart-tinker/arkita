import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createProject,validateProject,exportFiles} from '../../schemka-model-core/src/index.js';
import {newId} from '../../schemka-model-core/src/format.js';
import {exportExchangeXml,importExchangeXml} from '../src/exchange-xml.js';
import {validateExchangeXml} from '../../electron/xml-validator.mjs';
const DOMParser=new JSDOM('').window.DOMParser;
function model(){const s=createProject('Кириллица & <xml>');s.project.documentation='A\r\nB';s.project.properties=[{key:'dup',value:'1'},{key:'dup',value:'2'}];s.elements=[{id:newId('el'),type:'ApplicationComponent',name:'Приложение',documentation:'',properties:[{key:'__proto__',value:'safe'}]}];const id=newId('view'),occ=newId('occ'),group=newId('vnd');s.views=[{view:{id,name:'Diagram',documentation:'',properties:[{key:'view',value:'x'}]},occurrences:[{id:occ,concept:{kind:'element',id:s.elements[0].id},bounds:{x:20,y:30,width:100,height:50},zIndex:0,parent:{kind:'visualNode',id:group},style:{fill:'#abcdef',stroke:'#123456',strokeWidth:2,fontFamily:'Arial',fontSize:12,fontWeight:'normal',textColor:'#010203'}}],connections:[],visualNodes:[{id:group,kind:'group',name:'Container',documentation:'Doc',properties:[],bounds:{x:0,y:0,width:200,height:200},zIndex:0,parent:null,style:{}}],visualConnectors:[]}];s.folders=[{id:newId('fld'),name:'Same',documentation:'',properties:[],parentFolderId:null,members:[{kind:'element',id:s.elements[0].id}]},{id:newId('fld'),name:'Same',documentation:'',properties:[],parentFolderId:null,members:[{kind:'view',id}]}];return validateProject(s);}
test('Exchange standard subset passes real XSD and roundtrips metadata, duplicates, folders, nested geometry and supported styles',async()=>{const s=model(),before=exportFiles(s),out=exportExchangeXml(s,{language:'ru'});try{await validateExchangeXml(out.bytes);}catch(e){console.error(e.diagnostics);throw e;}const result=importExchangeXml(out.bytes,{DOMParser,language:'ru'});assert.deepEqual(result.snapshot,s);assert.deepEqual(exportFiles(s),before);assert.match(result.losses[0],/UNKNOWN/);});
test('XML export requires explicit layer mapping and reports every unsupported drawing/profile field',async()=>{const s=model();s.elements[0].type='Service';assert.throws(()=>exportExchangeXml(s),/явно выберите/);const out=exportExchangeXml(s,{typeMap:{Service:'ApplicationService'},folders:false,metadata:{creator:'Автор & Co',rights:'<all>'}});await validateExchangeXml(out.bytes);const result=importExchangeXml(out.bytes,{DOMParser});assert.equal(result.snapshot.elements[0].type,'Service');assert.ok(result.losses.some(s=>s.includes('ApplicationService → Service')));assert.ok(result.snapshot.project.properties.some(p=>p.key==='dc:creator'&&p.value==='Автор & Co'));assert.match(out.losses.join('\n'),/Организация папок выключена/);assert.throws(()=>exportExchangeXml(s,{typeMap:{Service:'BusinessService'},language:'ru_XX'}),/Язык/);});
test('unsupported types, unresolved references, unknown fields and alternate languages never silently disappear',async()=>{const out=exportExchangeXml(model()),xml=new TextDecoder().decode(out.bytes);assert.throws(()=>importExchangeXml(xml.replace('ApplicationComponent','Constraint'),{DOMParser}),/утверждённого преобразования/);assert.throws(()=>importExchangeXml(xml.replace(/elementRef="[^"]+"/,'elementRef="missing"'),{DOMParser}),/неизвестный элемент/);const result=importExchangeXml(xml.replace('<name>Приложение</name>','<name xml:lang="en">App</name><name xml:lang="ru">Приложение</name>').replace('xsi:type="ApplicationComponent"','xsi:type="ApplicationComponent" foreign="value"'),{DOMParser,language:'ru'});assert.equal(result.snapshot.elements[0].name,'Приложение');assert.match(result.losses.join('\n'),/дополнительный язык en/);assert.match(result.losses.join('\n'),/@foreign/);});


test('Archi native v5 uses its own namespace/Ecore map, relative child geometry, ordered properties and explicit losses',async()=>{
 const {readFile}=await import('node:fs/promises'),{importArchiXml}=await import('../src/archi-native.js');const bytes=await readFile(new URL('./fixtures/archi-v5-synthetic.archimate',import.meta.url));const before=Buffer.from(bytes),r=importArchiXml(bytes,{DOMParser});validateProject(r.snapshot);assert.equal(r.snapshot.elements.length,2);assert.equal(r.snapshot.views.length,2);assert.equal(r.snapshot.elements[1].type,'Role');assert.deepEqual(r.snapshot.elements[0].properties,[{key:'dup',value:'1'},{key:'dup',value:'2'}]);assert.deepEqual(r.snapshot.views[0].occurrences[0].bounds,{x:120,y:130,width:100,height:50});assert.equal(r.snapshot.views[1].visualNodes[0].style.shape,'actor');assert.match(r.losses.join('\n'),/bendpoints/);assert.deepEqual(bytes,before);assert.equal(r.snapshot.folders.filter(f=>f.name==='Equal').length,2);
 assert.throws(()=>importArchiXml(bytes.toString().replace('version="5.0.0"','version="99.0"'),{DOMParser}),/Версия/);assert.throws(()=>importArchiXml(bytes.toString().replace('source="actor"','source="missing"'),{DOMParser}),/неизвестный концепт/);assert.throws(()=>importArchiXml(bytes.toString().replace('archimate:SketchModelActor','archimate:DiagramModelImage'),{DOMParser}),/drawing/);assert.throws(()=>importArchiXml(new Uint8Array([80,75,3,4]),{DOMParser}),/ZIP/);assert.throws(()=>importExchangeXml(bytes,{DOMParser}),/не .archimate/);
});


test('Exchange reports the lost view router by ID without changing the native model and still passes XSD', async () => {
  const s = model(); s.views[0].view.router = 'orthogonal';
  const before = exportFiles(s), out = exportExchangeXml(s);
  assert.deepEqual(out.losses.filter(message => message.includes(': router ')), [`${s.views[0].view.id}: router не переносится в Exchange.`]);
  assert.deepEqual(exportFiles(s), before);
  await validateExchangeXml(out.bytes);
  const result = importExchangeXml(out.bytes, { DOMParser }), expected = structuredClone(s);
  delete expected.views[0].view.router;
  assert.deepEqual(result.snapshot, expected);
  assert.deepEqual(exportFiles(s), before);
});
