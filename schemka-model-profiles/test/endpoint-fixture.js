import { readFile } from 'node:fs/promises';
import { createProject } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';

// Independent visual source transcription, not imported from runtime matrix code.
export const endpointFixture = JSON.parse(await readFile(new URL('./fixtures/endpoint-cells.json', import.meta.url), 'utf8'));
export const sourceAmbiguities = JSON.parse(await readFile(new URL('../../docs/ENDPOINT-RULES.json', import.meta.url), 'utf8')).source_ambiguities;
export const sevenTypeFixture = JSON.parse(await readFile(new URL('./fixtures/seven-type-endpoint-cells.json', import.meta.url), 'utf8'));
export const endpointLetters = {
  Composition: 'g', Aggregation: 'g', Assignment: 'i', Realization: 'r', Serving: 'v', Access: 'a',
  Influence: 'n', Association: 'o', Triggering: 't', Flow: 'f', Specialization: 's',
  ReadAccess: 'a', WriteAccess: 'a', ReadWriteAccess: 'a', DirectedAssociation: 'o',
};
export function expectedEndpoint(sourceType, relationshipType, targetType, fixture = endpointFixture) {
  const cell = fixture.cells.find(cell => cell.source === sourceType && cell.target === targetType);
  const letter = endpointLetters[relationshipType];
  if (!cell || !letter) return { status: 'UNKNOWN', permissionClass: null, reason: 'rule-not-found', ruleId: null, sourceEvidence: null };
  const unresolved = sourceAmbiguities.triples.some(item => item.source === sourceType && item.relationship === relationshipType && item.target === targetType);
  const matched = [...cell.letters].find(char => char.toLowerCase() === letter) || null;
  const permissionClass = matched === null ? null : matched === matched.toUpperCase() ? 'direct' : 'derived';
  const family = letter === 'a' ? { baseRelationship: 'Access', section: '5.2.2', printedPage: 38, pdfPage: 56 }
    : letter === 'o' ? { baseRelationship: 'Association', section: '5.2.4', printedPage: 40, pdfPage: 58 }
      : relationshipType === 'Composition' ? { baseRelationship: 'Composition', section: '5.1.2', printedPage: 31, pdfPage: 49 } : null;
  return {
    status: unresolved ? 'UNKNOWN' : matched === null ? 'FORBIDDEN' : 'ALLOWED', permissionClass: unresolved ? null : permissionClass,
    reason: unresolved ? 'source-scope-unresolved' : permissionClass ? `verified-table-${permissionClass}` : 'verified-table-forbidden',
    ruleId: `am4-b5-${sourceType}-${relationshipType}-${targetType}`,
    sourceEvidence: {
      id: 'archimate4-endpoint-types-b5', publication: 'C260', sha256: fixture.sourceSha256,
      matrix: { section: 'B.5', printedPage: cell.printed_page, pdfPage: cell.pdf_page },
      cell: { sourceType, relationshipType, targetType, letters: cell.letters, relationshipLetter: letter,
        matchedLetter: matched, classification: permissionClass || 'not-listed' },
      legend: { printedPage: 139, pdfPage: 157 }, family,
      derivedAssertion: permissionClass === 'derived' ? { section: '5.8', printedPages: [49, 50], pdfPages: [67, 68] } : null,
      ...(unresolved ? { qualification: sourceAmbiguities.qualification } : {}),
    },
  };
}
export function endpointProject(cells = sevenTypeFixture.cells) {
  const state = createProject('Bounded endpoint diagnostics');
  state.elements = [...new Set(cells.flatMap(cell => [cell.source, cell.target]))].map((type, index) => ({
    id: fixtureId('el', index + 1), type, name: type, documentation: '<raw text>', properties: [{ key: 'note', value: 'Kept\n' }],
  }));
  const elements = new Map(state.elements.map(item => [item.type, item.id]));
  state.relationships = cells.flatMap((cell, index) => Object.keys(endpointLetters).map((type, at) => ({
    id: fixtureId('rel', index * 15 + at + 1), type,
    source: { kind: 'element', id: elements.get(cell.source) }, target: { kind: 'element', id: elements.get(cell.target) },
    label: '<Kept> 😀', documentation: '', properties: [{ key: 'diagnostic', value: 'not persisted' }], sourceMultiplicity: ' 1\r\n ', targetMultiplicity: '-1',
  })));
  const drawn = state.relationships.filter((_, index) => index < 20 || index % 37 === 0);
  state.views = [0, 1, 2].map(number => {
    const occurrences = number === 2 ? [] : [...state.elements, state.elements[0]].map((element, index) => ({
      id: fixtureId('occ', number * 100 + index + 1), concept: { kind: 'element', id: element.id },
      bounds: { x: index * 150 + 0.1, y: number * 100 - 0.2, width: 120.3, height: 60.4 }, parent: null, zIndex: index, style: {},
    }));
    const connections = number === 2 ? [] : [...drawn, drawn[0]].map((relationship, index) => ({
      id: fixtureId('conn', number * 1000 + index + 1), relationshipId: relationship.id,
      source: { kind: 'occurrence', id: occurrences.find(item => item.concept.id === relationship.source.id).id },
      target: { kind: 'occurrence', id: occurrences.find(item => item.concept.id === relationship.target.id).id },
      routePoints: [{ kind: 'bend', point: { x: 1.2, y: -3.4 } }, { kind: 'bend', point: { x: 5.6, y: 7.8 } }], labelPosition: { x: 9.1, y: -2.3 }, style: {},
    }));
    return { view: { id: fixtureId('view', number + 1), name: `View ${number}`, documentation: '', properties: [] }, occurrences, connections, visualNodes: [], visualConnectors: [] };
  });
  return state;
}
