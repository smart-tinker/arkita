import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {CURRENT_METAMODEL as ref} from '../../schemka-model-core/src/index.js';
import {NOTATION_ELEMENTS,NOTATION_RELATIONSHIPS,notationElement,notationRelationship,notationJunction,notationBox,notationLine,notationDefs,UNKNOWN_NOTATION} from '../src/notation.js';
import {nodeContourGeometry} from '../src/node-shapes.js';
import {connectionGeometry,viewGeometryBounds,contourPoint} from '../src/connection-geometry.js';
const document=new JSDOM('').window.document,fixture=JSON.parse(readFileSync(new URL('./meaning-predecessor-fixture.json',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),box=(w,h)=>notationBox(document,notationElement(ref,'Meaning'),{width:w,height:h});
const attrs=(n,keys)=>keys.split(' ').map(k=>Number(n.getAttribute(k)));

test('Meaning has the unchanged 96-vertex cloud and exactly two finite detached, contained, pointer-inert lower-left outline satellites',()=>{
 for(const [width,height]of [...fixture.sizes,...[.1,1,20,38,120,169,220,1000000].flatMap(w=>[28,30,35,40,48,54].map(h=>[w,h]))])for(const[x,y]of [[0,0],[1000000,-1000000],[-1000000,1000000]]){
  const shape=notationBox(document,notationElement(ref,'Meaning'),Object.freeze({x,y,width,height}));
  assert.equal(shape.children.length,3);assert.equal(shape.querySelectorAll('.node-box').length,1);assert.equal(shape.firstElementChild.tagName,'polygon');
  const points=shape.firstElementChild.getAttribute('points').split(' ').map(p=>p.split(',').map(Number));assert.equal(points.length,96);assert.deepEqual(points,nodeContourGeometry({width,height},'cloud').outline.map(p=>[p.x,p.y]));
  const ellipses=[...shape.querySelectorAll('ellipse')];assert.equal(ellipses.length,2);const geometry=ellipses.map(n=>attrs(n,'cx cy rx ry'));
  const [near,far]=geometry;assert.ok(near[0]>far[0]&&near[1]<far[1]&&near[2]>far[2]&&near[3]>far[3]);
  for(const[n,i]of ellipses.map((n,i)=>[n,i])){
   assert.equal(n.getAttribute('pointer-events'),'none');assert.equal(n.getAttribute('aria-hidden'),'true');assert.equal(n.getAttribute('class'),'node-detail meaning-bubble');assert.equal(n.getAttribute('vector-effect'),null);
   const[cx,cy,rx,ry]=geometry[i],stroke=Number(n.style.strokeWidth),s=Math.min(width,height);assert.ok([cx,cy,rx,ry,stroke].every(v=>Number.isFinite(v)&&v>0));assert.ok(stroke<=.8&&stroke<=.025*s+1e-12);
   assert.ok(cx-rx-stroke/2>=0&&cy-ry-stroke/2>=0&&cx+rx+stroke/2<=width&&cy+ry+stroke/2<=height);
   // The same fixed normalized separating line bounds every convex blend, at every aspect ratio.
   const normal=Math.hypot(2.5,1),cloudMin=Math.min(...points.map(([x,y])=>(2.5*x/width-y/height)/normal));
   const ellipseMax=(2.5*cx/width-cy/height+Math.hypot(2.5*rx/width,ry/height))/normal;
   assert.ok((cloudMin-ellipseMax)*s-stroke/2>0);
   if((width===120&&height===55)||(width===220&&height===90)||(width===210&&height===90)||(width===38&&height===20)||(width===169&&height===28)){
    const mainStroke=3.5;
    const segmentDistance=(px,py,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy);};
    let min=Infinity;const miters=[];
    for(let j=0;j<points.length;j++){const p=points[j],a=points[(j+95)%96],b=points[(j+1)%96],ax=p[0]-a[0],ay=p[1]-a[1],bx=b[0]-p[0],by=b[1]-p[1],cos=(ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by));miters.push(1/Math.sqrt((1+cos)/2));}
    for(let k=0;k<720;k++){const angle=k*Math.PI/360,px=cx+rx*Math.cos(angle),py=cy+ry*Math.sin(angle);for(let j=0;j<96;j++)min=Math.min(min,segmentDistance(px,py,points[j],points[(j+1)%96])-mainStroke/2,Math.hypot(px-points[j][0],py-points[j][1])-mainStroke/2*miters[j]);}
    // Lipschitz remainder bounds every point between samples; join disks conservatively cover miter ink.
    assert.ok(min-Math.max(rx,ry)*Math.PI/720-stroke/2>0,`${width}x${height}: full cloud/bubble stroke gap`);
   }
  }
  const stroke=Number(ellipses[0].style.strokeWidth),sep=((near[0]/width-near[1]/height)-(far[0]/width-far[1]/height)-Math.hypot(near[2]/width,near[3]/height)-Math.hypot(far[2]/width,far[3]/height))/Math.SQRT2*Math.min(width,height)-stroke;assert.ok(sep>0);
  assert.equal(shape.querySelector('script,foreignObject,image,use,a,rect,path,line,[tabindex],[role]'),null);
 }
});

test('All types, junctions and relationships retain descriptors and pinned SVG with the documented corner-sizing revision',()=>{
 assert.equal(Object.keys(fixture.elements).length,42);assert.deepEqual(Object.keys(fixture.elements),NOTATION_ELEMENTS);
 for(const[type,e]of Object.entries(fixture.elements)){assert.deepEqual(notationElement(ref,type),e.descriptor);assert.equal(sha(JSON.stringify(fixture.sizes.map(([width,height])=>{const shape=notationBox(document,notationElement(ref,type),{width,height});return(type==='Meaning'?shape.querySelector('.node-box'):shape).outerHTML;}))),e.sha256,type);}
 assert.deepEqual(Object.keys(fixture.relationships),NOTATION_RELATIONSHIPS);for(const[type,e]of Object.entries(fixture.relationships)){assert.deepEqual(notationRelationship(ref,type),e.descriptor);assert.equal(sha(JSON.stringify(['canvas','legend',`palette-${type.toLowerCase()}`].map(scope=>notationLine(document,notationRelationship(ref,type),scope).outerHTML))),e.sha256);}
 for(const[type,d]of Object.entries(fixture.junctions))assert.deepEqual(notationJunction(ref,type),d);assert.equal(sha(notationDefs(document).outerHTML),fixture.defsSHA256);
});

test('Meaning satellite contrast stays scoped; effective bounded stroke overrides generic detail width in every theme and state',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8'),start=css.indexOf('/* Meaning satellites'),end=css.indexOf('/* Keep compact toolbar',start),old=css.slice(0,start)+css.slice(end);assert.ok(start>0&&end>start);
 const addition=css.slice(start,end);for(const rule of addition.matchAll(/([^{}]+)\{([^}]+)\}/g)){assert.equal(rule[2].trim().split(';').filter(Boolean).length,1);assert.match(rule[2],/^ stroke:var\(--(?:ink|blue)\); $/);for(const selector of rule[1].replace(/\/\*[\s\S]*?\*\//g,'').trim().split(','))assert.match(selector.trim(),/^\.node\.notation-extended(?:\.(?:selected|dragging)|:focus-visible)? \.meaning-bubble$/);}
 const dom=new JSDOM(`<style>${css.replaceAll(':focus-visible','.test-focus')}</style>`),prior=new JSDOM(`<style>${old.replaceAll(':focus-visible','.test-focus')}</style>`);
 for(const theme of ['light','dark'])for(const state of ['',' selected',' test-focus',' dragging'])for(const type of NOTATION_ELEMENTS){
  const views=[dom,prior].map(d=>{const doc=d.window.document;doc.documentElement.dataset.theme=theme;const host=doc.createElement('div');host.className=notationElement(ref,type).className+state;host.append(notationBox(doc,notationElement(ref,type),{width:220,height:90}));doc.body.replaceChildren(host);return[...host.querySelectorAll('.node-box,.node-detail')].map(n=>({n,style:d.window.getComputedStyle(n)}));});
  for(const[{n,style},i]of views[0].map((v,i)=>[v,i]))for(const p of ['fill','stroke','strokeWidth','strokeDasharray','pointerEvents','filter'])if(n.classList.contains('meaning-bubble')){assert.equal(style.fill,'none');assert.equal(style.stroke,state?'var(--blue)':'var(--ink)');assert.equal(style.strokeWidth,'0.8');assert.equal(style.pointerEvents,'none');}else assert.equal(style[p],views[1][i].style[p],`${type} ${state} ${p}`);
 }
 dom.window.close();prior.window.close();
});

test('Meaning trust boundaries stay closed and unknown references/types/contours remain safe rectangles',()=>{
 for(const reference of [null,{}, {...ref,version:999},{...ref,version:String(ref.version)},{id:'<svg>',version:ref.version},{...ref,svg:'<svg/>'}]){const a=notationElement(reference,'Meaning');assert.equal(a.notation,UNKNOWN_NOTATION);assert.equal(notationBox(document,a,{width:120,height:55}).tagName,'rect');}
 for(const token of ['meaning','constructor','__proto__','<script/>','url(https://invalid.test)',{},[],['Meaning'],['cloud'],{toString:()=> 'Meaning'},new String('Meaning'),null,true,1]){assert.equal(notationElement(ref,token).notation,UNKNOWN_NOTATION);assert.equal(notationBox(document,{contour:token},{width:120,height:55}).tagName,'rect');}
});

test('Meaning original cloud routing, ports, stored bends/anchors, all quadrants, overlap, self-loops and Fit retain exact predecessor bytes',()=>{
 const hash=createHash('sha256');let count=0;
for(const[width,height]of [...fixture.sizes,...[.1,1,20,38,120,169,220,1000000].flatMap(w=>[28,30,35,40,48,54].map(h=>[w,h]))])for(const[x,y]of [[0,0],[1000000,-1000000],[-1000000,1000000]])for(const[dx,dy]of [[300,200],[-300,200],[300,-200],[-300,-200],[30,15],[0,0]]){
 const occ=[{id:'a',bounds:{x,y,width,height}},{id:'b',bounds:{x:x+dx,y:y+dy,width:220,height:90}}],host={id:'host',source:{kind:'occurrence',id:'a'},target:{kind:'occurrence',id:'b'},routePoints:[{kind:'anchor',id:'corner',point:{x,y}},{kind:'anchor',id:'center',point:{x:x+width/2,y:y+height/2}},{kind:'anchor',id:'outside',point:{x:x-100,y:y-100}},{kind:'bend',point:{x:x+260,y:y-60}}],labelPosition:{x:x+200,y:y-90}},connections=[host,{id:'auto',source:host.source,target:host.target,routePoints:[]},{id:'reverse',source:host.target,target:host.source,routePoints:[]},{id:'loop',source:host.source,target:host.source,routePoints:[]},{id:'attached',source:host.target,target:{kind:'connection',id:'host',anchorId:'outside'},routePoints:[]}];
 for(const stored of [false,true]){for(const c of connections){hash.update(JSON.stringify(connectionGeometry(c,occ,()=> 'cloud',stored,connections)));count++;}hash.update(JSON.stringify(viewGeometryBounds(occ,connections,()=> 'cloud',stored)));}
 for(const[vx,vy]of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]])hash.update(JSON.stringify(contourPoint(occ[0].bounds,{x:vx,y:vy},'cloud')));
}
 assert.equal(count,fixture.routes.count);assert.equal(hash.digest('hex'),fixture.routes.sha256);
});

test('Meaning closes only the finite local default inventory; original source provenance, alternatives and uncertainty stay explicit',()=>{
 const ledger=JSON.parse(readFileSync(new URL('../../docs/ARCHIMATE-COVERAGE.json',import.meta.url))),row=ledger.rows.find(r=>r.id==='Meaning'),prior=fixture.meaningRowBefore;
 assert.deepEqual(row.assertions.slice(0,-1),prior.assertions);assert.equal(row.normative_assessment,'UNKNOWN');
 const {implemented_satellites,local_style,...mapping}=row.mapping;assert.deepEqual(mapping,prior.mapping);assert.ok(implemented_satellites.includes('Two detached'));assert.ok(local_style.includes('local styling choices'));
 const a=row.assertions.at(-1);assert.equal(a.predicate,'normative_meaning_icon_topology');assert.equal(a.evidence.sha256,'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');assert.ok(a.evidence.locator.includes('Figure 6-9, printed 60 / PDF 78'));assert.ok(a.evidence.locator.includes('Appendix A.2, printed 124 / PDF 142'));assert.ok(a.evidence.style_boundary.includes('local inference'));
 const gap=ledger.gaps.find(g=>g.id==='source_icon_equivalence'),inv=gap.default_form_inventory;assert.equal(inv.bounded_boxed_forms.length,35);assert.equal(inv.bounded_icon_forms.length,7);assert.deepEqual(inv.incomplete_icon_forms,[]);assert.deepEqual(inv.missing_distinguishing_glyphs,[]);assert.equal(new Set([...inv.bounded_boxed_forms,...inv.bounded_icon_forms]).size,42);assert.ok(gap.needed.includes('Full support for the displayed boxed/icon repertoire remains a separate open standard-support gap'));
 assert.deepEqual(ledger.verification_status,fixture.verificationStatus);assert.equal(ledger.verification_status.independent_persistence_acceptance,'HOLD');assert.equal(ledger.verification_status.windows_acceptance,'UNRUN');
 for(const[path,pin]of Object.entries(fixture.uncertaintyLedgers))assert.equal(sha(readFileSync(new URL(`../../${path}`,import.meta.url))),pin);
});
