import { SchemkaError, validateProject } from '../../schemka-model-core/src/index.js';

/** Below Mermaid's ordinary 50,000-character / 500-edge defaults. ASCII output. */
export const MERMAID_LIMITS = Object.freeze({ occurrences: 256, connections: 256, outputBytes: 48000 });
const DIRECTIONS = new Set(['LR', 'RL', 'TB', 'BT']);
const SUBSTITUTIONS = new Map([
  ['<', 0xff1c], ['>', 0xff1e], ['&', 0xff06], ['`', 0xff40], ['$', 0xff04], [':', 0xff1a],
]);
const fail = (code, message) => { throw new SchemkaError(code, message); };
const nodeId = (occurrenceId) => `n_${occurrenceId.slice(4).replaceAll('-', '')}`;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const multiplicityFields = ['sourceMultiplicity', 'targetMultiplicity'];

function multiplicityAnnotation(relationship) {
  const values = multiplicityFields.filter(field => Object.hasOwn(relationship, field))
    .map(field => `${field === 'sourceMultiplicity' ? 'source' : 'target'} multiplicity=${JSON.stringify(relationship[field])}`);
  return values.length ? ` [${values.join('; ')}]` : '';
}

function readDirection(options) {
  if (!options || typeof options !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
    fail('MERMAID_OPTION', 'Expected a plain Mermaid options record');
  }
  const keys = Reflect.ownKeys(options);
  if (keys.some((key) => key !== 'direction')) fail('MERMAID_OPTION', 'Only the direction option is supported');
  if (!keys.length) return 'LR';
  const property = Object.getOwnPropertyDescriptor(options, 'direction');
  if (!property.enumerable || !Object.hasOwn(property, 'value') || !DIRECTIONS.has(property.value)) {
    fail('MERMAID_OPTION', 'Direction must be LR, RL, TB or BT');
  }
  return property.value;
}

/**
 * One-way, deterministic view projection. Never reads/writes storage or renders.
 * See MERMAID.md for intentional label substitutions and information loss.
 */
export function exportMermaid(state, viewId, options = {}) {
  validateProject(state);
  const direction = readDirection(options);
  const entry = state.views.find((item) => item.view.id === viewId);
  if (!entry) fail('MERMAID_VIEW', 'Selected view does not exist');
  if (entry.visualNodes.length || entry.visualConnectors.length || entry.occurrences.some(item => item.parent || Object.keys(item.style).length) || entry.connections.some(item => item.hidden || Object.keys(item.style).length)) fail('MERMAID_UNSUPPORTED', 'Visual records, styles and geometric nesting need native Arkita files; this Mermaid projection would omit them.');
  if (entry.view.viewpointId) fail('MERMAID_UNSUPPORTED', 'Governed viewpoints need native Schemka files. Save the full native project to preserve its definition, binding and hidden drawings; Mermaid export is unavailable for this view.');
  if (entry.occurrences.length > MERMAID_LIMITS.occurrences || entry.connections.length > MERMAID_LIMITS.connections) {
    fail('MERMAID_LIMIT', 'Selected view exceeds the Mermaid occurrence or connection limit');
  }

  // Native v2 retains these concepts exactly; this projection cannot encode them.
  if (entry.occurrences.some(item => item.concept.kind !== 'element') ||
      entry.connections.some(item => item.source.kind !== 'occurrence' || item.target.kind !== 'occurrence')) {
    fail('MERMAID_UNSUPPORTED', 'Junctions and relationship endpoints need native Schemka files; this Mermaid projection cannot represent them');
  }
  const elements = new Map(state.elements.map((item) => [item.id, item]));
  const relationships = new Map(state.relationships.map((item) => [item.id, item]));
  if (entry.occurrences.some(item => elements.get(item.concept.id).profileApplications) ||
      entry.connections.some(item => relationships.get(item.relationshipId).profileApplications)) {
    fail('MERMAID_UNSUPPORTED', 'Customization applications need native Schemka files; this Mermaid projection cannot preserve them');
  }
  const chunks = [];
  let size = 0;
  function append(value) {
    if (size + value.length > MERMAID_LIMITS.outputBytes) fail('MERMAID_LIMIT', 'Mermaid output exceeds 48,000 ASCII bytes');
    chunks.push(value);
    size += value.length;
  }
  function label(value) {
    for (let index = 0; index < value.length; index++) {
      const char = String.fromCodePoint(value.codePointAt(index));
      let code = char.codePointAt(0);
      if (char.length === 2) index++;
      if (code === 13 && value.charCodeAt(index + 1) === 10) index++;
      if (code === 9 || code === 10 || code === 13 || code === 0x85 || code === 0x2028 || code === 0x2029) code = 32;
      else if (code < 32 || (code >= 0x7f && code <= 0x9f) ||
               (code >= 0xd800 && code <= 0xdfff) || (code >= 0xfdd0 && code <= 0xfdef) ||
               (code & 0xffff) >= 0xfffe || code === 0x061c || code === 0x200e || code === 0x200f ||
               (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x206f)) code = 0xfffd;
      else code = SUBSTITUTIONS.get(char) ?? code;
      // No raw Unicode, quotes, entities, comment/directive delimiters, HTML,
      // backticks or whitespace. Decimal entities are Mermaid's documented
      // escaping syntax, not JavaScript backslash escapes or HTML entities.
      append((code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
             (code >= 48 && code <= 57) || code === 45 || code === 46 || code === 95
        ? String.fromCodePoint(code) : `#${code};`);
    }
  }

  append(`flowchart ${direction}\n`);
  append('%% relationship semantics UNKNOWN; not normative notation\n');
  if (entry.connections.some(connection => multiplicityFields.some(field => Object.hasOwn(relationships.get(connection.relationshipId), field)))) {
    append('%% multiplicities are text annotations only; use native Schemka for exact data\n');
  }
  for (const occurrence of [...entry.occurrences].sort(byId)) {
    append(`  ${nodeId(occurrence.id)}["`);
    const element = elements.get(occurrence.concept.id);
    label(`${element.type}: ${element.name}`);
    append('"]\n');
  }
  for (const connection of [...entry.connections].sort(byId)) {
    append(`  ${nodeId(connection.source.id)} -->`);
    const relationship = relationships.get(connection.relationshipId);
    const text = `${relationship.type}: ${relationship.label}` + multiplicityAnnotation(relationship);
    append('|"'); label(text); append('"|');
    append(` ${nodeId(connection.target.id)}\n`);
  }
  return chunks.join('');
}
