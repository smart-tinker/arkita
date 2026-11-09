/** Bounded display-only labels. Call only with local connectionGeometry output,
 * never with a model field as SVG. No route, occurrence or model data is edited.
 */
const NUMBER = '-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:e[+-]?\\d+)?';
const initialPoint = new RegExp(`M (${NUMBER}) (${NUMBER})`, 'y');
const line = new RegExp(` L (${NUMBER}) (${NUMBER})`, 'y');
const cubic = new RegExp(` C (${NUMBER}) (${NUMBER}), (${NUMBER}) (${NUMBER}), (${NUMBER}) (${NUMBER})`, 'y');
// The core permits at most 128 route points: a generated route has <=129 segments.
const MAX_SEGMENTS = 129, MAX_PATH_LENGTH = 16384, MAX_RAW_LENGTH = 128;
const TEXT_LIMIT = 16, ADVANCE = 22, TEXT_MARGIN = 4, GAP = 4, MARKER_RADIUS = 12;
const invisible = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u;

function matchAt(pattern, value, position) {
  pattern.lastIndex = position;
  return pattern.exec(value);
}

function points(match) {
  const values = match.slice(1).map(Number);
  if (!values.every(Number.isFinite)) return null;
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
}

// Deliberately not a general SVG parser: only the generator's exact M/L/C
// syntax, one subpath, explicit commands and finite coordinates are accepted.
function parsePath(d) {
  if (typeof d !== 'string' || d.length > MAX_PATH_LENGTH) return null;
  let match = matchAt(initialPoint, d, 0);
  if (!match) return null;
  const first = points(match);
  if (!first) return null;
  let position = match[0].length, current = first[0];
  const segments = [];
  while (position < d.length) {
    if (segments.length === MAX_SEGMENTS) return null;
    match = matchAt(line, d, position) || matchAt(cubic, d, position);
    if (!match) return null;
    const next = points(match);
    if (!next) return null;
    segments.push([current, ...next]);
    current = next.at(-1);
    position += match[0].length;
  }
  return segments.length ? { start: first[0], end: current, segments } : null;
}

function direction(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const scale = Math.max(Math.abs(dx), Math.abs(dy));
  if (!scale) return null;
  // Scaling first also normalizes subnormal, nonzero vectors correctly.
  const x = dx / scale, y = dy / scale, length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

function tangents(path) {
  let source = null, target = null;
  for (const segment of path.segments) {
    let outgoing = null, incoming = null;
    for (let index = 1; index < segment.length; index++) {
      const start = direction(segment[0], segment[index]);
      const end = direction(segment[segment.length - 1 - index], segment.at(-1));
      if (start === false || end === false) return null;
      outgoing ||= start; incoming ||= end;
    }
    source ||= outgoing;
    if (incoming) target = incoming;
  }
  return source && target ? { source, target } : null;
}

function displayText(raw) {
  if (raw === '') return '⟨пусто⟩';
  // Escape Cc/Cf controls, Unicode line/paragraph separators and lone
  // surrogates. Valid surrogate pairs remain one code point. Raw stays exact.
  const escaped = Array.from(raw, character => {
    if (character === '\r') return '\\r';
    if (character === '\n') return '\\n';
    if (character === '\t') return '\\t';
    if (!invisible.test(character)) return character;
    const value = character.codePointAt(0), hex = value.toString(16).toUpperCase();
    return value <= 0xFFFF ? `\\u${hex.padStart(4, '0')}` : `\\u{${hex}}`;
  }).join('');
  const characters = Array.from(escaped);
  return characters.length > TEXT_LIMIT ? `${characters.slice(0, TEXT_LIMIT - 1).join('')}…` : escaped;
}

function validBounds(rect) {
  return rect && [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) &&
    rect.width >= 0 && rect.height >= 0;
}

function textBounds(x, y, anchor, text) {
  const advance = Array.from(text).length * ADVANCE;
  return { x: x - (anchor === 'start' ? 0 : anchor === 'end' ? advance : advance / 2) - TEXT_MARGIN,
    y: y - 16, width: advance + 2 * TEXT_MARGIN, height: 24 };
}

function clears(bounds, obstacle) {
  return bounds.x + bounds.width <= obstacle.x - GAP || bounds.x >= obstacle.x + obstacle.width + GAP ||
    bounds.y + bounds.height <= obstacle.y - GAP || bounds.y >= obstacle.y + obstacle.height + GAP;
}

function placeLabel(end, raw, point, tangent, ownBounds) {
  if (!validBounds(ownBounds)) return null;
  const sign = end === 'source' ? 1 : -1;
  const outward = { x: sign * tangent.x, y: sign * tangent.y };
  const text = displayText(raw), anchor = outward.x > .25 ? 'start' : outward.x < -.25 ? 'end' : 'middle';
  const x = point.x + 18 * outward.x + 14 * tangent.y;
  const y = point.y + 18 * outward.y - 14 * tangent.x;
  const original = textBounds(x, y, anchor, text);
  const obstacles = [ownBounds, { x: point.x - MARKER_RADIUS, y: point.y - MARKER_RADIUS,
    width: 2 * MARKER_RADIUS, height: 2 * MARKER_RADIUS }];
  if (!validBounds(original) || !obstacles.every(validBounds)) return null;

  // The first feasible translation is zero or a directional exit from one of
  // these two padded rectangles. This finite candidate set avoids iterative
  // collision search and also handles entering the second box while exiting
  // the first. Sub-epsilon components are not divisors; the dominant component
  // always remains available. The actual translation retains both components.
  const candidates = [0];
  for (const obstacle of obstacles) for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
    const velocity = outward[axis];
    if (Math.abs(velocity) <= Number.EPSILON) continue;
    const distance = (velocity > 0 ? obstacle[axis] + obstacle[size] + GAP - original[axis]
      : obstacle[axis] - GAP - original[axis] - original[size]) / velocity;
    if (!Number.isFinite(distance) || distance < 0) continue;
    candidates.push(distance);
    // One bounded rounding guard covers a computed exit just below its edge.
    const magnitude = Math.max(1, Math.abs(x), Math.abs(y), Math.abs(distance),
      Math.abs(obstacle.x), Math.abs(obstacle.y), obstacle.width, obstacle.height);
    candidates.push(distance + 8 * Number.EPSILON * magnitude / Math.max(Math.abs(outward.x), Math.abs(outward.y)));
  }
  candidates.sort((a, b) => a - b);
  for (const distance of candidates) {
    const labelX = x + distance * outward.x, labelY = y + distance * outward.y;
    const bounds = textBounds(labelX, labelY, anchor, text);
    if (validBounds(bounds) && obstacles.every(obstacle => clears(bounds, obstacle))) {
      return { end, text, raw, x: labelX, y: labelY, anchor, bounds };
    }
  }
  return null;
}

/** Labels stay attached to stored source/target roles, including ReadAccess.
 * Their 11px display bounds are conservative: 22 units/code point + 8 margin,
 * baseline minus 16, height 24. Starting positions are 18 along the endpoint's
 * outward tangent plus 14 along the path-direction normal (dy, -dx). Move only
 * outward until these same bounds clear their own stored node rectangle AND
 * the endpoint's +/-12 marker ink box by 4 units. Other labels/nodes may overlap.
 * The app may union these bounds with measured DOM bounds for Fit in either mode.
 * Absent properties produce no label; empty and '*' remain distinct. Invalid
 * route syntax fails closed. No saved labelPosition or model styling is read.
 */
export function multiplicityLabels(relationship, geometry, sourceBounds = geometry?.endpointBounds?.source, targetBounds = geometry?.endpointBounds?.target) {
  if (!relationship || typeof relationship !== 'object') return [];
  const path = parsePath(geometry?.d);
  if (!path) return [];
  const directions = tangents(path);
  if (!directions) return [];
  const result = [];
  for (const [end, point, ownBounds] of [['source', path.start, sourceBounds], ['target', path.end, targetBounds]]) {
    const key = `${end}Multiplicity`;
    if (!Object.hasOwn(relationship, key)) continue;
    const raw = relationship[key];
    if (typeof raw !== 'string' || raw.length > MAX_RAW_LENGTH) continue;
    const label = placeLabel(end, raw, point, directions[end], ownBounds);
    if (label) result.push(label);
  }
  return result;
}
