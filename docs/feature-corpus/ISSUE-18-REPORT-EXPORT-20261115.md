# Issue #18: current report, export, and printing evidence

## Scope

This review is based on public `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b` and GitHub Actions run [43646530875](https://github.com/smart-tinker/arkita/actions/runs/43646530875), which completed successfully on that exact SHA. Issue #18 is still open and covers 24 criteria in historical corpus group 52.

The CI run passed the PR test profile and syntax checks on Ubuntu and Windows, Ubuntu renderer smoke, and Windows NSIS build, install, and launch checks. It did not inspect exported reports in an installed Windows session, exercise physical printing, or verify rendering across machines and fonts. This review does not close any criterion.

The corpus cards and `coverage.json` preserve the historical baseline. Their old “absent” labels are not current implementation status. This draft updates the 24 live ledger records with criterion-specific evidence and gaps, while preserving their status and not treating CI as native acceptance.

## Current evidence and boundaries

| Criteria | Present in source and automated checks | Still unverified or incomplete |
| --- | --- | --- |
| `A-EDITOR-085`–`088`, `A-ADV-160`, `A-EXT-008` | PNG scale/rasterization, SVG snapshot and bounds, PDF/print layout, text outlines, and export UI exist. Source tests cover export geometry, cancellation, and outlines. | Installed Windows viewer rendering, cross-machine font/DPI behavior, and physical printing. |
| `A-ADV-035`, `068`–`071` | HTML preview and offline report generation; report-local search, diagram zoom, and navigation-only filters. | Installed Windows review of a saved report and offline reopening. Navigation filters do not remove embedded report data. |
| `A-ADV-072` | `prepareReportProject()` excludes records, properties, and documentation before rendering; tests check excluded text is absent and the source model is unchanged. | Add one targeted saved-byte acceptance case for an excluded image-bearing drawing/attachment. |
| `A-ADV-073`, `A-EXT-026` | Bounded, read-only `contains` queries by record kind/field; chunked cancellation and stable-ID result links; report revision/date. No SQL engine. | Record this narrow query contract as the accepted scope; no general SQL/query language is implemented. |
| `A-ADV-074`, `A-EXT-012` | Closed Markdown subset with Unicode, tables, code, links, and HTML escaping. | Automated coverage exists; installed Windows font/rendering behavior remains unverified. |
| `A-ADV-075`, `077`, `A-EXT-025` | Template v1 supports title, section order, locale, footer, and validated model logo; JSON templates can be opened and saved. | Partial: page-number/style controls and a template catalog are absent. |
| `A-ADV-076` | The export dialog offers SVG, PNG, PDF, print, and HTML; native dialogs select output location. | Report output is HTML. PDF is a single-view diagram export; report PDF, RTF, Word, PowerPoint, and OpenDocument are absent. The issue has no recorded priority decision for these formats. |
| `A-ADV-078` | `ru-RU` and `en-US` are supported for report labels, numbers, and dates; unsupported locales are rejected. | Missing-translation fallback has no separate demonstrated case. |
| `A-EXT-015` | Read-only relationship analysis supports navigation/history, zoom, filters, orientation, orthogonal routes, and stable IDs. Tests check that analysis preserves model bytes/history. | Installed UI acceptance is not recorded. |
| `A-EXT-022` | Partial implementation exists in `visuals-ui.js`, `visual-drawings.js`, and `native-v4.js`: per-drawing `style.labelTemplate` is stored in native v4; `captionText()` resolves `${name}`, `${type}`, `${id}`, `${documentation}`, `${model.name}`, and repeated `${property:key}` values. Unknown placeholders remain literal. The renderer is used for semantic occurrences and relationships; `visual-drawings.test.js` covers substitutions and rendering. | No authoring preview or template diagnostics were found. The text field is not bound to type/relation-specific property choices or specialization profiles. Treat as partial, not absent; any completion belongs on the `0.8.0-alpha.1` feature line. |
| `A-EXT-023` | No context resolver for view, parent, or relationship endpoints was found. Existing `model.name` lookup and folder child-label templates resolve only their direct record; they do not implement the requested stable-ID context references. | Context expressions and rules for missing/multiple targets, cycles, and inheritance remain a separate `0.8.0-alpha.1` feature gap, outside `0.7.1-rc.1`. |

## Criterion source/test map

These paths show the current source and automated coverage reviewed on `main` `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`. They are implementation evidence, not accepted Windows behavior.

| Criteria | Current source | Automated checks |
| --- | --- | --- |
| `A-EDITOR-085`, `A-ADV-160` | [raster-export.js](../../schemka-model-ui/src/raster-export.js) | [raster-export.test.js](../../schemka-model-ui/test/raster-export.test.js) |
| `A-EDITOR-086`, `A-EXT-008` | [svg-export.js](../../schemka-model-ui/src/svg-export.js), [svg-export-profile.js](../../schemka-model-io/src/svg-export-profile.js) | [svg-export.test.js](../../schemka-model-ui/test/svg-export.test.js), [svg-export-app.test.js](../../schemka-model-ui/test/svg-export-app.test.js) |
| `A-EDITOR-087`, `A-EDITOR-088` | [print-service.mjs](../../electron/print-service.mjs), [print-layout.js](../../schemka-model-io/src/print-layout.js), [svg-text-outlines.js](../../schemka-model-ui/src/svg-text-outlines.js) | [print-layout.test.js](../../schemka-model-io/test/print-layout.test.js), [clipboard-print.test.mjs](../../electron/test/clipboard-print.test.mjs), [svg-text-outlines.test.js](../../schemka-model-ui/test/svg-text-outlines.test.js) |
| `A-ADV-035`, `A-ADV-068`, `A-ADV-069`, `A-ADV-070`, `A-ADV-071` | [export-report-ui.js](../../schemka-model-ui/src/export-report-ui.js), [report.js](../../schemka-model-io/src/report.js) | [export-report-ui.test.js](../../schemka-model-ui/test/export-report-ui.test.js), [report.test.js](../../schemka-model-io/test/report.test.js) |
| `A-ADV-072`, `A-ADV-073` | [report.js](../../schemka-model-io/src/report.js) | [report.test.js](../../schemka-model-io/test/report.test.js) |
| `A-ADV-074`, `A-EXT-012` | [report-markdown.js](../../schemka-model-io/src/report-markdown.js), [report.js](../../schemka-model-io/src/report.js) | [report-markdown.test.js](../../schemka-model-io/test/report-markdown.test.js), [report.test.js](../../schemka-model-io/test/report.test.js) |
| `A-ADV-075`, `A-ADV-077`, `A-EXT-025` | [report.js](../../schemka-model-io/src/report.js), [templates.js](../../schemka-model-io/src/templates.js), [templates-ui.js](../../schemka-model-ui/src/templates-ui.js) | [report.test.js](../../schemka-model-io/test/report.test.js), [export-report-ui.test.js](../../schemka-model-ui/test/export-report-ui.test.js) |
| `A-ADV-076` | [export-report-ui.js](../../schemka-model-ui/src/export-report-ui.js), [file-service.mjs](../../electron/file-service.mjs), [report.js](../../schemka-model-io/src/report.js) | [export-report-ui.test.js](../../schemka-model-ui/test/export-report-ui.test.js), [report.test.js](../../schemka-model-io/test/report.test.js) |
| `A-ADV-078` | [report.js](../../schemka-model-io/src/report.js) | [report.test.js](../../schemka-model-io/test/report.test.js) |
| `A-EXT-015` | [model-analysis-ui.js](../../schemka-model-ui/src/model-analysis-ui.js), [model-analysis-graph.js](../../schemka-model-ui/src/model-analysis-graph.js) | [model-analysis-app.test.js](../../schemka-model-ui/test/model-analysis-app.test.js) |
| `A-EXT-022` | [visuals-ui.js](../../schemka-model-ui/src/visuals-ui.js), [visual-drawings.js](../../schemka-model-ui/src/visual-drawings.js), [native-v4.js](../../schemka-model-core/src/native-v4.js) | [visuals-ui.test.js](../../schemka-model-ui/test/visuals-ui.test.js), [visual-drawings.test.js](../../schemka-model-ui/test/visual-drawings.test.js) |
| `A-EXT-023` | No matching context-expression resolver was identified in the reviewed source. | No matching resolver test was identified; this remains a feature gap. |
| `A-EXT-026` | [report.js](../../schemka-model-io/src/report.js) | [report.test.js](../../schemka-model-io/test/report.test.js) |

## Minimal next plan

1. Done in this draft: replace generic `remaining` text in all 24 live ledger records with criterion-specific source/test evidence and concrete acceptance gaps. All retain `current_status: acceptance-pending`, `windows_acceptance: unrun`, and `closed_criteria: []`.
2. Keep the narrow HTML report/query/template contract explicit. Report-format priority is still undecided; do not add SQL, report-format infrastructure, or a template catalog to `0.7.1-rc.1` without a separate decision.
3. For the applicable Windows checks, use one disposable synthetic model: preview and save HTML, verify excluded content in the saved bytes, reopen offline, and open SVG/PDF/PNG with Cyrillic and long labels. Treat printing and cross-machine font/DPI behavior as separate checks.
4. Keep capacity stress and environment fault-injection results separate from this representative user workflow. Do not infer a product defect from a test that cannot run on the Windows runner.
5. Keep issue #18 open until each criterion has evidence or an explicitly accepted limitation; do not infer issue closure or release readiness from source presence or CI alone.

## Outcome

Most of this group is not an implementation-absent gap. The current ledger now records the source/test routes and concrete gaps; bounded installed-Windows acceptance remains. Output-format priority still needs a decision. A-EXT-022 is partially implemented; A-EXT-023 is a separate feature gap. Both remain outside `0.7.1-rc.1`. Issue #18 remains open, and this review does not change the RC scope or status.
