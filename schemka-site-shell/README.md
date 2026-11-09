# Platform shell

The static build retains four routes: `/`, `/mermaid/`, `/model/`, `/catalog/`. The landing chooser links into `/model/`, but the model editor has no shell navigation, no return/cross-product links and no shell-navigation runtime dependency. Shared navigation remains on the other platform pages. There is no Sites runtime dependency; this UI separation does not itself create a standalone installer or a new deployment.

`mermaid-integration.mjs` verifies the source digest in `mermaid-source-manifest.json` and applies current navigation/download-state integration to the hosted Mermaid page. The standalone Mermaid artifact remains independent. `src/navigation.js` supports navigation safeguards for shell-integrated consumers. The standalone model editor retains its own draft/download and beforeunload safeguards without importing that helper.

Run `npm test`, `npm run check`, `npm run build` from the repository root. No external checkout is required.
