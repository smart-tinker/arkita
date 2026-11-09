import { completeCurrentFixture } from './current-fixture.js';
import { conceptProject } from './concept-project.js';
import { fixtureId } from './relationship-project.js';
import { CURRENT_CATALOG } from '../src/index.js';

export const profileId = fixtureId('prf', 1);
export const allTargets = () => [['element', CURRENT_CATALOG.elementTypes], ['junction', CURRENT_CATALOG.junctionTypes], ['relationship', CURRENT_CATALOG.relationshipTypes]]
  .flatMap(([kind, types]) => types.map(type => ({ kind, type })));
export const profileDefinition = (attributes = {}, purpose = 'specialization') => ({ name: 'Synthetic <profile> & text', purpose, targets: allTargets(), attributes });
export function customizationProject(attributes = {}) {
  const state = conceptProject();
  state.customizationProfiles = [{ id: profileId, ...profileDefinition(attributes) }];
  for (const item of [...state.elements, ...state.junctions, ...state.relationships]) item.profileApplications = [{ profileId, values: {} }];
  return completeCurrentFixture(state);
}

/** Substantial valid synthetic native model, within the existing 2048-file budget. */
export function customizationDrawingProject(count, profiled = false) {
  const state = {
    project: { ...conceptProject().project, id: fixtureId('prj', 1000), name: `Synthetic ${count} ${profiled ? 'profiled' : 'ordinary'} drawings` },
    elements: Array.from({ length: count }, (_, index) => ({ id: fixtureId('el', index + 1), type: 'Role', name: `Synthetic role ${index + 1}`, documentation: '', properties: { note: 'Synthetic local performance fixture' } })),
    junctions: [], relationships: [], views: [],
  };
  state.views.push({ view: { id: fixtureId('view', 1), name: 'Substantial synthetic view', documentation: '', properties: {} },
    occurrences: state.elements.map((element, index) => ({ id: fixtureId('occ', index + 1), concept: { kind: 'element', id: element.id }, bounds: { x: index % 25 * 250, y: Math.floor(index / 25) * 120, width: 210, height: 90 }, parentOccurrenceId: null, zIndex: index })), connections: [] });
  if (profiled) {
    state.customizationProfiles = [
      { id: profileId, name: '<literal Alpha>', purpose: 'specialization', targets: [{ kind: 'element', type: 'Role' }], attributes: { enabled: { type: 'Boolean', default: true } } },
      { id: fixtureId('prf', 2), name: 'Beta', purpose: 'specialization', targets: [{ kind: 'element', type: 'Role' }], attributes: {} },
      { id: fixtureId('prf', 3), name: 'Metadata', purpose: 'attributes', targets: [{ kind: 'element', type: 'Role' }], attributes: { count: { type: 'Integer', default: 7 } } },
    ];
    for (const concept of state.elements) concept.profileApplications = [{ profileId, values: { enabled: false } }, { profileId: fixtureId('prf', 2), values: {} }, { profileId: fixtureId('prf', 3), values: { count: 0 } }];
  }
  return completeCurrentFixture(state);
}

export function customizationManagerProject(count = 1000) {
  const state = customizationDrawingProject(count);
  state.views = [];
  state.customizationProfiles = state.elements.map((concept, index) => ({ id: fixtureId('prf', index + 1), name: `Synthetic profile ${index + 1}`, purpose: 'attributes', targets: [{ kind: 'element', type: 'Role' }], attributes: {} }));
  state.elements.forEach((concept, index) => { concept.profileApplications = [{ profileId: state.customizationProfiles[index].id, values: {} }]; });
  return completeCurrentFixture(state);
}
