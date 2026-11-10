import { connectionGeometry,routePointAt } from '../src/connection-geometry.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { crossingPaths,unionRectangles,clippingPath } from '../src/connection-presentation.js';
import { createProject,createStore,exportFiles } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile,deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { applyDrawingGeometryStyles } from '../src/visual-drawings.js';
import { assertSvgExport,exportViewSvg } from '../src/svg-export.js';
const line=(key,d,extra={})=>({key,d,crossing:'jump',...extra});
const horizontal=line('connection:a','M 0 100 L 200 100'),vertical=line('visualConnector:b','M 100 0 L 100 200');
test('crossing bridges are deterministic decorations; real endpoints and anchor junctions never become jumps',()=>{
 const before=structuredClone([horizontal,vertical]),a=crossingPaths(before),b=crossingPaths([...before].reverse());assert.deepEqual(a.paths,b.paths);assert.equal(a.paths.has(vertical.key),true);assert.equal(a.paths.has(horizontal.key),false);assert.match(a.paths.get(vertical.key),/ C /);assert.match(a.paths.get(vertical.key),/^M 100 0 /);assert.match(a.paths.get(vertical.key),/L 100 200$/);assert.deepEqual(before,[horizontal,vertical]);
 assert.equal(crossingPaths([horizontal,line('connection:c','M 100 0 L 100 100')]).paths.size,0);
 assert.equal(crossingPaths([{...horizontal,anchors:[{x:100,y:100}]},vertical]).paths.size,0);
 assert.equal(crossingPaths([{...horizontal,crossing:'none'},{...vertical,crossing:'none'}]).paths.size,0);
 const cubic=line('visualConnector:z','M 100 0 C 130 60, 70 140, 100 200');assert.match(crossingPaths([horizontal,cubic]).paths.get(cubic.key),/ C /);
 const limited=crossingPaths([horizontal,vertical],{maxComparisons:0});assert.equal(limited.limited,true);assert.equal(limited.paths.size,0);
});
test('overlapping clip labels produce a disjoint union, retaining the entire hole including overlap',()=>{
 const input=[{x:0,y:0,width:20,height:20},{x:10,y:10,width:20,height:20},{x:5,y:5,width:10,height:10}],pieces=unionRectangles(input);assert.equal(pieces.reduce((area,box)=>area+box.width*box.height,0),700);
 const inside=(p,r)=>p.x>r.x&&p.x<r.x+r.width&&p.y>r.y&&p.y<r.y+r.height;
 for(let x=.5;x<32;x++)for(let y=.5;y<32;y++){const p={x,y},count=pieces.filter(rect=>inside(p,rect)).length;assert.equal(count,input.some(rect=>inside(p,rect))?1:0);}
 assert.match(clippingPath(input),/^M -4000000 -4000000 /);assert.equal(input[0].width,20);
});
function domFixture(t){const dom=new JSDOM('<svg xmlns="http://www.w3.org/2000/svg" id="canvas" viewBox="0 0 220 220"><defs><marker id="notation-canvas-end"><path d="M 0 0 L 1 1"/></marker></defs><g class="connection" data-kind="connection" data-id="a"><path class="line-hit" d="M 0 100 L 200 100"/><path class="line" d="M 0 100 L 200 100" marker-end="url(#notation-canvas-end)"/><text class="relationship-label" x="100" y="90">Подпись 🙂</text></g><g class="connection" data-kind="visualConnector" data-id="b"><path class="line-hit" d="M 100 0 L 100 200"/><path class="line" d="M 100 0 L 100 200"/><text class="relationship-label" x="100" y="100">Вторая</text></g></svg>',{pretendToBeVisual:true});t.after(()=>dom.window.close());const document=dom.window.document,canvas=document.getElementById('canvas'),view={view:{background:'#ddeeff'},occurrences:[],visualNodes:[],connections:[{id:'a',style:{labelBackgroundMode:'clip'},routePoints:[]}],visualConnectors:[{id:'b',style:{labelBackgroundMode:'clip'},routePoints:[]}]};canvas.style.backgroundColor='#ddeeff';for(const label of canvas.querySelectorAll('text'))label.getBBox=()=>({x:75,y:Number(label.getAttribute('y'))-12,width:70,height:16});return{dom,canvas,view};}
test('clipping/opaque/transparent labels share preview/export and never rewrite hit paths or model geometry',t=>{
 const h=domFixture(t),before=structuredClone(h.view),hit=[...h.canvas.querySelectorAll('.line-hit')].map(item=>item.getAttribute('d'));applyDrawingGeometryStyles(h.canvas,h.view);const clip=h.canvas.querySelector('clipPath');assert.ok(clip);assert.equal(clip.firstElementChild.getAttribute('clip-rule'),'evenodd');for(const path of h.canvas.querySelectorAll('.line')){assert.equal(path.getAttribute('clip-path'),'url(#notation-canvas-connection-label-clip)');assert.equal(path.getAttribute('d'),hit.shift());}assert.equal(h.canvas.querySelectorAll('.line-label-background').length,0);assert.deepEqual(h.view,before);
 const exported=exportViewSvg({canvas:h.canvas,bounds:{x:0,y:0,width:220,height:220},title:'Подписи'});assert.equal(assertSvgExport(exported),exported);assert.match(exported,/clip-rule="evenodd"/);assert.match(exported,/clip-path="url\(#notation-canvas-connection-label-clip\)"/);
 h.view.connections[0].style.labelBackgroundMode='opaque';h.view.connections[0].style.labelBackground='#abcdef';h.view.visualConnectors[0].style.labelBackgroundMode='transparent';applyDrawingGeometryStyles(h.canvas,h.view);assert.equal(h.canvas.querySelector('clipPath'),null);assert.equal(h.canvas.querySelectorAll('.line-label-background').length,1);assert.equal(h.canvas.querySelector('.line-label-background').getAttribute('fill'),'#abcdef');assert.equal(h.canvas.querySelector('.line').getAttribute('marker-end'),'url(#notation-canvas-end)');
});
test('bridge previews do not accumulate arcs and refresh from new displayed raw routes',t=>{
 const h=domFixture(t);for(const item of [...h.view.connections,...h.view.visualConnectors])item.style={crossing:'jump'};applyDrawingGeometryStyles(h.canvas,h.view);const path=h.canvas.querySelector('[data-id="b"] .line'),first=path.getAttribute('d');assert.match(first,/ C /);applyDrawingGeometryStyles(h.canvas,h.view);assert.equal(path.getAttribute('d'),first);path.setAttribute('d','M 250 0 L 250 200');applyDrawingGeometryStyles(h.canvas,h.view);assert.equal(path.getAttribute('d'),'M 250 0 L 250 200');assert.equal(h.canvas.querySelector('[data-id="b"] .line-hit').getAttribute('d'),'M 100 0 L 100 200');
});
test('static clip-rule boundary accepts the exact safe enum and rejects active/unknown values',()=>{const xml=value=>`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="notation-canvas-clip"><path d="M 0 0 L 20 20" clip-rule="${value}"/></clipPath></defs><path d="M 0 0 L 20 20" clip-path="url(#notation-canvas-clip)"/></svg>`;for(const value of ['nonzero','evenodd'])assert.equal(assertSvgExport(xml(value)),xml(value));for(const value of ['inherit','url(https://bad)','evenodd;stroke:red','nonzero onload=bad'])assert.throws(()=>assertSvgExport(xml(value)));});


test('native decoration fields roundtrip exactly, retain endpoint identity and undo without affecting semantic notation',()=>{
 const store=createStore(createProject('Line decoration')),run=command=>store.execute(command,store.revision).created,viewId=run({type:'createView',name:'Decorated'}).viewId,add=x=>run({type:'createVisualNode',viewId,kind:'note',name:'Note',text:'Text',bounds:{x,y:20,width:100,height:60}}).visualNodeId,a=add(0),b=add(200),id=run({type:'createVisualConnector',viewId,source:{kind:'visualNode',id:a},target:{kind:'visualNode',id:b}}).visualConnectorId,before=exportFiles(store.snapshot),original=store.snapshot.views[0].visualConnectors[0];
 run({type:'updateDrawingStyle',viewId,drawing:{kind:'visualConnector',id},style:{crossing:'jump',labelBackgroundMode:'clip'}});const restored=deserializeProjectFile(serializeProjectFile(store.snapshot)),line=restored.views[0].visualConnectors[0];assert.deepEqual(line.style,{crossing:'jump',labelBackgroundMode:'clip'});assert.deepEqual(line.source,original.source);assert.deepEqual(line.target,original.target);assert.deepEqual(line.routePoints,original.routePoints);assert.equal(restored.relationships.length,0);
 const accepted=exportFiles(store.snapshot);assert.throws(()=>run({type:'updateDrawingStyle',viewId,drawing:{kind:'visualNode',id:a},style:{crossing:'jump'}}));assert.deepEqual(exportFiles(store.snapshot),accepted);store.undo(store.revision);assert.deepEqual(exportFiles(store.snapshot),before);
});


test('source/middle/target label bindings follow displayed endpoints, retain raw geometry and honor an explicit stored manual position',()=>{
 const nodes=[{id:'a',bounds:{x:0,y:0,width:100,height:80}},{id:'b',bounds:{x:320,y:180,width:120,height:80}}],base={id:'line',source:{kind:'occurrence',id:'a'},target:{kind:'occurrence',id:'b'},routePoints:[],labelPosition:null,style:{}},original=structuredClone(base);
 const geometry=anchor=>connectionGeometry({...base,style:{labelAnchor:anchor}},nodes,()=>0,false),source=geometry('source'),middle=geometry('middle'),target=geometry('target');assert.ok(source.x<middle.x&&middle.x<target.x);assert.ok(source.x<=100);assert.ok(target.x>=320);assert.equal(source.y,routePointAt(source,0).y-10);assert.deepEqual(base,original);
 const moved=structuredClone(nodes);moved[1].bounds.x+=200;assert.ok(connectionGeometry({...base,style:{labelAnchor:'target'}},moved).x>target.x);const manual={...base,labelPosition:{x:999,y:888},style:{labelAnchor:'source'}};assert.equal(connectionGeometry(manual,nodes,()=>0,true).x,999);assert.ok(connectionGeometry(manual,nodes,()=>0,false).x<=100);
});
