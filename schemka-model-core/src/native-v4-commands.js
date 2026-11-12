import { canonicalJSON, fail, record } from './json.js';
import { conceptRecord, drawingRecord, newId, projectIndex, visualEndpointRecord } from './format.js';
import { profileAppliesTo } from './customization.js';

export function assetUsages(state, assetId) {
  const usages = [];
  for (const entry of state.views) for (const [kind, collection] of [['occurrence', 'occurrences'], ['visualNode', 'visualNodes']]) {
    for (const item of entry[collection]) if (item.assetId === assetId || item.style?.image?.assetId === assetId) usages.push({ kind, viewId: entry.view.id, id: item.id });
  }
  for (const definition of state.customizationProfiles ?? []) if (definition.imageAssetId === assetId) usages.push({ kind: 'customizationProfile', id: definition.id });
  return usages;
}
export function hierarchyDescendants(entry, refs) {
  const selected = new Set(refs.map(ref => `${ref.kind}:${ref.id}`));
  const all = [...entry.occurrences.map(item => ({ kind: 'occurrence', item })), ...entry.visualNodes.map(item => ({ kind: 'visualNode', item }))];
  const children = new Map();
  for (const { kind, item } of all) if (item.parent) {
    const key = `${item.parent.kind}:${item.parent.id}`;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(`${kind}:${item.id}`);
  }
  const queue = [...selected];
  for (let at = 0; at < queue.length; at++) for (const child of children.get(queue[at]) ?? []) if (!selected.has(child)) { selected.add(child); queue.push(child); }
  return all.filter(({ kind, item }) => selected.has(`${kind}:${item.id}`));
}
const types = new Set(['createFolder', 'updateFolder', 'moveFolderMembers', 'deleteFolder', 'createElementInModel', 'createJunctionInModel', 'duplicateConcept', 'createAsset', 'deleteAsset', 'createVisualNode', 'updateVisualNode', 'createVisualConnector', 'updateVisualConnector', 'updateDrawingStyle', 'resetDrawingStyle', 'reparentDrawing', 'resizeDrawing', 'setCustomizationProfileImage', 'setDrawingLocked', 'setViewPresentation']);

/** Applies only to the store's disposable draft; its ordinary validation commits once. */
export function applyV4Command(state, command, result) {
  if (!types.has(command.type)) return false;
  const shape = (required, optional = []) => record(command, ['type', ...required], optional);
  const find = (items, id) => { const item = items.find(item => item.id === id); if (!item) fail('REFERENCE', 'Entity does not exist'); return item; };
  const entry = () => find(state.views.map(entry => ({ id: entry.view.id, entry })), command.viewId).entry;
  const metadata = () => ({ name: command.name ?? '', documentation: command.documentation ?? '', properties: command.properties ?? [] });
  switch (command.type) {
    case 'setDrawingLocked': {
      shape(['viewId', 'drawing', 'locked']); const target = entry(), item = drawingRecord(target, command.drawing);
      if (typeof command.locked !== 'boolean') fail('SCHEMA', 'Drawing lock must be boolean');
      if ((item.locked ?? false) === command.locked) fail('COMMAND', 'Drawing lock must change');
      item.locked = command.locked; result.affectedViewIds = [target.view.id]; break;
    }
    case 'setViewPresentation': {
      shape(['viewId'], ['kind', 'background','router']); const target = entry();
      if (!Object.hasOwn(command, 'kind') && !Object.hasOwn(command, 'background')&&!Object.hasOwn(command,'router')) fail('COMMAND', 'Change a view presentation field');
      const before = canonicalJSON(target.view);
      for (const key of ['kind', 'background','router']) if (Object.hasOwn(command, key)) { if (command[key] === null) delete target.view[key]; else target.view[key] = command[key]; }
      if (before === canonicalJSON(target.view)) fail('COMMAND', 'View presentation must change');
      result.affectedViewIds = [target.view.id]; break;
    }
    case 'createFolder': {
      shape(['name'], ['parentFolderId', 'members', 'documentation', 'properties', 'childLabelTemplate']);
      const folder = { id: newId('fld'), ...metadata(), parentFolderId: command.parentFolderId ?? null, members: command.members ?? [] };
      if (Object.hasOwn(command, 'childLabelTemplate')) folder.childLabelTemplate = command.childLabelTemplate;
      state.folders.push(folder); result.created.folderId = folder.id; break;
    }
    case 'updateFolder': {
      shape(['folderId'], ['name', 'documentation', 'properties', 'parentFolderId', 'childLabelTemplate']);
      const folder = find(state.folders, command.folderId);
      const patch = Object.fromEntries(Object.entries(command).filter(([key]) => !['type', 'folderId'].includes(key)));
      if (!Object.keys(patch).length || Object.entries(patch).every(([key, value]) => Object.hasOwn(folder, key) && canonicalJSON(folder[key]) === canonicalJSON(value))) fail('COMMAND', 'Folder update must change a field');
      Object.assign(folder, patch); break;
    }
    case 'moveFolderMembers': {
      shape(['members', 'folderId']);
      if (!Array.isArray(command.members) || !command.members.length) fail('COMMAND', 'Select folder members');
      const target = command.folderId === null ? null : find(state.folders, command.folderId);
      const keys = new Set();
      for (const ref of command.members) {
        record(ref, ['kind', 'id']);
        if (ref.kind === 'view') find(state.views.map(entry => entry.view), ref.id); else conceptRecord(projectIndex(state), ref);
        const key = `${ref.kind}:${ref.id}`; if (keys.has(key)) fail('COMMAND', 'Repeated folder member'); keys.add(key);
      }
      const old = canonicalJSON(state.folders);
      for (const folder of state.folders) folder.members = folder.members.filter(ref => !keys.has(`${ref.kind}:${ref.id}`));
      if (target) target.members.push(...command.members);
      if (old === canonicalJSON(state.folders)) fail('COMMAND', 'Members already have this folder');
      break;
    }
    case 'deleteFolder': {
      shape(['folderId']); const folder = find(state.folders, command.folderId);
      for (const child of state.folders) if (child.parentFolderId === folder.id) child.parentFolderId = folder.parentFolderId;
      if (folder.parentFolderId !== null) find(state.folders, folder.parentFolderId).members.push(...folder.members);
      state.folders = state.folders.filter(item => item.id !== folder.id);
      result.impact = { folderIds: [folder.id], retainedMembers: folder.members.map(ref => ({ ...ref })) }; break;
    }
    case 'createElementInModel':
    case 'createJunctionInModel': {
      const kind = command.type === 'createElementInModel' ? 'element' : 'junction';
      shape([`${kind}Type`, 'name'], ['documentation', 'properties', 'folderId', 'profileId']);
      const item = { id: newId(kind === 'element' ? 'el' : 'jct'), type: command[`${kind}Type`], ...metadata() };
      if (Object.hasOwn(command, 'profileId')) {
        const profile = state.customizationProfiles?.find(item => item.id === command.profileId);
        if (!profile) fail('REFERENCE', 'Customization profile does not exist');
        if (profile.purpose !== 'specialization' || !profileAppliesTo(profile, kind, item.type)) fail('TYPE', 'Customization profile does not target this concept type');
        item.profileApplications = [{ profileId: command.profileId, values: {} }];
      }
      state[kind === 'element' ? 'elements' : 'junctions'].push(item);
      if (command.folderId != null) find(state.folders, command.folderId).members.push({ kind, id: item.id });
      result.created[`${kind}Id`] = item.id; break;
    }
    case 'duplicateConcept': {
      shape(['concept'], ['name']); const original = conceptRecord(projectIndex(state), command.concept);
      const kind = command.concept.kind, item = structuredClone(original);
      item.id = newId({ element: 'el', junction: 'jct', relationship: 'rel' }[kind]);
      if (Object.hasOwn(command, 'name')) item[kind === 'relationship' ? 'label' : 'name'] = command.name;
      state[{ element: 'elements', junction: 'junctions', relationship: 'relationships' }[kind]].push(item);
      result.created[`${kind}Id`] = item.id; break;
    }
    case 'setCustomizationProfileImage': {
      shape(['profileId', 'assetId']); const definition = find(state.customizationProfiles ?? [], command.profileId);
      if (definition.purpose !== 'specialization') fail('TYPE', 'Only specializations have an image');
      if (command.assetId === null) { if (!Object.hasOwn(definition, 'imageAssetId')) fail('COMMAND', 'Specialization image is already unset'); delete definition.imageAssetId; }
      else { if (definition.imageAssetId === command.assetId) fail('COMMAND', 'Specialization image must change'); definition.imageAssetId = command.assetId; }
      result.affectedViewIds = state.views.map(entry => entry.view.id); break;
    }
    case 'createAsset': {
      shape(['name', 'mediaType', 'data']);
      const asset = { id: newId('ast'), name: command.name, mediaType: command.mediaType, encoding: 'base64', data: command.data };
      state.assets.push(asset); result.created.assetId = asset.id; break;
    }
    case 'deleteAsset': {
      shape(['assetId']); find(state.assets, command.assetId);
      if (assetUsages(state, command.assetId).length) fail('REFERENCE', 'Image asset is still used by drawings');
      state.assets = state.assets.filter(item => item.id !== command.assetId); break;
    }
    case 'createVisualNode': {
      shape(['viewId', 'kind', 'bounds'], ['name', 'documentation', 'properties', 'zIndex', 'parent', 'style', 'text', 'targetViewId', 'assetId', 'legend', 'instruction', 'locked']);
      const target = entry(), item = { id: newId('vnd'), kind: command.kind, ...metadata(), bounds: command.bounds, zIndex: command.zIndex ?? 0, parent: command.parent ?? null, style: command.style ?? {} };
      const fields = { note: ['text'], group: [], legend: ['legend'], viewReference: ['targetViewId'], image: ['assetId'] }[command.kind];
      if (!fields) fail('TYPE', 'Unsupported visual node kind');
      for (const key of ['text', 'targetViewId', 'assetId', 'legend']) if (Object.hasOwn(command, key) && !fields.includes(key)) fail('SCHEMA', 'Field does not belong to this visual kind');
      for (const key of fields) item[key] = command[key] ?? (key === 'text' ? '' : key === 'legend' ? { sort: 'type', columns: 1, showRelationships: false } : null);
      if (Object.hasOwn(command, 'instruction')) item.instruction = command.instruction;
      if (Object.hasOwn(command, 'locked')) item.locked = command.locked;
      target.visualNodes.push(item); result.created.visualNodeId = item.id; result.affectedViewIds = [target.view.id]; break;
    }
    case 'updateVisualNode': {
      shape(['viewId', 'nodeId'], ['name', 'documentation', 'properties', 'bounds', 'zIndex', 'parent', 'style', 'text', 'targetViewId', 'assetId', 'legend', 'instruction', 'locked']);
      const target = entry(), item = find(target.visualNodes, command.nodeId);
      const patch = Object.fromEntries(Object.entries(command).filter(([key]) => !['type', 'viewId', 'nodeId'].includes(key)));
      if (!Object.keys(patch).length || Object.entries(patch).every(([key, value]) => canonicalJSON(item[key] ?? null) === canonicalJSON(value))) fail('COMMAND', 'Visual update must change a field');
      Object.assign(item, patch); result.affectedViewIds = [target.view.id]; break;
    }
    case 'createVisualConnector': {
      shape(['viewId', 'source', 'target'], ['name', 'documentation', 'properties', 'routePoints', 'labelPosition', 'style', 'locked']);
      const target = entry(); visualEndpointRecord(target, command.source); visualEndpointRecord(target, command.target);
      const item = { id: newId('vcn'), ...metadata(), source: command.source, target: command.target, routePoints: command.routePoints ?? [], labelPosition: command.labelPosition ?? null, style: command.style ?? {} };
      if (Object.hasOwn(command, 'locked')) item.locked = command.locked;
      target.visualConnectors.push(item); result.created.visualConnectorId = item.id; result.affectedViewIds = [target.view.id]; break;
    }
    case 'updateVisualConnector': {
      shape(['viewId', 'connectorId'], ['name', 'documentation', 'properties', 'source', 'target', 'routePoints', 'labelPosition', 'style', 'locked']);
      const target = entry(), item = find(target.visualConnectors, command.connectorId);
      const patch = Object.fromEntries(Object.entries(command).filter(([key]) => !['type', 'viewId', 'connectorId'].includes(key)));
      if (!Object.keys(patch).length || Object.entries(patch).every(([key, value]) => canonicalJSON(item[key]) === canonicalJSON(value))) fail('COMMAND', 'Connector update must change a field');
      Object.assign(item, patch); result.affectedViewIds = [target.view.id]; break;
    }
    case 'updateDrawingStyle':
    case 'resetDrawingStyle': {
      shape(['viewId', 'drawing'], command.type === 'updateDrawingStyle' ? ['style'] : []);
      if (command.type === 'updateDrawingStyle' && !Object.hasOwn(command, 'style')) fail('COMMAND', 'Drawing style is required');
      const target = entry(), item = drawingRecord(target, command.drawing), style = command.type === 'resetDrawingStyle' ? {} : command.style;
      if (canonicalJSON(item.style) === canonicalJSON(style)) fail('COMMAND', 'Drawing style must change');
      item.style = style; result.affectedViewIds = [target.view.id]; break;
    }
    case 'reparentDrawing': {
      shape(['viewId', 'drawing', 'parent']);
      if (!['occurrence', 'visualNode'].includes(command.drawing?.kind)) fail('REFERENCE', 'Only nodes can have a parent');
      const target = entry(), item = drawingRecord(target, command.drawing);
      if (canonicalJSON(item.parent) === canonicalJSON(command.parent)) fail('COMMAND', 'Drawing parent must change');
      item.parent = command.parent; result.affectedViewIds = [target.view.id]; break;
    }
    case 'resizeDrawing': {
      shape(['viewId', 'drawing', 'width', 'height']);
      if (!['occurrence', 'visualNode'].includes(command.drawing?.kind)) fail('REFERENCE', 'Only nodes can be resized');
      const target = entry(), item = drawingRecord(target, command.drawing);
      if (item.bounds.width === command.width && item.bounds.height === command.height) fail('COMMAND', 'Drawing size must change');
      Object.assign(item.bounds, { width: command.width, height: command.height }); result.affectedViewIds = [target.view.id]; break;
    }
  }
  return true;
}

/** A lock protects drawing layout across every command, including staged snapshots. */
export function assertUnlockedDrawings(before, after) {
  const collections = ['occurrences', 'connections', 'visualNodes', 'visualConnectors'];
  const protectedFields = ['bounds', 'parent', 'zIndex', 'style', 'source', 'target', 'routePoints', 'labelPosition', 'hidden', 'assetId', 'targetViewId', 'kind', 'legend'];
  const views = new Map(after.views.map(entry => [entry.view.id, entry]));
  for (const entry of before.views) for (const collection of collections) for (const item of entry[collection]) if (item.locked) {
    const next = views.get(entry.view.id)?.[collection]?.find(next => next.id === item.id);
    if (!next || [...protectedFields,...(collection.startsWith('visual')?['name','documentation','properties','text','instruction']:[])].some(key => Object.hasOwn(item, key) !== Object.hasOwn(next, key) || Object.hasOwn(item, key) && canonicalJSON(item[key]) !== canonicalJSON(next[key]))) fail('DRAWING_LOCKED', 'Unlock the drawing before changing or deleting it');
  }
}
