# Renderer browser checks

The DOM suite run by `npm test` does not run the browser scripts. Browser PASS, Electron/native acceptance, and installed Windows acceptance are separate results.

## Bounded Chromium smoke

On Node.js 22:

```sh
npm ci --ignore-scripts
npm exec playwright install chromium
npm run test:browser:smoke
```

Playwright is pinned to `1.65.0` by `package.json` and `package-lock.json`; its matching Chromium revision is installed separately. On a clean Ubuntu host, use `npm exec playwright install --with-deps chromium` to install the browser and its system libraries.

The smoke launches the source renderer on a loopback port and uses Playwright's Chromium. It starts from Arkita's synthetic two-view demo, confirms a concept is shared between the views, cancels and retries view creation, and checks that Cancel preserves dirty/history state and returns keyboard focus. It then adds an existing concept to a new view and checks stable view, concept, and relationship IDs across save, reopen, and save.

Save and reopen use the browser adapter: a browser download and an HTML file input. The test does not exercise Electron, native file dialogs, or writes to a user-selected filesystem location. It writes no screenshots or repository files. `BLOCKED` exits with code 2 when Playwright or Chromium is missing; an assertion or renderer failure exits with code 1. `PASS` covers only this renderer scenario.

## Existing browser suite inventory

These scripts are not included in `npm test`. Install Playwright and Chromium as above before running them.

| Command | Coverage and boundary |
| --- | --- |
| `npm run test:browser:smoke` | Bounded shared-view, Cancel/focus, browser save/reopen scenario described above. |
| `node schemka-model-ui/test/browser.mjs` | Source preview: file flows, views, profiles, pointer/keyboard interactions, drag and responsive renderer behavior. Shared flows live in `browser-files.mjs`, `browser-views.mjs`, `browser-profiles.mjs`, and `browser-context-drag.mjs`. Writes screenshots to `/tmp/schemka-ui-008-qa` unless `SCHEMKA_SCREENSHOTS` is set. |
| `npm run build && node schemka-model-ui/test/browser-integration.mjs` | Built renderer: format migration, worker/minimap/help, storage failure, tutorial focus, and generated-view round trip. |
| `node schemka-model-ui/test/browser-git.mjs` | Browser UI with a temporary bare Git remote and two clients; currently requires Linux `/usr/bin/git`. |
| `npm run build && node schemka-model-ui/test/browser-analysis.mjs` | Built renderer: analysis graph, worker cancellation, generated view, SVG and clipboard behavior. |
| `npm run build && node schemka-model-ui/test/browser-minimap.mjs` | Built renderer: minimap, viewport, camera, and model-byte preservation. |

The longer scripts may create temporary profiles, receipts, or screenshots outside the repository. Their logs and files belong to their own run. A passing smoke does not imply those scripts ran; a passing browser script does not prove native dialogs, packaged installation, Windows performance, or user-VM acceptance.
