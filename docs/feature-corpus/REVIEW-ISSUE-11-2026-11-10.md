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
| A-EDITOR-004 | `schemka-model-ui/src/view-tabs.js`; `schemka-model-ui/test/view-tabs.test.js` covers ID deduplication, reorder, close without model deletion, selection/history, and bounded opening. | Source/tests cover tab lifecycle. The renderer run exercised one selection and a view switch, but not camera/selection continuity across switching and reordering; those acceptance checks remain pending. |
| A-EDITOR-005 | `electron/document-registry.mjs` gives each model its own window/session; `electron/test/document-registry.test.mjs` verifies identity reuse and separation of files with equal names and IDs. | Independent model sessions are implemented as separate windows. Native edit/save/close isolation across windows remains `UNRUN`. |
| A-EDITOR-006 | `schemka-model-ui/src/controller.js`; `schemka-model-ui/test/controller.test.js` covers shared per-model undo/redo; `schemka-model-ui/test/workbench.test.js` covers physical shortcuts and text/IME boundaries. | The renderer run left Undo/Redo disabled on an unchanged document; it did not exercise focus/text Undo or model isolation. Those acceptance checks remain pending. |
| A-EDITOR-007 | `schemka-model-ui/src/project-session.js` and `file-actions.js`; `schemka-model-ui/test/file-actions.test.js` covers dirty, undo/redo, save acknowledgement, cancellation and failed writes. | Renderer runs ended clean and did not exercise a visible dirty transition or failed-write path. Dirty/failed-write visual acceptance remains pending. |
| A-EDITOR-041 | `schemka-model-ui/src/detached-palette.js`, `electron/palette-service.mjs`; `schemka-model-ui/test/palette-window.test.js` and `electron/test/palette-service.test.mjs` cover owner-bound detached palette actions and stale requests. | Source/tests present. Native detach, reattach and context switching remain `UNRUN`. |
| A-ADV-036 | `electron/document-registry.mjs` validates file identity before reuse/open; `electron/test/document-registry.test.mjs` covers invalid input, same identity and queued duplicate opens. | Code/tests present. Packaged Windows dialog/reopen behavior remains `UNRUN`. |
| A-ADV-037 | `schemka-model-ui/src/file-actions.js` routes one `.arkita` drop through `openDroppedFile`; `electron/preload.cjs` obtains its native path and `electron/main.mjs` calls the shared `documents.open` route. This PR adds renderer regressions for opened/focused/cancelled/error results and rejection of unsupported/multiple files. | Implementation was already in `main`; the corpus card saying “absent” is stale. Focused renderer coverage does not verify OS-originated drop/cancel or malformed-file handling through the real file-open path; those checks remain pending. |
| A-ADV-038 | `package.json` declares file association; `electron/main.mjs` handles `open-file` and second-instance argv; registry/startup tests cover paths with spaces/Cyrillic and duplicate identity. | Code/tests present. Windows Shell association, second activation and uninstall behavior remain `UNRUN`. |
| A-ADV-039 | `file-actions.js`, `electron/file-service.mjs`, and `electron/document-preferences.mjs`; file/session and preference tests cover acknowledged save, conflict, backup and recovery behavior. | Source/tests present. Installed Windows save/cancel/conflict acceptance remains `UNRUN`. |
| A-ADV-040 | Save As uses the same native file service; `electron/test/export-native-guard.test.mjs`, `electron/test/files.test.mjs`, and file-action tests cover guarded destination writes, retained source and readback. | Source/tests present. Installed Windows Save As/readback remains `UNRUN`. |
| A-ADV-041 | `electron/window-guards.mjs`, `electron/main.mjs`, and `file-actions.js`; `electron/test/boundaries.test.mjs` and `schemka-model-ui/test/file-actions.test.js` cover close guard, active writes, save, discard and cancel paths. | Code/tests present. Native close-dialog behavior and reopen after close remain `UNRUN`. |
| A-ADV-042 | The document registry creates independent windows and rejects a second writer for the same identity; its tests cover equal-name/ID isolation and duplicate opens. | Separate model windows are implemented. Native cross-window switching and closing one dirty model while retaining another remain `UNRUN`. |
| A-ADV-043 | `electron/print-service.mjs` creates a validated static print document; `electron/test/clipboard-print.test.mjs` covers native print/PDF options, tiling, cancellation and disposal. | Service and simulated Electron tests present. Actual Windows printer output, DPI and page clipping remain `UNRUN`. |
| A-ADV-150 | `schemka-model-ui/src/view-tabs.js`; `schemka-model-ui/test/view-tabs.test.js` covers no-auto-open, bounded opening, cancel and deduplication. | Independent QA accepted both card criteria with the synthetic renderer evidence below against exact `main` SHA `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`. Packaged/native Windows acceptance remains `UNRUN`; explicit bulk-open is separate A-EXT-017. |
| A-ADV-151 | `electron/document-preferences.mjs`; `electron/test/document-preferences.test.mjs` covers previous readable version, rotation, opt-out persistence, restore, backup failure and external conflict. | Source tests cover simulated backup/restore/conflict paths; real filesystem backup, restore, and conflict behavior remains unverified. This check is filesystem-dependent, not inherently Windows-only. |
| A-ADV-152 | `electron/document-preferences.mjs` and preload/main recent-file route; preference tests cover canonical distinct paths, configurable limit, disabled state and restart persistence. | Source/tests present. Native recent-menu reopening with Unicode paths remains `UNRUN`. |
| A-EXT-017 | `view-tabs.js` and `view-tabs.test.js` provide bounded, cancellable opening and avoid duplicate tabs. | The 100-view run covered load-time limited auto-open and manual open/switch/select only. It did not test explicit bulk-open count/cancel or establish a measured interaction threshold; this criterion remains pending. |

## Renderer follow-up — 2026-11-18

This records limited UI evidence for the synthetic fixtures below and the
independent QA acceptance of both A-ADV-150 card criteria in renderer scope.
Packaged/native Windows acceptance remains unrun. The exact `main` source SHA
was `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`, extracted with `git archive`
and built using `node scripts/build-platform.mjs`.

The renderer source snapshot was introduced in commit
`bc4b413b052bf1fff43ed2d9c9022b67681eb3e7` and carried by merged
[PR #1](https://github.com/smart-tinker/arkita/pull/1) at merge commit
`6b778bfe278ca8095494dbe4b45d875725d3a706`. The `view-tabs.js` blob is
identical at the reviewed `main` SHA. The static renderer ran on loopback with
Playwright 1.65.0 and Chromium 158.0.8127.18. A temporary
in-page `schemkaDesktop` adapter supplied preferences/open/save; settings, file,
editor, and canvas UI were the actual renderer. Chromium sandboxing was
disabled because this host blocks unprivileged user namespaces. This setup did
not exercise Electron IPC, native dialogs, real disk I/O, a packaged Windows
build, or installed-app acceptance. Each workload was run once; these are
observations, not an SLA or benchmark. No screenshots or temporary paths are
part of this public evidence.

- **12 views:** 12 elements/occurrences, 12,120 bytes; fixture SHA-256
  `bde9e52a2d2fe0aa67263112bc0544962c507f40321b5738e534bbf16672cc3b`.
  `none` opened zero tabs while retaining all 12 views in the tree; clicking
  the last tree item opened it. `first` opened one tab; `limited N=3` opened
  three. Each mode remained clean, kept Undo/Redo disabled, saved byte-identical
  data through Save As, and had no page/console errors or failed requests.
- **100 views:** 800 elements, 800 occurrences, 1,701 records, 616,432 bytes;
  fixture SHA-256
  `17adff997ea3f3b27797d8e0f3975bfbec785f999091c7d1438e2bc68a6f7626`.
  `limited N=5` opened five tabs on load and kept all 100 views in the tree.
  Manually opening `002 Synthetic view` added tab six, confirming the limit
  applies to load-time auto-open. That view rendered eight nodes; one was
  selected, then the UI switched back to an initially open view. Page-clock
  observations were 504 ms for the open flow, 385 ms for model commit/render,
  144 ms to switch to the closed view, 108 ms to select a node, and 148 ms to
  switch back. Save As returned byte-identical data; final dirty state was
  false, Undo/Redo stayed disabled, and there were no page/console errors or
  failed requests. This did not test explicit bulk-open count/cancel, so it
  does not cover A-EXT-017.

The following checks remain pending: A-EDITOR-004 camera/selection continuity
across switching and reorder; A-EDITOR-006 focus/text Undo and model isolation;
A-EDITOR-007 visible dirty and failed-write behavior; A-ADV-037 OS-originated
drop/cancel and malformed-file handling through the real file-open path;
A-ADV-151 real filesystem backup/restore/conflict; and A-EXT-017 explicit
bulk-open count/cancel plus
measured interaction. These gaps span renderer interaction, OS integration, and
filesystem behavior; they are not all Windows-only. Separate packaged/installed
Windows checks remain pending where the table identifies them.

## Outcome

The source review found broad implementation and automated coverage already
present; older “absent” notes describe the historical baseline, not current
`main`. It found one concrete source gap in this group: general pane detachment
under A-EDITOR-003. Independent QA accepted both A-ADV-150 card criteria in
static-renderer scope against `main` SHA `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`;
its packaged/native Windows acceptance remains `UNRUN`. The other 18 issue #11
records remain `acceptance-pending`. Renderer interaction gaps, OS integration,
filesystem behavior, and native Windows checks remain distinct pending
evidence.

The new A-ADV-037 tests are focused renderer-harness coverage only; they do not
claim native drag/drop acceptance. They pass locally (57/57). The full local
aggregate could not start: `npm` is unavailable in this environment, and direct
`node scripts/test.mjs` stops when two legacy test files cannot import missing
`jsdom`; dependencies were not installed. PR CI is the full-suite check for
this candidate. No application code, package, release tag or binary changed in
this review.
