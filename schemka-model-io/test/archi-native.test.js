import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { previewArchiXml, importArchiXml, collectArchiMappings } from '../src/archi-native.js';
import { serializeProjectFile, deserializeProjectFile } from '../src/project-file.js';
import { remapProject } from '../src/model-transfer.js';
import { exportFiles } from '../../schemka-model-core/src/index.js';
const { DOMParser } = new JSDOM('').window;
const fixture = await readFile(new URL('./fixtures/archi-v5-synthetic.archimate', import.meta.url), 'utf8');
const options = { DOMParser };
const element = (id, type, extra = '') => `<element xsi:type="archimate:${type}" id="${id}" name="${id}" ${extra}/>`;
const xml = content => `<?xml version="1.0" encoding="UTF-8"?><archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" id="model" name="Migration" version="5.0.0"><folder id="folder" name="Folder">${content}</folder></archimate:model>`;

test('preview collects unrelated type, relationship, geometry and extension issues without a candidate', () => {
  const incoming = xml(element('gap', 'Gap') + element('unknown', 'VendorElement') + element('actor', 'BusinessActor') + element('rel', 'AssociationRelationship', 'source="actor" target="missing"') + '<element xsi:type="archimate:ArchimateDiagramModel" id="view" name="Broken"><child xsi:type="archimate:DiagramObject" id="shape" archimateElement="actor" foreign="value"><bounds x="bad" y="2" width="-1" height="0"/></child><child xsi:type="archimate:DiagramModelImage" id="image"><bounds x="1" y="2" width="30" height="40"/></child></element>');
  const before = incoming, result = previewArchiXml(incoming, options);
  assert.equal(result.snapshot, null); assert.equal(incoming, before);
  for (const id of ['gap', 'unknown', 'rel', 'shape', 'image']) assert.ok(result.diagnostics.errors.some(row => row.sourceId === id), id);
  assert.ok(result.diagnostics.errors.some(row => row.sourceId === 'shape' && row.field === 'x' && row.viewId === 'view' && row.viewName === 'Broken'));
  assert.ok(result.diagnostics.losses.some(row => row.sourceId === 'shape' && row.field === 'foreign'));
  assert.equal(result.decisions[0].selected, ''); assert.deepEqual(result.decisions[0].options, ['Assessment']);
  assert.throws(() => importArchiXml(incoming, options), error => error.diagnostics.errors.length === result.diagnostics.errors.length);
});

test('Gap is individually opt-in, IDs remain stable across reruns and source properties are untouched', () => {
  const incoming = xml(element('gap1', 'Gap') + element('gap2', 'Gap') + '<element xsi:type="archimate:BusinessService" id="service" name="Service"><property key="source.id" value="user-owned"/><property key="dup" value="1"/><property key="dup" value="2"/></element>');
  const first = previewArchiXml(incoming, options), second = previewArchiXml(incoming, { ...options, ids: first.ids, decisions: { gap1: 'Assessment' } });
  assert.equal(first.snapshot, null); assert.equal(second.snapshot, null); assert.deepEqual(second.ids, first.ids);
  assert.equal(second.decisions.find(row => row.sourceId === 'gap1').selected, 'Assessment');
  assert.equal(second.diagnostics.errors.filter(row => row.code === 'ARCHI_MAPPING_REQUIRED').length, 1);
  const applied = previewArchiXml(incoming, { ...options, ids: first.ids, decisions: { gap1: 'Assessment', gap2: 'Assessment' } });
  assert.ok(applied.snapshot, JSON.stringify(applied.diagnostics.errors)); assert.deepEqual(applied.ids, first.ids);
  const gap = applied.snapshot.elements.find(row => row.archiSource.id === 'gap1'); assert.equal(gap.type, 'Assessment'); assert.equal(gap.archiSource.domain, 'Implementation');
  const service = applied.snapshot.elements.find(row => row.archiSource.id === 'service'); assert.equal(service.type, 'Service'); assert.equal(service.archiSource.domain, 'Business'); assert.equal(service.archiSource.type, 'BusinessService');
  assert.deepEqual(service.properties, [{ key: 'source.id', value: 'user-owned' }, { key: 'dup', value: '1' }, { key: 'dup', value: '2' }]);
  assert.equal(previewArchiXml(incoming, { ...options, decisions: { gap1: 'delete', gap2: 'Assessment' } }).snapshot, null);
});

test('source mapping for every native record survives exact reopen and independent UUID copies', () => {
  const result = importArchiXml(fixture, options), reopened = deserializeProjectFile(serializeProjectFile(result.snapshot));
  assert.deepEqual(collectArchiMappings(reopened), result.mappings);
  assert.equal(result.mappings.length, Object.keys(result.ids).length);
  for (const mapping of result.mappings) { assert.equal(mapping.sourceModelId, 'model'); assert.equal(mapping.sourceVersion, '5.0.0'); assert.equal(mapping.targetId, result.ids[mapping.sourceId]); }
  const connection = result.mappings.find(row => row.kind === 'connection'); assert.equal(connection.sourceId, 'line'); assert.equal(connection.viewId, 'view'); assert.equal(connection.viewName, 'Nested');
  const copied = remapProject(reopened).snapshot, rows = collectArchiMappings(copied);
  assert.deepEqual(rows.map(row => row.sourceId), result.mappings.map(row => row.sourceId)); assert.notEqual(rows[0].targetId, result.mappings[0].targetId);
});

test('nested relative Draw2D bends become absolute stored points and labels/styles survive reopening', () => {
  const incoming = fixture.replace('id="a" archimateElement="actor"', 'id="a" archimateElement="actor" font="1|Segoe UI|12|1|WINDOWS|1|" textAlignment="4" textPosition="2" lineWidth="2" alpha="128" fillColor="#aabbcc"').replace('id="line" source=', 'id="line" textPosition="2" fontColor="#112233" source=');
  const result = importArchiXml(incoming, options), view = result.snapshot.views[0], line = view.connections[0], a = view.occurrences[0];
  assert.deepEqual(a.bounds, { x: 120, y: 130, width: 100, height: 50 }); assert.deepEqual(line.routePoints, [{ kind: 'bend', point: { x: 295, y: 180 } }]);
  assert.equal(line.style.labelAnchor, 'target'); assert.equal(line.style.textColor, '#112233');
  assert.deepEqual(a.style, { fill: '#aabbcc', strokeWidth: 2, fillOpacity: 128 / 255, textAlign: 'right', verticalAlign: 'bottom', fontFamily: 'Segoe UI', fontSize: 16, fontWeight: 'bold' });
  assert.ok(result.diagnostics.transformations.some(row => row.code === 'ARCHI_ROUTE' && row.sourceId === 'line'));
  assert.ok(result.diagnostics.losses.some(row => row.code === 'ARCHI_LABEL_METRICS' && row.sourceId === 'line' && row.viewId === 'view'));
  assert.deepEqual(exportFiles(deserializeProjectFile(serializeProjectFile(result.snapshot))), exportFiles(result.snapshot));
});

test('direction mismatches, duplicate IDs and unsupported versions cannot produce an applicable model', () => {
  const mismatch = previewArchiXml(fixture.replace('source="a" target="r"', 'source="r" target="a"'), options);
  assert.equal(mismatch.snapshot, null); assert.ok(mismatch.diagnostics.errors.some(row => row.code === 'ARCHI_CONNECTION_DIRECTION' && row.sourceId === 'line'));
  assert.ok(previewArchiXml(xml(element('same', 'BusinessActor') + element('same', 'BusinessRole')), options).diagnostics.errors.some(row => row.code === 'ARCHI_ID'));
  for (const incoming of [fixture.replace('version="5.0.0"', 'version="4.9.0"'), new Uint8Array([80, 75, 3, 4]), '<!DOCTYPE bad><model/>']) assert.equal(previewArchiXml(incoming, options).snapshot, null);
});

test('known Draw2D and native feature limitations are explicit instead of false exact-route claims', () => {
  const incoming = fixture.replace('id="view" name="Nested"', 'id="view" name="Nested" connectionRouterType="2"').replace('<bendpoint', '<feature name="textRelativePosition" value="4"/><bendpoint');
  const result = importArchiXml(incoming, options);
  assert.equal(result.snapshot.views[0].view.router, 'orthogonal'); assert.deepEqual(result.snapshot.views[0].connections[0].routePoints, []);
  assert.ok(result.diagnostics.losses.some(row => row.code === 'ARCHI_ROUTER' && row.sourceId === 'view'));
  assert.ok(result.diagnostics.losses.some(row => row.code === 'ARCHI_CONNECTION_FEATURE' && row.sourceId === 'line'));
  assert.ok(!result.losses.some(message => message.includes('Exchange XSD')));
});

test('all independent relationship blockers are reported after the chosen type conversion', () => {
  const incoming = xml(element('gap', 'Gap') + element('actor', 'BusinessActor') + element('r1', 'ServingRelationship', 'source="gap" target="actor"') + element('r2', 'ServingRelationship', 'source="gap" target="actor"'));
  const result = previewArchiXml(incoming, { ...options, decisions: { gap: 'Assessment' } });
  assert.equal(result.snapshot, null); assert.deepEqual(result.diagnostics.errors.filter(row => row.code === 'IMPORT_RELATIONSHIP').map(row => row.sourceId), ['r1', 'r2']);
});

test('one common source concept remains one native concept in multiple views', () => {
  const incoming = fixture.replace('</folder>\n <purpose>', '<element xsi:type="archimate:ArchimateDiagramModel" id="shared-view" name="Shared"><child xsi:type="archimate:DiagramObject" id="shared-drawing" archimateElement="actor"><bounds x="10" y="20" width="100" height="50"/></child></element></folder>\n <purpose>');
  const result = importArchiXml(incoming, options), occurrences = result.snapshot.views.flatMap(entry => entry.occurrences).filter(item => item.concept.id === result.ids.actor);
  assert.equal(result.snapshot.elements.filter(item => item.archiSource.id === 'actor').length, 1); assert.equal(occurrences.length, 2); assert.equal(new Set(occurrences.map(item => item.id)).size, 2);
});

test('long source header and malformed supplied identity map report blockers without hiding other records', () => {
  const incoming = xml(element('bad', 'Unsupported')).replace('name="Migration"', `name="${'x'.repeat(8193)}"`), result = previewArchiXml(incoming, options);
  assert.equal(result.snapshot, null); assert.ok(result.diagnostics.errors.some(row => row.sourceId === 'model' && row.field === 'name')); assert.ok(result.diagnostics.errors.some(row => row.sourceId === 'bad' && row.field === 'type'));
  const invalid = previewArchiXml(fixture, { ...options, ids: { actor: 'view-not-a-native-element' } }); assert.equal(invalid.snapshot, null); assert.ok(invalid.diagnostics.errors.some(row => row.sourceId === 'actor' && row.code === 'ARCHI_ID_MAP'));
});

test('invalid diagram geometry cannot hide an independent forbidden semantic relationship', () => {
  const incoming = fixture.replace('AssociationRelationship', 'AccessRelationship').replace('width="100"', 'width="-100"'), result = previewArchiXml(incoming, options);
  assert.equal(result.snapshot, null); assert.ok(result.diagnostics.errors.some(row => row.code === 'GEOMETRY' && row.sourceId === 'a'));
  assert.ok(result.diagnostics.errors.some(row => row.code === 'IMPORT_RELATIONSHIP' && row.sourceId === 'relation'));
});

test('semantic decisions and errors identify all source views even for drawings not retained', () => {
  const incoming = xml(element('gap', 'Gap') + ['v1', 'v2'].map(id => `<element xsi:type="archimate:ArchimateDiagramModel" id="${id}" name="${id}"><child xsi:type="archimate:DiagramObject" id="shape-${id}" archimateElement="gap"><bounds x="10" y="20" width="100" height="50"/></child></element>`).join(''));
  const pending = previewArchiXml(incoming, options), issue = pending.diagnostics.errors.find(row => row.sourceId === 'gap');
  assert.equal(pending.snapshot, null); assert.deepEqual(issue.affectedViews, [{ id: 'v1', name: 'v1' }, { id: 'v2', name: 'v2' }]);
  const resolved = previewArchiXml(incoming, { ...options, ids: pending.ids, decisions: { gap: 'Assessment' } });
  assert.ok(resolved.snapshot); assert.deepEqual(resolved.diagnostics.transformations.find(row => row.code === 'ARCHI_GAP').affectedViews, issue.affectedViews);
  const unsupported = previewArchiXml(incoming.replace('archimate:Gap', 'archimate:UnknownConcept'), options);
  assert.equal(unsupported.snapshot, null); assert.deepEqual(unsupported.diagnostics.errors.find(row => row.sourceId === 'gap').affectedViews, issue.affectedViews);
});
