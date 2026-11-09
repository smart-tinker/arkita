import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createProject, createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { notationDefs, notationRelationship, notationLine, notationBox, notationElement } from '../src/notation.js';
import { captionText, renderVisualNode, renderVisualConnector, applyDrawingStyles, applyDrawingGeometryStyles, refreshDrawingTextColors, visualGeometry } from '../src/visual-drawings.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { applyPreferenceView,PREFERENCE_DEFAULTS } from '../src/preferences.js';
import { layoutVisualView, legendEntries, legendColor,legendLayout } from '../src/visual-layout.js';
import { assertSvgExport, exportViewSvg } from '../src/svg-export.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=';
function fixture(t) {
  const dom = new JSDOM('<!doctype html><html><body><svg id="canvas" xmlns="http://www.w3.org/2000/svg"></svg></body></html>', { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { document } = dom.window, canvas = document.getElementById('canvas');
  const sheet = document.createElement('style'); sheet.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8'); document.head.append(sheet);
  document.documentElement.style.setProperty('--canvas', '#ffffff');
  document.body.style.fontFamily = 'Arial';
  const store = createStore(createProject('Model <script>'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Visible view' });
  const { viewId: targetViewId } = run({ type: 'createView', name: 'Destination' });
  const { assetId } = run({ type: 'createAsset', name: 'Dot', mediaType: 'image/png', data: png });
  const add = (kind, fields = {}) => run({ type: 'createVisualNode', viewId, kind, bounds: { x: 20, y: 20, width: 220, height: 140 }, ...fields }).visualNodeId;
  return { store, run, viewId, targetViewId, assetId, add, document, canvas, get state() { return store.snapshot; }, get view() { return store.snapshot.views.find(entry => entry.view.id === viewId); } };
}

test('annotations, view references and images render inertly without allocating semantic concepts', t => {
  const h = fixture(t);
  h.add('note', { text: '<script>window.bad=true</script>\nLong note', name: 'Note' });
  h.add('group', { name: 'Container' });
  h.add('image', { assetId: h.assetId });
  h.add('viewReference', { targetViewId: h.targetViewId });
  const before = exportFiles(h.state);
  for (const item of h.view.visualNodes) h.canvas.append(renderVisualNode(h.document, item, h.state, h.view));
  assert.equal(h.canvas.querySelector('script,foreignObject,img'), null);
  assert.match(h.canvas.textContent, /<script>window.bad=true<\/script>/);
  assert.match(h.canvas.textContent, /Destination/);
  assert.equal(h.canvas.querySelector('image').getAttribute('href'), `data:image/png;base64,${png}`);
  assert.equal(h.state.elements.length, 0); assert.equal(h.state.relationships.length, 0);
  assert.deepEqual(exportFiles(h.state), before);
});

test('templates preserve literal unknown placeholders and repeated property value order', () => {
  const item = { id: 'id', name: '<text>', properties: [{ key: 'team', value: 'B' }, { key: 'team', value: 'A' }] };
  assert.equal(captionText('${name} ${property:team} ${missing} ${model.name}', item, { project: { name: 'Model' } }), '<text> B, A ${missing} Model');
});

test('visual connectors use the shared geometry and remain separate from semantic relationships', t => {
  const h = fixture(t), a = h.add('note', { text: 'A' }), b = h.add('group', { bounds: { x: 400, y: 80, width: 160, height: 100 } });
  const { visualConnectorId } = h.run({ type: 'createVisualConnector', viewId: h.viewId, name: 'Only a visual connector', source: { kind: 'visualNode', id: a }, target: { kind: 'visualNode', id: b } });
  const line = h.view.visualConnectors.find(item => item.id === visualConnectorId), before = exportFiles(h.state);
  const geometry = visualGeometry(line, h.view);
  assert.ok(geometry.d.startsWith('M ')); assert.ok(Number.isFinite(geometry.x)); assert.ok(geometry.bounds.width > 0);
  const element = renderVisualConnector(h.document, line, h.view);
  assert.match(element.getAttribute('aria-label'), /Не отношение ArchiMate/);
  assert.equal(element.querySelector('.line').getAttribute('d'), geometry.d);
  assert.equal(h.state.relationships.length, 0); assert.deepEqual(exportFiles(h.state), before);
});

test('saved gradient and embedded image survive the closed static SVG export', t => {
  const h = fixture(t);
  h.add('note', { text: 'Styled', style: { fill: '#ff0000', gradient: { color: '#0000ff', direction: 'horizontal' }, fontFamily: 'Arial', fontWeight: 'bold', textColor: '#111111' } });
  h.add('image', { assetId: h.assetId, bounds: { x: 280, y: 30, width: 80, height: 80 } });
  h.canvas.append(notationDefs(h.document));
  for (const item of h.view.visualNodes) h.canvas.append(renderVisualNode(h.document, item, h.state, h.view));
  applyDrawingStyles(h.canvas, h.state, h.view);
  const before = exportFiles(h.state);
  const text = exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 600, height: 300 }, title: 'Annotated' });
  assert.equal(assertSvgExport(text), text);
  assert.match(text, /linearGradient/); assert.match(text, /data:image\/png;base64,/); assert.match(text, /url\(#notation-canvas-visual-/);
  assert.deepEqual(exportFiles(h.state), before);
});

test('static SVG refuses external image references and active SVG embedded as an image', () => {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const wrap = href => `${head}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="${href}" width="10" height="10"/></svg>`;
  for (const href of ['https://example.invalid/secret', 'file:///private.png', 'data:text/html;base64,PHNjcmlwdD4=', `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script></svg>').toString('base64')}`]) assert.throws(() => assertSvgExport(wrap(href)));
});


function semanticMarkup(h, view) {
  h.canvas.replaceChildren(notationDefs(h.document));
  for (const occurrence of view.occurrences) {
    const group = h.document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.dataset.kind = 'occurrence'; group.dataset.id = occurrence.id; group.classList.add('node');
    group.innerHTML = '<title>Original name</title><rect class="node-box" width="120" height="60"/><text class="node-type">TYPE</text><text class="node-title">Original caption</text>';
    h.canvas.append(group);
  }
  for (const connection of view.connections) {
    const group = h.document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.dataset.kind = 'connection'; group.dataset.id = connection.id; group.classList.add('connection');
    group.innerHTML = '<title>Relationship</title><path class="line" d="M 0 0 L 100 100"/><text class="relationship-label" x="50" y="50">Label</text>';
    h.canvas.append(group);
  }
}

test('semantic custom contours, template typography and clipping affect the rendered/exported drawing without changing the model', t => {
  const h = fixture(t), state = conceptProject(), view = state.views[0], occurrence = view.occurrences[0], element = state.elements[0];
  element.name = 'A very long caption 🙂 '.repeat(12); element.properties = [{ key: 'owner', value: 'Team A' }, { key: 'owner', value: 'Team B' }];
  occurrence.bounds = { x: 0, y: 0, width: 180, height: 100 };
  occurrence.style = { shape: 'ellipse', fontSize: 20, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'right', verticalAlign: 'bottom', labelTemplate: '${name} ${property:owner}', fill: '#123456', strokeFromFill: true };
  const before = exportFiles(state); semanticMarkup(h, view);
  h.document.defaultView.SVGElement.prototype.getBBox = function () { return { x: Number(this.getAttribute('x') || 0), y: Number(this.getAttribute('y') || 0) - 18, width: Array.from(this.textContent).length * 15, height: 20 }; };
  applyDrawingStyles(h.canvas, state, view); applyDrawingStyles(h.canvas, state, view);
  const group = h.canvas.querySelector(`[data-id="${occurrence.id}"]`), texts = [...group.querySelectorAll('.visual-caption-text')];
  assert.equal(group.querySelectorAll('.custom-drawing-shape').length, 1); assert.equal(group.querySelector('.custom-drawing-shape').tagName, 'ellipse');
  assert.equal(group.querySelector('.node-box:not(.custom-drawing-shape)').style.display, 'none');
  assert.match(group.querySelector('title').textContent, /Team A, Team B/); assert.ok(texts.length > 0);
  for (const text of texts) { const box = text.getBBox(); assert.ok(box.x >= 10 && box.x + box.width <= occurrence.bounds.width - 10); assert.equal(text.style.fontSize, '20px'); assert.equal(text.style.fontWeight, 'bold'); }
  assert.equal(group.querySelector('.visual-caption-header').getAttribute('font-size'), '10');
  assert.match(group.querySelector('.visual-caption').getAttribute('clip-path'), /caption/);
  assert.equal(h.canvas.querySelectorAll(`[id="notation-canvas-visual-${occurrence.id}-caption"]`).length, 1);
  assert.equal(group.querySelector('.custom-drawing-shape').style.stroke, '#123456');
  assert.doesNotThrow(() => exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 900, height: 640 } })); assert.deepEqual(exportFiles(state), before);
  const resized = structuredClone(view); resized.occurrences[0].bounds.width = 240; applyDrawingStyles(h.canvas, state, resized);
  assert.equal(group.querySelector('.custom-drawing-shape').getAttribute('rx'), '120');
  assert.equal(h.canvas.querySelector(`[id="notation-canvas-visual-${occurrence.id}-caption"] rect`).getAttribute('width'), '232');
});

test('specialization images inherit on occurrences, local override wins, repeated paints do not duplicate resources', t => {
  const h = fixture(t), state = customizationProject(), view = state.views[0]; state.assets = h.state.assets;
  state.customizationProfiles[0].imageAssetId = h.assetId;
  const second = { ...state.assets[0], id: h.run({ type: 'createAsset', name: 'Second', mediaType: 'image/png', data: png }).assetId }; state.assets.push(second);
  view.occurrences[0].style = { image: { assetId: second.id, fit: 'cover', position: 'right' } };
  semanticMarkup(h, view); const before = exportFiles(state); applyDrawingStyles(h.canvas, state, view); applyDrawingStyles(h.canvas, state, view);
  const local = h.canvas.querySelector(`[data-id="${view.occurrences[0].id}"]`), inherited = h.canvas.querySelector(`[data-id="${view.occurrences[1].id}"]`);
  assert.ok(Number(inherited.querySelector('image').getAttribute('width')) <= 32); assert.ok(Number(inherited.querySelector('image').getAttribute('width')) < view.occurrences[1].bounds.width);
  assert.equal(local.querySelectorAll('.drawing-image').length, 1); assert.equal(inherited.querySelectorAll('.drawing-image').length, 1);
  assert.equal(local.querySelector('image').getAttribute('preserveAspectRatio'), 'xMaxYMid slice'); assert.equal(inherited.querySelector('image').getAttribute('preserveAspectRatio'), 'xMidYMid meet');
  assert.deepEqual(exportFiles(state), before);
});

test('legend sizing, ordering and color schemes remain pure and the visible bounds follow the saved settings', t => {
  const h = fixture(t), state = conceptProject(), view = state.views[0];
  const id = h.add('legend', { name: 'Legend', legend: { sort: 'name', columns: 2, showRelationships: true, colorScheme: 'monochrome', columnWidth: 180, autoSize: true } });
  view.visualNodes = h.view.visualNodes;
  const before = exportFiles(state), effective = layoutVisualView(state, view), node = effective.visualNodes.find(item => item.id === id);
  assert.equal(node.bounds.width, 380); assert.ok(node.bounds.height > 40); assert.notDeepEqual(node.bounds, view.visualNodes[0].bounds);
  const entries = legendEntries(state, view, node.legend); assert.ok(entries.some(item => item.relationship)); assert.deepEqual(entries.map(item => item.name), entries.map(item => item.name).sort((a,b) => a.localeCompare(b, 'ru', { numeric: true })));
  h.canvas.append(notationDefs(h.document), renderVisualNode(h.document, node, state, effective)); applyDrawingStyles(h.canvas, state, effective);
  assert.equal(h.canvas.querySelectorAll('.legend-label').length, entries.length);
  for (const rect of h.canvas.querySelectorAll('.legend-swatch')) assert.equal(rect.getAttribute('fill'), '#d1d5db');
  const aligned = structuredClone(node); aligned.legend.autoSize = false; aligned.bounds.height = 400; aligned.style = {textAlign:'right',verticalAlign:'bottom',labelTemplate:'${name}: key'}; const right = renderVisualNode(h.document,aligned,state,effective); assert.equal(right.querySelector('.legend-title').getAttribute('text-anchor'),'end'); assert.equal(right.querySelector('.legend-title').textContent,'Legend: key'); assert.ok(Number(right.querySelector('.legend-title').getAttribute('y')) > 100);
  assert.notEqual(legendColor(entries[0], 'pastel'), '#d1d5db'); assert.equal(legendColor(entries[0], 'pastel'), legendColor(entries[0], 'pastel'));
  assert.deepEqual(exportFiles(state), before);
});

test('nested-line hiding requires a declared containing parent, preview offsets stay idempotent, and movement restores the line', t => {
  const h = fixture(t), state = conceptProject(), view = state.views[0], parent = view.occurrences[0], child = view.occurrences[1], line = view.connections[0];
  parent.bounds = { x: 0, y: 0, width: 500, height: 400 }; child.bounds = { x: 100, y: 100, width: 120, height: 80 };
  line.style = { hideWhenNested: true, labelOffset: { x: 20, y: -10 }, labelBackground: '#ffffff', targetEnding: 'triangle' }; semanticMarkup(h, view);
  applyDrawingStyles(h.canvas, state, view); const group = h.canvas.querySelector(`[data-id="${line.id}"]`), label = group.querySelector('text');
  assert.equal(group.style.display, ''); child.parent = { kind: 'occurrence', id: parent.id }; applyDrawingGeometryStyles(h.canvas, view); assert.equal(group.style.display, 'none');
  child.bounds.x = 800; applyDrawingGeometryStyles(h.canvas, view); assert.equal(group.style.display, ''); assert.equal(label.getAttribute('x'), '70'); assert.equal(label.getAttribute('y'), '40');
  label.setAttribute('x', '100'); label.setAttribute('y', '120'); applyDrawingGeometryStyles(h.canvas, view); applyDrawingGeometryStyles(h.canvas, view); assert.equal(label.getAttribute('x'), '120'); assert.equal(label.getAttribute('y'), '110');
  assert.equal(group.querySelectorAll('.line-label-background').length, 1); applyDrawingStyles(h.canvas, state, view); applyDrawingStyles(h.canvas, state, view);
  assert.equal(h.canvas.querySelectorAll(`[id="notation-canvas-visual-${line.id}-target"]`).length, 0);
  line.hidden = true; applyDrawingGeometryStyles(h.canvas, view); assert.equal(group.style.display, 'none');
});

test('visual actor cards, instruction tooltips and a board background survive safe SVG export', t => {
  const h = fixture(t), id = h.add('note', { text: 'An actor', instruction: 'Instruction <inert>', style: { shape: 'actor', textAlign: 'center' } });
  h.run({ type: 'setViewPresentation', viewId: h.viewId, kind: 'sketch', background: '#ddeeff' });
  h.canvas.append(notationDefs(h.document), renderVisualNode(h.document, h.view.visualNodes.find(item => item.id === id), h.state, h.view)); applyDrawingStyles(h.canvas, h.state, h.view);
  assert.ok(h.canvas.querySelector('.actor-card-shape circle')); assert.match(h.canvas.querySelector('title').textContent, /Instruction <inert>/); assert.equal(h.canvas.style.backgroundColor, 'rgb(221, 238, 255)');
  const output = exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 400, height: 300 } }); assert.match(output, /rgb\(221, 238, 255\)/); assert.equal(assertSvgExport(output), output);
});


test('clearing an explicit white background restores the theme projection and theme-colored SVG export', t => {
  const h = fixture(t), root = h.document.documentElement;
  root.style.removeProperty('--canvas'); root.dataset.theme = 'dark';
  h.run({ type: 'setViewPresentation', viewId: h.viewId, background: '#ffffff' });
  applyDrawingStyles(h.canvas, h.state, h.view); assert.equal(h.canvas.style.backgroundColor, 'rgb(255, 255, 255)');
  h.run({ type: 'setViewPresentation', viewId: h.viewId, background: null });
  const before = exportFiles(h.state);
  for (const theme of ['dark', 'light']) {
    root.dataset.theme = theme; applyDrawingStyles(h.canvas, h.state, h.view);
    assert.equal(h.canvas.style.backgroundColor, '');
    const output = exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 400, height: 300 } });
    const exported = new h.document.defaultView.DOMParser().parseFromString(output, 'image/svg+xml');
    assert.equal(exported.querySelector('rect').getAttribute('fill'), h.document.defaultView.getComputedStyle(root).getPropertyValue('--canvas').trim());
    assert.deepEqual(exportFiles(h.state), before);
  }
});

test('local font/wrapping projection changes only display, keeps explicit drawing style, and exports the same bounded caption',t=>{
 const h=fixture(t),state=conceptProject(),source=state.views[0],settings=structuredClone(PREFERENCE_DEFAULTS);state.elements[0].name='Long caption with many words 🙂 '.repeat(15);settings.behavior.captionWrap='ellipsis';settings.display.diagramFont='Arial';settings.display.diagramFontSize=22;settings.display.borderFromFill=true;source.occurrences[0].style={fontSize:12};const before=exportFiles(state),view=applyPreferenceView(source,settings);assert.equal(view.occurrences[0].style.fontSize,12);assert.equal(view.occurrences[0].style.fontFamily,'Arial');assert.deepEqual(view.occurrences[0].bounds,source.occurrences[0].bounds);semanticMarkup(h,view);applyDrawingStyles(h.canvas,state,view);const group=h.canvas.querySelector(`[data-id="${view.occurrences[0].id}"]`);assert.equal(group.querySelectorAll('.visual-caption-text').length,1);assert.match(group.querySelector('.visual-caption-text').textContent,/…$/);assert.equal(group.querySelector('title').textContent,state.elements[0].name);assert.deepEqual(exportFiles(state),before);assert.doesNotThrow(()=>exportViewSvg({canvas:h.canvas,bounds:{x:0,y:0,width:900,height:640}}));
});

test('1000 styled drawings and preview labels update completely with a bounded number of full-canvas walks', {
  skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'performance test runs in Extended CI' : false,
}, t=>{
 const h=fixture(t),state=h.state,view=h.view;view.occurrences=[];view.connections=[];view.visualNodes=[];view.visualConnectors=[];
 for(let i=0;i<1000;i++){
  const id=`node-${i}`,group=h.document.createElementNS('http://www.w3.org/2000/svg','g');group.dataset.kind='visualNode';group.dataset.id=id;group.innerHTML='<rect class="node-box"/><text>Name</text>';h.canvas.append(group);
  view.visualNodes.push({id,kind:'group',name:`Group ${i}`,style:{fill:'#123456'},bounds:{x:i,y:i,width:120,height:80}});
  const lineId=`line-${i}`,line=h.document.createElementNS('http://www.w3.org/2000/svg','g');line.dataset.kind='visualConnector';line.dataset.id=lineId;line.innerHTML='<path class="line"/><text class="relationship-label" x="10" y="20">Label</text>';h.canvas.append(line);
  view.visualConnectors.push({id:lineId,name:`Line ${i}`,style:{labelOffset:{x:2,y:3}},source:{kind:'visualNode',id},target:{kind:'visualNode',id}});
 }
 const before=structuredClone(view),query=h.canvas.querySelector.bind(h.canvas),queryAll=h.canvas.querySelectorAll.bind(h.canvas);let walks=0;h.canvas.querySelector=(...args)=>{walks++;return query(...args);};h.canvas.querySelectorAll=(...args)=>{walks++;return queryAll(...args);};
 applyDrawingStyles(h.canvas,state,view);assert.ok(walks<=3,`full canvas walks: ${walks}`);for(const group of queryAll('[data-kind="visualNode"]'))assert.equal(group.querySelector('.node-box').style.fill,'#123456');for(const label of queryAll('.relationship-label')){assert.equal(label.getAttribute('x'),'12');assert.equal(label.getAttribute('y'),'23');}
 walks=0;applyDrawingGeometryStyles(h.canvas,view);assert.equal(walks,1);for(const label of queryAll('.relationship-label'))assert.equal(label.getAttribute('x'),'12');assert.deepEqual(view,before);
});


test('saved legend labels and rows per column control real layout and export without rewriting the model',t=>{
 const h=fixture(t),state=conceptProject(),view=state.views[0];state.views[0].visualNodes=[];const kinds=['ApplicationComponent','Service','Process','Role','Goal'];const store=createStore(state);for(const type of kinds)store.execute({type:'createElementAndOccurrence',viewId:view.view.id,elementType:type,name:type,bounds:{x:100,y:100,width:120,height:70}},store.revision);const id=store.execute({type:'createVisualNode',viewId:view.view.id,kind:'legend',name:'Легенда',bounds:{x:0,y:0,width:300,height:200},legend:{sort:'type',columns:1,showRelationships:false,autoSize:true,rowsPerColumn:2,labels:[{type:'Service',label:'Наш сервис'}]}},store.revision).created.visualNodeId;const snapshot=store.snapshot,entry=snapshot.views[0],legend=entry.visualNodes.find(item=>item.id===id),before=exportFiles(snapshot),layout=legendLayout(snapshot,entry,legend);assert.equal(layout.rows,2);assert.equal(layout.columns,Math.ceil(layout.entries.length/2));assert.ok(layout.entries.some(item=>item.name==='Наш сервис'));const rendered=renderVisualNode(h.document,legend,snapshot,entry);h.canvas.replaceChildren(notationDefs(h.document),rendered);applyDrawingStyles(h.canvas,snapshot,entry);const labels=[...h.canvas.querySelectorAll('.legend-label')];assert.equal(labels.length,layout.entries.length);assert.equal(labels[0].getAttribute('x'),labels[1].getAttribute('x'));assert.notEqual(labels[0].getAttribute('y'),labels[1].getAttribute('y'));assert.notEqual(labels[1].getAttribute('x'),labels[2].getAttribute('x'));const xml=exportViewSvg({canvas:h.canvas,bounds:layout.bounds,title:'Legend'});assert.match(xml,/Наш сервис/);assert.equal(assertSvgExport(xml),xml);assert.deepEqual(exportFiles(snapshot),before);
});

test('legend specialization filters/custom colors use real catalogue glyphs and reference templates read target view data',t=>{
 const h=fixture(t),state=customizationProject(),view=state.views[0],profileId=state.customizationProfiles[0].id;const legend={id:h.add('legend'),kind:'legend',name:'Legend',documentation:'',properties:[],bounds:{x:0,y:0,width:600,height:1000},zIndex:0,parent:null,style:{},legend:{sort:'name',columns:1,showRelationships:false,showElements:false,showSpecializations:true,colors:[{profileId,color:'#123456'}]}};view.visualNodes.push(legend);const entries=legendEntries(state,view,legend.legend);assert.equal(entries.length,5,'each specialization/base type pair is deduplicated across repeated drawings');assert.equal(entries[0].profileId,profileId);assert.equal(legendColor(entries[0]),'#123456');h.canvas.append(renderVisualNode(h.document,legend,state,view));assert.ok(h.canvas.querySelector('.legend-type-symbol .node-box,.legend-type-symbol .line'));assert.equal(h.canvas.querySelector('.legend-swatch').getAttribute('fill'),'#123456');const exported=exportViewSvg({canvas:h.canvas,bounds:legend.bounds,title:'Specializations'});assert.equal(assertSvgExport(exported),exported);assert.match(exported,/#123456/);
 const id=h.add('viewReference',{targetViewId:h.targetViewId,style:{labelTemplate:'${name} / ${documentation}'}}),ref=h.view.visualNodes.find(item=>item.id===id);h.canvas.replaceChildren(notationDefs(h.document),renderVisualNode(h.document,ref,h.state,h.view));applyDrawingStyles(h.canvas,h.state,h.view);assert.match(h.canvas.textContent,/Destination/);assert.doesNotMatch(h.canvas.textContent,/\$\{name\}/);
});
test('local image off/automatic glyph and all position choices have an actual saved/exported effect without overlapping the caption area',t=>{
 const h=fixture(t),state=customizationProject(),view=state.views[0];state.assets=h.state.assets;const node=view.occurrences[0];node.style={image:{assetId:h.assetId,fit:'contain',position:'left'}};semanticMarkup(h,view);applyDrawingStyles(h.canvas,state,view);const group=h.canvas.querySelector(`[data-id="${node.id}"]`),left=Number(group.querySelector('image').getAttribute('x'));assert.match(group.querySelector('.visual-caption').getAttribute('transform'),/^translate\(/);node.style.image.position='right';applyDrawingStyles(h.canvas,state,view);assert.ok(Number(group.querySelector('image').getAttribute('x'))>left);node.style.imageVisible=false;applyDrawingStyles(h.canvas,state,view);assert.equal(group.querySelector('image'),null);assert.equal(node.style.image.position,'right');
});

test('semantic arbitrary dashes/endings never override typed markers or dash; visual connectors retain independent endings in render and export',t=>{
 const h=fixture(t),store=createStore(conceptProject()),initial=store.snapshot,viewId=initial.views[0].view.id;store.execute({type:'createVisualConnector',viewId,name:'Visual only',source:{kind:'occurrence',id:initial.views[0].occurrences[0].id},target:{kind:'occurrence',id:initial.views[0].occurrences[1].id},style:{sourceEnding:'circle',targetEnding:'diamond'}},store.revision);const state=store.snapshot,view=state.views[0],line=view.connections[0],relationship=state.relationships.find(item=>item.id===line.relationshipId);relationship.type='Flow';line.style={strokeDash:'dot',sourceEnding:'circle',targetEnding:'diamond'};semanticMarkup(h,view);const group=h.canvas.querySelector(`[data-id="${line.id}"]`),path=notationLine(h.document,notationRelationship(state.project.metamodel,relationship.type));path.setAttribute('d','M 0 0 L 100 100');group.setAttribute('class',notationRelationship(state.project.metamodel,relationship.type).className);group.querySelector('.line').replaceWith(path);h.canvas.append(renderVisualConnector(h.document,view.visualConnectors[0],view));const typed={start:path.getAttribute('marker-start'),end:path.getAttribute('marker-end'),dash:path.getAttribute('stroke-dasharray')};assert.ok(typed.start||typed.end,'the regression must exercise an actual typed marker');path.style.strokeDasharray='9 1';const before=exportFiles(state);applyDrawingStyles(h.canvas,state,view);applyDrawingStyles(h.canvas,state,view);assert.equal(path.style.strokeDasharray,'');assert.equal(path.getAttribute('marker-start'),typed.start);assert.equal(path.getAttribute('marker-end'),typed.end);assert.equal(path.getAttribute('stroke-dasharray'),typed.dash);const visual=h.canvas.querySelector('[data-kind="visualConnector"] .line');assert.match(visual.getAttribute('marker-start'),/visual-.*-source/);assert.match(visual.getAttribute('marker-end'),/visual-.*-target/);assert.match(h.canvas.dataset.semanticStyleWarning,/не применяются/);assert.equal(h.canvas.querySelectorAll('[data-semantic-style-warning]').length,1);assert.equal(group.querySelectorAll('[data-semantic-line-style-warning]').length,1);const svg=exportViewSvg({canvas:h.canvas,bounds:{x:0,y:0,width:900,height:640},title:'Safe typed notation'});assert.equal(assertSvgExport(svg),svg);assert.match(svg,/не применяются/);const exported=new h.document.defaultView.DOMParser().parseFromString(svg,'image/svg+xml'),semantic=[...exported.querySelectorAll('g')].find(item=>item.querySelector(':scope > desc')?.textContent.includes('не применяются')),exportedPath=semantic.querySelector('path');assert.equal(exportedPath.getAttribute('marker-start'),typed.start);assert.equal(exportedPath.getAttribute('marker-end'),typed.end);assert.equal(exportedPath.getAttribute('stroke-dasharray'),typed.dash);assert.deepEqual(exportFiles(state),before);
});

test('valid font ink taller than nominal line spacing keeps group and multiline note captions clipped in render and export', t => {
  const h = fixture(t), groupId = h.add('group', { name: 'Заметки', bounds: { x: 20, y: 20, width: 520, height: 240 } }), noteId = h.add('note', { name: 'Примечание', text: 'Первая строка\nВторая строка fi ffi', bounds: { x: 40, y: 65, width: 260, height: 110 }, parent: { kind: 'visualNode', id: groupId } }), shortId = h.add('note', { text: 'A long narrow line which must be truncated', bounds: { x: 600, y: 20, width: 80, height: 45 } });
  const state = h.state, view = h.view, before = exportFiles(state); h.canvas.append(notationDefs(h.document));
  for (const item of view.visualNodes) h.canvas.append(renderVisualNode(h.document, item, state, view));
  let tallMeasurements = 0;
  h.document.defaultView.SVGElement.prototype.getBBox = function () {
    const size = Number.parseFloat(this.style.fontSize || this.getAttribute('font-size')) || 14, height = size * 1.5;
    if (this.classList.contains('visual-caption-text')) { assert.ok(height > size * 1.3); tallMeasurements++; }
    const width = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(this.textContent)].length * size * .7;
    return { x: Number(this.getAttribute('x') || 0), y: Number(this.getAttribute('y') || 0) - size * 1.1, width, height };
  };
  applyDrawingStyles(h.canvas, state, view); applyDrawingStyles(h.canvas, state, view);
  const caption = id => h.canvas.querySelector(`[data-id="${id}"] .visual-caption`), texts = id => [...caption(id).querySelectorAll('.visual-caption-text')];
  assert.equal(texts(groupId).map(item => item.textContent).join(''), 'Заметки');
  assert.deepEqual(texts(noteId).map(item => item.textContent), ['Первая строка', 'Вторая строка fi ffi']);
  assert.ok(Number(texts(noteId)[1].getAttribute('y')) > Number(texts(noteId)[0].getAttribute('y')), 'explicit lines retain separate baselines');
  assert.match(texts(shortId)[0].textContent, /…$/); assert.ok(texts(shortId)[0].getBBox().width <= 60, 'measured horizontal ellipsis remains bounded');
  for (const item of view.visualNodes) {
    const wrapper = caption(item.id), clipId = /^url\(#([^)]*)\)$/.exec(wrapper.getAttribute('clip-path'))?.[1], clip = h.canvas.querySelector(`[id="${clipId}"] rect`);
    assert.ok(clip); assert.equal(Number(clip.getAttribute('x')), 4); assert.equal(Number(clip.getAttribute('y')), 3); assert.equal(Number(clip.getAttribute('width')), item.bounds.width - 8); assert.equal(Number(clip.getAttribute('height')), item.bounds.height - 6);
    for (const text of texts(item.id)) assert.ok(text.textContent, 'font metrics never erase a legitimate caption');
  }
  assert.ok(tallMeasurements >= 4, 'connected rendering measured the taller font ink');
  const output = exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 700, height: 300 } }); assert.equal(assertSvgExport(output), output);
  const exported = new h.document.defaultView.DOMParser().parseFromString(output, 'image/svg+xml');
  for (const label of ['Заметки', 'Первая строка', 'Вторая строка fi ffi']) assert.ok([...exported.querySelectorAll('text')].some(text => text.textContent === label), `export retains ${label}`);
  assert.ok(exported.querySelector('g[clip-path]')); assert.deepEqual(exportFiles(state), before);
});


test('styled right/center/left captions with tall font ink avoid the enlarged Device corner without changing model data', t => {
  const h = fixture(t), state = conceptProject(), view = state.views[0], item = view.occurrences[0], record = state.elements.find(value => value.id === item.concept.id);
  record.type = 'Device'; record.name = 'Имя устройства для проверки широкой подписи'; item.bounds = { x: 0, y: 0, width: 220, height: 90 };
  h.document.defaultView.SVGElement.prototype.getBBox = function () {
    const size = Number.parseFloat(this.style.fontSize || this.getAttribute('font-size')) || 14, width = [...this.textContent].length * size * .55;
    const x = Number(this.getAttribute('x')) || 0, anchor = this.getAttribute('text-anchor');
    return { x: x - (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0), y: (Number(this.getAttribute('y')) || 0) - size * 1.2, width, height: size * 1.5 };
  };
  for (const textAlign of ['left', 'center', 'right']) {
    item.style = { fontSize: 14, fontFamily: 'Segoe UI', textAlign, verticalAlign: 'top' };
    const before = exportFiles(state); semanticMarkup(h, view);
    const group = h.canvas.querySelector(`[data-id="${item.id}"]`);
    group.querySelector('.node-box').replaceWith(notationBox(h.document, notationElement(state.project.metamodel, record.type), item.bounds));
    applyDrawingStyles(h.canvas, state, view);
    const texts = [...group.querySelectorAll('.visual-caption-text')]; assert.ok(texts.length > 1);
    // Independently transformed Device stroke hull: scale1.4, origin186/6, local ink[1.375,19.625]×[.375,16.625].
    for (const text of texts) {
      const ink = text.getBBox();
      assert.ok(ink.x + ink.width <= 187.925 || ink.x >= 213.475 || ink.y + ink.height <= 6.525 || ink.y >= 29.275, textAlign);
    }
    assert.equal(group.querySelector('title').textContent, record.name);
    const output = exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 400, height: 300 } }); assert.equal(assertSvgExport(output), output);
    assert.deepEqual(exportFiles(state), before);
  }
});

function displayedRgb(document, text) {
  const root = document.defaultView.getComputedStyle(document.documentElement);
  let value = document.defaultView.getComputedStyle(text).fill.replace(/var\((--[\w-]+)\)/g, (_, key) => root.getPropertyValue(key).trim());
  if (value.startsWith('#')) return value.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  return value.match(/[\d.]+/g).slice(0, 3).map(Number);
}
function textContrast(rgb, background) {
  const luminance = values => values.map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const a = luminance(rgb), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
test('default group and discussion-board text contrasts with custom fills in either theme and exports without model changes', t => {
  const h = fixture(t), colors = ['#F7FAFF', '#fff0b8', '#dcebd4', '#111827'];
  const ids = colors.map((fill, index) => h.add(index ? 'note' : 'group', { name: `Title ${index}`, ...(index ? { text: `Note ${index}` } : {}), style: { fill } }));
  const explicit = h.add('note', { text: 'Chosen red', style: { fill: '#ffffff', textColor: '#ff0000' } });
  const state = h.state, view = h.view, before = exportFiles(state);
  h.canvas.append(notationDefs(h.document)); for (const item of view.visualNodes) h.canvas.append(renderVisualNode(h.document, item, state, view));
  for (const theme of ['dark', 'light', 'dark']) {
    h.document.documentElement.dataset.theme = theme; applyDrawingStyles(h.canvas, state, view);
    ids.forEach((id, i) => { const text = h.canvas.querySelector(`[data-id="${id}"] text`), fill = colors[i].slice(1).match(/../g).map(value => parseInt(value, 16)); assert.ok(textContrast(displayedRgb(h.document, text), fill) >= 4.5, `${theme}: ${colors[i]}`); });
    assert.equal(h.canvas.querySelector(`[data-id="${explicit}"] text`).style.fill, '#ff0000');
  }
  const output = exportViewSvg({ canvas: h.canvas, bounds: { x: 0, y: 0, width: 400, height: 300 } }); assert.equal(assertSvgExport(output), output);
  const exported = new h.document.defaultView.DOMParser().parseFromString(output, 'image/svg+xml');
  const groupText = [...exported.querySelectorAll('text')].find(text => text.textContent === 'Title 0'); assert.ok(groupText); assert.match(groupText.getAttribute('fill'), /#000000|rgb\(0, 0, 0\)/);
  assert.deepEqual(exportFiles(state), before);
});
test('transparent groups use their painted ancestors and alpha compositing, independent of model order', t => {
  const h = fixture(t); h.document.documentElement.dataset.theme = 'dark'; h.document.documentElement.style.setProperty('--canvas', '#000000');
  const parent = h.run({ type: 'createElementAndOccurrence', viewId: h.viewId, elementType: 'Service', name: 'Light parent', bounds: { x: 0, y: 0, width: 600, height: 500 }, style: { fill: '#ffffff' } });
  const nested = h.add('group', { name: 'Transparent parent', parent: { kind: 'occurrence', id: parent.occurrenceId }, style: { fill: 'none' } });
  const child = h.add('group', { name: 'Transparent child', parent: { kind: 'visualNode', id: nested }, style: { fill: '#12345600' } });
  const opaque = h.add('group', { name: 'Almost opaque', style: { fill: '#ffffff', fillOpacity: .9 } });
  const faint = h.add('group', { name: 'Mostly transparent', style: { fill: '#ffffff', fillOpacity: .1 } });
  const state = h.state, view = h.view; view.visualNodes.reverse(); const before = exportFiles(state);
  semanticMarkup(h, view); for (const item of view.visualNodes) h.canvas.append(renderVisualNode(h.document, item, state, view)); applyDrawingStyles(h.canvas, state, view);
  for (const [id, background] of [[nested, [255,255,255]], [child, [255,255,255]], [opaque, [229.5,229.5,229.5]], [faint, [25.5,25.5,25.5]]]) {
    assert.ok(textContrast(displayedRgb(h.document, h.canvas.querySelector(`[data-id="${id}"] text`)), background) >= 4.5, id);
  }
  assert.deepEqual(exportFiles(state), before);
});
test('theme-only text refresh preserves existing nodes, selection, inline input and dialogs while recalculating alpha fills', t => {
  const h = fixture(t), id = h.add('group', { name: 'Alpha', style: { fill: '#000000', fillOpacity: .5 } }), state = h.state, view = h.view, before = exportFiles(state);
  h.document.documentElement.dataset.theme = 'light'; h.document.documentElement.style.setProperty('--canvas', '#ffffff');
  h.canvas.append(notationDefs(h.document), renderVisualNode(h.document, view.visualNodes[0], state, view)); applyDrawingStyles(h.canvas, state, view);
  const group = h.canvas.querySelector(`[data-id="${id}"]`), text = group.querySelector('text'); group.classList.add('selected'); assert.ok(textContrast(displayedRgb(h.document, text), [127.5,127.5,127.5]) >= 4.5);
  const input = h.document.createElement('input'), dialog = h.document.createElement('dialog'); input.value = 'Unsaved name'; dialog.setAttribute('open', ''); h.document.body.append(input, dialog); input.focus();
  h.document.documentElement.dataset.theme = 'dark'; h.document.documentElement.style.setProperty('--canvas', '#000000'); refreshDrawingTextColors(h.canvas, view);
  assert.equal(group.querySelector('text'), text); assert.equal(h.document.activeElement, input); assert.equal(input.value, 'Unsaved name'); assert.ok(dialog.open); assert.ok(group.classList.contains('selected'));
  assert.ok(textContrast(displayedRgb(h.document, text), [0,0,0]) >= 4.5); assert.deepEqual(exportFiles(state), before);
});

test('external stereotype/junction and actor/image captions retain their own CSS backgrounds; explicit text colors still win', t => {
  const h = fixture(t); h.document.documentElement.dataset.theme = 'dark'; h.document.documentElement.style.setProperty('--canvas', '#121c2c');
  const element = h.run({ type: 'createElementAndOccurrence', viewId: h.viewId, elementType: 'Service', name: 'Inside', bounds: { x: 0, y: 0, width: 220, height: 100 }, style: { fill: '#ffffff' } });
  const junction = h.run({ type: 'createJunctionAndOccurrence', viewId: h.viewId, junctionType: 'AndJunction', name: 'Outside junction', bounds: { x: 250, y: 0, width: 24, height: 24 }, style: { fill: '#ffffff' } });
  const actor = h.add('group', { name: 'Actor caption', style: { shape: 'actor', fill: '#ffffff' } }), image = h.add('image', { name: 'Image caption', assetId: h.assetId, style: { fill: '#ffffff' } });
  const state = h.state, view = h.view, before = exportFiles(state); semanticMarkup(h, view);
  const elementGroup = h.canvas.querySelector(`[data-id="${element.occurrenceId}"]`), junctionGroup = h.canvas.querySelector(`[data-id="${junction.occurrenceId}"]`);
  elementGroup.insertAdjacentHTML('beforeend', '<text class="stereotype-label" x="110" y="-9">Outside stereotype</text>');
  junctionGroup.setAttribute('class', 'junction junction-and'); junctionGroup.innerHTML = '<circle class="node-box" cx="12" cy="12" r="12"/><text class="junction-caption" x="12" y="42">Outside junction</text>';
  for (const node of view.visualNodes) h.canvas.append(renderVisualNode(h.document, node, state, view));
  applyDrawingStyles(h.canvas, state, view);
  assert.equal(elementGroup.querySelector('.node-title').style.fill, '#000000');
  for (const text of h.canvas.querySelectorAll('.stereotype-label,.junction-caption,.visual-group text,.visual-image text')) { assert.equal(text.style.fill, ''); assert.deepEqual(displayedRgb(h.document, text), [230,238,251]); }
  assert.deepEqual(exportFiles(state), before);
  for (const item of [...view.occurrences, ...view.visualNodes]) item.style.textColor = '#ff0000'; const explicit = exportFiles(state);
  applyDrawingStyles(h.canvas, state, view); refreshDrawingTextColors(h.canvas, view);
  for (const text of h.canvas.querySelectorAll('.stereotype-label,.junction-caption,.visual-group text,.visual-image text')) assert.equal(text.style.fill, '#ff0000');
  assert.deepEqual(exportFiles(state), explicit); assert.ok(actor && image);
});
test('computed zero fill opacity remains transparent when deciding automatic text contrast', t => {
  const h = fixture(t); h.document.documentElement.dataset.theme = 'dark'; h.run({ type: 'setViewPresentation', viewId: h.viewId, background: '#000000' });
  h.add('group', { name: 'Invisible fill' }); const state = h.state, view = h.view, sheet = h.document.createElement('style');
  sheet.textContent = '.visual-group .node-box { fill:#ffffff; fill-opacity:0; }'; h.document.head.append(sheet);
  h.canvas.append(renderVisualNode(h.document, view.visualNodes[0], state, view)); applyDrawingStyles(h.canvas, state, view);
  assert.ok(textContrast(displayedRgb(h.document, h.canvas.querySelector('text')), [0,0,0]) >= 4.5);
});
