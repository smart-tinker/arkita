# Relationship-end multiplicity annotations

Multiplicity is optional raw text on each relationship end. The current catalogue has 42 element IDs and 15 relationship IDs (11 base relationships plus four nominal variants). Broad AM4 coverage remains partial; normative assessment stays UNKNOWN. Canonical v2 includes separate junction applicability checks. Site 25 is the published standalone typed-only baseline: GitHub `2c5f3c0`, Sites source `40475eda133c99109655ee57839a75c21712a10e`, deployed 2026-10-13 at 13:58:19 UTC with public access revision 2 unchanged. That baseline passed 1,067 tests, 145 syntax checks, clean build and independent review. Bounded live-browser checks covered the standalone UI, Help/diagnostics, palette order, exact-ID reuse, geometry, Undo/Redo and download. Its 7,923-byte OFF/ON downloads matched SHA256 `77bdb4bf16e201e7afb8b5182214f68bd982c3e624556cb13dacf5805cd73a89`; local codec roundtrip passed, but browser reopen of that file was not run. The current category-disclosure, accessible-hint and Device-badge increment is local, unpublished and browser-unverified. Its stable post-review aggregate passed 1,074 tests with zero failures/skips, 145 syntax checks and a clean build; independent implementation review passed without remaining findings. Full ArchiMate 4 remains the release 1.0 acceptance goal; current coverage is partial and whole-model conformance remains UNKNOWN. See [VALIDATION.md](VALIDATION.md).

## Technical evidence

[MULTIPLICITY-SOURCES.json](MULTIPLICITY-SOURCES.json) records the owner-provided C260 April 2026 attachment's SHA-256 and the technical facts relayed from its inspection. Section 5.6, printed page 47 (one-based PDF page 65), supports the selected conventions: a positive integer singleton, `*`, `0..*`, and a nonnegative ascending bounded integer range. **`1..*` is additionally confirmed by Example 5-16, printed page 48 (PDF page 66).** It must not be grouped with generalized, unverified `n..*` forms.

These observations are not a full EBNF. The selected evidence does not establish every other `n..*` form, lexical variation or standalone `0`; it does not justify declaring zero normatively forbidden. The checked section supplies no default for omitted multiplicity. Syntax evidence and actual graph-cardinality semantics remain separate.

The linked public [C260 publication listing](https://publications.opengroup.org/standards/archimate/c260) identifies the publication; it is not a public download link for the supplied attachment. No PDF prose, images, standard artwork or document is reproduced here. This fact record makes no licence interpretation or acceptance claim, and does not extend the independent notation source's CC BY declaration to C260.

## Stored data and edits

- `sourceMultiplicity` and `targetMultiplicity` are optional relationship-level strings attached to the stored source and target respectively. The ReadAccess arrow direction does not swap those roles.
- Each string has a **local limit of 128 UTF-16 code units**. This is an application bound, not a C260 requirement or a count of Unicode characters.
- An omitted field, an explicitly empty string and `*` remain distinct. The editor does not insert defaults or trim text. Untouched or reverted text retains its original line endings; a genuine textarea edit stores the browser-provided draft, whose line endings are LF.
- `updateRelationshipMultiplicity` leaves unspecified ends unchanged. Command `null` removes the selected field. It does not store JSON null. Explicit empty text remains stored.
- All structurally accepted raw strings can be saved and reopened even when the separate syntax diagnostic is UNVERIFIED or INVALID_SYNTAX. Syntax diagnostics do not replace core file/type/length validation.
- End-text edits do not create or delete relationships, rewrite endpoint IDs, infer allowed endpoints or check the number of connected model edges. Undo/redo and save/reopen must preserve both raw values and presence/absence.

The editor separates Set/Remove presence controls from the text itself. It rejects stale edits if the model revision or view changes, avoids no-op history entries, and preserves untouched or reverted CR/CRLF raw values despite native textarea line-ending normalization.

## Assessment and drawing

`assessMultiplicity` provides read-only ABSENT, CONFIRMED_SYNTAX, UNVERIFIED or INVALID_SYNTAX diagnostics. Its result is not stored in the project. The local lexical recognizer is not a complete standard grammar. A recognized notation convention is not an ALLOWED endpoint rule or a whole-model conformance result. The separate [42-type endpoint matrix](ENDPOINT-RULES.json) contains all 1,764 current-catalogue B.5 element cells and reviews all 26,460 stored-order triples: 4,443 ALLOWED direct, 2,935 ALLOWED derived, 19,074 FORBIDDEN and eight source-unresolved UNKNOWN, leaving 26,452 settled decisions. Only Aggregation/Composition from Product/Plateau to Deliverable/WorkPackage has that unresolved scope; [the coverage record](ARCHIMATE-COVERAGE.md) explains the evidence and resolution requirements. Whole-model normative assessment remains UNKNOWN. Multiplicity syntax never creates or changes an endpoint decision or resolves a source qualification; raw end text does not affect that matrix.

End labels use original local automatic placement near the displayed endpoints. Placement follows stored source/target roles rather than arrowhead direction; it is an application layout choice, not a normative coordinate algorithm. Multiplicity text does not add per-view end-label coordinates or take over the existing central relationship-label position. The local placement uses generated-route endpoint tangents and a bounded outward shift to clear its own node and endpoint marker bounds. It can still overlap other objects or labels; it is not a general collision solver. Fit combines conservative local text bounds with measured text bounds.

An absent field has no label; explicit empty text has a visible empty marker. Controls and invisible characters are escaped in the display. Labels show at most 16 Unicode code points including an ellipsis when shortened. The exact raw value remains in the model. The textarea displays browser-normalized line endings while retaining the original value for untouched or reverted submission. Labels are safe text; model values do not become SVG or URLs.

The acceptance boundary is the current working editing cycle: edit each end independently, distinguish remove from empty, retain arbitrary bounded raw text, undo/redo, save/reopen, render typed notation in both light/dark themes and with automatic/saved-route display, and export without silently claiming semantic fidelity. Exact syntax and geometry cases are covered by their focused package/UI tests; executed totals and browser QA are tracked in [VALIDATION.md](VALIDATION.md).

Mermaid includes end text as labelled annotations with an explicit approximation warning. It does not carry native multiplicity semantics or preserve every character exactly; native Schemka files remain the exact-data format.

Group membership, full containment, general instance constraints, multiplicity-driven edge-count validation, hierarchy, derivation, viewpoints and standards-based interchange remain outside this feature. Complete current-catalogue raw endpoint coverage does not certify those semantics.

## Junction-attached ends in v2

The native file may preserve raw multiplicity text at any structurally valid endpoint. Separately, C260 §5.6 excludes a multiplicity attribute at a junction-attached end. `assessJunctions` reports applicability FAIL whenever that field is present, including explicit empty text. It never removes or rewrites the value. The opposite non-junction end is not excluded by this clause, and its syntax diagnostics remain separate.

Junction degree uses distinct model relationship IDs after the explicit containing-edge exception; it does not count represented real-world instances or repeated drawings. A syntax-confirmed `1` is not a command to limit the graph degree. See [CONCEPT-ENDPOINTS.json](CONCEPT-ENDPOINTS.json).
