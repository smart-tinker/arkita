# Issue #18: current report, export, and printing evidence

## Scope

This review is based on public `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b` and GitHub Actions run [43646530875](https://github.com/smart-tinker/arkita/actions/runs/43646530875), which completed successfully on that exact SHA. Issue #18 is still open and covers 24 criteria in historical corpus group 52.

The CI run passed the PR test profile and syntax checks on Ubuntu and Windows, Ubuntu renderer smoke, and Windows NSIS build, install, and launch checks. It did not inspect exported reports in an installed Windows session, exercise physical printing, or verify rendering across machines and fonts. This review does not close any criterion.

The corpus cards and `coverage.json` preserve the historical baseline. Their old “absent” labels are not current implementation status. The current issue ledger still has generic `remaining` text for the 24 records; update that ledger separately without changing historical statuses or treating CI as native acceptance.

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
| `A-EXT-022`, `023` | No general model-field/context expression for concept labels was found. Preferences for usage-label expressions are a different feature. | This is an actual feature gap; keep it on the `0.8.0-alpha.1` feature line, outside `0.7.1-rc.1`. |

## Minimal next plan

1. Replace generic `remaining` text in the 24 live ledger records with criterion-specific source/test evidence and concrete acceptance gaps. Keep `current_status: acceptance-pending`, `windows_acceptance: unrun`, and `closed_criteria: []` until accepted evidence exists.
2. Record the narrow HTML report/query/template contract. Do not add SQL, report-format infrastructure, or a template catalog as part of `0.7.1-rc.1` without a separate priority decision.
3. For the applicable Windows checks, use one disposable synthetic model: preview and save HTML, verify excluded content in the saved bytes, reopen offline, and open SVG/PDF/PNG with Cyrillic and long labels. Treat printing and cross-machine font/DPI behavior as separate checks.
4. Keep capacity stress and environment fault-injection results separate from this representative user workflow. Do not infer a product defect from a test that cannot run on the Windows runner.
5. Keep issue #18 open until each criterion has evidence or an explicitly accepted limitation; do not infer issue closure or release readiness from source presence or CI alone.

## Outcome

Most of this group is not an implementation-absent gap. The main work is an accurate current ledger and bounded installed-Windows acceptance. Output-format scope needs a priority decision; label expressions are a separate feature gap. Issue #18 remains open, and this review does not change `0.7.1-rc.1` scope or status.
