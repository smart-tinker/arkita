# Frozen native v2 contract

**Historical schema.** The current reader and metadata UI are documented in [NATIVE-V3.md](NATIVE-V3.md). It validates this complete v2 contract before conversion, preserves the source and requires Save As. The remainder records the original v2 behavior and historical acceptance evidence.

The original v2 runtime accepts only `schemka-project` core format 2 and `schemka-archimate4@2`. The owner chose an incompatible current format while the product is pre-1.0. There is no legacy execution path, v1 reader, converter, migration command, silent upgrade or downgrade. Existing v1 inner projects are rejected before replacing the current model/history. No saved user models are changed by this implementation.

[METADATA-CONTRACT.md](METADATA-CONTRACT.md) freezes this current metadata schema
and specifies a future native-v3 migration for project/relationship documentation
and project/view properties. That accepted design does not enable v3 or new
metadata UI: current readers still reject it, with shared executable fixtures
covering import, Git, history, sessions and native filesystem boundaries.

The standalone typed-only interface increment changes no native schema, IDs, endpoint permissions, stored coordinates or import rules. Help holds the existing diagnostics/provenance report; removing navigation and presentation controls does not establish full-language conformance.

## Two different version fields

The `.schemka.json` transport envelope is still:

```json
{"format":"schemka-project-file","formatVersion":1,"files":[]}
```

Its version describes the unchanged shallow array of `{ path, content }` files. Each `content` is inner JSON text. The `schemka.json` entry inside that array must declare core `formatVersion: 2` and `metamodel: { id: 'schemka-archimate4', version: 2 }`. Envelope 1 does not imply inner model 1 support. Unsupported envelope versions and old/mismatched inner identities are rejected, never guessed from filenames or converted.

## Concepts and their drawings

The authoritative API/schema is [core README](../schemka-model-core/README.md). State is `{ project, elements, junctions, relationships, views }` with optional nonempty `customizationProfiles` and `viewpoints` arrays. The bounded viewpoint definition/binding, exact selection, non-destructive projection and four commands are documented in [VIEWPOINTS.md](VIEWPOINTS.md). The additive typed-profile schema, per-concept applications, five commands and native choices are documented in [CUSTOMIZATION.md](CUSTOMIZATION.md). The parser remains one current native-v2 validator.

- The ordinary catalogue remains exactly 42 element IDs and 15 relationship IDs. `AndJunction` and `OrJunction` are a separate closed junction catalogue, persisted under `model/junctions/<jct-UUIDv4>.json`.
- Model relationship `source` and `target` are exact `{ kind: 'element' | 'junction' | 'relationship', id }` references. Optional `junctionRole: 'container'` records explicit modeling intent; it is not a permission token.
- An occurrence has `concept: { kind: 'element' | 'junction', id }`; it never draws a relationship as an element.
- A connection has `relationshipId`, typed `source` and `target`, ordered `routePoints` and nullable `labelPosition`. View endpoints are `{ kind: 'occurrence', id }` or `{ kind: 'connection', id, anchorId }`.
- Route points are `{ kind: 'bend', point: { x, y } }` or `{ kind: 'anchor', id: 'anc-UUIDv4', point: { x, y } }`. The combined local limit is 128 points per connection. Anchor IDs count toward entity/security budgets.

Each drawing endpoint must resolve to its relationship's exact model ConceptRef, including kind. A host connection and its anchor must belong to the same view. An anchor is an absolute, persisted waypoint owned by that specific connection, not a recursively evaluated fraction of its path. All records and anchors are indexed before resolving references, so file order, forward/self/mutual references and cycles do not require an invented DAG.

The core stores structurally valid drafts even when semantic checks return FORBIDDEN/FAIL/UNKNOWN. It rejects wrong-kind prefixes, dangling/cross-view references, wrong anchor owners, unsupported fields, unsafe paths/JSON, off-grid coordinates and resource violations. Structurally accepted does not mean source-permitted.

## Atomic editing and deletion

Connection creation can insert a selected host anchor and create the relationship/drawing in one revision-guarded transaction. Failed or cancelled operations must leave no orphan anchors, partial model records or history changes. Undo/redo restores IDs and exact raw values.

View duplication preallocates fresh occurrence, connection and anchor IDs, remaps drawing references and retains shared model IDs. Model deletion follows the transitive closure of relationship references and then dependent drawings. Drawing deletion follows its per-view closure only. It does not delete model concepts or reattach a dependent to a different drawing automatically. Deletion previews and commits use the same closure at the same revision.

Removing a referenced anchor requires explicit valid same-concept rebinding in the same transaction. Resetting a route removes bends and the optional label position but retains anchors in their relative order. Moving an occurrence does not move its saved absolute anchors. See [VIEW-GEOMETRY.md](VIEW-GEOMETRY.md).

## Separate semantic scope

[ENDPOINT-RULES.json](ENDPOINT-RULES.json) remains the exact B.5 ordinary-element matrix: 26,460 reviewed triples, 4,443 direct permissions, 2,935 derived permissions, 19,074 forbidden and eight source-unresolved UNKNOWN. Junctions do not turn it into a 44-element matrix.

[CONCEPT-ENDPOINTS.json](CONCEPT-ENDPOINTS.json) separately records B.6/concept permissions and bounded junction checks. B.6 letters are normalized family-code sets and do not carry B.5 direct/derived case semantics. Relationship-to-relationship endpoint pairs remain FORBIDDEN, even though one relationship endpoint can be permitted. Aggregation/Composition at ANY junction endpoint remains a separate source-scope UNKNOWN. Mixed Aggregation/Composition junction-family compatibility and Composition container-exception applicability remain UNKNOWN.

Whole-model normative assessment always remains UNKNOWN. No instance DAG, unique owner, self-link ban, three-edge junction minimum, real-world instance cardinality or execution semantics are inferred. All diagnostics are read-only and advisory; they are never saved as authority-bearing fields.

## Export and acceptance

Native IO includes all concepts, drawings, raw text and ordered route points exactly. Canonical save/read/save is byte-stable. Mermaid is a selected-view approximation: a selected view governed by a viewpoint, or containing any junction occurrence, connection-kind endpoint, or drawn concept with profile applications throws `MERMAID_UNSUPPORTED` with native-file guidance. It does not silently skip or flatten those records. An ordinary element-only view retains its earlier projection behavior, even if another view/model area contains v2 concepts.

Site 25 is the published standalone typed-only baseline: GitHub `2c5f3c0`, Sites source `40475eda133c99109655ee57839a75c21712a10e`, deployed 2026-10-13 at 13:58:19 UTC with public access revision 2 unchanged. That baseline passed 1,067 tests, 145 syntax checks, clean build and independent review. Bounded live-browser checks covered the standalone UI, Help/diagnostics, palette order, exact-ID reuse, geometry, Undo/Redo and download. Its 7,923-byte OFF/ON downloads matched SHA256 `77bdb4bf16e201e7afb8b5182214f68bd982c3e624556cb13dacf5805cd73a89`; local codec roundtrip passed, but browser reopen of that file was not run. The current category-disclosure, accessible-hint and Device-badge increment is local, unpublished and browser-unverified. Its stable post-review aggregate passed 1,074 tests with zero failures/skips, 145 syntax checks and a clean build; independent implementation review passed without remaining findings. Full ArchiMate 4 remains the release 1.0 acceptance goal; current coverage is partial and whole-model conformance remains UNKNOWN. See [VALIDATION.md](VALIDATION.md).

The local Chapter 14 customization implementation adds model-owned inert definitions and applications. It is not publication evidence: independent implementation review and real-browser/file-picker acceptance remain separate gates. No profile data is inserted by opening/updating the application.

## Viewpoint codec guard

When any viewpoint definition exists, the native `schemka.json` header includes
`viewpointFormat: 1`. Ordinary and Chapter 14-only headers omit it byte-exactly.
This is validated codec metadata, not an editable semantic project field. The
current importer requires exact agreement with the complete definition set and
rejects unsupported, duplicate, missing or mismatched markers transactionally.
Earlier unguarded enhanced Ch13 draft encodings are unsupported; no converter or
legacy runtime is provided. This keeps old directory readers from silently
omitting unbound definitions. Native format remains 2; see [VIEWPOINTS.md](VIEWPOINTS.md).
