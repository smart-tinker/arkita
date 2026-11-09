# Development

Use Node.js 22+, then `npm ci --ignore-scripts`, `npm test`, `npm run check`, `npm start`. Build-only work needs no npm dependencies. Keep generated `dist/` and private imported data out of commits.

Work in feature branches and open draft PRs. Do not bundle secrets, credentials, infrastructure inventories, deployments, workflows, permission changes or history rewrites with platform edits. No deploy is configured by this repository.

Keep module boundaries explicit and protect the current file/editing contract. A service catalog entry is not an ArchiMate element until bound by verified IDs. The current catalogue has no normative conformance guarantee.

Add focused regression tests for edits, cancellation, repeated actions and navigation with unsaved work. Run aggregate tests against the final commit. Browser visual/drag testing must be reported separately; DOM tests do not substitute for it. The standalone Mermaid build is hash-pinned and must not silently change when platform navigation changes.

The optional local desktop shell uses the exact Electron version in the lockfile. `npm run desktop` may download its official platform binary on first run; use Node 22.12+ and keep the sandbox enabled. See `electron/README.md`. Desktop boundary tests are included in the aggregate runner. Real native-dialog/graphical tests must be recorded separately from Node filesystem and injected-adapter tests.
