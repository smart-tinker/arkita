/** Pure, dependency-free catalog parsing and read helpers. No storage or network. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_COLLECTION_ITEMS = 2000;
const CORE = ['directions', 'services', 'offers', 'requests', 'systems'];
const EXTRA = ['handoffs', 'view_links', 'evidence', 'capabilities'];
const COLLECTIONS = [...CORE, ...EXTRA];
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class CatalogValidationError extends Error {
  constructor(message) { super(message); this.name = 'CatalogValidationError'; }
}
const fail = (path, message) => { throw new CatalogValidationError(`${path}: ${message}`); };
const object = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected an object');
};
const text = (value, path, required = false) => {
  if (typeof value !== 'string' || (required && !value.trim())) fail(path, 'expected a non-empty string');
};
const optionalText = (record, key, path) => { if (record[key] !== undefined && record[key] !== null) text(record[key], `${path}.${key}`); };
const strings = (value, path) => {
  if (!Array.isArray(value)) fail(path, 'expected an array of strings');
  value.forEach((item, index) => text(item, `${path}[${index}]`, true));
  if (new Set(value).size !== value.length) fail(path, 'duplicate values');
};
function safeTree(value, path = 'catalog', depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 100000) fail(path, 'too many values');
  if (depth > 16) fail(path, 'nesting is too deep');
  if (typeof value === 'string' && value.length > 20000) fail(path, 'string is too long');
  if (typeof value === 'number' && !Number.isFinite(value)) fail(path, 'number must be finite');
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') fail(path, 'unsupported value');
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION_ITEMS) fail(path, 'too many array items');
      value.forEach((item, i) => safeTree(item, `${path}[${i}]`, depth + 1, budget));
    } else {
      object(value, path);
      for (const [key, child] of Object.entries(value)) {
        if (BLOCKED_KEYS.has(key)) fail(path, 'unsafe object key');
        if (key.length > 200) fail(path, 'object key is too long');
        safeTree(child, `${path}.${key}`, depth + 1, budget);
      }
    }
  }
}

/** Validate without stripping fields; unknown bounded data survives export. */
export function validateCatalog(data) {
  object(data, 'catalog');
  safeTree(data);
  text(data.schema_version, 'catalog.schema_version', true);
  if (data.schema_version !== '0.1.0') fail('catalog.schema_version', 'unsupported schema version (expected 0.1.0)');
  for (const key of ['catalog_id', 'status']) text(data[key], `catalog.${key}`, true);
  for (const key of ['prepared_at', 'source_revision', 'scope', 'publication']) optionalText(data, key, 'catalog');
  const maps = Object.create(null);
  for (const key of COLLECTIONS) {
    if (!CORE.includes(key) && data[key] === undefined) { maps[key] = new Map(); continue; }
    if (!Array.isArray(data[key])) fail(`catalog.${key}`, 'expected an array');
    maps[key] = new Map();
    data[key].forEach((record, i) => {
      const p = `${key}[${i}]`; object(record, p); text(record.id, `${p}.id`, true);
      if (record.id.length > 160) fail(`${p}.id`, 'identifier is too long');
      if (maps[key].has(record.id)) fail(`${p}.id`, 'duplicate identifier');
      maps[key].set(record.id, record);
      if (CORE.includes(key)) text(record.name, `${p}.name`, true);
    });
  }
  const ref = (kind, id, path) => {
    text(id, path, true);
    if (!maps[kind]?.has(id)) fail(path, `unknown ${kind} reference`);
    return maps[kind].get(id);
  };
  const refs = (record, key, kind, path, optional = false) => {
    if (optional && record[key] === undefined) return;
    strings(record[key], `${path}.${key}`);
    record[key].forEach((id, i) => ref(kind, id, `${path}.${key}[${i}]`));
  };
  const bools = (record, keys, path) => { for (const key of keys) if (record[key] !== undefined && typeof record[key] !== 'boolean') fail(`${path}.${key}`, 'expected a boolean'); };
  for (const [i, service] of data.services.entries()) {
    const p = `services[${i}]`;
    ref('directions', service.direction_id, `${p}.direction_id`);
    refs(service, 'offer_ids', 'offers', p);
    refs(service, 'system_ids', 'systems', p);
    refs(service, 'evidence_ids', 'evidence', p, true);
    for (const key of ['scope', 'audience', 'value', 'availability_of_work', 'current_health', 'structure_status']) optionalText(service, key, p);
    for (const key of ['included', 'excluded', 'search_terms']) if (service[key] !== undefined) strings(service[key], `${p}.${key}`);
    if (service.support !== undefined) {
      object(service.support, `${p}.support`);
      for (const key of ['entry', 'mode']) optionalText(service.support, key, `${p}.support`);
      if (service.support.participants !== undefined) {
        if (!Array.isArray(service.support.participants)) fail(`${p}.support.participants`, 'expected an array');
        service.support.participants.forEach((person, j) => {
          const q = `${p}.support.participants[${j}]`; object(person, q);
          for (const key of ['agent', 'role', 'scope', 'assignment_status']) optionalText(person, key, q);
          refs(person, 'evidence_ids', 'evidence', q, true);
        });
      }
    }
    if (service.knowledge !== undefined) {
      object(service.knowledge, `${p}.knowledge`);
      for (const key of ['instruction_ref', 'runbook_ref']) optionalText(service.knowledge, key, `${p}.knowledge`);
      if (service.knowledge.known_limits !== undefined) strings(service.knowledge.known_limits, `${p}.knowledge.known_limits`);
    }
    for (const id of service.offer_ids) if (maps.offers.get(id).service_id !== service.id) fail(`${p}.offer_ids`, 'offer belongs to another service');
  }
  for (const [i, offer] of data.offers.entries()) {
    const p = `offers[${i}]`; const service = ref('services', offer.service_id, `${p}.service_id`);
    if (!service.offer_ids.includes(offer.id)) fail(`${p}.service_id`, 'service must list this offer');
    refs(offer, 'request_ids', 'requests', p);
    for (const key of ['scope', 'result']) optionalText(offer, key, p);
    bools(offer, ['historical_only', 'automatic_fulfilment'], p);
    if (offer.request_types !== undefined) strings(offer.request_types, `${p}.request_types`);
    for (const id of offer.request_ids) if (maps.requests.get(id).offer_id !== offer.id) fail(`${p}.request_ids`, 'request belongs to another offer');
  }
  for (const [i, request] of data.requests.entries()) {
    const p = `requests[${i}]`; ref('services', request.service_id, `${p}.service_id`);
    const offer = ref('offers', request.offer_id, `${p}.offer_id`);
    if (offer.service_id !== request.service_id) fail(p, 'service/offer ownership mismatch');
    if (!offer.request_ids.includes(request.id)) fail(`${p}.offer_id`, 'offer must list this request');
    for (const key of ['type', 'scope']) optionalText(request, key, p);
    bools(request, ['type_is_suggestion'], p);
    for (const key of ['allowed_types', 'required_inputs', 'completion_criteria']) if (request[key] !== undefined) strings(request[key], `${p}.${key}`);
    if (request.handling !== undefined) {
      object(request.handling, `${p}.handling`); optionalText(request.handling, 'entry', `${p}.handling`);
      bools(request.handling, ['dispatch', 'changes_authorized_by_selection'], `${p}.handling`);
    }
  }
  for (const [i, system] of data.systems.entries()) for (const key of ['kind', 'fact_status', 'current_health', 'note']) optionalText(system, key, `systems[${i}]`);
  const typeMap = { service: 'services', offer: 'offers', request: 'requests', system: 'systems', direction: 'directions', capability: 'capabilities' };
  for (const [i, link] of (data.view_links ?? []).entries()) {
    const p = `view_links[${i}]`;
    for (const key of ['from', 'to']) {
      object(link[key], `${p}.${key}`);
      if (!Object.hasOwn(typeMap, link[key].type)) fail(`${p}.${key}.type`, 'unsupported reference type');
      ref(typeMap[link[key].type], link[key].id, `${p}.${key}.id`);
    }
    for (const key of ['relation', 'assertion_status', 'architecture_element_id', 'binding_status']) optionalText(link, key, p);
  }
  for (const [i, evidence] of (data.evidence ?? []).entries()) {
    const p = `evidence[${i}]`;
    for (const key of ['label', 'verification', 'source_date', 'reviewed_at', 'kind', 'source_url', 'limitation']) optionalText(evidence, key, p);
    bools(evidence, ['public_summary_only'], p);
  }
  for (const [i, handoff] of (data.handoffs ?? []).entries()) {
    const p = `handoffs[${i}]`;
    for (const key of ['label', 'destination', 'scope', 'kind', 'url']) optionalText(handoff, key, p);
    bools(handoff, ['automatic_transfer'], p);
  }
  for (const [i, capability] of (data.capabilities ?? []).entries()) for (const key of ['status', 'purpose']) optionalText(capability, key, `capabilities[${i}]`);
  return data;
}

export function parseCatalog(source) {
  if (typeof source !== 'string') fail('file', 'expected JSON text');
  if (new TextEncoder().encode(source).byteLength > MAX_FILE_BYTES) fail('file', 'maximum size is 2 MiB');
  let data;
  try { data = JSON.parse(source.replace(/^\uFEFF/, '')); } catch { fail('file', 'invalid JSON'); }
  return validateCatalog(data);
}
export function serializeCatalog(data) { return `${JSON.stringify(validateCatalog(data), null, 2)}\n`; }
export function filterServices(data, query = '', directionId = '') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return data.services.filter(service => {
    if (directionId && service.direction_id !== directionId) return false;
    const offers = data.offers.filter(offer => offer.service_id === service.id);
    const requests = data.requests.filter(request => request.service_id === service.id);
    const haystack = [service.name, service.value, service.scope, ...(service.search_terms ?? []), ...offers.map(item => item.name), ...requests.map(item => item.name)].join(' ').toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  });
}
export function getServiceDetails(data, id) {
  const service = data.services.find(item => item.id === id);
  if (!service) return null;
  return {
    service,
    offers: data.offers.filter(item => item.service_id === id).map(offer => ({ ...offer, requests: data.requests.filter(item => item.offer_id === offer.id) })),
    systems: data.systems.filter(item => service.system_ids.includes(item.id)),
    evidence: (data.evidence ?? []).filter(item => (service.evidence_ids ?? []).includes(item.id)),
    links: (data.view_links ?? []).filter(item => (item.from.type === 'service' && item.from.id === id) || (item.to.type === 'service' && item.to.id === id)),
  };
}
/** Declared IDs are never promoted to verified model bindings. */
export function describeBinding(link) {
  return link.architecture_element_id ? 'Указан ID элемента; связь с моделью не проверена' : 'Элемент ArchiMate не сопоставлен';
}
