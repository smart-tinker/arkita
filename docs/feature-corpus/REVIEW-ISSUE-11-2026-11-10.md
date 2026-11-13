# Issue #11 — current evidence review

Reviewed repository: public `smart-tinker/arkita`, `main` at
`f648a7570ea29fea4ea5a4166e0c741d68191886` (2026-11-10). The source cards and
`coverage.json` retain their historical baseline; this report records the
current review without rewriting that history.

`npm test`, `npm run check`, Chromium renderer smoke, Windows NSIS build and
in-runner package smoke passed on that exact `main` SHA in
[CI run 42764693605](https://github.com/smart-tinker/arkita/actions/runs/42764693605).
This is source/runner evidence, not installed-Windows GUI acceptance. The
maximum native-inventory Extended CI case remains `UNVERIFIED` after its
900-second timeout in [run 42801101567](https://github.com/smart-tinker/arkita/actions/runs/42801101567).

| Criterion | Current implementation and test evidence | Assessment and remaining check |
| --- | --- | --- |
| A-EDITOR-001 | `package.json` declares `.arkita` file association; `electron/document-registry.mjs` parses launch paths; `electron/test/document-registry.test.mjs` and `electron/test/startup.test.mjs` cover argv, spaces, Cyrillic and startup delivery. | Source and runner checks present. Clean installed/portable association, uninstall, and model preservation remain Windows `UNRUN`. |
| A-EDITOR-003 | `schemka-model-ui/src/workspace-ui.js`; `schemka-model-ui/test/workspace-ui.test.js` covers pane order, resize, keyboard sizing, hide and stored widths. | Partial: layout and a detached palette exist, but general panes cannot detach/reattach. Windows second-monitor recovery is `UNRUN`. |
| A-EDITOR-004 | `schemka-model-ui/src/view-tabs.js`; `schemka-model-ui/test/view-tabs.test.js` covers ID deduplication, reorder, close without model deletion, selection/history, and bounded opening. | Code/tests cover tab lifecycle. Native switching and camera/selection continuity remain `UNRUN`. |
| A-EDITOR-005 | `electron/document-registry.mjs` gives each model its own window/session; `electron/test/document-registry.test.mjs` verifies identity reuse and separation of files with equal names and IDs. | Independent model sessions are implemented as separate windows. Native edit/save/close isolation across windows remains `UNRUN`. |
| A-EDITOR-006 | `schemka-model-ui/src/controller.js`; `schemka-model-ui/test/controller.test.js` covers shared per-model undo/redo; `schemka-model-ui/test/workbench.test.js` covers physical shortcuts and text/IME boundaries. | Source/tests present. Actual Windows focus and keyboard behavior remains `UNRUN`. |
| A-EDITOR-007 | `schemka-model-ui/src/project-session.js` and `file-actions.js`; `schemka-model-ui/test/file-actions.test.js` covers dirty, undo/redo, save acknowledgement, cancellation and failed writes. | Source/tests present. Visible dirty-state acceptance in the installed Windows app remains `UNRUN`. |
| A-EDITOR-041 | `schemka-model-ui/src/detached-palette.js`, `electron/palette-service.mjs`; `schemka-model-ui/test/palette-window.test.js` and `electron/test/palette-service.test.mjs` cover owner-bound detached palette actions and stale requests. | Source/tests present. Native detach, reattach and context switching remain `UNRUN`. |
| A-ADV-036 | `electron/document-registry.mjs` validates file identity before reuse/open; `electron/test/document-registry.test.mjs` covers invalid input, same identity and queued duplicate opens. | Code/tests present. Packaged Windows dialog/reopen behavior remains `UNRUN`. |
| A-ADV-037 | `schemka-model-ui/src/file-actions.js` routes one `.arkita` drop through `openDroppedFile`; `electron/preload.cjs` obtains its native path and `electron/main.mjs` calls the shared `documents.open` route. This PR adds renderer regressions for opened/focused/cancelled/error results and rejection of unsupported/multiple files. | Implementation was already in `main`; the corpus card saying “absent” is stale. New focused tests pass locally; native Windows drag/drop is `UNRUN`. |
| A-ADV-038 | `package.json` declares file association; `electron/main.mjs` handles `open-file` and second-instance argv; registry/startup tests cover paths with spaces/Cyrillic and duplicate identity. | Code/tests present. Windows Shell association, second activation and uninstall behavior remain `UNRUN`. |
| A-ADV-039 | `file-actions.js`, `electron/file-service.mjs`, and `electron/document-preferences.mjs`; file/session and preference tests cover acknowledged save, conflict, backup and recovery behavior. | Source/tests present. Installed Windows save/cancel/conflict acceptance remains `UNRUN`. |
| A-ADV-040 | Save As uses the same native file service; `electron/test/export-native-guard.test.mjs`, `electron/test/files.test.mjs`, and file-action tests cover guarded destination writes, retained source and readback. | Source/tests present. Installed Windows Save As/readback remains `UNRUN`. |
| A-ADV-041 | `electron/window-guards.mjs`, `electron/main.mjs`, and `file-actions.js`; `electron/test/boundaries.test.mjs` and `schemka-model-ui/test/file-actions.test.js` cover close guard, active writes, save, discard and cancel paths. | Code/tests present. Native close-dialog behavior and reopen after close remain `UNRUN`. |
| A-ADV-042 | The document registry creates independent windows and rejects a second writer for the same identity; its tests cover equal-name/ID isolation and duplicate opens. | Separate model windows are implemented. Native cross-window switching and closing one dirty model while retaining another remain `UNRUN`. |
| A-ADV-043 | `electron/print-service.mjs` creates a validated static print document; `electron/test/clipboard-print.test.mjs` covers native print/PDF options, tiling, cancellation and disposal. | Service and simulated Electron tests present. Actual Windows printer output, DPI and page clipping remain `UNRUN`. |
| A-ADV-150 | `schemka-model-ui/src/view-tabs.js`; `schemka-model-ui/test/view-tabs.test.js` covers no-auto-open, bounded opening, cancel and deduplication. | Guarded opening exists. Responsiveness and cancellation on a representative large model in installed Electron remain `UNRUN`; the maximum stress timeout is not a user-facing failure diagnosis. |
| A-ADV-151 | `electron/document-preferences.mjs`; `electron/test/document-preferences.test.mjs` covers previous readable version, rotation, opt-out persistence, restore, backup failure and external conflict. | Source/tests present. Installed Windows backup/restore acceptance remains `UNRUN`. |
| A-ADV-152 | `electron/document-preferences.mjs` and preload/main recent-file route; preference tests cover canonical distinct paths, configurable limit, disabled state and restart persistence. | Source/tests present. Native recent-menu reopening with Unicode paths remains `UNRUN`. |
| A-EXT-017 | `view-tabs.js` and `view-tabs.test.js` provide bounded, cancellable opening and avoid duplicate tabs. | Functional guard exists; no measured threshold/large-view responsiveness evidence in installed Electron. This performance criterion remains `UNRUN`. |

## Outcome

The source review found broad implementation and automated coverage already
present; older “absent” notes describe the historical baseline, not current
`main`. It found one concrete source gap in this group: general pane detachment
under A-EDITOR-003. Native multi-monitor behavior remains unverified. The
remaining material blocker for acceptance is native Windows verification. No criteria are marked
closed: `program.json` keeps all 19 as `acceptance-pending` with an empty
`closed_criteria` list until exact-source Windows evidence is reviewed.

The new A-ADV-037 tests are focused renderer-harness coverage only; they do not
claim native drag/drop acceptance. They pass locally (57/57). The full local
aggregate could not start: `npm` is unavailable in this environment, and direct
`node scripts/test.mjs` stops when two legacy test files cannot import missing
`jsdom`; dependencies were not installed. PR CI is the full-suite check for
this candidate. No application code, package, release tag or binary changed in
this review.
