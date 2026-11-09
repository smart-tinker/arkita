import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createProject, createStore, LIMITS, SchemkaError } from '../src/index.js';
import { byteLength, canonicalJSON, parseJSON } from '../src/json.js';
import { newId } from '../src/format.js';

test('TextEncoder preserves Node UTF-8 byte counts, including malformed UTF-16', () => {
  const samples = [
    '', 'ASCII', 'Схемка', '漢字', '🙂🚀', 'e\u0301', '\0\r\n\t',
    '\ud800', '\udfff', '\ud800A\udfff', '\ud800\ud800\udc00',
  ];
  for (const value of samples) {
    assert.equal(byteLength(value), Buffer.byteLength(value, 'utf8'));
    const canonical = canonicalJSON({ value });
    assert.equal(byteLength(canonical), Buffer.byteLength(canonical, 'utf8'));
    assert.deepEqual([...new TextEncoder().encode(canonical)], [...Buffer.from(canonical, 'utf8')]);
  }
});

test('UTF-8 file limit retains the exact Node byte boundary with non-ASCII text', () => {
  const content = JSON.stringify('🙂'.repeat((LIMITS.fileBytes - 4) / 4)) + '  ';
  assert.equal(Buffer.byteLength(content, 'utf8'), LIMITS.fileBytes);
  assert.equal(parseJSON(content), JSON.parse(content));
  assert.throws(() => parseJSON(content + ' '), { name: 'SchemkaError', code: 'LIMIT' });
});

test('IDs use the global secure UUID API with its receiver and retain all prefixes', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const uuid = '01234567-89ab-4cde-8fab-0123456789ab';
  let calls = 0;
  const crypto = { randomUUID() { assert.equal(this, crypto); calls++; return uuid; } };
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
    for (const prefix of ['prj', 'el', 'jct', 'rel', 'view', 'occ', 'conn', 'anc', 'prf']) {
      assert.equal(newId(prefix), `${prefix}-${uuid}`);
    }
    assert.equal(calls, 9);
    assert.throws(() => newId('unknown'), { name: 'SchemkaError', code: 'ID' });
    assert.equal(calls, 9);
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});

test('missing secure crypto fails explicitly without weak randomness or store mutation', () => {
  const store = createStore(createProject('Before runtime failure'));
  const before = { files: store.exportFiles(), revision: store.revision, history: store.history };
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('Weak random fallback must not be used'); };
    for (const crypto of [undefined, {}, { randomUUID: null }]) {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
      assert.throws(() => store.execute({ type: 'createView', name: 'Unavailable' }, store.revision),
        (error) => error instanceof SchemkaError && error.code === 'RUNTIME' && /secure context/.test(error.message));
      assert.deepEqual({ files: store.exportFiles(), revision: store.revision, history: store.history }, before);
    }
  } finally {
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    Math.random = random;
  }
});

test('runtime source uses relative ES modules without Node imports or globals', async () => {
  const root = new URL('../src/', import.meta.url);
  for (const name of await readdir(root)) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /\b(?:Buffer|process|require)\b|['"]node:/, name);
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      assert.match(match[1], /^\.\.?\//, name);
    }
  }
});

test('public API creates, edits, undoes and round-trips without Node Buffer/process globals', () => {
  const entry = new URL('../src/index.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    globalThis.Buffer = undefined;
    globalThis.process = undefined;
    const { createProject, createStore, exportFiles, importFiles } = await import(${JSON.stringify(entry)});
    const store = createStore(createProject('Схемка 🙂'));
    const run = command => store.execute(command, store.revision);
    const { viewId } = run({ type: 'createView', name: 'Обзор' }).created;
    const { elementId } = run({ type: 'createElementAndOccurrence', elementType: 'ApplicationComponent', viewId, name: 'Узел 漢字',
      bounds: { x: 0, y: 0, width: 100, height: 60 } }).created;
    const before = store.exportFiles();
    run({ type: 'renameElement', elementId, name: 'Новое имя 🚀' });
    const after = store.exportFiles();
    store.undo(store.revision);
    assert.deepEqual(store.exportFiles(), before);
    store.redo(store.revision);
    assert.deepEqual(store.exportFiles(), after);
    assert.deepEqual(exportFiles(importFiles(after)), after);
  `], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
