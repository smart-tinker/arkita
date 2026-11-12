# Native V4 contract

The current writer emits `schemka-project@4` with the unchanged
`schemka-archimate4@2` metamodel and `schemka-project-file@1` transport envelope.
This is a storage contract, not a claim of full ArchiMate conformance.

V2 and V3 have independent frozen validators. Opening them validates their
original schema first, then prepares a detached V4 candidate. The source
version remains part of the file/directory session: a migrated document is dirty
and requires a separate Save As. Old source bytes, Git commits and recovery
journals are not rewritten by migration. There is no V4-to-V3/V2 converter.

## Metadata and organization

All eight metadata owners (project, element, junction, relationship, view,
folder, visual node, visual connector) have `documentation` strings and
`properties: [{key, value}]`. Property rows preserve order, repeated keys, empty
keys, case and exact text. There are at most 64 rows; each key/value obeys the
existing 8192 UTF-16-unit text limit. V2/V3 maps migrate through
`Object.entries`, without inferring an earlier user display order.

A view may have `kind: architecture|canvas|sketch`, a hexadecimal
`background` and an optional `router: manual|orthogonal`. The router changes the display projection; authored route points and anchors remain stored. Every drawing kind may carry `locked:boolean`. Note/group nodes
may carry an `instruction` string. An `actor` style shape is available only to
visual cards; it cannot replace an ArchiMate concept's notation. A drawing lock
protects geometry, endpoints, appearance and deletion across every command,
including staged snapshots; unlock must precede these changes. Metadata of common semantic concepts remains editable. Locked visual objects also protect their local names, text, documentation, properties, target references and instructions; unlock them explicitly before editing. Frozen V2/V3 reject all these additions.

Every V4 state has `folders` and `assets` arrays; every view entry has
`visualNodes` and `visualConnectors` alongside `occurrences` and `connections`.
Empty collections have no separate on-disk files.

Folders contain `{id,name,documentation,properties,parentFolderId,members}`.
The parent is another folder ID or null. Members are typed element, junction,
relationship or view references. Each member has at most one folder owner.
Folder parents are acyclic. Deleting a folder retains concepts and views,
promotes its child folders and moves members to its parent or the model root.
The optional `childLabelTemplate` string controls labels for the folder's direct
members and child folders; child folders do not inherit it for their own contents.
It supports `${name}`, `${type}`, `${id}`, `${documentation}`, `${model.name}`,
and `${property:key}`. Missing or empty templates use the standard label. Older
releases with a closed V4 schema that predates this field reject these files
rather than silently dropping it; files without the field keep their prior encoding.

## Drawings and references

Occurrences store `parent: null | {kind:'occurrence'|'visualNode',id}` and a
closed `style` record. Legacy `parentOccurrenceId` is removed only during old
schema migration. Semantic connections also have a `style` record and may have
an explicit `hidden` boolean. A hidden line retains its semantic relationship. The connection-only style
`hideWhenNested` is an explicit display preference: it hides an existing line
only while its two exact occurrence endpoints have a declared geometric parent
chain and one is physically inside the other. It does not infer a semantic
relationship or certify nesting semantics.

Visual nodes have `{id,kind,name,documentation,properties,bounds,zIndex,parent,style}`
plus exactly the fields for their kind:

- `note`: `text`;
- `group`: no additional fields;
- `legend`: `legend:{sort,columns,showRelationships}` with optional
  `colorScheme`, `columnWidth`, `autoSize`, `rowsPerColumn`, `labels`,
  `showElements`, `showSpecializations`, `colors`;
- `viewReference`: `targetViewId`;
- `image`: `assetId` (an existing resource ID or null for an explicitly cleared placeholder).

Legend sort is `name|type`, columns 1–8, color scheme
`notation|monochrome|pastel`. Column width uses the ordinary positive geometry
limit/grid. `autoSize` is boolean. `rowsPerColumn` is 1–100 when present. Optional `labels`
is a unique list of `{type,label}` rows (at most 256 characters per label);
missing fields preserve automatic sizing and the standard type labels. Optional
`colors` contains unique `{type,color}` or `{profileId,color}` entries using
hexadecimal colors; profile references name existing specializations and follow
fragment transfer/remapping and explicit profile deletion cleanup.

Visual connectors have `{id,name,documentation,properties,source,target,
routePoints,labelPosition,style}`. Node endpoints are typed occurrences or
visual nodes. Connector endpoints name a semantic connection or visual
connector and an anchor owned by that exact host. Semantic connections retain
their stricter original concept correspondence; annotations cannot become
semantic relationship endpoints.

All drawing references are view-local. Node parents may be occurrences or
group visual nodes and must be acyclic. Bounds are **absolute view coordinates**;
reparenting never moves a drawing or creates a semantic relationship.
Container movement includes descendants once. Single and batch drawing deletion share one union of dependent lines and one Undo. They preserve common concepts and other views. Container deletion retains its
children at their absolute coordinates and reparents them to the surviving
ancestor. Dependent annotation connectors are removed with their missing ends.

Styles use closed validated fields: fill/opacity/gradient, stroke/width/dash,
font family/size/weight, text color/alignment/position, icon color/visibility,
shape, embedded image placement/visibility, line/label geometry and `labelAnchor: source|middle|target`, label template, endings
and stroke-from-fill. Unknown CSS, URL values and arbitrary fields are refused.
An empty style means declared renderer defaults, not a materialized set of colors.
Semantic line dashes and endings always follow the relationship type. Saved
custom dash/ending fields remain round-trippable but are ignored with a visible
warning; the visual-connector editor owns arbitrary endings and dashes.
A specialization profile may have `imageAssetId` in V4 only; a drawing's local
`style.image` is independent. Removing a used resource is refused.

## Portable resources and limits

An asset is `{id,name,mediaType,encoding:'base64',data}`. Supported media types
are PNG, JPEG, static WebP and an inactive SVG subset. Base64 is canonical and
included in the existing 256 KiB per-file / 8 MiB total byte limits. Native
file/entity budgets are 8192 / 32768, including all new record IDs and anchors.

Before browser decoding, the shared core reads image dimensions from PNG IHDR,
JPEG SOF and static WebP VP8/VP8L/VP8X headers. Incomplete framing, animated
resources and contradictory WebP dimensions are refused. Each side is at most
8192 pixels, each asset at most 16 * 1024 * 1024 declared pixels, and all assets
at most 64 * 1024 * 1024 declared pixels. The aggregate bound limits potential
RGBA pixel storage to 256 MiB before renderer/cache overhead. Header checks do
not replace the platform image decoder or validate compressed pixel contents.

SVG uses the same core validator in Node, browser, envelope, native and Git
imports. It permits a closed static drawing/gradient/text vocabulary, bounded
nesting and internal paint references. Scripts, event attributes, CSS/style,
foreignObject, external resources, declarations and entity definitions are
refused; unsupported SVG is never silently sanitized. Intrinsic width/height
must be positive finite pixel values when present; viewBox dimensions obey the
same image size limits. Missing intrinsic dimensions use bounded viewBox or
300×150 defaults. This deliberately accepts a documented subset, not all SVG.

Header references: [PNG chunks](https://www.w3.org/TR/PNG-Chunks),
[ITU-T JPEG](https://www.w3.org/Graphics/JPEG/itu-t81.pdf),
[WebP container](https://developers.google.com/speed/webp/docs/riff_container),
[WebP lossless header](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification).

## Paths and operations

```text
model/folders/fld-UUID.json
assets/ast-UUID.json
views/view-UUID/visual-nodes/vnd-UUID.json
views/view-UUID/visual-connectors/vcn-UUID.json
```

All IDs join the global uniqueness budget. The native directory scanner,
owned-export guard, `.arkita` envelope and Git codec own these exact namespaces;
unknown semantic fields, wrong-case/unsafe paths and broken typed refs fail.
Whole-record Git merge uses the same V4 validator; a structurally invalid union
requires an explicit whole-model choice.

The in-session fragment format is `arkita-fragment@2`. It captures every
selected drawing kind, selected containers' descendants, closed internal
connections, referenced shared concepts, profile definitions and embedded
resources. Paste remaps all drawing/anchor/parent refs and preserves assets;
clone also remaps concept IDs. Copying a child alone detaches its parent on
paste. Local reuse stays scoped to the originating document session and stale
records are refused. Portable clone uses a separate `arkita-portable-fragment@1`
wrapper around validated native V4 files: all required profiles/assets and whole
referenced views are disclosed, then concept/profile/asset/view/drawing IDs are
remapped. See [FRAGMENT-COPY.md](FRAGMENT-COPY.md) for Cut acknowledgement and
independent window Undo. Duplicate View uses the same typed drawing remapper.

Atomic commands include folder CRUD/membership moves, model-only concept
creation/duplication, resources, visual node/connector CRUD, style set/reset,
reparenting, geometry and metadata updates. Existing store validation and
Undo/Redo wrap the complete candidate. `conceptTypeChangeImpact` uses the
private verified registry for an all-model preview; `changeConceptType` refuses
new proved forbidden relationships. UNKNOWN decisions remain explicit and do
not become a conformance claim.

Mermaid export refuses views containing V4 visual records, styles, hidden lines
or geometric nesting that it cannot encode. Native save remains lossless.
Renderer/GUI and Windows acceptance are separate release evidence.


## Archi source provenance (Arkita 0.7)

Imported project, folder, concept, relationship, view, occurrence, connection,
visual node and visual connector records may contain `archiSource`:
`{modelId, id, type, version: "5.0.0", domain?}`. These are nonempty bounded
source strings; unknown fields and versions are rejected. They are inert
source identifiers, never native references, executable content or user
properties. Native ID remapping leaves this record unchanged. Multiple
independent copies may therefore trace to the same source ID.

The table is reconstructed from the saved records via **File → Archi transfer
correspondence** / **Файл → Соответствия переноса из Archi**. The `.arkita`
container and native format version remain unchanged. Older Arkita releases
with a closed pre-extension v4 schema reject these records rather than
silently deleting provenance. Use Arkita 0.7 or later for imported models;
models without this optional field retain their existing encoding. CSV, XLSX
and Exchange XML exports explicitly report that this source metadata is not
included; the native file is authoritative.
