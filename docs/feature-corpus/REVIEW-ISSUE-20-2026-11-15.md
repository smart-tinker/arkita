# Issue #20: CSV, XML, XLSX and model interoperability source review

Date: 2026-11-18

Public repository: `smart-tinker/arkita`

Reviewed implementation: `origin/main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`; documentation parent: `docs/issue-19-current-evidence` at `560c6f8bac7088631d897a7dcb66ae0a5b344a09`

## Result

The source review is against public `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`. This update accepts exactly ten issue #20 criteria: A-ADV-046, A-ADV-052, A-ADV-055, A-ADV-058, A-ADV-059, A-ADV-060, A-ADV-061, A-ADV-062, A-ADV-064, A-EXT-020. The other fifteen remain `acceptance-pending`: A-ADV-044, A-ADV-045, A-ADV-047, A-ADV-048, A-ADV-049, A-ADV-050, A-ADV-051, A-ADV-053, A-ADV-056, A-ADV-057, A-ADV-063, A-ADV-065, A-ADV-066, A-EXT-019, A-EXT-034. A-ADV-063 remains pending while draft [PR #90](https://github.com/smart-tinker/arkita/pull/90) is unmerged. The 339-record inventory and nine original exclusions are unchanged.

Merged [bootstrap PR #1](https://github.com/smart-tinker/arkita/pull/1) and [Extended CI run 43858177729](https://github.com/smart-tinker/arkita/actions/runs/43858177729) provide public-repository provenance and exact-main automated evidence; the run passed full tests and syntax checks on Ubuntu and Windows and uploaded no Actions artifacts. Independent QA passed the synthetic evidence set, including CSV Cyrillic/BOM/quoted fields; incompatible ID/type rejection before mutation; V4 repeated keys through replace/Undo; Dublin Core description escaping and empty-metadata omission; and duplicate relationship-ID rejection without mutation.

These criterion decisions do not close issue #20 or imply release acceptance. Installed Windows/native file-dialog acceptance remains `UNRUN` for the group.

## Criterion map

| Criterion | Current source and retained test route | Review result / remaining proof |
| --- | --- | --- |
| A-ADV-044 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` canonical set round-trip | Source covers model, element, junction, relationship, property, and profile tables with IDs and typed relationship references. Round-trip test exists; acceptance remains pending. |
| A-ADV-045 | `schemka-model-io/src/csv.js`; `electron/test/automation-cli.test.mjs`; `electron/test/document-preferences.test.mjs` | Delimiter/prefix and multi-file export paths exist, including collision refusal. Native picker and packaged write behavior remain unrun. |
| A-ADV-046 | [CSV source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/csv.js); [interchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/interchange.test.js) | **Accepted.** UTF-8/BOM and Unicode routes are covered; independent QA passed Cyrillic, BOM, and quoted-field synthetic checks. Legacy encodings remain explicit and are not silently substituted. |
| A-ADV-047 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` flatten assertion | Canonical mode preserves newlines; the added assertion verifies CRLF/CR/LF flattening in the exported cell and confirms the source bytes do not change. |
| A-ADV-048 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js`; XLSX inline-string regression | The added CSV assertion checks formula-like and zero-prefixed text receives the documented apostrophe prefix and confirms source immutability. Spreadsheet CSV remains text-only; import is rejected. |
| A-ADV-049 | `schemka-model-io/src/csv.js`; `schemka-model-ui/src/interchange-ui.js`; `schemka-model-ui/test/interchange-templates.test.js` | New-model and current-model routes validate the package before an apply/proposal. Native file-selection flow remains unrun. |
| A-ADV-050 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | Omitted records are retained; repeated IDs/type changes are rejected before apply; a one-action UI apply route exists. |
| A-ADV-051 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | Endpoint edits are checked against model/view consistency before the candidate can be applied. |
| A-ADV-052 | [CSV source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/csv.js); [interchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/interchange.test.js) | **Accepted.** Diagnostics retain file, physical row, and field; invalid IDs/types and unresolved references reject before mutation. QA confirmed incompatible ID/type and duplicate relationship-ID rejection without mutation. |
| A-ADV-053 | `schemka-model-io/src/csv.js`; `schemka-model-core/src/current-catalog.js`; `schemka-model-io/test/interchange.test.js` | The added assertion checks relationship type (`ReadAccess`), typed endpoints, source/target multiplicities including presence flags, and `junctionRole`. CSV also carries profile applications; the current core has no separate `accessType` field. This is the supported Arkita field map, not a claim of broader notation equivalence. |
| A-ADV-055 | [model-transfer source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/model-transfer.js); [interchange UI](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-ui/src/interchange-ui.js); [interchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/interchange.test.js) | **Accepted.** Native import preview is detached, validated, and atomic; QA confirmed incompatible ID/type rejection before mutation. This does not claim arbitrary document-open replacement. |
| A-ADV-056 | `schemka-model-io/src/model-transfer.js`; `schemka-model-io/test/interchange.test.js` | Update-existing, folder, model-metadata, and property controls are explicit in the preview/apply route. |
| A-ADV-057 | `schemka-model-io/src/model-transfer.js`; `schemka-model-ui/src/interchange-ui.js`; `schemka-model-ui/test/interchange-templates.test.js` | Result summary and source-to-target IDs are available; UI tests cover the report after one apply. |
| A-ADV-058 | [model-transfer source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/model-transfer.js); [interchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/interchange.test.js); [V4 property tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-ui/test/object-properties.test.js) | **Accepted.** V4 preserves repeated property keys through replace/Undo. The old unique-key statement describes the historical contract, not current V4; no broader external-format compatibility is claimed. |
| A-ADV-059 | [Archi native reader](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/archi-native.js); [reader tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/archi-native.test.js); [loss tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/archi-export-loss.test.js) | **Accepted.** The Archi native XML 5.0.0 reader has per-record decisions, stable source mapping, and diagnostics. This is not arbitrary Archi-version support or full 3.2-to-4 equivalence. |
| A-ADV-060 | [Exchange XML source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/exchange-xml.js); [Exchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/exchange-xml.test.js) | **Accepted.** Export targets Exchange 3.1 Preliminary, requires explicit mapping where needed, and reports unsupported losses. It does not claim ArchiMate 3.2/4 equivalence. |
| A-ADV-061 | [pinned Exchange schemas](https://github.com/smart-tinker/arkita/tree/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/schemas/exchange-3.1); [XML validator](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/electron/xml-validator.mjs); [validator tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/electron/test/xml-validator.test.mjs) | **Accepted.** Offline XSD validation is reproducible; syntax and schema failures are distinct, and optional schema files are returned as exact bytes. |
| A-ADV-062 | [Exchange XML source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/exchange-xml.js); [Exchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/exchange-xml.test.js) | **Accepted.** Selected folder organization is exported; disabled organization reports loss. Fixtures keep same-named folders distinct by ID and owner. |
| A-ADV-063 | [Exchange XML source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/exchange-xml.js); [Exchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/exchange-xml.test.js) | **Pending.** Existing language selection remains; explicit missing-language fallback diagnostics are in unmerged draft [PR #90](https://github.com/smart-tinker/arkita/pull/90), pending review and merge. |
| A-ADV-064 | [Exchange XML source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/exchange-xml.js); [Exchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/exchange-xml.test.js) | **Accepted.** Dublin Core fields are allow-listed and escaped; QA confirmed description escaping and omission of empty metadata. |
| A-ADV-065 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-ui/test/interchange-templates.test.js` | Exchange import validates before creating a separate unsaved model; cancel and stale validation cannot apply to the current model. |
| A-ADV-066 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/src/archi-report.js`; `schemka-model-io/test/exchange-xml.test.js`; `schemka-model-io/test/archi-report.test.js` | Unknown/unrepresentable fields are refused or included in diagnostics/loss reports; the tests explicitly prevent a false exact-route claim. |
| A-EXT-019 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/src/archi-native.js`; `schemka-model-io/test/exchange-xml.test.js`; `schemka-model-io/test/archi-native.test.js` | Supported geometry/styles round-trip; unsupported profiles, routes, and fields are reported. This is bounded interoperability, not full cross-version equivalence. |
| A-EXT-020 | [CSV source](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/src/csv.js); [interchange tests](https://github.com/smart-tinker/arkita/blob/3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b/schemka-model-io/test/interchange.test.js) | **Accepted.** Duplicate IDs, conflicting references, row context, explicit comments, and late-package failure have coverage; QA confirmed duplicate relationship-ID rejection without mutation. |
| A-EXT-034 | `schemka-model-io/src/xlsx.js`; `schemka-model-io/test/interchange.test.js`; `schemka-model-ui/test/interchange-templates.test.js` | Six workbook sheets are generated from the CSV tables; values are inline strings and counts derive from table rows. XLSX import is explicitly out of scope. |

## Next minimal work

1. Keep installed Windows/native file-dialog acceptance `UNRUN` until the exact
   package is exercised on Windows. The synthetic checks and Extended CI do not replace it.
2. Keep the other 15 criteria acceptance-pending, including A-ADV-063 until PR #90
   is reviewed and merged. Do not close issue #20 or claim release acceptance from this partial set.

## Verification boundary

The criterion review is against public main `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`;
the stacked branch starts at PR #76 head
`560c6f8bac7088631d897a7dcb66ae0a5b344a09`. The focused Linux test command was
`node --test schemka-model-io/test/interchange.test.js` on Node v22.22.1.
The source/test commit `6915b691c9a74d20a10c432f9d62730b9779f0e1` passed the
PR test profile on Ubuntu and Windows; Windows also passed NSIS build, package
verification, installation and launch. The merged public bootstrap is
[PR #1](https://github.com/smart-tinker/arkita/pull/1). Extended CI
[run 43858177729](https://github.com/smart-tinker/arkita/actions/runs/43858177729)
ran against exact main SHA `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`; Ubuntu and
Windows full-test and syntax jobs passed, with zero Actions artifacts. The
earlier docs-only PR head `087ba7d9a484ad78ac6aa73588ecc23dc490a354` passed
Ubuntu and Windows validation plus the CI gate in run
[43680792855](https://github.com/smart-tinker/arkita/actions/runs/43680792855).
These runner and synthetic results do not verify native file dialogs or an
installed user package. `windows_acceptance` therefore remains `unrun`.
No application source, historical feature cards, or `coverage.json` changed.
