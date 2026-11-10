# Arkita interchange and templates

The native V4 validator remains authoritative. Imports prepare detached models;
the UI previews every changed record and applies one `applyProjectSnapshot`
command. A rejected, cancelled or stale import does not change the model, file
baseline or Undo history. Existing locked drawings also retain the core lock
boundary. A no-op creates no command.

## Native merge

`previewNativeMerge(target, source, options)` unions records, preserving local
records absent from the incoming model. `ids` is `reuse` (match exact IDs) or
`remap` (independent IDs). Existing-object updates, folders and project metadata
are separately selectable. A shared ID with another record kind/path or a changed
concept type is rejected; the normal change-type command remains explicit.

Properties are ordered V4 rows, including duplicate keys. `replace` replaces an
incoming owner's whole property list. `merge` keeps local rows whose keys are not
incoming, then appends every incoming row in source order. Incoming empty lists
clear values only in replace mode. Every before/after value is in the preview.
Relationship endpoint changes must leave all drawings consistent; the entire
package fails otherwise. Proved relationship blockers are rejected; a successful
structural import is not a declaration of full normative conformance.

## Arkita CSV 1

This is an Arkita contract, not Archi 3.2 CSV. A set contains up to six UTF-8 files:
`<prefix>-model.csv`, `-elements.csv`, `-junctions.csv`, `-relationships.csv`,
`-properties.csv`, and `-profiles.csv`. Each starts with four cells:

```
arkita-csv,1,elements,canonical
```

The chosen delimiter applies to this row and all others: comma, semicolon or tab.
The next row is a closed, unique column-name header. The columns are declared in
`src/csv.js`. There is no implicit encoding detection: UTF-8 with or without BOM
is accepted. Quoted fields preserve commas, separators, quotes, CR/LF, empty
lines, Cyrillic and emoji. Only an **unquoted one-cell row** beginning with
`#arkita-comment ` is a comment. Other `#` text is data.

Concept IDs have the normal native UUID format. A missing ID creates one; links
must name an explicitly resolvable ID. Duplicate IDs fail with filename, physical
line and field. Partial headers update only supplied fields. Omitted records are
not deleted. A type change is refused. Relations retain typed source/target,
profile applications, multiplicity and junction role. Multiplicity has separate
`sourceMultiplicityPresent` / `targetMultiplicityPresent` booleans so an empty
string remains different from an absent field. A supplied false clears the field.
Profile applications and full profile definitions are bounded JSON cells using
the same strict parser as native records; unknown legacy attributes are rejected.

Property rows use kind, ID, zero-based contiguous position, key and value. A
single position `-1` with empty key/value explicitly represents an empty list.
Repeated keys are ordinary data; repeated positions are an error. Project
properties are applied only when project metadata import is enabled.

Maximum input: 18 MiB/file, 32 MiB/set, 100,000 physical records, 32 columns,
262,144 UTF-16 units per field, plus the stricter native-model budgets.

`flattened` replaces line breaks only in the output. `spreadsheet-text` prefixes
every nonempty data cell with an apostrophe. These modes carry a loss report and
cannot be imported as canonical data. For exact spreadsheet text use XLSX.
Diagrams, resources, folders and viewpoint definitions do not belong to CSV;
the export dialog discloses this and requires acknowledgement.

## XLSX

The same six tables form six named worksheets. Cells use `inlineStr`, preserve
whitespace and CR characters, and never contain formulas or external links.
This follows the [OpenXML Cell contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell?view=openxml-3.0.1).
A cell above Excel's 32,767-character limit or text not representable in XML 1.0
fails before writing. Output is an 18 MiB-bounded stored ZIP package. XLSX import
is outside this contract. Native save reports success only after actual complete
write/readback; the UI does not mark the Arkita file saved by exporting it.

## Template package 1 and local library

`.arkita-template.json` is a closed `arkita-template` version-1 JSON envelope.
It contains bounded metadata and the existing native `.arkita` envelope as
strings. Duplicate/unknown envelope keys and incompatible versions are refused.
The 18 MiB package includes native resources, without filesystem references.
Metadata contains an independent template ID, name, description, category list,
kind (`model`, `board`, `pattern`), source view ID and a separately chosen preview
view ID. A preview selection cannot change which board/pattern is inserted.

Whole-model instances remap every native ID, anchor and structural reference;
text and typed attribute values are opaque and never rewritten. Board packages
include the selected view and transitively referenced views, the necessary
concept endpoints, profiles, viewpoints and embedded resources. They exclude
unrelated resources, folders and source-project metadata. Pattern capture uses
the core portable-fragment closure: selected visible drawings and connected
in-scope lines, required concepts, and whole referenced views; external lines
and source folders are not copied. The UI discloses this scope.

Insertion explicitly chooses independent concepts or exact-ID reuse; reused
concept metadata is retained. Every copied drawing gets an independent ID.
Source templates remain untouched. Creation proposes a new unsaved document;
insertion changes the existing model in one Undo transaction.

The local library is one complete browser-storage value, at most 100 templates
and 4 MiB, keyed `arkita.templates.v1`. Quota errors retain the prior collection.
Large packages can still be opened directly from disk and exported without
registration. Renaming/removing categories leaves template contents intact;
removing a library entry never deletes an exported file.

## Informal boards

Canvas and sketch are native view presentation kinds. Their notes, groups,
images, links, instructions, styles and locks use the shared visual-record
contract, not architectural concepts. The templates dialog creates boards and
sets per-board/default backgrounds; hiding creation commands preserves existing
boards. Sketch conversion requires an explicit map for every card and line,
including explicit skips. It creates a separately validated architecture view
and preserves the complete original board. Reuse never overwrites an existing
concept's metadata. No relationship is inferred from visual containment.

## XML Exchange: explicit 3.1 syntax adapter

The adapter targets the **3.1 XSD**, with namespace
`http://www.opengroup.org/xsd/archimate/3.0/`, retaining upstream **Preliminary**
status. It does not claim a current/final Open Group 4 exchange standard.
The three upstream schemas are unmodified, pinned to official Archi commit
`9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a`. Every URL and SHA-256, W3C XML namespace
schema and Simple Dublin Core schema is in `schemas/exchange-3.1/source.json`.
`arkita-exchange.xsd` assembles these schemas; no arbitrary schema can be loaded.

`validateExchangeXml` runs libxml2-wasm 0.7.2 in a fresh Node worker. It clears
native input callbacks and registers only the fixed in-memory schema files.
DTD/entities, XInclude and processing instructions are rejected before parsing;
parsing uses NONET/NO_XXE, never entity substitution, DTD loading, HUGE or XInclude.
Input is UTF-8, at most 8 MiB, 100,000 nodes, depth 64, and 262,144-character tags.
A five-second timeout or cancellation terminates the worker; documents and
validators are disposed. V8 heap limits do **not** cap WASM linear memory: the
input/node/depth budgets and worker lifetime are the additional bounds.
No renderer WASM/network permissions are added. Syntax, XSD and native-conversion
errors are separate. Optional schema export includes the exact files, provenance
and complete redistribution notices alongside the XML.

The mapping is explicit and independent of legacy semantic rules:

| Field | Transfer rule |
| --- | --- |
| Unchanged concept type names | Explicit closed intersection of pinned 3.1 XSD and native catalogue in `exchange-xml.js`; no normative-conformance inference |
| Service/Process/Function/Event/Collaboration | Export requires a chosen Business/Application/Technology type; import collapses that listed legacy type and reports the lost layer distinction |
| Role | Explicit BusinessRole choice on export, reported BusinessRole→Role on import |
| Constraint, Gap, Interaction and unknown types | Refused; no invented type or implicit substitution |
| Access variants, directed Association | Named accessType/isDirected mapping; native Archi integer mapping is separate |
| Influence strength/modifier | Nonempty legacy modifier refused; no loss of relationship meaning disguised as success |
| Name/documentation/properties | Escaped Unicode and CR, ordered duplicate property rows; selected name/documentation language, additional translations explicitly reported; language tags are not native metadata |
| Semantic IDs/references | Native UUID IDs retained for Exchange, otherwise remapped; all references validated before proposing a new document |
| Folders | Identity, parent hierarchy and member order; equal names remain separate; optional omission is reported |
| Views/nodes | Diagram, Element, Label→note, Container→group; nesting and coordinates; native negative/fractional coordinates require reported rounding/clamping to XSD nonnegative integers |
| Connections | Occurrence-to-occurrence Relationship and absolute bends; attached-line endpoints omitted with explicit loss, semantic relationship retained; anchors become reported bends |
| Drawing styles | RGB fill/stroke/text, fill alpha, line width, font name/size/plain/bold; unsupported style fields reported, unrepresentable XSD values rejected before save |
| Dublin Core | Optional creator/description/rights in UI; all 15 Simple DC text fields in API; import preserves them as explicit `dc:*` property rows; empty fields absent |
| Profile applications, definitions, viewpoints, resources | Explicit loss report, never claimed portable standard semantics |
| Visual images, view references, legends, visual connectors | Explicit loss/refusal; not silently converted to semantic objects |
| Unknown attributes/elements/vendor extensions | Every unconsumed attribute/subtree is listed; XSD-strict foreign extensions without a bundled schema fail validation |

The user reviews the loss report before export or opening a separate unsaved
model. Neither operation modifies the source model or marks its local file saved.
Real XSD validation checks syntax/references; native validation and existing
proved relationship blockers check the converted graph. UNKNOWN stays UNKNOWN.

Portions of this software may use XML schemas Copyright © 2011 DCMI,
the Dublin Core™ Metadata Initiative. These are licensed under the
[Creative Commons 4.0 Attribution license](https://creativecommons.org/licenses/by/4.0/).
The [unmodified Simple DC schema](https://www.dublincore.org/schemas/xmls/simpledc20021212.xsd)
and all notices ship in the schema directory and optional exports.

## Native Archi conversion

`.archimate` is a separate `XMLResource` format, namespace
`http://www.archimatetool.com/archimate`, pinned native version **5.0.0**.
The official `archimate.ecore`, `ArchimateResource.java`, `IAccessRelationship.java`
and synthetic upstream fixture were read at the same pinned commit; exact URLs
and hashes are in `test/fixtures/archi-source.json`. Our committed test fixture is
independently synthetic, not copied upstream source.

`previewArchiXml(bytes, {DOMParser, decisions, ids})` returns detached
`{snapshot, diagnostics, decisions, ids, mappings, losses, version}`. Diagnostics
separate `errors`, `transformations` and `losses`, with original object ID/type,
view context and all affected views for shared concepts. Independent semantic
checks still run when a diagram or metadata is invalid. Unsafe/malformed XML,
wrong namespace/version and resource violations can prevent further parsing;
they produce an explicit document blocker. No failed or unresolved plan has
an applicable snapshot. `importArchiXml` remains the strict throwing wrapper.

The dialog keeps target IDs stable while individual decisions change. Analysis,
CSV report export and cancellation never change the current model. Explicit
application creates a separate unsaved model, after rechecking the original
store, revision and document token. The report and correspondence table can
be saved even when application is blocked. Large reports load rows in batches;
the exported CSV contains the entire report/table. CSV cells are inert quoted
UTF-8 spreadsheet text, with a text apostrophe prefix for source-controlled
values. The saved native `archiSource` fields make the correspondence table
available again after reopening; user properties remain unchanged.

### Explicit supported type mappings

| Native Archi 3.x source | Arkita 4 target |
| --- | --- |
| BusinessService, ApplicationService, TechnologyService | Service |
| BusinessProcess, ApplicationProcess, TechnologyProcess | Process |
| BusinessFunction, ApplicationFunction, TechnologyFunction | Function |
| BusinessEvent, ApplicationEvent, TechnologyEvent | Event |
| BusinessCollaboration, ApplicationCollaboration, TechnologyCollaboration | Collaboration |
| BusinessRole | Role |
| Gap | Assessment, **only after an individual explicit decision** |
| AndJunction, OrJunction | Same type |

The unchanged supported intersection is Node, Device, SystemSoftware,
CommunicationNetwork, Path, ApplicationComponent, ApplicationInterface,
DataObject, BusinessActor, BusinessInterface, BusinessObject, Product,
TechnologyInterface, Equipment, Facility, DistributionNetwork, Artifact,
Material, Grouping, Location, Stakeholder, Driver, Assessment, Goal, Outcome,
Principle, Requirement, Meaning, Value, Resource, Capability, ValueStream,
CourseOfAction, WorkPackage, Deliverable and Plateau. Unknown types, including
unmapped Constraint/Interaction variants, block application. Source model ID,
source type/ID/version and known source domain are retained separately.
Collapsed services/functions do not lose their source domain metadata.

Realization, Association, Flow, Composition, Aggregation, Assignment, Serving,
Access, Influence, Triggering and Specialization retain their supported
relationship family. Archi Access integer **0/1/2/3 → WriteAccess/ReadAccess/
Access/ReadWriteAccess** follows the pinned native interface, not the Exchange
enum. Directed Association becomes DirectedAssociation. Unsupported Influence
strength blocks application. Endpoint identity, direction and type permissions
are rechecked after conversion; UNKNOWN does not become normative approval.

### Structure and supported layout

Model/folder/concept documentation and ordered duplicate properties, folder
membership/order/hierarchy, ArchimateDiagramModel/SketchModel,
DiagramObject/Note/Group/SketchModelSticky/SketchModelActor and shared semantic
identity are retained. Parent-relative child bounds become absolute native
coordinates; nesting, bounds, z-order, colors, line width/opacity, supported
font family/size/weight and text alignment are preserved. Font pt→px at 96 DPI
is reported. Italics and unknown styles/extensions are explicit losses.

Manual Draw2D relative bendpoints become ordered absolute points using the
pinned weighted-anchor formula, with explicit notices for 0.1-grid rounding.
Connection source/middle/target label placement is retained as `labelAnchor`;
exact Draw2D text metrics and clearances differ and are disclosed before apply.
Archi Manhattan paths are computed by its router rather than serialized;
Arkita recomputes an orthogonal path with an explicit loss notice. Reopening
preserves the stored native geometry and does not migrate or auto-layout it.
Image/reference drawing types are blocked rather than silently omitted.
Different native versions and ZIP/resource containers remain unsupported.
No Archi 3.2 relationship rules are installed into Arkita 4, and structural
validation does not certify semantic equivalence or full conformance.

## Remaining native acceptance

Windows native picker, fresh-output directory, clipboard, Excel
and real GUI acceptance are distinct from Node/DOM checks. Visual inline text,
lock gestures, image resize and presentation behavior use the shared visual UI
and need its connected acceptance checks.
