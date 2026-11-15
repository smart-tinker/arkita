# Issue #22: editor preferences and navigation source review

Date: 2026-11-15
Public repository: `smart-tinker/arkita`
Reviewed source: `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`

## Result

Issue #22 lists 35 criteria from historical corpus group 56. The older
`previous_inventory`, the source facts in `advanced.md`, and `coverage.json`
describe the pre-preferences baseline; several of those “absent” statements no
longer match current source. The current tree has a shared, validated local
preference profile and source/test routes for most of the listed behavior.

The source/test routes below were inspected, not rerun here. Existing tests are
evidence that a regression route exists, not a PASS recorded by this review.
The exact-main Actions `CI gate` and Ubuntu/Windows validation passed in run
[43646530875](https://github.com/smart-tinker/arkita/actions/runs/43646530875);
both CodeQL analyses passed in
[43646531019](https://github.com/smart-tinker/arkita/actions/runs/43646531019).
Those runs do not establish criterion-by-criterion native Windows acceptance.

PR [#62](https://github.com/smart-tinker/arkita/pull/62) is merged in `main`
as `8fcff2194e301bf08ab72327b438580c2c4cd84c`. It fixes two scoped defects:
color-only import preserves unsaved non-color edits (`A-ADV-120`), and plain
shortcut keys no longer consume text typed in editable controls (`A-ADV-167`).
Its exact-head validation/security checks passed; this does not accept the rest
of issue #22.

Issue #22 remains open. All 35 records stay `acceptance-pending`,
`closed_criteria` stays empty, and Windows acceptance stays `unrun`. No source
code or tests were changed or rerun in this review.

The top-level `issues.preferences` value remains `56` as the historical corpus
group mapping; these 35 criterion records point to public issue `#22`.

## Criterion map

| Criterion | Current source and existing regression route | Review result / remaining proof |
| --- | --- | --- |
| `A-ADV-114` | `preferences.js`, `theme.js`; `theme.test.js`, `preferences.test.js`. | System/light/dark preference and presentation routes exist. Verify theme, focus and fallback appearance in the installed Windows UI. |
| `A-ADV-115` | `file-actions.js`, `project-session.js`, `preferences-ui.js`; `preferences-effects-app.test.js`, `preferences-app.test.js`. | Dirty state and the selectable circle/asterisk are shown in the document bar. The UI has no separate document tab; confirm the document-bar indicator and assistive label satisfy the intended visible-marker criterion on Windows. |
| `A-ADV-116` | `preferences.js`, `preferences-ui.js`, `style.css`, `file-actions.js`; `preferences-app.test.js`. | A persisted status-bar toggle exists; file/error dialogs provide separate routes. Verify hiding/restoring the bar does not hide blocking errors in the installed UI. |
| `A-ADV-118` | `preferences.js`, `preferences-ui.js`, `theme.js`; `preferences.test.js`, `theme.test.js`. | Local display colors and per-color reset are implemented. Verify selected colors remain local and reset does not change unrelated settings. |
| `A-ADV-119` | `preferences.js` (`preferenceDrawingStyle`, `prepareCreationCommand`); `preferences.test.js`, `preferences-app.test.js`. | New-drawing defaults and explicit style precedence have routes. Verify save/reopen and that changing local defaults does not rewrite existing drawings. |
| `A-ADV-120` | `preferences-ui.js`, `preferences.js` (`serializeColorScheme`, import parser); `preferences.test.js`. | Color scheme import/export has validation and draft/cancel handling. PR #62 fixed preservation of unrelated unsaved preference fields; native file-picker acceptance remains unrun. |
| `A-ADV-121` | `preferences.js` (`preferenceDrawingStyle`, `applyPreferenceView`); `preferences.test.js`. | Derived border-from-fill is a local display projection and explicit stroke wins. Verify appearance and unchanged saved model bytes in the packaged UI. |
| `A-ADV-122` | `preferences.js`, `preferences-ui.js`, `element-captions.js`; `preferences-app.test.js`, `element-captions.test.js`, `element-captions-app.test.js`. | UI and diagram font controls and caption fallback routes exist. Verify Cyrillic/fallback and dialog sizing at target Windows DPI. |
| `A-ADV-137` | `gesture-tools.js`, `viewport.js`, `preferences-ui.js`; `gesture-tools.test.js`, `preferences.test.js`. | Grid visibility, snap, step and camera margin are configurable. Confirm the visible grid and Fit behavior on the installed UI. |
| `A-ADV-138` | `workspace-ui.js`, `preferences.js`; `workspace-ui.test.js`, `palette-window.test.js`. | Palette visibility is part of saved local workspace settings. Confirm startup visibility and restoration after restart. |
| `A-ADV-139` | `preferences.js`, `app.js`, palette/canvas renderers; `notation-palette-app.test.js`. | Canvas/palette hint preference is wired into presentation. Verify the enabled/disabled states are understandable without relying on hover alone. |
| `A-ADV-140` | `typed-actions.js`, `inline-editor.js`, `catalog-folders.js`; `unused-tree-app.test.js`, `catalog-tree-app.test.js`. | Rename-after-create has an existing create/rename path and Escape coverage. Confirm the configured path for each creation surface in the installed UI. |
| `A-ADV-141` | `preferences.js` (`specializationCreationEntries`), `palette-actions.js`, `catalog-folders.js`; `preferences-app.test.js`, `catalog-tree-app.test.js`, `notation-palette-app.test.js`. | Specialization creation is present across palette and tree routes. Verify type/profile labels, disabled states and one-step Undo in the packaged UI. |
| `A-ADV-142` | `editing-tools.js`, `app.js`; `editing-tools-app.test.js`. | Quick Add has a preference-controlled route. Verify pointer and keyboard invocation and that disabling it leaves ordinary context actions available. |
| `A-ADV-143` | `viewpoint-ui.js`, `app.js`, `catalog-folders.js`; `viewpoint-ui.test.js`, `notation-viewpoints-app.test.js`, `notation-palette-app.test.js`. | Viewpoint hints and disabled/restricted states have source and UI test routes. Verify the same explanation is available across the relevant surfaces. |
| `A-ADV-144` | `workbench.js`, `preferences.js`; `preferences.test.js`. | Default paste mode is configurable; explicit menu actions stay explicit. Verify keyboard paste and file identity behavior in the installed UI. |
| `A-ADV-145` | `resize-preferences.js`, `editing-tools.js`; `resize-preferences.test.js`. | Retain-coordinates and retain-offset strategies have atomicity and Undo routes. Verify nested geometry in the installed diagram editor. |
| `A-ADV-146` | `element-captions.js`, `preferences.js`; `element-captions.test.js`, `element-captions-app.test.js`. | Wrap/ellipsis behavior and full-name preservation have regression routes. Verify font metrics and clipping on Windows. |
| `A-ADV-147` | `preferences-ui.js`, `preferences.js` (`prepareCreationCommand`); `preferences.test.js`, `preferences-app.test.js`, `resize-preferences.test.js`. | New-drawing size and style defaults are applied at creation and explicit choices win. Verify defaults do not alter existing drawings and survive local restart. |
| `A-ADV-148` | `preferences-ui.js` (`defaults.nodeStyle.shape`), `preferences.js`, `node-shapes.js`; `preferences.test.js`, `preferences-app.test.js`. | A default shape choice is available for new drawings. The reviewed tests do not explicitly prove every alternative through preview, native save/reopen and export; keep that evidence outstanding. |
| `A-ADV-149` | `preferences-ui.js`, `preferences.js` (`prepareCreationCommand`), `visuals-ui.js`; `preferences.test.js`, `visuals-ui.test.js`, `visual-drawings.test.js`. | Legend defaults include labels, colors, sort, columns and inclusion flags. Verify a new legend uses the defaults and an existing legend is unchanged. |
| `A-ADV-153` | `catalog-folders.js`, `app.js`; `unused-tree-app.test.js`. | Unused marker is based on stored drawings and updates after edit/Undo. Verify in a representative model with multiple views. |
| `A-ADV-154` | `model-search.js`, `preferences.js`; `model-search.test.js`, `model-search-app.test.js`. | Input/Enter trigger, natural ordering, bounded results and navigation have regression routes. Verify search behavior on an installed model without changing history or bytes. |
| `A-ADV-155` | `app.js` delete-impact flow and `preferences-ui.js`; `group-selection-app.test.js`, browser delete-impact checks. | Warning preference gates the existing impact dialog; the reviewed tests cover impact contents but do not directly exercise the preference-off path. Verify both settings and confirm/cancel outcomes. |
| `A-ADV-156` | `model-search.js`, `catalog-folders.js`; `model-search.test.js`, `catalog-folders.test.js`. | Natural sorting is configurable and deterministic. Verify mixed numeric names in both model search and the catalog tree. |
| `A-ADV-157` | `catalog-folders.js`; `catalog-folders.test.js`. | Large folders render in configured pages and can be expanded progressively. Verify keyboard access and continued reachability in the installed UI. |
| `A-ADV-158` | `preferences.js` (`viewUsageLabel`), `where-used-ui.js`; `preferences.test.js`, `where-used-ui.test.js`, `where-used-app.test.js`. | View labels/templates are used in where-used results with inert substitutions and fallback. Verify long paths and duplicate view names remain distinguishable. |
| `A-ADV-159` | `catalog-folders.js` type-change preview; `catalog-folders.test.js`. | Type-change impact explanation is preference-controlled and cancellation is available. Verify cancel/apply and history in the installed UI. |
| `A-ADV-164` | `preferences-motion.js`, `app.js`; `preferences-motion.test.js`, `preferences-app.test.js`. | Bounded motion, cancellation, reduced-motion and final geometry are covered by source tests. Verify ordinary edits/Undo with reduced motion on Windows. |
| `A-ADV-165` | `preferences-motion.js`, `model-analysis-ui.js`; `preferences-motion.test.js`, `model-analysis-app.test.js`. | Analytical-graph animation is wired to the shared motion preference; helper tests cover disabled/reduced-motion paths. Verify root/filter changes do not leave overlapping animation in the installed analysis view. |
| `A-ADV-167` | `preferences-ui.js`, `workbench.js`; `preferences.test.js`. | Remappable key settings and text/IME guards exist. PR #62 fixes the editable-control shortcut bug; verify conflict handling and active shortcut labels in the packaged UI. |
| `A-EXT-001` | `viewport.js`, `preferences-ui.js`; `zoom-fit-app.test.js`, `gesture-tools.test.js`. | Pointer-centered wheel zoom and pan routes exist. Trackpad/pinch behavior is not established by the inspected tests; verify the intended Windows input devices before accepting gesture coverage. |
| `A-EXT-009` | `app.js` contour/relationship caches, `preferences.js` display projection; `preferences.test.js`, `preferences-effects-app.test.js`. | A render cache exists and preference-only projections avoid model edits. No exact-package timing or full native-file byte comparison was performed in this review. |
| `A-EXT-028` | `electron/team-profile.mjs`, `schemka-model-io/src/team-profile.js`; `electron/test/team-profile.test.mjs`, `team-profile-app.test.js`. | Startup team profile and portable-directory lookup have source tests. Verify the real packaged install/portable location and team-over-local precedence on Windows. |
| `A-EXT-029` | `theme.js`, `style.css`, notation/caption renderers; `theme.test.js`, `element-captions.test.js`. | Normal-text contrast tokens have an automated check, but this is not a full color-independent readability or Windows accessibility review. Verify redundant shape/text cues and focus states on the packaged UI. |

## Minimal next work

1. Keep `0.7.1-rc.1` limited to fixes and CI. This preferences/navigation
   evidence review does not move new feature scope into the patch RC.
2. Run one representative installed Windows pass over local preferences,
   save/reopen, search/navigation and one create/resize/Undo flow. Include the
   dirty marker, status bar, palette state and team profile where applicable;
   do not repeat unrelated stress suites.
3. Close the specific evidence gaps called out above (`A-ADV-115`, `148`,
   `155`, `A-EXT-001`, `009`, `028`, `029`) or record the agreed limit. Only
   implement an application change where the installed pass or a focused source
   review confirms a real user-visible gap.
4. Keep all other corpus criteria pending until their source/test routes,
   independent review and applicable native acceptance are tied to exact code
   and package versions.

## Verification boundary

This review inspected current source, existing test routes, the exact-main
GitHub check runs and merged PR #62. It did not rerun tests, install the
package, exercise native Windows dialogs/input, or perform final user
acceptance. Large-model/stress evidence remains separate from ordinary user
workflow acceptance.
