# Issue #20: CSV, XML, XLSX and model interoperability source review

Date: 2026-11-15

Public repository: `smart-tinker/arkita`

Reviewed implementation: `origin/main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`; documentation parent: `docs/issue-19-current-evidence` at `560c6f8bac7088631d897a7dcb66ae0a5b344a09`

## Result

The current source contradicts the historical `absent` inventory retained in
the feature cards and `program.json`. CSV, native model transfer, Archi XML,
Exchange XML/XSD, and XLSX routes exist on the reviewed main commit. The
`RELEASE-0.6.0.md#interoperability` summary describes them more accurately.

The source review found no need to change application code. This branch adds
three focused CSV regression assertions in `interchange.test.js` for exact
flattened output, spreadsheet-safe output, and the supported relationship
notation fields. The touched test file passed locally on Node v22.22.1:
16 PASS, 0 FAIL, 0 SKIP. The exact-head GitHub CI for this branch is pending.

All 25 issue #20 records remain `acceptance-pending`; `closed_criteria` stays
empty. Native Windows dialog and installed-package behavior have not been
verified for this group.

## Criterion map

| Criterion | Current source and retained test route | Review result / remaining proof |
| --- | --- | --- |
| A-ADV-044 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` canonical set round-trip | Source covers model, element, junction, relationship, property, and profile tables with IDs and typed relationship references. Round-trip test exists; acceptance remains pending. |
| A-ADV-045 | `schemka-model-io/src/csv.js`; `electron/test/automation-cli.test.mjs`; `electron/test/document-preferences.test.mjs` | Delimiter/prefix and multi-file export paths exist, including collision refusal. Native picker and packaged write behavior remain unrun. |
| A-ADV-046 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | UTF-8 decoding is fatal on invalid bytes; BOM is configurable; Unicode/BOM round-trip test exists. Legacy encodings are not silently substituted. |
| A-ADV-047 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` flatten assertion | Canonical mode preserves newlines; the added assertion verifies CRLF/CR/LF flattening in the exported cell and confirms the source bytes do not change. |
| A-ADV-048 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js`; XLSX inline-string regression | The added CSV assertion checks formula-like and zero-prefixed text receives the documented apostrophe prefix and confirms source immutability. Spreadsheet CSV remains text-only; import is rejected. |
| A-ADV-049 | `schemka-model-io/src/csv.js`; `schemka-model-ui/src/interchange-ui.js`; `schemka-model-ui/test/interchange-templates.test.js` | New-model and current-model routes validate the package before an apply/proposal. Native file-selection flow remains unrun. |
| A-ADV-050 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | Omitted records are retained; repeated IDs/type changes are rejected before apply; a one-action UI apply route exists. |
| A-ADV-051 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | Endpoint edits are checked against model/view consistency before the candidate can be applied. |
| A-ADV-052 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | Errors retain file, physical row, and field; malformed rows and unresolved references reject the package. |
| A-ADV-053 | `schemka-model-io/src/csv.js`; `schemka-model-core/src/current-catalog.js`; `schemka-model-io/test/interchange.test.js` | The added assertion checks relationship type (`ReadAccess`), typed endpoints, source/target multiplicities including presence flags, and `junctionRole`. CSV also carries profile applications; the current core has no separate `accessType` field. This is the supported Arkita field map, not a claim of broader notation equivalence. |
| A-ADV-055 | `schemka-model-io/src/model-transfer.js`; `schemka-model-ui/src/interchange-ui.js`; `schemka-model-io/test/interchange.test.js` | Native import preview is detached, validated, and atomic; this is not an arbitrary document-open replacement. |
| A-ADV-056 | `schemka-model-io/src/model-transfer.js`; `schemka-model-io/test/interchange.test.js` | Update-existing, folder, model-metadata, and property controls are explicit in the preview/apply route. |
| A-ADV-057 | `schemka-model-io/src/model-transfer.js`; `schemka-model-ui/src/interchange-ui.js`; `schemka-model-ui/test/interchange-templates.test.js` | Result summary and source-to-target IDs are available; UI tests cover the report after one apply. |
| A-ADV-058 | `schemka-model-io/src/model-transfer.js`; `schemka-model-io/test/interchange.test.js` | Replace versus merge is explicit and follows Arkita's unique-key property contract. Duplicate external property keys are not represented as a new format contract. |
| A-ADV-059 | `schemka-model-io/src/archi-native.js`; `schemka-model-io/src/archi-provenance.js`; `schemka-model-io/src/archi-report.js`; `schemka-model-io/test/archi-native.test.js`; `schemka-model-io/test/archi-export-loss.test.js` | A separate Archi native XML 5.0.0 reader exists with per-record decisions, stable source mapping, and diagnostics. It is deliberately not a claim of arbitrary Archi version or full 3.2-to-4 equivalence. |
| A-ADV-060 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/test/exchange-xml.test.js` | Export is explicitly Exchange 3.1 Preliminary, requires explicit layer mapping where needed, and emits loss notices. It does not claim ArchiMate 3.2/4 equivalence. |
| A-ADV-061 | `schemka-model-io/schemas/exchange-3.1`; `electron/xml-validator.mjs`; `electron/test/xml-validator.test.mjs` | Offline XSD validation and syntax/schema distinction exist; the optional schema files are returned as exact bytes. |
| A-ADV-062 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/test/exchange-xml.test.js` | Folder organization is exported when selected; disabling it reports the loss. The fixture round-trips two same-named folders with different IDs and owners. |
| A-ADV-063 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/test/exchange-xml.test.js` | Export language and import language selection exist; malformed tags fail, alternate language text is reported rather than silently substituted. |
| A-ADV-064 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/test/exchange-xml.test.js` | Dublin Core fields are allow-listed, escaped, and round-tripped as native properties where the model has no separate DC block. |
| A-ADV-065 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-ui/test/interchange-templates.test.js` | Exchange import validates before creating a separate unsaved model; cancel and stale validation cannot apply to the current model. |
| A-ADV-066 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/src/archi-report.js`; `schemka-model-io/test/exchange-xml.test.js`; `schemka-model-io/test/archi-report.test.js` | Unknown/unrepresentable fields are refused or included in diagnostics/loss reports; the tests explicitly prevent a false exact-route claim. |
| A-EXT-019 | `schemka-model-io/src/exchange-xml.js`; `schemka-model-io/src/archi-native.js`; `schemka-model-io/test/exchange-xml.test.js`; `schemka-model-io/test/archi-native.test.js` | Supported geometry/styles round-trip; unsupported profiles, routes, and fields are reported. This is bounded interoperability, not full cross-version equivalence. |
| A-EXT-020 | `schemka-model-io/src/csv.js`; `schemka-model-io/test/interchange.test.js` | Duplicate IDs, conflicting references, physical row numbers, comments, and late-package failure have regression coverage. |
| A-EXT-034 | `schemka-model-io/src/xlsx.js`; `schemka-model-io/test/interchange.test.js`; `schemka-model-ui/test/interchange-templates.test.js` | Six workbook sheets are generated from the CSV tables; values are inline strings and counts derive from table rows. XLSX import is explicitly out of scope. |

## Next minimal work

1. Require exact-head CI on the issue #20 branch; PR #76's green Windows run is
   only a baseline and does not include the new regression assertions.
2. Keep native Windows acceptance `UNRUN` until the installed UI/file routes
   are exercised. The source review and Node test run do not substitute for it.
3. Do not close issue #20 from code presence or CI alone; preserve the current
   criterion-level gaps and the `acceptance-pending` state.

## Verification boundary

The implementation review is against public main `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`;
the stacked branch starts at PR #76 head
`560c6f8bac7088631d897a7dcb66ae0a5b344a09`. The focused test command was
`node --test schemka-model-io/test/interchange.test.js` on Linux/Node v22.22.1.
That result is not the full aggregate, Windows execution, installed UI, or native
acceptance. No application source, feature-corpus historical cards, or
`coverage.json` changed.
