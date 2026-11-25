# Issue #21: templates, boards, and Canvas source review

Date: 2026-11-15; evidence refresh: 2026-11-18; follow-up: 2026-11-25
Public repository: `smart-tinker/arkita`
Reviewed source: historical main snapshot at 3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b (reviewed 15 Nov; not current main)

## Result

The source snapshot reviewed on 15 November did not match the older family
inventory retained by the feature cards: template save/load/library, Canvas and
sketch records, visual objects, and pattern templates had implementation routes
and relevant regression tests at historical main
3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b. The old `previous_inventory`,
`advanced.md` baseline facts, and `coverage.json` are historical and remain
unchanged.

This read-only review found source and relevant test routes for 23 criteria.
At the historical snapshot, `A-ADV-098` did not diagnose invalid label-template
expressions, and `A-ADV-100` stored and exposed instructions through SVG
`<title>` but did not demonstrate the required keyboard-accessible
selected-object explanation. The later candidate evidence is summarized below;
this remains source/test triage, not user acceptance.

Issue #21 remains open. All 25 records remain `acceptance-pending`,
`closed_criteria` stays empty, and Windows acceptance stays `unrun`. The 15
November source review changed no code and reran no tests. Historical exact-main
CI and CodeQL for this snapshot succeeded in Actions run
[43646530875](https://github.com/smart-tinker/arkita/actions/runs/43646530875)
and [43646531019](https://github.com/smart-tinker/arkita/actions/runs/43646531019).
Those historical checks do not prove installed Windows GUI acceptance.

The top-level `issues.templates` value remains `55` as the historical corpus
group mapping; the 25 applicable criterion records point to public issue `#21`.
`A-ADV-086` remains assigned to issue `#42`, and `A-ADV-091` remains excluded.

## Evidence refresh — 2026-11-18; follow-up — 2026-11-25

The 18 November findings and this follow-up use synthetic content. The source
baseline remains the historical main snapshot at
3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b. Local browser receipts are not
published; A-EXT-027 links below point only to public source and tests.

- **A-ADV-083 — historical stale refusal; later runtime pass.** The prior
  SESSION_STALE refusal was reproduced on the historical 7079608c base after a
  queued model-gallery close advanced an unrelated app-wide interaction
  generation after proposal; the active ticket and model revision were
  unchanged. The follow-up excludes only that global comparison for
  template/import while retaining ticket, revision, inline-draft, and Git
  protections. That refusal is historical. Independent Chromium readback on
  draft [PR #98](https://github.com/smart-tinker/arkita/pull/98) is tied to
  runtime commit
  [4cd65ab](https://github.com/smart-tinker/arkita/commit/4cd65abe85d7a9fd354055ff1145f86cbf04f38d):
  two instances had disjoint IDs, relationship drawings resolved, the image
  payload and source bytes were preserved, and the local template library was
  unchanged after instantiation. The latest PR head
  [a190dd67](https://github.com/smart-tinker/arkita/commit/a190dd67bb23ac2dcadc99a36ee860e9bf068f60)
  adds only focused tests on top of that runtime; its exact-head
  [CI run 44430983565](https://github.com/smart-tinker/arkita/actions/runs/44430983565)
  passed. The independent receipt did not byte-hash or read back the original
  author-save envelope. Keep acceptance-pending; installed Windows remains
  unrun.
- **A-EXT-027 — scoped Chromium pass on the historical source snapshot.** The
  assigned clipboard and local pattern-library scenarios passed: reuse/clone,
  saved readback, and one-step Undo stayed within the tested selection and
  viewpoint-hidden-record boundaries. Public source/test references are
  [portable-fragment.js](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-core/src/portable-fragment.js),
  [templates-ui.js](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-ui/src/templates-ui.js),
  [fragment-clipboard-app.test.js](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-ui/test/fragment-clipboard-app.test.js),
  [fragment-clipboard.test.js](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-ui/test/fragment-clipboard.test.js),
  and [interchange.test.js](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b/schemka-model-io/test/interchange.test.js).
  These links are source/tests, not Chromium receipts. External-package import,
  physical file loading, and installed Windows behavior remain unrun; keep
  acceptance-pending.
- **A-ADV-098 — historical main fail; tested candidate fix passes.** On the
  historical 3a4a58 snapshot, the known name substituted, but unknown and
  malformed fields stayed literal with success and no diagnostic or fallback;
  a JavaScript-like field remained inert. Independent Chromium on draft
  [PR #81](https://github.com/smart-tinker/arkita/pull/81) at
  [e4924c37](https://github.com/smart-tinker/arkita/commit/e4924c37a68a72166e4b6a5be3acf1376af2031e)
  passed the exercised unknown, unterminated, and JavaScript-like cases: each
  showed an alert diagnostic and source-name fallback, with the script-shaped
  value inert. Undo restored the original label. Exact-head
  [CI run 44424180162](https://github.com/smart-tinker/arkita/actions/runs/44424180162)
  passed. PR #81 remains draft and unmerged; broader field cases and installed
  Windows remain unrun. Keep acceptance-pending.
- **A-ADV-100 — historical instruction-display fail; tested candidate fix
  passes.** On historical main 3a4a58, Tab/Enter selection and benign Markdown
  rendering worked, but instructions were not visible after selection and were
  absent from the accessible name; only the SVG title contained them. On the
  same exact PR #81 head e4924c37, independent Chromium confirmed Tab/Enter
  selection, a visible instructions panel, aria-pressed/expanded state, retained
  focus, and inert script-shaped Markdown with no script elements, event
  attributes, or execution. The save Blob matched the synthetic fixture bytes.
  CI 44424180162 passed; PR #81 remains draft and unmerged. Screen-reader
  speech, broader adversarial Markdown cases, and installed Windows remain
  unrun. Keep acceptance-pending.

The historical source-snapshot [CI](https://github.com/smart-tinker/arkita/actions/runs/43646530875)
and [CodeQL](https://github.com/smart-tinker/arkita/actions/runs/43646531019)
remain tied to 3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b. No acceptance status
changed: all 25 issue #21 records remain acceptance-pending, closed_criteria
remains empty, and Windows acceptance remains unrun.

## Criterion map

| Criterion | Current source and retained test route | Review result / remaining proof |
| --- | --- | --- |
| `A-ADV-080` | `schemka-model-io/src/templates.js` (`createTemplate`, `serializeTemplate`); `schemka-model-ui/src/templates-ui.js`; `interchange-templates.test.js` saves a template without mutating the model. | Local save/library route exists. Confirm the installed Windows flow and its persisted bytes before acceptance. |
| `A-ADV-081` | `templatePreviewSVG`; gallery view selector, key view and thumbnail-size control; gallery preview/cancel UI test. | Preview routes exist. Keyboard and per-view preview behavior remain part of installed UI acceptance. |
| `A-ADV-082` | Built-in, team, local and external template sources in `templates-ui.js`; external package validation and collision test. | Source choices and explicit collision handling exist. Native file selection/cancel remains unrun. |
| A-ADV-083 | instantiateTemplate uses remapProject; codec tests verify independent IDs. Independent Chromium on runtime 4cd65ab confirmed two remapped instances and preserved references/resources. | SESSION_STALE was a historical failure on 7079608; a190dd67 is test-only and its exact-head CI passed. The envelope caveat remains; keep acceptance pending and Windows unrun. |
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
| A-ADV-098 | captionText and visual connector style.labelTemplate provide inert substitutions; native validation and substitution tests exist. Historical main 3a4a58 Chromium failed diagnostics/fallback. | Independent Chromium on draft PR #81 head e4924c37 passed the exercised unknown, unterminated, and JavaScript-like fields with alert diagnostics and source-name fallback. PR remains draft/unmerged; broader cases and Windows are unrun. Keep acceptance pending. |
| `A-ADV-099` | `locked` drawing fields, `setDrawingLocked`, and mutation guards; explicit lock/unlock UI regression rejects move/restyle/delete until unlock. | Source and focused regression exist for locked drawings. Confirm in installed UI. |
| A-ADV-100 | instruction is editable/persisted and emitted as inert SVG title text; UI edit/render tests exist. Historical main 3a4a58 Chromium found no visible/accessibly named instruction after selection. | Independent Chromium on draft PR #81 head e4924c37 passed the exercised visible panel, keyboard selection, focus/ARIA state, and inert script-shaped Markdown. PR remains draft/unmerged; screen-reader speech, broader adversarial Markdown, and Windows are unrun. Keep acceptance pending. |
| `A-ADV-101` | Per-drawing style fields and closed SVG export; visual appearance and export tests cover fills, gradients, text and images. | Core appearance routes exist; confirm the representative installed appearance/save/export flow. |
| `A-ADV-102` | Image assets and `imageDimensions`/`proportionateBounds` in `visuals-ui.js`; image UI test covers restore-aspect, proportional resize, clear and Undo. | Ratio-preserving edit route exists. Native asset selection and installed save/reopen remain unrun. |
| `A-ADV-111` | Board `createTemplate`/`serializeTemplate` and board-template codec test preserve view records, visuals and references. | Board-template source/test route exists; installed package portability remains unrun. |
| `A-ADV-112` | `insertBoardTemplate` and `templates-ui.js`; board insertion test verifies preview consent, independent drawings and one Undo. | New-board-from-template route exists; confirm the installed workflow. |
| `A-ADV-124` | Board tools preference in `templates-ui.js`; test disables tools while preserving an existing board. | Toggle route and data-preservation regression exist; installed preference persistence remains unrun. |
| A-EXT-027 | createTemplate(kind: pattern), portable-fragment capture/remap and insertPatternTemplate; public source/test links are listed in the evidence refresh above. | The assigned clipboard and local-library Chromium scenarios passed on historical main 3a4a58, including saved readback and Undo. External-package import, physical file loading, and installed Windows remain unrun. Keep acceptance pending. |

## Minimal next work

1. Keep `0.7.1-rc.1` limited to fixes and CI. No new Canvas behavior is added by
   this review.
2. If issue #21 remains in the active feature-completion scope, run one
   representative installed Windows workflow on a synthetic model: save and
   reopen a template; create/edit a sketch/Canvas with a group, note, image,
   visual connector and view reference; exercise lock/unlock and conversion;
   confirm no data/history loss. Do not repeat already green CI groups.
3. Draft PR #81 head e4924c37 has an independent Chromium pass and exact-head
   CI success for the exercised A-ADV-098/A-ADV-100 cases, but remains
   unmerged. Keep both criteria acceptance-pending until their remaining
   boundaries and applicable installed Windows evidence are resolved.
4. Close issue #21 only after the remaining criteria have exact source/test,
   review and applicable native evidence or an explicitly accepted limitation.

## Verification boundary

The historical exact-main CI/CodeQL runs above passed for source snapshot
3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b. The 25 November update reconciled
existing receipts only; it did not change application code or rerun tests or
browser scenarios. The Windows package and native acceptance remain unrun.
Performance/stress cases are not release gates in this review unless the owner
separately prioritizes that scale.
