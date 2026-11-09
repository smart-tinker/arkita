/** Resource budgets for trusted, built-in profile descriptors, not runtime plugins. */
export const PROFILE_LIMITS = Object.freeze({
  profiles: 32,
  typesPerKind: 256,
  rules: 4096,
  descriptorBytes: 1024 * 1024,
  registryBytes: 4 * 1024 * 1024,
  depth: 12,
  nodes: 50000,
  fields: 16,
  string: 2048,
  identifier: 96,
  label: 160,
  version: 1000000,
});

export class ProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProfileError';
    this.code = code;
  }
}

export function fail(code, message) { throw new ProfileError(code, message); }
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();
export const byteLength = value => encoder.encode(JSON.stringify(value)).byteLength;

/**
 * Inspect own data descriptors before reading any value. The copy neither invokes
 * getters nor retains caller-owned objects. This is not a sandbox for hostile JS
 * Proxies or code: registration is restricted to trusted, built-in application code.
 */
export function copyData(value) {
  const ancestors = new Set();
  let nodes = 0;
  let textBytes = 0;
  function copy(item, depth) {
    if (++nodes > PROFILE_LIMITS.nodes || depth > PROFILE_LIMITS.depth) fail('PROFILE_LIMIT', 'Descriptor nesting or node limit exceeded');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      if (item.length > PROFILE_LIMITS.string) fail('PROFILE_LIMIT', 'Descriptor string limit exceeded');
      textBytes += encoder.encode(item).byteLength;
      if (textBytes > PROFILE_LIMITS.descriptorBytes) fail('PROFILE_LIMIT', 'Descriptor byte limit exceeded');
      return item;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) fail('PROFILE_DATA', 'Numbers must be finite and not negative zero');
      return item;
    }
    if (typeof item !== 'object') fail('PROFILE_DATA', 'Only inert JSON data is supported');
    if (ancestors.has(item)) fail('PROFILE_DATA', 'Cyclic descriptor data is not supported');
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      fail('PROFILE_DATA', 'Only plain records and arrays are supported');
    }
    const keys = Reflect.ownKeys(item);
    const length = array ? Object.getOwnPropertyDescriptor(item, 'length').value : 0;
    if (array && length > PROFILE_LIMITS.rules) fail('PROFILE_LIMIT', 'Descriptor array limit exceeded');
    if (!array && keys.length > PROFILE_LIMITS.fields) fail('PROFILE_LIMIT', 'Descriptor field limit exceeded');
    if (array && keys.length !== length + 1) fail('PROFILE_DATA', 'Sparse or extended arrays are not supported');
    ancestors.add(item);
    const result = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || unsafeKeys.has(key)) fail('PROFILE_DATA', 'Symbols and unsafe keys are not supported');
      if (key.length > PROFILE_LIMITS.identifier) fail('PROFILE_LIMIT', 'Descriptor key limit exceeded');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('PROFILE_DATA', 'Hidden properties and accessors are not supported');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) fail('PROFILE_DATA', 'Extended arrays are not supported');
      result[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
    return result;
  }
  return copy(value, 0);
}

export function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function record(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      fields.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !fields.includes(key))) {
    fail('PROFILE_SCHEMA', `Expected exactly these fields: ${fields.join(', ')}`);
  }
}

export function identifier(value) {
  if (typeof value !== 'string' || value.length > PROFILE_LIMITS.identifier ||
      !/^[A-Za-z][A-Za-z0-9._-]*$/.test(value) || unsafeKeys.has(value)) {
    fail('PROFILE_SCHEMA', 'Expected a bounded non-wildcard identifier');
  }
}

export function reference(value) {
  record(value, ['id', 'version']);
  identifier(value.id);
  if (!Number.isSafeInteger(value.version) || value.version < 1 || value.version > PROFILE_LIMITS.version) {
    fail('PROFILE_SCHEMA', 'Expected a positive bounded integer profile version');
  }
  return value;
}

function plainText(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[<>\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    fail('PROFILE_SCHEMA', 'Expected bounded, nonempty plain text without markup or control characters');
  }
}

function choice(value, choices) {
  if (!choices.includes(value)) fail('PROFILE_SCHEMA', `Expected one of: ${choices.join(', ')}`);
}

export const tripleKey = ({ sourceType, relationshipType, targetType }) => JSON.stringify([sourceType, relationshipType, targetType]);

export function validateDescriptor(input) {
  const profile = copyData(input);
  record(profile, ['id', 'version', 'label', 'metadata', 'elementTypes', 'junctionTypes', 'relationshipTypes', 'rules']);
  reference({ id: profile.id, version: profile.version });
  plainText(profile.label, PROFILE_LIMITS.label);
  record(profile.metadata, ['source', 'license', 'status']);
  plainText(profile.metadata.source, PROFILE_LIMITS.string);
  plainText(profile.metadata.license, PROFILE_LIMITS.string);
  choice(profile.metadata.status, ['local', 'unverified']);
  const allTypes = new Set();
  const elements = new Map();
  const relationships = new Map();
  const junctions = new Map();
  for (const [types, target, adapter] of [
    [profile.elementTypes, elements, 'box'],
    [profile.relationshipTypes, relationships, 'open-arrow'],
    [profile.junctionTypes, junctions, 'circle'],
  ]) {
    if (!Array.isArray(types)) fail('PROFILE_SCHEMA', 'Type catalog must be an array');
    if (types.length > PROFILE_LIMITS.typesPerKind) fail('PROFILE_LIMIT', 'Type catalog limit exceeded');
    for (const type of types) {
      record(type, ['id', 'label', 'presentation']);
      identifier(type.id);
      if (allTypes.has(type.id)) fail('PROFILE_DUPLICATE', 'Duplicate type identifier');
      allTypes.add(type.id);
      plainText(type.label, PROFILE_LIMITS.label);
      record(type.presentation, ['adapter', 'token']);
      choice(type.presentation.adapter, [adapter]);
      choice(type.presentation.token, ['neutral']);
      target.set(type.id, type);
    }
  }
  if (!Array.isArray(profile.rules)) fail('PROFILE_SCHEMA', 'Rules must be an array');
  if (profile.rules.length > PROFILE_LIMITS.rules) fail('PROFILE_LIMIT', 'Rule limit exceeded');
  const ruleIds = new Set();
  const rules = new Map();
  for (const rule of profile.rules) {
    record(rule, ['id', 'sourceType', 'relationshipType', 'targetType', 'status', 'scope', 'evidence']);
    for (const key of ['id', 'sourceType', 'relationshipType', 'targetType']) identifier(rule[key]);
    if (ruleIds.has(rule.id)) fail('PROFILE_DUPLICATE', 'Duplicate rule identifier');
    ruleIds.add(rule.id);
    choice(rule.status, ['ALLOWED', 'FORBIDDEN']);
    choice(rule.scope, ['direct', 'unverified']);
    choice(rule.evidence, ['local', 'unverified']);
    if (!elements.has(rule.sourceType) || !elements.has(rule.targetType) || !relationships.has(rule.relationshipType)) {
      fail('PROFILE_REFERENCE', 'Rule references a missing type or the wrong type kind');
    }
    const key = tripleKey(rule);
    if (rules.has(key)) fail('PROFILE_DUPLICATE', 'Duplicate or conflicting exact relationship triple');
    rules.set(key, rule);
  }
  const bytes = byteLength(profile);
  if (bytes > PROFILE_LIMITS.descriptorBytes) fail('PROFILE_LIMIT', 'Descriptor byte limit exceeded');
  return { profile: freeze(profile), elements, junctions, relationships, rules, bytes };
}
