/** JSON only: no coercion, accessors, inherited state, duplicate keys or unsafe keys. */
export const LIMITS = Object.freeze({
  files: 8192,
  entities: 32768,
  fileBytes: 262144,
  totalBytes: 8388608,
  depth: 24,
  nodes: 1000000,
  string: 8192,
  // Local raw multiplicity text budget, not a normative syntax constraint.
  multiplicity: 128,
  properties: 64,
  routePoints: 128,
  coordinate: 1000000,
  history: 100,
});

export class SchemkaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SchemkaError';
    this.code = code;
  }
}

export function fail(code, message) { throw new SchemkaError(code, message); }
const utf8 = new TextEncoder();
export const byteLength = (text) => utf8.encode(text).byteLength;
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
export function safeKey(key) {
  if (unsafeKeys.has(key)) fail('UNSAFE_KEY', `Unsupported object key: ${key}`);
}

/** Checks descriptors before reading properties; JSON.stringify alone would lose data. */
export function assertJSON(value) {
  const ancestors = new Set();
  let nodes = 0;
  function visit(item, depth) {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) fail('LIMIT', 'JSON nesting or node limit exceeded');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) fail('JSON_VALUE', 'Numbers must be finite and not negative zero');
      return;
    }
    if (typeof item !== 'object') fail('JSON_VALUE', 'Only JSON values are supported');
    if (ancestors.has(item)) fail('JSON_VALUE', 'Cyclic JSON value');
    const array = Array.isArray(item);
    if ((!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) ||
        (array && Object.getPrototypeOf(item) !== Array.prototype)) {
      fail('JSON_VALUE', 'Only plain records and arrays are supported');
    }
    ancestors.add(item);
    const keys = Reflect.ownKeys(item);
    if (array && (keys.length !== item.length + 1 || item.length > LIMITS.nodes)) {
      fail('JSON_VALUE', 'Sparse or extended arrays are not supported');
    }
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') fail('JSON_VALUE', 'Symbol keys are not JSON');
      safeKey(key);
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !('value' in descriptor)) fail('JSON_VALUE', 'Accessors and hidden properties are not JSON');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) fail('JSON_VALUE', 'Extended arrays are not supported');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(value, 0);
}

/** Bounded recursive descent preserves the ability to detect duplicate decoded keys. */
export function parseJSON(text) {
  if (typeof text !== 'string') fail('JSON_VALUE', 'File content must be a string');
  if (byteLength(text) > LIMITS.fileBytes) fail('LIMIT', 'JSON file is too large');
  let at = 0;
  let nodes = 0;
  const error = () => fail('JSON_SYNTAX', `Invalid JSON at character ${at}`);
  const white = () => { while (/[\x20\t\r\n]/.test(text[at] ?? '\0')) at++; };
  function string() {
    const start = at++;
    let escaped = false;
    while (at < text.length) {
      const char = text[at++];
      if (!escaped && char === '"') {
        try { return JSON.parse(text.slice(start, at)); } catch { error(); }
      }
      if (!escaped && char === '\\') escaped = true;
      else escaped = false;
    }
    error();
  }
  function value(depth) {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) fail('LIMIT', 'JSON nesting or node limit exceeded');
    white();
    const char = text[at];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      const object = char === '{';
      const result = object ? Object.create(null) : [];
      const keys = new Set();
      const close = object ? '}' : ']';
      at++;
      white();
      if (text[at] === close) { at++; return result; }
      while (at < text.length) {
        if (object) {
          if (text[at] !== '"') error();
          const key = string();
          safeKey(key);
          if (keys.has(key)) fail('DUPLICATE_KEY', `Duplicate JSON key: ${key}`);
          keys.add(key);
          white();
          if (text[at++] !== ':') error();
          result[key] = value(depth + 1);
        } else result.push(value(depth + 1));
        white();
        if (text[at] === close) { at++; return result; }
        if (text[at++] !== ',') error();
        white();
      }
      error();
    }
    for (const [word, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, at)) { at += word.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (!number) error();
    at += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result) || Object.is(result, -0)) fail('JSON_VALUE', 'Numbers must be finite and not negative zero');
    return result;
  }
  const result = value(0);
  white();
  if (at !== text.length) error();
  return result;
}

/** UTF-16 code-unit key order, two spaces, LF and exactly one trailing LF. */
export function canonicalJSON(value) {
  assertJSON(value);
  // JSON.stringify puts integer-looking keys first. Use an explicit encoder so all
  // object keys, including user property names like "10" and "2", use one order.
  function encode(item, depth) {
    if (!item || typeof item !== 'object') return JSON.stringify(item);
    const array = Array.isArray(item);
    const keys = array ? item.map((_, i) => i) : Object.keys(item).sort();
    if (!keys.length) return array ? '[]' : '{}';
    const pad = '  '.repeat(depth + 1);
    const values = keys.map((key) => pad + (array ? '' : JSON.stringify(key) + ': ') + encode(item[key], depth + 1));
    return (array ? '[' : '{') + '\n' + values.join(',\n') + '\n' + '  '.repeat(depth) + (array ? ']' : '}');
  }
  return encode(value, 0) + '\n';
}

export function record(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCHEMA', 'Expected a record');
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    fail('SCHEMA', `Expected fields: ${required.join(', ')}${optional.length ? `; optional: ${optional.join(', ')}` : ''}`);
  }
}
export function text(value) {
  if (typeof value !== 'string' || value.length > LIMITS.string) fail('SCHEMA', 'Expected a bounded string');
}
