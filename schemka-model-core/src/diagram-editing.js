import { validateProject, exportFiles, createStore } from './index.js';
import { CURRENT_PROFILE, createRegistry, assessProject } from '../../schemka-model-profiles/src/index.js';

const profiles = createRegistry([CURRENT_PROFILE]);
const key = ref => ref ? `${ref.kind}:${ref.id}` : 'root';
const compare = (a, b) => a.item.zIndex - b.item.zIndex || a.item.id.localeCompare(b.item.id);
const assertUnlocked = items => { if (items.some(item => item.locked)) throw new Error('Сначала разблокируйте рисунок.'); };

/** Only sibling drawings change order; a selected group keeps its internal order. */
export function reorderDrawings(state, viewId, drawings, direction) {
  validateProject(state);
  if (!['front', 'back', 'forward', 'backward'].includes(direction)) throw new Error('Неизвестный порядок рисунков.');
  const snapshot = structuredClone(state), view = snapshot.views.find(entry => entry.view.id === viewId);
  if (!view) throw new Error('Представление не найдено.');
  const nodes = [...view.occurrences.map(item => ({ kind: 'occurrence', item })), ...view.visualNodes.map(item => ({ kind: 'visualNode', item }))], chosen = new Set(drawings.map(key));
  if (!chosen.size || drawings.some(ref => !nodes.some(node => key({ kind: node.kind, id: node.item.id }) === key(ref)))) throw new Error('Выберите фигуры текущего представления.');
  assertUnlocked(nodes.filter(node => chosen.has(key({ kind: node.kind, id: node.item.id }))).map(node => node.item));
  const parents = new Set(nodes.filter(node => chosen.has(key({ kind: node.kind, id: node.item.id }))).map(node => key(node.item.parent))); let changed = false;
  for (const parent of parents) {
    const siblings = nodes.filter(node => key(node.item.parent) === parent).sort(compare), result = [...siblings];
    const selected = node => chosen.has(key({ kind: node.kind, id: node.item.id }));
    if (direction === 'front') result.splice(0, result.length, ...siblings.filter(node => !selected(node)), ...siblings.filter(selected));
    else if (direction === 'back') result.splice(0, result.length, ...siblings.filter(selected), ...siblings.filter(node => !selected(node)));
    else if (direction === 'forward') { for (let i = result.length - 2; i >= 0; i--) if (selected(result[i]) && !selected(result[i + 1])) [result[i], result[i + 1]] = [result[i + 1], result[i]]; }
    else { for (let i = 1; i < result.length; i++) if (selected(result[i]) && !selected(result[i - 1])) [result[i], result[i - 1]] = [result[i - 1], result[i]]; }
    if (siblings.every((node, index) => node === result[index])) continue;
    assertUnlocked(result.filter((node, index) => node.item.zIndex !== index).map(node => node.item));
    result.forEach((node, index) => { node.item.zIndex = index; }); changed = true;
  }
  validateProject(snapshot); return { snapshot, changed };
}

const swap = (item, left, right) => {
  const hasLeft = Object.hasOwn(item, left), hasRight = Object.hasOwn(item, right), a = item[left], b = item[right];
  if (hasRight) item[left] = b; else delete item[left];
  if (hasLeft) item[right] = a; else delete item[right];
};
const blockers = report => [...report.relationships.filter(item => item.status === 'FORBIDDEN').map(item => `${item.relationshipId}:${item.ruleId}:${item.reason}`),
  ...report.junctionAssessment.issues.filter(item => item.status === 'FAIL').map(item => `${item.ruleId}:${[...item.relationshipIds].sort().join(',')}`)];

/** Preview the complete affected graph; direction changes every occurrence of a relation. */
export function reverseRelationships(state, relationshipIds) {
  validateProject(state); const ids = new Set(relationshipIds);
  if (!ids.size || ids.size !== relationshipIds.length) throw new Error('Выберите отношения без повторов.');
  const snapshot = structuredClone(state);
  for (const id of ids) {
    const item = snapshot.relationships.find(item => item.id === id); if (!item) throw new Error('Отношение не найдено.');
    swap(item, 'source', 'target'); swap(item, 'sourceMultiplicity', 'targetMultiplicity');
  }
  const affectedViewIds = [];
  for (const view of snapshot.views) {
    const connections = view.connections.filter(item => ids.has(item.relationshipId)); if (!connections.length) continue;
    affectedViewIds.push(view.view.id); assertUnlocked(connections);
    for (const item of connections) { swap(item, 'source', 'target'); item.routePoints.reverse(); swap(item.style, 'sourceEnding', 'targetEnding'); }
  }
  validateProject(snapshot);
  const before = new Set(blockers(assessProject(state, profiles))), report = assessProject(snapshot, profiles), newBlockers = blockers(report).filter(item => !before.has(item));
  const decisions = report.relationships.filter(item => ids.has(item.relationshipId));
  return { snapshot, affectedViewIds, decisions, newBlockers, unknownRelationshipIds: decisions.filter(item => item.status === 'UNKNOWN').map(item => item.relationshipId) };
}

export function createLinkedElement(state, { viewId, elementType, name, bounds, parent = null, sourceOccurrenceId = null, relationshipType = null, reverse = false }, { prepareCommand = command => command } = {}) {
  validateProject(state); const stage = createStore(state), run = command => stage.execute(prepareCommand(command), stage.revision).created;
  const created = run({ type: 'createElementAndOccurrence', viewId, elementType, name, bounds, parent });
  if (sourceOccurrenceId) {
    const a = { kind: 'occurrence', id: sourceOccurrenceId }, b = { kind: 'occurrence', id: created.occurrenceId };
    Object.assign(created, run({ type: 'createRelationshipAndConnection', viewId, relationshipType, source: reverse ? b : a, target: reverse ? a : b, label: '' }));
  }
  return { snapshot: stage.snapshot, files: exportFiles(stage.snapshot), created };
}
