# Issue #23 current source and evidence review — 2026-11-19

## Scope and result

This follow-up verifies the ten source criteria assigned to public issue [#23](https://github.com/smart-tinker/arkita/issues/23), using runtime `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`. The records remain attached to historical corpus group 57 as required by the corpus mapping.

All ten criteria pass within the source, existing-test and synthetic-check boundaries below. This is not installed-app acceptance: every record remains `acceptance-pending`, no `closed_criteria` was added, and Windows acceptance remains `unrun`.

## Criterion results

| Criterion | Verified source/test result | Remaining acceptance |
| --- | --- | --- |
| `A-ADV-162` | PASS: offline help and keyboard routes are local; synthetic source/JSDOM confirms model markup remains literal text, creates no active nodes, executes no script and makes no fetch. | Installed Windows offline-help, keyboard/focus and inert-render acceptance remains unrun. |
| `A-ADV-163` | PASS: Markdown preview does not open or fetch a link before explicit action. A synthetic unavailable response shows an error while the inspector stays open and model bytes remain unchanged. | Installed Windows native confirmation, default-browser handoff and unavailable-site behavior remain unrun. |
| `A-ADV-169` | PASS: system/direct/manual policies and credential-free proxy validation are covered by source/tests. Disabling authorization blocks remote operations; a synthetic policy save preserved the exact model bytes. | Real Windows system/direct/manual proxy, authentication-failure and offline/local-work acceptance remains unrun. |
| `A-ADV-170` | PASS: the launcher uses the fixed Windows Credential Manager command with `shell: false`; Arkita delegates manual selection to Windows and does not read or save password contents. | Native Windows Credential Manager UI remains unrun; no app-managed password store is in scope. |
| `A-ADV-171` | PASS: unsupported schemes are rejected; confirmation defaults to cancel; only a confirmed action reaches the system-shell adapter. A stubbed failure produces a clear message, and the external page is not given the model or Arkita API. | Installed Windows confirmation, default-browser handoff and real system-browser failure feedback remain unrun. |
| `A-ADV-172` | PASS: synthetic package lifecycle checks show metadata before consent, explicit install/update/remove, rejection of unsupported engine/capability and unchanged model bytes. | Packaged/installed install-update-remove and restart/reopen behavior remains unrun; arbitrary JavaScript/Node plug-ins are not in scope. |
| `A-EXT-024` | PASS: source CLI checks cover JSON status/exit codes, Unicode paths, six CSV outputs, invalid-input refusal and overwrite preservation. Exact-main CI passed on Ubuntu, Windows and the CI gate. | Exact installed Windows executable CLI output/exit codes and output-directory behavior remain unrun. |
| `A-EXT-030` | PASS: source/JSDOM queries return the exact stable-ID record, match the normal UI projection, and leave bytes/history unchanged on invalid input; model text/import does not auto-run a package. | Packaged/installed read-query parity remains unrun. |
| `A-EXT-031` | PASS: synthetic multi-step preview leaves bytes/history unchanged; explicit apply creates one Undo; a stale revision disables apply and preserves the concurrent model. | Installed Windows batch preview/apply/Undo and save/reopen remain unrun. |
| `A-EXT-032` | PASS: synthetic package selection and manual run show the input/result, report step/line errors, retain focus and reject `fs.read`/network capability requests. | Installed Windows manual-run, cancellation, error-feedback and focus behavior remains unrun. |

## Verification boundary

The relevant host-policy, documentation and renderer source tests reported **54 passed, 0 failed**. The source automation test set reported **10 passed, 0 failed**. Focused synthetic JSDOM and Node checks covered the criterion-specific cases above; they used synthetic data and local adapters. The checkout runtime sources match the exact `main` SHA listed above.

The exact-main [GitHub Actions CI](https://github.com/smart-tinker/arkita/actions/runs/43646530875) passed Ubuntu, Windows and the CI gate. The corresponding [CodeQL run](https://github.com/smart-tinker/arkita/actions/runs/43646531019) passed. These checks and synthetic results do not establish installed Windows/native acceptance. The current documentation update is in draft [PR #80](https://github.com/smart-tinker/arkita/pull/80); its exact-head CI is tracked by the PR, separately from runtime-main evidence.

No source, test, workflow, release or user setting was changed for this review. No criterion was accepted or closed, no private data or local evidence paths are included, and no installed Windows/userVM check is claimed.
