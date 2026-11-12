# Group 46 criterion review

Reviewed 2026-11-11 against public `main` at `cc204079b836091a69330432a116dfd4bdad8a93` and draft PR [#33](https://github.com/smart-tinker/arkita/pull/33), application-code head `7bfe50b8daeea5e3a54971ad1a4885920273726d`; the criterion-ledger follow-up is `28ad225aca1bbd14eea2a1ef7d13c9312844b373`. The change in this report is documentation-only and does not change that application code.

This is a source and evidence map, not a release acceptance. All 16 criteria remain `acceptance-pending`; `closed_criteria` stays empty and installed-user Windows acceptance remains unrun. On application-code head `7bfe50b`, required Ubuntu/Windows CI and the aggregate gate passed in [run 42937444208](https://github.com/smart-tinker/arkita/actions/runs/42937444208); CodeQL passed in [run 42937444333](https://github.com/smart-tinker/arkita/actions/runs/42937444333), and Dependency Review passed in [run 42937444205](https://github.com/smart-tinker/arkita/actions/runs/42937444205). Extended CI [run 42937491020](https://github.com/smart-tinker/arkita/actions/runs/42937491020) passed on Ubuntu. Windows failed the maximum native inventory capacity test at `electron/test/directory-update.test.mjs:218`: the test captured its initial snapshot, then its disjoint update exceeded the configured 900,000 ms timeout. TAP reported 291 PASS, 0 assertion failures, 1 cancelled timeout, and 3 SKIP. This stress case remains unverified on this head; it is not evidence of a typical-model failure. The RC candidate includes a separate 1,500,000 ms allowance, but that does not change the result for this `main`-based PR head. The listed Actions runs have zero uploaded artifacts. Earlier on code head `8e04541`, the aggregate `node scripts/test.mjs`, the 469-file `node scripts/check-platform.mjs` check, `git diff --check`, and focused core/production-DOM regressions passed; those local results are not substituted for the current exact-head CI. A real-browser check was unavailable because Playwright is not installed. The packaged app was not installed and exercised by a user on `userVM`.

| Criterion | Current route and retained checks | Assessment / remaining work |
| --- | --- | --- |
| A-EDITOR-010 | `schemka-model-ui/src/demo.js`, `file-actions.js`; `test/file-actions.test.js` | Blank model with a first view and guarded replacement have implementation and regression coverage. Record the criterion-specific acceptance result against the reviewed candidate. |
| A-EDITOR-011 | `schemka-model-ui/src/catalog-tree.js`, `catalog-folders.js`; `test/catalog-tree.test.js`, `test/catalog-tree-app.test.js` | Typed catalogue route and tests exist. Criterion-level renderer acceptance is not recorded. |
| A-EDITOR-012 | `schemka-model-ui/src/catalog-folders.js`, `app.js`, `context-actions.js`; `test/context-actions.test.js`, `test/catalog-tree-app.test.js` | Added in PR #33: tree action creates an unplaced element using the current catalogue registry and supports folder placement. Focused tests and required CI passed on the code head; independent review and installed-user acceptance are pending. |
| A-EDITOR-013 | `schemka-model-ui/src/catalog-folders.js`, `schemka-model-core/src/native-v4-commands.js`; `test/catalog-tree-app.test.js`, `test/native-v4.test.js` | Tree catalog creation now offers compatible specialization profiles by base type and stores the profile application on the new model-only concept. The core command rejects unknown, non-specialization and incompatible profiles. Focused tests and the aggregate suite pass; real-browser/native criterion acceptance remains pending. |
| A-EDITOR-014 | `schemka-model-ui/src/catalog-tree.js`, `catalog-folders.js`; `test/catalog-folders.test.js`, `test/catalog-tree.test.js` | Folder hierarchy, create/edit, and cycle-safe placement routes exist. Criterion-level acceptance is not recorded. |
| A-EDITOR-015 | `schemka-model-ui/src/catalog-folders.js`, `catalog-selection.js`; `test/catalog-folders.test.js`, `test/catalog-selection-app.test.js`, `test/browser-context-drag.mjs` | Cut/paste and drag/drop routes have tests. Real packaged Windows interaction is not recorded. |
| A-EDITOR-016 | `schemka-model-core/src/store.js`, `schemka-model-ui/src/app.js`, `controller.js`; `test/core.test.js`, `test/concept-endpoints.test.js`, `test/catalog-tree-app.test.js` | Impact calculation, guarded delete and undo routes exist. Criterion-level acceptance is not recorded. |
| A-EDITOR-017 | `schemka-model-ui/src/rename.js`, `inline-editor.js`, `catalog-folders.js`; `test/rename.test.js`, `test/inline-editor.test.js`, `test/catalog-folders.test.js` | Identity-preserving rename routes exist for concepts and folders. Criterion-level acceptance is not recorded. |
| A-EDITOR-018 | `schemka-model-core/src/native-v4-commands.js`, `schemka-model-ui/src/catalog-folders.js`; `test/catalog-folders.test.js` | Independent concept duplication route exists. Verify the full source metadata/dependency bullets before acceptance. |
| A-EDITOR-019 | `schemka-model-core/src/store.js`, `schemka-model-ui/src/view-actions.js`; `test/duplicate-view.test.js`, `test/duplicate-order-app.test.js` | Shared concepts and independent view/drawing duplication have implementation and tests. Criterion-level acceptance is not recorded. |
| A-EDITOR-020 | `schemka-model-core/src/store.js`, `schemka-model-ui/src/catalog-folders.js`; `test/catalog-selection.test.js`, `test/catalog-folders.test.js` | Group type-change impact checks exist. Criterion-level acceptance of the complete affected graph remains unrecorded. |
| A-EDITOR-021 | `schemka-model-ui/src/object-properties.js`, `metadata-ui.js`, `app.js`; `test/object-properties-app.test.js`, `test/context-properties-app.test.js` | Tree/context inspector routes and explicit owner scope have tests. Criterion-level acceptance is not recorded. |
| A-EDITOR-022 | `schemka-model-ui/src/catalog-folders.js`; `test/unused-tree-app.test.js` | The unused marker is derived from stored drawings and has add/undo coverage. Criterion-level acceptance is not recorded. |
| A-EDITOR-023 | `schemka-model-ui/src/catalog-selection.js`, `catalog-folders.js`; `test/catalog-selection.test.js`, `test/catalog-selection-app.test.js` | Linked tree/view selection routes have tests. Criterion-level acceptance is not recorded. |
| A-EDITOR-024 | `schemka-model-ui/src/catalog-folders.js`; `test/catalog-folders.test.js`, `test/catalog-tree-app.test.js` | Drill-down, breadcrumbs, Back/Home, and moved/deleted-folder recovery have tests. Criterion-level acceptance is not recorded. |
| A-EDITOR-098 | `schemka-model-core/src/format.js`, `native-v4-commands.js`; `schemka-model-ui/src/metadata-ui.js`, `documentation-editor.js`, `visual-drawings.js`, `catalog-folders.js`; `test/context-properties-app.test.js`, `test/catalog-folders.test.js`, `test/catalog-tree-app.test.js` | PR #48 is merged in `main` as `62aa163`. Folder documentation and persisted child-label templates now have direct-edit, move, reopen, and bounded-render regressions. Required PR checks passed before merge. The source and CI evidence do not substitute for installed Windows acceptance; the criterion remains pending. |

## Result

The catalog route is substantially implemented, but group 46 is not complete. PR [#48](https://github.com/smart-tinker/arkita/pull/48) merged A-EDITOR-098 implementation into `main` as `62aa163`; its criterion remains acceptance-pending until installed Windows acceptance is recorded. A-EDITOR-013 now has a tested implementation route; it remains acceptance-pending until its criterion bullets receive scoped rendered results on the reviewed source. Other rows with implementation/test routes also stay pending until their criterion bullets receive scoped results; DOM/unit evidence is not native Windows acceptance. This report does not close issue #12, approve a release, or change the 0.7.1 RC scope.

## Current exact-source refresh — 12 Nov 2026, 10:36 UTC

- Current `main`: `62aa1639752be2d4d345c97f4610e3673f0e5767`; PR #48 is merged.
- A-EDITOR-098 implementation and its direct edit/move/reopen/boundary tests are present. Required CI, CodeQL and Dependency Review passed on PR head `3e712412bb82a6c85359a9d8a99b297ef2ab79de`; post-merge CI `43201799027` is still running and CodeQL `43201799295` passed.
- All 16 group criteria remain `acceptance-pending`; `closed_criteria` remains empty. Installed Windows GUI acceptance is `UNRUN`.
- PR #33 implements A-EDITOR-012/013 and is being synchronized to the new main; its prior checks are not current-base evidence.

## Exact-source refresh — 11 Nov 2026, 08:13 UTC

- Public `main` is `a34b405408e5bc6fb5a501e770971aa441bc41bb`; PR #33 application
  code is at `d077c1542e40fecf7ee156211c1397022ccf8007`, refreshed on that base.
  The refreshed source map includes the intervening Electron, SVG validator,
  Windows timeout, and minimatch changes.
- Required Ubuntu/Windows CI and aggregate gate passed on the exact PR #33 head
  in [run 42983715968](https://github.com/smart-tinker/arkita/actions/runs/42983715968).
  CodeQL [42983715953](https://github.com/smart-tinker/arkita/actions/runs/42983715953)
  and Dependency Review
  [42983715948](https://github.com/smart-tinker/arkita/actions/runs/42983715948)
  also passed. Extended CI was not run on this exact head.
- A-EDITOR-012/013 implementation and tests remain scoped to PR #33; all 16
  criteria remain `acceptance-pending`, `closed_criteria` stays empty, and
  A-EDITOR-098 remains pending in draft PR #48. No independent review or
  installed-user Windows acceptance is recorded.
