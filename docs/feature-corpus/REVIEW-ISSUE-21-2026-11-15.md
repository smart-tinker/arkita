# Issue #21: templates, boards, and Canvas source review

Date: 2026-11-15  
Public repository: `smart-tinker/arkita`  
Reviewed source: `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`

## Result

The current source does not match the older family inventory retained by the
feature cards: template save/load/library, Canvas and sketch records, visual
objects, and pattern templates now have implementation routes and relevant
regression tests. The old `previous_inventory`, `advanced.md` baseline facts,
and `coverage.json` are historical and remain unchanged.

This read-only review found source and relevant test routes for 23 criteria.
Two criteria are partial against their own acceptance wording: `A-ADV-098`
does not diagnose invalid label-template expressions, and `A-ADV-100` stores
and exposes instructions through SVG `<title>` but does not demonstrate the
required keyboard-accessible selected-object explanation. This is source/test
triage, not user acceptance.

Issue #21 remains open. All 25 records remain `acceptance-pending`,
`closed_criteria` stays empty, and Windows acceptance stays `unrun`. No code or
tests were changed or rerun. Exact-main CI and CodeQL succeeded in Actions run
[43646530875](https://github.com/smart-tinker/arkita/actions/runs/43646530875)
and [43646531019](https://github.com/smart-tinker/arkita/actions/runs/43646531019).
Those checks do not prove installed Windows GUI acceptance.

## Criterion map

| Criterion | Current source and retained test route | Review result / remaining proof |
| --- | --- | --- |
| `A-ADV-080` | `schemka-model-io/src/templates.js` (`createTemplate`, `serializeTemplate`); `schemka-model-ui/src/templates-ui.js`; `interchange-templates.test.js` saves a template without mutating the model. | Local save/library route exists. Confirm the installed Windows flow and its persisted bytes before acceptance. |
| `A-ADV-081` | `templatePreviewSVG`; gallery view selector, key view and thumbnail-size control; gallery preview/cancel UI test. | Preview routes exist. Keyboard and per-view preview behavior remain part of installed UI acceptance. |
| `A-ADV-082` | Built-in, team, local and external template sources in `templates-ui.js`; external package validation and collision test. | Source choices and explicit collision handling exist. Native file selection/cancel remains unrun. |
| `A-ADV-083` | `instantiateTemplate` uses `remapProject`; codec test verifies two instances have independent IDs and edits do not change the saved template. | Independent model creation has a source/test route; installed open/save/reopen remains unrun. |
| `A-ADV-084` | `createTemplateLibrary` stores and edits categories; library category persistence/quota regression in `schemka-model-io/test/interchange.test.js`. | Category operations and atomic failure are covered in source/tests; native restart behavior remains unrun. |
| `A-ADV-085` | Versioned `arkita-template` envelope, bounded UTF-8 reader, nested native package and asset records in `templates.js`; codec test rejects future/duplicate envelopes. | Version rejection and self-contained model payload have source/test coverage. Cross-machine installed import remains unrun. |
| `A-ADV-087` | `createBoardPlan`, `VISUAL_NODE_KINDS`, and `visualConnectors`; board creation and visual-connector tests. | Separate informal Canvas/sketch data exists and stays distinct from ArchiMate concepts. Installed persistence remains unrun. |
| `A-ADV-088` | Note text editing in `visuals-ui.js` and rename actions; focused UI tests in `visuals-ui.test.js` and `rename.test.js`. | Editing/cancel routes exist. Verify multiline text in the installed UI. |
| `A-ADV-089` | `setViewPresentation`, theme/default background handling in `templates-ui.js`; reset, persistence and Undo/Redo tests. | Background source/tests cover explicit colors and theme fallback; installed save/reopen remains unrun. |
| `A-ADV-090` | `sketchConversionPlan` requires a total explicit map, retains the source sketch, validates relationships, and reports losses; conversion regression test. | Conversion preview/apply/cancel has a source/test route. Confirm the installed workflow and resulting bytes. |
| `A-ADV-092` | `createBoardPlan` creates an empty `canvas` or `sketch` view; board-plan tests. | Empty board route exists; installed persistence remains unrun. |
| `A-ADV-093` | `viewReference` stores `targetViewId`; renderer resolves current view metadata; deleting a target includes dependent references in drawing impact; keyboard navigation and reference-edit tests. | Stable-ID navigation and target cleanup exist. Verify the user-facing deletion impact in the installed UI. |
| `A-ADV-094` | Visual group parent/child geometry and guarded commands; container editor test checks child offsets, cancel and one Undo. | Container and history routes exist; native geometry acceptance remains unrun. |
| `A-ADV-095` | Note text, documentation, properties and appearance in visual commands/UI; visual object and safe SVG tests. | Separate text and note fields are represented. Confirm editing in the installed UI. |
| `A-ADV-096` | `createVisualConnector` and `visualGeometry`; regression verifies the line remains separate from semantic relationships. | Free visual connectors have a distinct native record and renderer; installed save/reopen remains unrun. |
| `A-ADV-097` | `STYLE_FIELDS`, `visuals-ui.js`, and `visual-drawings.js`; visual line geometry/style/export tests. | Endings, stroke, label position and safe export have routes. Confirm the installed appearance controls. |
| `A-ADV-098` | `captionText` and visual connector `style.labelTemplate` provide inert substitutions for name/type/ID/documentation/model name/properties; native style validation and generic substitution tests exist. | Partial: unknown placeholders remain literal and expressions are not executed, but invalid syntax/fields have no authoring diagnostic or explicit fallback notice. Decide whether this belongs in the next feature line; do not block `0.7.1-rc.1` on it. |
| `A-ADV-099` | `locked` drawing fields, `setDrawingLocked`, and mutation guards; explicit lock/unlock UI regression rejects move/restyle/delete until unlock. | Source and focused regression exist for locked drawings. Confirm in installed UI. |
| `A-ADV-100` | `instruction` is editable on notes/groups, persisted in the visual record and emitted as inert SVG `<title>` text; UI edit and render tests. | Partial: the drawing is focusable, but its `aria-label` omits the instruction and tests do not establish keyboard-accessible selected-object guidance or formatted hint rendering. Decide minimal product scope separately. |
| `A-ADV-101` | Per-drawing style fields and closed SVG export; visual appearance and export tests cover fills, gradients, text and images. | Core appearance routes exist; confirm the representative installed appearance/save/export flow. |
| `A-ADV-102` | Image assets and `imageDimensions`/`proportionateBounds` in `visuals-ui.js`; image UI test covers restore-aspect, proportional resize, clear and Undo. | Ratio-preserving edit route exists. Native asset selection and installed save/reopen remain unrun. |
| `A-ADV-111` | Board `createTemplate`/`serializeTemplate` and board-template codec test preserve view records, visuals and references. | Board-template source/test route exists; installed package portability remains unrun. |
| `A-ADV-112` | `insertBoardTemplate` and `templates-ui.js`; board insertion test verifies preview consent, independent drawings and one Undo. | New-board-from-template route exists; confirm the installed workflow. |
| `A-ADV-124` | Board tools preference in `templates-ui.js`; test disables tools while preserving an existing board. | Toggle route and data-preservation regression exist; installed preference persistence remains unrun. |
| `A-EXT-027` | `createTemplate(kind: 'pattern')`, portable fragment capture/remap and `insertPatternTemplate`; tests cover clone/reuse and viewpoint rejection. | Selected fragment reuse exists with explicit losses for external links/folders; confirm the installed copy/reuse flow. |

## Minimal next work

1. Keep `0.7.1-rc.1` limited to fixes and CI. No new Canvas behavior is added by
   this review.
2. If issue #21 remains in the active feature-completion scope, run one
   representative installed Windows workflow on a synthetic model: save and
   reopen a template; create/edit a sketch/Canvas with a group, note, image,
   visual connector and view reference; exercise lock/unlock and conversion;
   confirm no data/history loss. Do not repeat already green CI groups.
3. Decide whether the two partials need completion in `0.8.0-alpha.1`:
   invalid-expression diagnostics for `A-ADV-098`, and keyboard-accessible
   instructions for `A-ADV-100`. If not required, record the accepted limit;
   do not close either criterion by inference.
4. Close issue #21 only after the remaining criteria have exact source/test,
   review and applicable native evidence or an explicitly accepted limitation.

## Verification boundary

The exact-main CI/CodeQL runs above passed. This turn inspected source and
retained test routes only; it did not rerun tests, open the Windows package, or
perform native acceptance. Performance/stress cases are not release gates in
this review unless the owner separately prioritizes that scale.
