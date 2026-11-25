# Issue #9: current-main evidence update (2026-11-25)

Reviewed public main at [f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9](https://github.com/smart-tinker/arkita/commit/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9). This addendum refreshes evidence links and limits for the named records only. It does not accept or close criteria.

Exact-main CI [45670771384](https://github.com/smart-tinker/arkita/actions/runs/45670771384) completed successfully on this SHA. That is integration CI evidence, not installed Windows/native acceptance.

## Criterion evidence

### A-EDITOR-021 — inspector type and stable ID

- Merged source change: [PR #109](https://github.com/smart-tinker/arkita/pull/109), exact PR head d2ca54d2174f44d97b8a00e6e0d3a549ec64962f, merged into this main at f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9. Exact-head [CI run 45664090682](https://github.com/smart-tinker/arkita/actions/runs/45664090682) passed; exact-head source review passed.
- Current code and test: [app.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/src/app.js), [object-properties-app.test.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/test/object-properties-app.test.js).
- Independent Chromium passed on prior head 41208afcd70d441e67e4ced4a72794c5e5dea0b5 (receipt SHA-256 5cc42b9f2f91fbdfbc2fc91762811acc738d4e11665a490de109a97ae9670eb4), confirming visible read-only explanations. Chromium on PR head d2ca54d and current main is UNRUN; earlier failed harness/startup attempts did not reach assertions and are not evidence.
- Remaining: the tree-versus-drawing property scope and stale-input transitions are not fully demonstrated. Installed Windows/native acceptance is UNRUN.

### A-EDITOR-039 — current visual palette actions

- Merged source change: [PR #107](https://github.com/smart-tinker/arkita/pull/107), exact PR head b3c686cfdd66d4e90cd21d1c77ad1b6f6e076271, merged as fe1245a3d61612b15b78270e9f49fe9dc6467988. Exact-head [CI run 44970061886](https://github.com/smart-tinker/arkita/actions/runs/44970061886) passed on Ubuntu and Windows.
- Current code and focused test: [app.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/src/app.js), [visual-selection-palette-app.test.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/test/visual-selection-palette-app.test.js).
- Production Chromium passed on the exact PR head for keyboard selection of a visualNode and visualConnector, palette edit enablement, and Cancel preserving selection/history/dirty state and byte-equal Save Blobs.
- Remaining: this covers those two selected visual kinds, not every current tool/type or viewpoint/profile combination. Installed Windows/native acceptance is UNRUN.

### A-EDITOR-078 and A-EXT-004 — relationship direction inversion

- Merged source change: [PR #102](https://github.com/smart-tinker/arkita/pull/102), exact PR head cc243bcfa124e2c32c75dc7d0f2aaa2fac9a2974, merged as 15f2e7d7cacd2686ac4249d4353d7fc429649e6f. Exact-head [CI run 44998007472](https://github.com/smart-tinker/arkita/actions/runs/44998007472) passed on Ubuntu and Windows.
- Current code and focused test: [editing-tools.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/src/editing-tools.js), [editing-tools-app.test.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/test/editing-tools-app.test.js).
- Chromium passed on the exact PR head: Apply inverted the relation despite a deferred close event; one Undo restored the original serialized bytes.
- Remaining: evidence is limited to that inversion/Undo flow. Installed Windows/native acceptance and broader relationship-editing paths are UNRUN.

### A-EDITOR-111 and A-EXT-008 — occurrence contours and SVG path

- Merged source change: [PR #116](https://github.com/smart-tinker/arkita/pull/116), exact PR head 51c36dd2f93cfd0ed60000d7801285be391adf0a, merged as cbc1c2e6698963845db98aeef6388850cb049cfa. Exact-head [CI run 45626944995](https://github.com/smart-tinker/arkita/actions/runs/45626944995) passed on Ubuntu and Windows.
- Current code and focused test: [app.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/src/app.js), [notation-geometry-app.test.js](https://github.com/smart-tinker/arkita/blob/f2d7fcaef38a9ac781873c6e4ff6c471fd3282e9/schemka-model-ui/test/notation-geometry-app.test.js).
- Automated checks cover synthetic ellipse, rectangle, rounded, and default occurrence contours, matching connection and hit paths, ellipse SVG path parity, and unchanged saved model bytes.
- The Chromium receipt is prior-base only: candidate 03a435512d573e8978ce7390acf45016f68cfd08, based on fe1245a3d61612b15b78270e9f49fe9dc6467988. It passed the ellipse endpoint/export path, Undo route restoration, and byte-identical Save Blob scenario; it is not evidence on PR head 51c36dd or current main.
- Remaining: the tests set synthetic shape styles directly; they do not prove the UI for choosing alternate shapes. Broad SVG portability across installed viewers/fonts and installed Windows/native acceptance are UNRUN.

### A-EDITOR-066 — adjacent routing caveat only

PR #116 changes connection endpoints to follow styled occurrence contours, but its criterion-specific test does not exercise manual/orthogonal router modes, stored bendpoints, or their Undo behavior. This is an adjacent code change, not evidence that A-EDITOR-066 is satisfied. Criterion-specific validation and Windows acceptance remain UNRUN.

## Preserved ledger boundary

All seven records remain acceptance-pending; no closed_criteria are added. The corpus remains 339 IDs in the same order: 329 acceptance-pending, 9 excluded, and the A-EDITOR-126 alias of A-ADV-020. All 339 Windows acceptance values remain unrun. No installed Windows GUI or userVM acceptance is claimed.
