import { assertGlyphCaptionClearance } from './glyph-caption-assertions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL as ref } from '../../schemka-model-core/src/index.js';
import { NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, UNKNOWN_NOTATION, notationElement, notationRelationship, notationDefs, notationLine, notationBox } from '../src/notation.js';
import { connectionGeometry, viewGeometryBounds, contourPoint } from '../src/connection-geometry.js';

const document = new JSDOM('').window.document, types = ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement'];
const fixture = JSON.parse(readFileSync(new URL('./motivation-predecessor-fixture.json', import.meta.url), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');
const numbers = text => text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
const attrs = (n, keys) => keys.split(' ').map(k => Number(n.getAttribute(k)));
const pts = n => n.getAttribute('points').split(' ').map(p => p.split(',').map(Number));
const glyphFor = type => notationBox(document, notationElement(ref, type), { width: 220, height: 90 }).lastElementChild;
const inside = (x, y, w, h) => { const c = Math.min(w / 5, h / 5, 12), eps = 1e-10; return Math.min(x, y, w - x, h - y, x + y - c, w - x + y - c, x + h - y - c, w - x + h - y - c) >= -eps; };
const octagon = (w, h) => { const c = Math.min(w / 5, h / 5, 12); return [[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]; };

for (const type of types) test(`${type}: closed Motivation token, original octagon and true painted half-plane containment over 72 sizes`, () => {
  const a = Object.freeze(notationElement(ref, type)), token = type.toLowerCase();
  assert.deepEqual(a, { className: 'node notation-draft notation-motivation notation-extended', radius: 0, badge: type, family: 'motivation', notation: 'schemka-am4-draft-visual@2', glyph: token, contour: 'octagon' });
  assert.deepEqual(NOTATION_ELEMENTS.filter(t => notationElement(ref, t).glyph === token), [type]);
  for (const [width, height] of [...fixture.widths.flatMap(w => fixture.heights.map(h => [w, h])), [210, 90], [70, 400]]) {
    const b = Object.freeze({ x: 900000, y: -900000, width, height }), shape = notationBox(document, a, b), g = shape.lastElementChild;
    assert.equal(shape.children.length, 2); assert.equal(shape.querySelectorAll('.node-box').length, 1); assert.equal(shape.firstElementChild.tagName, 'polygon');
    assert.deepEqual(pts(shape.firstElementChild), octagon(width, height)); assert.equal(shape.querySelectorAll('rect:not(.node-detail)').length, 0);
    assert.equal(g.getAttribute('class'), `${token}-glyph`); assert.equal(g.getAttribute('aria-hidden'), 'true'); assert.equal(g.getAttribute('pointer-events'), 'none');
    assert.equal(shape.querySelectorAll('image,use,script,foreignObject,a,marker,defs,clipPath,mask,text,title,[tabindex],[role]').length, 0);
    assert.equal(g.innerHTML, glyphFor(type).innerHTML);
    for (const n of g.children) { assert.ok(n.classList.contains('node-detail')); assert.equal(n.hasAttribute('vector-effect'), false); assert.equal(n.hasAttribute('fill'), false); assert.equal(n.hasAttribute('style'), false); if (['path', 'polygon'].includes(n.tagName)) assert.equal(n.getAttribute('stroke-linejoin'), 'round'); }
    const [x, y, scale] = numbers(g.getAttribute('transform'));
    assert.ok([x, y, scale].every(Number.isFinite)); assert.ok(scale > 0 && scale <= 1.5);
    // Independent conservative painted hull: ordinary 1.25 strokes, rounded joins/caps;
    // the bolder 1.5-unit rim stays inside this hull. Primitive topology below verifies its limits.
    for (const px of [.375, 17.625]) for (const py of [-.125, 11.125]) assert.ok(inside(x + px * scale, y + py * scale, width, height), `${type} ${width}x${height} painted octagon containment`);
    assertGlyphCaptionClearance(a, b, { left: x + .375 * scale, right: x + 17.625 * scale, top: y - .125 * scale, bottom: y + 11.125 * scale });
    if (width === 120 && height === 55 || [210, 220].includes(width) && height === 90) assert.ok(y - .125 * scale > 2, 'Separated from the thickest selected/dragging border');
    if (width === 120 && height === 55 || [210, 220].includes(width) && height === 90) for (const px of [.375, 17.625]) for (const py of [-.125, 11.125]) {
      const gx = x + px * scale, gy = y + py * scale, cut = Math.min(width / 5, height / 5, 12);
      const distance = Math.min(gx, gy, width - gx, height - gy, ...[gx + gy - cut, width - gx + gy - cut, gx + height - gy - cut, width - gx + height - gy - cut].map(v => v / Math.SQRT2));
      assert.ok(distance - 3.5 / 2 > .5, 'Independent painted badge-to-thickest-border gap exceeds half a logical pixel');
    }
  }
});

test('Stakeholder has only a complete front ellipse and an open horizontal barrel with curved rear silhouette', () => {
  const g = glyphFor('Stakeholder'), [p, e] = g.children; assert.deepEqual([...g.children].map(n => n.tagName), ['path', 'ellipse']);
  assert.deepEqual(p.getAttribute('d').match(/[a-z]/gi), ['M', 'H', 'A', 'H']);
  const [front, top, back, rx, ry, rot, large, sweep, endX, bottom, endFront] = numbers(p.getAttribute('d'));
  const [cx, cy, ex, ey] = attrs(e, 'cx cy rx ry');
  assert.equal(front, cx); assert.equal(endFront, cx); assert.equal(top, cy - ey); assert.equal(bottom, cy + ey); assert.equal(back, endX); assert.equal(rx, ex); assert.equal(ry, ey); assert.deepEqual([rot, large, sweep], [0, 0, 0]);
  assert.ok(cx - back > 2 * rx && back - rx >= 1 && cx + rx <= 17 && top >= .5 && bottom <= 11);
});

test('Driver keeps eight projecting spokes, a bolder circular rim, open sectors and a solid hub', () => {
  const g = glyphFor('Driver'), lines = [...g.querySelectorAll('line')], [rim, hub] = g.querySelectorAll('circle');
  assert.equal(lines.length, 4); assert.equal(g.children.length, 6); assert.ok(rim.classList.contains('motivation-rim')); assert.ok(hub.classList.contains('node-detail-solid')); assert.ok(!rim.classList.contains('node-detail-solid'));
  const [cx, cy, r] = attrs(rim, 'cx cy r'); assert.deepEqual(attrs(hub, 'cx cy'), [cx, cy]); assert.ok(Number(hub.getAttribute('r')) + .625 < r - 1);
  const angles = [];
  for (const l of lines) { const [x1, y1, x2, y2] = attrs(l, 'x1 y1 x2 y2'); assert.equal(x1 + x2, cx * 2); assert.equal(y1 + y2, cy * 2); assert.equal(l.getAttribute('stroke-linecap'), 'round'); for (const [x, y] of [[x1, y1], [x2, y2]]) { assert.ok(Math.hypot(x - cx, y - cy) > r + 1.5); assert.ok(x >= 1 && x <= 17 && y >= .5 && y <= 11); angles.push((Math.atan2(y - cy, x - cx) + Math.PI * 2) % (Math.PI * 2)); } }
  angles.sort((a,b) => a - b); angles.forEach((a,i) => assert.ok(Math.abs(a - i * Math.PI / 4) < 1e-10));
  // Eight independent clear-sector probes: preserve open wheel sectors, not gear-like pinholes.
  for (let i = 0; i < 8; i++) {
    const angle = (i + .5) * Math.PI / 4, px = 2 * Math.cos(angle), py = 2 * Math.sin(angle);
    assert.ok(r - .75 - 2 > .5 && 2 - Number(hub.getAttribute('r')) - .625 > .5);
    for (const line of lines) {
      assert.ok(line.classList.contains('motivation-spoke')); const [x1,y1,x2,y2] = attrs(line,'x1 y1 x2 y2');
      const distance = Math.abs((x2-x1) * (cy+py-y1) - (y2-y1) * (cx+px-x1)) / Math.hypot(x2-x1,y2-y1);
      assert.ok(distance - .6 / 2 > .4, 'Each sector has visible open area between thin spokes');
    }
  }
});

test('Assessment has one open circle and a lower-left handle terminating at its perimeter without an inner slash', () => {
  const [c, l] = glyphFor('Assessment').children; assert.equal(c.tagName, 'circle'); assert.equal(l.tagName, 'line');
  const [cx, cy, r] = attrs(c, 'cx cy r'), [x1, y1, x2, y2] = attrs(l, 'x1 y1 x2 y2');
  assert.ok(x1 < x2 && y1 > y2 && x2 < cx && y2 > cy); assert.ok(Math.abs(Math.hypot(x2 - cx, y2 - cy) - r) < 1e-10);
  assert.ok(cx - r >= 1 && cx + r <= 17 && cy - r >= .5 && y1 <= 11); assert.equal(l.getAttribute('stroke-linecap'), 'round');
});

test('Goal has exactly two open concentric rings separated from a filled central disc', () => {
  const g = glyphFor('Goal'); assert.equal(g.children.length, 3); assert.equal(g.querySelectorAll('circle').length, 3); assert.equal(g.querySelectorAll('.node-detail-solid').length, 1);
  const circles = [...g.children].map(n => attrs(n, 'cx cy r')); assert.ok(g.lastElementChild.classList.contains('node-detail-solid'));
  const [outer, inner, hub] = circles; for (const [cx, cy, r] of circles) { assert.deepEqual([cx,cy], outer.slice(0,2)); assert.ok(cx-r >= 1 && cx+r <= 17 && cy-r >= .5 && cy+r <= 11); }
  assert.ok(outer[2] - inner[2] > 1.25); assert.ok(inner[2] - hub[2] > 1.25);
});

test('Outcome differs from Goal: three open rings precede an opaque incoming head, shaft and two tail branches', () => {
  const g = glyphFor('Outcome'), rings = [...g.querySelectorAll('circle')], [shaft, head] = [...g.children].slice(3);
  assert.equal(rings.length, 3); assert.equal(g.children.length, 5); assert.ok(rings.every(n => !n.classList.contains('node-detail-solid'))); assert.equal(head.tagName, 'polygon'); assert.ok(head.classList.contains('node-detail-solid'));
  const [cx, cy, outer] = attrs(rings[0], 'cx cy r'), radii = rings.map(n => Number(n.getAttribute('r')));
  for (const n of rings) assert.deepEqual(attrs(n, 'cx cy'), [cx, cy]); assert.ok(radii[0] - radii[1] > 1.25 && radii[1] - radii[2] > 1.25 && radii[2] > .625);
  const [tip, a, b] = pts(head); assert.deepEqual(tip, [cx, cy]); assert.ok(a[0] > cx && b[0] > cx && a[1] < cy && b[1] < cy); assert.ok(Math.hypot(a[0]-cx,a[1]-cy) > radii[1]);
  assert.deepEqual(shaft.getAttribute('d').match(/[a-z]/gi), ['M', 'L', 'M', 'V', 'H']);
  const [sx, sy, tx, ty, ax, ay, jy, bx] = numbers(shaft.getAttribute('d')); assert.ok(sx > cx && sy < cy && tx > sx && ty < sy); assert.ok(ax < tx && ay < jy && bx > ax); assert.ok(Math.abs((ax-cx)+(jy-cy)) < 1e-9, 'Tail fork lies on the diagonal shaft');
  assert.ok(cx-outer>=1 && cy-outer>=.5 && cy+outer<=11); assert.ok([tip,a,b].every(([x,y]) => x>=1 && x<=17 && y>=.5 && y<=11));
  assert.equal(g.querySelectorAll('mask,clipPath,marker').length, 0); assert.notEqual(g.innerHTML, glyphFor('Goal').innerHTML);
});

test('Principle has a rounded four-sided enclosure and separated solid stem and dot; Requirement is an outlined parallelogram', () => {
  const [box, stem, dot] = glyphFor('Principle').children; assert.equal(box.tagName, 'rect'); assert.ok(Number(box.getAttribute('rx')) > 0); assert.ok(!box.classList.contains('node-detail-solid'));
  assert.ok(stem.classList.contains('node-detail-solid') && dot.classList.contains('node-detail-solid')); assert.equal(stem.tagName, 'rect'); assert.equal(dot.tagName, 'circle');
  const [x,y,w,h] = attrs(stem,'x y width height'), [cx,cy,r] = attrs(dot,'cx cy r'); assert.equal(x+w/2,cx); assert.ok(cy-r-.625>y+h+.625); assert.ok(cy+r+.625 < Number(box.getAttribute('y'))+Number(box.getAttribute('height'))-.625);
  const g = glyphFor('Requirement'); assert.equal(g.children.length, 1); assert.equal(g.firstElementChild.tagName, 'polygon'); const [a,b,c,d]=pts(g.firstElementChild);
  assert.equal(a[1],b[1]);assert.equal(c[1],d[1]);assert.equal(b[0]-a[0],c[0]-d[0]);assert.equal(a[0]-d[0],b[0]-c[0]);assert.ok(a[0]>d[0] && a[1]<d[1]);assert.ok([a,b,c,d].every(([x,y])=>x>=1&&x<=17&&y>=.5&&y<=11));
});

test('Earlier descriptors retain historical pins and current corner-sized SVG; relationship bytes remain exact', () => {
  assert.equal(Object.keys(fixture.elements).length,35); assert.equal(Object.keys(fixture.relationships).length,15);
  assert.deepEqual(Object.keys(fixture.elements),NOTATION_ELEMENTS.filter(t=>!types.includes(t))); assert.deepEqual(Object.keys(fixture.relationships),NOTATION_RELATIONSHIPS);
  for (const [t, expected] of Object.entries(fixture.elements).filter(([t]) => !['SystemSoftware', 'CommunicationNetwork', 'DistributionNetwork', 'Artifact', 'Material', 'Resource', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage'].includes(t))) { assert.deepEqual(notationElement(ref,t),expected.descriptor); assert.equal(sha(JSON.stringify(fixture.widths.flatMap(width=>fixture.heights.map(height=>(t === 'Meaning' ? notationBox(document,notationElement(ref,t),{width,height}).querySelector('.node-box') : notationBox(document,notationElement(ref,t),{width,height})).outerHTML)))),expected.sha256,t); }
  for (const [t, expected] of Object.entries(fixture.relationships)) { assert.deepEqual(notationRelationship(ref,t),expected.descriptor); assert.equal(sha(JSON.stringify(fixture.widths.flatMap(width=>fixture.heights.flatMap(height=>['canvas','legend',`palette-${t.toLowerCase()}`].map(scope=>notationLine(document,notationRelationship(ref,t),scope).outerHTML))))),expected.sha256,t); }
  assert.equal(sha(notationDefs(document).outerHTML),fixture.defsSHA256);
});

test('Motivation solid-ink/rim selectors stay scoped and preserve each theme/state notation', () => {
  const css = readFileSync(new URL('../style.css',import.meta.url),'utf8').replace(/\/\* Closed remaining-default solid pieces[\s\S]*?(?=\/\* Keep compact toolbar)/, ''), marker='/* Closed Motivation ink pieces override the shared hollow-detail rule only. */';
  const start=css.indexOf(marker),end=css.indexOf('/* Keep compact toolbar',start); assert.ok(start>0&&end>start);
  const addition=css.slice(start,end),dom=new JSDOM(`<style>${css.replaceAll(':focus-visible','.test-focus')}</style>`),doc=dom.window.document;
  for (const rule of addition.matchAll(/([^{}]+)\{[^}]+\}/g)) for (const selector of rule[1].replace(/\/\*[\s\S]*?\*\//g,'').trim().split(',')) { assert.ok(selector.startsWith('.node.notation-motivation')); assert.match(selector,/\.(?:node-detail-solid|motivation-rim|motivation-spoke)$/); }
  for (const theme of ['light','dark']) for (const extended of [false,true]) for (const state of ['',' selected',' test-focus',' dragging']) {
    doc.documentElement.dataset.theme=theme; const host=doc.createElement('div');host.className=`node notation-draft notation-motivation${extended?' notation-extended':''}${state}`;host.append(notationBox(doc,notationElement(ref,'Driver'),{width:220,height:90}),notationBox(doc,notationElement(ref,'Goal'),{width:220,height:90}),notationBox(doc,notationElement(ref,'Outcome'),{width:220,height:90}),notationBox(doc,notationElement(ref,'Principle'),{width:220,height:90}));doc.body.replaceChildren(host);
    const ink=state?'var(--notation-selected)':extended?'#000000':'var(--notation-border)';
    assert.equal(dom.window.getComputedStyle(host.querySelector('.node-box')).strokeDasharray, '', 'The pre-existing focus dash targets rectangles only; octagon focus remains solid');
    for (const n of host.querySelectorAll('.node-detail')) { const style=dom.window.getComputedStyle(n);assert.equal(style.stroke,ink);assert.equal(style.fill,n.classList.contains('node-detail-solid')?ink:'none');assert.equal(style.strokeWidth,n.classList.contains('motivation-rim')?'1.5':n.classList.contains('motivation-spoke')?'.6':'1.25'); }
  }
  dom.window.close();
});

test('Motivation tokens and references reject hostile resources without widening any fallback', () => {
  for (const reference of [null,{}, {...ref,version:999},{...ref,version:String(ref.version)},{...ref,svg:'<svg/>'}]) for (const t of types) { const a=notationElement(reference,t);assert.equal(a.notation,UNKNOWN_NOTATION);assert.equal(a.glyph,undefined);assert.equal(notationBox(document,a,{width:120,height:55}).tagName,'rect'); }
  for (const t of types) for (const v of [t.toLowerCase(),'__proto__','constructor','<svg onload=bad()>','url(https://invalid.test)',{},[t],{toString:()=>t},new String(t),1,true,null]) { assert.equal(notationElement(ref,v).notation,UNKNOWN_NOTATION);if(v!==t.toLowerCase())assert.equal(notationBox(document,{glyph:v,contour:'octagon'},{width:120,height:55}).tagName,'polygon'); }
  for (const t of types) assert.equal(notationBox(document,{glyph:t.toLowerCase()},{width:120,height:55}).tagName,'rect','A glyph alone never replaces the contour');
});

for (const type of types) test(`${type}: independent octagon routes, corner hits, ports, anchors, loops, Fit and model bytes`, () => {
  const a=notationElement(ref,type);
  for (const [width,height] of [[.1,.1],[.1,1000000],[1000000,.1],[38,20],[120,55],[220,90]]) for (const [dx,dy] of [[300,200],[-300,200],[300,-200],[-300,-200],[30,15],[0,0]]) {
    const occurrences=[{id:'a',bounds:{x:0,y:0,width,height}},{id:'b',bounds:{x:dx,y:dy,width:220,height:90}}];
    const host={id:'host',source:{kind:'occurrence',id:'a'},target:{kind:'occurrence',id:'b'},routePoints:[{kind:'anchor',id:'corner',point:{x:0,y:0}},{kind:'anchor',id:'center',point:{x:width/2,y:height/2}},{kind:'anchor',id:'outside',point:{x:-100,y:-100}},{kind:'bend',point:{x:260,y:-60}}],labelPosition:{x:200,y:-90}};
    const connections=[host,{id:'auto',source:host.source,target:host.target,routePoints:[]},{id:'reverse',source:host.target,target:host.source,routePoints:[]},{id:'loop',source:host.source,target:host.source,routePoints:[]},{id:'attached',source:host.target,target:{kind:'connection',id:'host',anchorId:'outside'},routePoints:[]}];
    const bytes=JSON.stringify({occurrences,connections}), actual=()=>a.contour, baseline=()=> 'octagon';
    for (const stored of [false,true]) { for (const c of connections) assert.deepEqual(connectionGeometry(c,occurrences,actual,stored,connections),connectionGeometry(c,occurrences,baseline,stored,connections));assert.deepEqual(viewGeometryBounds(occurrences,connections,actual,stored),viewGeometryBounds(occurrences,connections,baseline,stored)); }
    const c=Math.min(width/5,height/5,12);for(const [x,y] of [[0,0],[width,0],[0,height],[width,height]])assert.equal(inside(x,y,width,height),false);
    for(const [x,y] of octagon(width,height))assert.equal(inside(x,y,width,height),true);
    for(const [vx,vy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[width/2,height/2]]) {
      // Independent eight-half-plane ray oracle, not the descriptor/helper under test.
      const x=width/2,y=height/2,limits=[[x,-vx],[width-x,vx],[y,-vy],[height-y,vy],[x+y-c,-vx-vy],[width-x+y-c,vx-vy],[x+height-y-c,-vx+vy],[width-x+height-y-c,vx+vy]];
      const f=Math.min(...limits.filter(([,v])=>v>0).map(([d,v])=>d/v)),p=contourPoint(occurrences[0].bounds,{x:vx,y:vy},a.contour);
      assert.ok(Math.abs(p.x-(x+f*vx))<1e-7&&Math.abs(p.y-(y+f*vy))<1e-7);
    }
    assert.equal(JSON.stringify({occurrences,connections}),bytes);
  }
});

test('Seven bounded Motivation source locators close only default entries while full alternatives and all acceptance UNKNOWN/HOLD gates remain', () => {
  const ledger = JSON.parse(readFileSync(new URL('../../docs/ARCHIMATE-COVERAGE.json', import.meta.url), 'utf8'));
  for (const [type, figure, printed, pdf] of [['Stakeholder','6-2',53,71],['Driver','6-3',54,72],['Assessment','6-4',54,72],['Goal','6-5',56,74],['Outcome','6-6',57,75],['Principle','6-7',57,75],['Requirement','6-8',58,76]]) {
    const row=ledger.rows.find(r=>r.id===type),a=row.assertions.find(a=>a.predicate==='normative_boxed_motivation_notation');assert.equal(row.normative_assessment,'UNKNOWN');assert.equal(row.mapping.source_shape,'Octagon');assert.equal(row.mapping.implemented_shape,'Octagon');
    assert.equal(a.evidence.sha256,'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');assert.ok(a.evidence.locator.includes(`Figure ${figure}, printed ${printed} / PDF ${pdf}`));assert.ok(a.evidence.locator.includes('Appendix A.2, printed 124 / PDF 142'));assert.ok(row.assertions.some(a=>a.predicate==='draft_notation'&&a.evidence.status==='independent_unofficial_draft'));
  }
  const gap=ledger.gaps.find(g=>g.id==='source_icon_equivalence'),inventory=gap.default_form_inventory;assert.equal(inventory.missing_distinguishing_glyphs.length,0);assert.deepEqual(inventory.incomplete_icon_forms,[]);
  for(const type of types){assert.ok(inventory.bounded_boxed_forms.includes(type));assert.ok(!inventory.missing_distinguishing_glyphs.includes(type));}
  assert.ok(gap.needed.includes('Full support for the displayed boxed/icon repertoire remains a separate open standard-support gap'));assert.equal(ledger.verification_status.independent_persistence_acceptance,'HOLD');assert.equal(ledger.verification_status.windows_acceptance,'UNRUN');assert.ok(ledger.verification_status.relationship_draft_policy.startsWith('IMPLEMENTED_LOCAL_PENDING_DESKTOP_ACCEPTANCE'));
});
