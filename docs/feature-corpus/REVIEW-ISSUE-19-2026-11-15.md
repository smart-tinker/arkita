# Issue #19 — current evidence review

Reviewed 2026-11-15 against public `main` at
`3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`. The issue’s `historical-group-53`
is the corpus key, not the public issue number. This review updates current
source/test routes and remaining evidence for the eight listed criteria; it
does not rewrite the historical source cards or accept any criterion.

## Findings

| Criterion | Current source/test evidence | Current result and remaining gate |
| --- | --- | --- |
| A-EDITOR-089 | `viewpoints.js`, `viewpoint-ui.js`; `viewpoints.test.js`, `viewpoint-ui.test.js`, `notation-viewpoints-app.test.js` cover binding, filtering, undo/redo and native serialization. | Source routes exist; no new code gap established. Installed Windows acceptance remains `UNRUN`. |
| A-EDITOR-090 | The catalog tree previously kept excluded objects reachable without distinguishing them from deleted objects. Draft [PR #75](https://github.com/smart-tinker/arkita/pull/75), commit `64b4c6ae43e5a842a00f4822f08bb28e18907ad9`, adds a visible/accessibility marker and explains the disabled add action. Its `catalog-tree-app.test.js` regression passed locally 12/12 after RED→GREEN. Exact-head [CI run 43674034236](https://github.com/smart-tinker/arkita/actions/runs/43674034236) passed Ubuntu and Windows validation, Windows installer verification/install/launch, and the aggregate gate; CodeQL and Dependency Review also passed. | Confirmed code gap addressed on an unmerged feature branch. Installed Windows/viewpoint acceptance remains `UNRUN`; keep the criterion open. |
| A-EDITOR-093 | `rename.js`, `documentation-editor.js`, `store.js`, and `customization-ui.js`; `documentation-editor.test.js`, core `documentation.test.js`, and customization tests cover concept ownership, exact multiline text, shared views, profile compatibility, and Undo. | Source/test routes exist; no new code gap established. Installed Windows acceptance of the combined workflow remains `UNRUN`. |
| A-EDITOR-095 | `current-catalog.js` defines the current relationship IDs; `format.js` stores type, label, properties, optional raw endpoint multiplicities, junction role and profile applications. `multiplicity.test.js` rejects legacy `accessType`. | The per-type semantic-field mapping to an authoritative ArchiMate 4 contract is not established by this source review. Do not infer conformance or reintroduce Archi 3.2 `accessType`/`directed`/`strength`; resolve the exact contract before changing the format. |
| A-ADV-021 | `customization-ui.js`, `customization.js`, `store.js`; `customization-ui.test.js` and `customization.test.js`. Usage counts are by concept ID. Same-name specializations with overlapping targets require an explicit separate-ID choice; disjoint targets can keep the same name. | Current code and regression routes exist. Installed Windows acceptance of creation, rename and counts remains `UNRUN`. |
| A-ADV-022 | The inspector offers compatible profiles; core validation checks definition, target type and values. `customization-ui.test.js`, `customization.test.js`, and `native-v4.test.js` cover application, persistence and Undo. | Current code and regression routes exist under Arkita’s profile contract. Installed Windows acceptance remains `UNRUN`; this is not a claim of equivalence to Archi’s specialization semantics. |
| A-ADV-023 | `customization-ui.js` has an explicit detach-all-and-delete confirmation listing affected concept IDs, stating which profile values are removed, preserving base concepts/relationships and promising one Undo. `customization-ui.test.js` covers cancel and exact Undo. | The former “no bulk preview” description is stale. Current source/test routes exist; native Windows confirmation/cancel/Undo acceptance remains `UNRUN`. |
| A-ADV-024 | Profile image assets are stored and validated by `customization.js`/`format.js`; `visual-drawings.js` renders inherited icons while preserving local image overrides. `customization-ui.test.js` and `visual-drawings.test.js` cover selection, inheritance, override and used-asset protection. | The former “absent” description is stale. Current source/test routes exist; native Windows rendering and save/reopen acceptance remain `UNRUN`. |

## Evidence boundary

The source and test files listed above were inspected; this documentation change
does not rerun them. The locally executed 12/12 catalog-tree result and CI run
apply only to PR #75’s exact commit. Runner install/launch smoke is not installed
user acceptance. All eight `program.json` records remain
`acceptance-pending`, `closed_criteria` remains empty, and Windows acceptance
remains `unrun`. Issue #19 and the parent corpus issue #9 stay open.

No application code, version, release, tag, workflow or permission was changed.
