import { LIMITS, assertJSON, canonicalJSON, fail } from './json.js';
import { exportFiles, importFiles, newId, record, validateProject, projectIndex, conceptRecord, viewIndex, endpointRecord, coordinate } from './format.js';

import { VIEWPOINT_FIELDS } from './viewpoints.js';
import { customizationProfileUsages } from './customization.js';
import { moveDrawingGeometry, alignDrawingGeometry, applyDrawingGeometry } from './group-geometry.js';
import { freezeJSON } from './resolve.js';
import { pasteFragmentInto, remapViewDrawings, assertCurrentFragment } from './fragment.js';
import { pastePortableFragmentInto } from './portable-fragment.js';
import { applyV4Command, assertUnlockedDrawings } from './native-v4-commands.js';
import { applyBulkMetadata } from './bulk-metadata.js';
import { metadataRecord } from './metadata.js';
import { generateViewInto } from './model-graph.js';
import { CURRENT_PROFILE, createRegistry, assessRelationshipCreation, assessProject } from '../../schemka-model-profiles/src/index.js';

const creationRegistry = createRegistry([CURRENT_PROFILE]);

const find = (items, id) => {
  const result = items.find((item) => item.id === id);
  if (!result) fail('REFERENCE', `Entity not found: ${id}`);
  return result;
};
const findView = (state, id) => {
  const result = state.views.find((entry) => entry.view.id === id);
  if (!result) fail('REFERENCE', `View not found: ${id}`);
  return result;
};
const sorted = (items) => [...items].sort();

const refKey = ref => `${ref.kind}:${ref.id}`;
const emptyImpact = () => ({ elementIds: [], junctionIds: [], relationshipIds: [], occurrenceIds: [], connectionIds: [], anchorIds: [], viewIds: [] });
const finishImpact = impact => freezeJSON(Object.fromEntries(Object.entries(impact).map(([key, items]) => [key, sorted(new Set(items))])));

function drawingClosure(entry, occurrenceIds, connectionIds, visualNodeIds = [], visualConnectorIds = []) {
  const removed = new Set([...occurrenceIds.map(id => `occurrence:${id}`), ...connectionIds.map(id => `connection:${id}`), ...visualNodeIds.map(id => `visualNode:${id}`), ...visualConnectorIds.map(id => `visualConnector:${id}`)]);
  const lines = [...entry.connections.map(item => ({ kind: 'connection', item })), ...entry.visualConnectors.map(item => ({ kind: 'visualConnector', item }))];
  const dependents = new Map();
  for (const { kind, item } of lines) for (const endpoint of [item.source, item.target]) {
    const key = refKey(endpoint);
    if (!dependents.has(key)) dependents.set(key, []);
    dependents.get(key).push(`${kind}:${item.id}`);
  }
  const queue = [...removed];
  for (let at = 0; at < queue.length; at++) for (const key of dependents.get(queue[at]) ?? []) if (!removed.has(key)) { removed.add(key); queue.push(key); }
  const result = {
    occurrenceIds: entry.occurrences.filter(item => removed.has(`occurrence:${item.id}`)).map(item => item.id),
    connectionIds: entry.connections.filter(item => removed.has(`connection:${item.id}`)).map(item => item.id),
    anchorIds: lines.filter(({ kind, item }) => removed.has(`${kind}:${item.id}`)).flatMap(({ item }) => item.routePoints.filter(point => point.kind === 'anchor').map(point => point.id)),
  };
  const nodes = entry.visualNodes.filter(item => removed.has(`visualNode:${item.id}`)).map(item => item.id);
  const connectors = entry.visualConnectors.filter(item => removed.has(`visualConnector:${item.id}`)).map(item => item.id);
  if (nodes.length) result.visualNodeIds = nodes;
  if (connectors.length) result.visualConnectorIds = connectors;
  return result;
}
function appendDrawingImpact(impact, entry, occurrenceIds, connectionIds, visualNodeIds = [], visualConnectorIds = []) {
  const local = drawingClosure(entry, occurrenceIds, connectionIds, visualNodeIds, visualConnectorIds);
  for (const [key, ids] of Object.entries(local)) (impact[key] ??= []).push(...ids);
  if (Object.values(local).some(ids => ids.length)) impact.viewIds.push(entry.view.id);
}

/** Detached, deeply frozen and deterministic; execution still requires its base revision. */
export function deletionImpact(state, target) {
  validateProject(state); assertJSON(target); record(target, ['kind', 'id']);
  conceptRecord(projectIndex(state), target);
  const impact = emptyImpact();
  impact[`${target.kind}Ids`].push(target.id);
  const removed = new Set([refKey(target)]), dependents = new Map();
  for (const relationship of state.relationships) for (const endpoint of [relationship.source, relationship.target]) {
    const key = refKey(endpoint);
    if (!dependents.has(key)) dependents.set(key, new Set());
    dependents.get(key).add(relationship.id);
  }
  const queue = [...removed];
  for (let i = 0; i < queue.length; i++) for (const id of dependents.get(queue[i]) ?? []) {
    const key = `relationship:${id}`;
    if (!removed.has(key)) { removed.add(key); queue.push(key); impact.relationshipIds.push(id); }
  }
  const relationships = new Set(impact.relationshipIds);
  for (const entry of state.views) appendDrawingImpact(impact, entry,
    entry.occurrences.filter(item => removed.has(refKey(item.concept))).map(item => item.id),
    entry.connections.filter(item => relationships.has(item.relationshipId)).map(item => item.id));
  return finishImpact(impact);
}
export function drawingDeletionImpact(state, target) {
  assertJSON(target); record(target, ['viewId', 'kind', 'id']);
  return drawingSelectionDeletionImpact(state, { viewId: target.viewId, drawings: [{ kind: target.kind, id: target.id }] });
}

/** One union closure handles overlapping selections and cyclic connector dependents. */
export function drawingSelectionDeletionImpact(state, target) {
  validateProject(state); assertJSON(target); record(target, ['viewId', 'drawings']);
  if (!Array.isArray(target.drawings) || !target.drawings.length) fail('COMMAND', 'Select at least one drawing');
  const entry = findView(state, target.viewId), collections = { occurrence: 'occurrences', connection: 'connections', visualNode: 'visualNodes', visualConnector: 'visualConnectors' };
  const available = new Set(Object.entries(collections).flatMap(([kind, collection]) => entry[collection].map(item => `${kind}:${item.id}`)));
  const selected = { occurrence: [], connection: [], visualNode: [], visualConnector: [] }, seen = new Set();
  for (const drawing of target.drawings) {
    record(drawing, ['kind', 'id']);
    if (typeof drawing.kind !== 'string' || typeof drawing.id !== 'string' || !Object.hasOwn(collections, drawing.kind)) fail('SCHEMA', 'Expected a drawing reference');
    const key = refKey(drawing);
    if (!available.has(key)) fail('REFERENCE', 'Drawing must exist in the selected view');
    if (seen.has(key)) fail('COMMAND', 'Drawing selection must be unique');
    seen.add(key); selected[drawing.kind].push(drawing.id);
  }
  const impact = emptyImpact();
  appendDrawingImpact(impact, entry, selected.occurrence, selected.connection, selected.visualNode, selected.visualConnector);
  return finishImpact(impact);
}

function removeDrawings(state, impact) {
  const removed = new Set(['occurrenceIds', 'connectionIds', 'visualNodeIds', 'visualConnectorIds'].flatMap(key => impact[key] ?? []));
  for (const entry of state.views) {
    const nodes = [...entry.occurrences, ...entry.visualNodes], byId = new Map(nodes.map(item => [item.id, item]));
    for (const item of nodes) while (item.parent && removed.has(item.parent.id)) item.parent = byId.get(item.parent.id).parent;
    for (const collection of ['occurrences', 'connections', 'visualNodes', 'visualConnectors']) entry[collection] = entry[collection].filter(item => !removed.has(item.id));
  }
}

/** A type preview uses the same private, verified registry as command execution. */
export function conceptTypeChangeImpact(state, concept, conceptType) {
  const impact = conceptTypeChangesImpact(state, [{ concept, conceptType }]);
  if (!impact.changes.length) fail('COMMAND', 'Concept type must change');
  return freezeJSON({ ...impact, concept: { ...concept }, fromType: impact.changes[0].fromType, toType: conceptType });
}

/** Assess the final group, never intermediate single-object type changes. */
export function conceptTypeChangesImpact(state, changes) {
  validateProject(state); assertJSON(changes);
  if (!Array.isArray(changes) || !changes.length) fail('COMMAND', 'Select concept type changes');
  const candidate = structuredClone(state), index = projectIndex(candidate), seen = new Set(), actual = [];
  for (const change of changes) {
    record(change, ['concept', 'conceptType']); record(change.concept, ['kind', 'id']);
    const { concept, conceptType } = change;
    if (typeof concept.kind !== 'string' || typeof concept.id !== 'string' || typeof conceptType !== 'string') fail('SCHEMA', 'Expected a concept type change');
    const item = conceptRecord(index, concept), key = refKey(concept);
    if (seen.has(key)) fail('COMMAND', 'Repeated concept type change'); seen.add(key);
    if (item.type !== conceptType) { actual.push({ concept: { ...concept }, fromType: item.type, toType: conceptType }); item.type = conceptType; }
  }
  validateProject(candidate);
  const before = assessProject(state, creationRegistry), after = assessProject(candidate, creationRegistry);
  const blockers = report => {
    const direct = report.relationships.filter(item => item.status === 'FORBIDDEN').map(item => ({ relationshipId: item.relationshipId, ruleId: item.ruleId ?? '', reason: item.reason }));
    const rules = ['junction-container-role', 'junction-multiplicity-applicability', 'junction-same-family', 'junction-terminal-permission'];
    const graph = report.junctionAssessment.issues.filter(item => item.status === 'FAIL' && rules.includes(item.ruleId)).flatMap(item => item.relationshipIds.map(relationshipId => ({ relationshipId, ruleId: item.ruleId, reason: item.reason ?? item.ruleId })));
    return [...direct, ...graph];
  };
  const old = new Set(blockers(before).map(item => `${item.relationshipId}:${item.ruleId}:${item.reason}`));
  const newBlockers = blockers(after).filter(item => !old.has(`${item.relationshipId}:${item.ruleId}:${item.reason}`));
  const selected = new Set(actual.map(item => refKey(item.concept)));
  const related = new Set(candidate.relationships.filter(item => selected.has(`relationship:${item.id}`) || [item.source, item.target].some(ref => selected.has(refKey(ref)))).map(item => item.id));
  for (const item of newBlockers) related.add(item.relationshipId);
  const decisions = after.relationships.filter(item => related.has(item.relationshipId));
  const affectedViewIds = candidate.views.filter(entry => entry.occurrences.some(item => selected.has(refKey(item.concept))) || entry.connections.some(item => related.has(item.relationshipId))).map(entry => entry.view.id).sort();
  return freezeJSON({ changes: actual, relationshipIds: [...related].sort(), affectedViewIds,
    decisions: structuredClone(decisions), newBlockers, unknownRelationshipIds: decisions.filter(item => item.status === 'UNKNOWN').map(item => item.relationshipId) });
}

function apply(state, command) {
  assertJSON(command);
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('COMMAND', 'Expected a command record');
  const shape = (required, optional = []) => record(command, ['type', ...required], optional);
  const result = { command: command.type, created: {}, affectedViewIds: [] };
  const view = () => findView(state, command.viewId);
  const optional = (key, fallback) => Object.hasOwn(command, key) ? command[key] : fallback;
  function occurrence(concept) {
    return { id: newId('occ'), concept, bounds: command.bounds, parent: optional('parent', null), style: optional('style', {}), zIndex: optional('zIndex', 0) };
  }
  function insertAnchor(entry, connectionId, index, point) {
    const host = find(entry.connections, connectionId);
    if (!Number.isSafeInteger(index) || index < 0 || index > host.routePoints.length) fail('GEOMETRY', 'Anchor insertion index is outside its route');
    const anchor = { kind: 'anchor', id: newId('anc'), point };
    host.routePoints.splice(index, 0, anchor);
    return anchor;
  }
  function endpoint(entry, input) {
    if (input?.kind === 'connection' && Object.hasOwn(input, 'insertAnchor')) {
      record(input, ['kind', 'id', 'insertAnchor']);
      record(input.insertAnchor, ['index', 'point']);
      const anchor = insertAnchor(entry, input.id, input.insertAnchor.index, input.insertAnchor.point);
      (result.created.anchorIds ??= []).push(anchor.id);
      return { kind: 'connection', id: input.id, anchorId: anchor.id };
    }
    endpointRecord(projectIndex(state), viewIndex(entry), input);
    return input;
  }
  function connection(entry, relationshipId) {
    return {
      id: newId('conn'), relationshipId,
      source: endpoint(entry, command.source), target: endpoint(entry, command.target),
      routePoints: optional('routePoints', []), labelPosition: optional('labelPosition', null), style: optional('style', {}),
    };
  }
  const relationshipViews = id => state.views.filter(entry => entry.connections.some(item => item.relationshipId === id)).map(entry => entry.view.id);
  const conceptViews = (kind, id) => state.views.filter(entry => entry.occurrences.some(item => item.concept.kind === kind && item.concept.id === id)).map(entry => entry.view.id);
  const applicationViews = ref => ref.kind === 'relationship' ? relationshipViews(ref.id) : conceptViews(ref.kind, ref.id);
  if (applyV4Command(state, command, result)) return result;
  switch (command.type) {
    case 'bulkUpdateMetadata': {
      shape(['changes']); result.affectedViewIds = applyBulkMetadata(state, command.changes); break;
    }
    case 'generateView': {
      shape(['name', 'concepts', 'relationshipMode', 'viewpointId']);
      result.created = generateViewInto(state, command);
      result.affectedViewIds = [result.created.viewId];
      break;
    }
    case 'pastePortableFragment': {
      shape(['viewId','fragment','dx','dy']); result.created = pastePortableFragmentInto(state, command);
      result.affectedViewIds = [command.viewId, ...result.created.viewIds]; break;
    }
    case 'removeFragment':
    case 'moveFragment': {
      shape(command.type === 'removeFragment' ? ['fragment'] : ['fragment','viewId','mode','dx','dy']);
      assertCurrentFragment(state, command.fragment);
      const impact = emptyImpact();
      appendDrawingImpact(impact, findView(state,command.fragment.viewId), ...['occurrences','connections','visualNodes','visualConnectors'].map(key => command.fragment[key].map(item => item.id)));
      if (command.type === 'moveFragment') result.created = pasteFragmentInto(state, command);
      result.impact = finishImpact(impact); removeDrawings(state, result.impact);
      result.affectedViewIds = [...new Set([...result.impact.viewIds, ...(command.type === 'moveFragment' ? [command.viewId] : [])])]; break;
    }
    case 'pasteFragment': {
      shape(['viewId', 'fragment', 'mode', 'dx', 'dy']);
      result.created = pasteFragmentInto(state, command);
      result.affectedViewIds = [command.viewId];
      break;
    }
    case 'applyProjectSnapshot': {
      shape(['files']);
      const replacement = importFiles(command.files);
      if (replacement.project.id !== state.project.id) fail('PROJECT_ID', 'Cannot apply a snapshot from a different project');
      result.affectedViewIds = [...new Set([...state.views, ...replacement.views].map(entry => entry.view.id))];
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, replacement);
      break;
    }
    case 'createViewpoint': {
      shape(['definition']); record(command.definition, VIEWPOINT_FIELDS);
      const definition = { id: newId('vpt'), ...command.definition };
      (state.viewpoints ??= []).push(definition); result.created.viewpointId = definition.id;
      break;
    }
    case 'updateViewpoint': {
      shape(['viewpointId', 'definition']); record(command.definition, VIEWPOINT_FIELDS);
      Object.assign(find(state.viewpoints ?? [], command.viewpointId), command.definition);
      result.affectedViewIds = state.views.filter(entry => entry.view.viewpointId === command.viewpointId).map(entry => entry.view.id);
      break;
    }
    case 'setViewpoint': {
      shape(['viewId', 'viewpointId']); const entry = view();
      if (command.viewpointId === null) delete entry.view.viewpointId;
      else { find(state.viewpoints ?? [], command.viewpointId); entry.view.viewpointId = command.viewpointId; }
      result.affectedViewIds = [entry.view.id]; break;
    }
    case 'deleteViewpoint': {
      shape(['viewpointId']); find(state.viewpoints ?? [], command.viewpointId);
      const users = state.views.filter(entry => entry.view.viewpointId === command.viewpointId);
      if (users.length) fail('REFERENCE', `Viewpoint is used by views: ${users.map(entry => entry.view.id).join(', ')}. Unbind or reassign explicitly first.`);
      state.viewpoints = state.viewpoints.filter(item => item.id !== command.viewpointId);
      if (!state.viewpoints.length) delete state.viewpoints;
      break;
    }
    case 'createCustomizationProfile': {
      shape(['definition']);
      record(command.definition, ['name', 'purpose', 'targets', 'attributes']);
      const definition = { id: newId('prf'), ...command.definition };
      (state.customizationProfiles ??= []).push(definition);
      result.created.profileId = definition.id;
      break;
    }
    case 'updateCustomizationProfile': {
      shape(['profileId', 'definition']);
      record(command.definition, ['name', 'purpose', 'targets', 'attributes']);
      const definition = find(state.customizationProfiles ?? [], command.profileId);
      Object.assign(definition, command.definition);
      result.affectedViewIds = [...new Set(customizationProfileUsages(state, definition.id).flatMap(applicationViews))];
      break;
    }
    case 'deleteCustomizationProfile': {
      shape(['profileId']);
      find(state.customizationProfiles ?? [], command.profileId);
      const usages = customizationProfileUsages(state, command.profileId);
      if (usages.length) fail('REFERENCE', `Profile is used by ${usages.length} concepts: ${usages.map(ref => ref.id).join(', ')}. Detach applications first.`);
      for(const entry of state.views)for(const node of entry.visualNodes)if(node.legend?.colors?.some(row=>row.profileId===command.profileId)){node.legend.colors=node.legend.colors.filter(row=>row.profileId!==command.profileId);if(!node.legend.colors.length)delete node.legend.colors;result.affectedViewIds.push(entry.view.id);}
      state.customizationProfiles = state.customizationProfiles.filter(item => item.id !== command.profileId);
      if (!state.customizationProfiles.length) delete state.customizationProfiles;
      break;
    }
    case 'setProfileApplication':
    case 'removeProfileApplication': {
      const set = command.type === 'setProfileApplication';
      shape(['concept', 'profileId', ...(set ? ['values'] : [])]);
      const concept = conceptRecord(projectIndex(state), command.concept);
      find(state.customizationProfiles ?? [], command.profileId);
      const applications = concept.profileApplications ?? [];
      const at = applications.findIndex(item => item.profileId === command.profileId);
      if (set) {
        const application = { profileId: command.profileId, values: command.values };
        if (at < 0) applications.push(application); else applications[at] = application;
        concept.profileApplications = applications;
      } else {
        if (at < 0) fail('REFERENCE', 'Customization application does not exist');
        applications.splice(at, 1);
        if (!applications.length) delete concept.profileApplications;
      }
      result.affectedViewIds = applicationViews(command.concept);
      break;
    }
    case 'changeConceptTypes': {
      shape(['changes']);
      const impact = conceptTypeChangesImpact(state, command.changes);
      if (!impact.changes.length) fail('COMMAND', 'Concept types are unchanged');
      if (impact.newBlockers.length) fail('RELATIONSHIP_FORBIDDEN', `Type change creates forbidden relationships: ${impact.newBlockers.map(item => item.relationshipId).join(', ')}`);
      const index = projectIndex(state);
      for (const change of impact.changes) conceptRecord(index, change.concept).type = change.toType;
      result.impact = impact; result.affectedViewIds = [...impact.affectedViewIds]; break;
    }
    case 'changeConceptType': {
      shape(['concept', 'conceptType']);
      const impact = conceptTypeChangeImpact(state, command.concept, command.conceptType);
      if (impact.newBlockers.length) fail('RELATIONSHIP_FORBIDDEN', `Type change creates forbidden relationships: ${impact.newBlockers.map(item => item.relationshipId).join(', ')}`);
      conceptRecord(projectIndex(state), command.concept).type = command.conceptType;
      result.impact = impact; result.affectedViewIds = [...impact.affectedViewIds]; break;
    }
    case 'renameProject': {
      shape(['name']);
      state.project.name = command.name;
      result.affectedViewIds = state.views.map((entry) => entry.view.id);
      break;
    }
    case 'updateMetadata': {
      shape(['owner'], ['documentation', 'properties']);
      const item = metadataRecord(state, command.owner);
      let changed = false;
      for (const field of ['documentation', 'properties']) if (Object.hasOwn(command, field)) {
        if (canonicalJSON(item[field]) !== canonicalJSON(command[field])) changed = true;
        item[field] = command[field];
      }
      if (!changed) fail('COMMAND', 'Metadata update must change documentation or properties');
      result.affectedViewIds = command.owner.kind === 'project' ? state.views.map(entry => entry.view.id)
        : command.owner.kind === 'view' ? [item.id] : ['visualNode', 'visualConnector'].includes(command.owner.kind) ? [command.owner.viewId]
        : command.owner.kind === 'folder' ? [] : applicationViews(command.owner);
      break;
    }
    case 'renameView': {
      shape(['viewId', 'name']);
      const entry = view();
      entry.view.name = command.name;
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'createView': {
      shape(['name'], ['documentation', 'properties', 'viewpointId']);
      const item = { id: newId('view'), name: command.name, documentation: optional('documentation', ''), properties: optional('properties', []) };
      if (Object.hasOwn(command, 'viewpointId')) item.viewpointId = command.viewpointId;
      state.views.push({ view: item, occurrences: [], connections: [], visualNodes: [], visualConnectors: [] });
      result.created.viewId = item.id;
      result.affectedViewIds = [item.id];
      break;
    }
    case 'deleteView': {
      shape(['viewId']); const removed = view(), impact = emptyImpact(); impact.viewIds.push(removed.view.id);
      for (const entry of state.views) if (entry !== removed) appendDrawingImpact(impact, entry, [], [], entry.visualNodes.filter(item => item.kind === 'viewReference' && item.targetViewId === removed.view.id).map(item => item.id));
      removeDrawings(state, impact); state.views = state.views.filter(entry => entry.view.id !== removed.view.id);
      for (const folder of state.folders) folder.members = folder.members.filter(ref => ref.kind !== 'view' || ref.id !== removed.view.id);
      result.impact = finishImpact(impact); result.affectedViewIds = [...impact.viewIds]; break;
    }
    case 'duplicateView': {
      shape(['viewId', 'name']);
      const entry = structuredClone(view());
      entry.view.id = newId('view');
      entry.view.name = command.name;
      remapViewDrawings(entry);
      state.views.push(entry);
      result.created.viewId = entry.view.id;
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'createElementAndOccurrence': {
      shape(['viewId', 'elementType', 'name', 'bounds'], ['documentation', 'properties', 'zIndex', 'parent', 'style', 'locked', 'profileId']);
      const entry = view();
      const element = { id: newId('el'), type: command.elementType, name: command.name,
        documentation: optional('documentation', ''), properties: optional('properties', []) };
      if (Object.hasOwn(command,'profileId')) element.profileApplications = [{profileId:command.profileId,values:{}}];
      const item = occurrence({ kind: 'element', id: element.id }); if (Object.hasOwn(command, 'locked')) item.locked = command.locked;
      state.elements.push(element); entry.occurrences.push(item);
      result.created = { elementId: element.id, occurrenceId: item.id };
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'addOccurrence': {
      shape(['viewId', 'concept', 'bounds'], ['zIndex', 'parent', 'style', 'locked']);
      const entry = view();
      conceptRecord(projectIndex(state), command.concept, true);
      const item = occurrence(command.concept); if (Object.hasOwn(command, 'locked')) item.locked = command.locked;
      entry.occurrences.push(item);
      result.created.occurrenceId = item.id;
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'updateConceptDocumentation': {
      shape(['concept', 'documentation']);
      const item = conceptRecord(projectIndex(state), command.concept);
      if (item.documentation === command.documentation) fail('COMMAND', 'Documentation update must change the text');
      item.documentation = command.documentation;
      result.affectedViewIds = applicationViews(command.concept);
      break;
    }
    case 'renameElement': {
      shape(['elementId', 'name']);
      find(state.elements, command.elementId).name = command.name;
      result.affectedViewIds = conceptViews('element', command.elementId);
      break;
    }
    case 'updateConceptProperties': {
      shape(['concept', 'properties']);
      const item = conceptRecord(projectIndex(state), command.concept);
      if (canonicalJSON(item.properties) === canonicalJSON(command.properties)) fail('COMMAND', 'Properties update must change at least one property');
      item.properties = command.properties;
      result.affectedViewIds = applicationViews(command.concept);
      break;
    }
    case 'renameRelationship': {
      shape(['relationshipId', 'label']);
      find(state.relationships, command.relationshipId).label = command.label;
      result.affectedViewIds = state.views.filter((entry) => entry.connections.some((item) => item.relationshipId === command.relationshipId))
        .map((entry) => entry.view.id);
      break;
    }
    case 'updateRelationshipMultiplicity': {
      shape(['relationshipId'], ['sourceMultiplicity', 'targetMultiplicity']);
      const item = find(state.relationships, command.relationshipId);
      let changed = false;
      for (const field of ['sourceMultiplicity', 'targetMultiplicity']) {
        if (!Object.hasOwn(command, field)) continue;
        if (command[field] === null) {
          if (Object.hasOwn(item, field)) { delete item[field]; changed = true; }
        } else if (!Object.hasOwn(item, field) || item[field] !== command[field]) {
          item[field] = command[field]; changed = true;
        }
      }
      if (!changed) fail('COMMAND', 'Multiplicity update must change or remove at least one end');
      result.affectedViewIds = state.views.filter(entry => entry.connections.some(connection => connection.relationshipId === item.id))
        .map(entry => entry.view.id);
      break;
    }
    case 'alignDrawings': {
      shape(['viewId', 'drawings', 'anchor', 'operation'], ['connectionIds']);
      const entry = view(), geometry = alignDrawingGeometry(entry, command.drawings, command.anchor, command.operation, command.connectionIds);
      if (!geometry.occurrences.length && !geometry.visualNodes.length) fail('COMMAND', 'Alignment must change the drawing geometry');
      applyDrawingGeometry(entry, geometry);
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'moveDrawings': {
      shape(['viewId', 'drawings', 'dx', 'dy'], ['connectionIds']);
      const entry = view(), geometry = moveDrawingGeometry(entry, command.drawings, command.dx, command.dy, command.connectionIds);
      if (!geometry.occurrences.length && !geometry.visualNodes.length) fail('COMMAND', 'Movement must change the drawing geometry');
      applyDrawingGeometry(entry, geometry);
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'moveOccurrence': {
      shape(['viewId', 'occurrenceId', 'x', 'y']);
      const entry = view();
      coordinate(command.x); coordinate(command.y);
      const item = find(entry.occurrences, command.occurrenceId);
      const dx = Math.round((command.x - item.bounds.x) * 10) / 10 || 0, dy = Math.round((command.y - item.bounds.y) * 10) / 10 || 0;
      applyDrawingGeometry(entry, moveDrawingGeometry(entry, [{ kind: 'occurrence', id: item.id }], dx, dy));
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'resizeOccurrence': {
      shape(['viewId', 'occurrenceId', 'width', 'height']);
      const entry = view(), bounds = find(entry.occurrences, command.occurrenceId).bounds;
      if (bounds.width === command.width && bounds.height === command.height) fail('COMMAND', 'Resize must change the dimensions');
      Object.assign(bounds, { width: command.width, height: command.height });
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'createJunctionAndOccurrence': {
      shape(['viewId', 'junctionType', 'name', 'bounds'], ['documentation', 'properties', 'zIndex', 'parent', 'style', 'locked', 'profileId']);
      const entry = view();
      const junction = { id: newId('jct'), type: command.junctionType, name: command.name,
        documentation: optional('documentation', ''), properties: optional('properties', []) };
      if (Object.hasOwn(command,'profileId')) junction.profileApplications = [{profileId:command.profileId,values:{}}];
      const item = occurrence({ kind: 'junction', id: junction.id }); if (Object.hasOwn(command, 'locked')) item.locked = command.locked;
      state.junctions.push(junction); entry.occurrences.push(item);
      result.created = { junctionId: junction.id, occurrenceId: item.id }; result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'renameJunction':
    case 'updateJunctionType': {
      const rename = command.type === 'renameJunction';
      shape(['junctionId', rename ? 'name' : 'junctionType']);
      find(state.junctions, command.junctionId)[rename ? 'name' : 'type'] = command[rename ? 'name' : 'junctionType'];
      result.affectedViewIds = conceptViews('junction', command.junctionId);
      break;
    }
    case 'updateRelationshipJunctionRole': {
      shape(['relationshipId', 'junctionRole']);
      const item = find(state.relationships, command.relationshipId);
      if (command.junctionRole === null) delete item.junctionRole; else item.junctionRole = command.junctionRole;
      result.affectedViewIds = relationshipViews(item.id);
      break;
    }
    case 'createRelationshipAndConnection': {
      shape(['viewId', 'source', 'target', 'relationshipType', 'label'], ['documentation', 'properties', 'routePoints', 'labelPosition', 'sourceMultiplicity', 'targetMultiplicity', 'junctionRole', 'style', 'profileId']);
      const entry = view();
      const item = connection(entry, newId('rel'));
      const local = viewIndex(entry), index = projectIndex(state);
      const relationship = { id: item.relationshipId, type: command.relationshipType,
        source: endpointRecord(index, local, item.source).concept, target: endpointRecord(index, local, item.target).concept,
        label: command.label, documentation: optional('documentation', ''), properties: optional('properties', []) };
      if (Object.hasOwn(command,'profileId')) relationship.profileApplications = [{profileId:command.profileId,values:{}}];
      for (const field of ['sourceMultiplicity', 'targetMultiplicity', 'junctionRole']) if (Object.hasOwn(command, field)) relationship[field] = command[field];
      state.relationships.push(relationship); entry.connections.push(item);
      Object.assign(result.created, { relationshipId: relationship.id, connectionId: item.id });
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'addConnection': {
      shape(['viewId', 'relationshipId', 'source', 'target'], ['routePoints', 'labelPosition', 'style']);
      const entry = view();
      const item = connection(entry, command.relationshipId);
      entry.connections.push(item);
      result.created.connectionId = item.id; result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'updateConnectionLayout': {
      shape(['viewId', 'connectionId', 'routePoints', 'labelPosition']);
      const entry = view(), item = find(entry.connections, command.connectionId);
      item.routePoints = command.routePoints; item.labelPosition = command.labelPosition;
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'resetConnectionLayout': {
      shape(['viewId', 'connectionId']);
      const entry = view(), item = find(entry.connections, command.connectionId);
      item.routePoints = item.routePoints.filter(point => point.kind === 'anchor'); item.labelPosition = null;
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'insertConnectionAnchor': {
      shape(['viewId', 'connectionId', 'index', 'point']);
      const entry = view();
      const anchor = insertAnchor(entry, command.connectionId, command.index, command.point);
      result.created.anchorId = anchor.id; result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'moveConnectionAnchor': {
      shape(['viewId', 'connectionId', 'anchorId', 'point']);
      const entry = view(), host = find(entry.connections, command.connectionId);
      const anchor = find(host.routePoints.filter(point => point.kind === 'anchor'), command.anchorId);
      anchor.point = command.point; result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'removeConnectionAnchor': {
      shape(['viewId', 'connectionId', 'anchorId'], ['replacement']);
      const entry = view(), host = find(entry.connections, command.connectionId);
      find(host.routePoints.filter(point => point.kind === 'anchor'), command.anchorId);
      if (Object.hasOwn(command, 'replacement')) {
        endpointRecord(projectIndex(state), viewIndex(entry), command.replacement);
        for (const item of [...entry.connections, ...entry.visualConnectors]) for (const end of ['source', 'target']) {
          const ref = item[end];
          if (ref.kind === 'connection' && ref.id === host.id && ref.anchorId === command.anchorId) item[end] = command.replacement;
        }
      }
      host.routePoints = host.routePoints.filter(point => point.kind !== 'anchor' || point.id !== command.anchorId);
      result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'rebindConnectionEndpoint': {
      shape(['viewId', 'connectionId', 'end', 'endpoint']);
      if (!['source', 'target'].includes(command.end)) fail('SCHEMA', 'Expected source or target end');
      const entry = view(), item = find(entry.connections, command.connectionId);
      endpointRecord(projectIndex(state), viewIndex(entry), command.endpoint);
      item[command.end] = command.endpoint; result.affectedViewIds = [entry.view.id];
      break;
    }
    case 'removeDrawings': {
      shape(['viewId', 'drawings']);
      const impact = drawingSelectionDeletionImpact(state, { viewId: command.viewId, drawings: command.drawings });
      removeDrawings(state, impact); result.impact = impact; result.affectedViewIds = [...impact.viewIds];
      break;
    }
    case 'removeVisualNode':
    case 'removeVisualConnector':
    case 'removeConnection':
    case 'removeOccurrence': {
      const kind = { removeOccurrence: 'occurrence', removeConnection: 'connection', removeVisualNode: 'visualNode', removeVisualConnector: 'visualConnector' }[command.type];
      const field = { occurrence: 'occurrenceId', connection: 'connectionId', visualNode: 'nodeId', visualConnector: 'connectorId' }[kind];
      shape(['viewId', field]);
      const impact = drawingDeletionImpact(state, { viewId: command.viewId, kind, id: command[field] });
      removeDrawings(state, impact); result.impact = impact; result.affectedViewIds = [...impact.viewIds];
      break;
    }
    case 'deleteElementFromModel':
    case 'deleteJunctionFromModel':
    case 'deleteRelationshipFromModel': {
      const kind = command.type === 'deleteElementFromModel' ? 'element' : command.type === 'deleteJunctionFromModel' ? 'junction' : 'relationship';
      shape([`${kind}Id`]);
      const impact = deletionImpact(state, { kind, id: command[`${kind}Id`] });
      for (const [collection, key] of [['elements', 'elementIds'], ['junctions', 'junctionIds'], ['relationships', 'relationshipIds']]) {
        const removed = new Set(impact[key]); state[collection] = state[collection].filter(item => !removed.has(item.id));
      }
      for (const folder of state.folders) folder.members = folder.members.filter(ref => !impact[`${ref.kind}Ids`]?.includes(ref.id));
      removeDrawings(state, impact); result.impact = impact; result.affectedViewIds = [...impact.viewIds];
      break;
    }
    default: fail('COMMAND', 'Unsupported command');
  }
  result.affectedViewIds.sort();
  return result;
}

/** Local session. Whole snapshots keep bounded local history easy to audit. */
export function createStore(initialState) {
  validateProject(initialState);
  // Schema/JSON checks above ensure this conversion cannot omit supported data.
  // Unlike structuredClone, JSON tree cloning breaks aliased bounds across views.
  let state = JSON.parse(JSON.stringify(initialState));
  let revision = 0;
  let past = [];
  let future = [];
  function check(baseRevision) {
    if (!Number.isSafeInteger(baseRevision) || baseRevision !== revision) fail('REVISION', 'Stale or invalid base revision');
    if (revision === Number.MAX_SAFE_INTEGER) fail('REVISION', 'Session revision exhausted');
  }
  return Object.freeze({
    get revision() { return revision; },
    get snapshot() { return structuredClone(state); },
    get history() { return { undo: past.length, redo: future.length }; },
    exportFiles() { return exportFiles(state); },
    execute(command, baseRevision) {
      check(baseRevision);
      assertJSON(command);
      const candidate = structuredClone(state);
      const result = apply(candidate, structuredClone(command));
      validateProject(candidate);
      assertUnlockedDrawings(state, candidate);
      for (const relationshipId of result.created.relationshipIds ?? (result.created.relationshipId ? [result.created.relationshipId] : [])) {
        const forbidden = assessRelationshipCreation(candidate, creationRegistry, relationshipId);
        if (forbidden) fail('RELATIONSHIP_FORBIDDEN', `Новое отношение запрещено: ${forbidden.reason} (${forbidden.ruleId || 'endpoint-permission'}).`);
      }
      past.push({ state, result });
      if (past.length > LIMITS.history) past.shift();
      future = [];
      state = JSON.parse(JSON.stringify(candidate));
      revision++;
      return structuredClone({ ...result, revision });
    },
    undo(baseRevision) {
      check(baseRevision);
      if (!past.length) fail('HISTORY', 'Nothing to undo');
      const previous = past.pop();
      future.push({ state, result: previous.result });
      state = previous.state;
      revision++;
      return structuredClone({ ...previous.result, revision, action: 'undo' });
    },
    redo(baseRevision) {
      check(baseRevision);
      if (!future.length) fail('HISTORY', 'Nothing to redo');
      const next = future.pop();
      past.push({ state, result: next.result });
      state = next.state;
      revision++;
      return structuredClone({ ...next.result, revision, action: 'redo' });
    },
    load(files, baseRevision) {
      check(baseRevision);
      const candidate = importFiles(files);
      state = JSON.parse(JSON.stringify(candidate));
      past = []; future = [];
      revision++;
      return { revision };
    },
  });
}
