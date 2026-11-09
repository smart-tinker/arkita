import { LIMITS, assertJSON, fail, record, safeKey, text } from './json.js';
import { CURRENT_CATALOG } from './current-catalog.js';

export const CUSTOMIZATION_BASIC_TYPES = Object.freeze(['String', 'Integer', 'Real', 'Boolean', 'Currency', 'Date', 'URL']);
const basics = new Set(CUSTOMIZATION_BASIC_TYPES);
const targetTypes = { element: CURRENT_CATALOG.elementTypes, junction: CURRENT_CATALOG.junctionTypes, relationship: CURRENT_CATALOG.relationshipTypes };
function name(value) {
  text(value);
  if (!value.trim()) fail('SCHEMA', 'Profile and attribute names must not be blank');
}
function fields(value, minimum = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCHEMA', 'Expected a named field record');
  const entries = Object.entries(value);
  if (entries.length < minimum) fail('SCHEMA', 'Structure requires at least one field');
  if (entries.length > LIMITS.properties) fail('LIMIT', 'At most 64 attributes or Structure fields are supported');
  for (const [key] of entries) { name(key); safeKey(key); }
  return entries;
}
function typeDefinition(type, listItem = false) {
  if (basics.has(type)) return;
  if (type?.kind === 'Structure') {
    record(type, ['kind', 'fields']);
    for (const [, value] of fields(type.fields, 1)) if (!basics.has(value)) fail('TYPE', 'Structure fields support basic types only');
  } else if (type?.kind === 'List' && !listItem) {
    record(type, ['kind', 'itemType']); typeDefinition(type.itemType, true);
  } else fail('TYPE', 'Unsupported customization type; use a basic type, Structure, or List of basic/Structure');
}
function validDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function typedValue(type, value) {
  const invalid = () => fail('TYPE', `Invalid ${typeof type === 'string' ? type : type.kind} customization value`);
  switch (type) {
    case 'String': text(value); return;
    case 'Integer': if (!Number.isSafeInteger(value) || Object.is(value, -0)) invalid(); return;
    case 'Real': if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) invalid(); return;
    case 'Boolean': if (typeof value !== 'boolean') invalid(); return;
    case 'Currency':
      record(value, ['amount', 'currency']); text(value.amount);
      if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value.amount) || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) invalid();
      return;
    case 'Date': if (!validDate(value)) invalid(); return;
    case 'URL':
      text(value);
      if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || /[\x00-\x20\x7f]/.test(value)) invalid();
      try { new URL(value); } catch { invalid(); }
      return;
    default:
      if (type.kind === 'Structure') {
        record(value, Object.keys(type.fields));
        for (const [key, fieldType] of Object.entries(type.fields)) typedValue(fieldType, value[key]);
      } else {
        if (!Array.isArray(value)) invalid();
        for (const item of value) typedValue(type.itemType, item);
      }
  }
}
export function validateCustomizationProfile(definition, version = 4) {
  record(definition, ['id', 'name', 'purpose', 'targets', 'attributes'], version === 4 ? ['imageAssetId'] : []);
  if (Object.hasOwn(definition, 'imageAssetId') && (definition.purpose !== 'specialization' || typeof definition.imageAssetId !== 'string')) fail('SCHEMA', 'Only a specialization may have an embedded image');
  name(definition.name);
  if (!['attributes', 'specialization'].includes(definition.purpose)) fail('SCHEMA', 'Purpose must be attributes or specialization');
  if (!Array.isArray(definition.targets) || !definition.targets.length) fail('SCHEMA', 'A profile needs at least one concrete target');
  const targets = new Set();
  for (const target of definition.targets) {
    record(target, ['kind', 'type']);
    if (!Object.hasOwn(targetTypes, target.kind) || !targetTypes[target.kind].includes(target.type)) fail('TYPE', 'Profile target must be an existing concrete concept type');
    const key = `${target.kind}:${target.type}`;
    if (targets.has(key)) fail('SCHEMA', 'Duplicate profile target');
    targets.add(key);
  }
  for (const [key, attribute] of fields(definition.attributes)) {
    record(attribute, ['type'], ['default']); typeDefinition(attribute.type);
    if (Object.hasOwn(attribute, 'default')) {
      try { typedValue(attribute.type, attribute.default); }
      catch (error) { fail(error.code, `${key} default: ${error.message}`); }
    }
  }
}
export function profileAppliesTo(definition, kind, type) {
  assertJSON(definition);
  return matchesTarget(definition, kind, type);
}
function matchesTarget(definition, kind, type) {
  return definition.targets.some(target => target.kind === kind && target.type === type);
}
export function validateProfileApplications(concept, kind, definitions) {
  if (!Object.hasOwn(concept, 'profileApplications')) return;
  const applications = concept.profileApplications;
  if (!Array.isArray(applications) || !applications.length) fail('SCHEMA', 'Omit empty profileApplications');
  const seen = new Set();
  for (const application of applications) {
    record(application, ['profileId', 'values']);
    const definition = definitions.get(application.profileId);
    if (!definition) fail('REFERENCE', 'Customization profile does not exist');
    if (seen.has(application.profileId)) fail('SCHEMA', 'A concept cannot apply one profile twice');
    seen.add(application.profileId);
    if (!matchesTarget(definition, kind, concept.type)) fail('TYPE', 'Customization profile does not target this concept type');
    record(application.values, [], Object.keys(definition.attributes));
    for (const [key, value] of Object.entries(application.values)) {
      try { typedValue(definition.attributes[key].type, value); }
      catch (error) { fail(error.code, `${key} override: ${error.message}`); }
    }
  }
}

/** Presence, never truthiness. Detached compound values cannot mutate model data. */
export function resolveProfileValue(definition, application, attributeName) {
  assertJSON(definition); assertJSON(application);
  if (typeof attributeName !== 'string') fail('SCHEMA', 'Attribute name must be a string');
  if (!Object.hasOwn(definition.attributes, attributeName)) fail('REFERENCE', 'Customization attribute does not exist');
  if (application?.profileId !== definition.id) fail('REFERENCE', 'Application does not match this profile');
  const attribute = definition.attributes[attributeName];
  if (Object.hasOwn(application.values, attributeName)) return { origin: 'override', value: structuredClone(application.values[attributeName]) };
  if (Object.hasOwn(attribute, 'default')) return { origin: 'default', value: structuredClone(attribute.default) };
  return { origin: 'unset' };
}
const definitionIndex = state => new Map((state.customizationProfiles ?? []).map(item => [item.id, item]));
function labelFromDefinitions(definitions, concept) {
  const names = (concept.profileApplications ?? []).map(item => definitions.get(item.profileId))
    .filter(item => item?.purpose === 'specialization').map(item => item.name);
  return names.length ? `«${names.join(', ')}»` : '';
}
/** Input records come from validateProject; reject executable/non-JSON direct inputs. */
export function specializationLabel(state, concept) {
  assertJSON(state); assertJSON(concept);
  return labelFromDefinitions(definitionIndex(state), concept);
}
/** One detached snapshot index for canvas labels, Fit, and manager usage lists. */
export function createCustomizationResolver(state) {
  assertJSON(state);
  const definitions = definitionIndex(state), labels = new Map(), usages = new Map();
  for (const [kind, items] of [['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships]]) for (const concept of items) {
    const label = labelFromDefinitions(definitions, concept);
    if (label) labels.set(concept.id, label);
    for (const application of concept.profileApplications ?? []) {
      if (!usages.has(application.profileId)) usages.set(application.profileId, []);
      usages.get(application.profileId).push(Object.freeze({ kind, id: concept.id }));
    }
  }
  for (const refs of usages.values()) Object.freeze(refs);
  const empty = Object.freeze([]);
  return Object.freeze({
    labelFor(conceptId) {
      if (typeof conceptId !== 'string') fail('SCHEMA', 'Concept ID must be a string');
      return labels.get(conceptId) ?? '';
    },
    usagesFor(profileId) {
      if (typeof profileId !== 'string') fail('SCHEMA', 'Profile ID must be a string');
      return usages.get(profileId) ?? empty;
    },
  });
}
export function customizationProfileUsages(state, profileId) {
  assertJSON(state);
  return [['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships]]
    .flatMap(([kind, items]) => items.filter(item => item.profileApplications?.some(application => application.profileId === profileId))
      .map(item => ({ kind, id: item.id })));
}

/** Local authoring policy, not an ArchiMate rule; legacy/imported duplicates remain readable. */
export function specializationNameConflicts(state, definition, exceptId = null) {
  assertJSON(state); assertJSON(definition); if (exceptId !== null && typeof exceptId !== 'string') fail('REFERENCE','Expected a profile ID or null');
  if (definition.purpose !== 'specialization' || typeof definition.name !== 'string' || !Array.isArray(definition.targets)) return [];
  const normalized = value => value.trim().normalize('NFC').toLowerCase(), targets = new Set(definition.targets.map(target => `${target.kind}:${target.type}`));
  return (state.customizationProfiles ?? []).filter(item => item.id !== exceptId && item.purpose === 'specialization' && normalized(item.name) === normalized(definition.name) && item.targets.some(target => targets.has(`${target.kind}:${target.type}`))).map(item => item.id).sort();
}
