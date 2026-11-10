import { completeCurrentFixture } from './current-fixture.js';
import { createProject, CURRENT_CATALOG, validateProject } from '../src/index.js';

// Synthetic current-catalogue test data; no source definitions or endpoint rules.
export const relationshipTypes = CURRENT_CATALOG.relationshipTypes;
export const fixtureId = (prefix, value) => `${prefix}-00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

export function relationshipProject() {
  const membership = CURRENT_CATALOG;
  const state = createProject('Synthetic relationship catalogue');
  state.project.id = fixtureId('prj', 1);
  state.elements = membership.elementTypes.map((type, index) => ({
    id: fixtureId('el', index + 1), type, name: `Synthetic ${type} 日本語 😀`,
    documentation: 'Synthetic notes\n', properties: { test: '<tag> & "text" \ud800' },
  }));
  state.relationships = membership.relationshipTypes.map((type, index) => ({
    id: fixtureId('rel', index + 1), type,
    source: { kind: 'element', id: state.elements[index % state.elements.length].id },
    target: { kind: 'element', id: state.elements[(index ? index + 1 : 0) % state.elements.length].id },
    label: `Synthetic ${type} 日本語 😀`, documentation: '', properties: { sample: 'Value\n' },
  }));
  state.views = [0, 1, 2].map(number => {
    const occurrences = number === 2 ? [] : [...state.elements, state.elements[0]].map((element, index) => ({
      id: fixtureId('occ', number * 100 + index + 1), concept: { kind: 'element', id: element.id },
      bounds: { x: index * 10 + 0.1, y: number * -20 - 0.2, width: 140.3, height: 60.4 },
      parentOccurrenceId: null, zIndex: index,
    }));
    const connections = number === 2 ? [] : [...state.relationships, state.relationships[0]].map((relationship, index) => ({
      id: fixtureId('conn', number * 100 + index + 1), relationshipId: relationship.id,
      source: { kind: 'occurrence', id: occurrences.find(item => item.concept.id === relationship.source.id).id },
      target: { kind: 'occurrence', id: occurrences.find(item => item.concept.id === relationship.target.id).id },
      routePoints: ([{ x: 10.1 + number, y: -20.2 }, { x: 30.3, y: 40.4 }]).map(point => ({ kind: 'bend', point })),
      labelPosition: number ? null : { x: 50.5, y: -60.6 },
    }));
    return { view: { id: fixtureId('view', number + 1), name: `Synthetic view ${number}`, documentation: 'Synthetic view notes', properties: {} }, occurrences, connections };
  });
  // Unshown entities and relationships remain part of the native model.
  state.elements.push({ ...structuredClone(state.elements.at(-1)), id: fixtureId('el', 99) });
  state.relationships.push({ ...structuredClone(state.relationships.at(-1)), id: fixtureId('rel', 99) });
  return validateProject(completeCurrentFixture(state));
}
