import { LIMITS, SchemkaError, exportFiles, readProjectFiles } from '../../schemka-model-core/src/index.js';

export const PROJECT_FILE_FORMAT = 'schemka-project-file';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.arkita';
export const PROJECT_FILE_LIMITS = Object.freeze({
  // Canonical inner JSON expands by at most 2x when quoted. The remaining
  // 2 MiB comfortably covers all 8192 paths, record punctuation and indentation.
  bytes: 18 * 1024 * 1024,
  pathBytes: 128,
  filenameBytes: 160,
});

const encoder = new TextEncoder();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBytes = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const typedArrayKind = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const fail = (code, message) => { throw new SchemkaError(code, message); };
const bytes = (text) => encoder.encode(text).byteLength;

// TextEncoder would silently replace an unpaired UTF-16 surrogate with U+FFFD.
// Escaped surrogates inside an inner JSON document remain ASCII and are allowed.
function wellFormed(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function decodeInput(input) {
  let text;
  if (typeof input === 'string') {
    // UTF-8 cannot be shorter than its well-formed UTF-16 code-unit count.
    if (input.length > PROJECT_FILE_LIMITS.bytes) fail('LIMIT', 'Project container is too large');
    if (!wellFormed(input)) fail('FILE_ENCODING', 'Project text contains unpaired UTF-16 surrogates');
    if (bytes(input) > PROJECT_FILE_LIMITS.bytes) fail('LIMIT', 'Project container is too large');
    text = input;
  } else if (ArrayBuffer.isView(input) && typedArrayKind.call(input) === 'Uint8Array') {
    // Own byteLength / Symbol.toStringTag properties can shadow native getters.
    // Use the intrinsic brand and size, without invoking input-owned accessors.
    if (typedArrayBytes.call(input) > PROJECT_FILE_LIMITS.bytes) fail('LIMIT', 'Project container is too large');
    try {
      // Preserve any BOM so the explicit policy below also applies to bytes.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
    } catch {
      fail('FILE_ENCODING', 'Project bytes must be valid UTF-8');
    }
  } else fail('FILE_INPUT', 'Expected UTF-8 Uint8Array bytes or a Unicode string');
  if (text.charCodeAt(0) === 0xfeff) fail('FILE_ENCODING', 'A UTF-8 BOM is not supported');
  return text;
}

/**
 * A non-recursive parser for exactly the shallow transport envelope. Inner files
 * remain strings; importFiles is the sole authority for model JSON and schema.
 * This avoids raising or copying the core parser's per-file/depth/node limits.
 */
function decodeFiles(input) {
  const text = decodeInput(input);
  let at = 0;
  let total = 0;
  const syntax = () => fail('JSON_SYNTAX', `Invalid project container JSON at character ${at}`);
  function white() {
    while (text[at] === ' ' || text[at] === '\t' || text[at] === '\r' || text[at] === '\n') at++;
  }
  function expect(char) {
    white();
    if (text[at++] !== char) syntax();
  }
  function string(maxBytes) {
    white();
    if (text[at] !== '"') fail('FILE_SCHEMA', 'Expected a JSON string');
    const start = at++;
    let escaped = false;
    while (at < text.length) {
      if (at - start > 6 * maxBytes + 1) fail('LIMIT', 'Project container string is too large');
      const char = text[at++];
      if (!escaped && char === '"') {
        let result;
        try { result = JSON.parse(text.slice(start, at)); } catch { syntax(); }
        if (!wellFormed(result)) fail('FILE_ENCODING', 'Envelope strings must contain valid Unicode');
        if (bytes(result) > maxBytes) fail('LIMIT', 'Project container string is too large');
        return result;
      }
      if (!escaped && char === '\\') escaped = true;
      else escaped = false;
    }
    syntax();
  }
  function record(fields, read) {
    expect('{');
    const result = Object.create(null);
    const seen = new Set();
    white();
    if (text[at] !== '}') {
      while (at < text.length) {
        const key = string(32);
        if (seen.has(key)) fail('DUPLICATE_KEY', `Duplicate JSON key: ${key}`);
        seen.add(key);
        if (!fields.includes(key)) fail('FILE_SCHEMA', `Unknown project container field: ${key}`);
        expect(':');
        result[key] = read(key);
        white();
        if (text[at] === '}') break;
        expect(',');
      }
    }
    expect('}');
    if (fields.some((field) => !seen.has(field))) fail('FILE_SCHEMA', `Required container fields: ${fields.join(', ')}`);
    return result;
  }
  function fileList() {
    expect('[');
    const files = [];
    const paths = new Set();
    white();
    if (text[at] !== ']') {
      while (at < text.length) {
        if (files.length >= LIMITS.files) fail('LIMIT', 'Too many files in project container');
        const file = record(['path', 'content'], (key) => string(key === 'path' ? PROJECT_FILE_LIMITS.pathBytes : LIMITS.fileBytes));
        if (paths.has(file.path)) fail('DUPLICATE_PATH', `Duplicate path: ${file.path}`);
        paths.add(file.path);
        total += bytes(file.content);
        if (total > LIMITS.totalBytes) fail('LIMIT', 'Project file contents exceed total byte limit');
        files.push(file);
        white();
        if (text[at] === ']') break;
        expect(',');
      }
    }
    expect(']');
    return files;
  }
  const envelope = record(['format', 'formatVersion', 'files'], (key) => {
    if (key === 'files') return fileList();
    if (key === 'format') {
      const value = string(64);
      if (value !== PROJECT_FILE_FORMAT) fail('FILE_VERSION', 'Unsupported project container format');
      return value;
    }
    white();
    // Standard JSON number spellings (including 1.0/1e0) are accepted. No
    // recursion or JSON.parse of unknown objects/arrays is ever needed.
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at, at + 128));
    if (!token) fail('FILE_SCHEMA', 'Expected a numeric container version');
    at += token[0].length;
    if (Number(token[0]) !== PROJECT_FILE_VERSION) fail('FILE_VERSION', 'Unsupported project container version');
    return PROJECT_FILE_VERSION;
  });
  white();
  if (at !== text.length) syntax();
  return envelope.files;
}

/** Return deterministic UTF-8 bytes, without BOM, ending with exactly one LF. */
function encodeFiles(files) {
  // Explicit fixed field order, sorted core paths, and exact canonical content.
  // The container is a transport of core files, never a replacement Git format.
  const entries = files.map(({ path, content }) => `    {"path":${JSON.stringify(path)},"content":${JSON.stringify(content)}}`);
  const text = `{\n  "format": ${JSON.stringify(PROJECT_FILE_FORMAT)},\n  "formatVersion": ${PROJECT_FILE_VERSION},\n  "files": [\n${entries.join(',\n')}\n  ]\n}\n`;
  const result = encoder.encode(text);
  if (result.byteLength > PROJECT_FILE_LIMITS.bytes) fail('LIMIT', 'Project container is too large');
  return result;
}

export function serializeProjectFile(state) { return encodeFiles(exportFiles(state)); }

/** Transport validated original records without erasing their source version. */
export function serializeNativeFiles(files) {
  readProjectFiles(files);
  return encodeFiles([...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function readProjectFile(input) { return readProjectFiles(decodeFiles(input)); }

/** Return a detached validated full project. No IDs or model values are remapped. */
export function deserializeProjectFile(input) {
  return readProjectFile(input).state;
}

/** Atomically replace an existing core store at an explicit revision boundary. */
export function loadProjectFile(store, input, baseRevision) {
  if (!store || typeof store.load !== 'function') fail('FILE_STORE', 'Expected a core project store');
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || baseRevision !== store.revision || baseRevision === Number.MAX_SAFE_INTEGER) {
    fail('REVISION', 'Stale or invalid base revision');
  }
  // core.load rechecks the revision and validates the entire candidate before
  // changing anything; on success it increments once and clears both histories.
  return store.load(decodeFiles(input), baseRevision);
}

/** A suggested basename only: never a path, file write, download or overwrite. */
export function projectFileName(name) {
  if (typeof name !== 'string' || name.length > LIMITS.string) fail('SCHEMA', 'Expected a bounded project name');
  let stem = name.normalize('NFC').replace(/\.(?:arkita|schemka\.json)$/i, '')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}<>:"/\\|?*]/gu, '-')
    .replace(/\s+/gu, ' ').replace(/^[. ]+|[. ]+$/g, '');
  if (!stem) stem = 'project';
  // Windows reserves these device names even with an additional extension.
  const deviceStem = stem.split('.')[0].replace(/[ .]+$/g, '');
  if (/^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(deviceStem)) stem = `_${stem}`;
  const budget = PROJECT_FILE_LIMITS.filenameBytes - bytes(PROJECT_FILE_EXTENSION);
  let bounded = '', size = 0;
  for (const char of stem) {
    const length = bytes(char);
    if (size + length > budget) break;
    bounded += char;
    size += length;
  }
  bounded = bounded.replace(/[. ]+$/g, '') || 'project';
  return bounded + PROJECT_FILE_EXTENSION;
}
