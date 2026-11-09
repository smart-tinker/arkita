# Arkita 1.0 readiness

Initial target, 2026-10-14: a desktop ArchiMate 4 model editor. On 2026-10-17 the owner expanded it to a Windows MVP that colleagues can install, use and exchange models with, with explicit limitations. This is a finite product-readiness checklist, not full language conformity or certification.

**Current status: NOT READY for 1.0.** The historical feature-corpus baseline is Arkita 0.5.1, commit `d075e67c7ca6e7720f537102e245a59f53808b32`; that commit history and earlier acceptance reports are not included in this public snapshot. Subsequent implementation is summarized in [ROADMAP](feature-corpus/ROADMAP.md). This is the Windows desktop ArchiMate 4 editor; historical Schemka/Site evidence does not accept a current desktop artifact. A package version or prepared release does not establish that its tag has been published. [VALIDATION.md](VALIDATION.md) contains the public source validation contract.

The owner expanded the development programme on 2026-10-18: use documented Archi editor capabilities as input to an Arkita feature corpus, adapt notation-dependent behaviour to ArchiMate 4, and implement through issues and reviewed PRs. The [feature corpus](feature-corpus/README.md) tracks that work. This checklist retains the unfinished product-readiness gates; it is not a prohibition on the newly requested work. Final acceptance on a real Windows machine and release tagging belong to the owner's local Codex workflow, which starts after all changes in the acceptance set are merged and the resulting `main` passes its automated checks. Windows acceptance gates the release, not the preceding development merges.

The historical #23–27 set covered multi-selection/group movement, alignment/equal size, fragment reuse/clone, static SVG export and a metadata compatibility ADR. That set’s [Windows plan](feature-corpus/WINDOWS-ACCEPTANCE.md) retains search/where-used acceptance and adds the new editor/export cases. Completing this set does not implement the entire corpus or close the gates below. #26 froze native v2 and specified a future v3 migration. The current [Native V4 contract](NATIVE-V4.md) supersedes that storage baseline and includes validated V2/V3 readers and detached in-memory migration.

The complete standard-support ledger stays separate in [ARCHIMATE-COVERAGE.md](ARCHIMATE-COVERAGE.md) and [ARCHIMATE-COVERAGE.json](ARCHIMATE-COVERAGE.json). Deferring a feature from this release does not erase a standard-support gap or make it optional for full conformity. Whole-model normative conformance remains UNKNOWN.

## 1. Catalogue and one correct default notation per element

- [ ] All 42 concrete element types, And/Or junctions and all relationship families are available. Each element has at least one correct standard form, consistently used on canvas and in the palette.

Current bounded evidence: the catalogue has 42 ordinary elements, 2 separately modeled junction variants and 15 relationship IDs representing 11 base families plus 4 local nominal variants. The source-derived 42-element chapter/Appendix membership matches; no publisher-stated numeric denominator or completeness percentage is claimed.

Corrected boxed forms exist for Device, Node, ApplicationComponent, BusinessInterface, ApplicationInterface, TechnologyInterface, Plateau, Equipment, Facility, Service, Process, Function, Event, Role, Collaboration, Path, Location, BusinessActor, Stakeholder, Driver, Assessment, Goal, Outcome, Principle, Requirement, SystemSoftware, CommunicationNetwork, DistributionNetwork, Artifact, Material, Resource, Capability, ValueStream, CourseOfAction and WorkPackage. BusinessObject, Product, DataObject, Value, Deliverable, dashed Grouping and corrected Meaning have bounded icon-form topology. These are local implementation/source observations, not completion of this gate or visual desktop acceptance.

The finite local default-form source/render inventory now has 35 boxed and 7 icon forms, with no known missing default symbol. Meaning adds two detached lower-left outline satellites through the same canvas/palette/legend path, preserving the original cloud and all model/route data. Transparent interiors, compact proportions and theme-aware ink are local choices. Direct-size artifact recognition and automated checks do not complete this desktop acceptance gate.

The bounded canvas-caption correction now measures connected SVG text at the unchanged 10px/14px fonts, wraps names into at most two rows and shortens only the type badge while retaining the complete occurrence index. The exact ordinary name «Сервер мониторинга инфраструктуры» at 210×90, index 101, fits two rows in independently checked DejaVu Sans artifacts. Most 120×55 forms allow one name row; Deliverable at that size has only header capacity, and tiny or tall/narrow curved imports may show no name or caption. Full raw names remain in title, aria-label, inspector and model/native bytes. Hidden panels defer fitting; visible unavailable font metrics retain an explicitly warned preliminary preview until an existing panel/resize event can retry. That degraded state is not containment acceptance. Actual native/system-font interaction, tooltip/accessibility behavior and responsiveness remain unrun release gates. Alternative boxed/icon forms remain in the separate full-standard backlog.

## 2. Known relationship rules and explicit uncertainty

**Policy status: IMPLEMENTED_LOCAL_PENDING_DESKTOP_ACCEPTANCE.** Newly allocated relationship commands reject source-confirmed endpoint FORBIDDEN and the bounded attributable junction checks. The explicit smart chooser separates direct/derived ALLOWED from UNKNOWN. This local implementation does not close the real-desktop gate. Imported invalid records remain readable, drawable and diagnosed, without deletion or migration; historical Undo restoration is not new creation.

- [ ] Proven FORBIDDEN relationships cannot be newly created. Unresolved cases remain clearly unverified rather than being presented as permitted or correct.

Current bounded implementation: 26,460 ordinary-element triples are reviewed; 26,452 are settled, comprising 4,443 direct ALLOWED, 2,935 derived ALLOWED and 19,074 FORBIDDEN. Exactly eight ordinary UNKNOWNs remain: Product/Plateau → Deliverable/WorkPackage, for Aggregation/Composition. Separate Aggregation/Composition cases at junction endpoints and qualified junction boundaries remain UNKNOWN. Whole-model assessment also remains UNKNOWN.

Existing/imported invalid drafts remain saveable. Only newly allocated relationships are gated; annotation edits to junction role/multiplicity remain diagnostic. Incomplete junction degree, cycles, unresolved qualifiers, exhausted analysis and unrelated imported graph failures do not become blanket bans. A declared container role is a local intent convention; its applicability check does not claim that the standard mandates that field. Closure still requires desktop verification, accurate diagnostic boundaries and exact history/import preservation. Only authoritative scoped clarification with independent source review can change the eight-case disposition or the separate junction source boundary.

## 3. Multi-view editing, reuse, properties, viewpoints, profiles and history

- [ ] Create a model with multiple views, reuse the same concepts, edit properties, use viewpoints and profiles, and confirm correct Undo/Redo.

Current implementation is bounded. Chapter 13 has reusable viewpoint definitions, exact type selection, explicit bindings and non-destructive projection. Chapter 14 has reusable typed profiles, live defaults, per-concept overrides and named specialization labels. Commands, native roundtrip, hidden data retention and history have code/test coverage. Concern satisfaction, representation adequacy and actual desktop operation are not established by those tests.

Closure: complete this workflow on the small representative model used in gate 5. Shared IDs, hidden concepts/drawings, profiles, viewpoint definitions/bindings, property values and geometry must survive; canceled/invalid/stale edits must not commit; Undo/Redo must restore exact intended changes. Additional profile, layout and viewpoint features are prioritised in the feature corpus; they do not close this acceptance gate by their existence.

## 4. Local Git-friendly persistence without data loss

- [ ] Create → save → close → open → continue working preserves the model in a local Git-friendly representation. An external-change conflict does not cause a silent overwrite.

Current status: **independent persistence acceptance HOLD**. The existing native directory/codec and local synthetic tests do not replace that acceptance. The current writer is `schemka-project@4` / `schemka-archimate4@2`, with transport envelope 1. V2/V3 are validated by frozen readers and migrated in memory; a separate Save As preserves the original bytes. [Electron persistence limits](../electron/README.md) remain applicable.

Known limit: the current implementation supports one normal writer and one file operation at a time. Git or another editor must not modify files or their ancestors during save/recovery. Detected external changes block saving. The preservation fix was designed to retain before/after and displaced bytes and reject a reproduced final-boundary replacement race; earlier acceptance reports are not included in this public snapshot. This does not provide a filesystem lock, atomic multi-file visibility or a power-loss guarantee; hardlink support is required. The independent acceptance gate remains open. Historical failing evidence is retained rather than relabelled.

Closure requires the existing independent acceptance gate to be resolved and the real desktop workflow to preserve all model/view/profile/viewpoint data and subsequent edits. Exercise an external edit made while the application is idle, then verify an explicit conflict with both versions protected. Preserve the disclosed during-save concurrency limitation; any unresolved conflict-safety requirement prevents completion.

## 5. Actual Electron on Windows

- [ ] Complete the integrated scenario in actual Electron under Windows on a small representative model, using real native file dialogs.

Current status: **integrated 1.0 Electron/native-dialog acceptance UNRUN.** Historical Windows acceptance reports cover their named source/artifact only. DOM tests, temporary filesystem tests, generated SVG/raster inspection and browser checks do not accept a new packaged Windows release. Windows remains mandatory before declaring 1.0.

Closure: record the tested source identity and Windows/Electron environment, then complete gates 1–4 through real controls and native dialogs, including close/reopen, resumed edits, repeated/canceled actions and unsaved-work/conflict warnings. Use a synthetic representative model unless the owner separately supplies real model data. Browser QA is optional development evidence, not a desktop release gate.

## Separate capability and acceptance work

- All alternative boxed/icon forms; their full-standard support gap remains open.
- Automatic relationship derivation and universal model-semantic validation.
- Standards-based exchange with other editors.
- The built-in Git client already exists: see [GIT.md](GIT.md) for commit, push, fetch and validated merge behaviour. Real Windows SSH/HTTPS and server-specific acceptance remain separate; do not modify the model directory with another writer during save/recovery.

Track additional features through the corpus and their issues. Retain these notation, integrated editing/persistence and actual Windows gates until their stated evidence exists. Full-standard support continues separately without a conformance claim.
