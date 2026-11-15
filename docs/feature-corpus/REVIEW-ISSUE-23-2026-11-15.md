# Issue #23 current source and evidence review — 2026-11-15

## Scope and result

Public issue [#23](https://github.com/smart-tinker/arkita/issues/23) represents
historical corpus group 57 and lists ten criteria. The baseline reviewed here is
public `main` at `3a4a58afe154ab88cd8bcd4383d0d6b0fa47b40b`.

Several entries still point to the `0.6.0` snapshot and call current work absent.
Current source already contains offline, inert hints; an explicit host policy for
Git proxy, authorization and external links; a bounded installed-app CLI; and a
declarative automation package manager with read/query and atomic model commands.
This is source/test-route evidence, not criterion acceptance. All ten records
remain `acceptance-pending`; no criterion is closed and installed Windows
acceptance remains `unrun`.

## Criterion map

| Criterion | Current source and existing regression route | Review result and remaining proof |
| --- | --- | --- |
| `A-ADV-162` | `context-hints-ui.js`, `workspace-ui.js`, `window-guards.mjs`; `context-hints-app.test.js`, `workspace-ui.test.js`, `notation-app.test.js`. | Hints and help are local text rendered as text; active HTML/JavaScript hints and privileged web content are unsupported. Verify offline help, keyboard flow and model documentation on the installed Windows app. |
| `A-ADV-163` | `workspace-ui.js`, `documentation-editor.js`, `host-actions.mjs`, `file-service.mjs`; `documentation-markdown-app.test.js`, `documentation-editor.test.js`, `host-policy.test.mjs`. | Local help is available offline. External HTTP(S) links require an explicit action and native confirmation, then open in the system browser. Verify the packaged Windows confirmation/browser path and that unavailable sites do not affect the inspector. |
| `A-ADV-169` | `git-network-policy.mjs`, `git-repository.mjs`, `git-service.mjs`, `host-policy-ui.js`; `host-policy.test.mjs`, `host-policy-app.test.js`. | Per-connection `system`, `direct` and credential-free `manual` HTTPS proxy policies are implemented; SSH keeps system configuration and network authorization can be disabled without affecting local work. Real Windows direct/proxy/auth-failure/offline behavior remains unaccepted. |
| `A-ADV-170` | `host-actions.mjs`, `git-network-policy.mjs`, `git-repository.mjs`, `host-policy-ui.js`; `host-policy.test.mjs`, `host-policy-app.test.js`. | Arkita delegates credential deletion to the Windows Credential Manager UI and does not read or return secrets. Tests check the fixed native launcher and that disabling authorization preserves local model/history. Verify the native Windows Credential Manager flow; do not add a second password store. |
| `A-ADV-171` | `documentation-editor.js`, `host-actions.mjs`, `file-service.mjs`, `preload.cjs`, `main.mjs`, `window-guards.mjs`; `documentation-editor.test.js`, `host-policy.test.mjs`. | Supported HTTP(S) links open only through a separate confirmed native action; unsupported schemes and privileged embedded browsing are rejected. Verify the installed Windows prompt, default-browser handoff and failure message. |
| `A-ADV-172` | `automation-ui.js`, `schemka-model-core/src/automation.js`, `schemka-model-io/src/automation.js`; `automation-ui.test.js`, `automation-app.test.js`, `automation.test.js`. | The current extension surface is a local declarative package library: version, engine and requested capabilities are shown before install; install/update/remove are explicit; invalid or failed writes preserve the prior library and model. It intentionally has no arbitrary JavaScript/Node plugin loader. Verify the packaged install/remove flow and model preservation. |
| `A-EXT-024` | `electron/entry.mjs`, `scripts/arkita-cli.mjs`; `automation-cli.test.mjs`, `cli-entry-harness.mjs`. | Installed-app `--cli` supports documented `validate` and `export-csv` with JSON output, exit codes, Unicode paths and no-overwrite behavior. Verify stdout/exit codes and output-directory behavior from the exact Windows executable. |
| `A-EXT-030` | `schemka-model-core/src/automation.js` (`queryModel`); `automation.test.js`, `automation-ui.test.js`. | A bounded, read-only query API uses stable IDs and returns detached records/properties; it cannot execute package code or mutate a model. Verify representative query parity in the packaged workflow. |
| `A-EXT-031` | `schemka-model-core/src/automation.js`, `schemka-model-ui/src/automation-ui.js`; `automation.test.js`, `automation-ui.test.js`, `automation-app.test.js`. | Declarative rename/property/closed-command batches use normal validation, preview exact changes and commit as one Undo; cancel, error and stale revision do not partially apply. Verify one package through the installed UI and save/reopen. |
| `A-EXT-032` | `automation-ui.js`, `schemka-model-core/src/automation.js`, `schemka-model-io/src/automation.js`; `automation-ui.test.js`, `automation-app.test.js`. | Local packages require explicit install/enable/run consent, show bounded results/errors and can be cancelled or removed. File/network access is not granted to packages; save and Git remain separate. Verify manual run, cancel and error feedback in the installed Windows UI. |

## Verification boundary

The inspected test files are existing routes; none were run for this review. The
exact-main GitHub Actions run [43646530875](https://github.com/smart-tinker/arkita/actions/runs/43646530875)
and CodeQL run [43646531019](https://github.com/smart-tinker/arkita/actions/runs/43646531019)
passed. They do not prove installed native behavior for this issue.

No source code, tests, workflows or release state changed. Do not add arbitrary
executable plug-ins or expand `0.7.1-rc.1`; user chose that patch RC for fixes and
CI, with Windows test/CI fixes included. Keep the open feature criteria and
their acceptance evidence on the later feature line. No Actions artifacts,
release or issue closure is claimed.

## Next work

1. Keep the ten criteria pending until their evidence is tied to exact source
   and, where applicable, the packaged Windows UI.
2. Reuse the bounded automation and host-policy contracts already in `main`;
   implement only a gap demonstrated by the criterion-specific acceptance.
3. For patch RC `0.7.1-rc.1`, continue its separate exact-package and userVM
   gates. This source review does not close migration issue #2 or parent #9.
