const MAX_ROUTE_POINTS = 128;
// Keep this bounded primitive identical to controller.snap without importing the
// controller (and its model-core dependency) into these pure layout helpers.
const snap = value => Math.round(Math.min(1000000, Math.max(-1000000, value)) * 10) / 10 || 0;

function assertPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point) ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid layout point');
}

function assertLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout) ||
      !Array.isArray(layout.routePoints) || layout.routePoints.length > MAX_ROUTE_POINTS) {
    throw new Error('Invalid connection layout');
  }
  for (const item of layout.routePoints) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        (item.kind !== 'bend' && item.kind !== 'anchor') ||
        (item.kind === 'anchor' && (typeof item.id !== 'string' || !item.id))) throw new Error('Invalid route point');
    assertPoint(item.point);
  }
  if (layout.labelPosition !== null) assertPoint(layout.labelPosition);
}

function assertIndex(index, length, minimum = 0) {
  if (!Number.isInteger(index) || index < minimum || index >= length) throw new Error('Invalid bendpoint index');
}
function assertTarget(layout, target) {
  if (!target || !['bend', 'anchor', 'label'].includes(target.kind)) throw new Error('Invalid layout target');
  if (target.kind !== 'label') {
    assertIndex(target.index, layout.routePoints.length);
    if (layout.routePoints[target.index].kind !== target.kind) throw new Error('Invalid layout target');
  }
}

const copyPoint = point => ({ x: point.x, y: point.y });
const copyRoutePoint = item => item.kind === 'anchor' ? { kind: 'anchor', id: item.id, point: copyPoint(item.point) } :
  { kind: 'bend', point: copyPoint(item.point) };
const samePoint = (a, b) => Object.is(a.x, b.x) && Object.is(a.y, b.y);
const targetPoint = (layout, target) => target.kind === 'label' ? layout.labelPosition ?? target.anchor : layout.routePoints[target.index].point;

/** Copy only stored layout fields, without normalizing order or coordinates. */
export function copyLayout(connection) {
  assertLayout(connection);
  return { routePoints: connection.routePoints.map(copyRoutePoint),
    labelPosition: connection.labelPosition === null ? null : copyPoint(connection.labelPosition) };
}

/** Exact raw-layout comparison; repeated and occluded points still count. */
export function sameLayout(a, b) {
  assertLayout(a); assertLayout(b);
  return a.routePoints.length === b.routePoints.length &&
    a.routePoints.every((item, index) => item.kind === b.routePoints[index].kind &&
      (item.kind !== 'anchor' || item.id === b.routePoints[index].id) && samePoint(item.point, b.routePoints[index].point)) &&
    (a.labelPosition === null || b.labelPosition === null
      ? a.labelPosition === b.labelPosition : samePoint(a.labelPosition, b.labelPosition));
}

/** Deltas are model-space offsets from the original stored layout, never from a
 * previously rounded preview. A null label needs its rendered anchor only when
 * it actually moves. Route targets use the merged ordered route-point index.
 */
export function moveLayout(layout, target, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('Invalid layout delta');
  const next = copyLayout(layout);
  assertTarget(next, target);
  if (dx === 0 && dy === 0) return next;
  const origin = targetPoint(layout, target);
  assertPoint(origin);
  const moved = { x: snap(origin.x + dx), y: snap(origin.y + dy) };
  if (target.kind !== 'label') next.routePoints[target.index].point = moved;
  else if (layout.labelPosition !== null || !samePoint(moved, origin)) next.labelPosition = moved;
  return next;
}

/** Keyboard steps preserve off-grid perpendicular values. A newly materialized
 * label snaps both axes; fully clamped steps preserve the original raw layout.
 */
export function nudgeLayout(layout, target, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx !== 0 && dy !== 0)) throw new Error('Invalid keyboard layout delta');
  const next = moveLayout(layout, target, dx, dy);
  if (dx === 0 && dy === 0) return next;
  const origin = targetPoint(layout, target), moved = targetPoint(next, target);
  const axis = dx !== 0 ? 'x' : 'y', other = dx !== 0 ? 'y' : 'x';
  if (!moved || Object.is(moved[axis], origin[axis])) return copyLayout(layout);
  if (target.kind !== 'label' || layout.labelPosition !== null) moved[other] = origin[other];
  return next;
}

/** Insert after a merged route index; -1 inserts before the first (also empty). */
export function insertBendpoint(layout, afterIndex, point) {
  const next = copyLayout(layout);
  assertIndex(afterIndex, next.routePoints.length, -1);
  assertPoint(point);
  if (next.routePoints.length === MAX_ROUTE_POINTS) throw new Error('At most 128 route points are supported');
  next.routePoints.splice(afterIndex + 1, 0, { kind: 'bend', point: { x: snap(point.x), y: snap(point.y) } });
  return next;
}

export function removeBendpoint(layout, index) {
  const next = copyLayout(layout);
  assertIndex(index, next.routePoints.length);
  if (next.routePoints[index].kind !== 'bend') throw new Error('Cannot remove an attachment anchor as a bendpoint');
  next.routePoints.splice(index, 1);
  return next;
}

/** Reset optional bends only. Named attachments remain in exact stored order. */
export function resetBendpoints(layout) {
  const next = copyLayout(layout);
  next.routePoints = next.routePoints.filter(item => item.kind === 'anchor');
  return next;
}

export function resetLabelPosition(layout) {
  const next = copyLayout(layout);
  next.labelPosition = null;
  return next;
}
