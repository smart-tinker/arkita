import { LIMITS, fail } from './json.js';
import { hierarchyDescendants } from './native-v4-commands.js';
import { record, coordinate, bounds as validateBounds } from './format.js';

const key = ref => `${ref.kind}:${ref.id}`;
const grid = value => Math.round(value * 10) / 10 || 0;

/** Typed drawing IDs are view-local; concepts are never a geometry selection. */
export function selectedDrawings(entry, drawings) {
  if (!Array.isArray(drawings) || !drawings.length || drawings.length > LIMITS.entities) fail('SELECTION', 'Select drawings in one view');
  const records = new Map([...entry.occurrences.map(item => [`occurrence:${item.id}`, item]), ...entry.connections.map(item => [`connection:${item.id}`, item]), ...entry.visualNodes.map(item => [`visualNode:${item.id}`, item]), ...entry.visualConnectors.map(item => [`visualConnector:${item.id}`, item])]);
  const seen = new Set();
  return drawings.map(ref => {
    record(ref, ['kind', 'id']);
    const id = key(ref);
    if (!records.has(id)) fail('REFERENCE', 'Selected drawing is not in this view');
    if (seen.has(id)) fail('SELECTION', 'Selected drawings must be unique');
    seen.add(id);
    return { ref, item: records.get(id) };
  });
}

/** Keep external manual routes fixed. Internal routes, anchors and labels follow
 * only when both drawing endpoints translate by the same vector. */
function geometryChanges(entry, occurrences, connectionIds) {
  const moved = new Map();
  const originals = new Map([...entry.occurrences, ...entry.visualNodes].map(item => [item.id, item]));
  for (const item of occurrences) {
    validateBounds(item.bounds);
    const before = originals.get(item.id).bounds;
    const delta = { x: grid(item.bounds.x - before.x), y: grid(item.bounds.y - before.y) };
    if (delta.x || delta.y) moved.set(`${item.kind}:${item.id}`, delta);
  }
  const allLines = [...entry.connections.map(item => ({ ...item, drawingKind: 'connection' })), ...entry.visualConnectors.map(item => ({ ...item, drawingKind: 'visualConnector' }))];
  const allConnections = new Set(allLines.map(item => item.id));
  if (connectionIds !== undefined && !Array.isArray(connectionIds)) fail('REFERENCE', 'Invalid connection scope');
  const allowed = connectionIds === undefined ? allConnections : new Set(connectionIds);
  if (connectionIds !== undefined && (allowed.size !== connectionIds.length || allowed.size > LIMITS.entities || [...allowed].some(id => !allConnections.has(id)))) fail('REFERENCE', 'Invalid connection scope');
  const scoped = allLines.filter(item => allowed.has(item.id)), dependents = new Map(), translated = new Map();
  for (const item of scoped) for (const end of [item.source, item.target]) if (['connection', 'visualConnector'].includes(end.kind)) {
    if (!dependents.has(end.id)) dependents.set(end.id, []);
    dependents.get(end.id).push(item.id);
  }
  const deltas = new Map([...moved.values()].map(delta => [`${delta.x}:${delta.y}`, delta]));
  for (const delta of deltas.values()) {
    const matches = endpoint => { const value = moved.get(key(endpoint)); return value?.x === delta.x && value?.y === delta.y; };
    const candidates = new Set(allowed), excluded = [];
    for (const item of scoped) if ([item.source, item.target].some(end => ['occurrence', 'visualNode'].includes(end.kind) ? !matches(end) : !allowed.has(end.id))) {
      candidates.delete(item.id); excluded.push(item.id);
    }
    for (let at = 0; at < excluded.length; at++) for (const id of dependents.get(excluded[at]) ?? []) if (candidates.delete(id)) excluded.push(id);
    // A self/mutual cycle is movable when it depends on moving occurrences;
    // isolated connection cycles have no occurrence that defines their movement.
    const reachable = scoped.filter(item => candidates.has(item.id) && [item.source, item.target].some(end => ['occurrence', 'visualNode'].includes(end.kind) && matches(end))).map(item => item.id);
    const seen = new Set(reachable);
    for (let at = 0; at < reachable.length; at++) for (const id of dependents.get(reachable[at]) ?? []) if (candidates.has(id) && !seen.has(id)) { seen.add(id); reachable.push(id); }
    const unanchored = scoped.filter(item => seen.has(item.id) && [item.source, item.target].some(end => ['connection', 'visualConnector'].includes(end.kind) && !seen.has(end.id))).map(item => item.id);
    for (const id of unanchored) seen.delete(id);
    for (let at = 0; at < unanchored.length; at++) for (const id of dependents.get(unanchored[at]) ?? []) if (seen.delete(id)) unanchored.push(id);
    for (const id of seen) translated.set(id, delta);
  }
  const connections = [];
  for (const item of scoped) {
    const delta = translated.get(item.id);
    if (!delta || (!item.routePoints.length && item.labelPosition === null)) continue;
    const point = value => {
      const result = { x: grid(value.x + delta.x), y: grid(value.y + delta.y) };
      coordinate(result.x); coordinate(result.y); return result;
    };
    connections.push({ kind: item.drawingKind, id: item.id, routePoints: item.routePoints.map(route => ({ ...route, point: point(route.point) })),
      labelPosition: item.labelPosition === null ? null : point(item.labelPosition) });
  }
  const withoutKind = ({ kind, ...item }) => item;
  return { occurrences: occurrences.filter(item => item.kind === 'occurrence').map(withoutKind),
    visualNodes: occurrences.filter(item => item.kind === 'visualNode').map(withoutKind),
    connections: connections.filter(item => item.kind === 'connection').map(withoutKind),
    visualConnectors: connections.filter(item => item.kind === 'visualConnector').map(withoutKind) };
}

/** Produce the whole validated patch before touching the candidate or history. */
export function moveDrawingGeometry(entry, drawings, dx, dy, connectionIds) {
  for (const value of [dx, dy]) if (!Number.isFinite(value) || Object.is(value, -0) || Math.abs(value) > LIMITS.coordinate * 2 || grid(value) !== value) fail('GEOMETRY', 'Movement must be finite and on the 0.1-unit grid');
  const selected = selectedDrawings(entry, drawings).filter(value => ['occurrence', 'visualNode'].includes(value.ref.kind));
  if (!selected.length) fail('SELECTION', 'Select at least one node to move');
  const moving = hierarchyDescendants(entry, selected.map(value => value.ref));
  const occurrences = dx || dy ? moving.map(({ kind, item }) => ({ kind, id: item.id, bounds: { ...item.bounds, x: grid(item.bounds.x + dx), y: grid(item.bounds.y + dy) } })) : [];
  return geometryChanges(entry, occurrences, connectionIds);
}

/** Integer tenths avoid floating-point ties when centered bounds need half a grid step. */
export function alignDrawingGeometry(entry, drawings, anchor, operation, connectionIds) {
  const selected = selectedDrawings(entry, drawings).filter(value => ['occurrence', 'visualNode'].includes(value.ref.kind));
  record(anchor, ['kind', 'id']);
  const reference = selected.find(value => value.ref.kind === anchor.kind && value.item.id === anchor.id)?.item;
  if (selected.length < 2 || !reference) fail('SELECTION', 'Select at least two occurrences and an occurrence anchor');
  if (!['left', 'center-x', 'right', 'top', 'center-y', 'bottom', 'width', 'height', 'size'].includes(operation)) fail('COMMAND', 'Unknown alignment operation');
  const units = box => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10)]));
  const base = units(reference.bounds), targets = [];
  for (const { ref, item } of selected) {
    const next = units(item.bounds);
    if (operation === 'left') next.x = base.x;
    if (operation === 'center-x') next.x = Math.round(base.x + (base.width - next.width) / 2);
    if (operation === 'right') next.x = base.x + base.width - next.width;
    if (operation === 'top') next.y = base.y;
    if (operation === 'center-y') next.y = Math.round(base.y + (base.height - next.height) / 2);
    if (operation === 'bottom') next.y = base.y + base.height - next.height;
    if (operation === 'width' || operation === 'size') next.width = base.width;
    if (operation === 'height' || operation === 'size') next.height = base.height;
    const bounds = Object.fromEntries(Object.entries(next).map(([key, value]) => [key, value / 10 || 0]));
    targets.push({ kind: ref.kind, item, bounds });
  }
  const explicit = new Set(selected.map(({ ref }) => key(ref))), children = new Map(), occurrences = [];
  for (const [kind, items] of [['occurrence', entry.occurrences], ['visualNode', entry.visualNodes]]) for (const item of items) if (item.parent) {
    const parent = key(item.parent);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push({ kind, item });
  }
  // Every selected node, including the stationary anchor, owns its descendants' translation.
  for (let at = 0; at < targets.length; at++) {
    const { kind, item, bounds } = targets[at];
    if (Object.keys(bounds).some(key => bounds[key] !== item.bounds[key])) occurrences.push({ kind, id: item.id, bounds });
    const dx = grid(bounds.x - item.bounds.x), dy = grid(bounds.y - item.bounds.y);
    if (!dx && !dy) continue;
    for (const child of children.get(`${kind}:${item.id}`) ?? []) if (!explicit.has(`${child.kind}:${child.item.id}`)) {
      targets.push({ ...child, bounds: { ...child.item.bounds, x: grid(child.item.bounds.x + dx), y: grid(child.item.bounds.y + dy) } });
    }
  }
  return geometryChanges(entry, occurrences, connectionIds);
}

export function applyDrawingGeometry(entry, geometry) {
  for (const collection of ['occurrences', 'visualNodes']) {
    const items = new Map(entry[collection].map(item => [item.id, item]));
    for (const item of geometry[collection] ?? []) items.get(item.id).bounds = item.bounds;
  }
  for (const collection of ['connections', 'visualConnectors']) {
    const items = new Map(entry[collection].map(item => [item.id, item]));
    for (const item of geometry[collection] ?? []) Object.assign(items.get(item.id), { routePoints: item.routePoints, labelPosition: item.labelPosition });
  }
}
