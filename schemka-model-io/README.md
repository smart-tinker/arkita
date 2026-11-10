# Schemka project IO

Dependency-free native ES modules for the single current `schemka-archimate4@2`
project catalogue: 42 element IDs and 15 relationship IDs, with a separate
AndJunction/OrJunction catalogue. Runtime code uses
standard browser APIs and sibling core modules; it does not read/write disks,
access the network, render HTML or manage UI state. Node.js 22+ runs the tests.

## Native project file

```js
import {
  serializeProjectFile, deserializeProjectFile, loadProjectFile,
  projectFileName, exportMermaid,
} from './src/index.js';
const bytes = serializeProjectFile(store.snapshot); // UTF-8 Uint8Array
const name = projectFileName(store.snapshot.project.name);
const reopened = deserializeProjectFile(bytes);
loadProjectFile(store, bytes, store.revision);
const diagram = exportMermaid(store.snapshot, selectedViewId);
```

The `.schemka.json` container is canonical JSON:
`{ format: 'schemka-project-file', formatVersion: 1, files: [{ path, content }] }`.
Inner strings are core's canonical file tree, not an archive. The envelope stays
version 1 because its shallow files-array grammar is unchanged. The inner
`schemka.json` project is written with `formatVersion: 3` and
`metamodel: { id: 'schemka-archimate4', version: 2 }`. Envelope 1 does not
provide a v1 model reader. A strictly validated native v2 is converted once to v3; unknown versions/profiles fail transactionally. `readProjectFile` returns `{ state, sourceVersion }`, and `serializeNativeFiles` transports validated original native records without erasing their version. Save As/source protection is described in [NATIVE-V3.md](../docs/NATIVE-V3.md).
The public constants are `PROJECT_FILE_FORMAT`, `PROJECT_FILE_VERSION`,
`PROJECT_FILE_EXTENSION`, `PROJECT_FILE_LIMITS`, and `MERMAID_LIMITS`.

Every supported model/view record is included, including unshown elements,
junctions and relationships, repeated occurrences, empty views, labels,
properties, typed source/target references, ordered bend/anchor routePoints,
anchor IDs and label positions. Occurrences use concept references; connection
endpoints may name an occurrence or a host connection and its exact anchor. Optional raw relationship
`sourceMultiplicity`/`targetMultiplicity` values preserve exact text and
presence: absent, empty and `'*'` remain different. Core's local 128 UTF-16-unit
bound applies independently of syntax diagnostics. The v2 converter adds only the required empty metadata fields. No type coercion,
semantic rules, endpoint swapping, `accessType`, diagnostics or history are added.

`deserializeProjectFile` accepts well-formed Unicode text or UTF-8 Uint8Array.
Malformed UTF-8, BOMs, malformed envelope Unicode, duplicate/extra keys, duplicate
paths, unknown file paths, unsafe inner JSON, invalid IDs/references/geometry,
unsupported metamodel identity and removed/unknown types are rejected. Inner
JSON escaping preserves lone-surrogate data values exactly. Input entity order
and key order do not affect canonical output; route-point order remains meaningful, including shared anchors.
Forward, self and cyclic references are resolved by core without geometry
recursion or an inferred DAG.
Repeated save/read/save produces identical bytes.

`loadProjectFile` delegates one revision-guarded atomic load to core. Success
increments revision and clears history. A malformed file or stale revision
preserves the destination state, saved bytes and both undo/redo stacks. No
records are silently dropped or repaired; the sole v2→v3 conversion follows the frozen metadata contract. Source session state is never changed
when loading into another store.

Container limit: 18 MiB, inner path: 128 UTF-8 bytes, generated filename:
160 UTF-8 bytes. Core's independent 8,192-file, 256-KiB-per-file, 8-MiB-total,
depth/node/string budgets remain unchanged. Size checks precede parsing where
possible. The shallow envelope parser does not widen inner JSON budgets.
Filename generation produces a safe bounded basename with the exact extension;
it does not create folders or save files.

## Mermaid projection

`exportMermaid(state, viewId, { direction: 'LR' })` is a one-way selected-view
projection. A selected view containing any junction occurrence or any
connection-kind endpoint is rejected with `MERMAID_UNSUPPORTED` and guidance to
keep the native file. No such record is flattened or silently omitted. Ordinary
element-only views retain their earlier projection behavior. The only directions are `LR`, `RL`, `TB`, `BT`. Current type IDs
prefix every node/edge caption. Neutral rectangles/arrows are used for all IDs;
this is not normative notation or a lossless interchange format. Every output
contains a fixed relationship-semantics-UNKNOWN warning: this projection does
not transport the profiles package's bounded endpoint diagnostics or establish
source-backed semantics. Drawn multiplicities
are escaped text annotations with a second explicit approximation warning.
Keep the native file for continued editing and exact recovery.

See [MERMAID.md](MERMAID.md) for escaping, privacy boundaries, deliberate text
substitutions, loss of layout and limits. Unshown model information is not copied
into comments or hidden metadata. Native round-trip and deterministic Mermaid
projection are separate guarantees; Mermaid import is not implemented.

## Tests

Run `npm test`, `npm run check`, `npm run coverage`. No installation or network
is required. Tests retain strict transport/encoding/path/limit checks and
current edit-save-open-history workflows, all current type IDs across views,
raw multiplicity round-trips and malformed-file atomicity.

Set `SCHEMKA_MERMAID_RUNTIME` to the existing verified Mermaid Tiny 12.1.0 bundle
to run its optional hash-pinned generated-flowchart grammar test. That test
covers current type prefixes and adversarial multiplicity text; it is not DOM
rendering, browser sanitizer or full visual QA. Without the bundle this one
optional grammar test is explicitly skipped.
