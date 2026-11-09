# Changelog

## 0.7.0 — 2026-10-29

- Consolidate the agreed RC1–RC5 scope: supported Archi import with diagnostics
  and provenance, type-section folders, shared model objects, multi-window
  fixes, file launch and theme-aware view backgrounds.
- Include verified-duplicate cleanup for new successful save journals and
  bounded Git change-list pages, with all records and field details accessible.
- Preserve canvas captions when Windows rounds native SVG text coordinates.
  Give type headers spare vertical space without removing existing name rows.
- Dependencies and model formats remain unchanged from functional RC5.

Published as a stable release after Eldar's acceptance, with setup, portable
and SHA-256 assets. The final setup passed clean installation and targeted
Windows GUI checks; earlier candidate evidence is identified separately in the
release notes. This is not a full Windows regression: OS DPI, Narrator and the
new portable GUI were not separately rechecked. The release does not close the
separate 1.0 readiness gates or replace the candidate history below.

## 0.7.0-rc.5 — candidate history

- Limit new successful file and native-directory save journals to evidence
  that still needs preservation. Remove only the current completed journal
  after proving its bytes are duplicated by the saved model and, for an
  overwritten version, a verified backup. Native-directory before-files must
  also match the backup's canonical export byte-for-byte; unusual JSON
  formatting keeps the journal. Keep old, interrupted or uncertain journals;
  overwrites without a verified backup retain their previous-version journal.
  Cleanup failure keeps the successful save and reports retained evidence.
- Keep large Git change lists responsive with bounded pages; all records and
  field details remain accessible without rebuilding the list on each keystroke.
- Refresh the release guide, current Native V4 contract references and the
  Windows installation/update instructions. No dependency or model-format
  change is part of RC5.

This is a release candidate for **0.7.0**, not a stable release. Final-commit
checks, exact-package Windows installation/upgrade and GUI acceptance, and
publication remain separate gates. This entry records intended candidate
behavior and does not claim those gates have passed.

## 0.7.0 release scope — RC1 through RC4

- **RC1:** Import supported Archi native XML 5.0.0 with a complete preflight
  report of errors, conversions and losses, explicit per-object Gap decisions,
  and atomic application. Preserve supported folders, documentation,
  properties, shared identities, layout and styles; retain source IDs/types
  and a saveable mapping table. Unresolved conversions block application.
- **RC1:** Support the agreed practical-size workload of at least 5000 native
  records (the control fixture contains 5016); enable backups before overwrites
  by default for new settings, with discovery and recovery to a separate file.
- **RC2:** Organize the model tree into fixed type sections with user folders
  inside each section; keep navigation and object actions in the tree rather
  than duplicate command blocks.
- **RC3:** Fix multi-window Git and Cut operations, asynchronous document opens,
  nested alignment and XML-export diagnostics without discarding unrelated
  document state.
- **RC4:** Open a requested file without an extra blank model window and reuse
  an already open file. Let views follow the application theme while preserving
  explicit saved background colors; resetting a background has a preview and
  Undo/Redo.

The current writer is **Native V4** (`schemka-project@4`), wrapped in
`schemka-project-file@1` for `.arkita`. V2/V3 inputs validate and migrate in memory
before a separate Save As; their originals are retained. Ordinary Git with
bundled MinGit, the editor and the other existing 0.6.0 capabilities remain
part of the release. Archi ZIP resources, full ArchiMate conformance,
periodic autosave and publisher signing are not claimed. This scope does not
close every item in the [feature program](docs/feature-corpus/PROGRAM.md).

Published RC packages and their exact acceptance evidence are linked from
[GitHub Releases](https://github.com/smart-tinker/arkita/releases).
Historical evidence does not establish acceptance of the next package.

## Historical development snapshot after 0.5.1

The following queue was recorded before the subsequent releases and format
migrations. Its V2 statements describe that historical source state; the
current writer is V4 as documented above.

- Search the whole model and navigate to every drawing of a shared concept,
  including explicit explanations for viewpoint-hidden usages.
- Select multiple drawings with Shift or a marquee and move them atomically,
  retaining an explicit anchor and a single Undo step.
- Align selected occurrences in six directions or match the anchor's width,
  height or size; validate the whole result before changing the model.
- Copy a fragment within one model and paste either new drawings of the same
  concepts or an independent clone with remapped typed IDs and internal links.
- Export the actual active view as a standalone static SVG, including the current
  theme, routes, markers, multiplicities and laid-out labels.
- Protect opened model files from SVG and Mermaid export even when they have an
  export-like extension or are reached through an alias.
- Document the future metadata v3 contract and executable v2 compatibility
  fixtures. Runtime stays on v2; this does not add a v3 writer, migration UI or
  the proposed metadata fields.
- Bound the aggregate DOM test process concurrency to avoid test-host OOM while
  retaining all existing assertions.

Source, review and automated results are recorded in the corresponding PRs.
Real Windows acceptance and the release tag follow the final checked `main`.
This section does not assign a new release version or imply full Archi parity.

## 0.5.1 — 2026-10-18

- Keep canvas panning active across consecutive pointer drags while Space is held.
- Place newly created and reused elements in the visible workspace when possible,
  and reveal them only after the model change succeeds.
- Preserve the overlap order of drawings with equal z-index when duplicating a view.
- Keep view tabs, keyboard navigation and connection painting in the same
  deterministic order before and after saving and reopening a model.
- Keep zoom controls moving in the requested direction after fitting diagrams
  whose size falls outside the ordinary manual zoom range.
- Preserve Undo/Redo when received Git changes contain the same model snapshot.
- Report failed creation of a fresh model directory as incomplete, with rescue
  guidance; do not offer update-journal recovery for a directory without a journal.

The model formats are unchanged. Windows installer and native GUI acceptance
are recorded separately for the exact release artifact; historical results do
not establish acceptance of this build. The documented product and persistence
limitations remain in effect.

## 0.5.0-alpha.1 — Git collaboration

- Bundle the pinned official MinGit for Windows in the installer, including SSH,
  Git Credential Manager and licenses; no separate Git installation is required.
- Use ordinary Git repositories on GitHub, GitLab or a local server, with local
  offline versions, explicit push/receive and recent history in one dialog.
- Keep the existing canonical native JSON records in the repository; the
  portable `.arkita` format is unchanged.
- Merge independent records, explicitly choose conflicting records, and validate
  the complete model before applying. Applying a received snapshot supports
  Undo/Redo and preserves the local file binding and dirty baseline.
- Git uses a managed bare repository and existing user authentication. Failed
  publication keeps local versions; local file save and Git commit are separate.

## 0.4.0-alpha.2 — A quieter workspace

- Help → About Arkita opens a modal with the installed application version, read from the package at runtime.
- The magic connector stays visible while long relationship and junction groups start collapsed. Search still reveals matching types and restores prior folds.
- The model tree hides empty groups and brings them back when objects are added or restored.
- The file window leads with open, save and new model actions; export, directory tools and format details expand on demand. Replacement confirmations and recovery warnings remain visible.
- Object names look editable in the properties modal; cancelled or invalid native opens return keyboard focus to the visible file picker.

## 0.4.0-alpha.1 — Windows desktop UX

- Object properties open in a separate modal from the toolbar, Edit menu or object context menu. Advanced metadata is collapsed; the palette contains tools only.
- Removed repeated palette instructions and counts. Type descriptions use native popup tooltips without changing row height; inline rename keeps accessible instructions without a visible reminder.
- Reduced object context menus to relevant actions and made pointer movement update the focused item. Removed all create-relationship-from-here entries.
- Relationship tools draw directly between exact occurrences. The magic connector lives in the relationship palette and offers a type chooser after the drag, with fixed endpoints. Confirmed forbidden relations are rejected; cancellation and Undo/Redo preserve the model.
- Viewpoints and reusable property profiles moved to the Advanced menu. The ordinary view toolbar stays compact until a viewpoint is used.
- Windows x64 per-user installer; own `.arkita` files, native open/save, keyboard-layout-independent shortcuts. No Archi import, autosave, file association, publisher signature or full ArchiMate conformance claim.

Earlier entries below record their historical acceptance state, not acceptance of this build.

## Chapter 13 + Electron integration (local candidate)

- Combined the frozen viewpoint controls with native-directory sessions, delta recovery and existing leave/history guards. Full-store saves include hidden data and Chapter 14 profiles.
- Added the bounded canonical viewpoint namespace and conditional codec-only `viewpointFormat: 1` header guard. Old directory readers reject unbound definitions; ordinary and Chapter 14-only bytes remain unchanged. Earlier unguarded enhanced drafts reject without conversion.
- Real Electron and native-dialog acceptance remains separate from DOM tests and is required before a desktop-readiness claim. This changelog does not establish acceptance of a new binary package.

## Project-owned Chapter 13 viewpoints (frozen input)

- Added reusable stakeholder/concern and purpose/content metadata, exact catalog selection, one existing diagram representation, and optional view bindings.
- Applied definitions to the eligible-model chooser, palette, exact endpoint picker and non-destructive canvas projection. Selected relationship self/mutual cycles and exact drawing/anchor identities are preserved; hidden data stays in native saves.
- Added revision-guarded authoring/copy/delete/bind actions, shared-definition impact, full Undo/Redo, and governed-view duplication. Referenced deletion never cascades or unbinds implicitly.
- Additive native v2 retains ordinary/Chapter 14-only canonical bytes. Older readers explicitly reject enhanced files; governed Mermaid export directs users to native save. The frozen standalone input made no endpoint authority, profile registry, automatic layout, publishing or Electron/directory integration changes.
- Local development tests do not establish independent acceptance, real-browser behavior or release approval. See [VIEWPOINTS.md](docs/VIEWPOINTS.md).

## Grouped catalogue, accessible hints and boxed Device notation (local candidate)

- Left Elements now uses the existing AM4 category folders; right palette groups are native collapsible disclosures. Search temporarily reveals matches and restores prior folds on clear. UI expansion does not change model data or history.
- Replaced repeated creation subtitles with 59 original type-specific descriptions available on pointer hover and keyboard focus; Escape dismisses a hint, and the accessible name remains the type label.
- Device keeps its rectangular contour and adds an original shared monitor badge based on independently reviewed C260 boxed notation. Raw unofficial Box3D evidence remains recorded; icon-only Device and other missing standard glyphs are still open.
- Core/native format and all endpoint permissions are unchanged. The stable post-review aggregate passed 1,074 tests with zero failures/skips, 145 syntax checks and clean build; independent implementation review passed. This candidate is neither published nor browser-verified.

## Standalone typed-only editor increment (published Site 25 baseline)

- `/model/` uses typed notation only; the selectable neutral mode and permanent whole-model UNKNOWN banner are removed. Legend, source credits and the existing diagnostic/provenance report are available in Help; the report is labelled **Проверка модели**. Defensive unknown-type rendering remains.
- Removed the editor’s links to the landing page, Mermaid and service catalogue, plus its shell-navigation dependency. The landing page still links into the editor; the current multi-route build remains.
- Removed the duplicate current-view name/rename control and palette existing-relationship button; exact-ID reuse remains in the tree context menu. The palette has one visible heading, and groups relationships/junctions first, followed by Common, Strategy, Business, Application, Technology, Motivation and Implementation/Migration. This is presentation order, without changing type domains or adding a Physical group.
- Saved-route display/editing, native v2 files and qualified relationship/junction diagnostics remain unchanged in scope. This interface cleanup does not resolve outstanding source questions or establish full ArchiMate conformance.
- Full ArchiMate 4 support is the release 1.0 acceptance goal. This increment’s post-review aggregate passed 1,067 tests with zero failures/skips, 145 syntax checks and a clean build. Independent runtime and prepared-test correction review passed without findings. The prepared browser suite was migrated and statically checked, but not executed. Site 25 was published at 13:58:19 UTC; subsequent bounded live-browser UI/reuse/geometry/history/download checks passed. The new 7,923-byte file was not reopened in the browser.

## Published baseline: Site 24 (2026-10-13)

GitHub `86d8a55`, Sites source `cb9e34859989bebf6e36052f710779805337e1f0`; deployed at 12:39:11 UTC with public access revision 2 unchanged. Baseline verification: 1,055 tests, 145 syntax checks, clean build and bounded placement browser QA passed. A separate historical synthetic-file browser reopen/download was byte-identical at 16,663 bytes; it is not browser acceptance for the new interface. See [VALIDATION.md](docs/VALIDATION.md).

- One current ArchiMate catalogue: 42 elements, eleven base relationships and four nominal UI variants, available immediately in new and educational models.
- Removed staged profile activation, obsolete model adapters and the historical projection route from active code, tests, documentation and generated output.
- Retained current file/undo/multiview workflows, typed shapes, source/target markers and pointer/keyboard route editing.
- Added independent raw multiplicities at relationship ends, advisory syntax diagnostics and computed endpoint labels.
- Clean builds discard stale generated output. Source and runtime remain portable, with no Sites SDK requirement.
- Automatic junction creation/reuse avoids existing selectable bodies and pinned anchors in the initial canvas area; a full area leaves the draft and history unchanged and supports explicit drag placement.
- Normative assessment remains UNKNOWN where rules are not implemented. Catalogue membership alone is not full ArchiMate conformance.

Earlier development history remains in Git history rather than active migration instructions.
