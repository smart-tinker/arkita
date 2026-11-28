# Product

Arkita is a standalone Electron desktop editor for architecture models in the ArchiMate 4 notation. It is designed for Windows x64. The product is a working editor, not a hosted modeling service. “Схемка” is a separate Mermaid editor.

## People and work

Architects and colleagues use Arkita to maintain a model over long editing sessions: organize model records, create and compare views, draw on a canvas, edit properties, and save or exchange project files. The editor should make the current model and the consequence of an action easy to understand.

## Product boundaries

- A semantic model record and its drawing in a view are different things. A semantic element can be referenced from more than one view. Preserve stable IDs and cross-view references when changing either layer.
- Canvas appearance and routing do not redefine model meaning. Do not silently change an element, relationship, saved file, or history as a side effect of a view-only action.
- Device-specific workspace preferences are presentation state. They are not model content or model Undo/Redo history.
- File editing, model history, application preferences, and Git state are distinct. Explain which one a command changes.
- Use synthetic or explicitly approved fixtures for public tests and review. Never place a user's model, credentials, or private acceptance material in a public issue, pull request, or fixture.
- Do not claim normative ArchiMate conformance or support for an exchange format unless the repository's current contract and evidence establish it.

## Product principles

- Preserve model meaning, IDs, references, and user-authored bytes outside the requested change.
- Keep edits reversible where the editor supports Undo/Redo. Cancellation, invalid input, stale asynchronous results, and repeated actions must not silently apply or discard work.
- Explain the scope of destructive or broad changes before the user commits them.
- Prefer the existing desktop, DOM, and SVG interaction patterns to new visual systems or dependencies.
- Treat the source renderer, packaged application, and installed Windows application as separate product surfaces with separate evidence.

For current behavior and development boundaries, see [README.md](README.md), [AGENTS.md](AGENTS.md), and [CONTRIBUTING.md](CONTRIBUTING.md). The [versioning policy](docs/VERSIONING.md) governs release scope; this product document does not authorize a release.
