# Schemka model/view core

Dependency-free native ES modules for one shared model and independent views.
Node.js 22+ and modern browsers need `TextEncoder`, `structuredClone`,
`Object.hasOwn` and secure `globalThis.crypto.randomUUID()`. Missing secure UUID
support fails with `RUNTIME`; no weak randomness fallback exists. Runtime code
has no filesystem, network, DOM or Node-specific imports.

## Current catalogue

`createProject(name)` immediately creates `schemka-archimate4@2`.
`CURRENT_METAMODEL` is the frozen `{ id: 'schemka-archimate4', version: 2 }`.
`CURRENT_CATALOG` is the frozen `{ id, version, elementTypes, junctionTypes, relationshipTypes }`
record in [src/current-catalog.js](src/current-catalog.js): 42 element identifiers
and 15 relationship identifiers, plus the separate AndJunction/OrJunction catalogue. The latter represent eleven base relationship
names and four nominal variants. `Access` is a valid type without a qualifier;
`ReadAccess`, `WriteAccess`, `ReadWriteAccess` and `DirectedAssociation` are type
IDs. There is no `accessType` field.

This is closed structural membership, not an endpoint matrix or conformance
check. Source names and attribution are documented in
[the source ledger](../docs/ELEMENT-SOURCES.json) and
[the coverage ledger](../docs/ARCHIMATE-COVERAGE.md).
Storage/codec validation remains structural and imports no graphics, SHACL or
source prose. Known catalogue membership does not establish permission.
New relationship commands additionally consult bounded source policy from the
profiles package through a private original-CURRENT_PROFILE registry. Profiles
imports only core format/json leaves, not the core barrel, avoiding a cycle.
Existing/imported invalid records remain valid storage data and saveable.
Whole-model normative conformance remains `UNKNOWN`.
Grouping and Location remain flat elements; nesting and derived relationships
are not implemented.

## Example

```js
import { createProject, createStore, importFiles } from './src/index.js';
const store = createStore(createProject('Учебная модель'));
const execute = command => store.execute(command, store.revision);
const { viewId } = execute({ type: 'createView', name: 'Обзор' }).created;
const { elementId, occurrenceId } = execute({
  type: 'createElementAndOccurrence', elementType: 'ApplicationComponent',
  viewId, name: 'Приложение', bounds: { x: 20, y: 30, width: 180, height: 80 },
}).created;
execute({ type: 'renameElement', elementId, name: 'Новое имя' });
execute({ type: 'moveOccurrence', viewId, occurrenceId, x: 30.5, y: 50 });
store.undo(store.revision);
store.redo(store.revision);
const reopened = createStore(importFiles(store.exportFiles()));
```

Creation requires an explicit known `elementType` or `relationshipType`.
There are no activation, profile transition or migration commands. Opening validated v2 uses the pure converter described in [NATIVE-V3.md](../docs/NATIVE-V3.md); the active store is strict v3.

## Data and canonical files

State is `{ project, elements, junctions, relationships, views }`; each view entry is
`{ view, occurrences, connections }`. Collections are arrays, independent of
presentation order. The ordered `routePoints` array retains every bend and anchor in order.

```text
schemka.json
model/elements/<el-UUIDv4>.json
model/junctions/<jct-UUIDv4>.json
model/relationships/<rel-UUIDv4>.json
views/<view-UUIDv4>/view.json
views/<view-UUIDv4>/occurrences/<occ-UUIDv4>.json
views/<view-UUIDv4>/connections/<conn-UUIDv4>.json
```

Required record fields:

- Project: `format: 'schemka-project'`, `formatVersion: 3`, `id`, `name`, `documentation`, `properties`,
  `metamodel: CURRENT_METAMODEL`
- Element/junction: `id`, `type`, `name`, `documentation`, `properties`;
  junction IDs use `jct`, and types are exactly `AndJunction` or `OrJunction`
- Relationship: `id`, `type`, `source`, `target`, `label`, `documentation`, `properties`;
  endpoints are `{ kind: 'element' | 'junction' | 'relationship', id }`
- View: `id`, `name`, `documentation`, `properties`
- Occurrence: `id`, `concept: { kind: 'element' | 'junction', id }`, `bounds: { x, y, width, height }`,
  `parentOccurrenceId: null`, `zIndex`
- Connection: `id`, `relationshipId`, `source`, `target`, `routePoints`,
  `labelPosition: null | { x, y }`
- View endpoint: `{ kind: 'occurrence', id }` or
  `{ kind: 'connection', id, anchorId }`
- Route point: `{ kind: 'bend', point: { x, y } }` or
  `{ kind: 'anchor', id: 'anc-UUIDv4', point: { x, y } }`

Relationship records additionally accept optional raw `sourceMultiplicity` and
`targetMultiplicity` strings, and optional `junctionRole: 'container'`. The role
is a modeling annotation, never a permission token. Every other unknown field is
rejected. The local
limit is 128 UTF-16 code units per end. Missing, empty and `'*'` are distinct.
Spaces, line breaks, numeric spellings, arbitrary text and escaped lone
surrogates round-trip exactly. Storage does not interpret multiplicity syntax;
there is no implicit default or saved diagnostic status. The profiles package
provides read-only syntax evidence separately.

`properties` is a string-to-string record. Empty text is valid. IDs are
lowercase UUIDv4 with entity prefixes, unique across the project. Filenames
must match record IDs. Imported IDs are retained; commands allocate new IDs.
Concepts may appear repeatedly across views. Both endpoint kinds must resolve
to their exact model ConceptRef, including its kind. Hosts and anchors must be
in the same view; anchors belong to the named connection. All model records,
view drawings and anchors are indexed before references are resolved. Forward,
self and mutual references, parallel relationships and incomplete junctions are
structurally supported. No DAG or normative permission is inferred. Anchors
are stored absolute waypoints, not recursively evaluated host-path fractions.

`exportFiles(state)` returns in-memory `{ path, content }[]`, not disk writes.
`importFiles(files)` accepts that array, allowing duplicate-path detection. `readProjectFiles(files)` additionally returns the original `sourceVersion`; fully validated v2 is converted once to detached v3 by `normalizeProject`, while `validateProjectV2` keeps the old schema frozen.
Canonical JSON has sorted keys/paths by UTF-16 code units, two-space indentation,
LF and one final LF. Noncanonical JSON can be read and canonicalized once.
Canonical save/read/save preserves exact bytes. Numeric-looking property keys
are sorted by the same rule. No history, revision, timestamps, selection or
viewport is serialized.

`mergeProjectFiles(baseFiles, localFiles, remoteFiles, resolution = {})` validates
and canonicalizes three versions of the same project, then merges complete
records by stable path. One-sided and identical changes combine automatically;
overlapping changes require `{ records: { [conflictingPath]: 'local' | 'remote' } }`.
The result is `{ files, conflicts, structuralError }`. Each conflict retains
`path`, a display `label`, and canonical `base`, `local`, `remote` contents;
`null` means the record is absent. Resolved conflicts remain in that list.
Unresolved choices return `files: null`. A combined graph that fails structural
validation also returns `files: null` with a safe `structuralError`; no partial
model is accepted. An explicit `{ whole: 'local' | 'remote' }` selects one complete
version, discarding the other side's changes, and cannot be mixed with `records`.
Malformed inputs, different project IDs, unknown resolution fields, non-conflict
paths and invalid choices throw. Inputs remain unchanged; the helper performs
no Git, filesystem or network operations and makes no normative assessment.

## Commands and local session

`createStore(initialState)` validates and isolates the input. The frozen handle
exposes detached `snapshot`, `revision`, `history: { undo, redo }`,
`exportFiles()`, `execute(command, baseRevision)`, `undo(baseRevision)`,
`redo(baseRevision)` and `load(files, baseRevision)`.

Commands use exact data records:

- `applyProjectSnapshot`: `files`; validates a complete native snapshot with the
  same project ID and replaces all model data, including optional collections.
  This is one undoable edit with the union of old/new view IDs in
  `affectedViewIds`; it retains earlier undo history and clears redo. It leaves
  the file session's saved baseline and document identity intact, so applying
  changed bytes makes the document dirty until saved.
- `updateMetadata`: `owner: { kind, id }`, optional `documentation`, `properties`; at least one field must change. Owners are `project`, `view`, `element`, `junction` or `relationship`. This is one exact atomic edit.
- `renameProject`: `name`; `renameView`: `viewId`, `name`
- `createView`: `name`, optional `documentation`, `properties`
- `duplicateView`: `viewId`, `name`; preallocates all view/occurrence/connection/anchor IDs,
  preserves shared model references and all geometry
- `createElementAndOccurrence`: `viewId`, `elementType`, `name`, `bounds`;
  optional `documentation`, `properties`, `zIndex`
- `createJunctionAndOccurrence`: `viewId`, `junctionType`, `name`, `bounds`;
  optional `documentation`, `properties`, `zIndex`
- `addOccurrence`: `viewId`, `concept`, `bounds`; optional `zIndex`
- `renameJunction`: `junctionId`, `name`; `updateJunctionType`: `junctionId`, `junctionType`
- `renameElement`: `elementId`, `name`; `renameRelationship`: `relationshipId`, `label`
- `moveOccurrence`: `viewId`, `occurrenceId`, `x`, `y`
- `resizeOccurrence`: `viewId`, `occurrenceId`, `width`, `height`; changes one
  drawing while retaining its position and all other views. Dimensions use the
  existing positive 0.1-unit grid through 1,000,000; unchanged sizes are rejected
  with `COMMAND` before history changes.
- `createRelationshipAndConnection`: `viewId`, `relationshipType`,
  `source`, `target`, `label`; optional `documentation`, `properties`, `routePoints`,
  `labelPosition`, `sourceMultiplicity`, `targetMultiplicity`, `junctionRole`
- `addConnection`: `viewId`, `relationshipId`, `source`, `target`;
  optional `routePoints`, `labelPosition`
- `updateConnectionLayout`: `viewId`, `connectionId`, `routePoints`, `labelPosition`
- `updateConceptDocumentation`: exact `concept: {kind: "element" | "junction" | "relationship", id}`
  and required `documentation` string. Updates only that shared record, reports
  its affected views and creates one undo step. Unchanged text is rejected with
  `COMMAND` before history changes. Empty string clears the required field;
  raw whitespace/CR/CRLF/Unicode are retained within `LIMITS.string` (8192 UTF-16
  units). View and project documentation use `updateMetadata` with their own metadata owner.
- `updateConceptProperties`: exact `concept: {kind: "element" | "junction" | "relationship", id}`
  and `properties` string-pair record; replaces that shared concept's ordinary
  properties in one undo step. Pass `{}` to clear them. Existing 64-property,
  8192-unit string and safe-key limits apply; equal records, regardless of key
  order, are rejected with `COMMAND` before history changes. Profile applications
  and documentation remain intact.
- `updateRelationshipMultiplicity`: `relationshipId`; optional
  `sourceMultiplicity`, `targetMultiplicity`. Omitted ends are unchanged;
  strings set exact raw text; `null` explicitly removes an end. Null is a command
  sentinel and is never persisted. A no-op, including removing an absent end,
  is rejected with `COMMAND`. Both ends commit atomically in one undo step.
- `updateRelationshipJunctionRole`: `relationshipId`, `junctionRole`; use
  `'container'` to set or `null` to remove
- `insertConnectionAnchor`: `viewId`, `connectionId`, `index`, `point`;
  creates `created.anchorId`; index ranges from 0 through the route length
- `moveConnectionAnchor`: `viewId`, `connectionId`, `anchorId`, `point`
- `removeConnectionAnchor`: `viewId`, `connectionId`, `anchorId`; optional
  `replacement` ViewEndpoint atomically rebinds every dependent end. A referenced
  anchor cannot be removed without a valid same-concept replacement
- `rebindConnectionEndpoint`: `viewId`, `connectionId`, `end: 'source' | 'target'`,
  `endpoint`; the selected drawing must retain the exact model concept
- `resetConnectionLayout`: `viewId`, `connectionId`; removes bends and label
  position but retains all anchors in their original order
- `removeConnection`: `viewId`, `connectionId`; removes dependent drawings transitively
- `removeOccurrence`: `viewId`, `occurrenceId`; removes incident/dependent drawings transitively
- `deleteElementFromModel`: `elementId`; `deleteJunctionFromModel`: `junctionId`;
  `deleteRelationshipFromModel`:
  `relationshipId`. These remove dependent objects across views.

`deletionImpact(state, { kind: 'element' | 'junction' | 'relationship', id })`
returns a detached deeply frozen preview with sorted `elementIds`, `junctionIds`,
`relationshipIds`, `occurrenceIds`, `connectionIds`, `anchorIds` and `viewIds`.
`drawingDeletionImpact(state, { viewId, kind: 'occurrence' | 'connection', id })`
uses the same result shape. Model deletion follows an iterative relationship
reference closure, then a per-view drawing closure. Drawing deletion never
removes model objects or reattaches to a different host. Model deletion never
removes other elements via composition or repairs incomplete junctions.
Deletion commands return exactly the same impact; execute at the revision
used for the preview, and recompute after a revision conflict. Command results include `command`, `created`, sorted
`affectedViewIds` and the new session `revision`; undo/redo also include `action`.
A model multiplicity edit affects every view drawing that shared relationship;
connection layout remains per-view. No edge counts, creation or deletion are
automatically inferred from multiplicity text.

Every operation checks the exact current revision. Commands validate a complete
candidate before commit. Failures preserve state, revision, bytes and both
history stacks. Successful edits clear redo. History is bounded to 100 steps.
A successful load clears history; a failed load leaves it recoverable.
Unsupported identity/version or removed/unknown types fail with `VERSION`/`TYPE`;
no record is coerced or silently dropped. The active store accepts native format v3 and the unchanged current metamodel.
Readers also accept fully validated native v2 through the one pure v3 converter;
there is no v1 reader, downgrade or alias API. Unsupported headers fail with
`VERSION` before the current session is replaced.

## Atomic endpoint selection and shared resolvers

`createRelationshipAndConnection` and `addConnection` accept persisted
ViewEndpoints or `{ kind: 'connection', id, insertAnchor: { index, point } }`
at either end. The insertion plan identifies the exact host drawing and a
snapped native-grid point. The core allocates the anchor ID, inserts it into
that host's ordered route, derives the model ConceptRef and validates the
entire candidate in the same transaction. Results include `created.anchorIds`
when anchors were allocated. Two insertion plans execute source then target;
the target index addresses the route after source insertion. Invalid type,
geometry, mapping, budget, stale revision or any other failure commits nothing.
Successful undo/redo restores the same IDs. Dialog cancellation must not invoke
a command; a repeated submit must use its captured base revision.

`createProjectResolver(state)` validates once and retains a detached, deeply
frozen graph. Its methods `resolveConcept(ref)` and
`resolveViewEndpoint(viewId, endpoint)` return read-only records. Endpoint
results contain `{ concept, record, occurrence }` or
`{ concept, record, connection, anchor, point }`. Relationship endpoints resolve
directly to stored anchor coordinates; no host geometry is traversed. Prefer
one resolver per snapshot/render. Convenience exports `resolveConcept(state,
ref)` and `resolveViewEndpoint(state, viewId, endpoint)` construct one for a
single call. Unknown fields and invalid references fail explicitly.

## Defensive limits

`LIMITS`: 8,192 files and separately 32,768 entities (including every nested
anchor), 256 KiB per file, 8 MiB canonical project, depth 24, 1,000,000 JSON nodes,
8,192 UTF-16 code units per ordinary string, 128 per raw
multiplicity, 64 properties, 128 combined route points per connection, 100 undo steps. Coordinates are
finite on a 0.1 grid within ±1,000,000; dimensions are positive and `zIndex`
is a bounded integer. Off-grid data is rejected rather than rounded.

Strict JSON validation rejects duplicate/unsafe keys, accessors without calling
them, symbols, functions, hidden/inherited fields, sparse/extended arrays,
cycles, malformed schemas, invalid references and nonfinite/negative-zero
numbers. Arbitrary executable objects and compromised JavaScript realms are
outside the data-only trust boundary.

## Verification

Run `npm test`, `npm run check`, `npm run coverage` in this package. No install
or network access is required. Tests preserve current geometry/history/runtime
and hostile-input checks, typed multi-view canonical fixtures, every catalogue
type's creation, atomic unsupported-input rejection and raw multiplicity cycles.
Node tests do not substitute for the separate browser UI checks.

## Customization data

User-owned typed definitions and concept applications retain their existing schema in native v3. See [CUSTOMIZATION.md](../docs/CUSTOMIZATION.md) for the exact schema, seven basic types, compound forms, defaults/unset semantics, five revision-guarded commands and pure resolver. Existing string properties and trusted catalog membership are unchanged.

## Project-owned viewpoints

The existing viewpoint grammar, retained in v3, supports optional nonempty `viewpoints`,
`viewpoints/<vpt-UUIDv4>.json` files and optional `view.viewpointId`. Four transactional
commands and detached exact-type/drawing projections are described in
[VIEWPOINTS.md](../docs/VIEWPOINTS.md). Empty collections are omitted; unenhanced
canonical bytes are unchanged. Viewpoints never confer normative authority and
never remove hidden model/drawing records during projection or full native save.

The native header derives `viewpointFormat: 1` only when definitions exist. This
codec-only field is validated against the full definition set and removed on
semantic import; editing it as a project property is invalid. Earlier unguarded
enhanced v2 drafts reject before conversion. Native format v3 retains this explicit marker.

## Creation-only relationship policy

`execute` first checks revision and command shape, stages the complete candidate
(including anchors), validates structure, then rejects proved new-relationship
blockers before either history stack/state/revision changes. Rejection uses
`RELATIONSHIP_FORBIDDEN`, with a scoped endpoint or junction rule/reason. It
leaves both history stacks, exported bytes and saved/dirty baseline intact.

The internal profile helper requires this core-validated inert candidate and
the private trusted registry. Its null result means no proved blocker, never
ALLOWED or a complete semantic assessment. No caller registry, verdict, command
flag, serialized property or work-limit override can replace the authority.

It blocks endpoint FORBIDDEN, inapplicable declared container intent, new
junction-end multiplicity, definite incompatible transit families involving the
new edge, and a forbidden terminal pair on a path through the new edge. The
container field is a local intent convention; its applicability check does not
claim a standard-mandated attribute. Incomplete degree, unrelated failures,
cycles, unresolved qualifiers and exhausted analysis do not become blanket bans.
The fixed 50,000-work analysis can leave UNKNOWN; a found focused proof still
blocks. All eight ordinary UNKNOWNs and separate junction scope remain intact.

This gate is only for allocating a new model relationship. `addConnection`,
`duplicateView`, import/load/export and private Undo/Redo keep existing records
exact, including invalid ones. Existing junction-role and multiplicity updates
remain diagnostic. Rebinding changes only drawings of the same concept. No
semantic endpoint/type mutation API, repair, migration or bypass is introduced.
