import { box3dGeometry, nodeContourGeometry } from './node-shapes.js';

/** Pure display geometry. Imported model coordinates and sizes are never rewritten. */
// Display-only segment ownership for insertion; never a serialized model field.
const routeInsertionIndices = new WeakMap();
const styledRouteSegments = new WeakSet();
const center = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const extent = points => {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const point of points) { x = Math.min(x, point.x); y = Math.min(y, point.y); right = Math.max(right, point.x); bottom = Math.max(bottom, point.y); }
  return { x, y, width: right - x, height: bottom - y };
};

const side = (a, b, point) => (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
function polygonRay(rect, direction) {
  // Work locally before translating: subtracting large imported coordinates
  // can otherwise amplify a tiny width's rounding error along a very tall ray.
  const c = { x: rect.width / 2, y: rect.height / 2 };
  const points = box3dGeometry({ width: rect.width, height: rect.height }).outline;
  const length = Math.hypot(direction.x, direction.y);
  const dx = length ? direction.x / length : 1, dy = length ? direction.y / length : 0;
  let distance = Infinity;
  // Clockwise screen-space vertices give positive cross products inside.
  // Clip the center ray against every half-plane; only outward slopes exit.
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    const slope = (b.x - a.x) * dy - (b.y - a.y) * dx;
    if (slope < 0) distance = Math.min(distance, -side(a, b, c) / slope);
  }
  return { x: rect.x + (c.x + dx * distance), y: rect.y + (c.y + dy * distance) };
}

// New outlines use normalized local coordinates so clipping remains stable for
// tiny, extremely asymmetric nodes translated far from the origin. Keep the
// historical rectangle/box paths below unchanged.
const extendedToken = token => token === 'circle' || token === 'octagon' || token === 'ellipse' || token === 'folder' || token === 'cloud' || token === 'wavy';
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const interpolate = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const intersectionTolerance = 16 * Number.EPSILON;
function circleBounds(rect) {
  const diameter = Math.min(rect.width, rect.height);
  return { x: rect.x + (rect.width - diameter) / 2, y: rect.y + (rect.height - diameter) / 2, width: diameter, height: diameter };
}
function localContour(rect, token) {
  const geometry = nodeContourGeometry({ width: rect.width, height: rect.height }, token);
  return geometry.outline?.map(point => ({ x: point.x / rect.width, y: point.y / rect.height })) || null;
}
function polygonContains(points, point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], edge = subtract(b, a), offset = subtract(point, a);
    const scale = Math.abs(edge.x * offset.y) + Math.abs(edge.y * offset.x);
    if (Math.abs(cross(edge, offset)) <= intersectionTolerance * Math.max(1, scale) &&
      point.x >= Math.min(a.x, b.x) - intersectionTolerance && point.x <= Math.max(a.x, b.x) + intersectionTolerance &&
      point.y >= Math.min(a.y, b.y) - intersectionTolerance && point.y <= Math.max(a.y, b.y) + intersectionTolerance) return true;
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}
function localContains(outline, point) {
  return outline ? polygonContains(outline, point) :
    (2 * point.x - 1) ** 2 + (2 * point.y - 1) ** 2 <= 1 + intersectionTolerance;
}
function segmentCuts(outline, a, b) {
  const v = subtract(b, a), values = [0, 1];
  const add = t => { if (Number.isFinite(t) && t >= -intersectionTolerance && t <= 1 + intersectionTolerance) values.push(Math.max(0, Math.min(1, t))); };
  if (!v.x && !v.y) return values;
  if (outline) {
    for (let i = 0; i < outline.length; i++) {
      const c = outline[i], d = outline[(i + 1) % outline.length], edge = subtract(d, c), offset = subtract(c, a);
      const denominator = cross(v, edge);
      const scale = Math.abs(v.x * edge.y) + Math.abs(v.y * edge.x);
      if (Math.abs(denominator) > intersectionTolerance * scale) {
        const u = cross(offset, v) / denominator;
        if (u >= -intersectionTolerance && u <= 1 + intersectionTolerance) add(cross(offset, edge) / denominator);
      } else if (Math.abs(cross(offset, v)) <= intersectionTolerance *
        Math.max(1, Math.abs(offset.x * v.y) + Math.abs(offset.y * v.x))) {
        // Collinear boundary runs contribute both endpoints; interval tests
        // below distinguish following the boundary from leaving the fill.
        const axis = Math.abs(v.x) >= Math.abs(v.y) ? 'x' : 'y';
        add((c[axis] - a[axis]) / v[axis]); add((d[axis] - a[axis]) / v[axis]);
      }
    }
  } else {
    // The ellipse maps exactly to the unit circle. The stable quadratic form
    // avoids cancellation when an inside point lies close to the contour.
    const x = 2 * a.x - 1, y = 2 * a.y - 1, dx = 2 * v.x, dy = 2 * v.y;
    const aa = dx * dx + dy * dy, bb = 2 * (x * dx + y * dy), cc = x * x + y * y - 1;
    const discriminant = bb * bb - 4 * aa * cc;
    const tolerance = intersectionTolerance * (bb * bb + Math.abs(4 * aa * cc));
    if (discriminant >= -tolerance) {
      const root = Math.sqrt(Math.max(0, discriminant));
      const q = -.5 * (bb + (bb < 0 ? -root : root));
      if (!q) add(-bb / (2 * aa));
      else { add(q / aa); add(cc / q); }
    }
  }
  values.sort((a, b) => a - b);
  return values.filter((value, index) => !index || value - values[index - 1] > intersectionTolerance);
}
function segmentFirstExit(outline, a, b) {
  const cuts = segmentCuts(outline, a, b);
  for (let index = 1; index < cuts.length; index++) {
    const low = cuts[index - 1], high = cuts[index], middle = (low + high) / 2;
    // Vertex touches and tangencies do not create an outside interval. Testing
    // every ordered interval also catches excursions with both ends inside.
    if (middle > low && middle < high && !localContains(outline, interpolate(a, b, middle))) return low;
  }
  return null;
}
function extendedRay(rect, direction, token) {
  let dx = direction.x / rect.width, dy = direction.y / rect.height;
  if (!dx && !dy) dx = 1;
  const c = { x: .5, y: .5 };
  if (token === 'ellipse') {
    const length = Math.hypot(dx, dy);
    return { x: rect.x + rect.width * (.5 + .5 * dx / length), y: rect.y + rect.height * (.5 + .5 * dy / length) };
  }
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  const end = { x: c.x + 2 * dx / length, y: c.y + 2 * dy / length };
  const outline = localContour(rect, token), cuts = segmentCuts(outline, c, end);
  let t = 0;
  // Automatic center rays must leave every filled interval, not merely the
  // first one. A folder ray can leave the body and re-enter its raised tab.
  // The final inside interval supplies the visible exterior terminal; manual
  // polylines deliberately keep their first exit and all later excursions.
  for (let index = cuts.length - 1; index > 0; index--) {
    const middle = (cuts[index - 1] + cuts[index]) / 2;
    if (localContains(outline, interpolate(c, end, middle))) { t = cuts[index]; break; }
  }
  const hit = interpolate(c, end, t);
  return { x: rect.x + rect.width * hit.x, y: rect.y + rect.height * hit.y };
}
function extendedFirstExit(points, rect, token) {
  const outline = localContour(rect, token);
  const local = point => ({ x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height });
  for (let i = 1; i < points.length; i++) {
    const t = segmentFirstExit(outline, local(points[i - 1]), local(points[i]));
    if (t !== null) return { point: interpolate(points[i - 1], points[i], t), position: i - 1 + t };
  }
  return null;
}

/** Intersect a center ray with the rendered rectangle, round rectangle or box.
 * SVG clamps rx/ry independently to half width/height, including tiny imports.
 * radius is an application-owned number or one of the closed contour tokens,
 * never model-supplied styling. Other values retain rectangle fallback behavior.
 */
export function contourPoint(rect, direction, radius = 0) {
  if (radius === 'circle') return extendedRay(circleBounds(rect), direction, 'ellipse');
  if (radius === 'box3d') return polygonRay(rect, direction);
  if (extendedToken(radius)) return extendedRay(rect, direction, radius);
  const c = center(rect), length = Math.hypot(direction.x, direction.y);
  const dx = length ? direction.x / length : 1, dy = length ? direction.y / length : 0;
  const hw = rect.width / 2, hh = rect.height / 2;
  const distance = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const point = { x: c.x + dx * distance, y: c.y + dy * distance };
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const rx = Math.min(safeRadius, hw), ry = Math.min(safeRadius, hh);
  if (!rx || !ry || Math.abs(point.x - c.x) <= hw - rx || Math.abs(point.y - c.y) <= hh - ry) return point;
  const offsetX = -Math.sign(dx) * (hw - rx), offsetY = -Math.sign(dy) * (hh - ry);
  const a = (dx / rx) ** 2 + (dy / ry) ** 2;
  const b = 2 * (dx * offsetX / rx ** 2 + dy * offsetY / ry ** 2);
  const q = (offsetX / rx) ** 2 + (offsetY / ry) ** 2 - 1;
  const hit = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * q))) / (2 * a);
  return { x: c.x + dx * hit, y: c.y + dy * hit };
}
function curve(start, controlA, controlB, end) {
  // The Bézier lies in its control hull. A conservative extent is sufficient
  // for fit; it cannot clip a loop because its endpoints happen to be close.
  const middle = { x: (start.x + 3 * controlA.x + 3 * controlB.x + end.x) / 8,
    y: (start.y + 3 * controlA.y + 3 * controlB.y + end.y) / 8 };
  return { d: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`,
    x: middle.x, y: middle.y - 12, bounds: extent([start, controlA, controlB, end]) };
}
function loop(from, to) {
  const a = center(from), b = center(to);
  const reach = Math.max(48, Math.min(120, Math.max(from.width, from.height, to.width, to.height) * .45));
  const start = { x: from.x + from.width, y: a.y }, end = { x: b.x, y: to.y };
  const right = Math.max(from.x + from.width, to.x + to.width), top = Math.min(from.y, to.y);
  const controlA = { x: right + reach, y: a.y }, controlB = { x: right + reach, y: top };
  const join = { x: right + reach / 2, y: top - reach / 2 };
  const controlC = { x: right, y: top - reach }, controlD = { x: b.x, y: top - reach };
  // Two convex-hull guarantees: the first cubic stays right of the source
  // rectangle, the second above the target rectangle. For a self-loop no
  // interior point can cross the node, regardless of aspect ratio or radius.
  // The join tangents agree; departure is rightward and arrival downward.
  // Box bevel depth <= width/6 and height/6 leaves the right/top midpoints on
  // straight outline edges. Its fill is inside this rectangle, so these same
  // anchors and exterior control hulls also remain valid for every box aspect.
  return { d: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${join.x} ${join.y} C ${controlC.x} ${controlC.y}, ${controlD.x} ${controlD.y}, ${end.x} ${end.y}`,
    x: join.x, y: join.y - 12, bounds: extent([start, controlA, controlB, join, controlC, controlD, end]) };
}

// New concave contours need cardinal bridges before turning. In particular,
// the folder's upper middle edge is below its tab; a roof cubic could cut the
// tab even with a correct endpoint. Each orthogonal terminal follows an actual
// outward cardinal ray, then the middle stays outside both bounding rectangles.
function exteriorRoute(from, to, fromToken, toToken, loopRoute) {
  const reach = Math.max(48, Math.min(120, Math.max(from.width, from.height, to.width, to.height) * .45));
  const roof = Math.min(from.y, to.y) - reach;
  const end = contourPoint(to, { x: 0, y: -1 }, toToken);
  let points;
  if (loopRoute) {
    const start = contourPoint(from, { x: 1, y: 0 }, fromToken);
    const right = Math.max(from.x + from.width, to.x + to.width) + reach;
    points = [start, { x: right, y: start.y }, { x: right, y: roof }, { x: end.x, y: roof }, end];
  } else {
    const start = contourPoint(from, { x: 0, y: -1 }, fromToken);
    points = [start, { x: start.x, y: roof }, { x: end.x, y: roof }, end];
  }
  const roofStart = points[points.length - 3], roofEnd = points[points.length - 2];
  return { d: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
    x: (roofStart.x + roofEnd.x) / 2, y: roof - 12, bounds: extent(points) };
}

function automaticGeometry(connection, occurrences, radiusFor) {
  const source = occurrences.find(item => item.id === connection.source.id);
  const target = occurrences.find(item => item.id === connection.target.id);
  const from = source.bounds, to = target.bounds, a = center(from), b = center(to);
  const dx = b.x - a.x, dy = b.y - a.y;
  const fromToken = radiusFor(source), toToken = radiusFor(target);
  const extended = extendedToken(fromToken) || extendedToken(toToken);
  if (source.id === target.id || (!dx && !dy)) return extended ? exteriorRoute(from, to, fromToken, toToken, true) : loop(from, to);
  const start = contourPoint(from, { x: dx, y: dy }, fromToken);
  const end = contourPoint(to, { x: -dx, y: -dy }, toToken);
  // A straight path through overlapping boxes would reverse the visible arrow.
  // Route above them instead. Fully occluded nodes still require user separation.
  if ((end.x - start.x) * dx + (end.y - start.y) * dy <= 0) {
    if (extended) return exteriorRoute(from, to, fromToken, toToken, !dx);
    if (!dx) return loop(from, to);
    const roof = Math.min(from.y, to.y) - 60;
    return curve({ x: a.x, y: from.y }, { x: a.x, y: roof }, { x: b.x, y: roof }, { x: b.x, y: to.y });
  }
  return { d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 - 12, bounds: extent([start, end]) };
}

function containsPoint(rect, point, radius) {
  if (radius === 'circle') return containsPoint(circleBounds(rect), point, 'ellipse');
  if (extendedToken(radius)) return localContains(localContour(rect, radius),
    { x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height });
  if (radius === 'box3d') {
    const points = box3dGeometry(rect).outline;
    return points.every((a, index) => side(a, points[(index + 1) % points.length], point) >= 0);
  }
  const c = center(rect), hw = rect.width / 2, hh = rect.height / 2;
  const x = Math.abs(point.x - c.x), y = Math.abs(point.y - c.y);
  if (x > hw || y > hh) return false;
  const r = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const rx = Math.min(r, hw), ry = Math.min(r, hh);
  return !rx || !ry || x <= hw - rx || y <= hh - ry ||
    ((x - hw + rx) / rx) ** 2 + ((y - hh + ry) / ry) ** 2 <= 1;
}

// Starting at a node's center, discard only its hidden leading polyline portion.
// Rounded rectangles and boxes are convex: the first inside-to-outside segment
// has one exit. Bisection also handles independent rx/ry clamping on tiny imports.
function firstExit(points, rect, radius) {
  if (radius === 'circle') return extendedFirstExit(points, circleBounds(rect), 'ellipse');
  if (extendedToken(radius)) return extendedFirstExit(points, rect, radius);
  for (let i = 1; i < points.length; i++) {
    if (containsPoint(rect, points[i], radius)) continue;
    const a = points[i - 1], b = points[i];
    const at = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    let low = 0, high = 1;
    for (let step = 0; step < 64; step++) {
      const t = (low + high) / 2;
      if (t === low || t === high) break;
      if (containsPoint(rect, at(t), radius)) low = t; else high = t;
    }
    const t = (low + high) / 2;
    return { point: at(t), position: i - 1 + t };
  }
  return null;
}

function storedPolyline(connection, occurrences, radiusFor) {
  if (!connection.routePoints?.length) return null;
  const source = occurrences.find(item => item.id === connection.source.id);
  const target = occurrences.find(item => item.id === connection.target.id);
  const points = [center(source.bounds), ...connection.routePoints.map(item => item.point), center(target.bounds)];
  const start = firstExit(points, source.bounds, radiusFor(source));
  const reverse = firstExit([...points].reverse(), target.bounds, radiusFor(target));
  if (!start || !reverse) return null;
  const endPosition = points.length - 1 - reverse.position;
  if (start.position >= endPosition) return null;
  const entries = [{ point: start.point, afterIndex: Math.floor(start.position) - 1 },
    ...points.slice(Math.floor(start.position) + 1, Math.ceil(endPosition)).map((point, index) =>
      ({ point, afterIndex: Math.floor(start.position) + index })),
    { point: reverse.point, afterIndex: connection.routePoints.length - 1 }];
  // Preserve the last duplicate's raw index for insertion after collapsed runs.
  const visible = [];
  for (const entry of entries) {
    const previous = visible.at(-1);
    if (previous && entry.point.x === previous.point.x && entry.point.y === previous.point.y) previous.afterIndex = entry.afterIndex;
    else visible.push(entry);
  }
  const route = visible.map(entry => entry.point);
  const lengths = route.slice(1).map((point, index) => Math.hypot(point.x - route[index].x, point.y - route[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  if (!remaining) return null;
  let middle;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = remaining / lengths[i], a = route[i], b = route[i + 1];
      middle = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; break;
    }
    remaining -= lengths[i];
  }
  const geometry = { d: route.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
    x: middle.x, y: middle.y - 12, bounds: extent(route) };
  routeInsertionIndices.set(geometry, visible.map(entry => entry.afterIndex));
  return geometry;
}

/** Resolve one view endpoint without evaluating another connection's route.
 * Reading only the named stored anchor makes self and mutual references finite.
 * Missing references are structural errors, never a reason to guess a drawing.
 */
export function resolveConnectionEndpoint(endpoint, occurrences, connections = []) {
  if (endpoint?.kind === 'occurrence') {
    const occurrence = occurrences.find(item => item.id === endpoint.id);
    if (!occurrence) throw new Error('Missing connection occurrence');
    return { kind: 'occurrence', point: center(occurrence.bounds), bounds: { ...occurrence.bounds }, occurrence };
  }
  if (endpoint?.kind === 'connection') {
    const host = connections.find(item => item.id === endpoint.id);
    const anchor = host?.routePoints.find(item => item.kind === 'anchor' && item.id === endpoint.anchorId);
    if (!anchor) throw new Error('Missing connection anchor');
    const point = { ...anchor.point };
    return { kind: 'connection', point, bounds: { ...point, width: 0, height: 0 },
      connectionId: host.id, anchorId: anchor.id };
  }
  throw new Error('Invalid connection endpoint');
}

function polylineGeometry(points) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const length = lengths.reduce((sum, value) => sum + value, 0);
  let remaining = length / 2, middle = points[0];
  for (let index = 0; index < lengths.length; index++) {
    if (lengths[index] && remaining <= lengths[index]) {
      middle = interpolate(points[index], points[index + 1], remaining / lengths[index]); break;
    }
    remaining -= lengths[index];
  }
  return { d: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
    x: middle.x, y: middle.y - 12, bounds: extent(points), length };
}

function pinnedPolyline(connection, occurrences, radiusFor, storedGeometry, connections) {
  // A preview replaces the same-ID host in this call, so a self attachment also
  // uses the current preview's point. Other hosts are read directly, once.
  const hosts = [connection, ...connections.filter(item => item.id !== connection.id)];
  const source = resolveConnectionEndpoint(connection.source, occurrences, hosts);
  const target = resolveConnectionEndpoint(connection.target, occurrences, hosts);
  const retained = connection.routePoints.map((item, index) => ({ ...item, rawIndex: index }))
    .filter(item => storedGeometry === true || item.kind === 'anchor');
  const waypoints = retained;
  const points = [source.point, ...waypoints.map(item => item.point), target.point];
  const pinnedIndices = waypoints.flatMap((item, index) => item.kind === 'anchor' ? [index + 1] : []);
  // Connection endpoints themselves are pins. They must survive clipping by
  // the occurrence at the other end, even when that point is fully hidden.
  if (source.kind === 'connection') pinnedIndices.unshift(0);
  if (target.kind === 'connection') pinnedIndices.push(points.length - 1);
  let start = { point: source.point, position: 0 };
  let end = { point: target.point, position: points.length - 1 };
  if (source.occurrence) {
    const exit = firstExit(points, source.bounds, radiusFor(source.occurrence));
    if (exit && (!pinnedIndices.length || exit.position < pinnedIndices[0])) start = exit;
  }
  if (target.occurrence) {
    const exit = firstExit([...points].reverse(), target.bounds, radiusFor(target.occurrence));
    const position = exit && points.length - 1 - exit.position;
    if (exit && (!pinnedIndices.length || position > pinnedIndices.at(-1))) end = { point: exit.point, position };
  }
  // Do not deduplicate pins, including co-located anchors with distinct IDs.
  const route = [start.point, ...points.slice(Math.floor(start.position) + 1, Math.ceil(end.position)), end.point]
    .map(point => ({ ...point }));
  const diagnostics = [];
  const occlusions = point => occurrences.filter(item => containsPoint(item.bounds, point, radiusFor(item)))
    .map(item => item.id).sort();
  const anchors = waypoints.filter(item => item.kind === 'anchor').map(item => {
    const occludedBy = occlusions(item.point);
    for (const occurrenceId of occludedBy) diagnostics.push({ ruleId: 'anchor-occluded',
      connectionId: connection.id, anchorId: item.id, occurrenceId });
    return { id: item.id, point: { ...item.point }, occludedBy };
  });
  for (const [endName, endpoint] of [['source', source], ['target', target]]) {
    if (endpoint.kind === 'connection') for (const occurrenceId of occlusions(endpoint.point)) {
      diagnostics.push({ ruleId: 'endpoint-occluded', connectionId: connection.id, end: endName,
        hostConnectionId: endpoint.connectionId, anchorId: endpoint.anchorId, occurrenceId });
    }
  }
  const { length, ...geometry } = polylineGeometry(route);
  if (!length) diagnostics.push({ ruleId: 'degenerate-route', connectionId: connection.id });
  const result = { ...geometry, points: route, anchors, diagnostics, routeMode: 'pinned-polyline',
    endpointBounds: { source: source.bounds, target: target.bounds } };
  const rawIndex = position => position <= 0 ? -1 : waypoints[Math.min(position - 1, waypoints.length - 1)]?.rawIndex ?? -1;
  routeInsertionIndices.set(result, [rawIndex(Math.floor(start.position)),
    ...points.slice(Math.floor(start.position) + 1, Math.ceil(end.position)).map((_, index) => rawIndex(Math.floor(start.position) + 1 + index)),
    connection.routePoints.length - 1]);
  return result;
}

function drawingStyleGeometry(base, connection, storedGeometry) {
  const style = connection.style?.lineStyle;
  const self = connection.source.kind === 'occurrence' && connection.target.kind === 'occurrence' && connection.source.id === connection.target.id && !connection.routePoints.length;
  if (!style || self && style === 'direct') return base;
  const sampled = sampleRoute(base);
  const points = self && sampled.length ? [sampled[0], { x: base.bounds.x + base.bounds.width, y: sampled[0].y }, { x: base.bounds.x + base.bounds.width, y: base.bounds.y }, { x: sampled.at(-1).x, y: base.bounds.y }, sampled.at(-1)] : base.points ?? (base.d.includes(' C ') && sampled.length ? [sampled[0], sampled.at(-1)] : sampled);
  if (points.length < 2) return base;
  const pins = new Set(connection.routePoints.filter(point => point.kind === 'anchor').map(point => `${point.point.x}:${point.point.y}`));
  const oldOwners = routeInsertionIndices.get(base), route = [points[0]], owners = [];
  const add = (point, owner) => { if (route.at(-1).x !== point.x || route.at(-1).y !== point.y) { route.push(point); owners.push(owner); } };
  for (let at = 1; at < points.length; at++) {
    const a = points[at - 1], b = points[at], owner = oldOwners?.[at - 1] ?? -1;
    if (style !== 'direct' && a.x !== b.x && a.y !== b.y) { const x = Math.round((a.x + b.x) * 5) / 10; add({ x, y: a.y }, owner); add({ x, y: b.y }, owner); }
    add(b, owner);
  }
  let d = `M ${route[0].x} ${route[0].y}`; const generatedOwners = [];
  for (let at = 1; at < route.length; at++) {
    const point = route[at], previous = route[at - 1], next = route[at + 1], owner = owners[at - 1];
    const incoming = Math.hypot(point.x - previous.x, point.y - previous.y), outgoing = next && Math.hypot(next.x - point.x, next.y - point.y);
    if (style === 'rounded' && next && incoming && outgoing && !pins.has(`${point.x}:${point.y}`)) {
      const radius = Math.min(8, incoming / 2, outgoing / 2), a = { x: point.x - (point.x - previous.x) / incoming * radius, y: point.y - (point.y - previous.y) / incoming * radius }, b = { x: point.x + (next.x - point.x) / outgoing * radius, y: point.y + (next.y - point.y) / outgoing * radius };
      d += ` L ${a.x} ${a.y} C ${a.x + (point.x - a.x) * 2 / 3} ${a.y + (point.y - a.y) * 2 / 3}, ${b.x + (point.x - b.x) * 2 / 3} ${b.y + (point.y - b.y) * 2 / 3}, ${b.x} ${b.y}`; generatedOwners.push(owner, owner);
    } else { d += ` L ${point.x} ${point.y}`; generatedOwners.push(owner); }
  }
  const result = { ...base, d, points: route, bounds: extent([...route, { x: base.bounds.x, y: base.bounds.y }, { x: base.bounds.x + base.bounds.width, y: base.bounds.y + base.bounds.height }]), routeMode: `${style}-${base.routeMode ?? 'automatic'}` };
  styledRouteSegments.add(result); routeInsertionIndices.set(result, generatedOwners);
  if (!storedGeometry || connection.labelPosition === null) { const midpoint = routePointAt(result); if (midpoint) { result.x = midpoint.x; result.y = midpoint.y - 10; } }
  return result;
}

/** Ordered absolute route points are display geometry, never model rewrites.
 * Optional ordinary bends retain the historical toggle and automatic fallback.
 * Hosted/referenced anchors always pin a polyline, regardless of that toggle;
 * clipping cannot discard a pin and degenerate routes remain inspectable.
 */
export function connectionGeometry(connection, occurrences, radiusFor = () => 0, storedGeometry = false, connections = []) {
  const pinned = connection.source.kind === 'connection' || connection.target.kind === 'connection' ||
    connection.routePoints.some(item => item.kind === 'anchor');
  if (!pinned && storedGeometry !== true) return anchoredLabel(drawingStyleGeometry(automaticGeometry(connection, occurrences, radiusFor), connection, false),connection,false);
  const manual = pinned ? pinnedPolyline(connection, occurrences, radiusFor, storedGeometry, connections) :
    storedPolyline(connection, occurrences, radiusFor);
  const routeMode = pinned ? 'pinned-polyline' : manual ? 'stored-polyline' : connection.routePoints.length ? 'automatic-fallback' : 'automatic';
  const geometry = manual || automaticGeometry(connection, occurrences, radiusFor);
  const label = (storedGeometry === true ? connection.labelPosition : null) ?? { x: geometry.x, y: geometry.y };
  const bounds = geometry.bounds;
  const result = { ...geometry, x: label.x, y: label.y, routeMode,
    ...(routeMode === 'automatic-fallback' ? { fallbackReason: 'no-visible-route' } : {}),
    bounds: extent([{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, label]) };
  if (manual && routeInsertionIndices.has(manual)) routeInsertionIndices.set(result, routeInsertionIndices.get(manual));
  return anchoredLabel(drawingStyleGeometry(result, connection, storedGeometry === true),connection,storedGeometry===true);
}

function anchoredLabel(geometry,connection,storedGeometry){
  if(!connection.style?.labelAnchor||storedGeometry&&connection.labelPosition!==null)return geometry;
  const point=routePointAt(geometry,{source:0,middle:.5,target:1}[connection.style.labelAnchor]);if(!point)return geometry;
  const result={...geometry,x:point.x,y:point.y-10,bounds:extent([{x:geometry.bounds.x,y:geometry.bounds.y},{x:geometry.bounds.x+geometry.bounds.width,y:geometry.bounds.y+geometry.bounds.height},point])};
  if(routeInsertionIndices.has(geometry))routeInsertionIndices.set(result,routeInsertionIndices.get(geometry));if(styledRouteSegments.has(geometry))styledRouteSegments.add(result);return result;
}

/** Fit uses precisely the same contours/routes as the canvas, plus marker margin. */
export function viewGeometryBounds(occurrences, connections, radiusFor = () => 0, storedGeometry = false, labelBoundsFor = () => null) {
  if (!occurrences.length && !connections.length) return { x: 0, y: 0, width: 900, height: 640 };
  const rectangles = occurrences.map(item => item.bounds);
  for (const connection of connections) {
    const geometry = connectionGeometry(connection, occurrences, radiusFor, storedGeometry, connections);
    rectangles.push(geometry.bounds);
    if (storedGeometry === true || geometry.routeMode === 'pinned-polyline') {
      // The app supplies measured SVG text bounds where possible. The pure
      // fallback covers its <=36 code-point, 11px labels at up to 2em each,
      // including painted text stroke. It is a display bound, never model data.
      rectangles.push(labelBoundsFor(connection) || { x: geometry.x - 400, y: geometry.y - 18, width: 800, height: 30 });
    }
  }
  const bounds = extent(rectangles.flatMap(rect => [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }]));
  return { x: bounds.x - 70, y: bounds.y - 90, width: Math.max(400, bounds.width + 140), height: Math.max(400, bounds.height + 160) };
}


// Parse only locally generated, bounded M/L/C routes. This is not an SVG input
// interpreter; arbitrary SVG and non-finite paths fail closed.
const ROUTE_NUMBER = '-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:e[+-]?\\d+)?';
const routeMove = new RegExp(`M (${ROUTE_NUMBER}) (${ROUTE_NUMBER})`, 'y');
const routeLine = new RegExp(` L (${ROUTE_NUMBER}) (${ROUTE_NUMBER})`, 'y');
const routeCubic = new RegExp(` C (${ROUTE_NUMBER}) (${ROUTE_NUMBER}), (${ROUTE_NUMBER}) (${ROUTE_NUMBER}), (${ROUTE_NUMBER}) (${ROUTE_NUMBER})`, 'y');
function sampledRoute(geometry) {
  const d = geometry?.d;
  if (typeof d !== 'string' || d.length > (styledRouteSegments.has(geometry) ? 131072 : 16384)) return null;
  const matchAt = (pattern, position) => { pattern.lastIndex = position; return pattern.exec(d); };
  let match = matchAt(routeMove, 0);
  if (!match) return null;
  const point = (values, offset) => ({ x: Number(values[offset]), y: Number(values[offset + 1]) });
  const points = [point(match, 1)], indices = [], owners = routeInsertionIndices.get(geometry);
  let position = match[0].length, segment = 0;
  while (position < d.length) {
    if (segment >= (styledRouteSegments.has(geometry) ? 1024 : 129)) return null;
    match = matchAt(routeLine, position) || matchAt(routeCubic, position);
    if (!match || !match.slice(1).map(Number).every(Number.isFinite)) return null;
    const afterIndex = owners?.[segment] ?? -1;
    if (match.length === 3) { points.push(point(match, 1)); indices.push(afterIndex); }
    else {
      const a = points.at(-1), b = point(match, 1), c = point(match, 3), end = point(match, 5);
      // A fixed 32-step sample is bounded and deterministic. The final sample
      // uses the exact stored terminal instead of accumulated integration error.
      for (let step = 1; step <= 32; step++) {
        const t = step / 32, q = 1 - t;
        points.push(step === 32 ? end : { x: q ** 3 * a.x + 3 * q ** 2 * t * b.x + 3 * q * t ** 2 * c.x + t ** 3 * end.x,
          y: q ** 3 * a.y + 3 * q ** 2 * t * b.y + 3 * q * t ** 2 * c.y + t ** 3 * end.y });
        indices.push(afterIndex);
      }
    }
    position += match[0].length; segment++;
  }
  if (points.length < 2 || !points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  return { points, indices };
}

/** Bounded sampling of renderer-generated styled paths, including rounded routes. */
export function sampleDrawingRoute(d) { const geometry={d};styledRouteSegments.add(geometry);return sampledRoute(geometry)?.points??[]; }

/** Shared display-path sampling for anchor previews and pointer picking. */
export function sampleRoute(geometry) { return sampledRoute(geometry)?.points ?? []; }

/** Point at a clamped fraction of displayed path length (bounded cubic samples). */
export function routePointAt(geometry, fraction = .5) {
  if (!Number.isFinite(fraction)) return null;
  const route = sampledRoute(geometry);
  if (!route) return null;
  const { points } = route;
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total)) return null;
  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (let index = 0; index < lengths.length; index++) {
    if (lengths[index] && remaining <= lengths[index]) return interpolate(points[index], points[index + 1], remaining / lengths[index]);
    remaining -= lengths[index];
  }
  return { ...points.at(-1) };
}

/** Nearest displayed point and merged raw insertion index. Ties select the
 * first segment in stored order; source-side insertion before any point is -1.
 */
export function nearestRoutePoint(geometry, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const route = sampledRoute(geometry);
  if (!route) return null;
  let nearest = null, distance = Infinity;
  for (let index = 0; index < route.points.length - 1; index++) {
    const a = route.points[index], b = route.points[index + 1], dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    const projected = interpolate(a, b, t), nextDistance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (Number.isFinite(nextDistance) && nextDistance < distance) {
      distance = nextDistance;
      nearest = { point: projected, afterIndex: route.indices[index], segmentIndex: index };
    }
  }
  return nearest;
}
