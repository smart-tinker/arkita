import { validateProject } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { viewpointGraph } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';

/** Synthetic acceptance diagram: both themes, hidden data, junctions and all route modes. */
export function svgExportProject() {
  const result = viewpointGraph({
    types: { A: 'ApplicationComponent', B: 'Service', D: 'Device', J: 'AndJunction', K: 'OrJunction', H: 'Goal' },
    relationships: { R: ['Flow', 'A', 'B'], S: ['ReadWriteAccess', 'A', 'D'], T: ['Association', 'R', 'J'], U: ['Serving', 'B', 'B'], V: ['Assignment', 'J', 'K'], Q: ['Aggregation', 'A', 'H'] },
    selection: { elementTypes: ['ApplicationComponent', 'Service', 'Device'], junctionTypes: ['AndJunction', 'OrJunction'], relationshipTypes: ['Flow', 'ReadWriteAccess', 'Association', 'Serving', 'Assignment', 'Aggregation'] },
  });
  const { state, ids, draws, anchors } = result;
  state.project.id = fixtureId('prj', 27); state.project.name = 'SVG export acceptance';
  state.views[0].view.name = 'SVG <view> & 日本語';
  const names = { A: 'Application <script> & 日本語 😀', B: 'Public service', D: 'Device', J: 'Branch AND', K: 'Merge OR', H: 'HIDDEN GOAL — never in current SVG' };
  for (const [symbol, id] of Object.entries(ids)) {
    const concept = [...state.elements, ...state.junctions].find(item => item.id === id);
    if (concept) { concept.name = names[symbol]; concept.documentation = 'PRIVATE documentation stays in the model'; }
  }
  const positions = { A: [-430, -120, 210, 90], B: [0, -120, 210, 90], D: [280, 110, 180, 80], J: [-180, 130, 32, 32], K: [-30, 245, 32, 32], H: [680, -200, 180, 80] };
  for (const [symbol, values] of Object.entries(positions)) {
    const occurrence = state.views[0].occurrences.find(item => item.id === draws[symbol]);
    occurrence.bounds = Object.fromEntries(['x', 'y', 'width', 'height'].map((key, index) => [key, values[index]]));
  }
  for (const connection of state.views[0].connections) connection.routePoints = [];
  const flow = state.views[0].connections.find(item => item.id === draws.R);
  flow.routePoints = [{ kind: 'bend', point: { x: -190, y: -20 } }, { kind: 'anchor', id: anchors.R, point: { x: -100, y: -20 } }, { kind: 'bend', point: { x: -40, y: -20 } }];
  flow.labelPosition = { x: -100, y: -58 };
  const access = state.views[0].connections.find(item => item.id === draws.S);
  access.routePoints = [{ kind: 'bend', point: { x: -510, y: -75 } }, { kind: 'bend', point: { x: -510, y: -240 } }, { kind: 'bend', point: { x: 530, y: -240 } }, { kind: 'bend', point: { x: 530, y: 150 } }];
  access.labelPosition = { x: 200, y: -265 };
  for (const relationship of state.relationships) {
    relationship.label = relationship.id === ids.S ? 'Data <read & write>' : relationship.id === ids.U ? 'Self service' : relationship.id === ids.Q ? 'HIDDEN CONNECTION' : relationship.type;
    if (relationship.id === ids.R) { relationship.sourceMultiplicity = '1..*'; relationship.targetMultiplicity = '0..1'; }
    else { delete relationship.sourceMultiplicity; delete relationship.targetMultiplicity; }
  }
  state.customizationProfiles = [{ id: profileId, ...profileDefinition(), name: 'Reviewed <local> profile' }];
  for (const id of [ids.A, ids.R]) [...state.elements, ...state.relationships].find(item => item.id === id).profileApplications = [{ profileId, values: {} }];
  state.views[1].view.name = 'Other view excluded';
  state.views[1].occurrences.push({ ...structuredClone(state.views[0].occurrences.find(item => item.id === draws.H)), id: fixtureId('occ', 999), bounds: { x: 3000, y: 3000, width: 200, height: 100 } });
  validateProject(state);
  return result;
}
