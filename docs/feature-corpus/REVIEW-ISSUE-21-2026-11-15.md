# Issue #21: templates, boards, and Canvas source review

Date: 2026-11-15; evidence refresh: 2026-11-18
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

The top-level `issues.templates` value remains `55` as the historical corpus
group mapping; the 25 applicable criterion records point to public issue `#21`.
`A-ADV-086` remains assigned to issue `#42`, and `A-ADV-091` remains excluded.

## Evidence refresh — 2026-11-18

These are scoped Chromium observations, not criterion acceptance. The tests used
synthetic content; no private model or local evidence artifact is published here.

- **A-ADV-083 — scoped pass and unresolved stale refusal.** The author readback
  for [draft PR #98](https://github.com/smart-tinker/arkita/pull/98) showed two
  independently remapped template instances with disjoint IDs and isolated
  edits. The author reported the saved template envelope unchanged by the
  protocol/script, but the raw envelope was unavailable for an independent
  byte-hash check. The editor later reported that ordinary confirmation still
  produced `SESSION_STALE` in isolated contexts on the same PR head; its exact
  trigger and cause remain under investigation. The two-instance result is
  therefore scoped, not proof that the refusal is resolved. Keep
  `acceptance-pending`. The exact-head [CI run](https://github.com/smart-tinker/arkita/actions/runs/44371223857)
  passed.
- **A-EXT-027 — scoped Chromium pass on exact `main`.** The clipboard copy/reuse
  path and the local pattern-library path both passed their assigned scenarios:
  reuse kept the selected records, cloning remapped identities, saved readback
  and one-step Undo returned each path to its baseline. External packages,
  physical file loading and installed Windows behavior were not exercised; keep
  `acceptance-pending`.
- **A-ADV-098 — fail for diagnostics and fallback.** On exact `main`, the known
  name field substituted correctly, while unknown and malformed fields were
  displayed literally with a success status and no diagnostic or source-name
  fallback. A JavaScript-looking field remained inert and the source name was
  preserved. The missing diagnostics/fallback remain a concrete gap; keep
  `acceptance-pending`.
- **A-ADV-100 — mixed result; instruction display fails.** Tab focus and Enter
  selection, benign Markdown formatting, and exact instruction-text transfer
  through template save/reload passed. After selection the instruction was not
  visible, and the accessible name omitted it; the SVG title was the only
  observed instruction location. Screen-reader speech and adversarial Markdown
  sanitization were not tested. Keep `acceptance-pending`.

For the main failures in `A-ADV-098` and `A-ADV-100`, the candidate fixes are
already in [draft PR #81](https://github.com/smart-tinker/arkita/pull/81) at
`9d2a127994942e47434a021c00a30ea3d286b668`. [CI](https://github.com/smart-tinker/arkita/actions/runs/43710464322)
and [Extended CI](https://github.com/smart-tinker/arkita/actions/runs/43712335068)
passed on that exact head; independent verification of it remains pending.

The exact-main [CI](https://github.com/smart-tinker/arkita/actions/runs/43646530875)
and [CodeQL](https://github.com/smart-tinker/arkita/actions/runs/43646531019)
checks passed. No acceptance status changed: all 25 issue #21 records remain
`acceptance-pending`, `closed_criteria` remains empty, and Windows acceptance
remains `unrun`.

## Criterion map

| Criterion | Current source and retained test route | Review result / remaining proof |
| --- | --- | --- |
| `A-ADV-080` | `schemka-model-io/src/templates.js` (`createTemplate`, `serializeTemplate`); `schemka-model-ui/src/templates-ui.js`; `interchange-templates.test.js` saves a template without mutating the model. | Local save/library route exists. Confirm the installed Windows flow and its persisted bytes before acceptance. |
| `A-ADV-081` | `templatePreviewSVG`; gallery view selector, key view and thumbnail-size control; gallery preview/cancel UI test. | Preview routes exist. Keyboard and per-view preview behavior remain part of installed UI acceptance. |
| `A-ADV-082` | Built-in, team, local and external template sources in `templates-ui.js`; external package validation and collision test. | Source choices and explicit collision handling exist. Native file selection/cancel remains unrun. |
| `A-ADV-083` | `instantiateTemplate` uses `remapProject`; codec tests verify independent IDs. On PR #98, scoped Chromium readback confirmed two remapped instances and isolated edits. | A later isolated repeat on the same PR head again reported `SESSION_STALE`; exact trigger/cause is under investigation. Envelope equality was reported by protocol/script, but the raw envelope was unavailable for an independent hash. Keep acceptance pending; installed Windows remains unrun. |
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
| `A-ADV-098` | `captionText` and visual connector `style.labelTemplate` provide inert substitutions; native style validation and substitution tests exist. Exact-main Chromium substituted the known name field; a JavaScript-looking field stayed inert and the source name remained unchanged. | **FAIL:** unknown and malformed fields were displayed literally with a success status; there was no diagnostic or source-name fallback. Keep acceptance pending. |
| `A-ADV-099` | `locked` drawing fields, `setDrawingLocked`, and mutation guards; explicit lock/unlock UI regression rejects move/restyle/delete until unlock. | Source and focused regression exist for locked drawings. Confirm in installed UI. |
| `A-ADV-100` | `instruction` is editable/persisted and emitted as inert SVG `<title>` text; UI edit/render tests exist. Exact-main Chromium confirmed Tab/Enter selection, benign Markdown rendering and instruction-text transfer through template save/reload. | **FAIL:** the instruction was not visible after selection and was omitted from the accessible name; only the SVG title contained it. Screen-reader speech and adversarial Markdown sanitization remain unrun. Keep acceptance pending. |
| `A-ADV-101` | Per-drawing style fields and closed SVG export; visual appearance and export tests cover fills, gradients, text and images. | Core appearance routes exist; confirm the representative installed appearance/save/export flow. |
| `A-ADV-102` | Image assets and `imageDimensions`/`proportionateBounds` in `visuals-ui.js`; image UI test covers restore-aspect, proportional resize, clear and Undo. | Ratio-preserving edit route exists. Native asset selection and installed save/reopen remain unrun. |
| `A-ADV-111` | Board `createTemplate`/`serializeTemplate` and board-template codec test preserve view records, visuals and references. | Board-template source/test route exists; installed package portability remains unrun. |
| `A-ADV-112` | `insertBoardTemplate` and `templates-ui.js`; board insertion test verifies preview consent, independent drawings and one Undo. | New-board-from-template route exists; confirm the installed workflow. |
| `A-ADV-124` | Board tools preference in `templates-ui.js`; test disables tools while preserving an existing board. | Toggle route and data-preservation regression exist; installed preference persistence remains unrun. |
| `A-EXT-027` | `createTemplate(kind: 'pattern')`, portable fragment capture/remap and `insertPatternTemplate`; two assigned Chromium scenarios on exact `main` passed the clipboard and local-library paths, including saved readback and Undo. | Scoped paths passed; external-package import, physical file loading and installed Windows behavior remain unrun. Keep acceptance pending. |

## Minimal next work

1. Keep `0.7.1-rc.1` limited to fixes and CI. No new Canvas behavior is added by
   this review.
2. If issue #21 remains in the active feature-completion scope, run one
   representative installed Windows workflow on a synthetic model: save and
   reopen a template; create/edit a sketch/Canvas with a group, note, image,
   visual connector and view reference; exercise lock/unlock and conversion;
   confirm no data/history loss. Do not repeat already green CI groups.
3. Independently verify the exact head of draft PR #81 for the `A-ADV-098` and
   `A-ADV-100` gaps. Keep both criteria acceptance-pending until that review;
   the passing CI runs are not independent acceptance.
4. Close issue #21 only after the remaining criteria have exact source/test,
   review and applicable native evidence or an explicitly accepted limitation.

## Verification boundary

The exact-main CI/CodeQL runs above passed. This turn inspected source and
retained test routes only; it did not rerun tests, open the Windows package, or
perform native acceptance. Performance/stress cases are not release gates in
this review unless the owner separately prioritizes that scale.
