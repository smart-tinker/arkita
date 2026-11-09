import { assertGlyphCaptionClearance } from './glyph-caption-assertions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL as ref } from '../../schemka-model-core/src/index.js';
import { NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, UNKNOWN_NOTATION, notationElement, notationRelationship, notationBox, notationLine, notationDefs } from '../src/notation.js';
import { connectionGeometry, viewGeometryBounds, contourPoint } from '../src/connection-geometry.js';

const document = new JSDOM('').window.document;
const types = ['SystemSoftware','CommunicationNetwork','DistributionNetwork','Artifact','Material','Resource','Capability','ValueStream','CourseOfAction','WorkPackage'];
const rounded = ['Capability','ValueStream','CourseOfAction','WorkPackage'];
const fixture = JSON.parse(readFileSync(new URL('./remaining-predecessor-fixture.json', import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');
const numbers = text => text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
const attrs = (n, keys) => keys.split(' ').map(k => Number(n.getAttribute(k)));
const pts = n => n.getAttribute('points').split(' ').map(p => p.split(',').map(Number));
const glyphFor = type => notationBox(document, notationElement(ref, type), { width:220, height:90 }).lastElementChild;
const inside = (x,y,w,h,r) => {
  if (Math.min(x,y,w-x,h-y) < -1e-10) return false;
  if (!r) return true;
  const rx=Math.min(r,w/2),ry=Math.min(r,h/2),dx=Math.max(rx-x,x-(w-rx),0)/rx,dy=Math.max(ry-y,y-(h-ry),0)/ry;
  return dx*dx+dy*dy <= 1+1e-10;
};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

for (const type of types) test(`${type}: closed default badge, exact old rectangle and full painted containment across 72 sizes`, () => {
  const a=notationElement(ref,type),r=rounded.includes(type)?12:0,token=type.toLowerCase(),family=types.indexOf(type)<5?'technology':type==='WorkPackage'?'implementation':'strategy';
  assert.deepEqual(a,{className:`node notation-draft notation-${family}${family==='technology'?'':' notation-extended'}`,radius:r,badge:{SystemSoftware:'System Software',CommunicationNetwork:'Communication Network',DistributionNetwork:'Distribution Network',ValueStream:'Value Stream',CourseOfAction:'Course of Action',WorkPackage:'Work Package'}[type]||type,family,notation:'schemka-am4-draft-visual@2',glyph:token});
  assert.deepEqual(NOTATION_ELEMENTS.filter(t=>notationElement(ref,t).glyph===token),[type]);
  for (const [width,height] of [...fixture.widths.flatMap(w=>fixture.heights.map(h=>[w,h])),[210,90],[70,400],[25,100],[.1,9000],[9000,.1],[9000,9000]]) {
    const b=Object.freeze({x:900000,y:-900000,width,height}),shape=notationBox(document,a,b),g=shape.lastElementChild;
    assert.equal(shape.children.length,2);assert.equal(shape.querySelectorAll('.node-box').length,1);
    assert.equal(shape.firstElementChild.outerHTML,`<rect class="node-box" width="${width}" height="${height}" rx="${r}"></rect>`);
    assert.equal(g.getAttribute('class'),`${token}-glyph`);assert.equal(g.getAttribute('aria-hidden'),'true');assert.equal(g.getAttribute('pointer-events'),'none');assert.equal(g.innerHTML,glyphFor(type).innerHTML);
    assert.equal(shape.querySelectorAll('image,use,script,foreignObject,a,marker,defs,clipPath,mask,text,title,[tabindex],[role]').length,0);
    for(const n of g.children){assert.ok(n.classList.contains('node-detail'));for(const attr of ['vector-effect','fill','style'])assert.equal(n.hasAttribute(attr),false);if(['polygon','path'].includes(n.tagName))assert.equal(n.getAttribute('stroke-linejoin'),'round');}
    const [x,y,s]=numbers(g.getAttribute('transform'));assert.ok([x,y,s].every(Number.isFinite)&&s>0&&s<=1.5);
    // Independent convex painted envelopes include every 1.25-unit stroke/cap/round join.
    // Rounded boxes use actual independently clamped SVG rx/ry, not AABB containment.
    const hull=r?[.375,17.625,.375,10.625]:[.375,17.625,-.125,11.125];
    for(const px of [hull[0],hull[1]])for(const py of [hull[2],hull[3]])assert.ok(inside(x+px*s,y+py*s,width,height,r),`${type} ${width}x${height}: rounded painted hull`);
    if((width===120&&height===55)||([210,220].includes(width)&&height===90)){
      assertGlyphCaptionClearance(a, b, { left:x+hull[0]*s, right:x+hull[1]*s, top:y+hull[2]*s, bottom:y+hull[3]*s });
      // For ordinary sizes all badge hull corners sit beyond the curved-corner region or its inset.
      for(const px of [hull[0],hull[1]])for(const py of [hull[2],hull[3]]){
        const gx=x+px*s,gy=y+py*s;assert.ok(inside(gx-2.25,gy-2.25,width-4.5,height-4.5,Math.max(0,r-2.25)),'More than .5 gap beyond thickest 3.5 border');
      }
    }
  }
});

test('SystemSoftware has one complete lower-left circle and only the exposed upper-right rear arc',()=>{
  const g=glyphFor('SystemSoftware'),[arc,front]=g.children;assert.deepEqual([...g.children].map(n=>n.tagName),['path','circle']);assert.deepEqual(arc.getAttribute('d').match(/[a-z]/gi),['M','A']);
  const [sx,sy,rx,ry,rotation,large,sweep,ex,ey]=numbers(arc.getAttribute('d')),[cx,cy,r]=attrs(front,'cx cy r');assert.equal(rx,ry);assert.equal(rx,r);assert.deepEqual([rotation,large,sweep],[0,1,1]);
  const rear=[10,4];assert.ok(rear[0]>cx&&rear[1]<cy);assert.ok(Math.hypot(rear[0]-cx,rear[1]-cy)<r*2);
  for(const [x,y] of [[sx,sy],[ex,ey]]){close(Math.hypot(x-cx,y-cy),r);close(Math.hypot(x-rear[0],y-rear[1]),r);}
  let start=Math.atan2(sy-rear[1],sx-rear[0]),end=Math.atan2(ey-rear[1],ex-rear[0]);while(end<start)end+=Math.PI*2;assert.ok(end-start>Math.PI);
  for(let i=0;i<=360;i++){const angle=start+(end-start)*i/360,x=rear[0]+r*Math.cos(angle),y=rear[1]+r*Math.sin(angle);assert.ok(Math.hypot(x-cx,y-cy)>=r-1e-9,'No hidden rear lens stroke');}
  assert.notEqual(g.innerHTML,glyphFor('Collaboration').innerHTML);
});

test('CommunicationNetwork has precisely four solid discs covering a skew four-edge perimeter without diagonals',()=>{
  const g=glyphFor('CommunicationNetwork'),[cycle,...discs]=g.children,p=pts(cycle);assert.equal(cycle.tagName,'polygon');assert.equal(p.length,4);assert.equal(discs.length,4);
  discs.forEach((n,i)=>{assert.equal(n.tagName,'circle');assert.ok(n.classList.contains('node-detail-solid'));assert.deepEqual(attrs(n,'cx cy'),p[i]);assert.ok(Number(n.getAttribute('r'))>0);});
  assert.equal(p[0][1],p[1][1]);assert.equal(p[2][1],p[3][1]);assert.ok(p[0][0]>p[3][0]&&p[1][0]>p[2][0]);close(p[0][0]-p[3][0],p[1][0]-p[2][0]);assert.equal(g.querySelectorAll('path,line,polyline').length,0);
});

test('DistributionNetwork retains both band edges and all four collinear diagonal extensions',()=>{
  const g=glyphFor('DistributionNetwork'),[outline,...extensions]=g.children,p=pts(outline);assert.equal(p.length,6);assert.equal(extensions.length,4);assert.equal(p[1][1],p[2][1]);assert.equal(p[4][1],p[5][1]);assert.equal(p[0][1],p[3][1]);
  for(const [i,n] of extensions.entries()){assert.equal(n.tagName,'line');const [x1,y1,x2,y2]=attrs(n,'x1 y1 x2 y2'),corner=[p[1],p[5],p[2],p[4]][i],tip=i<2?p[0]:p[3];assert.deepEqual([x1,y1],corner);close((x1-tip[0])*(y2-y1)-(y1-tip[1])*(x2-x1),0);assert.ok(y2<p[1][1]||y2>p[5][1]);}
  assert.equal(g.querySelectorAll('.node-detail-solid').length,0);
});

test('Artifact is a five-vertex folded sheet with one L seam joining the clipped diagonal endpoints',()=>{
  const [outline,seam]=glyphFor('Artifact').children,p=pts(outline);assert.equal(p.length,5);assert.deepEqual(seam.getAttribute('d').match(/[a-z]/gi),['M','V','H']);const [x,y,bottom,right]=numbers(seam.getAttribute('d'));assert.deepEqual([x,y],p[1]);assert.deepEqual([right,bottom],p[2]);assert.ok(right>x&&bottom>y);assert.equal(p[0][1],y);assert.equal(p[3][0],right);assert.equal(p[4][0],p[0][0]);
});

test('Material is a flat-top hexagon with exactly three disconnected inset strokes and open negative space',()=>{
  const [hex,...lines]=glyphFor('Material').children,p=pts(hex);assert.equal(p.length,6);assert.equal(lines.length,3);assert.equal(p[1][1],p[2][1]);assert.equal(p[4][1],p[5][1]);
  lines.forEach((n,i)=>{const [x1,y1,x2,y2]=attrs(n,'x1 y1 x2 y2'),edge=[[p[0],p[1]],[p[2],p[3]],[p[4],p[5]]][i];close((x2-x1)*(edge[1][1]-edge[0][1])-(y2-y1)*(edge[1][0]-edge[0][0]),0);for(const [x,y] of [[x1,y1],[x2,y2]])for(let j=0;j<6;j++){const a=p[j],b=p[(j+1)%6],distance=Math.abs((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]);assert.ok(distance>1.25,'Inset stroke does not touch outline ink');}});
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=attrs(lines[i],'x1 y1 x2 y2'),b=attrs(lines[j],'x1 y1 x2 y2');for(const ai of [0,2])for(const bi of [0,2])assert.ok(Math.hypot(a[ai]-b[bi],a[ai+1]-b[bi+1])>1.25);}
});

test('Resource has a rounded body, single right lug join seam and three separate interior vertical bars',()=>{
  const [body,lug,...bars]=glyphFor('Resource').children,[x,y,w,h,r]=attrs(body,'x y width height rx');assert.equal(body.tagName,'rect');assert.ok(r>0);assert.equal(bars.length,3);assert.deepEqual(lug.getAttribute('d').match(/[a-z]/gi),['M','H','Q','Q','H']);
  const [sx,sy,...rest]=numbers(lug.getAttribute('d'));assert.equal(sx,x+w);assert.equal(rest.at(-1),x+w);assert.ok(sy>y&&sy<y+h);assert.ok(!lug.getAttribute('d').includes('Z'),'No duplicated lug-side body seam');
  const xs=[];for(const bar of bars){const [x1,y1,x2,y2]=attrs(bar,'x1 y1 x2 y2');assert.equal(x1,x2);assert.ok(x1>x+1.25&&x1<x+w-1.25&&y1>y+1.25&&y2<y+h-1.25);xs.push(x1);}assert.equal(new Set(xs).size,3);
});

test('Capability has six cells in common-baseline columns of one, two and three with single shared seams',()=>{
  const [outline,...lines]=glyphFor('Capability').children,p=pts(outline);assert.equal(p.length,8);assert.equal(lines.length,4);const [left,bottom]=p[0],unit=p[2][0]-left;assert.ok(unit>1.25);assert.equal(p[7][1],bottom);
  for(const [i,top] of [p[1],p[3],p[5]].entries()){close(top[0],left+i*unit);close(bottom-top[1],(i+1)*unit);}
  const edges=lines.map(n=>attrs(n,'x1 y1 x2 y2'));assert.deepEqual(edges,[[left+unit,bottom-unit,left+unit,bottom],[left+2*unit,bottom-2*unit,left+2*unit,bottom],[left+unit,bottom-unit,left+3*unit,bottom-unit],[left+2*unit,bottom-2*unit,left+3*unit,bottom-2*unit]]);assert.equal(new Set(edges.map(e=>JSON.stringify(e))).size,4);
});

test('ValueStream is one broad right chevron with a left concave notch and no shaft or subdivision',()=>{
  const g=glyphFor('ValueStream');assert.equal(g.children.length,1);const p=pts(g.firstElementChild);assert.equal(p.length,6);assert.equal(p[0][1],p[1][1]);assert.equal(p[3][1],p[4][1]);assert.equal(p[2][1],p[5][1]);assert.ok(p[5][0]>p[0][0]&&p[5][0]<p[1][0]&&p[2][0]>p[1][0]);assert.equal(p[0][0],p[4][0]);assert.equal(p[1][0],p[3][0]);
});

test('CourseOfAction keeps two open rings, solid center and curved filled arrow contacting only the outer rim',()=>{
  const g=glyphFor('CourseOfAction'),[arrow,outer,inner,center]=g.children;assert.equal(g.children.length,4);assert.equal(arrow.tagName,'path');assert.ok(arrow.classList.contains('node-detail-solid')&&center.classList.contains('node-detail-solid'));assert.equal(g.querySelectorAll('circle').length,3);
  assert.deepEqual(arrow.getAttribute('d').match(/[a-z]/gi),['M','C','L','L','L','L','C','Z']);const n=numbers(arrow.getAttribute('d')),tip=n.slice(10,12),[cx,cy,r]=attrs(outer,'cx cy r');close(Math.hypot(tip[0]-cx,tip[1]-cy),r);assert.ok(tip[0]<cx&&tip[1]>cy);assert.ok(n[0]<tip[0]&&n[1]>tip[1]);
  for(const c of [inner,center])assert.deepEqual(attrs(c,'cx cy'),[cx,cy]);assert.ok(r-Number(inner.getAttribute('r'))-1.25>=.5&&Number(inner.getAttribute('r'))-Number(center.getAttribute('r'))>1.25);assert.ok(!outer.classList.contains('node-detail-solid')&&!inner.classList.contains('node-detail-solid'));
  // Independent cubic control hulls stay to the left of the target except the contacting tip.
  for(const x of [n[0],n[2],n[4],n[6],n[8],...n.slice(12,24).filter((_,i)=>i%2===0)])assert.ok(x<=tip[0]);assert.ok(tip[0]+.625<cx-Number(inner.getAttribute('r'))-.625,'No arrow ink reaches inner ring');
});

test('WorkPackage is an open near-loop with a visible lower-right gap, bottom tangent shaft and one solid right head',()=>{
  const [loop,head]=glyphFor('WorkPackage').children;assert.deepEqual(loop.getAttribute('d').match(/[a-z]/gi),['M','A','H']);const [sx,sy,rx,ry,rotation,large,sweep,ex,ey,hx]=numbers(loop.getAttribute('d'));assert.equal(rx,ry);assert.deepEqual([rotation,large,sweep],[0,1,0]);const cx=ex,cy=ey-ry;close(Math.hypot(sx-cx,sy-cy),rx);assert.ok(sx>cx&&sy>cy&&sy<ey);assert.ok(ey-sy-1.25>1,'Visible gap after both stroked boundaries');assert.ok(hx>sx);assert.ok(head.classList.contains('node-detail-solid'));const [a,tip,b]=pts(head);assert.ok(a[0]<tip[0]&&a[0]===b[0]);assert.equal(tip[1],ey);assert.equal((a[1]+b[1])/2,ey);assert.ok(hx>a[0]&&hx<tip[0]);
});

test('All 32 other descriptors retain pinned 72-size SVG; relationship and marker bytes stay exact',()=>{
  assert.equal(Object.keys(fixture.elements).length,32);assert.deepEqual(Object.keys(fixture.elements),NOTATION_ELEMENTS.filter(t=>!types.includes(t)));assert.deepEqual(Object.keys(fixture.relationships),NOTATION_RELATIONSHIPS);
  for(const [t,e] of Object.entries(fixture.elements)){assert.deepEqual(notationElement(ref,t),e.descriptor);assert.equal(sha(JSON.stringify(fixture.widths.flatMap(width=>fixture.heights.map(height=>(t === 'Meaning' ? notationBox(document,notationElement(ref,t),{width,height}).querySelector('.node-box') : notationBox(document,notationElement(ref,t),{width,height})).outerHTML)))),e.sha256,t);}
  for(const [t,e] of Object.entries(fixture.relationships)){assert.deepEqual(notationRelationship(ref,t),e.descriptor);assert.equal(sha(JSON.stringify(fixture.widths.flatMap(width=>fixture.heights.flatMap(height=>['canvas','legend',`palette-${t.toLowerCase()}`].map(scope=>notationLine(document,notationRelationship(ref,t),scope).outerHTML))))),e.sha256,t);}assert.equal(sha(notationDefs(document).outerHTML),fixture.defsSHA256);
});

test('Solid-glyph selectors stay scoped and preserve unrelated computed theme/state notation',()=>{
  const css=readFileSync(new URL('../style.css',import.meta.url),'utf8').replace(/\/\* Meaning satellites[\s\S]*?(?=\/\* Keep compact toolbar)/, ''),start=css.indexOf('/* Closed remaining-default solid pieces'),end=css.indexOf('/* Keep compact toolbar',start),old=css.slice(0,start)+css.slice(end);assert.ok(start>0&&end>start);
  const addition=css.slice(start,end);for(const rule of addition.matchAll(/([^{}]+)\{[^}]+\}/g))for(const selector of rule[1].replace(/\/\*[\s\S]*?\*\//g,'').trim().split(','))assert.match(selector.trim(),/^\.node\.notation-(?:technology|strategy|implementation|draft)(?:\.(?:selected|dragging)|:focus-visible)? \.(?:communicationnetwork|courseofaction|workpackage)-glyph \.node-detail-solid$/);
  const dom=new JSDOM(`<style>${css.replaceAll(':focus-visible','.test-focus')}</style>`),prior=new JSDOM(`<style>${old.replaceAll(':focus-visible','.test-focus')}</style>`);
  for(const theme of ['light','dark'])for(const state of ['',' selected',' test-focus',' dragging'])for(const type of NOTATION_ELEMENTS){
    const props=['fill','stroke','strokeWidth','strokeDasharray','pointerEvents','filter'],views=[dom,prior].map(d=>{const doc=d.window.document;doc.documentElement.dataset.theme=theme;const host=doc.createElement('div');host.className=notationElement(ref,type).className+state;host.append(notationBox(doc,notationElement(ref,type),{width:220,height:90}));doc.body.replaceChildren(host);return [...host.querySelectorAll('.node-box,.node-detail')].map(n=>({n,style:d.window.getComputedStyle(n)}));});
    views[0].forEach(({n,style},i)=>{for(const p of props)if(!n.classList.contains('meaning-bubble')&&!(types.includes(type)&&n.classList.contains('node-detail-solid')&&p==='fill'))assert.equal(style[p],views[1][i].style[p],`${type} ${state} ${p}`);if(types.includes(type)&&n.classList.contains('node-detail')){const ink=state?'var(--notation-selected)':notationElement(ref,type).family==='technology'?'var(--notation-border)':'#000000';assert.equal(style.stroke,ink);assert.equal(style.fill,n.classList.contains('node-detail-solid')?ink:'none');assert.equal(style.strokeWidth,'1.25');}});
  }
  dom.window.close();prior.window.close();
});

test('Ten default tokens remain closed against malicious types, references, URLs, objects and imported SVG',()=>{
  for(const reference of [null,{}, {...ref,version:999},{...ref,version:String(ref.version)},{id:'<svg>',version:ref.version}])for(const t of types){const a=notationElement(reference,t);assert.equal(a.notation,UNKNOWN_NOTATION);assert.equal(a.glyph,undefined);assert.equal(notationBox(document,a,{width:120,height:55}).outerHTML,'<rect class="node-box" width="120" height="55" rx="0"></rect>');}
  for(const t of types)for(const v of [t.toLowerCase(),'__proto__','constructor','<svg onload=bad()>','url(https://invalid.test)',{},[t],{toString:()=>t},new String(t),1,true,null]){assert.equal(notationElement(ref,v).notation,UNKNOWN_NOTATION);if(v!==t.toLowerCase())assert.equal(notationBox(document,{glyph:v},{width:120,height:55}).tagName,'rect');}
});

for(const type of types)test(`${type}: prior radius preserves route clipping, ports, pinned anchors, loops, hit contour, Fit and model bytes`,()=>{
  const a=notationElement(ref,type),radius=rounded.includes(type)?12:0;
  for(const [width,height] of [[.1,.1],[.1,9000],[9000,.1],[38,20],[120,55],[210,90],[220,90]])for(const [dx,dy] of [[300,200],[-300,200],[300,-200],[-300,-200],[30,15],[0,0]]){
    const occurrences=[{id:'a',bounds:{x:0,y:0,width,height}},{id:'b',bounds:{x:dx,y:dy,width:220,height:90}}],host={id:'host',source:{kind:'occurrence',id:'a'},target:{kind:'occurrence',id:'b'},routePoints:[{kind:'anchor',id:'corner',point:{x:0,y:0}},{kind:'anchor',id:'center',point:{x:width/2,y:height/2}},{kind:'anchor',id:'outside',point:{x:-100,y:-100}},{kind:'bend',point:{x:260,y:-60}}],labelPosition:{x:200,y:-90}};
    const connections=[host,{id:'auto',source:host.source,target:host.target,routePoints:[]},{id:'reverse',source:host.target,target:host.source,routePoints:[]},{id:'loop',source:host.source,target:host.source,routePoints:[]},{id:'attached',source:host.target,target:{kind:'connection',id:'host',anchorId:'outside'},routePoints:[]}],bytes=JSON.stringify({occurrences,connections}),actual=()=>a.contour||a.radius,baseline=()=>radius;
    for(const stored of [false,true]){for(const c of connections)assert.deepEqual(connectionGeometry(c,occurrences,actual,stored,connections),connectionGeometry(c,occurrences,baseline,stored,connections));assert.deepEqual(viewGeometryBounds(occurrences,connections,actual,stored),viewGeometryBounds(occurrences,connections,baseline,stored));}
    for(const v of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:1},{x:-1,y:-1}])assert.deepEqual(contourPoint(occurrences[0].bounds,v,actual()),contourPoint(occurrences[0].bounds,v,radius));
    for(const [x,y] of [[0,0],[width,0],[0,height],[width,height]])assert.equal(inside(x,y,width,height,radius),radius===0);assert.equal(JSON.stringify({occurrences,connections}),bytes);
  }
});

test('Ten source locators retain the corrected glyph entries; alternatives and all UNKNOWN/HOLD gates remain',()=>{
  const ledger=JSON.parse(readFileSync(new URL('../../docs/ARCHIMATE-COVERAGE.json',import.meta.url),'utf8'));
  for(const type of types){const row=ledger.rows.find(r=>r.id===type),a=row.assertions.find(a=>a.predicate==='normative_boxed_remaining_default_notation');assert.equal(row.normative_assessment,'UNKNOWN');assert.equal(row.mapping.source_shape,rounded.includes(type)?'RoundedRectangle':'Rectangle');assert.equal(row.mapping.implemented_shape,row.mapping.source_shape);assert.equal(a.evidence.sha256,'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');assert.match(a.evidence.locator,/Figure \d+-\d+, printed \d+ \/ PDF \d+; Appendix A\.[12], printed 12[34] \/ PDF 14[12]/);assert.ok(row.assertions.some(a=>a.predicate==='draft_notation'&&a.evidence.status==='independent_unofficial_draft'));}
  const gap=ledger.gaps.find(g=>g.id==='source_icon_equivalence'),inventory=gap.default_form_inventory;assert.deepEqual(inventory.missing_distinguishing_glyphs,[]);assert.deepEqual(inventory.incomplete_icon_forms,[]);assert.equal(inventory.bounded_boxed_forms.length,35);for(const type of types)assert.ok(inventory.bounded_boxed_forms.includes(type));assert.ok(gap.needed.includes('Full support for the displayed boxed/icon repertoire remains a separate open standard-support gap'));assert.equal(ledger.verification_status.independent_persistence_acceptance,'HOLD');assert.equal(ledger.verification_status.windows_acceptance,'UNRUN');assert.ok(ledger.verification_status.relationship_draft_policy.startsWith('IMPLEMENTED_LOCAL_PENDING_DESKTOP_ACCEPTANCE'));
});
