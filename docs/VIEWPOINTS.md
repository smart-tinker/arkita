# Project-owned viewpoints (local Chapter 13 increment)

A viewpoint describes stakeholders, concerns, purpose/content classifications,
exact metamodel types and a representation convention. A view may reference one
reusable definition. The editor applies it to the model-wide eligible chooser
and the stored drawings on that canvas. This is a bounded local implementation,
not independent acceptance or a full-language conformance certificate. Overall
conformance remains **UNKNOWN**; concern satisfaction and stakeholder agreement
require human review.

The design was checked against owner-supplied C260 §1.3 item 3 (printed 2/PDF 20)
and §§13.1–13.4.2 (105–110/123–128). The source SHA256 is
`a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093`.
This original implementation summary includes no specification prose or artwork.
The following schema, cardinalities and filtering choices are application choices.

## Author and apply

Choose **Viewpoints модели…** in the left panel, then **Создать viewpoint**.
Name and documentation are text. Stakeholders and concerns use JSON arrays of
1–64 nonblank strings, for example `["Application owner"]`; they do not create
model Stakeholder concepts. Purpose permits one or more distinct `designing`,
`deciding`, `informing` labels. Content similarly permits `details`, `coherence`,
`overview`. These descriptions do not impose a domain count or validate concerns.

Select exact element, junction and relationship types. Empty lists select none.
Select all enumerates today's concrete types; it is not a wildcard for future
catalog entries. Access, ReadAccess, WriteAccess and ReadWriteAccess are separate
choices. Grouping, Location and junctions have no implicit exception.

The representation is the existing ArchiMate diagram renderer, name/type labels
and manually chosen view layout. Existing customization labels use their shared
resolver unchanged. This does not claim complete standard glyph coverage. There
is no extra renderer, preset catalogue, script, SVG/CSS upload, automatic model
population/layout or profile/attribute query engine.

Use **Governing viewpoint** above the canvas to bind or explicitly unbind the
current view. The expandable scope section shows concerns/classifications,
exclusion counts and all eligible model concepts, distinguishing those not yet
drawn. **Добавить в этот вид…** reuses the normal occurrence/connection tools.
Relationships require the exact visible drawings/anchors of both ends. The
palette and endpoint picker follow this selection; the model tree remains the
full model for inspection. Empty projections display a notice and safe Fit bounds.

A definition can govern many views. Edit shows all affected view IDs before Save.
Copy allocates a new definition ID. Delete refuses a referenced definition and
lists using views; unbind/reassign explicitly first. Each accepted operation is
one existing store transaction with exact Undo/Redo. Cancel, invalid and stale
submits do not commit. Changing projection cancels drawing gestures, inline edits,
menus and selection, then restores focus to the visible binding control.

## Non-destructive projection

Selection starts with all exact type matches, then removes relationships whose
endpoint concepts were excluded, propagating through dependents to stability.
It never grows from element roots, so self and mutual relationship-endpoint
cycles survive when otherwise selected. Drawing projection removes exact excluded
occurrences and connections, then propagates missing exact drawing/host endpoints.
An alternative occurrence or connection for the same model record is never a
substitute. Anchors, route order, IDs, multiplicities and geometry remain intact.

Projection is detached transient data; it has no history entry and is never saved.
The core still accepts structurally valid out-of-scope objects and stored drawings.
No endpoint permission, graph rule or trusted profile registry changes. Relationship
and junction diagnostics always assess the **full model**, and the model report
identifies unshown relationship finding counts. A partial junction picture cannot
become a new normative graph finding.

There is no separate Show all inspection mode. The binding control explicitly
labels ungoverned manual views. Filtering is neither redaction nor access control:
**a full native save contains hidden concepts and drawings**.

## Viewpoint grammar, introduced in native v2

The following viewpoint grammar originated in native v2 and remains supported
by the current [Native V4 writer](NATIVE-V4.md). The metamodel is
`schemka-archimate4@2`, transport envelope 1. Frozen V2/V3 readers validate old
files before detached in-memory migration; saving requires a separate target.

- Optional semantic root `viewpoints` is a nonempty array; omit it when empty.
- The native `schemka.json` header carries codec-only `viewpointFormat: 1` exactly
  when definition files exist, including unbound and empty-selection definitions.
  Import requires this exact marker/definition agreement, then removes only the
  validated codec field from the semantic project record. It is not editable.
- Definition IDs are globally unique `vpt-UUIDv4` and count toward existing entity,
  file, depth, node, string and byte budgets.
- Each definition is stored at `viewpoints/<id>.json` and has exactly `id`, `name`,
  `documentation`, `stakeholders`, `concerns`, `purpose`, `content`, `selection`,
  `representation`.
- `selection` has exact duplicate-free arrays `elementTypes`, `junctionTypes`,
  `relationshipTypes`, each bounded by the corresponding current catalog.
- `representation` is exactly `{kind:"diagram",notation:"archimate",labels:"name-and-type"}`.
- Optional `view.viewpointId` references an existing definition; omit it to unbind.
  Null or a dangling reference is invalid in stored data. The command uses null
  to remove the optional field.
- Definitions are separate from `customizationProfiles` and `profileApplications`.
  Unknown or executable fields reject; names or source claims cannot grant authority.

Commands are `createViewpoint {definition}`, `updateViewpoint {viewpointId,definition}`,
`setViewpoint {viewId,viewpointId|null}`, `deleteViewpoint {viewpointId}`. Create/update
use all definition fields except ID. `createView` accepts optional `viewpointId`;
`duplicateView` preserves the binding and remaps drawing/anchor IDs as before.
Updates return every referencing ID in `affectedViewIds`.

Public `selectViewpointConcepts(state,id)` and `projectView(state,viewId)` operate on
validated snapshots. They return detached matching IDs, exclusions and, for a view,
drawing records plus undrawn concepts. IDs/explanation lists are sorted; drawing
arrays preserve stored order. Exclusion reasons distinguish `type-excluded`,
`endpoint-concept-excluded` and `drawing-endpoint-excluded`. No result is a normative
ALLOWED/FORBIDDEN decision.

## Compatibility and gates

Previous readers reject the guarded native header before accepting an enhanced
model. In particular, the frozen old Electron directory scanner would otherwise
ignore unbound definition files as unowned content. The conditional marker closes
that data-loss gap without changing ordinary or Chapter 14-only bytes. Native
format remains 2. Earlier standalone Ch13 draft files with definitions but no
marker are explicitly unsupported; there is no converter or legacy import branch.
Missing, unsupported, duplicate or mismatched metadata fails before replacement. Failed browser file-session loads preserve the open
model, revision, undo/redo and save baseline. Removing a feature explicitly is a
model edit, never an automatic downgrade.

Mermaid export refuses a **governed selected view** with native-save guidance. It
cannot preserve this definition/binding and must not export the unfiltered stored
content. Unrelated unbound view exports retain their existing behavior and limits.
The existing browser file-session codec roundtrips all definitions/bindings and
hidden data. The bounded Electron native directory scanner owns the exact
`viewpoints/vpt-UUIDv4.json` namespace with existing path, no-follow and budget
checks. First/last definition edits add/remove the marker through the same delta
journal as every other native record; both explicit recovery choices include it.

Local core, IO, controller and production-DOM checks exercise cycles, exact hosts,
metadata, hostile input, byte preservation, history, real editor controls and file
sessions. DOM checks do not establish browser rendering, real pointer capture,
physical file-picker behavior. Real temporary filesystem integration is tested
separately. Actual Electron/native-dialog GUI, independent persistence acceptance
and release approval remain separate and pending; independent acceptance is HOLD.
Browser QA is optional development evidence, not a desktop release gate.
