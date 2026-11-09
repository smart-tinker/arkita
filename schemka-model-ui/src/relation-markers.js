const SVG_NS = 'http://www.w3.org/2000/svg';

// Original, application-owned primitives. Neither model properties nor source
// SVG, styles or URLs participate in creating these marker definitions.
const shapes = Object.freeze({
  open: Object.freeze({ d: 'M0 -4 L10 0 L0 4', fill: 'none' }),
  hollow: Object.freeze({ d: 'M0 -4 L10 0 L0 4 Z', fill: 'var(--canvas)' }),
  closed: Object.freeze({ d: 'M0 -4 L10 0 L0 4 Z', fill: 'var(--link)' }),
  half: Object.freeze({ d: 'M0 -4 L10 0', fill: 'none' }),
  'filled-diamond': Object.freeze({ d: 'M10 0 L5 -4 L0 0 L5 4 Z', fill: 'var(--link)' }),
  'hollow-diamond': Object.freeze({ d: 'M10 0 L5 -4 L0 0 L5 4 Z', fill: 'var(--canvas)' }),
  dot: Object.freeze({ cx: 7, cy: 0, r: 3, fill: 'var(--link)' }),
});

export const MARKER_KINDS = Object.freeze(Object.keys(shapes));

// The farthest arrow vertex is sqrt(10² + 4²) from (10, 0). Round
// joins/caps add at most 0.75, giving < 12 at every rotation. The diamond
// and dot are smaller. Existing Fit padding is at least 70, so geometry
// needs no marker-dependent endpoint migration, scaling or model edits.
export const MARKER_FIT_RADIUS = 12;

const scopes = new Set(['canvas', 'legend', ...[
  'Association', 'Realization', 'Flow', 'Composition', 'Aggregation',
  'Assignment', 'Serving', 'Access', 'ReadAccess', 'WriteAccess',
  'ReadWriteAccess', 'Influence', 'Triggering', 'Specialization',
  'DirectedAssociation',
].map(type => `palette-${type.toLowerCase()}`)]);
const prefix = scope => `notation-${scopes.has(scope) ? scope : 'canvas'}`;
const svg = (document, name, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
};

/** Only closed local tokens can become an SVG fragment reference. */
export function relationMarkerUrl(kind, scope = 'canvas') {
  return MARKER_KINDS.includes(kind) ? `url(#${prefix(scope)}-${kind})` : null;
}

/** Shared by canvas, palette and legend; viewBox and viewport scale 1:1. */
export function relationMarkerDefs(document, scope = 'canvas') {
  const defs = svg(document, 'defs');
  for (const kind of MARKER_KINDS) {
    const marker = svg(document, 'marker', {
      id: `${prefix(scope)}-${kind}`, viewBox: '-3 -6 16 12', refX: 10, refY: 0,
      markerWidth: 16, markerHeight: 12, markerUnits: 'userSpaceOnUse',
      orient: 'auto-start-reverse', overflow: 'visible',
    });
    marker.append(svg(document, kind === 'dot' ? 'circle' : 'path', {
      ...shapes[kind], stroke: 'var(--link)', 'stroke-width': 1.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    defs.append(marker);
  }
  return defs;
}
