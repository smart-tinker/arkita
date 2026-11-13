import { LIMITS, assertJSON, byteLength, canonicalJSON, fail, parseJSON, record, text } from './json.js';
import { validateViewpoint } from './viewpoints.js';
import { validateCustomizationProfile, validateProfileApplications } from './customization.js';
import { ASSET_LIMITS } from './asset-images.js';
import { validateAsset, validateDrawingStyle, validatePropertyRows, metadataRows, VISUAL_NODE_KINDS } from './native-v4.js';
import { CURRENT_METAMODEL, CURRENT_CATALOG } from './current-catalog.js';

export const FORMAT = 'schemka-project';
export const FORMAT_VERSION = 4;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const prefixes = new Set(['prj', 'el', 'jct', 'rel', 'view', 'occ', 'conn', 'anc', 'prf', 'vpt', 'fld', 'vnd', 'vcn', 'ast']);

export function newId(prefix) {
  if (!prefixes.has(prefix)) fail('ID', 'Unknown entity prefix');
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    fail('RUNTIME', 'Secure crypto.randomUUID() is required; use Node.js >=22 or a supported browser in a secure context');
  }
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
export { record, text } from './json.js';
function list(value) { if (!Array.isArray(value)) fail('SCHEMA', 'Expected an array'); }
export function id(value, prefix) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}-${UUID}$`).test(value)) fail('ID', `Expected lowercase ${prefix}-UUIDv4`);
}
export function coordinate(value, positive = false) {
  if (!Number.isFinite(value) || Object.is(value, -0) || Math.abs(value) > LIMITS.coordinate ||
      Math.round(value * 10) / 10 !== value || (positive && value <= 0)) {
    fail('GEOMETRY', 'Geometry must be finite, within ±1,000,000 and on a 0.1-unit grid; sizes must be positive');
  }
}
export function point(value) {
  record(value, ['x', 'y']);
  coordinate(value.x); coordinate(value.y);
}
export function bounds(value) {
  record(value, ['x', 'y', 'width', 'height']);
  coordinate(value.x); coordinate(value.y); coordinate(value.width, true); coordinate(value.height, true);
}
function properties(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCHEMA', 'Expected a property record');
  if (Object.keys(value).length > LIMITS.properties) fail('LIMIT', 'Too many properties');
  for (const [key, item] of Object.entries(value)) { text(key); text(item); }
}

/** Source identifiers are inert provenance, never native references or user properties. */
function validateArchiSource(source) {
  record(source, ['modelId', 'id', 'type', 'version'], ['domain']);
  if (source.version !== '5.0.0') fail('ARCHI_SOURCE', 'Unsupported Archi source version');
  for (const key of ['modelId', 'id', 'type', ...(Object.hasOwn(source, 'domain') ? ['domain'] : [])]) {
    text(source[key]);
    if (!source[key].trim()) fail('ARCHI_SOURCE', 'Archi source identifiers and types must be nonempty');
  }
}

function fileRecords(state) {
  // Codec-only compatibility guard: old directory readers must not omit unbound definitions.
  const header = state.viewpoints?.length ? { ...state.project, viewpointFormat: 1 } : state.project;
  const files = [['schemka.json', header]];
  for (const definition of state.viewpoints ?? []) files.push([`viewpoints/${definition.id}.json`, definition]);
  for (const definition of state.customizationProfiles ?? []) files.push([`model/customization-profiles/${definition.id}.json`, definition]);
  for (const folder of state.folders ?? []) files.push([`model/folders/${folder.id}.json`, folder]);
  for (const asset of state.assets ?? []) files.push([`assets/${asset.id}.json`, asset]);
  for (const element of state.elements) files.push([`model/elements/${element.id}.json`, element]);
  for (const junction of state.junctions) files.push([`model/junctions/${junction.id}.json`, junction]);
  for (const relationship of state.relationships) files.push([`model/relationships/${relationship.id}.json`, relationship]);
  for (const { view, occurrences, connections, visualNodes, visualConnectors } of state.views) {
    const root = `views/${view.id}`;
    files.push([`${root}/view.json`, view]);
    for (const occurrence of occurrences) files.push([`${root}/occurrences/${occurrence.id}.json`, occurrence]);
    for (const connection of connections) files.push([`${root}/connections/${connection.id}.json`, connection]);
    for (const node of visualNodes ?? []) files.push([`${root}/visual-nodes/${node.id}.json`, node]);
    for (const connector of visualConnectors ?? []) files.push([`${root}/visual-connectors/${connector.id}.json`, connector]);
  }
  return files;
}

/** Build indexes before resolving references; forward and cyclic graphs are ordinary data. */
export function projectIndex(state) {
  return {
    element: new Map(state.elements.map(item => [item.id, item])),
    junction: new Map(state.junctions.map(item => [item.id, item])),
    relationship: new Map(state.relationships.map(item => [item.id, item])),
  };
}
export function conceptRecord(index, ref, occurrence = false) {
  record(ref, ['kind', 'id']);
  if (!['element', 'junction', ...(occurrence ? [] : ['relationship'])].includes(ref.kind) || !index[ref.kind]?.has(ref.id)) {
    fail('REFERENCE', 'Concept reference must resolve with the declared kind');
  }
  return index[ref.kind].get(ref.id);
}
export function viewIndex(entry) {
  const occurrences = new Map(entry.occurrences.map(item => [item.id, item]));
  const connections = new Map(entry.connections.map(item => [item.id, item]));
  const anchors = new Map();
  for (const connection of entry.connections) for (const anchor of connection.routePoints) {
    if (anchor.kind === 'anchor') anchors.set(anchor.id, { connection, anchor });
  }
  return { occurrences, connections, anchors };
}
export function endpointRecord(index, local, endpoint) {
  if (endpoint?.kind === 'occurrence') {
    record(endpoint, ['kind', 'id']);
    const occurrence = local.occurrences.get(endpoint.id);
    if (!occurrence) fail('REFERENCE', 'Endpoint occurrence must be in the same view');
    return { concept: occurrence.concept, record: conceptRecord(index, occurrence.concept, true), occurrence };
  }
  if (endpoint?.kind === 'connection') {
    record(endpoint, ['kind', 'id', 'anchorId']);
    const connection = local.connections.get(endpoint.id), owned = local.anchors.get(endpoint.anchorId);
    if (!connection || !owned || owned.connection !== connection) fail('REFERENCE', 'Endpoint anchor must belong to its named host in the same view');
    const concept = { kind: 'relationship', id: connection.relationshipId };
    return { concept, record: conceptRecord(index, concept), connection, anchor: owned.anchor, point: owned.anchor.point };
  }
  fail('REFERENCE', 'Unsupported view endpoint kind');
}
export const sameConcept = (a, b) => a.kind === b.kind && a.id === b.id;

export function drawingRecord(entry, ref) {
  record(ref, ['kind', 'id']);
  const collection = { occurrence: 'occurrences', connection: 'connections', visualNode: 'visualNodes', visualConnector: 'visualConnectors' }[ref.kind];
  const item = collection && entry[collection]?.find(item => item.id === ref.id);
  if (!item) fail('REFERENCE', 'Drawing reference must resolve in its own view');
  return item;
}
export function visualEndpointRecord(entry, ref) {
  if (['occurrence', 'visualNode'].includes(ref?.kind)) return drawingRecord(entry, ref);
  if (['connection', 'visualConnector'].includes(ref?.kind)) {
    record(ref, ['kind', 'id', 'anchorId']);
    const host = drawingRecord(entry, { kind: ref.kind, id: ref.id });
    const anchor = host.routePoints.find(item => item.kind === 'anchor' && item.id === ref.anchorId);
    if (!anchor) fail('REFERENCE', 'Visual endpoint anchor must belong to the named host');
    return { host, anchor };
  }
  fail('REFERENCE', 'Unsupported visual connector endpoint');
}
function acyclicParents(items, key, resolve) {
  const done = new Set();
  for (const item of items) {
    const chain = new Set(); let current = item;
    while (current && !done.has(current.id)) {
      if (chain.has(current.id)) fail('REFERENCE', 'Parent hierarchy must not contain cycles');
      chain.add(current.id); current = current[key] === null ? null : resolve(current[key]);
    }
    for (const id of chain) done.add(id);
  }
}
function validateVisualRecords(state, entry, unique) {
  list(entry.visualNodes); list(entry.visualConnectors);
  const assetIds = new Set(state.assets.map(item => item.id));
  const checkImage = style => { if (style.image && !assetIds.has(style.image.assetId)) fail('REFERENCE', 'Drawing image asset does not exist'); };
  for (const item of entry.visualNodes) {
    const extras = { note: ['text'], group: [], legend: ['legend'], viewReference: ['targetViewId'], image: ['assetId'] }[item.kind];
    if (!extras) fail('TYPE', 'Unsupported visual node kind');
    record(item, ['id', 'kind', 'name', 'documentation', 'properties', 'bounds', 'zIndex', 'parent', 'style', ...extras], ['locked', 'archiSource', ...(['note', 'group'].includes(item.kind) ? ['instruction'] : [])]);
    if (Object.hasOwn(item, 'instruction')) text(item.instruction);
    if (Object.hasOwn(item, 'locked') && typeof item.locked !== 'boolean') fail('SCHEMA', 'Drawing lock must be boolean');
    unique(item.id, 'vnd'); text(item.name); text(item.documentation); validatePropertyRows(item.properties); bounds(item.bounds); validateDrawingStyle(item.style, false, false, true); checkImage(item.style);
    if (!Number.isSafeInteger(item.zIndex) || Math.abs(item.zIndex) > LIMITS.coordinate) fail('GEOMETRY', 'Invalid visual zIndex');
    if (item.kind === 'note') text(item.text);
    if (item.kind === 'viewReference' && !state.views.some(other => other.view.id === item.targetViewId)) fail('REFERENCE', 'Referenced view does not exist');
    if (item.kind === 'image' && item.assetId!==null && !assetIds.has(item.assetId)) fail('REFERENCE', 'Embedded image asset does not exist');
    if (item.kind === 'legend') {
      record(item.legend, ['sort', 'columns', 'showRelationships'], ['colorScheme', 'columnWidth', 'autoSize', 'rowsPerColumn', 'labels', 'showElements', 'showSpecializations', 'colors']);
      for(const key of ['showElements','showSpecializations'])if(Object.hasOwn(item.legend,key)&&typeof item.legend[key]!=='boolean')fail('SCHEMA','Legend filter must be boolean');
      if(Object.hasOwn(item.legend,'colors')){list(item.legend.colors);if(item.legend.colors.length>LIMITS.entities)fail('LIMIT','Too many legend colors');const seen=new Set(),types=[...CURRENT_CATALOG.elementTypes,...CURRENT_CATALOG.junctionTypes,...CURRENT_CATALOG.relationshipTypes];for(const row of item.legend.colors){const profile=Object.hasOwn(row,'profileId');record(row,profile?['profileId','color']:['type','color']);if(profile?!state.customizationProfiles?.some(item=>item.id===row.profileId&&item.purpose==='specialization'):!types.includes(row.type))fail('REFERENCE','Legend color entry must resolve to a type or specialization');const key=profile?'profile:'+row.profileId:'type:'+row.type;if(seen.has(key)||typeof row.color!=='string'||!/^#[0-9a-f]{6}$/i.test(row.color))fail('SCHEMA','Legend colors must be unique #RRGGBB values');seen.add(key);}}
      if(Object.hasOwn(item.legend,'rowsPerColumn')&&(!Number.isInteger(item.legend.rowsPerColumn)||item.legend.rowsPerColumn<1||item.legend.rowsPerColumn>100))fail('SCHEMA','Invalid legend rows per column');
      if(Object.hasOwn(item.legend,'labels')){list(item.legend.labels);const types=[...CURRENT_CATALOG.elementTypes,...CURRENT_CATALOG.junctionTypes,...CURRENT_CATALOG.relationshipTypes],seen=new Set();if(item.legend.labels.length>types.length)fail('SCHEMA','Too many legend labels');for(const row of item.legend.labels){record(row,['type','label']);text(row.label);if(!types.includes(row.type)||seen.has(row.type)||!row.label.trim()||row.label.length>256)fail('SCHEMA','Invalid legend type label');seen.add(row.type);}}
      if (Object.hasOwn(item.legend, 'colorScheme') && !['notation', 'monochrome', 'pastel'].includes(item.legend.colorScheme)) fail('SCHEMA', 'Invalid legend color scheme');
      if (Object.hasOwn(item.legend, 'columnWidth')) coordinate(item.legend.columnWidth, true);
      if (Object.hasOwn(item.legend, 'autoSize') && typeof item.legend.autoSize !== 'boolean') fail('SCHEMA', 'Legend auto size must be boolean');
      if (!['name', 'type'].includes(item.legend.sort) || !Number.isInteger(item.legend.columns) || item.legend.columns < 1 || item.legend.columns > 8 || typeof item.legend.showRelationships !== 'boolean') fail('SCHEMA', 'Invalid legend layout');
    }
  }
  const parentNodes = [...entry.occurrences, ...entry.visualNodes];
  const parentRecord = ref => {
    if (!['occurrence', 'visualNode'].includes(ref?.kind)) fail('REFERENCE', 'Parent must be an occurrence or group node');
    const parent = drawingRecord(entry, ref);
    if (ref.kind === 'visualNode' && parent.kind !== 'group') fail('REFERENCE', 'Only a group visual node may contain drawings');
    return parent;
  };
  for (const item of parentNodes) {
    if (item.parent !== null) parentRecord(item.parent);
    if (item.style) checkImage(item.style);
  }
  acyclicParents(parentNodes, 'parent', parentRecord);
  for (const item of entry.visualConnectors) {
    record(item, ['id', 'name', 'documentation', 'properties', 'source', 'target', 'routePoints', 'labelPosition', 'style'], ['locked', 'archiSource']);
    if (Object.hasOwn(item, 'locked') && typeof item.locked !== 'boolean') fail('SCHEMA', 'Drawing lock must be boolean');
    unique(item.id, 'vcn'); text(item.name); text(item.documentation); validatePropertyRows(item.properties); validateDrawingStyle(item.style, true);
    list(item.routePoints);
    if (item.routePoints.length > LIMITS.routePoints) fail('LIMIT', 'Too many route points');
    for (const route of item.routePoints) {
      if (route?.kind === 'bend') record(route, ['kind', 'point']);
      else if (route?.kind === 'anchor') { record(route, ['kind', 'id', 'point']); unique(route.id, 'anc'); }
      else fail('SCHEMA', 'Route point must be a bend or anchor');
      point(route.point);
    }
    if (item.labelPosition !== null) point(item.labelPosition);
  }
  for (const item of entry.visualConnectors) { visualEndpointRecord(entry, item.source); visualEndpointRecord(entry, item.target); }
}
function validateOrganization(state, unique) {
  list(state.folders); list(state.assets);
  let pixels = 0;
  for (const asset of state.assets) { const size = validateAsset(asset); unique(asset.id, 'ast'); pixels += size.width * size.height; if (pixels > ASSET_LIMITS.totalPixels) fail('ASSET_DIMENSIONS', 'Embedded resources exceed the 64 megapixel project budget'); }
  const assets = new Set(state.assets.map(item => item.id));
  for (const definition of state.customizationProfiles ?? []) if (Object.hasOwn(definition, 'imageAssetId') && !assets.has(definition.imageAssetId)) fail('REFERENCE', 'Specialization image asset does not exist');
  const folders = new Map(state.folders.map(item => [item.id, item])), owned = new Set();
  const index = projectIndex(state);
  for (const folder of state.folders) {
    record(folder, ['id', 'name', 'documentation', 'properties', 'parentFolderId', 'members'], ['archiSource', 'childLabelTemplate']);
    unique(folder.id, 'fld'); text(folder.name); text(folder.documentation); validatePropertyRows(folder.properties); list(folder.members);
    if (Object.hasOwn(folder, 'childLabelTemplate')) text(folder.childLabelTemplate);
    if (folder.parentFolderId !== null && !folders.has(folder.parentFolderId)) fail('REFERENCE', 'Parent folder does not exist');
    for (const member of folder.members) {
      record(member, ['kind', 'id']);
      if (member.kind === 'view') { if (!state.views.some(entry => entry.view.id === member.id)) fail('REFERENCE', 'Folder member view does not exist'); }
      else conceptRecord(index, member);
      const key = `${member.kind}:${member.id}`;
      if (owned.has(key)) fail('REFERENCE', 'A folder member may have only one owner');
      owned.add(key);
    }
  }
  acyclicParents(state.folders, 'parentFolderId', id => folders.get(id));
}

/** Validate the whole supported graph, including separate file and entity budgets. */
function validateNativeProject(state, version) {
  assertJSON(state);
  // Give old headers an explicit version error even when their root shape differs.
  if (state?.project && (state.project.format !== FORMAT || state.project.formatVersion !== version)) {
    fail('VERSION', `Unsupported project format or version; expected native v${version}`);
  }
  record(state, ['project', 'elements', 'junctions', 'relationships', 'views', ...(version === 4 ? ['folders', 'assets'] : [])], ['customizationProfiles', 'viewpoints']);
  const metadataProperties = version === 4 ? validatePropertyRows : properties;
  if (version === 4) { list(state.folders); list(state.assets); }
  const project = state.project;
  record(project, ['format', 'formatVersion', 'id', 'name', 'metamodel', ...(version >= 3 ? ['documentation', 'properties'] : [])], version === 4 ? ['archiSource'] : []);
  record(project.metamodel, ['id', 'version']);
  const profile = project.metamodel.id === CURRENT_METAMODEL.id && project.metamodel.version === CURRENT_METAMODEL.version ? CURRENT_CATALOG : null;
  if (!profile) fail('VERSION', 'Unsupported metamodel profile');
  text(project.name);
  if (version >= 3) { text(project.documentation); metadataProperties(project.properties); }
  for (const collection of [state.elements, state.junctions, state.relationships, state.views]) list(collection);
  const ids = new Set();
  function unique(value, prefix) {
    id(value, prefix);
    if (ids.has(value)) fail('DUPLICATE_ID', `Duplicate ID: ${value}`);
    ids.add(value);
    if (ids.size > LIMITS.entities) fail('LIMIT', 'Too many project entities, including anchors');
  }
  unique(project.id, 'prj');
  if (Object.hasOwn(state, 'customizationProfiles')) {
    list(state.customizationProfiles);
    if (!state.customizationProfiles.length) fail('SCHEMA', 'Omit an empty customizationProfiles collection');
    for (const definition of state.customizationProfiles) {
      validateCustomizationProfile(definition, version);
      unique(definition.id, 'prf');
    }
  }
  if (Object.hasOwn(state, 'viewpoints')) {
    list(state.viewpoints);
    if (!state.viewpoints.length) fail('SCHEMA', 'Omit an empty viewpoints collection');
    for (const definition of state.viewpoints) { validateViewpoint(definition); unique(definition.id, 'vpt'); }
  }
  const viewpoints = new Set((state.viewpoints ?? []).map(item => item.id));
  const definitions = new Map((state.customizationProfiles ?? []).map(item => [item.id, item]));
  for (const [items, prefix, types] of [[state.elements, 'el', profile.elementTypes], [state.junctions, 'jct', profile.junctionTypes]]) {
    for (const item of items) {
      record(item, ['id', 'type', 'name', 'documentation', 'properties'], ['profileApplications', ...(version === 4 ? ['archiSource'] : [])]);
      unique(item.id, prefix);
      if (!types.includes(item.type)) fail('TYPE', 'Concept type is not supported by the active profile');
      text(item.name); text(item.documentation); metadataProperties(item.properties);
      validateProfileApplications(item, prefix === 'el' ? 'element' : 'junction', definitions);
    }
  }
  for (const relationship of state.relationships) {
    record(relationship, ['id', 'type', 'source', 'target', 'label', 'properties', ...(version >= 3 ? ['documentation'] : [])], ['sourceMultiplicity', 'targetMultiplicity', 'junctionRole', 'profileApplications', ...(version === 4 ? ['archiSource'] : [])]);
    unique(relationship.id, 'rel');
    if (!profile.relationshipTypes.includes(relationship.type)) fail('TYPE', 'Relationship type is not supported by the active profile');
    text(relationship.label); metadataProperties(relationship.properties);
    if (version >= 3) text(relationship.documentation);
    validateProfileApplications(relationship, 'relationship', definitions);
    for (const field of ['sourceMultiplicity', 'targetMultiplicity']) {
      if (Object.hasOwn(relationship, field) &&
          (typeof relationship[field] !== 'string' || relationship[field].length > LIMITS.multiplicity)) {
        fail('SCHEMA', 'Multiplicity must be a raw string within the local 128 UTF-16 unit limit');
      }
    }
    if (Object.hasOwn(relationship, 'junctionRole') && relationship.junctionRole !== 'container') fail('SCHEMA', 'Only the explicit container junction role is supported');
  }
  const index = projectIndex(state);
  for (const relationship of state.relationships) {
    conceptRecord(index, relationship.source); conceptRecord(index, relationship.target);
  }
  for (const entry of state.views) {
    record(entry, ['view', 'occurrences', 'connections', ...(version === 4 ? ['visualNodes', 'visualConnectors'] : [])]);
    const { view, occurrences, connections } = entry;
    record(view, ['id', 'name', 'documentation', ...(version >= 3 ? ['properties'] : [])], ['viewpointId', ...(version === 4 ? ['kind', 'background','router', 'archiSource'] : [])]);
    if(version===4&&Object.hasOwn(view,'router')&&!['manual','orthogonal'].includes(view.router))fail('SCHEMA','Unsupported view router');
    if (version === 4 && Object.hasOwn(view, 'kind') && !['architecture', 'canvas', 'sketch'].includes(view.kind)) fail('SCHEMA', 'Unsupported view kind');
    if (version === 4 && Object.hasOwn(view, 'background') && (typeof view.background !== 'string' || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(view.background))) fail('STYLE', 'View background must be hexadecimal');
    if (Object.hasOwn(view, 'viewpointId') && !viewpoints.has(view.viewpointId)) fail('REFERENCE', 'Governing viewpoint does not exist');
    unique(view.id, 'view');
    text(view.name); text(view.documentation);
    if (version >= 3) metadataProperties(view.properties);
    list(occurrences); list(connections);
    for (const occurrence of occurrences) {
      record(occurrence, ['id', 'concept', 'bounds', version === 4 ? 'parent' : 'parentOccurrenceId', 'zIndex', ...(version === 4 ? ['style'] : [])], version === 4 ? ['locked', 'archiSource'] : []);
      if (Object.hasOwn(occurrence, 'locked') && typeof occurrence.locked !== 'boolean') fail('SCHEMA', 'Drawing lock must be boolean');
      unique(occurrence.id, 'occ');
      conceptRecord(index, occurrence.concept, true);
      if (version !== 4 && occurrence.parentOccurrenceId !== null) fail('UNSUPPORTED', 'Occurrence nesting is not supported');
      bounds(occurrence.bounds);
      if (Object.hasOwn(occurrence, 'style')) validateDrawingStyle(occurrence.style);
      if (!Number.isSafeInteger(occurrence.zIndex) || Math.abs(occurrence.zIndex) > LIMITS.coordinate) fail('GEOMETRY', 'zIndex must be a bounded integer');
    }
    // Validate and register every host and anchor before checking any endpoints.
    for (const connection of connections) {
      record(connection, ['id', 'relationshipId', 'source', 'target', 'routePoints', 'labelPosition', ...(version === 4 ? ['style'] : [])], version === 4 ? ['hidden', 'locked', 'archiSource'] : []);
      if (Object.hasOwn(connection, 'locked') && typeof connection.locked !== 'boolean') fail('SCHEMA', 'Drawing lock must be boolean');
      if (Object.hasOwn(connection, 'style')) validateDrawingStyle(connection.style, true, true);
      if (Object.hasOwn(connection, 'hidden') && typeof connection.hidden !== 'boolean') fail('SCHEMA', 'Hidden line flag must be boolean');
      unique(connection.id, 'conn');
      if (!index.relationship.has(connection.relationshipId)) fail('REFERENCE', 'Connection relationship does not exist');
      list(connection.routePoints);
      if (connection.routePoints.length > LIMITS.routePoints) fail('LIMIT', 'Too many route points');
      for (const route of connection.routePoints) {
        if (route?.kind === 'bend') record(route, ['kind', 'point']);
        else if (route?.kind === 'anchor') { record(route, ['kind', 'id', 'point']); unique(route.id, 'anc'); }
        else fail('SCHEMA', 'Route point must be a bend or anchor');
        point(route.point);
      }
      if (connection.labelPosition !== null) point(connection.labelPosition);
    }
    if (version === 4) validateVisualRecords(state, entry, unique);
    const local = viewIndex(entry);
    for (const connection of connections) {
      const relationship = index.relationship.get(connection.relationshipId);
      for (const end of ['source', 'target']) {
        const resolved = endpointRecord(index, local, connection[end]);
        if (!sameConcept(resolved.concept, relationship[end])) fail('REFERENCE', 'Connection endpoints must map to its exact relationship concepts');
      }
    }
  }
  if (version === 4) validateOrganization(state, unique);
  const files = fileRecords(state);
  if (files.length > LIMITS.files) fail('LIMIT', 'Too many project files');
  let total = 0;
  for (const [, value] of files) {
    if (Object.hasOwn(value, 'archiSource')) validateArchiSource(value.archiSource);
    const bytes = byteLength(canonicalJSON(value));
    if (bytes > LIMITS.fileBytes || (total += bytes) > LIMITS.totalBytes) fail('LIMIT', 'Canonical project exceeds file or total byte limit');
  }
  return state;
}

/** Frozen native-v2 schema: future semantic fields must fail before migration. */
export function validateProjectV2(state) { return validateNativeProject(state, 2); }
export function validateProjectV3(state) { return validateNativeProject(state, 3); }
export function validateProject(state) { return validateNativeProject(state, FORMAT_VERSION); }

/** Detached preparation only. Never rewrites source records or infers metadata. */
export function normalizeProject(state) {
  assertJSON(state);
  const version = state?.project?.formatVersion;
  if (![2, 3, FORMAT_VERSION].includes(version)) fail('VERSION', 'Unsupported project format or version; native v2, v3 and v4 are supported');
  ({ 2: validateProjectV2, 3: validateProjectV3, 4: validateProject })[version](state);
  const candidate = structuredClone(state);
  if (version === 2) {
    Object.assign(candidate.project, { documentation: '', properties: {} });
    for (const relationship of candidate.relationships) relationship.documentation = '';
    for (const entry of candidate.views) entry.view.properties = {};
  }
  if (version < 4) {
    candidate.project.formatVersion = FORMAT_VERSION;
    candidate.folders = []; candidate.assets = [];
    for (const item of [candidate.project, ...candidate.elements, ...candidate.junctions, ...candidate.relationships, ...candidate.views.map(entry => entry.view)]) item.properties = metadataRows(item.properties);
    for (const entry of candidate.views) {
      entry.visualNodes = []; entry.visualConnectors = [];
      for (const item of entry.occurrences) { delete item.parentOccurrenceId; item.parent = null; item.style = {}; }
      for (const item of entry.connections) item.style = {};
    }
  }
  return validateProject(candidate);
}

export function createProject(name) {
  const state = {
    project: { format: FORMAT, formatVersion: FORMAT_VERSION, id: newId('prj'), name, documentation: '', properties: [], metamodel: { ...CURRENT_METAMODEL } },
    elements: [], junctions: [], relationships: [], views: [], folders: [], assets: [],
  };
  validateProject(state);
  return state;
}

export function exportFiles(state) {
  validateProject(state);
  return fileRecords(state).map(([path, value]) => ({ path, content: canonicalJSON(value) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** An array, rather than a path-keyed object, permits duplicate-path detection. */
export function readProjectFiles(files) {
  if (Array.isArray(files) && files.length > LIMITS.files) fail('LIMIT', 'Too many files');
  assertJSON(files);
  list(files);
  if (files.length > LIMITS.files) fail('LIMIT', 'Too many files');
  const state = { project: null, elements: [], junctions: [], relationships: [], views: [] };
  const views = new Map();
  const paths = new Set();
  let total = 0;
  function viewEntry(viewId) {
    if (!views.has(viewId)) views.set(viewId, { view: null, occurrences: [], connections: [] });
    return views.get(viewId);
  }
  for (const file of files) {
    record(file, ['path', 'content']);
    if (typeof file.path !== 'string' || typeof file.content !== 'string') fail('SCHEMA', 'File path and content must be strings');
    if (paths.has(file.path)) fail('DUPLICATE_PATH', `Duplicate path: ${file.path}`);
    paths.add(file.path);
    const bytes = byteLength(file.content);
    if (bytes > LIMITS.fileBytes || (total += bytes) > LIMITS.totalBytes) fail('LIMIT', 'Import exceeds file or total byte limit');
    const model = new RegExp(`^model/(elements|junctions|relationships|customization-profiles|folders)/((?:el|jct|rel|prf|fld)-${UUID})\\.json$`).exec(file.path);
    const asset = new RegExp(`^assets/(ast-${UUID})\\.json$`).exec(file.path);
    const viewpoint = new RegExp(`^viewpoints/(vpt-${UUID})\\.json$`).exec(file.path);
    const view = new RegExp(`^views/(view-${UUID})/view\\.json$`).exec(file.path);
    const item = new RegExp(`^views/(view-${UUID})/(occurrences|connections|visual-nodes|visual-connectors)/((?:occ|conn|vnd|vcn)-${UUID})\\.json$`).exec(file.path);
    if (file.path !== 'schemka.json' && !model && !view && !item && !viewpoint && !asset) fail('PATH', `Unsupported or unsafe path: ${file.path}`);
    const value = parseJSON(file.content);
    if (file.path === 'schemka.json') state.project = value;
    else if (asset) {
      if (value?.id !== asset[1]) fail('PATH_ID', 'Asset filename and ID do not match');
      (state.assets ??= []).push(value);
    } else if (viewpoint) {
      if (value?.id !== viewpoint[1]) fail('PATH_ID', 'Viewpoint filename and ID do not match');
      (state.viewpoints ??= []).push(value);
    } else if (model) {
      if (value?.id !== model[2]) fail('PATH_ID', 'Model filename and ID do not match');
      if (model[1] === 'customization-profiles') (state.customizationProfiles ??= []).push(value);
      else if (model[1] === 'folders') (state.folders ??= []).push(value);
      else state[model[1]].push(value);
    } else if (view) {
      if (value?.id !== view[1]) fail('PATH_ID', 'View directory and ID do not match');
      viewEntry(view[1]).view = value;
    } else {
      if (value?.id !== item[3]) fail('PATH_ID', 'View item filename and ID do not match');
      const collection = { 'visual-nodes': 'visualNodes', 'visual-connectors': 'visualConnectors' }[item[2]] ?? item[2];
      (viewEntry(item[1])[collection] ??= []).push(value);
    }
  }
  if (!state.project) fail('SCHEMA', 'Missing schemka.json');
  const enhanced = Boolean(state.viewpoints?.length);
  const marked = Object.hasOwn(state.project, 'viewpointFormat');
  if (marked !== enhanced || (marked && state.project.viewpointFormat !== 1)) {
    fail('VIEWPOINT_FORMAT', 'Native viewpoint definitions must have exactly viewpointFormat: 1; unguarded draft encodings are unsupported');
  }
  // Remove only validated codec metadata. Unknown semantic fields still fail validation.
  if (marked) delete state.project.viewpointFormat;
  state.views = [...views.values()];
  if (state.views.some((entry) => !entry.view)) fail('REFERENCE', 'A view.json is missing');
  const sourceVersion = state.project.formatVersion;
  if (sourceVersion === 4) {
    state.folders ??= []; state.assets ??= [];
    for (const entry of state.views) { entry.visualNodes ??= []; entry.visualConnectors ??= []; }
  }
  return { state: normalizeProject(state), sourceVersion };
}

export function importFiles(files) { return readProjectFiles(files).state; }
