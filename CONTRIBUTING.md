# Development

Use Node.js 22+, then `npm ci --ignore-scripts`, `npm test`, `npm run check`, `npm start`. Build-only work needs no npm dependencies. Keep generated `dist/` and private imported data out of commits.

Work in feature branches and open draft PRs. Do not bundle secrets, credentials, infrastructure inventories, deployments, workflows, permission changes or history rewrites with platform edits. No deploy is configured by this repository.

Use [the versioning and release policy](docs/VERSIONING.md) for candidate naming, release gates and publication state. A green CI run or draft PR does not authorize a release.

Renderer browser checks are separate from `npm test` and native Windows acceptance; see [docs/TESTING-BROWSER.md](docs/TESTING-BROWSER.md) for the pinned Chromium smoke and existing browser-suite inventory.

Keep module boundaries explicit and protect the current file/editing contract. A service catalog entry is not an ArchiMate element until bound by verified IDs. The current catalogue has no normative conformance guarantee.

Add focused regression tests for edits, cancellation, repeated actions and navigation with unsaved work. Run aggregate tests against the final commit. Browser visual/drag testing must be reported separately; DOM tests do not substitute for it. The standalone Mermaid build is hash-pinned and must not silently change when platform navigation changes.

The optional local desktop shell uses the exact Electron version in the lockfile. `npm run desktop` may download its official platform binary on first run; use Node 22.12+ and keep the sandbox enabled. See `electron/README.md`. Desktop boundary tests are included in the aggregate runner. Real native-dialog/graphical tests must be recorded separately from Node filesystem and injected-adapter tests.
