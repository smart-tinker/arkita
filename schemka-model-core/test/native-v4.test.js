import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ASSET_LIMITS, rasterImageSize, svgImageSize } from '../src/asset-images.js';
import { createProject, createStore, exportFiles, importFiles, readProjectFiles, normalizeProject, validateProject, validateProjectV2, validateProjectV3, captureFragment, mergeProjectFiles, metadataRecord, assetUsages, moveDrawingGeometry, conceptTypeChangeImpact, LIMITS } from '../src/index.js';
import { metadataFixture, metadataV3Fixture, metadataV2State } from '../fixtures/metadata-compatibility.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { validateInactiveSvg } from '../src/native-v4.js';

const bounds = (x = 0, y = 0) => ({ x, y, width: 120, height: 80 });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#123456"/></svg>';
const base64 = value => Buffer.from(value).toString('base64');
const execute = store => command => store.execute(command, store.revision);
function rich() {
  const store = createStore(conceptProject()), run = execute(store), viewId = store.snapshot.views[0].view.id;
  const assetId = run({ type: 'createAsset', name: 'Icon', mediaType: 'image/svg+xml', data: base64(svg) }).created.assetId;
  const group = run({ type: 'createVisualNode', viewId, kind: 'group', name: 'Group', bounds: bounds(100, 100), properties: [{ key: 'same', value: 'one' }, { key: 'same', value: 'two' }] }).created.visualNodeId;
  const note = run({ type: 'createVisualNode', viewId, kind: 'note', text: '<literal>\r\n🙂', parent: { kind: 'visualNode', id: group }, bounds: bounds(110, 110), style: { fill: '#ffee99', image: { assetId, fit: 'contain', position: 'center' } } }).created.visualNodeId;
  run({ type: 'createVisualNode', viewId, kind: 'image', assetId, bounds: bounds(300, 100) });
  run({ type: 'createVisualNode', viewId, kind: 'viewReference', targetViewId: store.snapshot.views[1].view.id, bounds: bounds(500, 100) });
  run({ type: 'createVisualNode', viewId, kind: 'legend', legend: { sort: 'type', columns: 2, showRelationships: true, colorScheme: 'pastel', columnWidth: 120.1, autoSize: true }, bounds: bounds(700, 100) });
  const connector = run({ type: 'createVisualConnector', viewId, source: { kind: 'visualNode', id: group }, target: { kind: 'visualNode', id: note }, routePoints: [{ kind: 'bend', point: { x: 20, y: 30 } }], labelPosition: { x: 40, y: 50 }, style: { stroke: '#112233', targetEnding: 'arrow', lineStyle: 'orthogonal' } }).created.visualConnectorId;
  const folder = run({ type: 'createFolder', name: 'Architecture', members: [{ kind: 'view', id: viewId }, { kind: 'element', id: store.snapshot.elements[0].id }] }).created.folderId;
  return { store, run, viewId, assetId, group, note, connector, folder };
}
function rawV3() {
  const state = metadataV2State();
  state.project.formatVersion = 3; state.project.documentation = ''; state.project.properties = {};
  for (const item of state.relationships) item.documentation = '';
  for (const entry of state.views) entry.view.properties = {};
  return state;
}

test('V4 writer defaults are closed, while captured V2/V3 bytes validate before detached migration', () => {
  const fresh = createProject('V4'); assert.equal(fresh.project.formatVersion, 4); assert.deepEqual(fresh.project.properties, []); assert.deepEqual(fresh.folders, []); assert.deepEqual(fresh.assets, []);
  validateProjectV2(metadataV2State()); validateProjectV3(rawV3());
  for (const fixture of [metadataFixture(), metadataV3Fixture()]) {
    const before = structuredClone(fixture), { state, sourceVersion } = readProjectFiles(fixture.files);
    assert.ok([2, 3].includes(sourceVersion)); assert.equal(state.project.formatVersion, 4);
    assert.ok(Array.isArray(state.project.properties));
    for (const entry of state.views) { assert.deepEqual(entry.visualNodes, []); for (const item of entry.occurrences) { assert.equal(item.parent, null); assert.ok(!Object.hasOwn(item, 'parentOccurrenceId')); assert.deepEqual(item.style, {}); } }
    assert.deepEqual(fixture, before); assert.deepEqual(importFiles(exportFiles(state)), state);
  }
  const wrong = rawV3(); wrong.folders = []; assert.throws(() => normalizeProject(wrong), error => error.code === 'SCHEMA');
  const future = structuredClone(fresh); future.project.formatVersion = 5; assert.throws(() => normalizeProject(future), error => error.code === 'VERSION');
});

test('native/envelope/Git preserve folders, visual records, resources, duplicate property rows and exact geometry', () => {
  const { store } = rich(), state = store.snapshot, files = exportFiles(state), bytes = serializeProjectFile(state);
  assert.ok(files.some(file => file.path.startsWith('model/folders/'))); assert.ok(files.some(file => file.path.startsWith('assets/'))); assert.ok(files.some(file => file.path.includes('/visual-nodes/'))); assert.ok(files.some(file => file.path.includes('/visual-connectors/')));
  assert.deepEqual(deserializeProjectFile(bytes), importFiles(files)); assert.deepEqual(serializeProjectFile(importFiles(files)), bytes);
  const local = structuredClone(state), remote = structuredClone(state); local.project.name = 'Local'; remote.views[0].visualNodes.find(item => item.kind === 'note').text = 'Remote';
  const inputs = [files, exportFiles(local), exportFiles(remote)], before = structuredClone(inputs);
  const merged = mergeProjectFiles(...inputs); assert.equal(merged.structuralError, null); assert.deepEqual(merged.conflicts, []);
  const result = importFiles(merged.files); assert.equal(result.project.name, 'Local'); assert.equal(result.views[0].visualNodes.find(item => item.kind === 'note').text, 'Remote'); assert.deepEqual(inputs, before);
});

test('all eight metadata owners retain ordered duplicate/empty keys with exact Undo/Redo', () => {
  const { store, run, viewId, group, connector, folder } = rich();
  const state = store.snapshot;
  const owners = [{ kind: 'project', id: state.project.id }, { kind: 'element', id: state.elements[0].id }, { kind: 'junction', id: state.junctions[0].id }, { kind: 'relationship', id: state.relationships[0].id }, { kind: 'view', id: viewId }, { kind: 'folder', id: folder }, { kind: 'visualNode', viewId, id: group }, { kind: 'visualConnector', viewId, id: connector }];
  for (const owner of owners) {
    const before = store.exportFiles(), properties = [{ key: '', value: 'one' }, { key: 'same', value: 'two' }, { key: 'same', value: 'three' }];
    run({ type: 'updateMetadata', owner, documentation: 'Exact\r\n🙂', properties }); const after = store.exportFiles();
    assert.deepEqual(metadataRecord(store.snapshot, owner).properties, properties);
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  }
  assert.throws(() => metadataRecord(store.snapshot, { kind: 'visualNode', id: group }), error => error.code === 'REFERENCE');
});

test('folder parent/member edits are atomic, cycles and multiple owners are refused, deletion retains concepts/children', () => {
  const { store, run, folder } = rich();
  const child = run({ type: 'createFolder', name: 'Child', parentFolderId: folder }).created.folderId;
  const before = store.exportFiles(), history = store.history;
  assert.throws(() => run({ type: 'updateFolder', folderId: folder, parentFolderId: child }), error => error.code === 'REFERENCE');
  assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, history);
  const member = store.snapshot.folders.find(item => item.id === folder).members[0];
  assert.throws(() => run({ type: 'createFolder', name: 'Duplicate', members: [member] }), error => error.code === 'REFERENCE');
  run({ type: 'moveFolderMembers', members: [member], folderId: child });
  assert.deepEqual(store.snapshot.folders.find(item => item.id === child).members, [member]);
  run({ type: 'deleteFolder', folderId: folder }); assert.equal(store.snapshot.folders.find(item => item.id === child).parentFolderId, null); assert.ok(store.snapshot.elements.length > 0);
});

test('typed geometric parent cycles/cross-view refs and semantic endpoint substitution fail without losing Undo', () => {
  const { store, run, viewId, group, note } = rich(), before = store.exportFiles(), history = store.history;
  for (const command of [
    { type: 'reparentDrawing', viewId, drawing: { kind: 'visualNode', id: group }, parent: { kind: 'visualNode', id: note } },
    { type: 'reparentDrawing', viewId: store.snapshot.views[1].view.id, drawing: { kind: 'visualNode', id: note }, parent: { kind: 'visualNode', id: group } },
    { type: 'reparentDrawing', viewId, drawing: { kind: 'visualNode', id: group }, parent: { kind: 'visualNode', id: group } },
  ]) assert.throws(() => run(command), error => error.code === 'REFERENCE');
  assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, history);
  const state = store.snapshot; state.views[0].connections[0].source = { kind: 'visualNode', id: group };
  assert.throws(() => validateProject(state), error => error.code === 'REFERENCE');
});

test('moving a container moves descendants and only fully internal routes; deletion retains children', () => {
  const { store, run, viewId, group, note, connector } = rich();
  const before = store.exportFiles();
  run({ type: 'moveDrawings', viewId, drawings: [{ kind: 'visualNode', id: group }, { kind: 'visualNode', id: note }], dx: 30.1, dy: -20.2 });
  const entry = store.snapshot.views[0]; assert.equal(entry.visualNodes.find(item => item.id === group).bounds.x, 130.1); assert.equal(entry.visualNodes.find(item => item.id === note).bounds.x, 140.1);
  assert.deepEqual(entry.visualConnectors.find(item => item.id === connector).routePoints[0].point, { x: 50.1, y: 9.8 });
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); store.redo(store.revision);
  run({ type: 'removeVisualNode', viewId, nodeId: group });
  const after = store.snapshot.views[0]; assert.equal(after.visualNodes.find(item => item.id === note).parent, null); assert.ok(!after.visualConnectors.some(item => item.id === connector));
  assert.equal(after.visualNodes.find(item => item.id === note).bounds.x, 140.1);
});

test('duplicateView and both paste modes remap drawing parents/anchors and retain shared portable assets', () => {
  const { store, run, viewId, group, note, assetId } = rich(), original = store.snapshot.views[0];
  const duplicate = run({ type: 'duplicateView', viewId, name: 'Copy' }).created.viewId;
  const copy = store.snapshot.views.find(entry => entry.view.id === duplicate);
  assert.notEqual(copy.visualNodes[0].id, original.visualNodes[0].id); assert.deepEqual(copy.visualNodes[1].parent, { kind: 'visualNode', id: copy.visualNodes[0].id });
  for (const mode of ['reuse', 'clone']) {
    const fragment = captureFragment(store.snapshot, viewId, [{ kind: 'visualNode', id: group }]);
    const made = run({ type: 'pasteFragment', viewId: duplicate, fragment, mode, dx: 200, dy: 100 }).created;
    const pasted = store.snapshot.views.find(entry => entry.view.id === duplicate).visualNodes.filter(item => made.visualNodeIds.includes(item.id));
    assert.equal(pasted.length, 2); assert.equal(pasted.find(item => item.kind === 'note').parent.id, pasted.find(item => item.kind === 'group').id); assert.equal(pasted.find(item => item.kind === 'note').style.image.assetId, assetId);
  }
  const childOnly = captureFragment(store.snapshot, viewId, [{ kind: 'visualNode', id: note }]);
  const made = run({ type: 'pasteFragment', viewId: duplicate, fragment: childOnly, mode: 'reuse', dx: 0, dy: 0 }).created;
  assert.equal(store.snapshot.views.find(entry => entry.view.id === duplicate).visualNodes.find(item => item.id === made.visualNodeIds[0]).parent, null);
});

test('used assets cannot be deleted; strict inactive SVG rejects scripting, loading and unknown vocabulary at every boundary', () => {
  const { store, run, assetId } = rich(); assert.equal(assetUsages(store.snapshot, assetId).length, 2);
  assert.throws(() => run({ type: 'deleteAsset', assetId }), error => error.code === 'REFERENCE');
  assert.equal(validateInactiveSvg(svg), svg);
  for (const source of [
    '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"/>', '<svg><image href="https://example.com/x.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>', '<svg><foreignObject/></svg>', '<svg><style>path{fill:url(https://example.com)}</style></svg>',
    '<svg><path fill="url(https://example.com)"/></svg>', '<svg><path style="fill:red"/></svg>', '<svg><g></svg>', '<svg/><svg/>', '<svg><path fill="url(#missing)"/></svg>',
  ]) {
    assert.throws(() => validateInactiveSvg(source), error => ['ASSET_SVG', 'LIMIT'].includes(error.code), source);
    assert.throws(() => run({ type: 'createAsset', name: 'Bad', mediaType: 'image/svg+xml', data: base64(source) }), error => ['ASSET_SVG', 'LIMIT'].includes(error.code));
  }
  const files = store.exportFiles(), asset = files.find(file => file.path.startsWith('assets/')); const record = JSON.parse(asset.content); record.data = base64('<svg onload="evil()"/>'); asset.content = JSON.stringify(record);
  assert.throws(() => importFiles(files), error => error.code === 'ASSET_SVG'); assert.throws(() => mergeProjectFiles(files, files, files), error => error.code === 'ASSET_SVG');
});

function assertSvgValidationFinishes(source, label) {
  const moduleUrl = new URL('../src/native-v4.js', import.meta.url).href;
  const script = `import { readFileSync } from 'node:fs'; import { validateInactiveSvg } from ${JSON.stringify(moduleUrl)}; try { validateInactiveSvg(readFileSync(0, 'utf8')); process.exitCode = 1; } catch (error) { if (!['ASSET_SVG', 'LIMIT'].includes(error.code)) throw error; }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { input: source, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined, `${label}: child timed out or failed to start`);
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
}

test('invalid SVG tag with long whitespace is rejected without quadratic regex work', () => {
  assertSvgValidationFinishes(`<svg><${' '.repeat(100000)}></svg>`, 'tag whitespace');
});

test('invalid SVG transform sequence is rejected without exponential regex work', () => {
  assertSvgValidationFinishes(`<svg><g transform="${'scale(\t)\t'.repeat(100)}x"/></svg>`, 'transform repetition');
});

test('direct SVG validation enforces the model file-size bound', () => {
  assert.throws(() => validateInactiveSvg(' '.repeat(LIMITS.fileBytes + 1)), { code: 'LIMIT' });
  assert.throws(() => validateInactiveSvg('🙂'.repeat(LIMITS.fileBytes / 4 + 1)), { code: 'LIMIT' });
});

test('strict style/reference errors and resource budgets leave candidate and history unchanged', () => {
  const { store, run, viewId, group } = rich(), before = store.exportFiles(), history = store.history;
  for (const style of [{ fill: 'url(https://example.com)' }, { strokeWidth: -1 }, { fontSize: 10000 }, { unknown: 'silent' }, { image: { assetId: 'missing', fit: 'contain', position: 'center' } }]) assert.throws(() => run({ type: 'updateDrawingStyle', viewId, drawing: { kind: 'visualNode', id: group }, style }));
  assert.throws(() => run({ type: 'createAsset', name: 'Too big', mediaType: 'image/svg+xml', data: 'A'.repeat(262148) }), error => error.code === 'ASSET');
  assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, history);
});

function pngHeader(width, height) {
  // Full chunk framing; pixel decompression/CRC validation belongs to the image decoder.
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes;
}
function jpegHeader(width, height) {
  const bytes = Uint8Array.from([255,216,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0,255,218,0,12,3,1,0,2,0,3,0,0,63,0,0,255,217]);
  return bytes;
}
function webpHeader(width, height, extended = false) {
  const chunk = Buffer.alloc(14); chunk.write('VP8L'); chunk.writeUInt32LE(5, 4); chunk[8] = 47; chunk.writeUInt32LE(((height-1)*16384+(width-1)) >>> 0,9);
  const extra = Buffer.alloc(extended ? 18 : 0);
  if (extended) { extra.write('VP8X'); extra.writeUInt32LE(10,4); extra.writeUIntLE(width-1,12,3); extra.writeUIntLE(height-1,15,3); }
  const header = Buffer.alloc(12); header.write('RIFF'); header.writeUInt32LE(extra.length+chunk.length+4,4); header.write('WEBP',8); return Buffer.concat([header,extra,chunk]);
}
test('image headers enforce per-side and pixel budgets across PNG/JPEG/WebP and SVG without decoding pixels', () => {
  for (const [type, make] of [['image/png',pngHeader],['image/jpeg',jpegHeader],['image/webp',webpHeader]]) {
    assert.deepEqual(rasterImageSize(make(320,240),type),{width:320,height:240});
    assert.throws(()=>rasterImageSize(make(8193,1),type),{code:'ASSET_DIMENSIONS'});
    assert.throws(()=>rasterImageSize(make(8192,8192),type),{code:'ASSET_DIMENSIONS'});
    assert.throws(()=>rasterImageSize(make(320,240).slice(0,15),type),{code:'ASSET'});
  }
  assert.deepEqual(rasterImageSize(webpHeader(320,240,true),'image/webp'),{width:320,height:240});
  const webp=webpHeader(320,240,true);webp.writeUIntLE(500,24,3);assert.throws(()=>rasterImageSize(webp,'image/webp'),{code:'ASSET'});
  const jpeg=jpegHeader(320,240); jpeg[5]=16;assert.throws(()=>rasterImageSize(jpeg,'image/jpeg'),{code:'ASSET'});
  for(const source of ['<svg width="100%"/>','<svg width="1e999"/>','<svg width="9000" height="1"/>','<svg viewBox="0 0 8192 8192"/>','<svg viewBox="0 0 1"/>']) assert.throws(()=>svgImageSize(source),{code:'ASSET_DIMENSIONS'});
  assert.deepEqual(svgImageSize(svg),{width:20,height:20});assert.deepEqual(svgImageSize('<svg/>'),{width:300,height:150});
});
test('aggregate declared image pixels are bounded before a fifth 16-megapixel resource reaches history', () => {
  const store=createStore(createProject('Images')),run=execute(store),data=base64(pngHeader(4096,4096));
  for(let i=0;i<ASSET_LIMITS.totalPixels/ASSET_LIMITS.pixels;i++)run({type:'createAsset',name:String(i),mediaType:'image/png',data});
  const before=store.exportFiles(),history=store.history;
  assert.throws(()=>run({type:'createAsset',name:'Over budget',mediaType:'image/png',data}),{code:'ASSET_DIMENSIONS'});
  assert.deepEqual(store.exportFiles(),before);assert.deepEqual(store.history,history);
});

test('type-change preview checks incident relationships, execution refuses new forbidden edges and preserves history', () => {
  const store=createStore(createProject('Types')),run=execute(store),viewId=run({type:'createView',name:'View'}).created.viewId;
  const a=run({type:'createElementAndOccurrence',viewId,elementType:'Service',name:'A',bounds:bounds()}).created;
  const b=run({type:'createElementAndOccurrence',viewId,elementType:'Process',name:'B',bounds:bounds(200)}).created;
  const relation=run({type:'createRelationshipAndConnection',viewId,source:{kind:'occurrence',id:a.occurrenceId},target:{kind:'occurrence',id:b.occurrenceId},relationshipType:'Serving',label:''}).created.relationshipId;
  const concept={kind:'element',id:a.elementId},before=store.exportFiles(),history=store.history;
  const preview=conceptTypeChangeImpact(store.snapshot,concept,'DataObject');assert.ok(preview.relationshipIds.includes(relation));assert.equal(preview.newBlockers.length,1);
  assert.throws(()=>run({type:'changeConceptType',concept,conceptType:'DataObject'}),{code:'RELATIONSHIP_FORBIDDEN'});assert.deepEqual(store.exportFiles(),before);assert.deepEqual(store.history,history);
  run({type:'changeConceptType',concept,conceptType:'Device'});assert.equal(store.snapshot.elements[0].type,'Device');store.undo(store.revision);assert.deepEqual(store.exportFiles(),before);store.redo(store.revision);assert.equal(store.snapshot.elements[0].type,'Device');
});
test('specialization images are V4-only shared resources and local drawing overrides remain independent', () => {
  const {store,run,viewId,assetId,group}=rich();
  const profileId=run({type:'createCustomizationProfile',definition:{name:'Special',purpose:'specialization',targets:[{kind:'element',type:'Grouping'}],attributes:{}}}).created.profileId;
  run({type:'setCustomizationProfileImage',profileId,assetId});assert.equal(store.snapshot.customizationProfiles[0].imageAssetId,assetId);
  assert.ok(assetUsages(store.snapshot,assetId).some(ref=>ref.kind==='customizationProfile'));
  const original=store.snapshot.views[0].visualNodes.find(item=>item.id===group).style;
  run({type:'updateDrawingStyle',viewId,drawing:{kind:'visualNode',id:group},style:{fill:'#123456'}});assert.equal(store.snapshot.customizationProfiles[0].imageAssetId,assetId);
  run({type:'setCustomizationProfileImage',profileId,assetId:null});assert.ok(!Object.hasOwn(store.snapshot.customizationProfiles[0],'imageAssetId'));
  const legacy=rawV3();legacy.customizationProfiles=[{...store.snapshot.customizationProfiles[0],imageAssetId:assetId}];assert.throws(()=>validateProjectV3(legacy),{code:'SCHEMA'});
});

test('Canvas/Sketch presentation, visual instructions and actor shape roundtrip while frozen readers refuse these fields', () => {
  const {store,run,viewId,note}=rich();run({type:'setViewPresentation',viewId,kind:'canvas',background:'#123456'});run({type:'updateVisualNode',viewId,nodeId:note,instruction:'Put ideas here\r\n',style:{shape:'actor'}});
  const state=store.snapshot,files=store.exportFiles();assert.deepEqual(exportFiles(deserializeProjectFile(serializeProjectFile(state))),files);
  const fragment=captureFragment(state,viewId,[{kind:'visualNode',id:note}]);assert.equal(fragment.visualNodes[0].instruction,'Put ideas here\r\n');assert.equal(fragment.visualNodes[0].style.shape,'actor');
  const old=rawV3();old.views[0].view.kind='canvas';assert.throws(()=>validateProjectV3(old),{code:'SCHEMA'});
  const wrong=store.snapshot;wrong.views[0].occurrences[0].style={shape:'actor'};assert.throws(()=>validateProject(wrong),{code:'STYLE'});
});

test('drawing locks protect geometry, appearance and deletion centrally, including snapshot/unlock bypasses and local visual metadata, while shared concept metadata stays editable', () => {
  const {store,run,viewId,group,connector}=rich(),entry=store.snapshot.views[0];
  const refs=[{kind:'occurrence',id:entry.occurrences[0].id},{kind:'connection',id:entry.connections[0].id},{kind:'visualNode',id:group},{kind:'visualConnector',id:connector}];
  for(const drawing of refs)run({type:'setDrawingLocked',viewId,drawing,locked:true});
  const before=store.exportFiles(),history=store.history;
  for(const drawing of refs)assert.throws(()=>run({type:'updateDrawingStyle',viewId,drawing,style:{stroke:'#123456'}}),{code:'DRAWING_LOCKED'});
  assert.throws(()=>run({type:'moveDrawings',viewId,drawings:[refs[0]],dx:10,dy:0}),{code:'DRAWING_LOCKED'});
  assert.throws(()=>run({type:'removeVisualNode',viewId,nodeId:group}),{code:'DRAWING_LOCKED'});
  assert.deepEqual(store.exportFiles(),before);assert.deepEqual(store.history,history);
  const bypass=store.snapshot,bypassed=bypass.views[0].visualNodes.find(item=>item.id===group);bypassed.locked=false;bypassed.bounds.x+=10;assert.throws(()=>run({type:'applyProjectSnapshot',files:exportFiles(bypass)}),{code:'DRAWING_LOCKED'});
  assert.deepEqual(store.exportFiles(),before);
  assert.throws(()=>run({type:'updateMetadata',owner:{kind:'visualNode',viewId,id:group},documentation:'Locked local content'}),{code:'DRAWING_LOCKED'});
  const concept=entry.occurrences[0].concept;run({type:'updateMetadata',owner:concept,documentation:'Shared concept metadata remains editable'});assert.equal(store.snapshot.elements.find(item=>item.id===concept.id).documentation,'Shared concept metadata remains editable');
  run({type:'setDrawingLocked',viewId,drawing:{kind:'visualNode',id:group},locked:false});run({type:'updateDrawingStyle',viewId,drawing:{kind:'visualNode',id:group},style:{stroke:'#123456'}});assert.equal(store.snapshot.views[0].visualNodes.find(item=>item.id===group).style.stroke,'#123456');
  const legend=store.snapshot.views[0].visualNodes.find(item=>item.kind==='legend');run({type:'setDrawingLocked',viewId,drawing:{kind:'visualNode',id:legend.id},locked:true});const legendBefore=store.exportFiles();assert.throws(()=>run({type:'updateVisualNode',viewId,nodeId:legend.id,legend:{...legend.legend,columns:1}}),{code:'DRAWING_LOCKED'});assert.deepEqual(store.exportFiles(),legendBefore);
  const files=store.exportFiles();assert.deepEqual(exportFiles(importFiles(files)),files);const fragment=captureFragment(store.snapshot,viewId,[refs[0]]);assert.equal(fragment.occurrences[0].locked,true);
});
