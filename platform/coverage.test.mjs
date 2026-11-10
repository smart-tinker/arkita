import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CURRENT_CATALOG, CURRENT_METAMODEL, createProject, exportFiles, importFiles, FORMAT_VERSION, LIMITS } from '../schemka-model-core/src/index.js';
import { CURRENT_PROFILE, assessMultiplicity, assessProject, createRegistry, evaluateRelationship, getVerifiedRelationshipDecision, getVerifiedRelationshipCoverage } from '../schemka-model-profiles/src/index.js';
import { DRAFT_NOTATION, NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, notationElement, notationRelationship } from '../schemka-model-ui/src/notation.js';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const matrix = read('docs/ARCHIMATE-COVERAGE.json');
const elements = read('docs/ELEMENT-SOURCES.json');
const relationships = read('docs/RELATIONSHIP-SOURCES.json');
const endpointFacts = read('docs/ENDPOINT-RULES.json');
const sorted = values => [...values].sort();
const frozenHashes = {
  'ontology.ttl': '1df66d66b01bacc315499ffbf9d33be22a3858e9d5690352b653154b1728caf7',
  'notation.ttl': '9f75eef817d0665c9ad540b8bdd82c130214aa4254c4b8ebb12b36ef831938f1',
  'notice.html': 'dc835caa397437613d011e7dc03f0f17507c90d04d1b6390590be89263965fbf',
};
const elementDomains = [
  ['Common', '#E5DFD3', ['Role', 'Collaboration', 'Path', 'Service', 'Process', 'Function', 'Event', 'Grouping', 'Location']],
  ['Motivation', '#CBCBFF', ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Meaning', 'Value']],
  ['Strategy', '#F5DEAA', ['Resource', 'Capability', 'ValueStream', 'CourseOfAction']],
  ['Business', '#FFFFB5', ['BusinessActor', 'BusinessInterface', 'BusinessObject', 'Product']],
  ['Application', '#AFFFFF', ['ApplicationComponent', 'ApplicationInterface', 'DataObject']],
  ['Technology', '#AFFFAF', ['Node', 'TechnologyInterface', 'Device', 'SystemSoftware', 'Equipment', 'Facility', 'CommunicationNetwork', 'DistributionNetwork', 'Artifact', 'Material']],
  ['Implementation and Migration', '#FFE0E0', ['WorkPackage', 'Deliverable', 'Plateau']],
];
const sourceShapes = Object.fromEntries([
  ...['Service', 'Process', 'Function', 'Event', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage'].map(id => [id, 'RoundedRectangle']),
  ...['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement'].map(id => [id, 'Octagon']),
  ...['Device', 'Equipment', 'Facility', 'Plateau'].map(id => [id, 'Box3D']),
  ...['DataObject', 'BusinessObject'].map(id => [id, 'BandedRectangle']),
  ['Product', 'TabbedRectangle'], ['Grouping', 'Folder'], ['Meaning', 'Cloud'], ['Value', 'Ellipse'], ['Deliverable', 'WavyRectangle'],
]);
const shapeOnly = new Set(['DataObject', 'BusinessObject', 'Product', 'Grouping', 'Meaning', 'Value', 'WorkPackage', 'Deliverable']);
const relationshipFacts = [
  ['Composition', 'SolidLine', 'FilledDiamond', 'NoDecoration'],
  ['Aggregation', 'SolidLine', 'HollowDiamond', 'NoDecoration'],
  ['Assignment', 'SolidLine', 'CircleDot', 'ClosedArrowhead'],
  ['Realization', 'DottedLine', 'NoDecoration', 'HollowArrowhead'],
  ['Serving', 'SolidLine', 'NoDecoration', 'OpenArrowhead'],
  ['Access', 'DottedLine', 'NoDecoration', 'NoDecoration'],
  ['Influence', 'DashedLine', 'NoDecoration', 'OpenArrowhead'],
  ['Association', 'SolidLine', 'NoDecoration', 'NoDecoration'],
  ['Triggering', 'SolidLine', 'NoDecoration', 'ClosedArrowhead'],
  ['Flow', 'DashedLine', 'NoDecoration', 'ClosedArrowhead'],
  ['Specialization', 'SolidLine', 'NoDecoration', 'HollowArrowhead'],
  ['ReadAccess', 'DottedLine', 'OpenArrowhead', 'NoDecoration'],
  ['WriteAccess', 'DottedLine', 'NoDecoration', 'OpenArrowhead'],
  ['ReadWriteAccess', 'DottedLine', 'OpenArrowhead', 'OpenArrowhead'],
  ['DirectedAssociation', 'SolidLine', 'NoDecoration', 'HalfArrowhead'],
];
const variants = { ReadAccess: 'Access', WriteAccess: 'Access', ReadWriteAccess: 'Access', DirectedAssociation: 'Association' };
const markerToken = { NoDecoration: null, FilledDiamond: 'filled-diamond', HollowDiamond: 'hollow-diamond', CircleDot: 'dot', ClosedArrowhead: 'closed', HollowArrowhead: 'hollow', OpenArrowhead: 'open', HalfArrowhead: 'half' };
const lineToken = { SolidLine: 'solid', DottedLine: 'dotted', DashedLine: 'dashed' };

test('Coverage ledger describes exactly one current catalogue and resolves all evidence paths', () => {
  assert.equal(matrix.schema, 'schemka-am4-coverage@2');
  assert.deepEqual(matrix.baseline.metamodel, CURRENT_METAMODEL);
  assert.deepEqual(CURRENT_METAMODEL, { id: 'schemka-archimate4', version: 2 });
  assert.equal(matrix.baseline.element_count, 42);
  assert.equal(matrix.baseline.relationship_count, 15);
  assert.equal(matrix.baseline.base_relationship_count, 11);
  assert.equal(matrix.baseline.nominal_variant_count, 4);
  assert.equal(matrix.baseline.language_coverage, 'partial');
  assert.equal(matrix.baseline.normative_conformance, 'UNKNOWN');
  assert.equal(matrix.baseline.official_complete_catalogue_denominator, null);
  assert.equal(new Set(matrix.rows.map(row => row.id)).size, 57);
  for (const [kind, ids, notation] of [['element', CURRENT_CATALOG.elementTypes, NOTATION_ELEMENTS], ['relationship', CURRENT_CATALOG.relationshipTypes, NOTATION_RELATIONSHIPS]]) {
    assert.deepEqual(sorted(matrix.rows.filter(row => row.kind === kind).map(row => row.id)), sorted(ids));
    assert.deepEqual(sorted(ids), sorted(notation));
  }
  assert.deepEqual(sorted(CURRENT_CATALOG.elementTypes), sorted(elementDomains.flatMap(([, , ids]) => ids)));
  assert.deepEqual(sorted(CURRENT_CATALOG.relationshipTypes), sorted(relationshipFacts.map(([id]) => id)));
  assert.deepEqual(CURRENT_PROFILE.rules, []);
  for (const row of matrix.rows) {
    assert.equal(row.normative_assessment, 'UNKNOWN');
    assert.equal(row.implementation, 'implemented');
    for (const assertion of row.assertions) {
      assert.ok(assertion.assertion_status);
      assert.match(assertion.evidence.url, /^https:\/\//);
      assert.ok(assertion.evidence.version && assertion.evidence.status && assertion.evidence.locator);
      assert.match(assertion.evidence.sha256, /^[a-f0-9]{64}$/);
    }
    for (const key of row.code_path_groups) assert.ok(matrix.code_paths[key]);
    for (const key of row.test_path_groups) assert.ok(matrix.test_paths[key]);
  }
  for (const groups of [matrix.code_paths, matrix.test_paths]) for (const paths of Object.values(groups)) {
    for (const path of paths) assert.ok(existsSync(fileURLToPath(new URL(path, root))), path);
  }
  assert.match(matrix.baseline.native_identity_policy, /rejected transactionally/);
  assert.equal(Object.hasOwn(matrix, 'increment_history'), false);
  assert.equal(Object.hasOwn(matrix, 'recommended_increment'), false);
  assert.ok(matrix.gaps.some(item => item.id === 'draft_rule_bundle_conflict' && item.status === 'not_adopted'));
});

test('Current descriptor ledgers pin the independent author, licence and exact source responses', () => {
  for (const freeze of [elements, relationships]) {
    assert.equal(freeze.schema, 'schemka-source-freeze@1');
    assert.equal(freeze.status, 'independent unofficial v4.0 draft');
    assert.equal(freeze.version, '4.0');
    assert.equal(freeze.modified, '2026-10-10');
    assert.equal(freeze.author, 'Kalin Maldzhanski / Linked.Archi');
    assert.equal(freeze.license, 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(freeze.upstream_commit, null);
    assert.equal(freeze.sources.length, 3);
    for (const source of freeze.sources) {
      assert.equal(source.status, 200);
      assert.equal(source.sha256, frozenHashes[source.file]);
      assert.ok(source.bytes > 0);
      assert.match(source.url, /^https:\/\/meta\.linked\.archi\//);
      assert.match(source.retrieved_at, /^2026-10-12T16:06:23/);
    }
  }
  assert.equal(relationships.rule_sources_not_adopted.find(item => item.file === 'relationship-shapes.ttl').sha256,
    'ec29227ceddab9288a80e73bc7fe415a38753cc8931b1f046515da416987038e');
  assert.equal(relationships.rule_sources_not_adopted.find(item => item.file === 'element-shapes.ttl').sha256,
    'd885d1686418dc7ff840efcc2b9b43c2b62ef8dbbd0a6ea64a05aaaa3767867e');
  assert.equal(relationships.rule_conflicts.length, 3);
  assert.match(relationships.rule_source_boundary, /Neither bundle is imported/);
});

test('All 42 element facts retain source defaults, fallback qualifications and the separate normative boxed-notation evidence', () => {
  assert.equal(elements.selected_descriptors.length, 42);
  assert.equal(new Set(elements.selected_descriptors.map(item => item.id)).size, 42);
  const fallback = { BandedRectangle: 'Rectangle', TabbedRectangle: 'Rectangle', Box3D: 'Rectangle', Folder: 'Rectangle', WavyRectangle: 'Rectangle', Cloud: 'Ellipse' };
  assert.deepEqual(Object.fromEntries(Object.entries(elements.fallback_declarations).map(([key, value]) => [key, value.fallback])), fallback);
  for (const [domain, fill, ids] of elementDomains) for (const id of ids) {
    const shape = sourceShapes[id] || 'Rectangle';
    const renderingMode = shapeOnly.has(id) ? 'ShapeOnly' : 'ShapeWithBadge';
    const descriptor = elements.selected_descriptors.find(item => item.id === id);
    const row = matrix.rows.find(item => item.id === id);
    const expected = { domain, shape, fill, line: '#000000', rendering_mode: renderingMode, source_default_size: { width: 120, height: 55 } };
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(descriptor[key], value, `${id}.${key}`);
    assert.equal(descriptor.locator, `${id}Notation`);
    assert.equal(descriptor.source_fallback, fallback[shape] ?? null);
    const assertion = row.assertions.find(item => item.predicate === 'draft_notation');
    assert.deepEqual(assertion.value, expected);
    assert.equal(assertion.evidence.sha256, frozenHashes['notation.ttl']);
    assert.equal(row.mapping.implemented_shape, ['Device', 'Plateau', 'Equipment', 'Facility'].includes(id) ? 'Rectangle' : shape);
    assert.equal(notationElement(CURRENT_METAMODEL, id).notation, DRAFT_NOTATION);
  }
  assert.deepEqual(elements.implementation_exceptions.map(item => item.id), ['Device', 'Plateau', 'Equipment', 'Facility']);
  assert.equal(notationElement(CURRENT_METAMODEL, 'Device').contour, undefined);
  assert.equal(notationElement(CURRENT_METAMODEL, 'Device').glyph, 'monitor');
  const device = elements.implementation_exceptions[0];
  assert.equal(device.source_shape, 'Box3D'); assert.equal(device.normative_boxed_notation.shape, 'Rectangle');
  assert.equal(device.normative_boxed_notation.independent_visual_readers, 2);
  assert.equal(device.normative_boxed_notation.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(device.normative_boxed_notation.locators.map(l => [l.printed_page, l.pdf_page]), [[89, 107], [123, 141]]);
  assert.ok(matrix.rows.find(row => row.id === 'Device').unresolved);
  assert.match(elements.source_default_size_policy, /not resized or normalized/);
  assert.match(elements.composite_policy, /do not introduce nesting/);
  assert.equal(elements.coverage_boundary.normative_conformance, 'UNKNOWN');
});

test('Eleven relationship bases and four nominal variants match current source and target markers', () => {
  assert.equal(relationships.base_relationship_ids.length, 11);
  assert.deepEqual(sorted(relationships.variant_relationship_ids), sorted(Object.keys(variants)));
  assert.equal(relationships.selected_descriptors.length, 15);
  for (const [id, line, source, target] of relationshipFacts) {
    const descriptor = relationships.selected_descriptors.find(item => item.id === id);
    const row = matrix.rows.find(item => item.id === id);
    const catalogueKind = variants[id] ? 'local_nominal_variant' : 'base_relationship';
    assert.deepEqual(descriptor, { id, catalogue_kind: catalogueKind, variant_of: variants[id] ?? null, line, source, target, locator: `${id}Notation` });
    assert.equal(row.catalogue_kind, catalogueKind);
    assert.equal(row.variant_of, variants[id] ?? null);
    const assertion = row.assertions.find(item => item.predicate === 'draft_relationship_notation');
    assert.deepEqual(assertion.value, { line, source, target });
    assert.equal(assertion.evidence.sha256, frozenHashes['notation.ttl']);
    const appearance = notationRelationship(CURRENT_METAMODEL, id);
    assert.equal(appearance.notation, DRAFT_NOTATION);
    assert.equal(appearance.line, lineToken[line]);
    assert.equal(appearance.startMarkerKind, markerToken[source], `${id} source`);
    assert.equal(appearance.markerKind, markerToken[target], `${id} target`);
    assert.match(row.mapping.endpoint_policy, /no endpoint ID swap|without swapping IDs/);
  }
  assert.match(relationships.variant_policy, /not fifteen normative base types/);
  assert.match(relationships.variant_policy, /No accessType or isDirected property/);
  const corroboration = relationships.technical_corroboration;
  assert.equal(corroboration.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.equal(corroboration.locators.relationship_summary, 'Printed pages 48–49; PDF pages 66–67 (one-based)');
  assert.match(corroboration.verification_method, /relayed/);
  assert.match(corroboration.boundary, /no licence interpretation/i);
});

const c260Hash = 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093';
const unknownResult = (reason = 'rule-not-found') => ({ status: 'UNKNOWN', permissionClass: null, reason, ruleId: null, sourceEvidence: null });
const expectedEndpoint = (sourceType, relationshipType, targetType) => {
  const family = endpointFacts.relationship_families.find(item => item.relationship_ids.includes(relationshipType));
  const cell = endpointFacts.cells.find(item => item.source === sourceType && item.target === targetType);
  if (!cell || !family) return unknownResult();
  const unresolved = endpointFacts.source_ambiguities.triples.some(item => item.source === sourceType && item.relationship === relationshipType && item.target === targetType);
  const matchedLetter = [...cell.letters].find(letter => letter.toLowerCase() === family.letter) ?? null;
  const permissionClass = matchedLetter === null ? null : matchedLetter === matchedLetter.toUpperCase() ? 'direct' : 'derived';
  return {
    status: unresolved ? 'UNKNOWN' : matchedLetter === null ? 'FORBIDDEN' : 'ALLOWED', permissionClass: unresolved ? null : permissionClass,
    reason: unresolved ? 'source-scope-unresolved' : permissionClass ? `verified-table-${permissionClass}` : 'verified-table-forbidden',
    ruleId: `am4-b5-${sourceType}-${relationshipType}-${targetType}`,
    sourceEvidence: {
      id: 'archimate4-endpoint-types-b5', publication: 'C260', sha256: c260Hash,
      matrix: { section: 'B.5', printedPage: cell.printed_page, pdfPage: cell.pdf_page },
      cell: { sourceType, relationshipType, targetType, letters: cell.letters, relationshipLetter: family.letter,
        matchedLetter, classification: permissionClass ?? 'not-listed' },
      legend: { printedPage: 139, pdfPage: 157 }, family: family.family_evidence[relationshipType],
      derivedAssertion: permissionClass === 'derived' ? { section: '5.8', printedPages: [49, 50], pdfPages: [67, 68] } : null,
      ...(unresolved ? { qualification: endpointFacts.source_ambiguities.qualification } : {}),
    },
  };
};

test('All 26460 stored-edge cases match the independent ledger: 4443 direct, 2935 derived, 19074 forbidden, 8 unknown', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  const state = createProject('Synthetic current coverage');
  assert.deepEqual(state.project.metamodel, CURRENT_METAMODEL);
  const id = (prefix, number) => `${prefix}-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  state.elements = CURRENT_CATALOG.elementTypes.map((type, index) => ({ id: id('el', index + 1), type, name: type, documentation: '', properties: [] }));
  const allRelationships = [], counts = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  let verifiedDirect = 0, verifiedDerived = 0;
  for (const source of state.elements) for (const relationshipType of CURRENT_CATALOG.relationshipTypes) for (const target of state.elements) {
    const actual = evaluateRelationship(registry, CURRENT_METAMODEL, {
      sourceType: source.type, relationshipType, targetType: target.type, scope: 'direct',
    });
    assert.deepEqual(actual, expectedEndpoint(source.type, relationshipType, target.type));
    assert.equal(getVerifiedRelationshipDecision(actual), actual);
    counts[actual.status]++;
    if (actual.permissionClass === 'direct') verifiedDirect++;
    if (actual.permissionClass === 'derived') verifiedDerived++;
    allRelationships.push({ id: id('rel', allRelationships.length + 1), type: relationshipType,
      source: { kind: 'element', id: source.id }, target: { kind: 'element', id: target.id }, label: '', documentation: '', properties: [] });
  }
  assert.equal(allRelationships.length, 26460);
  assert.deepEqual(counts, { ALLOWED: 7378, FORBIDDEN: 19074, UNKNOWN: 8 });
  assert.equal(verifiedDirect, 4443);
  assert.equal(verifiedDerived, 2935);
  let assessed = 0, projectDirect = 0, projectDerived = 0;
  const projectCounts = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  for (let offset = 0; offset < allRelationships.length; offset += 1500) {
    state.relationships = allRelationships.slice(offset, offset + 1500);
    const report = assessProject(state, registry);
    assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
    for (const status of Object.keys(projectCounts)) projectCounts[status] += report.counts[status];
    projectDirect += report.verifiedDirect;
    projectDerived += report.verifiedDerived;
    assessed += report.relationships.length;
    for (const row of report.relationships) {
      const verified = getVerifiedRelationshipDecision(row);
      {
        assert.notEqual(verified, row);
        const { relationshipId, ...decision } = row;
        assert.deepEqual(verified, decision);
        assert.ok(Object.isFrozen(verified));
        assert.equal(Object.hasOwn(verified, 'relationshipId'), false);
      }
    }
  }
  assert.equal(assessed, 26460);
  assert.deepEqual(projectCounts, counts);
  assert.equal(projectDirect, 4443);
  assert.equal(projectDerived, 2935);
  assert.deepEqual(matrix.baseline.direct_relationship_assessment, {
    triples: 26460, local_allowed: 7378, allowed_direct: 4443, allowed_derived: 2935, local_forbidden: 19074, local_unknown: 8,
    normative_unknown: 26460, normative_qualification: 'Whole-model normative assessment remains UNKNOWN; selected bounded endpoint decisions are recorded separately.',
  });
  assert.equal(relationships.coverage_boundary.direct_triples, assessed);
  assert.equal(relationships.coverage_boundary.local_allowed, 7378);
  assert.equal(relationships.coverage_boundary.allowed_direct, 4443);
  assert.equal(relationships.coverage_boundary.allowed_derived, 2935);
  assert.equal(relationships.coverage_boundary.local_forbidden, 19074);
  assert.equal(relationships.coverage_boundary.local_unknown, 8);
  assert.equal(relationships.coverage_boundary.normative_unknown, assessed);
});

test('Bounded endpoint source record retains exact orientation, pages, case, family qualifications and comparison provenance', () => {
  assert.equal(endpointFacts.schema, 'schemka-endpoint-rule-facts@1');
  assert.equal(endpointFacts.source.sha256, c260Hash);
  assert.match(endpointFacts.source.verification_method, /Two independent visual transcriptions/);
  assert.equal(endpointFacts.comparison_gate.result, 'PASS');
  assert.equal(endpointFacts.comparison_gate.cells, 1764);
  assert.deepEqual(endpointFacts.comparison_gate.independent_transcription_sha256, [
    '4943c5f0f450e359dbc93d238fade18c3153aea6e21a389f32a068ab49f4b870',
    '6f8921905d84b72af8f92cd619b6c2c2c24c543c19f6617c829c9a95369f01a1',
    'a7fe901c340cbc53513ac2955e2cac6e4b00af96ea12fc3d3cfa4e671499a084',
    'a4b434110682da6e032ef9d55c34d7caccb2ae32e8f9bc1a2c2d143240747669',
  ]);
  assert.deepEqual(endpointFacts.matrix_orientation, { source: 'column', target: 'row' });
  assert.deepEqual(endpointFacts.case_legend, { uppercase: 'direct metamodel relationship', lowercase: 'derived relationship' });
  assert.deepEqual(sorted(endpointFacts.element_ids), sorted(CURRENT_CATALOG.elementTypes.filter(id => !endpointFacts.excluded_element_ids.includes(id))));
  assert.deepEqual(endpointFacts.excluded_element_ids, []);
  assert.equal(endpointFacts.element_ids.length, 42);
  assert.deepEqual(sorted(endpointFacts.relationship_ids), sorted(CURRENT_CATALOG.relationshipTypes));
  assert.equal(endpointFacts.cells.length, 1764);
  assert.equal(new Set(endpointFacts.cells.map(item => `${item.source}/${item.target}`)).size, 1764);
  const tableColumns = [
    [140, ['Assessment', 'Driver', 'Goal', 'Meaning', 'Outcome', 'Principle', 'Requirement', 'Stakeholder', 'Value']],
    [141, ['Capability', 'CourseOfAction', 'Resource', 'ValueStream']],
    [142, ['Collaboration', 'Event', 'Function', 'Grouping', 'Location', 'Path', 'Process', 'Role', 'Service']],
    [143, ['BusinessActor', 'BusinessInterface', 'BusinessObject', 'Product', 'ApplicationComponent', 'ApplicationInterface', 'DataObject']],
    [144, ['Artifact', 'CommunicationNetwork', 'Device', 'DistributionNetwork', 'Equipment', 'Facility', 'Material', 'Node', 'SystemSoftware', 'TechnologyInterface']],
    [145, ['Deliverable', 'Plateau', 'WorkPackage']],
  ];
  const rowOrder = [...tableColumns[2][1], ...tableColumns[0][1], ...tableColumns[1][1],
    ...tableColumns[3][1], ...tableColumns[4][1], ...tableColumns[5][1]];
  assert.deepEqual(sorted(rowOrder), sorted(CURRENT_CATALOG.elementTypes));
  const sourceColumns = Object.fromEntries(tableColumns.flatMap(([page, ids]) => ids.map((id, i) => [id, [page, i + 1]])));
  const targetRows = Object.fromEntries(rowOrder.map((id, i) => [id, i + 1]));
  assert.deepEqual(endpointFacts.comparison_gate.page_cell_counts, [378, 168, 378, 294, 420, 126].map((cells, i) => ({ printed_page: 140 + i, pdf_page: 158 + i, cells })));
  for (const page of endpointFacts.comparison_gate.page_cell_counts) {
    assert.equal(endpointFacts.cells.filter(cell => cell.printed_page === page.printed_page).length, page.cells);
  }
  for (const source of endpointFacts.element_ids) for (const target of endpointFacts.element_ids) {
    const cell = endpointFacts.cells.find(item => item.source === source && item.target === target);
    assert.ok(cell, `${source} / ${target}`);
    assert.equal(cell.printed_page, sourceColumns[source][0]);
    assert.equal(cell.pdf_page, cell.printed_page + 18);
    assert.equal(cell.source_column, sourceColumns[source][1]);
    assert.equal(cell.target_row, targetRows[target]);
    assert.match(cell.letters, /^[AFGINORSTVafginorstv]+$/);
    assert.ok(cell.letters.includes('O'));
    assert.equal(new Set(cell.letters.toLowerCase()).size, cell.letters.length);
  }
  assert.deepEqual(Object.fromEntries(endpointFacts.relationship_families.map(item => [item.letter, item.relationship_ids])), {
    a: ['Access', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess'], f: ['Flow'], g: ['Aggregation', 'Composition'],
    i: ['Assignment'], n: ['Influence'], o: ['Association', 'DirectedAssociation'], r: ['Realization'], s: ['Specialization'], t: ['Triggering'], v: ['Serving'],
  });
  for (const family of endpointFacts.relationship_families) for (const id of family.relationship_ids) {
    const expected = family.letter === 'a' ? { baseRelationship: 'Access', section: '5.2.2', printedPage: 38, pdfPage: 56 }
      : family.letter === 'o' ? { baseRelationship: 'Association', section: '5.2.4', printedPage: 40, pdfPage: 58 }
      : id === 'Composition' ? { baseRelationship: 'Composition', section: '5.1.2', printedPage: 31, pdfPage: 49 } : null;
    assert.deepEqual(family.family_evidence[id], expected);
  }
  assert.equal(endpointFacts.source.locators.matrix, 'Appendix B.5, printed pages 140–145; PDF pages 158–163 (one-based)');
  assert.equal(endpointFacts.source.locators.legend, 'Appendix B.5, printed page 139; PDF page 157 (one-based)');
  assert.match(endpointFacts.scope.query_meaning, /Explicit stored model edge, not uppercase/);
  assert.match(endpointFacts.scope.permission_class_meaning, /requires no witnessed derivation chain/);
  assert.match(endpointFacts.scope.negative_policy, /1764 individually checked cells/);
  assert.match(endpointFacts.scope.endpoint_policy, /do not transpose endpoints/);
  assert.match(endpointFacts.scope.association_policy, /explicitly contain uppercase O/);
  assert.match(endpointFacts.scope.composition_policy, /only for these checked element endpoints/);
  assert.match(endpointFacts.scope.type_pair_policy, /does not establish instance-level/);
  assert.equal(endpointFacts.scope.outside_scope, 'UNKNOWN');
  assert.match(endpointFacts.scope.composite_boundary, /All 42 current element endpoint types/);
  assert.match(endpointFacts.scope.composite_boundary, /Eight Product\/Plateau aggregation\/composition/);
  assert.equal(endpointFacts.source.locators.composite_qualification, 'Appendix B.4 notes, printed page 139 / PDF 157; Appendix B.6, printed page 146 / PDF 164 (one-based)');
  assert.deepEqual(endpointFacts.coverage, {
    catalogue_elements: 42, catalogue_relationship_ids: 15, bounded_element_types: 42, bounded_element_pairs: 1764, reviewed_triples: 26460, bounded_triples: 26452,
    allowed: 7378, allowed_direct: 4443, allowed_derived: 2935, forbidden: 19074, source_unresolved: 8, whole_catalogue_triples: 26460,
    unknown: 8, whole_model_normative: 'UNKNOWN',
  });
  assert.equal(matrix.features.endpoint_rules.source_ledger, 'docs/ENDPOINT-RULES.json');
  assert.equal(relationships.verified_endpoint_scope.source_ledger, 'docs/ENDPOINT-RULES.json');
  for (const id of endpointFacts.relationship_ids) {
    const row = matrix.rows.find(item => item.id === id), counts = { direct: 0, derived: 0, forbidden: 0, unknown: 0 };
    for (const cell of endpointFacts.cells) {
      const result = expectedEndpoint(cell.source, id, cell.target);
      counts[result.permissionClass ?? (result.status === 'UNKNOWN' ? 'unknown' : 'forbidden')]++;
    }
    assert.deepEqual(row.bounded_endpoint_assessment, { source_ledger: 'docs/ENDPOINT-RULES.json',
      element_ids: endpointFacts.element_ids, bounded_triples: 1764 - counts.unknown, reviewed_triples: 1764, allowed: counts.direct + counts.derived,
      allowed_direct: counts.direct, allowed_derived: counts.derived, forbidden: counts.forbidden, unknown: counts.unknown,
      outside_scope: 'UNKNOWN', whole_model_normative: 'UNKNOWN' });
    assert.deepEqual(row.assertions.find(item => item.predicate === 'bounded_element_endpoint_matrix').value,
      { ordered_pairs: 1764, allowed_direct: counts.direct, allowed_derived: counts.derived, forbidden: counts.forbidden, unknown: counts.unknown });
  }
});

test('Authorized coverage getter derives current matrix counts and cannot be activated by a copied profile', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  const coverage = getVerifiedRelationshipCoverage(registry, CURRENT_METAMODEL);
  const included = CURRENT_CATALOG.elementTypes.filter(id => endpointFacts.element_ids.includes(id));
  const excluded = CURRENT_CATALOG.elementTypes.filter(id => endpointFacts.excluded_element_ids.includes(id));
  assert.deepEqual(coverage, {
    sourceTypeIds: included, targetTypeIds: included, relationshipTypeIds: CURRENT_CATALOG.relationshipTypes,
    excludedTypeIds: excluded, verifiedPairCount: endpointFacts.cells.length,
    reviewedTripleCount: 26460, verifiedTripleCount: 26452, sourceUnresolvedTripleCount: 8, unknownTripleCount: 8, totalTripleCount: 26460,
  });
  for (const value of [coverage, coverage.sourceTypeIds, coverage.targetTypeIds, coverage.relationshipTypeIds, coverage.excludedTypeIds]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.equal(matrix.features.endpoint_rules.coverage_api, 'getVerifiedRelationshipCoverage');
  assert.equal(getVerifiedRelationshipCoverage(createRegistry([structuredClone(CURRENT_PROFILE)]), CURRENT_METAMODEL), null);
  assert.equal(getVerifiedRelationshipCoverage(createRegistry([]), CURRENT_METAMODEL), null);
  assert.equal(getVerifiedRelationshipCoverage(registry, { ...CURRENT_METAMODEL, version: 1 }), null);
  assert.throws(() => getVerifiedRelationshipCoverage({ get: () => CURRENT_PROFILE }, CURRENT_METAMODEL), { code: 'PROFILE_REGISTRY' });
  const query = { sourceType: 'Service', relationshipType: 'Association', targetType: 'Function', scope: 'direct' };
  for (const type of excluded) for (const relationshipType of CURRENT_CATALOG.relationshipTypes) {
    for (const change of [{ sourceType: type }, { targetType: type }]) {
      assert.deepEqual(evaluateRelationship(registry, CURRENT_METAMODEL, { ...query, ...change, relationshipType }), unknownResult());
    }
  }
});

test('A stable independent 49-cell fixture preserves all 735 seven-type decisions and evidence', () => {
  const fixture = read('schemka-model-profiles/test/fixtures/seven-type-endpoint-cells.json');
  assert.equal(fixture.sourceSha256, c260Hash);
  assert.deepEqual(fixture.orientation, { source: 'column', target: 'row' });
  assert.equal(fixture.cells.length, 49);
  assert.equal(new Set(fixture.cells.map(cell => `${cell.source}/${cell.target}`)).size, 49);
  const registry = createRegistry([CURRENT_PROFILE]), counts = { direct: 0, derived: 0, forbidden: 0 };
  let checked = 0;
  for (const old of fixture.cells) {
    const cell = { source: old.source, target: old.target, letters: old.letters,
      printed_page: old.printed_page, pdf_page: old.pdf_page,
      source_column: old.source_column_index_1based, target_row: old.target_row_index_1based };
    assert.deepEqual(endpointFacts.cells.find(item => item.source === old.source && item.target === old.target), cell);
    for (const family of endpointFacts.relationship_families) for (const relationshipType of family.relationship_ids) {
      const decision = evaluateRelationship(registry, CURRENT_METAMODEL, {
        sourceType: cell.source, relationshipType, targetType: cell.target, scope: 'direct',
      });
      const matched = [...cell.letters].find(letter => letter.toLowerCase() === family.letter) ?? null;
      const permissionClass = matched === null ? null : matched === matched.toUpperCase() ? 'direct' : 'derived';
      assert.equal(decision.status, matched === null ? 'FORBIDDEN' : 'ALLOWED');
      assert.equal(decision.permissionClass, permissionClass);
      assert.deepEqual(decision.sourceEvidence.cell, { sourceType: cell.source, relationshipType, targetType: cell.target,
        letters: cell.letters, relationshipLetter: family.letter, matchedLetter: matched, classification: permissionClass ?? 'not-listed' });
      assert.deepEqual(decision.sourceEvidence.matrix, { section: 'B.5', printedPage: cell.printed_page, pdfPage: cell.pdf_page });
      assert.equal(getVerifiedRelationshipDecision(decision), decision);
      counts[permissionClass ?? 'forbidden']++;
      checked++;
    }
  }
  assert.equal(checked, 735);
  assert.deepEqual(counts, { direct: 171, derived: 98, forbidden: 466 });
});

test('Unified record preserves all 36 Application Access decisions without a duplicate active slice', () => {
  const types = ['ApplicationComponent', 'ApplicationInterface', 'DataObject'];
  const relations = ['Access', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess'];
  const registry = createRegistry([CURRENT_PROFILE]);
  let allowed = 0, forbidden = 0;
  for (const sourceType of types) for (const targetType of types) for (const relationshipType of relations) {
    const actual = evaluateRelationship(registry, CURRENT_METAMODEL, { sourceType, relationshipType, targetType, scope: 'direct' });
    const positive = targetType === 'DataObject' && sourceType !== 'DataObject';
    assert.equal(actual.status, positive ? 'ALLOWED' : 'FORBIDDEN');
    assert.equal(actual.permissionClass, positive ? 'derived' : null);
    assert.equal(actual.sourceEvidence.cell.matchedLetter, positive ? 'a' : null);
    if (positive) allowed++; else forbidden++;
  }
  assert.deepEqual({ allowed, forbidden }, { allowed: 8, forbidden: 28 });
  assert.equal(existsSync(fileURLToPath(new URL('docs/ACCESS-RULES.json', root))), false);
  assert.equal(Object.hasOwn(matrix.features, 'application_access_rules'), false);
});

test('Only original CURRENT_PROFILE registration activates the matrix; result evidence requires genuine identity', () => {
  const original = createRegistry([CURRENT_PROFILE]);
  const query = { sourceType: 'ApplicationComponent', relationshipType: 'ReadAccess', targetType: 'DataObject', scope: 'direct' };
  const allowed = evaluateRelationship(original, CURRENT_METAMODEL, query);
  assert.deepEqual(allowed, expectedEndpoint(query.sourceType, query.relationshipType, query.targetType));
  assert.equal(getVerifiedRelationshipDecision(allowed), allowed);
  assert.ok(Object.isFrozen(allowed.sourceEvidence));
  assert.ok(Object.isFrozen(allowed.sourceEvidence.matrix));
  assert.ok(Object.isFrozen(allowed.sourceEvidence.cell));
  assert.match(endpointFacts.trust_boundary.activation, /object identity/);
  const metadataClaim = structuredClone(CURRENT_PROFILE);
  metadataClaim.metadata.source += ' Claims verified C260 endpoint matrix authority.';
  for (const descriptor of [structuredClone(CURRENT_PROFILE), metadataClaim, original.get(CURRENT_METAMODEL), original.list()[0]]) {
    assert.notEqual(descriptor, CURRENT_PROFILE);
    const copiedRegistry = createRegistry([descriptor]);
    assert.equal(getVerifiedRelationshipCoverage(copiedRegistry, CURRENT_METAMODEL), null);
    for (const change of [{}, { sourceType: 'DataObject', targetType: 'ApplicationComponent' }, { sourceType: 'Service', relationshipType: 'Serving', targetType: 'Process' }]) {
      const result = evaluateRelationship(copiedRegistry, CURRENT_METAMODEL, { ...query, ...change });
      assert.deepEqual(result, unknownResult());
      assert.equal(getVerifiedRelationshipDecision(result), null);
    }
  }
  let reads = 0;
  const getter = { get sourceEvidence() { reads++; throw new Error('must not read evidence'); } };
  const proxy = new Proxy(allowed, { get() { reads++; throw new Error('must not read proxy'); } });
  for (const forged of [structuredClone(allowed), { ...allowed }, JSON.parse(JSON.stringify(allowed)), getter, proxy, null, undefined, 1, 'verified']) {
    assert.equal(getVerifiedRelationshipDecision(forged), null);
  }
  assert.equal(reads, 0);
  const local = structuredClone(CURRENT_PROFILE);
  local.rules = [{ id: 'test-local-only', ...query, status: 'ALLOWED', evidence: 'local' }];
  const localResult = evaluateRelationship(createRegistry([local]), CURRENT_METAMODEL, query);
  assert.equal(localResult.reason, 'explicit-local-rule');
  assert.equal(getVerifiedRelationshipDecision(localResult), null);
  assert.deepEqual(evaluateRelationship(original, CURRENT_METAMODEL, { ...query, scope: 'derived' }), unknownResult('unsupported-scope'));
});

test('Multiplicity evidence pins the 1..* example without a full grammar or conformance claim', () => {
  const facts = read('docs/MULTIPLICITY-SOURCES.json');
  assert.equal(facts.schema, 'schemka-multiplicity-source-facts@1');
  assert.equal(facts.source.kind, 'owner_provided_specification_technical_fact_check');
  assert.equal(facts.source.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.equal(facts.source.locators.multiplicity_section, 'Section 5.6, printed page 47; PDF page 65 (one-based)');
  assert.equal(facts.source.locators.one_to_many_example, 'Example 5-16, printed page 48; PDF page 66 (one-based)');
  const example = facts.confirmed_forms.find(item => item.form === '1..*');
  const checked = assessMultiplicity('1..*');
  assert.equal(checked.status, 'CONFIRMED_SYNTAX');
  assert.equal(facts.source.evidence_ids[checked.sourceEvidence], example.locator);
  assert.ok(facts.unverified_forms.some(item => item.form === 'other_n..*'));
  assert.match(facts.unverified_forms.find(item => item.form === 'standalone_0').qualification, /does not establish a blanket normative prohibition/);
  assert.match(facts.grammar_boundary, /not constitute a full EBNF/);
  assert.match(facts.absence_policy, /no supplied default/);
  const contract = facts.application_contract;
  assert.equal(contract.profile_change, false);
  assert.equal(contract.format_version_change, false);
  // This source ledger pins the original raw-text contract at core v2.
  // Current native persistence is v4; the unchanged multiplicity oracle below
  // still applies without rewriting historical evidence or its version claims.
  assert.equal(contract.current_core_format_version, 2);
  assert.equal(FORMAT_VERSION, 4);
  assert.equal(contract.current_profile_version, CURRENT_METAMODEL.version);
  assert.deepEqual(contract.fields, ['sourceMultiplicity', 'targetMultiplicity']);
  assert.equal(contract.maximum_utf16_code_units, LIMITS.multiplicity);
  assert.equal(contract.maximum_utf16_code_units, 128);
  assert.match(contract.bound_origin, /local application limit/);
  assert.match(contract.command_null, /remove.*do not store JSON null/);
  assert.match(contract.persistence, /UNVERIFIED or INVALID_SYNTAX/);
  assert.match(contract.label_placement, /no normative coordinate algorithm/i);
  assert.equal(facts.normative_conformance, 'UNKNOWN');
  assert.deepEqual(matrix.features.multiplicity.new_endpoint_rules, []);
  assert.equal(matrix.features.multiplicity.edge_count_validation, false);
  assert.equal(matrix.features.multiplicity.junction_support, 'bounded_applicability_diagnostic');
  assert.equal(matrix.features.multiplicity.endpoint_matrix_added, false);
  assert.ok(existsSync(fileURLToPath(new URL('docs/MULTIPLICITY.md', root))));
});

test('Raw multiplicity diagnostics cannot promote whole-project normative coverage', () => {
  const state = createProject('Synthetic multiplicity evidence boundary');
  const source = 'el-00000000-0000-4000-8000-000000000001', target = 'el-00000000-0000-4000-8000-000000000002';
  state.elements = [{ id: source, type: 'ApplicationComponent', name: 'Source', documentation: '', properties: [] },
    { id: target, type: 'DataObject', name: 'Target', documentation: '', properties: [] }];
  state.relationships = [{ id: 'rel-00000000-0000-4000-8000-000000000001', type: 'ReadAccess',
    source: { kind: 'element', id: source }, target: { kind: 'element', id: target }, label: '', documentation: '', properties: [] }];
  const registry = createRegistry([CURRENT_PROFILE]);
  const before = assessProject(state, registry);
  assert.deepEqual(before.counts, { ALLOWED: 1, FORBIDDEN: 0, UNKNOWN: 0 });
  assert.equal(before.verifiedDerived, 1);
  const endpoints = structuredClone({ source: state.relationships[0].source, target: state.relationships[0].target });
  state.relationships[0].sourceMultiplicity = '2..*';
  state.relationships[0].targetMultiplicity = '3..1';
  assert.equal(assessMultiplicity(state.relationships[0].sourceMultiplicity).status, 'UNVERIFIED');
  assert.equal(assessMultiplicity(state.relationships[0].targetMultiplicity).status, 'INVALID_SYNTAX');
  const reopened = importFiles(exportFiles(state));
  assert.deepEqual(reopened, state);
  assert.deepEqual(assessProject(reopened, registry), before);
  assert.equal(reopened.relationships.length, 1);
  assert.deepEqual({ source: reopened.relationships[0].source, target: reopened.relationships[0].target }, endpoints);
  assert.deepEqual(before.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
});

test('Node boxed-symbol evidence adds the bounded cuboid without changing the rectangle descriptor or normative UNKNOWN', () => {
  const node = elements.boxed_symbol_evidence.find(item => item.id === 'Node'), row = matrix.rows.find(item => item.id === 'Node');
  assert.equal(node.implemented_glyph, 'Original local cuboid badge');
  assert.deepEqual(row.mapping.normative_boxed_notation, node.normative_boxed_notation);
  assert.equal(node.normative_boxed_notation.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(node.normative_boxed_notation.locators.map(l => [l.printed_page, l.pdf_page]), [[88, 106], [123, 141]]);
  assert.equal(node.normative_boxed_notation.independent_visual_readers, 2);
  assert.equal(node.normative_boxed_notation.shape, 'Rectangle'); assert.equal(node.normative_boxed_notation.badge, 'Cuboid');
  assert.equal(row.mapping.source_shape, 'Rectangle'); assert.equal(row.mapping.implemented_shape, 'Rectangle');
  assert.equal(row.normative_assessment, 'UNKNOWN'); assert.match(row.unresolved, /Standalone Node icon-only notation remains unimplemented/);
  assert.deepEqual(elements.implementation_exceptions.map(item => item.id), ['Device', 'Plateau', 'Equipment', 'Facility']);
  assert.equal(notationElement(CURRENT_METAMODEL, 'Node').glyph, 'cuboid'); assert.equal(notationElement(CURRENT_METAMODEL, 'Node').contour, undefined);
});

test('Grouping icon evidence corrects only folder dashes while retaining raw descriptors and normative UNKNOWN', () => {
  const grouping = elements.icon_symbol_evidence.find(item => item.id === 'Grouping'), row = matrix.rows.find(item => item.id === 'Grouping');
  const evidence = grouping.normative_icon_notation;
  assert.deepEqual(elements.icon_symbol_evidence.map(item => item.id), ['Grouping']);
  assert.deepEqual(row.mapping.normative_icon_notation, evidence);
  assert.equal(evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(evidence.locators.map(l => [l.printed_page, l.pdf_page]), [[25, 43], [123, 141]]);
  assert.deepEqual(evidence.supporting_locators.map(l => [l.printed_page, l.pdf_page]), [[2, 20], [16, 34], [17, 35]]);
  assert.equal(evidence.independent_visual_readers, 2); assert.equal(evidence.shape, 'Folder'); assert.equal(evidence.outline, 'Dashed');
  assert.equal(evidence.tab_divider, 'Dashed horizontal line beneath raised tab'); assert.match(evidence.fill_policy, /Common fill retained/);
  assert.equal(row.mapping.source_shape, 'Folder'); assert.equal(row.mapping.implemented_shape, 'Folder');
  assert.equal(row.assertions.find(item => item.predicate === 'draft_notation').value.rendering_mode, 'ShapeOnly');
  assert.equal(row.assertions.find(item => item.predicate === 'draft_shape_fallback').value.fallback, 'Rectangle');
  assert.equal(row.normative_assessment, 'UNKNOWN'); assert.match(row.unresolved, /whole-model conformance remain unassessed/);
  assert.deepEqual(elements.implementation_exceptions.map(item => item.id), ['Device', 'Plateau', 'Equipment', 'Facility']);
  assert.equal(notationElement(CURRENT_METAMODEL, 'Grouping').contour, 'folder'); assert.equal(notationElement(CURRENT_METAMODEL, 'Grouping').glyph, undefined);
});


test('ApplicationComponent boxed-symbol evidence adds only the component badge and preserves raw descriptors and normative UNKNOWN', () => {
  const component = elements.boxed_symbol_evidence.find(item => item.id === 'ApplicationComponent'), row = matrix.rows.find(item => item.id === 'ApplicationComponent');
  const evidence = component.normative_boxed_notation;
  assert.equal(component.implemented_glyph, 'Original local component badge');
  assert.deepEqual(row.mapping.normative_boxed_notation, evidence);
  assert.equal(evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(evidence.locators.map(l => [l.printed_page, l.pdf_page]), [[82, 100], [123, 141]]);
  assert.deepEqual(evidence.supporting_locators.map(l => [l.printed_page, l.pdf_page]), [[2, 20]]);
  assert.equal(evidence.independent_visual_readers, 2); assert.equal(evidence.shape, 'Rectangle');
  assert.equal(evidence.badge, 'Rectangular body with two distinct horizontal tabs crossing its left edge');
  assert.match(evidence.geometry_policy, /interrupted body edge at both tabs/);
  assert.equal(row.mapping.source_shape, 'Rectangle'); assert.equal(row.mapping.implemented_shape, 'Rectangle');
  const raw = row.assertions.find(item => item.predicate === 'draft_notation').value;
  assert.equal(raw.shape, 'Rectangle'); assert.equal(raw.rendering_mode, 'ShapeWithBadge');
  assert.equal(row.normative_assessment, 'UNKNOWN'); assert.match(row.unresolved, /Standalone ApplicationComponent icon-only notation remains unimplemented/);
  assert.deepEqual(elements.implementation_exceptions.map(item => item.id), ['Device', 'Plateau', 'Equipment', 'Facility']);
  assert.equal(notationElement(CURRENT_METAMODEL, 'ApplicationComponent').glyph, 'component');
  assert.equal(notationElement(CURRENT_METAMODEL, 'ApplicationComponent').contour, undefined);
});

test('Three interface boxed-symbol records preserve raw rectangles, domain fills and all normative UNKNOWN qualifications', () => {
  for (const [type, figure, printed, pdf] of [['BusinessInterface', '8-3', 75, 93], ['ApplicationInterface', '9-3', 83, 101], ['TechnologyInterface', '10-4', 89, 107]]) {
    const item = elements.boxed_symbol_evidence.find(item => item.id === type), row = matrix.rows.find(item => item.id === type);
    const evidence = item.normative_boxed_notation;
    assert.equal(item.implemented_glyph, 'Original local interface badge'); assert.deepEqual(row.mapping.normative_boxed_notation, evidence);
    assert.equal(evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
    assert.deepEqual(evidence.locators, [{ section: `Figure ${figure}`, printed_page: printed, pdf_page: pdf }, { section: `Appendix A.1 ${type} notation`, printed_page: 123, pdf_page: 141 }]);
    assert.equal(evidence.independent_visual_readers, 2); assert.equal(evidence.shape, 'Rectangle');
    assert.equal(evidence.badge, 'Outlined circle with a horizontal left stem meeting its left midpoint');
    assert.match(evidence.geometry_policy, /uniform scale and stroke-inclusive clearance above the full type caption/);
    assert.equal(row.mapping.source_shape, 'Rectangle'); assert.equal(row.mapping.implemented_shape, 'Rectangle');
    const raw = row.assertions.find(item => item.predicate === 'draft_notation').value;
    assert.equal(raw.shape, 'Rectangle'); assert.equal(raw.rendering_mode, 'ShapeWithBadge');
    assert.equal(row.normative_assessment, 'UNKNOWN'); assert.ok(row.unresolved.includes(`Standalone ${type} icon-only notation remains unimplemented`));
    assert.match(item.qualification, /no port semantics/);
    assert.equal(notationElement(CURRENT_METAMODEL, type).glyph, 'interface'); assert.equal(notationElement(CURRENT_METAMODEL, type).contour, undefined);
  }
  assert.deepEqual(elements.implementation_exceptions.map(item => item.id), ['Device', 'Plateau', 'Equipment', 'Facility']);
});

test('Plateau normative boxed-rectangle exception retains the raw Box3D descriptor and all UNKNOWN boundaries', () => {
  const plateau = elements.implementation_exceptions.find(item => item.id === 'Plateau'), row = matrix.rows.find(item => item.id === 'Plateau'), evidence = plateau.normative_boxed_notation;
  assert.equal(plateau.source_shape, 'Box3D'); assert.equal(plateau.implemented_shape, 'Rectangle');
  assert.equal(plateau.implemented_glyph, 'Original local stepped-bar badge');
  assert.deepEqual(row.mapping.normative_boxed_notation, evidence);
  assert.equal(evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(evidence.locators.map(l => [l.printed_page, l.pdf_page]), [[102, 120], [124, 142]]);
  assert.deepEqual(evidence.supporting_locators.map(l => [l.printed_page, l.pdf_page]), [[2, 20]]);
  assert.equal(evidence.independent_visual_readers, 2); assert.equal(evidence.shape, 'Rectangle');
  assert.equal(evidence.badge, 'Three equal-length solid horizontal bars, higher bars shifted right');
  assert.equal(row.mapping.source_shape, 'Box3D'); assert.equal(row.mapping.implemented_shape, 'Rectangle');
  assert.equal(row.assertions.find(item => item.predicate === 'draft_notation').value.shape, 'Box3D');
  assert.equal(row.normative_assessment, 'UNKNOWN'); assert.match(row.unresolved, /Standalone Plateau icon-only notation remains unimplemented/);
  assert.match(row.unresolved, /intentionally changes clipping, hit shape and derived occlusion diagnostics/);
  assert.equal(notationElement(CURRENT_METAMODEL, 'Plateau').glyph, 'plateau'); assert.equal(notationElement(CURRENT_METAMODEL, 'Plateau').contour, undefined);
  for (const type of ['Equipment', 'Facility']) assert.equal(notationElement(CURRENT_METAMODEL, type).contour, undefined);
});

for (const [type, printed, glyph] of [['Equipment', 90, 'Original local paired-gear badge'], ['Facility', 91, 'Original local factory badge']]) test(`${type} normative boxed exception preserves raw Box3D facts and semantic UNKNOWN boundaries`, () => {
  const item = elements.implementation_exceptions.find(item => item.id === type), row = matrix.rows.find(item => item.id === type), evidence = item.normative_boxed_notation;
  assert.equal(item.source_shape, 'Box3D'); assert.equal(item.implemented_shape, 'Rectangle'); assert.equal(item.implemented_glyph, glyph);
  assert.deepEqual(row.mapping.normative_boxed_notation, evidence);
  assert.equal(evidence.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(evidence.locators.map(l => [l.printed_page, l.pdf_page]), [[printed, printed + 18], [123, 141]]);
  assert.equal(evidence.independent_visual_readers, 2); assert.equal(evidence.shape, 'Rectangle');
  assert.equal(row.mapping.source_shape, 'Box3D'); assert.equal(row.mapping.implemented_shape, 'Rectangle');
  assert.equal(row.assertions.find(item => item.predicate === 'draft_notation').value.shape, 'Box3D');
  assert.equal(row.normative_assessment, 'UNKNOWN'); assert.ok(row.unresolved.includes(`Standalone ${type} icon-only notation remains unimplemented`));
  assert.match(row.unresolved, /intentionally changes clipping, hit shape and derived occlusion diagnostics/);
  assert.equal(notationElement(CURRENT_METAMODEL, type).glyph, type.toLowerCase()); assert.equal(notationElement(CURRENT_METAMODEL, type).contour, undefined);
});
