# Schemka catalog

A portable, browser-only catalog viewer for the platform's `/catalog/` route. No npm dependencies, backend, Sites SDK, authentication, storage, external fonts, analytics, or synchronization. The built-in fixture is entirely synthetic and contains no personal catalog records.

## Integration

Copy `index.html`, `style.css`, `app.js`, `catalog.js`, and `sample-catalog.js` into the static build's `catalog/` directory. Serve over HTTP(S); browser ES modules are not intended to run via `file://`. Shared navigation links use `data-mode-link` and point to `/`, `/mermaid/`, `/model/`, and `/catalog/`.

The static Content Security Policy allows only same-origin scripts/styles and disables network connections, embedded objects and form submission. No imported value is used as HTML, an executable URL, a selector, or a file path. References to knowledge and model elements are plain text. The viewer never follows catalog URLs.

## Local data

Use **Открыть JSON** to load a local JSON file. Schema version `0.1.0` is supported. The parser validates core record fields, optional typed metadata, unique IDs, referential integrity and service → offer → request ownership. Missing optional metadata stays visibly unknown. The viewer is deliberately less restrictive than the preparation schema's domain-specific status constants: an imported status is a claim in the file, never a live health check. Unknown bounded fields are retained for lossless JSON export.

Imports are limited to 2 MiB; each array has a maximum of 2,000 items, strings 20,000 characters, IDs 160 characters, and nested values 16 levels. Prototype-related keys and unsupported values are rejected. Invalid imports leave the current catalog intact. File imports never reach localStorage, IndexedDB, a server or the repository. Reloading or closing clears them. The original selected file is never modified.

Imported sessions prompt before replacement or mode navigation and use the browser's `beforeunload` guard. Browsers may suppress unload prompts in some circumstances. **Скачать JSON** requests a download and clears the warning; the UI explicitly asks the user to verify the saved download, because browsers do not expose download completion to this page.

## User-facing behavior

- Search matches service, offer and request names; filter by direction.
- Inspect service offers and expand request input/completion criteria.
- Review associated systems, knowledge, evidence, scope, support participants and handoffs.
- Request types remain suggestions when marked as such in the file.
- Imported status values are displayed without asserting monitoring or availability.
- ArchiMate IDs are never marked verified. Missing IDs are explicitly unresolved; supplied IDs are explicitly unverified.
- Choosing a service/request authorizes nothing and dispatches nothing, even if imported metadata claims automation.
- No private catalog, identity details, source URLs, environment files or credentials belong in the repository fixture.

## Tests

Run `npm test --prefix schemka-catalog` from the platform root or `npm test` here. Tests use Node's built-in runner, the platform root's pinned jsdom development dependency, and synthetic data only. Run `npm ci` in the platform root first. The runtime itself has no dependencies. They cover parsing, unsafe input, byte/depth/collection limits, ownership, duplicate IDs, selection/search, unverified bindings and export round trips. Static UI checks guard against network/storage APIs and HTML injection sinks. Production-app DOM tests cover boot, tabs and request expansion, filtering, hostile text, preserved state after invalid imports, cancelled replacements and navigation, in-flight reads, file-read failures, downloads and failed export cleanup. These DOM tests do not replace real-browser layout or download-completion checks.
