# Group 46 criterion review

Reviewed 2026-11-11 against public `main` at `cc204079b836091a69330432a116dfd4bdad8a93` and draft PR [#33](https://github.com/smart-tinker/arkita/pull/33), application-code head `7bfe50b8daeea5e3a54971ad1a4885920273726d`; the criterion-ledger follow-up is `28ad225aca1bbd14eea2a1ef7d13c9312844b373`. The change in this report is documentation-only and does not change that application code.

This is a source and evidence map, not a release acceptance. All 16 criteria remain `acceptance-pending`; `closed_criteria` stays empty and installed-user Windows acceptance remains unrun. On application-code head `7bfe50b`, required Ubuntu/Windows CI and the aggregate gate passed in [run 42937444208](https://github.com/smart-tinker/arkita/actions/runs/42937444208); CodeQL passed in [run 42937444333](https://github.com/smart-tinker/arkita/actions/runs/42937444333), and Dependency Review passed in [run 42937444205](https://github.com/smart-tinker/arkita/actions/runs/42937444205). Extended CI [run 42937491020](https://github.com/smart-tinker/arkita/actions/runs/42937491020) passed on Ubuntu. Windows failed the maximum native inventory capacity test at `electron/test/directory-update.test.mjs:218`: the test captured its initial snapshot, then its disjoint update exceeded the configured 900,000 ms timeout. TAP reported 291 PASS, 0 assertion failures, 1 cancelled timeout, and 3 SKIP. This stress case remains unverified on this head; it is not evidence of a typical-model failure. The RC candidate includes a separate 1,500,000 ms allowance, but that does not change the result for this `main`-based PR head. The listed Actions runs have zero uploaded artifacts. Earlier on code head `8e04541`, the aggregate `node scripts/test.mjs`, the 469-file `node scripts/check-platform.mjs` check, `git diff --check`, and focused core/production-DOM regressions passed; those local results are not substituted for the current exact-head CI. A real-browser check was unavailable because Playwright is not installed. The packaged app was not installed and exercised by a user on `userVM`.

## Renderer and documentation follow-up — 18 Nov 2026

On 2026-11-18, independent QA accepted the renderer criteria for A-EDITOR-012, A-EDITOR-013 and A-EDITOR-098 in real Chromium against public main SHA 3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b.

- A-EDITOR-012: creation from the model tree saved the concept without a hidden view drawing. The implementation is in merged PR #33 (2b69d28). On the reviewed main SHA, CI run 43646530875, Extended CI run 43858177729 and CodeQL run 43871205954 passed.
- A-EDITOR-013: tree and palette creation applied compatible specialization; menus updated after profile rename/deletion; an incompatible profile was rejected without changing history. The implementation is in merged PR #33; exact-main CI, Extended CI and CodeQL passed on the reviewed SHA.
- A-EDITOR-098: moving a child between folders updated its displayed label; reopening preserved the child's ID, name, documentation and property. The implementation is in merged PR #48 (62aa163); exact PR-head validation and security checks passed. On the reviewed main SHA, CI run 43646530875, Extended CI run 43858177729 and CodeQL run 43871205954 passed.

These results are recorded as renderer acceptance in program.json. Installed Windows/native acceptance remains UNRUN; issue #12 remains open because the other catalog criteria and group-level work are unfinished.

A separate documentation evidence review of PR #68 at prior head 98c13e6a0133fd7d5761ca579440dc4e79a23cb9 found no evidence-integrity defect for A-EDITOR-014/015. The subsequent 04e5c1beafd481f196d5c23dd149d6cc084ad143 update remapped their public issue references and refreshed validation metadata/hash without changing their acceptance evidence. That review did not accept the product criteria: both remain acceptance-pending, closed_criteria is empty, and installed Windows/native acceptance is UNRUN. No formal GitHub review object is recorded.

| Criterion | Current route and retained checks | Assessment / remaining work |
| --- | --- | --- |
| A-EDITOR-010 | `schemka-model-ui/src/demo.js`, `file-actions.js`; `test/file-actions.test.js` | Blank model with a first view and guarded replacement have implementation and regression coverage. Record the criterion-specific acceptance result against the reviewed candidate. |
| A-EDITOR-011 | `schemka-model-ui/src/catalog-tree.js`, `catalog-folders.js`; `test/catalog-tree.test.js`, `test/catalog-tree-app.test.js` | Typed catalogue route and tests exist. Criterion-level renderer acceptance is not recorded. |
| A-EDITOR-012 | `schemka-model-ui/src/catalog-folders.js`, `app.js`, `context-actions.js`; `test/context-actions.test.js`, `test/catalog-tree-app.test.js` | Renderer criteria accepted on exact public main in Chromium; tree creation saved the concept without a hidden view drawing. Installed Windows/native acceptance remains UNRUN. |
| A-EDITOR-013 | `schemka-model-ui/src/catalog-folders.js`, `schemka-model-core/src/native-v4-commands.js`; `test/catalog-tree-app.test.js`, `test/native-v4.test.js` | Renderer criteria accepted on exact public main in Chromium: compatible tree/palette specialization, menu refresh after profile changes, and rejection of incompatible profiles without history mutation. Installed Windows/native acceptance remains UNRUN. |
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
| A-EDITOR-098 | `schemka-model-core/src/format.js`, `native-v4-commands.js`; `schemka-model-ui/src/metadata-ui.js`, `documentation-editor.js`, `visual-drawings.js`, `catalog-folders.js`; `test/context-properties-app.test.js`, `test/catalog-folders.test.js`, `test/catalog-tree-app.test.js` | Renderer criteria accepted on exact public main in Chromium: folder move updates the child label, and reopen preserves child ID, name, documentation and property. Installed Windows/native acceptance remains UNRUN. |

## Result

Renderer acceptance is recorded for A-EDITOR-012/013/098 on exact public main. Group 46 is not complete: A-EDITOR-014/015 and the other catalog criteria remain acceptance-pending, and installed Windows/native acceptance remains UNRUN. This report does not close issue #12, approve a release, or change the 0.7.1 RC scope.

## Exact-source refresh — 13 Nov 2026, 10:43 UTC

- Public `main` is `a8a145cbe903ba80d74afd20ab6e1cd8a590105b`. PR #33 is open and unmerged at `f1a406dce2ffa23bb4394d9197a2723f5cb59071`; it implements A-EDITOR-012/013.
- Required CI [run 43350873840](https://github.com/smart-tinker/arkita/actions/runs/43350873840) passed Ubuntu and Windows validation plus the gate. CodeQL [run 43350873897](https://github.com/smart-tinker/arkita/actions/runs/43350873897) and Dependency Review [run 43350873899](https://github.com/smart-tinker/arkita/actions/runs/43350873899) passed.
- Full Extended CI [run 43406746555](https://github.com/smart-tinker/arkita/actions/runs/43406746555) passed on the exact PR head. Windows completed 292/295 tests with 0 failures and 3 skips; Ubuntu completed 287/295 with 0 failures and 8 skips. `npm run check` passed on both runners with 469 JavaScript files.
- A-EDITOR-012/013 remain `acceptance-pending`; all 16 group-46 criteria remain pending, `closed_criteria` stays empty, issue #12 remains open, and installed-user Windows GUI acceptance is `UNRUN`. No independent GitHub review is recorded.

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
