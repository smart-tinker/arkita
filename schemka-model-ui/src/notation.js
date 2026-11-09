import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { relationMarkerDefs, relationMarkerUrl } from './relation-markers.js';
import { box3dGeometry, nodeContourGeometry } from './node-shapes.js';
import { presentationFor } from './profile-ui.js';

// Application visualization version, independent of the metamodel/file version.
// Closed local tables only; imported data never supplies SVG, CSS, URLs or adapters.
export const DRAFT_NOTATION = 'schemka-am4-draft-visual@2';
// Defensive descriptor only, never a selectable mode or a supported profile.
export const UNKNOWN_NOTATION = 'schemka-unknown-visual@1';
export const NOTATION_SOURCE = Object.freeze({
  url: 'https://meta.linked.archi/archimate4/notation/',
  author: 'Kalin Maldzhanski / Linked.Archi', version: 'v4.0 draft',
  license: 'https://creativecommons.org/licenses/by/4.0/',
});
const elements = Object.freeze({
  Service: ['common', 12, 'Service', 'service'], Process: ['common', 12, 'Process', 'process'],
  Function: ['common', 12, 'Function', 'function'], Event: ['common', 12, 'Event', 'event'],
  Path: ['common', 0, 'Path', 'path'], Node: ['technology', 0, 'Node', 'cuboid'],
  Device: ['technology', 0, 'Device', 'monitor'], SystemSoftware: ['technology', 0, 'System Software', 'systemsoftware'],
  CommunicationNetwork: ['technology', 0, 'Communication Network', 'communicationnetwork'],
  Collaboration: ['common', 0, 'Collaboration', 'collaboration'], Role: ['common', 0, 'Role', 'role'],
  ApplicationComponent: ['application', 0, 'Application Component', 'component'],
  ApplicationInterface: ['application', 0, 'Application Interface', 'interface'],
  DataObject: ['application', 0, 'Data Object', 'banded'],
  BusinessActor: ['business', 0, 'Business Actor', 'businessactor'],
  BusinessInterface: ['business', 0, 'Business Interface', 'interface'],
  BusinessObject: ['business', 0, 'Business Object', 'banded'],
  Product: ['business', 0, 'Product', 'tabbed'],
  TechnologyInterface: ['technology', 0, 'Technology Interface', 'interface'],
  Equipment: ['technology', 0, 'Equipment', 'equipment'],
  Facility: ['technology', 0, 'Facility', 'facility'],
  DistributionNetwork: ['technology', 0, 'Distribution Network', 'distributionnetwork'],
  Artifact: ['technology', 0, 'Artifact', 'artifact'],
  Material: ['technology', 0, 'Material', 'material'],
  Grouping: ['common', 0, 'Grouping', 'folder'], Location: ['common', 0, 'Location', 'location'],
  Stakeholder: ['motivation', 0, 'Stakeholder', 'octagon', 'stakeholder'],
  Driver: ['motivation', 0, 'Driver', 'octagon', 'driver'], Assessment: ['motivation', 0, 'Assessment', 'octagon', 'assessment'],
  Goal: ['motivation', 0, 'Goal', 'octagon', 'goal'], Outcome: ['motivation', 0, 'Outcome', 'octagon', 'outcome'],
  Principle: ['motivation', 0, 'Principle', 'octagon', 'principle'], Requirement: ['motivation', 0, 'Requirement', 'octagon', 'requirement'],
  Meaning: ['motivation', 0, 'Meaning', 'cloud'], Value: ['motivation', 0, 'Value', 'ellipse'],
  Resource: ['strategy', 0, 'Resource', 'resource'], Capability: ['strategy', 12, 'Capability', 'capability'],
  ValueStream: ['strategy', 12, 'Value Stream', 'valuestream'], CourseOfAction: ['strategy', 12, 'Course of Action', 'courseofaction'],
  WorkPackage: ['implementation', 12, 'Work Package', 'workpackage'],
  Deliverable: ['implementation', 0, 'Deliverable', 'wavy'], Plateau: ['implementation', 0, 'Plateau', 'plateau'],
});
const extendedTypes = new Set(['Grouping', 'Location', 'Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Meaning', 'Value', 'Resource', 'Capability', 'ValueStream', 'CourseOfAction', 'WorkPackage', 'Deliverable', 'Plateau']);
// [line pattern, stored-source marker, stored-target marker]. Access variants
// are nominal local IDs; the renderer never swaps endpoint IDs or adds accessType.
const relationships = Object.freeze({
  Association: ['solid', null, null], Realization: ['dotted', null, 'hollow'], Flow: ['dashed', null, 'closed'],
  Composition: ['solid', 'filled-diamond', null], Aggregation: ['solid', 'hollow-diamond', null],
  Assignment: ['solid', 'dot', 'closed'], Serving: ['solid', null, 'open'],
  Access: ['dotted', null, null], ReadAccess: ['dotted', 'open', null],
  WriteAccess: ['dotted', null, 'open'], ReadWriteAccess: ['dotted', 'open', 'open'],
  Influence: ['dashed', null, 'open'], Triggering: ['solid', null, 'closed'],
  Specialization: ['solid', null, 'hollow'], DirectedAssociation: ['solid', null, 'half'],
});
export const NOTATION_ELEMENTS = Object.freeze(Object.keys(elements));
export const NOTATION_RELATIONSHIPS = Object.freeze(Object.keys(relationships));
const current = reference => reference?.id === CURRENT_METAMODEL.id && reference?.version === CURRENT_METAMODEL.version;

export function notationJunction(reference, type) {
  const known = current(reference) && ['AndJunction', 'OrJunction'].includes(type);
  return { className: `node junction${known ? type === 'AndJunction' ? ' junction-and' : ' junction-or' : ' unknown-type'}`, contour: 'circle',
    radius: 0, badge: known ? type : '? · неизвестный junction', notation: known ? DRAFT_NOTATION : UNKNOWN_NOTATION, family: known ? 'junctions' : 'unknown' };
}

export function notationElement(reference, type) {
  const presentation = presentationFor(reference, 'element', type);
  const spec = Object.hasOwn(elements, type) ? elements[type] : null;
  if (!current(reference) || presentation.status !== 'KNOWN' || !spec) return { className: 'node unknown-type', radius: 0, badge: '? · неизвестный тип', notation: UNKNOWN_NOTATION, family: 'unknown' };
  return { className: `node notation-draft notation-${spec[0]}${extendedTypes.has(type) ? ' notation-extended' : ''}`, radius: spec[1], badge: spec[2], family: spec[0], notation: DRAFT_NOTATION, ...(['monitor', 'cuboid', 'component', 'interface', 'plateau', 'equipment', 'facility', 'service', 'process', 'function', 'event', 'role', 'collaboration', 'path', 'location', 'businessactor', 'systemsoftware', 'communicationnetwork', 'distributionnetwork', 'artifact', 'material', 'resource', 'capability', 'valuestream', 'courseofaction', 'workpackage'].includes(spec[3]) ? { glyph: spec[3] } : {}), ...(spec[4] ? { glyph: spec[4] } : {}), ...(spec[3] === 'banded' ? { banded: true } : {}), ...(spec[3] === 'tabbed' ? { tabbed: true } : {}), ...(['box3d', 'octagon', 'ellipse', 'folder', 'cloud', 'wavy'].includes(spec[3]) ? { contour: spec[3] } : {}) };
}
export function notationRelationship(reference, type) {
  const presentation = presentationFor(reference, 'relationship', type);
  const spec = Object.hasOwn(relationships, type) ? relationships[type] : null;
  if (!current(reference) || presentation.status !== 'KNOWN' || !spec) return { className: 'connection unknown-type', badge: '? · неизвестное отношение', startMarkerKind: null, markerKind: null, line: 'solid', notation: UNKNOWN_NOTATION };
  return { className: `connection notation-draft notation-${type.toLowerCase()}`, startMarkerKind: spec[1], markerKind: spec[2], line: spec[0], notation: DRAFT_NOTATION };
}
const svg = (document, name, attributes = {}, text) => {
  const item = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, String(value));
  if (text !== undefined) item.textContent = text;
  return item;
};
/** Shared, bounded original markers; model fields cannot supply marker URLs. */
export function notationDefs(document, scope = 'canvas') { return relationMarkerDefs(document, scope); }
export function notationLine(document, appearance, scope = 'canvas') {
  const start = relationMarkerUrl(appearance.startMarkerKind, scope), end = relationMarkerUrl(appearance.markerKind, scope);
  return svg(document, 'path', { class: 'line',
    ...(appearance.line === 'dashed' ? { 'stroke-dasharray': '7 5' } : appearance.line === 'dotted' ? { 'stroke-dasharray': '1 4', 'stroke-linecap': 'round' } : {}),
    ...(start ? { 'marker-start': start } : {}), ...(end ? { 'marker-end': end } : {}) });
}
/** Painted corner allocation shared with caption fitting; palette/legend sizes stay clamped. */
export function cornerGlyphLayout(appearance, bounds) {
  let scale, insetX, insetY, width = 18, height = 12;
  if (['systemsoftware', 'communicationnetwork', 'distributionnetwork', 'artifact', 'material', 'resource', 'capability', 'valuestream', 'courseofaction', 'workpackage'].includes(appearance.glyph)) {
    scale = Math.min(1.5, bounds.width / 60, bounds.height / 34, Math.max(.65, bounds.height / 60));
    const margin = Math.min(2.5, bounds.width * .05, bounds.height * .08), rounded = appearance.radius === 12;
    insetX = rounded ? Math.min(12, bounds.width / 2) * .45 : margin;
    insetY = rounded ? Math.min(12, bounds.height / 2) * .4 : margin;
  } else if (['role', 'collaboration', 'path', 'location', 'businessactor'].includes(appearance.glyph)) {
    scale = Math.min(1.5, bounds.width / 48, bounds.height / 28);
    insetX = insetY = Math.min(2, bounds.width * .04, bounds.height * .04); height = 9;
  } else if (['service', 'process', 'function', 'event'].includes(appearance.glyph)) {
    scale = Math.min(1.5, bounds.width / 48, bounds.height / 28);
    insetX = Math.min(12, bounds.width / 2) * .4;
    insetY = Math.min(12, bounds.height / 2) * .4; height = 7;
  } else if (['monitor', 'cuboid', 'component', 'interface', 'plateau', 'equipment', 'facility'].includes(appearance.glyph)) {
    scale = Math.min(1.4, bounds.width / 96, bounds.height / 60);
    insetX = insetY = Math.min(6, bounds.width * .05, bounds.height * .08); width = 20; height = 17;
  } else if (appearance.contour === 'octagon' && ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'principle', 'requirement'].includes(appearance.glyph)) {
    scale = Math.min(1.5, bounds.width / 48, bounds.height / 28, Math.max(.85, bounds.height / 60));
    insetX = Math.min(bounds.width / 5, bounds.height / 5, 12) + Math.min(2.5, bounds.width * .05, bounds.height * .08);
    insetY = Math.min(2.5, bounds.width * .05, bounds.height * .08);
  } else return null;
  return { x: bounds.width - insetX - width * scale, y: insetY, width: width * scale, height: height * scale, scale };
}

export function notationBox(document, appearance, bounds) {
  const corner = cornerGlyphLayout(appearance, bounds);
  const cornerTransform = corner && `translate(${corner.x} ${corner.y}) scale(${corner.scale})`;
  const box = svg(document, 'rect', { class: 'node-box', width: bounds.width, height: bounds.height, rx: appearance.radius === 12 ? 12 : appearance.radius === 8 ? 8 : 0 });
  if (['systemsoftware', 'communicationnetwork', 'distributionnetwork', 'artifact', 'material', 'resource', 'capability', 'valuestream', 'courseofaction', 'workpackage'].includes(appearance.glyph)) {
    // Original local badges; clamped corner insets contain every painted stroke, including tiny rounded boxes.
    const glyph = svg(document, 'g', { class: `${appearance.glyph}-glyph`, 'aria-hidden': 'true', 'pointer-events': 'none',
      transform: cornerTransform });
    if (appearance.glyph === 'systemsoftware') {
      // Only the exposed rear arc is drawn; a second full circle would create a false lens.
      const offset = Math.sqrt(3.5 ** 2 - (3 ** 2 + 2.5 ** 2) / 4) / Math.hypot(3, 2.5);
      glyph.append(svg(document, 'path', { class: 'node-detail', d: `M${8.5 - 2.5 * offset} ${5.25 - 3 * offset} A3.5 3.5 0 1 1 ${8.5 + 2.5 * offset} ${5.25 + 3 * offset}`, 'stroke-linejoin': 'round' }),
        svg(document, 'circle', { class: 'node-detail', cx: 7, cy: 6.5, r: 3.5 }));
    } else if (appearance.glyph === 'communicationnetwork') {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '5,2 16,2 13,8.5 2,8.5', 'stroke-linejoin': 'round' }));
      for (const [cx, cy] of [[5, 2], [16, 2], [13, 8.5], [2, 8.5]]) glyph.append(svg(document, 'circle', { class: 'node-detail node-detail-solid', cx, cy, r: 1 }));
    } else if (appearance.glyph === 'distributionnetwork') {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '1,5.5 5,2.5 13,2.5 17,5.5 13,8.5 5,8.5', 'stroke-linejoin': 'round' }));
      for (const [x1, y1, x2, y2] of [[5, 2.5, 7, 1], [5, 8.5, 7, 10], [13, 2.5, 11, 1], [13, 8.5, 11, 10]]) glyph.append(svg(document, 'line', { class: 'node-detail', x1, y1, x2, y2, 'stroke-linecap': 'round' }));
    } else if (appearance.glyph === 'artifact') {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '5,1 10,1 14,5 14,10 5,10', 'stroke-linejoin': 'round' }),
        svg(document, 'path', { class: 'node-detail', d: 'M10 1 V5 H14', 'stroke-linejoin': 'round' }));
    } else if (appearance.glyph === 'material') {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '2,5.5 5,.5 13,.5 16,5.5 13,10.5 5,10.5', 'stroke-linejoin': 'round' }));
      for (const [x1, y1, x2, y2] of [[5, 5.5, 6.5, 3], [11.5, 3, 13, 5.5], [6, 8, 12, 8]]) glyph.append(svg(document, 'line', { class: 'node-detail', x1, y1, x2, y2, 'stroke-linecap': 'butt' }));
    } else if (appearance.glyph === 'resource') {
      glyph.append(svg(document, 'rect', { class: 'node-detail', x: 2, y: 2, width: 12, height: 7, rx: 1.5 }),
        svg(document, 'path', { class: 'node-detail', d: 'M14 4 H15.5 Q17 4 17 5.5 Q17 7 15.5 7 H14', 'stroke-linejoin': 'round' }));
      for (const x of [5, 8, 11]) glyph.append(svg(document, 'line', { class: 'node-detail', x1: x, x2: x, y1: 3.8, y2: 7.2, 'stroke-linecap': 'butt' }));
    } else if (appearance.glyph === 'capability') {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '3,10 3,7 6,7 6,4 9,4 9,1 12,1 12,10', 'stroke-linejoin': 'round' }));
      for (const [x1, y1, x2, y2] of [[6, 7, 6, 10], [9, 4, 9, 10], [6, 7, 12, 7], [9, 4, 12, 4]]) glyph.append(svg(document, 'line', { class: 'node-detail', x1, y1, x2, y2, 'stroke-linecap': 'butt' }));
    } else if (appearance.glyph === 'valuestream') {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '1,1 11,1 17,5.5 11,10 1,10 7,5.5', 'stroke-linejoin': 'round' }));
    } else if (appearance.glyph === 'courseofaction') {
      // The curved filled approach ends on the outer rim, never at the target center.
      const tipX = 12 - Math.sqrt(4.5 ** 2 - .4 ** 2);
      glyph.append(svg(document, 'path', { class: 'node-detail node-detail-solid', d: `M1 10 C2.5 7.5 3.5 5.8 5.6 4.8 L4.8 3.8 L${tipX} 5.9 L6.6 8.5 L6.3 6.7 C4.7 7.1 3.8 8.7 3 10 Z`, 'stroke-linejoin': 'round' }));
      for (const r of [4.5, 2.75]) glyph.append(svg(document, 'circle', { class: 'node-detail', cx: 12, cy: 5.5, r }));
      glyph.append(svg(document, 'circle', { class: 'node-detail node-detail-solid', cx: 12, cy: 5.5, r: .35 }));
    } else {
      glyph.append(svg(document, 'path', { class: 'node-detail', d: `M${6 + 3.5 * Math.cos(Math.PI / 9)} ${4.5 + 3.5 * Math.sin(Math.PI / 9)} A3.5 3.5 0 1 0 6 8 H14`, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
        svg(document, 'polygon', { class: 'node-detail node-detail-solid', points: '13,6 17,8 13,10', 'stroke-linejoin': 'round' }));
    }
    const group = svg(document, 'g', { class: `notation-${appearance.glyph}-box` }); group.append(box, glyph); return group;
  }
  if (['role', 'collaboration', 'path', 'location', 'businessactor'].includes(appearance.glyph)) {
    // Original local badges above the full caption; square outer geometry stays unchanged.
    const glyph = svg(document, 'g', { class: `${appearance.glyph}-glyph`, 'aria-hidden': 'true', 'pointer-events': 'none',
      transform: cornerTransform });
    if (appearance.glyph === 'role') {
      // Only the front ellipse is complete; the back is the outer rounded end.
      glyph.append(svg(document, 'path', { class: 'node-detail', d: 'M14 1 H4 A2 3.5 0 0 0 4 8 H14', 'stroke-linejoin': 'round' }),
        svg(document, 'ellipse', { class: 'node-detail', cx: 14, cy: 4.5, rx: 2, ry: 3.5 }));
    } else if (appearance.glyph === 'collaboration') {
      for (const cx of [6.5, 11]) glyph.append(svg(document, 'circle', { class: 'node-detail', cx, cy: 4.5, r: 3.5 }));
    } else if (appearance.glyph === 'path') {
      for (const points of ['4,1 1,4.5 4,8', '14,1 17,4.5 14,8']) glyph.append(svg(document, 'polyline', { class: 'node-detail', points, 'stroke-linejoin': 'round' }));
      for (const x of [5.5, 10]) glyph.append(svg(document, 'line', { class: 'node-detail', x1: x, x2: x + 2.5, y1: 4.5, y2: 4.5, 'stroke-linecap': 'butt' }));
    } else if (appearance.glyph === 'location') {
      glyph.append(svg(document, 'path', { class: 'node-detail', d: 'M9 8 C7.8 6.5 6 4.9 6 3.5 A3 2.5 0 0 1 12 3.5 C12 4.9 10.2 6.5 9 8 Z', 'stroke-linejoin': 'round' }));
    } else {
      glyph.append(svg(document, 'circle', { class: 'node-detail', cx: 9, cy: 2.25, r: 1.25 }),
        svg(document, 'line', { class: 'node-detail', x1: 9, x2: 9, y1: 3.5, y2: 5.75 }),
        svg(document, 'line', { class: 'node-detail', x1: 6, x2: 12, y1: 4.5, y2: 4.5 }),
        svg(document, 'polyline', { class: 'node-detail', points: '6.5,8 9,5.75 11.5,8', 'stroke-linejoin': 'round' }));
    }
    const group = svg(document, 'g', { class: `notation-${appearance.glyph}-box` }); group.append(box, glyph); return group;
  }
  if (['service', 'process', 'function', 'event'].includes(appearance.glyph)) {
    // Original closed outlines above the full caption; uniform scaling includes round joins.
    // Inset both clamped radii to keep all ink inside the rounded corners, even at tiny sizes.
    const glyph = svg(document, 'g', { class: `${appearance.glyph}-glyph`, 'aria-hidden': 'true', 'pointer-events': 'none',
      transform: cornerTransform });
    if (appearance.glyph === 'service') glyph.append(svg(document, 'rect', { class: 'node-detail', x: 1, y: 1, width: 16, height: 5, rx: 2.5 }));
    else if (appearance.glyph === 'process') glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '1,2.25 11,2.25 11,1 17,3.5 11,6 11,4.75 1,4.75', 'stroke-linejoin': 'round' }));
    else if (appearance.glyph === 'function') glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '1,4.5 9,1 17,4.5 17,6 9,2.5 1,6', 'stroke-linejoin': 'round' }));
    else glyph.append(svg(document, 'path', { class: 'node-detail', d: 'M1 1 H14.5 A2.5 2.5 0 0 1 14.5 6 H1 L4 3.5 Z', 'stroke-linejoin': 'round' }));
    const group = svg(document, 'g', { class: `notation-${appearance.glyph}-box` }); group.append(box, glyph); return group;
  }
  if (['monitor', 'cuboid', 'component', 'interface', 'plateau', 'equipment', 'facility'].includes(appearance.glyph)) {
    // C260 boxed glyphs: original local primitives, not source artwork.
    // Uniform scale includes stroke extents at tiny/anisotropic imported sizes;
    // glyph decorations never change the enclosing rectangular hit/route contour.
    const node = appearance.glyph === 'cuboid', component = appearance.glyph === 'component', interfaceGlyph = appearance.glyph === 'interface', plateau = appearance.glyph === 'plateau', equipment = appearance.glyph === 'equipment', facility = appearance.glyph === 'facility';
    const glyph = svg(document, 'g', { class: equipment ? 'equipment-glyph' : facility ? 'facility-glyph' : plateau ? 'plateau-glyph' : interfaceGlyph ? 'interface-glyph' : component ? 'component-glyph' : node ? 'node-glyph' : 'device-glyph', 'aria-hidden': 'true', 'pointer-events': 'none',
      transform: cornerTransform });
    if (equipment) {
      // Two original toothed loops and concentric hubs; round joins bound the ink.
      for (const [cx, cy, radius, teeth] of [[7, 4.5, 3.2, 6], [12.2, 2.7, 2.3, 5]]) {
        const points = Array.from({ length: teeth * 4 }, (_, i) => {
          const angle = (i / (teeth * 4) - .25) * Math.PI * 2, r = radius * (i % 4 === 0 || i % 4 === 3 ? .73 : 1);
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        }).join(' ');
        glyph.append(svg(document, 'polygon', { class: 'node-detail', points, 'stroke-linejoin': 'round' }),
          svg(document, 'circle', { class: 'node-detail', cx, cy, r: radius * .38 }));
      }
    } else if (facility) {
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '2,8 2,1 4,1 4,5 8,3 8,5 12,3 12,5 16,3 16,8', 'stroke-linejoin': 'round' }));
    } else if (plateau) {
      // Three equal solid bars, stepped rightward toward the top, above the full caption.
      for (const [x, y] of [[6, 1], [4, 4], [2, 7]]) glyph.append(svg(document, 'line', { class: 'node-detail', x1: x, x2: x + 12, y1: y, y2: y }));
    } else if (interfaceGlyph) {
      // A left midpoint stem meets the circle without crossing it; decoration only.
      glyph.append(svg(document, 'circle', { class: 'node-detail', cx: 13, cy: 4.5, r: 3.5 }),
        svg(document, 'line', { class: 'node-detail', x1: 2, x2: 9.5, y1: 4.5, y2: 4.5 }));
    } else if (component) {
      // Interrupt the body edge at both tabs, so unfilled primitives never draw through them.
      glyph.append(svg(document, 'path', { class: 'node-detail', d: 'M6 2.5 V1 H18 V10 H6 V8.5 M6 4.5 V6.5' }),
        svg(document, 'rect', { class: 'node-detail', x: 2, y: 2.5, width: 8, height: 2 }),
        svg(document, 'rect', { class: 'node-detail', x: 2, y: 6.5, width: 8, height: 2 }));
    } else if (node) {
      const shape = box3dGeometry({ x: 2, y: 2, width: 16, height: 12 });
      const points = values => values.map(point => `${point.x},${point.y}`).join(' ');
      glyph.append(svg(document, 'polygon', { class: 'node-detail', points: points(shape.outline) }));
      for (const separator of shape.separators) glyph.append(svg(document, 'polyline', { class: 'node-detail', points: points(separator) }));
    } else glyph.append(svg(document, 'rect', { class: 'node-detail', x: 2, y: 1, width: 16, height: 10, rx: 1.5 }),
      svg(document, 'polygon', { class: 'node-detail', points: '5,13 15,13 19,16 1,16' }));
    const group = svg(document, 'g', { class: equipment ? 'notation-equipment-box' : facility ? 'notation-facility-box' : plateau ? 'notation-plateau-box' : interfaceGlyph ? 'notation-interface-box' : component ? 'notation-component-box' : node ? 'notation-node-box' : 'notation-device-box' }); group.append(box, glyph); return group;
  }
  const contour = nodeContourGeometry({ width: bounds.width, height: bounds.height }, appearance.contour);
  if (contour?.ellipse) return svg(document, 'ellipse', { class: 'node-box', ...contour.ellipse });
  if (contour?.outline) {
    const outline = svg(document, 'polygon', { class: 'node-box', points: contour.outline.map(point => `${point.x},${point.y}`).join(' ') });
    if (appearance.contour === 'octagon' && ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'principle', 'requirement'].includes(appearance.glyph)) {
      // Original local badges: inset the full cut corner and uniformly scale all painted ink.
      const glyph = svg(document, 'g', { class: `${appearance.glyph}-glyph`, 'aria-hidden': 'true', 'pointer-events': 'none',
        transform: cornerTransform });
      if (appearance.glyph === 'stakeholder') {
        glyph.append(svg(document, 'path', { class: 'node-detail', d: 'M14 1 H4 A2 4.5 0 0 0 4 10 H14', 'stroke-linejoin': 'round' }),
          svg(document, 'ellipse', { class: 'node-detail', cx: 14, cy: 5.5, rx: 2, ry: 4.5 }));
      } else if (appearance.glyph === 'driver') {
        for (const [dx, dy] of [[5, 0], [0, 5], [3.535, 3.535], [3.535, -3.535]]) glyph.append(svg(document, 'line', { class: 'node-detail motivation-spoke', x1: 9 - dx, y1: 5.5 - dy, x2: 9 + dx, y2: 5.5 + dy, 'stroke-linecap': 'round' }));
        glyph.append(svg(document, 'circle', { class: 'node-detail motivation-rim', cx: 9, cy: 5.5, r: 3.3 }),
          svg(document, 'circle', { class: 'node-detail node-detail-solid', cx: 9, cy: 5.5, r: .35 }));
      } else if (appearance.glyph === 'assessment') {
        glyph.append(svg(document, 'circle', { class: 'node-detail', cx: 11, cy: 4.5, r: 3.5 }),
          svg(document, 'line', { class: 'node-detail', x1: 5.25, y1: 10.25, x2: 11 - 3.5 / Math.SQRT2, y2: 4.5 + 3.5 / Math.SQRT2, 'stroke-linecap': 'round' }));
      } else if (appearance.glyph === 'goal') {
        for (const r of [4.5, 2.75]) glyph.append(svg(document, 'circle', { class: 'node-detail', cx: 9, cy: 5.5, r }));
        glyph.append(svg(document, 'circle', { class: 'node-detail node-detail-solid', cx: 9, cy: 5.5, r: .5 }));
      } else if (appearance.glyph === 'outcome') {
        // Complete open rings first; the filled incoming head deliberately covers their upper-right arcs.
        for (const r of [4.5, 2.9, 1.3]) glyph.append(svg(document, 'circle', { class: 'node-detail', cx: 6.5, cy: 6, r }));
        glyph.append(svg(document, 'path', { class: 'node-detail', d: 'M8.9 3.6 L12 .5 M10.8 .5 V1.7 H12', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
          svg(document, 'polygon', { class: 'node-detail node-detail-solid', points: '6.5,6 7.7,2.4 10.1,4.8', 'stroke-linejoin': 'round' }));
      } else if (appearance.glyph === 'principle') {
        glyph.append(svg(document, 'rect', { class: 'node-detail', x: 3, y: .5, width: 12, height: 10, rx: 2.5 }),
          svg(document, 'rect', { class: 'node-detail node-detail-solid', x: 8.5, y: 2.25, width: 1, height: 3.25, rx: .4 }),
          svg(document, 'circle', { class: 'node-detail node-detail-solid', cx: 9, cy: 8, r: .4 }));
      } else glyph.append(svg(document, 'polygon', { class: 'node-detail', points: '5,1 17,1 13,10 1,10', 'stroke-linejoin': 'round' }));
      const group = svg(document, 'g', { class: `notation-${appearance.glyph}-box` }); group.append(outline, glyph); return group;
    }
    if (appearance.contour === 'cloud') {
      const group = svg(document, 'g', { class: 'notation-meaning' });
      group.append(outline);
      // Transparent original satellites preserve route interiors; only the cloud is a hit contour.
      // Compact previews need taller, stronger rings; the original canvas placement resumes at height 55.
      const compact = Math.min(1, Math.max(0, (55 - bounds.height) / 27));
      for (const [cx, cy, rx, ry] of [[.1 - .063 * compact, .94 - .16 * compact, .035 - .005 * compact, .035 + .02 * compact], [.025 + .005 * compact, .975 - .029 * compact, .018 + .005 * compact, .018 + .022 * compact]]) {
        const bubble = svg(document, 'ellipse', {
        class: 'node-detail meaning-bubble', cx: bounds.width * cx, cy: bounds.height * cy, rx: bounds.width * rx, ry: bounds.height * ry,
        'pointer-events': 'none', 'aria-hidden': 'true',
        });
        bubble.style.strokeWidth = String(Math.min(.8, (.012 + .013 * compact) * Math.min(bounds.width, bounds.height), .013 * bounds.width));
        group.append(bubble);
      }
      return group;
    }
    if (appearance.contour !== 'folder') return outline;
    // C260 Grouping: retain the local folder contour and add only dashed notation.
    // The tab divider is decoration, never an additional hit or route contour.
    outline.setAttribute('stroke-dasharray', '7 5');
    const group = svg(document, 'g', { class: 'notation-grouping' });
    group.append(outline, svg(document, 'line', { class: 'node-detail grouping-divider',
      x1: 0, x2: bounds.width * .4, y1: bounds.height * .2, y2: bounds.height * .2,
      'stroke-dasharray': '7 5', 'pointer-events': 'none', 'aria-hidden': 'true' }));
    return group;
  }
  if (appearance.contour === 'box3d') {
    const shape = box3dGeometry({ width: bounds.width, height: bounds.height });
    const points = values => values.map(point => `${point.x},${point.y}`).join(' ');
    const group = svg(document, 'g', { class: 'notation-box3d' });
    group.append(svg(document, 'polygon', { class: 'node-box', points: points(shape.outline) }));
    for (const separator of shape.separators) group.append(svg(document, 'polyline', { class: 'node-detail', points: points(separator) }));
    return group;
  }
  if (appearance.tabbed === true) {
    const group = svg(document, 'g', { class: 'notation-tabbed-box' }), y = Math.min(bounds.height / 5, 12), x = bounds.width * .45;
    // Local internal tab: the outer silhouette remains a rectangle.
    group.append(box, svg(document, 'polyline', { class: 'node-tab', points: `0,${y} ${x},${y} ${x},0` }));
    return group;
  }
  if (appearance.banded !== true) return box;
  // Original local top-band geometry; only the outer rectangle is a contour.
  // Shared by canvas/palette/legend. No source SVG, paths or badges are copied.
  const group = svg(document, 'g', { class: 'notation-banded-box' }), bandY = Math.min(bounds.height / 5, 12);
  group.append(box, svg(document, 'line', { class: 'node-band', x1: 0, x2: bounds.width, y1: bandY, y2: bandY }));
  return group;
}

/** Shared adapter functions power both the canvas and the labelled legend. */
export function renderNotationLegend(document, ref = CURRENT_METAMODEL) {
  const host = document.getElementById('notation-legend-items');
  const visibleElements = NOTATION_ELEMENTS.filter(type => presentationFor(ref, 'element', type).status === 'KNOWN');
  const visibleRelationships = NOTATION_RELATIONSHIPS.filter(type => presentationFor(ref, 'relationship', type).status === 'KNOWN');
  const relationshipY = Math.ceil(visibleElements.length / 2) * 35 + 25;
  const junctionTypes = current(ref) ? ['AndJunction', 'OrJunction'] : [];
  const height = Math.max(48, relationshipY + visibleRelationships.length * 33 + 10 + junctionTypes.length * 32);
  const sample = svg(document, 'svg', { viewBox: `0 0 360 ${height}`, role: 'img', 'aria-label': `Легенда: ${visibleElements.length} типов элементов и ${visibleRelationships.length} отношений текущего профиля. Подписи типов различают одинаковые контуры.` });
  sample.append(notationDefs(document, 'legend'));
  if (!visibleElements.length && !visibleRelationships.length) sample.append(svg(document, 'text', { class: 'empty-canvas-note', x: 8, y: 25 }, 'Неизвестный профиль: типовые обозначения недоступны'));
  visibleElements.forEach((type, index) => {
    const appearance = notationElement(ref, type);
    const group = svg(document, 'g', { class: appearance.className, transform: `translate(${index % 2 * 180 + 5} ${Math.floor(index / 2) * 35 + 5})`, 'data-legend-type': type });
    group.append(notationBox(document, appearance, { width: 169, height: 28 }), svg(document, 'text', { class: 'node-type legend-type', x: ['octagon', 'ellipse', 'folder', 'cloud', 'wavy'].includes(appearance.contour) ? 84.5 : 8, y: 18, ...(['octagon', 'ellipse', 'folder', 'cloud', 'wavy'].includes(appearance.contour) ? { 'text-anchor': 'middle' } : {}) }, appearance.badge)); sample.append(group);
  });
  visibleRelationships.forEach((type, index) => {
    const appearance = notationRelationship(ref, type);
    const group = svg(document, 'g', { class: appearance.className, 'data-legend-type': type });
    const path = notationLine(document, appearance, 'legend'); path.setAttribute('d', `M 10 ${relationshipY + index * 33} L 105 ${relationshipY + index * 33}`);
    group.append(path, svg(document, 'text', { x: 124, y: relationshipY + 4 + index * 33 }, type)); sample.append(group);
  });
  junctionTypes.forEach((type, index) => {
    const appearance = notationJunction(ref, type), y = relationshipY + visibleRelationships.length * 33 + 5 + index * 32;
    const group = svg(document, 'g', { class: appearance.className.replace('node ', 'junction-legend '), 'data-legend-type': type });
    group.append(svg(document, 'circle', { class: 'node-box', cx: 30, cy: y, r: 9 }), svg(document, 'text', { x: 60, y: y + 4 }, type)); sample.append(group);
  });
  host.replaceChildren(sample);
}

/** Creation previews use the same closed adapter, including Association without an arrow. */
export function createNotationPaletteGlyph(document, type, ref = CURRENT_METAMODEL, scope = `palette-${type.toLowerCase()}`) {
  const sample = svg(document, 'svg', { viewBox: '0 0 44 28', 'aria-hidden': 'true', focusable: 'false' });
  const element = NOTATION_ELEMENTS.includes(type), junction = ['AndJunction', 'OrJunction'].includes(type);
  const appearance = junction ? notationJunction(ref, type) : element ? notationElement(ref, type) : notationRelationship(ref, type);
  const group = svg(document, 'g', { class: appearance.className });
  if (junction) group.append(svg(document, 'circle', { class: 'node-box', cx: 22, cy: 14, r: 9 }));
  else if (element) { group.setAttribute('transform', 'translate(3 4)'); group.append(notationBox(document, appearance, { width: 38, height: 20 })); }
  else { sample.append(notationDefs(document, scope)); const path = notationLine(document, appearance, scope); path.setAttribute('d', 'M 3 14 L 35 14'); group.append(path); }
  sample.append(group); return sample;
}
export function renderNotationPalette(document, ref = CURRENT_METAMODEL) {
  for (const type of [...NOTATION_ELEMENTS, ...NOTATION_RELATIONSHIPS, 'AndJunction', 'OrJunction']) {
    const host = document.querySelector(`#create-${type.toLowerCase()} .palette-glyph`);
    if (host) host.replaceChildren(createNotationPaletteGlyph(document, type, ref));
  }
}

/** Session-only preference: deliberately has no store, command or storage access. */
export function installNotationUI({ document, renderCanvas, blocked, report, readReference = () => (CURRENT_METAMODEL), readViews = () => [] }) {
  const hasSavedGeometry = () => readViews().some(view => [...view.connections, ...view.visualConnectors].some(line => line.routePoints.length || line.labelPosition !== null));
  let storedGeometry = hasSavedGeometry();
  const controls = document.getElementById('notation-controls');
  const stored = document.getElementById('stored-geometry');
  function refresh() {
    stored.checked = storedGeometry;
    const reference = readReference();
    renderNotationLegend(document, reference); renderNotationPalette(document, reference);
  }
  function stop(event) {
    if (!controls.contains(event.target) || !blocked()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // Checkbox click activation toggles before listeners run; cancelling that
    // click restores the prior checked state. Do not invert its rollback by
    // assigning checked here. Change/pointer/keyboard guards do restore it.
    if (event.type !== 'click') stored.checked = storedGeometry;
    report('Сначала завершите или отмените ввод / перетаскивание. Показ сохранённой геометрии не изменён.');
  }
  // Capture precedes app-level blur/cancel handling, so a click on these controls
  // cannot discard an inline draft or an in-flight pointer gesture.
  document.addEventListener('pointerdown', stop, true);
  document.addEventListener('mousedown', stop, true);
  stored.addEventListener('keydown', stop, true);
  stored.addEventListener('focus', event => {
    if (!blocked()) return;
    // Restore an inline editor before its queued focusout cancellation runs.
    stop(event); document.querySelector('.inline-editor input')?.focus();
  });
  stored.addEventListener('click', stop, true);
  stored.addEventListener('change', event => {
    if (blocked()) { stop(event); return; }
    if (stored.checked === storedGeometry) return;
    storedGeometry = stored.checked; renderCanvas();
    report(storedGeometry ? 'Сохранённая геометрия: локальная интерпретация v2. Файл и история не изменены.'
      : 'Автоматические изгибы; закреплённые якоря остаются видимыми. Файл и история не изменены.');
  });
  refresh();
  return { get storedGeometry() { return storedGeometry; },
    resetStoredGeometry() { storedGeometry = hasSavedGeometry(); stored.checked = storedGeometry; }, refresh };
}
