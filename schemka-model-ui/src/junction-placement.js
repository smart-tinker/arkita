import { LIMITS } from '../../schemka-model-core/src/index.js';

// Local UI policy only. Junctions use the initial canvas; ordinary elements use
// the visible camera. Explicit pointer/drop coordinates and stored geometry bypass it.
// Keep selectable bodies apart; labels and relationship paths are not packed.
const GAP = 120; // tenths of a model unit
const DOMAIN = Object.freeze({ left: 240, top: 240, right: 8400, bottom: 5800 });
const ticks = value => Math.round(value * 10);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function nextJunctionBounds(view) {
  const offset = (view?.occurrences || []).length % 7;
  return nextBounds(view, { width: 360, height: 360 }, DOMAIN, { x: 1500 + offset * 300, y: 800 + offset * 380 });
}

export function nextElementBounds(view, camera, dimensions = { width: 210, height: 90 }) {
  if (![dimensions.width, dimensions.height].every(value => Number.isFinite(value) && value > 0 && value <= 2000)) return null;
  if (![camera.x, camera.y, camera.width, camera.height].every(Number.isFinite) || camera.width <= 0 || camera.height <= 0) return null;
  const size = { width: ticks(dimensions.width), height: ticks(dimensions.height) }, limit = ticks(LIMITS.coordinate);
  const domain = {
    left: Math.max(-limit, Math.ceil((camera.x + 24) * 10)), top: Math.max(-limit, Math.ceil((camera.y + 24) * 10)),
    right: Math.min(limit, Math.floor((camera.x + camera.width - 24) * 10) - size.width),
    bottom: Math.min(limit, Math.floor((camera.y + camera.height - 24) * 10) - size.height),
  };
  const offset = (view?.occurrences || []).length % 7;
  const preferred = { x: ticks(camera.x) + 1500 + offset * 300, y: ticks(camera.y) + 800 + offset * 380 };
  const visible = domain.left <= domain.right && domain.top <= domain.bottom ? nextBounds(view, size, domain, preferred) : null;
  if (visible) return visible;
  // A full or tightly zoomed camera must not discard a creation draft.
  return nextBounds(view, size, { left: -limit, top: -limit, right: limit, bottom: limit },
    { x: ticks(camera.x + (camera.width - size.width / 10) / 2), y: ticks(camera.y + (camera.height - size.height / 10) / 2) });
}

function nextBounds(view, size, domain, preference) {
  const occurrences = view?.occurrences || [], obstacles = [];
  for (const occurrence of occurrences) {
    const b = occurrence.bounds;
    if (occurrence.concept.kind === 'junction') {
      // Imported junctions may be tiny or non-square. Match the rendered hit
      // circle, whose radius never falls below twelve model units.
      const radius = Math.max(Math.min(ticks(b.width), ticks(b.height)) / 2, 120);
      const cx = ticks(b.x) + ticks(b.width) / 2, cy = ticks(b.y) + ticks(b.height) / 2;
      obstacles.push({ left: Math.floor(cx - radius), top: Math.floor(cy - radius), right: Math.ceil(cx + radius), bottom: Math.ceil(cy + radius) });
    // Neutral notation has a selectable four-unit accent even when imported
    // element widths are smaller. Reserve its conservative envelope in either
    // mode, so switching notation cannot turn a free slot into an occluded one.
    } else obstacles.push({ left: ticks(b.x), top: ticks(b.y), right: ticks(b.x) + Math.max(ticks(b.width), 40), bottom: ticks(b.y) + ticks(b.height) });
  }
  // Pinned anchor hit targets are painted above occurrences in both display
  // modes, so automatic junctions must not land beneath them either.
  for (const connection of view?.connections || []) for (const point of connection.routePoints) if (point.kind === 'anchor') {
    const x = ticks(point.point.x), y = ticks(point.point.y);
    obstacles.push({ left: x - 100, top: y - 100, right: x + 100, bottom: y + 100 });
  }
  // Expand obstacles into forbidden top-left origins. Integer inclusive ranges
  // preserve the exact 0.1 grid and allow equality at the required clearance.
  const blocked = obstacles.map(b => ({ left: b.left - size.width - GAP + 1, top: b.top - size.height - GAP + 1,
    right: b.right + GAP - 1, bottom: b.bottom + GAP - 1 }))
    .filter(b => b.left <= domain.right && b.right >= domain.left && b.top <= domain.bottom && b.bottom >= domain.top);
  const preferred = { x: clamp(preference.x, domain.left, domain.right), y: clamp(preference.y, domain.top, domain.bottom) };
  const rows = new Set([preferred.y, domain.top, domain.bottom]);
  for (const b of blocked) for (const y of [b.top - 1, b.bottom + 1]) if (y >= domain.top && y <= domain.bottom) rows.add(y);
  let best = null;
  function consider(left, right, y) {
    if (left > right) return;
    const x = clamp(preferred.x, left, right), distance = Math.abs(x - preferred.x) + Math.abs(y - preferred.y);
    if (!best || distance < best.distance || distance === best.distance && (y < best.y || y === best.y && x < best.x)) best = { x, y, distance };
  }
  for (const y of rows) {
    const intervals = blocked.filter(b => y >= b.top && y <= b.bottom).sort((a, b) => a.left - b.left || a.right - b.right);
    let left = domain.left;
    for (const b of intervals) {
      consider(left, Math.min(domain.right, b.left - 1), y);
      left = Math.max(left, b.right + 1);
      if (left > domain.right) break;
    }
    consider(left, domain.right, y);
  }
  return best ? { x: best.x / 10 || 0, y: best.y / 10 || 0, width: size.width / 10, height: size.height / 10 } : null;
}
