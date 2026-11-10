# Arkita: working agreement

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [README.md](README.md) and the issue's linked domain contract. Keep this entry point short; do not duplicate the handbook.

## Boundaries and invariants
- Core model/commands, profiles, IO, renderer and Electron host have separate responsibilities. Shared concepts are not their view geometry; preserve stable IDs and cross-view references.
- Cancel, stale async results, repeated Apply and navigation with unsaved work must not silently mutate or discard the user's model.
- Preview/apply changes are validated and atomic; preserve the documented Undo/Redo contract.
- Verify save → close → reopen with a synthetic model, including relationships, views and resources. Migration uses separate Save As and preserves original bytes. Never treat backup-before-save as recovery of unsaved edits.
- Do not expand supported formats or normative conformance claims without evidence. Preserve unknown/unsupported diagnostics and explicit import decisions.
- Source tests, packaged renderer and installed Windows/native UI are separate evidence layers. DOM/injected adapters are not native dialogs. Installer existence/size is not installation, launch or acceptance.

## Small, verifiable work
1. Re-read current issue, PRs and relevant contracts; record baseline SHA and scope. Reuse existing work instead of duplicating migration #2.
2. For a bug, capture a regression that fails for the stated reason before the minimal fix; do not weaken expectations to get green. For non-bugs, define observable acceptance first.
3. Run focused checks, then applicable aggregate checks from CONTRIBUTING on the final tree. Record exact commands, tested SHA, environment and limitations; repeat affected checks after later changes.
4. Keep one current status block in issue/PR: implemented, tested, merged, published and accepted are distinct. Each DoD row needs evidence and PASS/FAIL/UNRUN/INVALID/BLOCKED; absence of evidence is never PASS.
5. Stop and describe the missing decision when public APIs, format semantics or scope are uncertain. Do not invent contracts, broaden a refactor or publish private fixtures.
6. Open a draft PR. No merge/release, workflow/permission changes or paid checks are implied. Persistence and release-boundary changes need explicit independent review.

Use the [issue template](.github/ISSUE_TEMPLATE/work-item.md) and [PR evidence template](.github/pull_request_template.md). Keep fixture data synthetic; never copy private models, credentials or acceptance reports.
