# Model-owned customization profiles

This bounded Chapter 14 implementation stores user-authored attributes and named
specializations. It preserves the existing concrete concept type, identity,
endpoints, drawings and permission decisions. Overall ArchiMate conformance is
still **UNKNOWN**. These records never register a trusted language adapter,
execute rules, load graphics, navigate URLs or establish permission evidence.

## Source scope and native choices

The source locators are C260 §1.3(4) and §1.5 (printed 2; PDF 20), §14.1
(printed 111–112; PDF 129–130), §14.2 (printed 113–114; PDF 131–132), and junction
scope in §2.9/§5.5.1 (printed 5/45; PDF 23/63). The supplied specification was
independently reviewed for the design. Its SHA256 is
`a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093`.
This document is an original implementation summary; no source prose or artwork
is bundled. [Official publication](https://publications.opengroup.org/standards/archimate/c260).

Independent typed definitions, optional changeable defaults, concrete concept
specialization and multiple named specializations are the selected source scope.
The following encodings, limits, unset policy, live-default behavior and
attributes/specialization purpose split are **application choices**, not claims
that the source prescribes them. Model Exchange support is not claimed. There is
no restrictions language, custom SVG/icon upload, inheritance hierarchy,
predefined profile catalog. The separate [Chapter 13 viewpoint implementation](VIEWPOINTS.md) selects exact base types and reuses this label resolver; it adds no second profile registry.

## Authoring in the editor

Use **Профили модели…** in the left model panel. Create or edit a name, purpose,
concrete target checkboxes and an attribute-definition JSON object. The dialog
includes syntax examples. Names may be duplicated; choices show targets and the
full immutable profile ID. The manager blocks deletion of a used definition and
lists its usages. An unused definition is deleted only after a named confirmation.

Select an element, either kind of junction, or a relationship. Its **Профили
концепта** inspector lists eligible definitions, current applications and each
attribute's value/origin. **Применить…** opens the values draft. **Значения /
сброс…** edits an existing application. **Снять профиль…** confirms removal of
that application's overrides from the shared concept in every view.

The JSON values editor accepts explicit `false`, `0`, `""`, `[]` and complete
Structure values. Remove a key, or use its reset button, to inherit the current
default (or become unset). `{}` clears every override but retains the application.
Changes commit only on Save/Apply. Invalid JSON/types show an error and leave the
model and history unchanged. Close/Escape discards a draft. Changed model,
revision, view or selection invalidates a draft; it must be opened again. An
unchanged imported multiline profile name preserves its exact original text.

Specialization-purpose applications display one authored-order `«Alpha, Beta»`
label. Attributes-purpose applications do not add a stereotype. Element labels
use a separate lane above the contour; junction labels sit below their caption;
relationship labels sit above their normal label. Base graphics and hit targets
are retained. Long canvas labels are shortened; SVG title/accessibility text and
the inspector retain the full literal text. DOM tests do not establish visual rendering or physical file-picker behavior.
Browser QA is optional development evidence; actual Electron/native-dialog and
Windows acceptance are separate desktop gates (UNRUN), and independent persistence
acceptance remains HOLD.

## One native representation

Core format 2 and `schemka-archimate4@2` remain the only supported identities.
The existing envelope stays version 1. This is an additive expansion of the one
current validator, with no legacy branch, capability negotiation or conversion.

State optionally has a **nonempty array** `customizationProfiles`. Each definition
has exactly `id`, `name`, `purpose`, `targets`, `attributes`. IDs are globally
unique `prf-UUIDv4`. The core file is
`model/customization-profiles/<id>.json`. Definitions count toward existing file,
entity, JSON-node and byte budgets. All old `properties` remain string maps.

- `name`: nonblank string, at most 8192 UTF-16 units; display text is preserved.
- `purpose`: `attributes` or `specialization`.
- `targets`: nonempty unique `{kind,type}` pairs. Kind is `element`, `junction` or
  `relationship`; type belongs to that kind's existing concrete catalog. No
  wildcards, abstract/new types or permission fields.
- `attributes`: 0–64 named entries, each exactly `{type}` or `{type,default}`.
  Attribute and Structure field names are nonblank, bounded and reject unsafe
  JSON keys. A display name such as `constructor` is harmless literal text.

A concept optionally has a nonempty, ordered `profileApplications` array. Every
entry is exactly `{profileId,values}`. `values` contains only declared explicit
overrides. A profile ID may occur only once on a concept. Values belong to the
concept, never its occurrence/connection. Different profile IDs have independent
attribute namespaces even when names match.

Both optional collections must be absent when empty; an explicitly empty array
rejects. Commands remove the field when the last entry is removed. File import
creates the root collection only when profile files exist. Applications resolve
after indexing all definitions, so input file order is immaterial. Canonical
files sort by path; application order is retained. Unenhanced canonical files and
containers remain byte-identical through the new reader. The frozen known older
reader rejects these extensions; unknown reader versions are not certified.
`viewpoints` and `view.viewpointId` belong to the separate [viewpoint contract](VIEWPOINTS.md)
and are not profile aliases.

## Types and values

Defaults and overrides use exactly the same domain checks. No coercion or `null`.

| Type | Native domain |
|---|---|
| String | Bounded string, including `""` |
| Integer | JSON safe integer; not negative zero |
| Real | Finite JSON number with JavaScript precision; not negative zero |
| Boolean | Actual `true` or `false` |
| Currency | Exact `{amount,currency}`; amount is a bounded decimal string matching `^-?(0\|[1-9][0-9]*)(\.[0-9]+)?$`, currency is three uppercase ASCII letters |
| Date | Valid Gregorian `YYYY-MM-DD`, year 0001–9999 |
| URL | Bounded absolute URL, explicit scheme and platform URL parse; no ASCII whitespace/control characters |

Currency preserves lexical precision, including trailing zeroes; no arithmetic,
exchange rate, rounding or ISO code membership is implied. URL strings are inert,
including non-HTTP schemes; spelling is not normalized and nothing is fetched.

Compound `type` is either `{"kind":"Structure","fields":{"name":"String",
"count":"Integer"}}` or `{"kind":"List","itemType":"String"}`. Structure has
1–64 basic-typed fields. Present values must contain all and only those fields.
A List is homogeneous and may be empty. `itemType` can be a basic type or a
Structure; nested Lists and recursive Structures are intentionally unsupported.
Existing JSON/file/total-byte budgets bound Lists. Unknown schema fields,
accessors, unsafe keys and duplicate decoded JSON keys reject at trust boundaries.

`resolveProfileValue(definition, application, attributeName)` returns
`{origin:"override",value}`, `{origin:"default",value}`, or `{origin:"unset"}`.
Own-property presence determines precedence, so false/zero/empty values win.
Compound returned values are detached. The helper never writes defaults into an
application. Removing/editing a default immediately affects inheriting
applications while preserving overrides. Pure lookup/label/usage helpers expect
records from `validateProject` or a store snapshot; they reject executable/non-JSON
objects before reading their fields. They are not an alternate import validator.
`createCustomizationResolver(state)` prepares detached labels and usage references
once per snapshot. Its read-only `labelFor(conceptId)` and `usagesFor(profileId)`
lookups are reused by the canvas/Fit and profile manager. Neither loop revalidates
the whole model for each drawing or definition.

## Transactional commands

Call the existing `store.execute(command, baseRevision)`:

1. `createCustomizationProfile`: `definition` has editable fields only; result
   uses `created.profileId`.
2. `updateCustomizationProfile`: `profileId`, replacement `definition`; ID stays.
3. `deleteCustomizationProfile`: `profileId`; a used definition fails `REFERENCE`
   with usage information. No implicit detach.
4. `setProfileApplication`: `concept:{kind,id}`, `profileId`, `values`; new
   applications append, existing ones replace their overrides in place.
5. `removeProfileApplication`: `concept:{kind,id}`, `profileId`; absent application
   fails `REFERENCE`. Other applications and base concept data stay intact.

Whole-candidate validation rejects incompatible target/type/attribute edits and
`updateJunctionType` changes that invalidate applications. It never drops or
coerces data. Explicitly reset/detach first when needed. Failed commands, stale
revisions and failed imports retain snapshot, revision and both history stacks;
failed file loads retain the native dirty baseline. Successful native load clears
old undo/redo history; new edits after reopening have normal undo/redo.

Affected views include all drawings of changed concepts. Definition edits report
all applied concepts' occurrence/connection views. Unused creation/deletion has
no affected drawing views. Deleting a drawing retains concept applications;
deleting a concept removes its owned data and retains shared definitions.
Duplicate views reuse the same applications. Undo/redo restores exact records.

## Export and verification boundaries

Native save includes all definitions and applications. Selected-view Mermaid
fails `MERMAID_UNSUPPORTED` before output when a drawn concept has any application,
including an attributes-only or zero-attribute profile with empty `values`.
Unused definitions and applications solely on undrawn concepts do not block or
leak into an ordinary selected view. Copy/download failure sends no output and
does not clean the native session. Existing junction/connection-endpoint refusal
still applies.

Tests cover domains, lifecycle, guarded drafts, exact native compatibility,
selected-view refusal, the complete ordinary 42×42×15 matrix, 6448 concept queries
and all 38 existing qualified junction graphs. The eight ordinary UNKNOWNs,
junction Aggregation/Composition uncertainties and genuine-evidence boundaries
are retained. None of this changes whole-model conformance from UNKNOWN.
