import { completeCurrentFixture } from './current-fixture.js';
import { createProject, validateProject } from '../src/index.js';
import { fixtureId } from './relationship-project.js';

export const viewpointId = fixtureId('vpt', 1);
export const viewpointDefinition = (selection = { elementTypes: ['ApplicationComponent', 'DataObject'], junctionTypes: [], relationshipTypes: ['Access', 'Association'] }) => ({
  name: 'Application information', documentation: 'Synthetic only', stakeholders: ['Application owner'], concerns: ['Which information is accessed?'],
  purpose: ['informing'], content: ['coherence'], selection, representation: { kind: 'diagram', notation: 'archimate', labels: 'name-and-type' },
});

/** Synthetic fixture adapter. Symbolic expected sets live in tests, never in the selector. */
export function viewpointGraph({ types = { A: 'ApplicationComponent', D: 'DataObject', X: 'Device' }, relationships = { R: ['Access', 'A', 'D'], S: ['Association', 'A', 'X'] }, selection, drawn = true } = {}) {
  const state = createProject('Synthetic viewpoint graph'), ids = {}, symbols = new Map(), refs = {};
  let n = 0;
  for (const [label, type] of Object.entries(types)) {
    const kind = ['AndJunction', 'OrJunction'].includes(type) ? 'junction' : 'element';
    const id = fixtureId(kind === 'junction' ? 'jct' : 'el', ++n); ids[label] = id; symbols.set(id, label); refs[label] = { kind, id };
    state[kind === 'junction' ? 'junctions' : 'elements'].push({ id, type, name: label, documentation: '', properties: { raw: 'untouched' } });
  }
  for (const label of Object.keys(relationships)) { const id = fixtureId('rel', ++n); ids[label] = id; symbols.set(id, label); refs[label] = { kind: 'relationship', id }; }
  for (const [label, [type, source, target]] of Object.entries(relationships)) state.relationships.push({ id: ids[label], type, source: refs[source], target: refs[target], label, documentation: '', properties: {}, sourceMultiplicity: ' raw\r\n', targetMultiplicity: '' });
  const view = { view: { id: fixtureId('view', 1), name: 'Governed', documentation: '', properties: {}, viewpointId }, occurrences: [], connections: [] };
  state.views.push(view, { view: { id: fixtureId('view', 2), name: 'Unbound', documentation: '', properties: {} }, occurrences: [], connections: [] });
  const draws = {}, anchors = {};
  for (const label of Object.keys(refs)) { draws[label] = fixtureId(refs[label].kind === 'relationship' ? 'conn' : 'occ', ++n); symbols.set(draws[label], `${refs[label].kind === 'relationship' ? 'c' : 'o'}${label}`); if (refs[label].kind === 'relationship') anchors[label] = fixtureId('anc', n); }
  const endpoint = label => refs[label].kind === 'relationship' ? { kind: 'connection', id: draws[label], anchorId: anchors[label] } : { kind: 'occurrence', id: draws[label] };
  if (drawn) {
    for (const label of Object.keys(types)) view.occurrences.push({ id: draws[label], concept: refs[label], bounds: { x: 10, y: 20, width: 120, height: 60 }, parentOccurrenceId: null, zIndex: 0 });
    for (const [label, [, source, target]] of Object.entries(relationships)) view.connections.push({ id: draws[label], relationshipId: ids[label], source: endpoint(source), target: endpoint(target), routePoints: [{ kind: 'anchor', id: anchors[label], point: { x: 50, y: 80 } }], labelPosition: null });
  }
  state.viewpoints = [{ id: viewpointId, ...viewpointDefinition(selection) }];
  validateProject(completeCurrentFixture(state));
  return { state, ids, refs, draws, anchors, symbols, names: values => values.map(value => symbols.get(typeof value === 'string' ? value : value.id)).sort() };
}
