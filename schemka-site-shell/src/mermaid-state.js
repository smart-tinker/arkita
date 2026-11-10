const sameView = (a, b) => a.x === b.x && a.y === b.y && a.scale === b.scale;
const sameSnapshot = (a, b) => a.text === b.text && a.filename === b.filename && sameView(a.view, b.view);

function copySnapshot(value) {
  if (!value || typeof value.text !== 'string' || typeof value.filename !== 'string' ||
      !value.view || !['x', 'y', 'scale'].every(key => Number.isFinite(value.view[key]))) {
    throw new TypeError('Expected exact Mermaid text, filename and finite view coordinates');
  }
  return Object.freeze({
    text: value.text,
    view: Object.freeze({ x: value.view.x, y: value.view.y, scale: value.view.scale }),
    filename: value.filename,
  });
}

/**
 * Read-only bridge over the hosted editor's real state. No DOM, storage or I/O.
 * Source dirtiness remains the host's conservative latch; only view and filename
 * are compared with the initial / successfully handed-off JSON baseline.
 */
export function createMermaidState({ snapshot, sourceDirty, transient = () => false, ready = () => true }) {
  if ([snapshot, sourceDirty, transient, ready].some(callback => typeof callback !== 'function')) {
    throw new TypeError('Mermaid state readers must be functions');
  }

  const initial = copySnapshot(snapshot());
  let baseline = initial, revision = 0, sequence = 0, acceptedSequence = 0;
  let initialAllowed = true, initialIssued = false, initialToken = null, previous = null;
  const downloads = new WeakMap();

  function observe() {
    const current = {
      snapshot: copySnapshot(snapshot()),
      sourceDirty: Boolean(sourceDirty()),
      transient: Boolean(transient()),
      ready: Boolean(ready()),
    };
    if (previous && (!sameSnapshot(current.snapshot, previous.snapshot) ||
        current.sourceDirty !== previous.sourceDirty || current.transient !== previous.transient ||
        current.ready !== previous.ready)) revision += 1;
    if (current.sourceDirty || current.snapshot.text !== initial.text || current.snapshot.filename !== initial.filename) {
      initialAllowed = false;
    }
    previous = current;
    return current;
  }

  // Establish the source-latch and readiness observations without changing them.
  observe();

  return Object.freeze({
    read() {
      const current = observe();
      return Object.freeze({
        ready: current.ready,
        dirty: current.sourceDirty || current.snapshot.filename !== baseline.filename ||
          !sameView(current.snapshot.view, baseline.view),
        transient: current.transient,
        generation: revision,
      });
    },

    /** Capture BEFORE serialization/download; serialize this exact snapshot. */
    captureDownload() {
      const current = observe();
      initialAllowed = false;
      initialToken = null;
      const ticket = Object.freeze({ snapshot: current.snapshot });
      downloads.set(ticket, ++sequence);
      return ticket;
    },

    /**
     * Call only after download dispatch succeeds. A rejected/stale/replayed ticket
     * returns null. The host must assign the returned sourceDirty to its latch;
     * edits made synchronously during dispatch therefore remain dirty.
     * A .mmd dispatch never accepts view or filename as saved.
     */
    acceptDownload(ticket, format = 'json') {
      if (format !== 'json' && format !== 'mmd') return null;
      const id = downloads.get(ticket);
      if (id === undefined || id <= acceptedSequence) return null;
      const current = observe();
      downloads.delete(ticket);
      acceptedSequence = id;
      if (format === 'json') baseline = ticket.snapshot;
      revision += 1;
      return Object.freeze({ sourceDirty: current.snapshot.text !== ticket.snapshot.text });
    },

    /** Only the untouched startup render may establish the fitted view baseline. */
    captureInitialView() {
      const current = observe();
      if (initialIssued || !initialAllowed) return null;
      initialIssued = true;
      if (!sameSnapshot(current.snapshot, initial)) {
        initialAllowed = false;
        return null;
      }
      initialToken = Object.freeze({});
      return initialToken;
    },

    /**
     * `untouched` must explicitly prove the original native render generation and
     * user-interaction epoch still match. Theme rerenders, imports, pan/zoom and
     * stale rendering must make it false. Every genuine attempt is one-shot.
     */
    acceptInitialView(token, untouched = false) {
      if (!token || token !== initialToken) return false;
      initialToken = null;
      const allowed = initialAllowed;
      initialAllowed = false;
      const current = observe();
      if (!allowed || untouched !== true || current.sourceDirty || current.snapshot.text !== initial.text ||
          current.snapshot.filename !== initial.filename) return false;
      baseline = current.snapshot;
      revision += 1;
      return true;
    },
  });
}
