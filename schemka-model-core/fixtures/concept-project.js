import { completeCurrentFixture } from './current-fixture.js';
import { createProject, validateProject } from '../src/index.js';
import { fixtureId as id } from './relationship-project.js';

/** Synthetic current graph with all nine endpoint pairs, self references and mutual cycles. */
export function conceptProject() {
  const state = createProject('Synthetic current concepts');
  state.project.id = id('prj', 1);
  const named = (prefix, number, type) => ({ id: id(prefix, number), type, name: `${type} ${number}`, documentation: 'Exact text\r\n🙂', properties: { raw: '<plain>' } });
  state.elements = [named('el', 1, 'Grouping'), named('el', 2, 'ApplicationComponent')];
  state.junctions = [named('jct', 1, 'AndJunction'), named('jct', 2, 'OrJunction')];
  const ref = (kind, number) => ({ kind, id: id(kind === 'element' ? 'el' : kind === 'junction' ? 'jct' : 'rel', number) });
  const pairs = [
    [ref('element', 1), ref('element', 2)], [ref('element', 1), ref('junction', 1)],
    [ref('junction', 1), ref('element', 2)], [ref('junction', 1), ref('junction', 2)],
    [ref('element', 1), ref('relationship', 1)], [ref('relationship', 1), ref('element', 2)],
    [ref('junction', 1), ref('relationship', 1)], [ref('relationship', 1), ref('junction', 2)],
    [ref('relationship', 1), ref('relationship', 1)], [ref('relationship', 10), ref('element', 2)],
    [ref('relationship', 12), ref('element', 2)], [ref('relationship', 11), ref('junction', 1)],
  ];
  state.relationships = pairs.map(([source, target], index) => ({ id: id('rel', index + 1), type: 'Association', source, target, label: `Link ${index + 1}`, documentation: '', properties: {}, sourceMultiplicity: '', targetMultiplicity: ' 0..*\r\n' }));
  const occurrences = [...state.elements.map(item => ({ kind: 'element', id: item.id })), ...state.junctions.map(item => ({ kind: 'junction', id: item.id }))]
    .map((concept, index) => ({ id: id('occ', index + 1), concept, bounds: { x: index * 200, y: index ? -index * 100 : 0, width: index < 2 ? 120 : 24, height: index < 2 ? 60 : 24 }, parentOccurrenceId: null, zIndex: index }));
  const endpoint = concept => concept.kind === 'relationship'
    ? { kind: 'connection', id: id('conn', Number(concept.id.slice(-12))), anchorId: id('anc', Number(concept.id.slice(-12))) }
    : { kind: 'occurrence', id: occurrences.find(item => item.concept.kind === concept.kind && item.concept.id === concept.id).id };
  const connections = state.relationships.map((relationship, index) => ({ id: id('conn', index + 1), relationshipId: relationship.id,
    source: endpoint(relationship.source), target: endpoint(relationship.target),
    routePoints: [{ kind: 'bend', point: { x: 12.3, y: -45.6 } }, { kind: 'anchor', id: id('anc', index + 1), point: { x: index * 30.1, y: 25 } }, { kind: 'bend', point: { x: 12.3, y: -45.6 } }],
    labelPosition: { x: -0.1, y: 1000000 },
  }));
  // Integer arithmetic keeps every point on the native 0.1 grid exactly.
  for (let i = 0; i < connections.length; i++) connections[i].routePoints[1].point.x = Math.round(i * 301) / 10;
  connections.push({ ...structuredClone(connections[0]), id: id('conn', 100), routePoints: [{ kind: 'anchor', id: id('anc', 100), point: { x: 777, y: 888 } }] });
  state.views = [{ view: { id: id('view', 1), name: 'All concepts', documentation: '', properties: {} }, occurrences, connections }, { view: { id: id('view', 2), name: 'Empty', documentation: '', properties: {} }, occurrences: [], connections: [] }];
  return validateProject(completeCurrentFixture(state));
}
