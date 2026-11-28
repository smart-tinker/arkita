# UX Workflow

This workflow applies to changes to Arkita's interface and shared UX contracts. Keep the change proportional to the task; a small correction does not need a redesign process.

## 1. Establish the current contract

Before proposing UI behavior, read [`AGENTS.md`](../AGENTS.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`README.md`](../README.md), the issue's linked domain contract, [`PRODUCT.md`](../PRODUCT.md), and [`DESIGN.md`](../DESIGN.md). Check the current issue, related PRs, and exact base/head rather than relying on an older screenshot or PR description.

Use the project's Impeccable skill for context and the specific reference that fits the request. Choose the mode for the requested surface; record it only in a task-specific brief. Follow existing product decisions over generic heuristics. For UI code changes, read the skill's `reference/craft-floor.md` immediately before editing. Do not repair unrelated documentation drift as a side effect.

UX contract changes belong on the designated `chore/ux-design-process` branch and in a separately reviewed docs PR. Keep application changes in their assigned feature branch/PR. If a required contract is unavailable, record that blocker before doing dependent UI work.

## 2. Define the observable task

Write down the user, entry point, expected result, and the states that matter: keyboard and pointer input, focus, selection, empty or busy state, invalid input, cancellation, stale work, and failure. Include only the states relevant to the issue.

Separate confirmed behavior from requirements and assumptions. If an interaction changes model data, state which records, views, references, file bytes, and history may change. Do not invent a model or format contract; resolve uncertainty with the owning role before implementation.

## 3. Make the smallest complete change

Reuse current DOM/SVG components, CSS tokens, commands, and interaction patterns. Keep the change within the assigned issue and version scope. For a reported bug, establish a regression that fails for the stated reason, then make the smallest fix. For a new interaction, define its acceptance scenarios first and cover its observable behavior in the existing test layers.

Preserve stable IDs, cross-view references, model bytes, and Undo/Redo semantics unless the issue explicitly changes them. Test cancellation, invalid input, stale responses, and repeated actions where applicable. Use synthetic fixtures; do not copy private models or credentials into the repository.

## 4. Verify each layer separately

Use the focused and aggregate commands in [`CONTRIBUTING.md`](../CONTRIBUTING.md) against the final change. Report the exact SHA, environment, command or workflow, result, and any limitation.

| Evidence layer | What it can establish | What it does not establish |
| --- | --- | --- |
| Source tests and static checks | Covered logic and repository-level regressions | Rendered interaction or native platform behavior |
| Real renderer/browser check | Visual and interactive behavior in that renderer | Packaged Electron or installed Windows behavior |
| Packaged build and runner install/launch | Package construction and runner smoke | User installation, display setup, or complete native acceptance |
| Installed Windows/userVM acceptance | Only the exact installed scenarios actually exercised | Untested criteria or unrelated changes |

Use `PASS`, `FAIL`, `UNRUN`, `INVALID`, or `BLOCKED` for each relevant acceptance row. A skipped or unavailable check is not a pass. Keep implementation, test, merge, publication, and acceptance statuses separate.

## 5. Deliver and review

Use one focused PR for the assigned scope and open it as a draft. Mark it ready for independent review when the implementation and required exact-SHA checks are ready. Its body should state the base and head, changed paths, evidence links, remaining `UNRUN` checks, and data or platform limits. Obtain independent review on the exact head. A ready or merged PR does not by itself complete a program criterion or authorize a release.

## Routes for current UI work

### #61 — A-EDITOR-003: detached model tree and palette

Start from the live [issue #11](https://github.com/smart-tinker/arkita/issues/11) and [PR #61](https://github.com/smart-tinker/arkita/pull/61); read their current exact refs and acceptance notes. Keep the owner window authoritative for the model, selection, history, and file operations. Review the detached-window snapshot and document/revision/view-bound command boundary, plus detach, dock, resize, close, and recovery behavior. Record source/renderer checks separately from installed Windows multi-monitor and DPI acceptance. Do not treat CI or PR status as acceptance of A-EDITOR-003.

### #126 — A-EDITOR-057: create an element and relationship from a connector

Start from [issue #126](https://github.com/smart-tinker/arkita/issues/126) and its direction-choice dependency [#104](https://github.com/smart-tinker/arkita/pull/104). Preserve the existing connector-to-existing-endpoint path. Cover both element-first and relationship-first choice orders and the correct endpoint direction; require the active verified profile to allow the ordered pair. Confirm one transaction creates the semantic element, occurrence, relationship, and connection, and that one Undo/Redo removes/restores the full change. Cancel, invalid, or stale input must leave model bytes and history unchanged. Keep the file format unchanged and report installed Windows acceptance separately; the parent criterion remains open until its own acceptance is complete.
