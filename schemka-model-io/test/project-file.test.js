import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStore, exportFiles, importFiles, LIMITS, SchemkaError } from '../../schemka-model-core/src/index.js';
import { canonicalJSON } from '../../schemka-model-core/src/json.js';
import {
  PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, PROJECT_FILE_EXTENSION, PROJECT_FILE_LIMITS,
  serializeProjectFile, deserializeProjectFile, loadProjectFile, projectFileName,
} from '../src/project-file.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const byteLength = (value) => encoder.encode(value).byteLength;
const error = (code) => (value) => value instanceof SchemkaError && value.code === code;
const id = (prefix, n) => `${prefix}-${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
async function readFixture(path = fileURLToPath(new URL('../../schemka-model-core/fixtures/two-views/', import.meta.url)), prefix = '') {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await readFixture(`${path}/${entry.name}`, `${prefix}${entry.name}/`));
    else result.push({ path: `${prefix}${entry.name}`, content: await readFile(`${path}/${entry.name}`, 'utf8') });
  }
  return result;
}
const fixture = await readFixture();
const fresh = () => importFiles(fixture);
const element = (n) => ({ id: id('el', n), type: 'ApplicationComponent', name: `Element ${n}`, documentation: '', properties: [] });
function minimal(count = 0) {
  return {
    project: { ...fresh().project, id: id('prj', 1), name: 'Portable' },
    folders: [], assets: [], junctions: [], elements: Array.from({ length: count }, (_, i) => element(i + 1)), relationships: [], views: [],
  };
}
function envelope(files = fixture, extra = {}) {
  return JSON.stringify({ format: PROJECT_FILE_FORMAT, formatVersion: PROJECT_FILE_VERSION, files, ...extra });
}
function editFile(files, select, edit) {
  return files.map((file) => {
    if (!select(file)) return { ...file };
    const value = JSON.parse(file.content);
    edit(value);
    return { path: file.path, content: JSON.stringify(value) };
  });
}

test('canonical fixture is transported byte-for-byte with all IDs, all views and layouts', () => {
  const state = fresh();
  const before = structuredClone(state);
  const result = serializeProjectFile(state);
  assert.ok(result instanceof Uint8Array);
  assert.deepEqual(state, before);
  const text = decoder.decode(result);
  assert.equal(text.charCodeAt(0), 123);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  assert.ok(!text.includes('\r'));
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ['format', 'formatVersion', 'files']);
  assert.equal(parsed.format, PROJECT_FILE_FORMAT);
  assert.equal(parsed.formatVersion, 1);
  assert.deepEqual(parsed.files, exportFiles(state));
  for (const input of [result, text, Buffer.from(result)]) {
    const loaded = deserializeProjectFile(input);
    assert.deepEqual(exportFiles(loaded), exportFiles(state));
    assert.deepEqual(serializeProjectFile(loaded), result);
  }
});

test('transport includes orphan elements, unshown relationships, empty views and repeated occurrences', () => {
  const state = fresh();
  const a = element(100), b = element(101);
  state.elements.push(a, b);
  state.relationships.push({ id: id('rel', 100), type: 'Association', source: { kind: 'element', id: a.id },
    target: { kind: 'element', id: b.id }, label: 'Unshown', documentation: '', properties: [{ key: 'hidden', value: 'in every view' }] });
  state.views.push({ view: { id: id('view', 100), name: 'Empty', documentation: 'Still saved', properties: [] }, occurrences: [], connections: [], visualNodes: [], visualConnectors: [] });
  state.views[0].occurrences.push({ ...structuredClone(state.views[0].occurrences[0]), id: id('occ', 100), zIndex: -42 });
  const loaded = deserializeProjectFile(serializeProjectFile(state));
  assert.equal(loaded.elements.length, 4);
  assert.equal(loaded.relationships.length, 2);
  assert.equal(loaded.views.length, 3);
  assert.deepEqual(exportFiles(loaded), exportFiles(state));
});

test('entity order, object insertion order and property numeric keys cannot change deterministic bytes', () => {
  const state = fresh();
  state.elements[0].properties = [{ key: '2', value: 'two' }, { key: '10', value: 'ten' }, { key: 'z', value: 'last' }, { key: 'a', value: 'first' }];
  const before = serializeProjectFile(state);
  state.elements.reverse(); state.relationships.reverse(); state.views.reverse();
  for (const view of state.views) { view.occurrences.reverse(); view.connections.reverse(); }
  function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)]));
    return value;
  }
  assert.deepEqual(serializeProjectFile(reorder(state)), before);
  const text = decoder.decode(before);
  assert.ok(!text.includes('revision') && !text.includes('updatedAt'));
});

test('noncanonical envelope/file JSON normalizes once; bendpoint order stays meaningful', () => {
  const state = fresh();
  const canonical = serializeProjectFile(state);
  const files = exportFiles(state).reverse().map(({ path, content }) => ({ content: JSON.stringify(JSON.parse(content)), path }));
  const noncanonical = ` \n{ "files":${JSON.stringify(files)}, "formatVersion":1e0, "format":"${PROJECT_FILE_FORMAT}" }\r\n`;
  assert.deepEqual(serializeProjectFile(deserializeProjectFile(noncanonical)), canonical);
  const entry = state.views.find((view) => view.connections[0].routePoints.length > 1);
  entry.connections[0].routePoints.reverse();
  assert.notDeepEqual(serializeProjectFile(state), canonical);
});

test('plain UTF-8 text and escaped lone surrogates preserve exact core values', () => {
  const state = fresh();
  state.project.name = 'Схемка 🧭 e\u0301 \u2028 \u2029';
  state.elements[0].name = 'Unpaired: \ud800 + \udfff';
  state.elements[0].documentation = '\u0000\n\r\t"\\</script><img src=x onerror=alert(1)>';
  state.elements[0].properties = [{ key: '\ud800', value: '\udc00' }, { key: 'emoji', value: '😀' }];
  const saved = serializeProjectFile(state);
  const text = decoder.decode(saved);
  assert.ok(text.includes('\\\\ud800'));
  assert.deepEqual(exportFiles(deserializeProjectFile(saved)), exportFiles(state));
});

test('strict UTF-8 rejects malformed bytes, UTF-16 byte files and BOMs without replacement', () => {
  const bad = [
    [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0x80], [0xf4, 0x90, 0x80, 0x80],
    [0xff, 0xfe, 0x7b, 0], [0xfe, 0xff, 0, 0x7b],
  ];
  for (const value of bad) assert.throws(() => deserializeProjectFile(new Uint8Array(value)), error('FILE_ENCODING'));
  const valid = serializeProjectFile(fresh());
  assert.throws(() => deserializeProjectFile(new Uint8Array([0xef, 0xbb, 0xbf, ...valid])), error('FILE_ENCODING'));
  assert.throws(() => deserializeProjectFile('\ufeff' + decoder.decode(valid)), error('FILE_ENCODING'));
  for (const value of ['\ud800', '\udfff', decoder.decode(valid) + '\ud800']) {
    assert.throws(() => deserializeProjectFile(value), error('FILE_ENCODING'));
  }
});

test('an outer escape cannot smuggle a raw unpaired surrogate into inner file text or path', () => {
  for (const key of ['content', 'path']) {
    const file = { path: 'schemka.json', content: fixture.find((f) => f.path === 'schemka.json').content };
    file[key] += '\ud800';
    assert.throws(() => deserializeProjectFile(envelope([file])), error('FILE_ENCODING'));
  }
});

test('byte subarrays are decoded using their exact offset/length and inputs are never modified', () => {
  const saved = serializeProjectFile(fresh());
  const padded = new Uint8Array(saved.byteLength + 2);
  padded[0] = 255; padded[padded.length - 1] = 255; padded.set(saved, 1);
  const before = padded.slice();
  assert.deepEqual(exportFiles(deserializeProjectFile(padded.subarray(1, -1))), exportFiles(fresh()));
  assert.deepEqual(padded, before);
});

test('unsupported input objects are rejected rather than coerced, inspected or serialized', () => {
  for (const value of [null, undefined, {}, [], 1, true, new ArrayBuffer(1), new DataView(new ArrayBuffer(1)), new Uint16Array(1)]) {
    assert.throws(() => deserializeProjectFile(value), error('FILE_INPUT'));
  }
});

test('unknown or missing envelope fields, versions and formats are rejected', () => {
  const cases = [
    [envelope(fixture, { formatVersion: 2 }), 'FILE_VERSION'],
    [envelope(fixture, { format: 'future' }), 'FILE_VERSION'],
    [envelope(fixture, { future: true }), 'FILE_SCHEMA'],
    [envelope(fixture, { formatVersion: '1' }), 'FILE_SCHEMA'],
    [envelope(fixture, { formatVersion: -0 }), 'FILE_VERSION'],
    [envelope(fixture, { format: null }), 'FILE_SCHEMA'],
    ['{}', 'FILE_SCHEMA'],
    [`{"format":"${PROJECT_FILE_FORMAT}","files":[]}`, 'FILE_SCHEMA'],
    [envelope([{ ...fixture[0], extra: 'future' }]), 'FILE_SCHEMA'],
    [envelope([{ path: fixture[0].path }]), 'FILE_SCHEMA'],
    [envelope([]), 'SCHEMA'],
  ];
  for (const [value, code] of cases) assert.throws(() => deserializeProjectFile(value), error(code));
});

test('decoded duplicate JSON keys are rejected in outer root, file records and inner model', () => {
  const plain = envelope();
  const variants = [
    plain.replace('"format":', '"format":"x","format":'),
    plain.replace('"formatVersion":1', '"formatVersion":1,"format\\u0056ersion":1'),
    plain.replace('"files":', '"files":[],"f\\u0069les":'),
    plain.replace('"path":', '"p\\u0061th":"schemka.json","path":'),
    plain.replace('"content":', '"content":"{}","con\\u0074ent":'),
  ];
  // A valid first format lets duplicate detection, rather than version rejection,
  // be the decisive failure for this specific case.
  variants[0] = plain.replace('"format":', `"format":"${PROJECT_FILE_FORMAT}","format":`);
  for (const value of variants) assert.throws(() => deserializeProjectFile(value), error('DUPLICATE_KEY'));
  const files = fixture.map((file) => file.path !== 'schemka.json' ? file : {
    ...file, content: file.content.replace('"name":', '"name":"first","na\\u006de":'),
  });
  assert.throws(() => deserializeProjectFile(envelope(files)), error('DUPLICATE_KEY'));
});

test('unknown nested objects/arrays and deep envelopes are rejected without recursive descent', () => {
  const cases = [
    envelope(fixture, { files: {} }), envelope(fixture, { files: [[fixture[0]]] }),
    envelope(fixture, { files: [{ path: {}, content: '{}' }] }),
    envelope(fixture, { files: [{ path: 'schemka.json', content: { project: {} } }] }),
    envelope(fixture, { formatVersion: [] }), envelope(fixture, { format: {} }),
    `{"format":${'['.repeat(50000)}0${']'.repeat(50000)}}`,
  ];
  for (const value of cases) assert.throws(() => deserializeProjectFile(value), SchemkaError);
});

test('malformed JSON, trailing input, comments, control characters and non-JSON whitespace reject', () => {
  const valid = envelope();
  for (const value of ['', ' ', '[1]', 'null', valid.slice(0, -1), valid + '{}', valid.replace('"format":', '"format" '),
    valid.replace('"files":[', '"files":[,'), valid.replace('"files":[', '"files":[/*comment*/'),
    valid.replace('"formatVersion":1', '"formatVersion":01'), valid.replace('"formatVersion":1', '"formatVersion":1.'),
    valid.replace('"formatVersion":1', '"formatVersion":1e'), valid.replace('"format":', '"for\nmat":'),
    '\u00a0' + valid, valid + ',', valid.slice(0, -1) + ',}', '{"format":"\\q"}', '{"format":"unterminated']) {
    assert.throws(() => deserializeProjectFile(value), SchemkaError, value.slice(0, 80));
  }
});

test('duplicate paths, unsafe paths and path/UUID mismatches remain core errors', () => {
  assert.throws(() => deserializeProjectFile(envelope([...fixture, fixture[0]])), error('DUPLICATE_PATH'));
  for (const path of ['../schemka.json', '/schemka.json', 'C:\\schemka.json', './schemka.json', 'model\\elements\\x.json',
    'schemka.json\u0000', 'SCHEMKA.JSON', '%2e%2e/schemka.json', 'views/../../schemka.json']) {
    assert.throws(() => deserializeProjectFile(envelope([{ path, content: '{}' }])), error('PATH'));
  }
  const onlyOne = [...fixture];
  const index = onlyOne.findIndex((file) => file.path.startsWith('model/elements/'));
  onlyOne[index] = { ...onlyOne[index], path: `model/elements/${id('el', 999)}.json` };
  assert.throws(() => deserializeProjectFile(envelope(onlyOne)), error('PATH_ID'));
});

test('full schemas, unknown types, UUIDs, references and geometry are still strictly validated', () => {
  const cases = [
    [(f) => f.path === 'schemka.json', (v) => { v.future = 1; }, 'SCHEMA'],
    [(f) => f.path === 'schemka.json', (v) => { v.id = v.id.toUpperCase(); }, 'ID'],
    [(f) => f.path === 'schemka.json', (v) => { v.formatVersion = 1; }, 'VERSION'],
    [(f) => f.path.startsWith('model/elements/'), (v) => { v.type = 'UnknownElement'; }, 'TYPE'],
    [(f) => f.path.startsWith('model/relationships/'), (v) => { v.source.id = id('el', 999); }, 'REFERENCE'],
    [(f) => f.path.includes('/occurrences/'), (v) => { v.bounds.x = 0.01; }, 'GEOMETRY'],
    [(f) => f.path.includes('/connections/'), (v) => { v.source.id = id('occ', 999); }, 'REFERENCE'],
  ];
  for (const [select, edit, code] of cases) assert.throws(() => deserializeProjectFile(envelope(editFile(fixture, select, edit))), error(code));
  const withoutView = fixture.filter((file) => !file.path.endsWith('/view.json'));
  assert.throws(() => deserializeProjectFile(envelope(withoutView)), error('REFERENCE'));
  const file = fixture.find((entry) => entry.path === 'schemka.json');
  const deep = '{"unknown":' + '['.repeat(LIMITS.depth + 1) + '0' + ']'.repeat(LIMITS.depth + 1) + '}';
  assert.throws(() => deserializeProjectFile(envelope([{ ...file, content: deep }])), error('LIMIT'));
});

test('file count, entity count, input file bytes and path length have bounded edges', () => {
  const maximum = minimal(LIMITS.files - 1);
  const saved = serializeProjectFile(maximum);
  assert.equal(exportFiles(deserializeProjectFile(saved)).length, LIMITS.files);
  maximum.elements.push(element(LIMITS.files));
  assert.throws(() => serializeProjectFile(maximum), error('LIMIT'));
  const files = Array.from({ length: LIMITS.files + 1 }, (_, i) => ({ path: `${i}.json`, content: '{}' }));
  assert.throws(() => deserializeProjectFile(envelope(files)), error('LIMIT'));
  const single = exportFiles(minimal())[0];
  single.content += ' '.repeat(LIMITS.fileBytes - byteLength(single.content));
  assert.deepEqual(exportFiles(deserializeProjectFile(envelope([single]))), exportFiles(minimal()));
  single.content += ' ';
  assert.throws(() => deserializeProjectFile(envelope([single])), error('LIMIT'));
  assert.throws(() => deserializeProjectFile(envelope([{ path: 'a'.repeat(PROJECT_FILE_LIMITS.pathBytes + 1), content: '{}' }])), error('LIMIT'));
});

test('exact 8 MiB decoded input limit survives maximal newline quoting expansion', () => {
  const files = exportFiles(minimal(31));
  assert.equal(files.length, 32);
  for (const file of files) file.content += '\n'.repeat(LIMITS.fileBytes - byteLength(file.content));
  assert.equal(files.reduce((sum, file) => sum + byteLength(file.content), 0), LIMITS.totalBytes);
  const text = envelope(files);
  assert.ok(byteLength(text) > LIMITS.totalBytes * 1.9);
  assert.ok(byteLength(text) < PROJECT_FILE_LIMITS.bytes);
  assert.deepEqual(exportFiles(deserializeProjectFile(text)), exportFiles(minimal(31)));
  files.push({ path: `model/elements/${id('el', 999)}.json`, content: '{}' });
  assert.throws(() => deserializeProjectFile(envelope(files)), error('LIMIT'));
});

test('a canonical 8 MiB project with escape-heavy values saves and round-trips within the container bound', () => {
  const state = minimal(33);
  for (const value of state.elements) value.properties = Array.from({ length: 32 }, (_, i) => ({ key: `p${i}`, value: '' }));
  let remaining = LIMITS.totalBytes - exportFiles(state).reduce((sum, file) => sum + byteLength(file.content), 0);
  for (const value of state.elements) {
    let available = LIMITS.fileBytes - byteLength(canonicalJSON(value));
    for (const row of value.properties) {
      const size = Math.min(remaining, available, LIMITS.string * 2);
      row.value = '\\'.repeat(Math.floor(size / 2)) + (size % 2 ? 'a' : '');
      remaining -= size; available -= size;
    }
  }
  assert.equal(remaining, 0);
  const canonical = exportFiles(state);
  assert.equal(canonical.reduce((sum, file) => sum + byteLength(file.content), 0), LIMITS.totalBytes);
  const saved = serializeProjectFile(state);
  assert.ok(saved.byteLength > 15 * 1024 * 1024);
  assert.ok(saved.byteLength <= PROJECT_FILE_LIMITS.bytes);
  assert.deepEqual(exportFiles(deserializeProjectFile(saved)), canonical);
  state.elements.at(-1).properties.at(-1).value += 'a';
  assert.throws(() => serializeProjectFile(state), error('LIMIT'));
});

test('18 MiB outer byte limit includes whitespace and is enforced for text and bytes', () => {
  const base = envelope(exportFiles(minimal()));
  const exact = base + ' '.repeat(PROJECT_FILE_LIMITS.bytes - byteLength(base));
  assert.equal(byteLength(exact), PROJECT_FILE_LIMITS.bytes);
  assert.deepEqual(exportFiles(deserializeProjectFile(exact)), exportFiles(minimal()));
  assert.throws(() => deserializeProjectFile(exact + ' '), error('LIMIT'));
  assert.throws(() => deserializeProjectFile(new Uint8Array(PROJECT_FILE_LIMITS.bytes + 1)), error('LIMIT'));
  const multi = '😀'.repeat(Math.floor(PROJECT_FILE_LIMITS.bytes / 4) + 1);
  assert.ok(multi.length < PROJECT_FILE_LIMITS.bytes);
  assert.throws(() => deserializeProjectFile(multi), error('LIMIT'));
});

test('shadowed typed-array metadata cannot bypass the byte limit or execute getters', () => {
  const saved = serializeProjectFile(minimal());
  for (const descriptor of [{ value: 0 }, { get() { assert.fail('Input getter must not run'); } }]) {
    const huge = new Uint8Array(PROJECT_FILE_LIMITS.bytes + 1);
    huge.fill(32); huge.set(saved);
    Object.defineProperty(huge, 'byteLength', descriptor);
    Object.defineProperty(huge, Symbol.toStringTag, { get() { assert.fail('Input brand getter must not run'); } });
    assert.throws(() => deserializeProjectFile(huge), error('LIMIT'));
  }
  const small = saved.slice();
  Object.defineProperty(small, 'byteLength', { get() { assert.fail('Input size getter must not run'); } });
  assert.deepEqual(exportFiles(deserializeProjectFile(small)), exportFiles(minimal()));
  const fake = { byteLength: 1, [Symbol.toStringTag]: 'Uint8Array' };
  assert.throws(() => deserializeProjectFile(fake), error('FILE_INPUT'));
});

test('long raw escaped strings cannot bypass decoded per-field and token bounds', () => {
  const head = `{"format":"${PROJECT_FILE_FORMAT}","formatVersion":1,"files":[{"path":"schemka.json","content":"`;
  assert.throws(() => deserializeProjectFile(head + '\\u0020'.repeat(LIMITS.fileBytes + 1) + '"}]}'), error('LIMIT'));
  assert.throws(() => deserializeProjectFile('{"' + 'x'.repeat(200) + '":0}'), error('LIMIT'));
});

test('successful load creates one monotonic revision boundary and clears undo plus redo', () => {
  const store = createStore(fresh());
  store.execute({ type: 'createView', name: 'Keep before load' }, 0);
  store.execute({ type: 'createView', name: 'Undo before load' }, 1);
  store.undo(2);
  assert.deepEqual(store.history, { undo: 1, redo: 1 });
  const next = minimal(3);
  assert.deepEqual(loadProjectFile(store, serializeProjectFile(next), 3), { revision: 4 });
  assert.deepEqual(store.exportFiles(), exportFiles(next));
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
  assert.throws(() => store.undo(4), error('HISTORY'));
  assert.throws(() => store.redo(4), error('HISTORY'));
  assert.throws(() => store.execute({ type: 'createView', name: 'Stale' }, 3), error('REVISION'));
  assert.deepEqual(loadProjectFile(store, serializeProjectFile(next), 4), { revision: 5 });
});

test('all load failures preserve exact bytes, IDs, revision and both history stacks', () => {
  const store = createStore(fresh());
  store.execute({ type: 'createView', name: 'Keep' }, 0);
  store.execute({ type: 'createView', name: 'Undo' }, 1);
  store.undo(2);
  const before = { bytes: serializeProjectFile(store.snapshot), revision: store.revision, history: store.history };
  const failures = [
    'not JSON', new Uint8Array([255]), envelope(fixture, { formatVersion: 2 }), envelope(fixture, { extra: 1 }),
    envelope([...fixture, fixture[0]]), envelope([{ path: '../schemka.json', content: '{}' }]),
    envelope(editFile(fixture, (f) => f.path === 'schemka.json', (v) => { v.id = 'invalid'; })),
    envelope(editFile(fixture, (f) => f.path.startsWith('model/relationships/'), (v) => { v.target.id = 'missing'; })),
  ];
  for (const input of failures) {
    assert.throws(() => loadProjectFile(store, input, store.revision), SchemkaError);
    assert.deepEqual({ bytes: serializeProjectFile(store.snapshot), revision: store.revision, history: store.history }, before);
  }
  store.redo(3);
  assert.equal(store.snapshot.views.at(-1).view.name, 'Undo');
  store.undo(4);
  assert.deepEqual(serializeProjectFile(store.snapshot), before.bytes);
});

test('stale, missing and exhausted revisions reject before decoding and are rechecked at commit', () => {
  const store = createStore(fresh());
  const saved = serializeProjectFile(fresh());
  const before = serializeProjectFile(store.snapshot);
  for (const base of [undefined, null, -1, 0.5, 1, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => loadProjectFile(store, saved, base), error('REVISION'));
    assert.throws(() => loadProjectFile(store, 'invalid', base), error('REVISION'));
  }
  assert.deepEqual(serializeProjectFile(store.snapshot), before);
  assert.equal(store.revision, 0);
  assert.throws(() => loadProjectFile({ revision: Number.MAX_SAFE_INTEGER, load() { assert.fail('Must not load'); } }, saved, Number.MAX_SAFE_INTEGER), error('REVISION'));
  // A delegating adapter deliberately changes the core between the early read
  // and commit. The actual core load, not a stale snapshot, owns the final check.
  const adapter = { get revision() { return store.revision; }, load(files, base) {
    store.execute({ type: 'createView', name: 'Concurrent edit' }, store.revision);
    return store.load(files, base);
  } };
  assert.throws(() => loadProjectFile(adapter, saved, 0), error('REVISION'));
  assert.equal(store.snapshot.views.at(-1).view.name, 'Concurrent edit');
  assert.equal(store.revision, 1);
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
});

test('loaded snapshots and separate serializations never alias caller-owned buffers or data', () => {
  const state = fresh();
  const first = serializeProjectFile(state), second = serializeProjectFile(state);
  first.fill(0);
  assert.notDeepEqual(first, second);
  const loaded = deserializeProjectFile(second);
  const store = createStore(loaded);
  loaded.elements[0].name = 'Outside';
  second.fill(0);
  assert.deepEqual(store.exportFiles(), exportFiles(state));
  assert.throws(() => loadProjectFile({}, second, 0), error('FILE_STORE'));
});

test('filename helper produces bounded Unicode basenames, neutralizes device names and never paths', () => {
  assert.equal(projectFileName('Схемка 🧭'), 'Схемка 🧭.arkita');
  assert.equal(projectFileName('e\u0301'), 'é.arkita');
  assert.equal(projectFileName('name.SCHEMKA.JSON'), 'name.arkita');
  assert.equal(projectFileName(''), 'project.arkita');
  assert.equal(projectFileName('..'), 'project.arkita');
  for (const name of ['CON', 'prn', 'NUL.txt', 'COM1', 'com9.log', 'LPT1', 'LPT¹', 'COM²', 'CON .txt', 'CONIN$', 'CLOCK$']) {
    assert.ok(projectFileName(name).startsWith('_'), name);
  }
  for (const name of ['../../target', 'C:\\Users\\you\\x', '.hidden', 'a\u0000b', 'a\u202eb', 'x\u200fb', ' \n. ', '<>:"/\\|?*',
    'x'.repeat(8192), '🧭'.repeat(4096), '\ud800', 'a'.repeat(146) + '.tail']) {
    const result = projectFileName(name);
    assert.ok(result.endsWith(PROJECT_FILE_EXTENSION));
    assert.ok(byteLength(result) <= PROJECT_FILE_LIMITS.filenameBytes);
    assert.ok(!/[\p{Cc}\p{Cf}\p{Cs}<>:"/\\|?*]/u.test(result));
    assert.ok(!result.startsWith('.') && !result.startsWith(' '));
    assert.ok(!/[. ]$/.test(result.slice(0, -PROJECT_FILE_EXTENSION.length)));
  }
  assert.throws(() => projectFileName(null), error('SCHEMA'));
  assert.throws(() => projectFileName('x'.repeat(8193)), error('SCHEMA'));
});

test('seeded property-style full-project roundtrips retain hostile text, property keys, layout and IDs', () => {
  let seed = 0xdecafbad;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const samples = ['', 'Имя', '😀', '<svg onload="boom">', '[x] --> y', '\u0000\u2028', '\ud800', '"\\\n'];
  const shuffle = (values) => {
    for (let i = values.length - 1; i > 0; i--) { const j = random() % (i + 1); [values[i], values[j]] = [values[j], values[i]]; }
  };
  for (let iteration = 0; iteration < 32; iteration++) {
    const state = fresh();
    state.project.name = samples[random() % samples.length];
    for (const value of state.elements) {
      value.name = samples[random() % samples.length];
      value.documentation = samples[random() % samples.length];
      value.properties = [{ key: '2', value: samples[random() % samples.length] }, { key: '10', value: samples[random() % samples.length] }, { key: `key${random()}`, value: `${random()}` }];
    }
    state.elements.push({ ...element(1000 + iteration), name: samples[random() % samples.length] });
    for (const entry of state.views) {
      entry.view.documentation = samples[random() % samples.length];
      for (const occurrence of entry.occurrences) {
        occurrence.bounds.x = ((random() % 20000001) - 10000000) / 10;
        occurrence.bounds.y = ((random() % 20000001) - 10000000) / 10;
        occurrence.zIndex = (random() % 2000001) - 1000000;
      }
      for (const connection of entry.connections) connection.routePoints = Array.from({ length: random() % 8 }, () => ({ kind: 'bend', point: { x: (random() % 1000) / 10, y: (random() % 1000) / 10 } }));
    }
    const expected = exportFiles(state), bytes = serializeProjectFile(state);
    for (const collection of [state.elements, state.relationships, state.views, ...state.views.flatMap((view) => [view.occurrences, view.connections])]) shuffle(collection);
    assert.deepEqual(serializeProjectFile(state), bytes);
    let loaded = deserializeProjectFile(bytes);
    for (let repeat = 0; repeat < 3; repeat++) {
      assert.deepEqual(exportFiles(loaded), expected);
      assert.deepEqual(serializeProjectFile(loaded), bytes);
      loaded = deserializeProjectFile(serializeProjectFile(loaded));
    }
  }
});

test('production codec works with browser-standard globals and no Node Buffer/process', async () => {
  const source = await readFile(new URL('../src/project-file.js', import.meta.url), 'utf8');
  assert.ok(!/from\s+['"]node:|\bBuffer\b|\bprocess\b|\bdocument\s*\.|\bwindow\s*\.|\bfetch\s*\(/.test(source));
  const savedBuffer = globalThis.Buffer, savedProcess = globalThis.process;
  try {
    globalThis.Buffer = undefined;
    globalThis.process = undefined;
    assert.deepEqual(exportFiles(deserializeProjectFile(serializeProjectFile(fresh()))), exportFiles(fresh()));
    assert.ok(projectFileName('Пример').endsWith('.arkita'));
  } finally {
    globalThis.Buffer = savedBuffer;
    globalThis.process = savedProcess;
  }
});
