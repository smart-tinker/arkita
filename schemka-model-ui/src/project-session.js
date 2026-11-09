import { FORMAT_VERSION, SchemkaError } from '../../schemka-model-core/src/index.js';
import {
  PROJECT_FILE_LIMITS, readProjectFile, loadProjectFile,
  projectFileName, serializeProjectFile,
} from '../../schemka-model-io/src/project-file.js';

const fail = (code, message) => { throw new SchemkaError(code, message); };
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const blobSize = typeof Blob === 'function' ? Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get : null;
const blobRead = typeof Blob === 'function' ? Blob.prototype.arrayBuffer : null;
const sameBytes = (left, right) => left === right ||
  (left.length === right.length && left.every((byte, i) => byte === right[i]));

/**
 * File-session bookkeeping only: no DOM, storage, download, or file writes.
 * All project replacements must go through this session; normal core commands,
 * undo and redo may use the same store directly. Dirty compares exact canonical
 * project-file bytes, not revisions, names, selection or a history position.
 *
 * prepareSave() captures { bytes, name, revision }. The caller dispatches those
 * bytes as a download, then calls completeSave(ticket) only if dispatch succeeds.
 * Dispatch is not proof of a disk write. Preparation alone never marks clean.
 * The bytes are detached from the internal baseline; mutating them invalidates
 * the ticket. A newer preparation supersedes an older unfinished save.
 *
 * beginLoad() captures a one-shot { revision } ticket before any asynchronous
 * file selection/confirmation/read. cancelLoad(ticket) abandons only that ticket.
 * loadFile(ticket, file, { isCurrent }) requires a File-like size/arrayBuffer API.
 * Native Blob/File objects use intrinsic size/read methods, ignoring shadowed
 * properties. The interface fallback is for trusted injected adapters/test
 * doubles only: uploaded bytes are untrusted data, never executable objects.
 * The optional synchronous guard protects additional UI draft/interaction state.
 * A cancelled, superseded, reused or stale ticket throws SESSION_STALE. All
 * read/validation errors preserve model, history and canonical baseline.
 */
export function createProjectSession(store) {
  if (!store || typeof store.load !== 'function' ||
      !Number.isSafeInteger(store.revision) || store.revision < 0) {
    fail('FILE_STORE', 'Expected a core project store');
  }

  let epoch = {};
  let documentToken = globalThis.crypto.randomUUID();
  let cachedRevision = -1;
  let cachedBytes;
  let cachedName;
  let activeSave = null;
  let activeLoad = null;
  let requiresSaveAs = false;
  const saves = new WeakMap();
  const loads = new WeakMap();

  function currentBytes() {
    if (cachedRevision !== store.revision) {
      const snapshot = store.snapshot;
      const bytes = serializeProjectFile(snapshot);
      cachedName = projectFileName(snapshot.project.name);
      cachedBytes = bytes;
      cachedRevision = store.revision;
    }
    return cachedBytes;
  }
  let baseline = currentBytes();
  let comparedBytes = baseline, comparedBaseline = baseline, cachedDirty = false;

  function checkLoad(record, status, isCurrent) {
    if (!record || record !== activeLoad || record.status !== status || record.epoch !== epoch) {
      fail('SESSION_STALE', 'This file-open operation is no longer current');
    }
    // Check the revision after the UI guard too: it must not authorize an edit
    // that happens while evaluating its own state.
    if (isCurrent() !== true || record.revision !== store.revision ||
        record !== activeLoad || record.status !== status || record.epoch !== epoch) {
      fail('SESSION_STALE', 'The project or editor changed while opening the file');
    }
  }

  return Object.freeze({
    get documentToken() { return documentToken; },
    get requiresSaveAs() { return requiresSaveAs; },
    matchesProject(bytes) { return sameBytes(currentBytes(), bytes); },
    get dirty() {
      const bytes = currentBytes();
      if (bytes !== comparedBytes || baseline !== comparedBaseline) {
        cachedDirty = !sameBytes(bytes, baseline);
        comparedBytes = bytes; comparedBaseline = baseline;
      }
      return requiresSaveAs || cachedDirty;
    },

    clearSavedBaseline() { baseline = new Uint8Array(); },

    prepareSave() {
      const bytes = currentBytes();
      const ticket = Object.freeze({ bytes: bytes.slice(), name: cachedName, revision: store.revision });
      if (activeSave) activeSave.status = 'superseded';
      const record = { ticket, bytes, epoch, status: 'prepared' };
      saves.set(ticket, record);
      activeSave = record;
      return ticket;
    },

    completeSave(ticket, { saveAs = false } = {}) {
      const record = saves.get(ticket);
      if (!record || record !== activeSave || record.status !== 'prepared' || record.epoch !== epoch) {
        fail('SESSION_STALE', 'This save operation is no longer current');
      }
      if (!sameBytes(record.bytes, ticket.bytes)) {
        record.status = 'invalid';
        activeSave = null;
        fail('FILE_INPUT', 'Prepared download bytes were changed');
      }
      if (requiresSaveAs && saveAs !== true) fail('VERSION_SAVE_AS', 'An upgraded legacy model must be saved to a new file or directory');
      // The captured file becomes the baseline even if a later edit exists.
      // Never substitute a newer snapshot for what was actually dispatched.
      const dirty = !sameBytes(currentBytes(), record.bytes);
      baseline = record.bytes;
      requiresSaveAs = false;
      record.status = 'complete';
      activeSave = null;
      return { revision: ticket.revision, name: ticket.name, dirty };
    },

    beginLoad() {
      if (activeLoad) activeLoad.status = 'superseded';
      const ticket = Object.freeze({ revision: store.revision });
      const record = { revision: ticket.revision, epoch, status: 'pending' };
      loads.set(ticket, record);
      activeLoad = record;
      return ticket;
    },

    cancelLoad(ticket) {
      const record = loads.get(ticket);
      if (!record || record !== activeLoad || !['pending', 'reading'].includes(record.status)) return false;
      record.status = 'cancelled';
      activeLoad = null;
      return true;
    },

    async loadFile(ticket, file, { isCurrent = () => true } = {}) {
      const record = loads.get(ticket);
      if (typeof isCurrent !== 'function') fail('FILE_INPUT', 'Expected a synchronous current-operation guard');
      checkLoad(record, 'pending', isCurrent);
      record.status = 'reading';
      try {
        if (!file || typeof file !== 'object') fail('FILE_INPUT', 'Expected a project file');
        // Intrinsic brand check also recognizes Blob/File from another realm.
        // Own size / arrayBuffer properties cannot hide a native file's size.
        let nativeSize = null;
        if (blobSize) {
          try { nativeSize = blobSize.call(file); } catch { /* Trusted interface fallback. */ }
        }
        // Bound allocation before arrayBuffer() is accessed or invoked.
        const size = nativeSize ?? file.size;
        if (!Number.isSafeInteger(size) || size <= 0 || size > PROJECT_FILE_LIMITS.bytes) {
          fail('FILE_SIZE', 'Project file must be nonempty and at most 18 MiB');
        }
        const read = nativeSize === null ? file.arrayBuffer : blobRead;
        if (typeof read !== 'function') fail('FILE_INPUT', 'Expected a readable project file');
        const fileName = typeof file.name === 'string' ? file.name : null;
        checkLoad(record, 'reading', isCurrent);
        let buffer;
        try {
          buffer = await read.call(file);
        } catch {
          checkLoad(record, 'reading', isCurrent);
          fail('FILE_READ', 'Could not read the project file');
        }
        checkLoad(record, 'reading', isCurrent);
        let length;
        try { length = bufferLength.call(buffer); }
        catch { fail('FILE_READ', 'Project file reader did not return an ArrayBuffer'); }
        if (length !== size || length > PROJECT_FILE_LIMITS.bytes) {
          fail('FILE_SIZE', 'Project file byte length does not match its declared size');
        }
        // Own the read bytes. Strict IO decoding rejects invalid UTF-8, envelope
        // syntax/version, duplicate keys/paths, unknown schema and broken refs.
        const bytes = new Uint8Array(buffer).slice();
        const { state: candidate, sourceVersion } = readProjectFile(bytes);
        const canonical = serializeProjectFile(candidate);
        const name = candidate.project.name;
        const suggestedName = projectFileName(name);
        checkLoad(record, 'reading', isCurrent);
        // The core boundary validates again and atomically clears both histories.
        // All potentially failing preparation happened before this mutation.
        const result = loadProjectFile(store, bytes, record.revision);
        epoch = {}; documentToken = globalThis.crypto.randomUUID();
        baseline = canonical;
        requiresSaveAs = sourceVersion < FORMAT_VERSION;
        cachedBytes = canonical;
        cachedName = suggestedName;
        cachedRevision = result.revision;
        activeSave = null;
        return { revision: result.revision, name, fileName: fileName ?? suggestedName, dirty: requiresSaveAs };
      } finally {
        record.status = 'settled';
        if (activeLoad === record) activeLoad = null;
      }
    },
  });
}
